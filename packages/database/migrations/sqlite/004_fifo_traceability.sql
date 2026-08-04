-- Migration: 004_fifo_traceability.sql
--
-- Introduces the schema the corrected FIFO engine needs:
--   * fiat/crypto asset classification, so a DEPOSIT of 500 EUR is never a crypto acquisition
--   * account hierarchy (exchange sub-wallets) and synthetic custody counterparties
--   * a double-entry custody ledger, so a transfer relocates a lot instead of closing it
--   * user-authored override tables, which are calculation INPUTS and never reconciled
--   * disposal provenance, a separate data-quality flag column, and nullable proceeds
--   * non-negative CHECK constraints on every fiat magnitude
--
-- CLEAN SLATE: transactional and derived data is PURGED. The project has no production
-- deployment and every source CSV is re-ingestable, so carrying an ABS() repair path and an
-- ambiguous disposal_type backfill would be complexity in service of rows that are about to be
-- replaced. Re-ingestion is required regardless: the Kraken `wallet` column needed for sub-account
-- identity was never persisted and cannot be recovered retroactively.
--
-- PRESERVED: the vault, `user_settings`, and `_schema_migrations`.
--
-- Idempotence is provided by the runner, which tracks applied filenames in `_schema_migrations`
-- (see SQLiteLedgerAdapter.applyMigrations). SQLite has no `ALTER TABLE ADD COLUMN IF NOT EXISTS`,
-- so this file must be executed at most once — exactly as 003 already relies on.
--
-- @see openspec/changes/fix-fifo-transfer-traceability/specs/database-migrations/spec.md
-- @see openspec/changes/fix-fifo-transfer-traceability/specs/sqlite-transactional-ledger/spec.md

-- ---------------------------------------------------------------------------
-- 4.1 Asset fiat classification
--
-- The distinction the original pipeline lacked. `deposit` alone does not say whether fiat was
-- funded or crypto was moved between wallets; the moved asset does.
-- ---------------------------------------------------------------------------

ALTER TABLE assets ADD COLUMN is_fiat INTEGER NOT NULL DEFAULT 0 CHECK (is_fiat IN (0, 1));

-- ---------------------------------------------------------------------------
-- 4.2 Account hierarchy and synthetic custody counterparties
--
-- `parent_account_id` gives exchange sub-wallets first-class identity (Kraken:spot vs Kraken:earn),
-- so balance blocked in a yield product is distinguishable from free balance.
--
-- `is_synthetic` marks `ownwallet-<ASSET>` accounts: they participate fully in custody arithmetic
-- and are excluded from user-facing selectors and counts.
-- ---------------------------------------------------------------------------

ALTER TABLE accounts ADD COLUMN parent_account_id TEXT REFERENCES accounts(id);
ALTER TABLE accounts ADD COLUMN is_synthetic INTEGER NOT NULL DEFAULT 0 CHECK (is_synthetic IN (0, 1));

CREATE INDEX IF NOT EXISTS idx_accounts_parent ON accounts(parent_account_id);

-- SQLite cannot ADD a CHECK constraint to an existing table, so self-parenting is enforced by a
-- trigger instead. A cycle deeper than one level is prevented at the application layer.
CREATE TRIGGER IF NOT EXISTS trg_accounts_no_self_parent_insert
BEFORE INSERT ON accounts
WHEN NEW.parent_account_id IS NOT NULL AND NEW.parent_account_id = NEW.id
BEGIN
    SELECT RAISE(ABORT, 'accounts.parent_account_id must not equal accounts.id');
END;

CREATE TRIGGER IF NOT EXISTS trg_accounts_no_self_parent_update
BEFORE UPDATE ON accounts
WHEN NEW.parent_account_id IS NOT NULL AND NEW.parent_account_id = NEW.id
BEGIN
    SELECT RAISE(ABORT, 'accounts.parent_account_id must not equal accounts.id');
END;

-- ---------------------------------------------------------------------------
-- 4.3 Purge and rebuild the transactional and derived tables
--
-- Rebuilt rather than altered because the new invariants are CHECK constraints, which SQLite
-- cannot add to an existing table. Since the clean slate empties these tables anyway, a
-- DROP + CREATE is both simpler and more verifiable than the 12-step table-rewrite procedure.
--
-- Dropped child-first so `PRAGMA foreign_keys = ON` cannot reject the implicit deletes.
-- ---------------------------------------------------------------------------

DROP VIEW  IF EXISTS v_active_lot_history_events;
DROP VIEW  IF EXISTS v_active_tax_lots;
DROP VIEW  IF EXISTS v_active_spot_transactions;
DROP VIEW  IF EXISTS v_active_futures_transactions;

DROP TRIGGER IF EXISTS trg_lot_history_events_audit;
DROP TRIGGER IF EXISTS trg_tax_lots_audit;
DROP TRIGGER IF EXISTS trg_spot_tx_audit;
DROP TRIGGER IF EXISTS trg_futures_tx_audit;

DROP TABLE IF EXISTS lot_history_events;
DROP TABLE IF EXISTS tax_lots;
DROP TABLE IF EXISTS spot_transactions;
DROP TABLE IF EXISTS futures_transactions;

-- 4.3.1 Spot transactions
--
-- `total_fiat` and `price_fiat` are now non-negative MAGNITUDES. Direction is carried by `tx_type`
-- together with `asset_in_id` / `asset_out_id`, never by sign. Permitting the sign is how a Kraken
-- CSV's negative EUR cost leg reached the ledger as `total_fiat = '-300.00'`, yielding a
-- `unit_cost_fiat` of `-1.6724 €/XRP` and turning zero-priced transfer disposals into POSITIVE
-- capital gains of +1.234,46 €.
--
-- `amount_in` / `amount_out` / `fee_amount` keep the original signed GLOB pattern: the ingestion
-- layer already normalises them to magnitudes, and they are quantities rather than fiat values.
CREATE TABLE spot_transactions (
    id TEXT PRIMARY KEY,
    id_hash TEXT UNIQUE NOT NULL,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    tx_type TEXT NOT NULL CHECK (tx_type IN ('BUY', 'SELL', 'SWAP', 'DEPOSIT', 'WITHDRAWAL', 'STAKING', 'AIRDROP', 'REWARD', 'MINING', 'SPEND', 'FEE', 'TRANSFER_IN', 'TRANSFER_OUT', 'MIGRATION_SWAP', 'PROMOTION')),
    asset_in_id TEXT REFERENCES assets(id),
    amount_in TEXT CHECK (amount_in IS NULL OR (amount_in GLOB '*[0-9]*' AND amount_in NOT GLOB '*[^-0-9.]*')),
    asset_out_id TEXT REFERENCES assets(id),
    amount_out TEXT CHECK (amount_out IS NULL OR (amount_out GLOB '*[0-9]*' AND amount_out NOT GLOB '*[^-0-9.]*')),
    fee_asset_id TEXT REFERENCES assets(id),
    fee_amount TEXT CHECK (fee_amount IS NULL OR (fee_amount GLOB '*[0-9]*' AND fee_amount NOT GLOB '*[^-0-9.]*')),
    -- NON-NEGATIVE: no leading '-' permitted by the GLOB, and CAST guards exponent forms.
    total_fiat TEXT NOT NULL CHECK (
        total_fiat GLOB '*[0-9]*' AND total_fiat NOT GLOB '*[^0-9.]*' AND CAST(total_fiat AS REAL) >= 0
    ),
    price_fiat TEXT NOT NULL CHECK (
        price_fiat GLOB '*[0-9]*' AND price_fiat NOT GLOB '*[^0-9.]*' AND CAST(price_fiat AS REAL) >= 0
    ),
    fiat_currency TEXT NOT NULL DEFAULT 'USD',
    -- Links the two legs of one physical custody movement once a counterparty is resolved.
    transfer_group_id TEXT,
    -- Fiscal classification of the operation, in the same vocabulary as `lot_history_events.flag`.
    -- It lives on the transaction because that is where the source states it; every derived event
    -- inherits it, which is what keeps the AEAT audit trail from being lost at materialisation.
    flag TEXT CHECK (flag IS NULL OR flag IN ('WALLET_ACTIVATION')),
    timestamp TEXT NOT NULL, -- ISO-8601
    status TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    deleted_at TEXT,
    CHECK ((amount_in IS NULL) = (asset_in_id IS NULL)),
    CHECK ((amount_out IS NULL) = (asset_out_id IS NULL)),
    CHECK ((fee_amount IS NULL) = (fee_asset_id IS NULL))
) STRICT;

CREATE TABLE futures_transactions (
    id TEXT PRIMARY KEY,
    id_hash TEXT UNIQUE NOT NULL,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    tx_type TEXT NOT NULL CHECK (tx_type IN ('TRADE', 'FUNDING_FEE', 'SETTLEMENT', 'LIQUIDATION')),
    symbol TEXT NOT NULL,
    amount TEXT CHECK (amount IS NULL OR (amount GLOB '*[0-9]*' AND amount NOT GLOB '*[^-0-9.]*')),
    trade_price TEXT CHECK (trade_price IS NULL OR (trade_price GLOB '*[0-9]*' AND trade_price NOT GLOB '*[^-0-9.]*')),
    -- Signed by nature: a realized PnL may be a loss.
    realized_pnl TEXT CHECK (realized_pnl IS NULL OR (realized_pnl GLOB '*[0-9]*' AND realized_pnl NOT GLOB '*[^-0-9.]*')),
    settlement_asset_id TEXT REFERENCES assets(id),
    -- Signed by nature: funding is paid or received.
    funding_amount TEXT CHECK (funding_amount IS NULL OR (funding_amount GLOB '*[0-9]*' AND funding_amount NOT GLOB '*[^-0-9.]*')),
    fee_asset_id TEXT REFERENCES assets(id),
    fee_amount TEXT CHECK (fee_amount IS NULL OR (fee_amount GLOB '*[0-9]*' AND fee_amount NOT GLOB '*[^-0-9.]*')),
    fiat_currency TEXT NOT NULL DEFAULT 'USD',
    timestamp TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    deleted_at TEXT
) STRICT;

-- 4.3.2 Tax lots — one immutable row per acquisition
--
-- `exchange_location` is the ACQUIRING venue and is never rewritten by a transfer; current custody
-- lives in `lot_custody_entries`. `unit_cost_fiat` and `total_cost_fiat` are non-negative: a
-- negative basis is a data defect, not an input.
CREATE TABLE tax_lots (
    id TEXT PRIMARY KEY,
    spot_transaction_id TEXT NOT NULL REFERENCES spot_transactions(id),
    asset_id TEXT NOT NULL REFERENCES assets(id),
    account_id TEXT NOT NULL REFERENCES accounts(id),
    original_qty TEXT NOT NULL CHECK (original_qty GLOB '*[0-9]*' AND original_qty NOT GLOB '*[^-0-9.]*'),
    remaining_qty TEXT NOT NULL CHECK (remaining_qty GLOB '*[0-9]*' AND remaining_qty NOT GLOB '*[^-0-9.]*'),
    unit_cost_fiat TEXT NOT NULL CHECK (
        unit_cost_fiat GLOB '*[0-9]*' AND unit_cost_fiat NOT GLOB '*[^0-9.]*' AND CAST(unit_cost_fiat AS REAL) >= 0
    ),
    total_cost_fiat TEXT NOT NULL CHECK (
        total_cost_fiat GLOB '*[0-9]*' AND total_cost_fiat NOT GLOB '*[^0-9.]*' AND CAST(total_cost_fiat AS REAL) >= 0
    ),
    fiat_currency TEXT NOT NULL,
    acquisition_timestamp TEXT NOT NULL, -- ISO-8601, aliased as `date` in queries
    exchange_location TEXT NOT NULL,     -- ACQUIRING venue; never mutated by a custody movement
    source_tx_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('OPEN', 'PARTIAL', 'CLOSED')),
    -- Data-quality defect on this lot's basis. Suppresses gains; never blocks a rebuild.
    quality_flag TEXT CHECK (quality_flag IS NULL OR quality_flag IN (
        'MISSING_PRICE', 'CURRENCY_MISMATCH', 'CUSTODY_RESIDUAL', 'UNTRACKED_INFLOW',
        'CUSTODY_IMBALANCE', 'NEGATIVE_COST_BASIS', 'ORPHAN_LOT', 'UNKNOWN_TX_TYPE'
    )),
    -- Whether the basis was observed from market data or declared by the user.
    value_provenance TEXT NOT NULL DEFAULT 'MARKET' CHECK (value_provenance IN ('MARKET', 'MANUAL')),
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    deleted_at TEXT
) STRICT;

-- 4.3.3 Lot history events
--
-- `sale_price_fiat` and `gain_loss_fiat` are NULLABLE. This is load-bearing: their previous
-- NOT NULL declaration is exactly why the SQL used `COALESCE(price, 1.0)` — it had no way to
-- express "unresolved", so it invented a plausible number instead. A €1,00/unit XRP fee looks
-- like data; NULL cannot be summed into a tax base by accident.
--
-- `flag` and `quality_flag` are SEPARATE columns on purpose. `flag` carries the fiscal
-- classification and remains live: `WALLET_ACTIVATION` drives the AEAT audit trail. `quality_flag`
-- carries valuation defects. The two co-occur — a wallet activation with an unresolvable price has
-- one value from each — so a single column would force a lossy precedence rule.
CREATE TABLE lot_history_events (
    id TEXT PRIMARY KEY,
    tax_lot_id TEXT NOT NULL REFERENCES tax_lots(id),
    spot_transaction_id TEXT NOT NULL REFERENCES spot_transactions(id),
    account_id TEXT NOT NULL REFERENCES accounts(id),
    amount_from_lot TEXT NOT NULL CHECK (
        amount_from_lot GLOB '*[0-9]*' AND amount_from_lot NOT GLOB '*[^0-9.]*' AND CAST(amount_from_lot AS REAL) >= 0
    ),
    sale_price_fiat TEXT CHECK (
        sale_price_fiat IS NULL OR
        (sale_price_fiat GLOB '*[0-9]*' AND sale_price_fiat NOT GLOB '*[^0-9.]*' AND CAST(sale_price_fiat AS REAL) >= 0)
    ),
    -- Signed by nature: a disposal may realise a loss.
    gain_loss_fiat TEXT CHECK (
        gain_loss_fiat IS NULL OR
        (gain_loss_fiat GLOB '*[0-9]*' AND gain_loss_fiat NOT GLOB '*[^-0-9.]*')
    ),
    fiat_currency TEXT NOT NULL,
    is_taxable INTEGER NOT NULL CHECK (is_taxable IN (0, 1)),
    -- Why the lot was consumed. Never assumed: a network fee is not a sale.
    disposal_type TEXT NOT NULL CHECK (disposal_type IN ('SELL', 'SWAP', 'FEE', 'SPEND')),
    -- Fiscal classification (existing vocabulary, preserved).
    flag TEXT CHECK (flag IS NULL OR flag IN ('WALLET_ACTIVATION')),
    -- Data-quality defect (new vocabulary, disjoint from the above).
    quality_flag TEXT CHECK (quality_flag IS NULL OR quality_flag IN (
        'MISSING_PRICE', 'CURRENCY_MISMATCH', 'CUSTODY_RESIDUAL', 'UNTRACKED_INFLOW',
        'CUSTODY_IMBALANCE', 'NEGATIVE_COST_BASIS', 'ORPHAN_LOT', 'UNKNOWN_TX_TYPE'
    )),
    value_provenance TEXT NOT NULL DEFAULT 'MARKET' CHECK (value_provenance IN ('MARKET', 'MANUAL')),
    notes TEXT,
    disposal_date TEXT NOT NULL, -- ISO-8601
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    deleted_at TEXT
) STRICT;

-- ---------------------------------------------------------------------------
-- 4.4 Double-entry custody ledger
--
-- One row per leg of a custody movement. `qty_delta` is INTENTIONALLY SIGNED — negative for an
-- outflow, positive for an inflow — unlike every fiat magnitude above. The entries for a single
-- movement sum to zero per asset, which is what makes custody a BALANCE rather than a pairing
-- heuristic: no time window, no amount tolerance, order-independent, and idempotent across
-- rebuilds.
--
-- Writing an entry never mutates the referenced lot's quantities, cost or acquisition timestamp.
-- ---------------------------------------------------------------------------

CREATE TABLE lot_custody_entries (
    id TEXT PRIMARY KEY,
    tax_lot_id TEXT NOT NULL REFERENCES tax_lots(id),
    asset_id TEXT NOT NULL REFERENCES assets(id),
    account_id TEXT NOT NULL REFERENCES accounts(id),
    -- SIGNED: the '-' is permitted here and only here among the quantity columns.
    qty_delta TEXT NOT NULL CHECK (qty_delta GLOB '*[0-9]*' AND qty_delta NOT GLOB '*[^-0-9.]*'),
    occurred_at TEXT NOT NULL, -- ISO-8601
    spot_transaction_id TEXT NOT NULL REFERENCES spot_transactions(id),
    /** Shared by both legs of one physical movement, once a counterparty is resolved. */
    transfer_group_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    deleted_at TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS idx_lot_custody_entries_lot ON lot_custody_entries(tax_lot_id);
CREATE INDEX IF NOT EXISTS idx_lot_custody_entries_account_asset ON lot_custody_entries(account_id, asset_id);
CREATE INDEX IF NOT EXISTS idx_lot_custody_entries_tx ON lot_custody_entries(spot_transaction_id);

-- ---------------------------------------------------------------------------
-- 4.5 User-authored override tables — calculation INPUTS
--
-- These are NOT derived data. Reconciliation never inserts, updates or deletes a row here.
-- Keeping them separate from the derived tables is what allows reconciliation to freely delete and
-- rebuild its own output without destroying the user's work on the next rebuild.
--
-- Both key on `id_hash`, the deterministic transaction identity, so an override survives
-- re-ingestion of the same source file.
-- ---------------------------------------------------------------------------

CREATE TABLE manual_price_overrides (
    id_hash TEXT PRIMARY KEY,
    price_fiat TEXT NOT NULL CHECK (
        price_fiat GLOB '*[0-9]*' AND price_fiat NOT GLOB '*[^0-9.]*' AND CAST(price_fiat AS REAL) >= 0
    ),
    -- Required: a declared value without its currency is not interpretable.
    fiat_currency TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    deleted_at TEXT
) STRICT;

CREATE TABLE transfer_destination_overrides (
    id_hash TEXT PRIMARY KEY,
    counterparty_account_id TEXT NOT NULL REFERENCES accounts(id),
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    deleted_at TEXT
) STRICT;

-- A movement cannot be its own counterparty. Enforced by trigger because the check spans two
-- tables, which a CHECK constraint cannot do.
CREATE TRIGGER IF NOT EXISTS trg_transfer_dest_not_self_insert
BEFORE INSERT ON transfer_destination_overrides
WHEN NEW.counterparty_account_id = (
    SELECT account_id FROM spot_transactions WHERE id_hash = NEW.id_hash
)
BEGIN
    SELECT RAISE(ABORT, 'transfer destination override must not equal the transaction''s own account');
END;

CREATE TRIGGER IF NOT EXISTS trg_transfer_dest_not_self_update
BEFORE UPDATE ON transfer_destination_overrides
WHEN NEW.counterparty_account_id = (
    SELECT account_id FROM spot_transactions WHERE id_hash = NEW.id_hash
)
BEGIN
    SELECT RAISE(ABORT, 'transfer destination override must not equal the transaction''s own account');
END;

-- ---------------------------------------------------------------------------
-- 4.6 Indexes on the rebuilt tables (mirroring 002)
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_spot_transactions_asset_time ON spot_transactions(asset_in_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_spot_transactions_account_time ON spot_transactions(account_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_spot_transactions_transfer_group ON spot_transactions(transfer_group_id);
CREATE INDEX IF NOT EXISTS idx_futures_transactions_symbol ON futures_transactions(symbol);
CREATE INDEX IF NOT EXISTS idx_futures_transactions_account ON futures_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_tax_lots_asset_status ON tax_lots(asset_id, status);
CREATE INDEX IF NOT EXISTS idx_tax_lots_account ON tax_lots(account_id);
CREATE INDEX IF NOT EXISTS idx_lot_history_events_lot ON lot_history_events(tax_lot_id);
CREATE INDEX IF NOT EXISTS idx_lot_history_events_account ON lot_history_events(account_id);

-- ---------------------------------------------------------------------------
-- 4.7 Audit triggers
--
-- The non-destructive audit policy applies to every table, including the three new ones. Follows
-- the pattern established in 002: AFTER UPDATE only INSERTs into audit_log, never UPDATEs a table,
-- so there is no recursion.
-- ---------------------------------------------------------------------------

CREATE TRIGGER IF NOT EXISTS trg_spot_tx_audit AFTER UPDATE ON spot_transactions BEGIN
    INSERT INTO audit_log (id, table_name, record_id, action, old_values, new_values)
    VALUES (
        lower(hex(randomblob(16))),
        'spot_transactions', NEW.id, 'UPDATE',
        json_object('total_fiat', OLD.total_fiat, 'status', OLD.status, 'deleted_at', OLD.deleted_at),
        json_object('total_fiat', NEW.total_fiat, 'status', NEW.status, 'deleted_at', NEW.deleted_at)
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_futures_tx_audit AFTER UPDATE ON futures_transactions BEGIN
    INSERT INTO audit_log (id, table_name, record_id, action, old_values, new_values)
    VALUES (
        lower(hex(randomblob(16))),
        'futures_transactions', NEW.id, 'UPDATE',
        json_object('realized_pnl', OLD.realized_pnl, 'status', OLD.status, 'deleted_at', OLD.deleted_at),
        json_object('realized_pnl', NEW.realized_pnl, 'status', NEW.status, 'deleted_at', NEW.deleted_at)
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_tax_lots_audit AFTER UPDATE ON tax_lots BEGIN
    INSERT INTO audit_log (id, table_name, record_id, action, old_values, new_values)
    VALUES (
        lower(hex(randomblob(16))),
        'tax_lots', NEW.id, 'UPDATE',
        json_object('status', OLD.status, 'remaining_qty', OLD.remaining_qty, 'quality_flag', OLD.quality_flag, 'deleted_at', OLD.deleted_at),
        json_object('status', NEW.status, 'remaining_qty', NEW.remaining_qty, 'quality_flag', NEW.quality_flag, 'deleted_at', NEW.deleted_at)
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_lot_history_events_audit AFTER UPDATE ON lot_history_events BEGIN
    INSERT INTO audit_log (id, table_name, record_id, action, old_values, new_values)
    VALUES (
        lower(hex(randomblob(16))),
        'lot_history_events', NEW.id, 'UPDATE',
        json_object('gain_loss_fiat', OLD.gain_loss_fiat, 'is_taxable', OLD.is_taxable, 'quality_flag', OLD.quality_flag, 'deleted_at', OLD.deleted_at),
        json_object('gain_loss_fiat', NEW.gain_loss_fiat, 'is_taxable', NEW.is_taxable, 'quality_flag', NEW.quality_flag, 'deleted_at', NEW.deleted_at)
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_lot_custody_entries_audit AFTER UPDATE ON lot_custody_entries BEGIN
    INSERT INTO audit_log (id, table_name, record_id, action, old_values, new_values)
    VALUES (
        lower(hex(randomblob(16))),
        'lot_custody_entries', NEW.id, 'UPDATE',
        json_object('account_id', OLD.account_id, 'qty_delta', OLD.qty_delta, 'deleted_at', OLD.deleted_at),
        json_object('account_id', NEW.account_id, 'qty_delta', NEW.qty_delta, 'deleted_at', NEW.deleted_at)
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_manual_price_overrides_audit AFTER UPDATE ON manual_price_overrides BEGIN
    INSERT INTO audit_log (id, table_name, record_id, action, old_values, new_values)
    VALUES (
        lower(hex(randomblob(16))),
        'manual_price_overrides', NEW.id_hash, 'UPDATE',
        json_object('price_fiat', OLD.price_fiat, 'fiat_currency', OLD.fiat_currency, 'note', OLD.note, 'deleted_at', OLD.deleted_at),
        json_object('price_fiat', NEW.price_fiat, 'fiat_currency', NEW.fiat_currency, 'note', NEW.note, 'deleted_at', NEW.deleted_at)
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_transfer_destination_overrides_audit AFTER UPDATE ON transfer_destination_overrides BEGIN
    INSERT INTO audit_log (id, table_name, record_id, action, old_values, new_values)
    VALUES (
        lower(hex(randomblob(16))),
        'transfer_destination_overrides', NEW.id_hash, 'UPDATE',
        json_object('counterparty_account_id', OLD.counterparty_account_id, 'note', OLD.note, 'deleted_at', OLD.deleted_at),
        json_object('counterparty_account_id', NEW.counterparty_account_id, 'note', NEW.note, 'deleted_at', NEW.deleted_at)
    );
END;

-- ---------------------------------------------------------------------------
-- 4.8 Active views — soft-deletion is the project's deletion policy, so every table needs one
-- ---------------------------------------------------------------------------

CREATE VIEW IF NOT EXISTS v_active_spot_transactions AS
    SELECT * FROM spot_transactions WHERE deleted_at IS NULL;
CREATE VIEW IF NOT EXISTS v_active_futures_transactions AS
    SELECT * FROM futures_transactions WHERE deleted_at IS NULL;
CREATE VIEW IF NOT EXISTS v_active_tax_lots AS
    SELECT *, acquisition_timestamp AS date FROM tax_lots WHERE deleted_at IS NULL;
CREATE VIEW IF NOT EXISTS v_active_lot_history_events AS
    SELECT * FROM lot_history_events WHERE deleted_at IS NULL;
CREATE VIEW IF NOT EXISTS v_active_lot_custody_entries AS
    SELECT * FROM lot_custody_entries WHERE deleted_at IS NULL;
CREATE VIEW IF NOT EXISTS v_active_manual_price_overrides AS
    SELECT * FROM manual_price_overrides WHERE deleted_at IS NULL;
CREATE VIEW IF NOT EXISTS v_active_transfer_destination_overrides AS
    SELECT * FROM transfer_destination_overrides WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
--
-- PRE-EXISTING DEFECT, discovered while seeding `is_fiat`. 002 declared:
--
--     CREATE TRIGGER trg_assets_updated_at BEFORE UPDATE ON assets BEGIN
--         SELECT RAISE(IGNORE) WHERE NEW.updated_at = OLD.updated_at; -- ensure NEW is modified
--     END;
--
-- with the documented intent "BEFORE UPDATE sets updated_at on NEW". A BEFORE trigger cannot assign
-- to NEW in SQLite, so rather than maintaining the column it ABORTED the row update. And because
-- `datetime('now','utc')` has one-second resolution, this silently swallowed:
--
--   * every UPDATE that did not mention `updated_at` — including
--     `UPDATE accounts SET deleted_at = ...`, so SOFT DELETION did not work at all
--   * every UPDATE made within the same second as the row's previous write
--
-- The statement reported success and changed nothing, which is why it went unnoticed. Replaced with
-- an AFTER UPDATE trigger that actually maintains the column, using millisecond precision so two
-- writes in the same second are distinguishable. Recursion terminates on the first re-fire because
-- `updated_at` then differs, and SQLite's `recursive_triggers` is off by default regardless.
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_assets_updated_at;
DROP TRIGGER IF EXISTS trg_accounts_updated_at;

CREATE TRIGGER IF NOT EXISTS trg_assets_updated_at
AFTER UPDATE ON assets
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE assets SET updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_accounts_updated_at
AFTER UPDATE ON accounts
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE accounts SET updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = NEW.id;
END;

-- ---------------------------------------------------------------------------
-- 4.SEED_FIAT
--
-- ISO-4217 codes only. Stablecoins are deliberately NOT fiat: `USDT` is a crypto asset whose
-- disposals are taxable, and classifying it as fiat would silently drop it from FIFO tracking.
--
-- The list mirrors FIAT_CURRENCY_CODES in @kryptofolio/shared-types. Ingestion keeps new assets
-- aligned via `ensureAssetExists`; this statement covers assets already present.
-- ---------------------------------------------------------------------------

-- Relies on the repaired trigger from 4.8b: before that fix this statement reported success and
-- changed nothing, which is how the defect was found.
UPDATE assets
   SET is_fiat = 1
 WHERE upper(symbol) IN ('EUR','USD','GBP','CHF','JPY','CAD','AUD','SEK','NOK','DKK','PLN');

-- 4.END_SEED

-- ---------------------------------------------------------------------------
-- 4.9 Pending-recalculation flag — deliberately NOT written here
--
-- Dropping the derived tables above invalidates every FIFO figure, but the flag that records that
-- is `needs_recalculation` in the SETTINGS database, which this migration cannot reach: the ledger
-- and the settings store are two separate SQLite files. Writing a same-named row here produced a
-- second `user_settings` table that nothing reads, so the application never learned it had work
-- pending. The migration runner's caller sets the flag on the port that owns it.
-- ---------------------------------------------------------------------------

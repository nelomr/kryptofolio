-- Migration: 005_nullable_fiat_magnitudes.sql
--
-- Makes `spot_transactions.total_fiat` and `.price_fiat` nullable, so ingestion can record
-- "unknown" as NULL instead of as the same '0' a genuinely free acquisition would carry. `004`
-- already made this table's `fee_amount` nullable-with-CHECK for the identical reason; these two
-- columns were the inconsistency left behind. The non-negative CHECK on a present value is
-- unchanged — only NULL is newly permitted.
--
-- SQLite cannot drop a NOT NULL via ALTER, so the table is rebuilt exactly as 004 rebuilt its own
-- predecessor. Dependants that carry a `spot_transaction_id` foreign key — `tax_lots`,
-- `lot_history_events`, `lot_custody_entries` — are rebuilt unchanged alongside it: their rows
-- would otherwise reference a spot_transactions id that no longer exists once the table is
-- recreated empty. CLEAN SLATE for the same reason `004` was: the project has no production
-- deployment, and every source CSV is re-ingestable.
--
-- @see openspec/changes/fix-fifo-transfer-traceability/design.md D25 (14.13)
-- @see openspec/changes/fix-fifo-transfer-traceability/specs/database-migrations/spec.md

-- ---------------------------------------------------------------------------
-- 5.1 Drop views, triggers and tables, child-first, so the rebuild can start clean.
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS v_active_lot_history_events;
DROP VIEW IF EXISTS v_active_lot_custody_entries;
DROP VIEW IF EXISTS v_active_tax_lots;
DROP VIEW IF EXISTS v_active_spot_transactions;

DROP TRIGGER IF EXISTS trg_lot_history_events_audit;
DROP TRIGGER IF EXISTS trg_lot_custody_entries_audit;
DROP TRIGGER IF EXISTS trg_tax_lots_audit;
DROP TRIGGER IF EXISTS trg_spot_tx_audit;

DROP TABLE IF EXISTS lot_history_events;
DROP TABLE IF EXISTS lot_custody_entries;
DROP TABLE IF EXISTS tax_lots;
DROP TABLE IF EXISTS spot_transactions;

-- ---------------------------------------------------------------------------
-- 5.2 Rebuilt tables
-- ---------------------------------------------------------------------------

-- Identical to 004's definition except `total_fiat` and `price_fiat` now permit NULL. The
-- non-negative CHECK only runs against a present value — `IS NULL OR (...)`, the same shape 004
-- already used for `fee_amount`.
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
    -- NULLABLE: unresolved is NULL, genuinely free is '0'. Non-negative CHECK still applies to a
    -- present value; direction is carried by tx_type and asset_in_id/asset_out_id, never by sign.
    total_fiat TEXT CHECK (
        total_fiat IS NULL OR
        (total_fiat GLOB '*[0-9]*' AND total_fiat NOT GLOB '*[^0-9.]*' AND CAST(total_fiat AS REAL) >= 0)
    ),
    price_fiat TEXT CHECK (
        price_fiat IS NULL OR
        (price_fiat GLOB '*[0-9]*' AND price_fiat NOT GLOB '*[^0-9.]*' AND CAST(price_fiat AS REAL) >= 0)
    ),
    fiat_currency TEXT NOT NULL DEFAULT 'USD',
    transfer_group_id TEXT,
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

-- Unchanged from 004 — rebuilt only because it references spot_transactions(id).
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
    quality_flag TEXT CHECK (quality_flag IS NULL OR quality_flag IN (
        'MISSING_PRICE', 'CURRENCY_MISMATCH', 'CUSTODY_RESIDUAL', 'UNTRACKED_INFLOW',
        'CUSTODY_IMBALANCE', 'NEGATIVE_COST_BASIS', 'ORPHAN_LOT', 'UNKNOWN_TX_TYPE'
    )),
    value_provenance TEXT NOT NULL DEFAULT 'MARKET' CHECK (value_provenance IN ('MARKET', 'MANUAL')),
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    deleted_at TEXT
) STRICT;

-- Unchanged from 004 — rebuilt only because it references spot_transactions(id) and tax_lots(id).
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
    gain_loss_fiat TEXT CHECK (
        gain_loss_fiat IS NULL OR
        (gain_loss_fiat GLOB '*[0-9]*' AND gain_loss_fiat NOT GLOB '*[^-0-9.]*')
    ),
    fiat_currency TEXT NOT NULL,
    is_taxable INTEGER NOT NULL CHECK (is_taxable IN (0, 1)),
    disposal_type TEXT NOT NULL CHECK (disposal_type IN ('SELL', 'SWAP', 'FEE', 'SPEND')),
    flag TEXT CHECK (flag IS NULL OR flag IN ('WALLET_ACTIVATION')),
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

-- Unchanged from 004 — rebuilt only because it references spot_transactions(id) and tax_lots(id).
CREATE TABLE lot_custody_entries (
    id TEXT PRIMARY KEY,
    tax_lot_id TEXT NOT NULL REFERENCES tax_lots(id),
    asset_id TEXT NOT NULL REFERENCES assets(id),
    account_id TEXT NOT NULL REFERENCES accounts(id),
    qty_delta TEXT NOT NULL CHECK (qty_delta GLOB '*[0-9]*' AND qty_delta NOT GLOB '*[^-0-9.]*'),
    occurred_at TEXT NOT NULL, -- ISO-8601
    spot_transaction_id TEXT NOT NULL REFERENCES spot_transactions(id),
    transfer_group_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    deleted_at TEXT
) STRICT;

-- ---------------------------------------------------------------------------
-- 5.3 Indexes (mirroring 004 §4.6, for the four rebuilt tables)
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_spot_transactions_asset_time ON spot_transactions(asset_in_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_spot_transactions_account_time ON spot_transactions(account_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_spot_transactions_transfer_group ON spot_transactions(transfer_group_id);
CREATE INDEX IF NOT EXISTS idx_tax_lots_asset_status ON tax_lots(asset_id, status);
CREATE INDEX IF NOT EXISTS idx_tax_lots_account ON tax_lots(account_id);
CREATE INDEX IF NOT EXISTS idx_lot_history_events_lot ON lot_history_events(tax_lot_id);
CREATE INDEX IF NOT EXISTS idx_lot_history_events_account ON lot_history_events(account_id);
CREATE INDEX IF NOT EXISTS idx_lot_custody_entries_lot ON lot_custody_entries(tax_lot_id);
CREATE INDEX IF NOT EXISTS idx_lot_custody_entries_account_asset ON lot_custody_entries(account_id, asset_id);
CREATE INDEX IF NOT EXISTS idx_lot_custody_entries_tx ON lot_custody_entries(spot_transaction_id);

-- ---------------------------------------------------------------------------
-- 5.4 Audit triggers (mirroring 004 §4.7, for the four rebuilt tables)
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

-- ---------------------------------------------------------------------------
-- 5.5 Active views (mirroring 004 §4.8, for the four rebuilt tables)
-- ---------------------------------------------------------------------------

CREATE VIEW IF NOT EXISTS v_active_spot_transactions AS
    SELECT * FROM spot_transactions WHERE deleted_at IS NULL;
CREATE VIEW IF NOT EXISTS v_active_tax_lots AS
    SELECT *, acquisition_timestamp AS date FROM tax_lots WHERE deleted_at IS NULL;
CREATE VIEW IF NOT EXISTS v_active_lot_history_events AS
    SELECT * FROM lot_history_events WHERE deleted_at IS NULL;
CREATE VIEW IF NOT EXISTS v_active_lot_custody_entries AS
    SELECT * FROM lot_custody_entries WHERE deleted_at IS NULL;

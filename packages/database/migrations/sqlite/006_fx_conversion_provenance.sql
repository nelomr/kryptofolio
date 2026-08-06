-- Migration: 006_fx_conversion_provenance.sql
--
-- Widens the `quality_flag` and `value_provenance` vocabularies on `tax_lots` and
-- `lot_history_events`, and adds the two columns that make a converted figure reproducible:
-- `fx_rate` and `fx_rate_date`.
--
-- `MISSING_FX_RATE` is the new flag for "a price resolved in another currency and no rate covers
-- that pair on or before this date" — previously indistinguishable from `CURRENCY_MISMATCH`, which
-- narrows here to a user-declared value stated in a foreign currency. `MARKET_CONVERTED` is the new
-- provenance for a market figure that was converted, so a reader never infers "converted" from a
-- non-NULL rate column.
--
-- SQLite cannot ALTER a CHECK, only rebuild the table, so both tables are recreated. Rebuilding
-- `tax_lots` invalidates `lot_history_events` and `lot_custody_entries`, which carry foreign keys to
-- it, so all three are recreated — CLEAN SLATE, as `004` and `005` were: these are derived tables,
-- re-materialisable from `spot_transactions` by definition. `spot_transactions` itself is untouched,
-- so no ingested data is lost.

-- ---------------------------------------------------------------------------
-- 6.1 Drop views, triggers and the derived tables, child-first.
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS v_active_lot_history_events;
DROP VIEW IF EXISTS v_active_lot_custody_entries;
DROP VIEW IF EXISTS v_active_tax_lots;

DROP TRIGGER IF EXISTS trg_lot_history_events_audit;
DROP TRIGGER IF EXISTS trg_lot_custody_entries_audit;
DROP TRIGGER IF EXISTS trg_tax_lots_audit;

DROP TABLE IF EXISTS lot_history_events;
DROP TABLE IF EXISTS lot_custody_entries;
DROP TABLE IF EXISTS tax_lots;

-- ---------------------------------------------------------------------------
-- 6.2 Rebuilt tables
-- ---------------------------------------------------------------------------

-- Identical to 005's definition except for the two widened CHECK vocabularies and the two rate
-- columns at the end.
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
        'MISSING_PRICE', 'MISSING_FX_RATE', 'CURRENCY_MISMATCH', 'CUSTODY_RESIDUAL',
        'UNTRACKED_INFLOW', 'CUSTODY_IMBALANCE', 'NEGATIVE_COST_BASIS', 'ORPHAN_LOT',
        'UNKNOWN_TX_TYPE'
    )),
    value_provenance TEXT NOT NULL DEFAULT 'MARKET' CHECK (
        value_provenance IN ('MARKET', 'MANUAL', 'MARKET_CONVERTED')
    ),
    -- A rate of 0 would silently zero the figure it converted, which is the confusion this whole
    -- change exists to remove: an unflagged zero must mean "genuinely free".
    fx_rate TEXT CHECK (
        fx_rate IS NULL OR
        (fx_rate GLOB '*[0-9]*' AND fx_rate NOT GLOB '*[^0-9.]*' AND CAST(fx_rate AS REAL) > 0)
    ),
    fx_rate_date TEXT CHECK (fx_rate_date IS NULL OR fx_rate_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    deleted_at TEXT,
    -- A rate without its date cannot be audited, and a date without its rate states nothing.
    CHECK ((fx_rate IS NULL) = (fx_rate_date IS NULL)),
    -- MARKET_CONVERTED without a rate would be a claim with no evidence.
    CHECK (value_provenance <> 'MARKET_CONVERTED' OR fx_rate IS NOT NULL)
) STRICT;

-- Same two widenings and the same two rate columns; otherwise unchanged from 005.
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
        'MISSING_PRICE', 'MISSING_FX_RATE', 'CURRENCY_MISMATCH', 'CUSTODY_RESIDUAL',
        'UNTRACKED_INFLOW', 'CUSTODY_IMBALANCE', 'NEGATIVE_COST_BASIS', 'ORPHAN_LOT',
        'UNKNOWN_TX_TYPE'
    )),
    value_provenance TEXT NOT NULL DEFAULT 'MARKET' CHECK (
        value_provenance IN ('MARKET', 'MANUAL', 'MARKET_CONVERTED')
    ),
    fx_rate TEXT CHECK (
        fx_rate IS NULL OR
        (fx_rate GLOB '*[0-9]*' AND fx_rate NOT GLOB '*[^0-9.]*' AND CAST(fx_rate AS REAL) > 0)
    ),
    fx_rate_date TEXT CHECK (fx_rate_date IS NULL OR fx_rate_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    notes TEXT,
    disposal_date TEXT NOT NULL, -- ISO-8601
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    deleted_at TEXT,
    CHECK ((fx_rate IS NULL) = (fx_rate_date IS NULL)),
    CHECK (value_provenance <> 'MARKET_CONVERTED' OR fx_rate IS NOT NULL)
) STRICT;

-- Unchanged from 005 — rebuilt only because it references tax_lots(id).
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
-- 6.3 Indexes (mirroring 005 §5.3, for the three rebuilt tables)
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_tax_lots_asset_status ON tax_lots(asset_id, status);
CREATE INDEX IF NOT EXISTS idx_tax_lots_account ON tax_lots(account_id);
CREATE INDEX IF NOT EXISTS idx_lot_history_events_lot ON lot_history_events(tax_lot_id);
CREATE INDEX IF NOT EXISTS idx_lot_history_events_account ON lot_history_events(account_id);
CREATE INDEX IF NOT EXISTS idx_lot_custody_entries_lot ON lot_custody_entries(tax_lot_id);
CREATE INDEX IF NOT EXISTS idx_lot_custody_entries_account_asset ON lot_custody_entries(account_id, asset_id);
CREATE INDEX IF NOT EXISTS idx_lot_custody_entries_tx ON lot_custody_entries(spot_transaction_id);

-- ---------------------------------------------------------------------------
-- 6.4 Audit triggers (mirroring 005 §5.4, for the three rebuilt tables)
-- ---------------------------------------------------------------------------

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
-- 6.5 Active views (mirroring 005 §5.5, for the three rebuilt tables)
-- ---------------------------------------------------------------------------

CREATE VIEW IF NOT EXISTS v_active_tax_lots AS
    SELECT *, acquisition_timestamp AS date FROM tax_lots WHERE deleted_at IS NULL;
CREATE VIEW IF NOT EXISTS v_active_lot_history_events AS
    SELECT * FROM lot_history_events WHERE deleted_at IS NULL;
CREATE VIEW IF NOT EXISTS v_active_lot_custody_entries AS
    SELECT * FROM lot_custody_entries WHERE deleted_at IS NULL;

-- Migration: 002_ledger_schema.sql

-- 1.6 Audit Log Table
CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY, -- UUID
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_values TEXT, -- JSON
    new_values TEXT, -- JSON
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
) STRICT;

-- 1.2 Assets and Accounts Tables
CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL UNIQUE,
    name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    deleted_at TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    deleted_at TEXT
) STRICT;

-- 1.3 Spot Transactions
CREATE TABLE IF NOT EXISTS spot_transactions (
    id TEXT PRIMARY KEY,
    id_hash TEXT UNIQUE NOT NULL,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    tx_type TEXT NOT NULL CHECK (tx_type IN ('BUY', 'SELL', 'SWAP', 'DEPOSIT', 'WITHDRAWAL', 'STAKING', 'AIRDROP', 'REWARD', 'MINING', 'SPEND', 'FEE', 'TRANSFER_IN', 'TRANSFER_OUT', 'MIGRATION_SWAP')),
    asset_in_id TEXT REFERENCES assets(id),
    amount_in TEXT CHECK (amount_in IS NULL OR (amount_in GLOB '*[0-9]*' AND amount_in NOT GLOB '*[^-0-9.]*')),
    asset_out_id TEXT REFERENCES assets(id),
    amount_out TEXT CHECK (amount_out IS NULL OR (amount_out GLOB '*[0-9]*' AND amount_out NOT GLOB '*[^-0-9.]*')),
    fee_asset_id TEXT REFERENCES assets(id),
    fee_amount TEXT CHECK (fee_amount IS NULL OR (fee_amount GLOB '*[0-9]*' AND fee_amount NOT GLOB '*[^-0-9.]*')),
    total_fiat TEXT NOT NULL CHECK (total_fiat GLOB '*[0-9]*' AND total_fiat NOT GLOB '*[^-0-9.]*'),
    price_fiat TEXT NOT NULL CHECK (price_fiat GLOB '*[0-9]*' AND price_fiat NOT GLOB '*[^-0-9.]*'),
    timestamp TEXT NOT NULL, -- ISO-8601
    status TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    deleted_at TEXT,
    CHECK ((amount_in IS NULL) = (asset_in_id IS NULL)),
    CHECK ((amount_out IS NULL) = (asset_out_id IS NULL)),
    CHECK ((fee_amount IS NULL) = (fee_asset_id IS NULL))
) STRICT;

-- 1.4 Futures Transactions
CREATE TABLE IF NOT EXISTS futures_transactions (
    id TEXT PRIMARY KEY,
    id_hash TEXT UNIQUE NOT NULL,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    tx_type TEXT NOT NULL CHECK (tx_type IN ('TRADE', 'FUNDING_FEE', 'SETTLEMENT', 'LIQUIDATION')),
    symbol TEXT NOT NULL,
    amount TEXT CHECK (amount IS NULL OR (amount GLOB '*[0-9]*' AND amount NOT GLOB '*[^-0-9.]*')),
    trade_price TEXT CHECK (trade_price IS NULL OR (trade_price GLOB '*[0-9]*' AND trade_price NOT GLOB '*[^-0-9.]*')),
    realized_pnl TEXT CHECK (realized_pnl IS NULL OR (realized_pnl GLOB '*[0-9]*' AND realized_pnl NOT GLOB '*[^-0-9.]*')),
    settlement_asset_id TEXT REFERENCES assets(id),
    funding_amount TEXT CHECK (funding_amount IS NULL OR (funding_amount GLOB '*[0-9]*' AND funding_amount NOT GLOB '*[^-0-9.]*')),
    fee_asset_id TEXT REFERENCES assets(id),
    fee_amount TEXT CHECK (fee_amount IS NULL OR (fee_amount GLOB '*[0-9]*' AND fee_amount NOT GLOB '*[^-0-9.]*')),
    timestamp TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    deleted_at TEXT
) STRICT;

-- 1.5 Tax Lots and Lot History Events
CREATE TABLE IF NOT EXISTS tax_lots (
    id TEXT PRIMARY KEY,
    spot_transaction_id TEXT NOT NULL REFERENCES spot_transactions(id),
    asset_id TEXT NOT NULL REFERENCES assets(id),
    account_id TEXT NOT NULL REFERENCES accounts(id),
    -- Quantities
    original_qty TEXT NOT NULL CHECK (original_qty GLOB '*[0-9]*' AND original_qty NOT GLOB '*[^-0-9.]*'),
    remaining_qty TEXT NOT NULL CHECK (remaining_qty GLOB '*[0-9]*' AND remaining_qty NOT GLOB '*[^-0-9.]*'),
    -- Fiat costs (currency-agnostic naming)
    unit_cost_fiat TEXT NOT NULL CHECK (unit_cost_fiat GLOB '*[0-9]*' AND unit_cost_fiat NOT GLOB '*[^-0-9.]*'),
    total_cost_fiat TEXT NOT NULL CHECK (total_cost_fiat GLOB '*[0-9]*' AND total_cost_fiat NOT GLOB '*[^-0-9.]*'),
    fiat_currency TEXT NOT NULL,
    -- Temporal & location
    acquisition_timestamp TEXT NOT NULL, -- ISO-8601, aliased as `date` in queries
    exchange_location TEXT NOT NULL,
    -- Source tracking
    source_tx_id TEXT, -- optional native tx_id from the exchange
    -- Status (aligned with Domain Port: OPEN/PARTIAL/CLOSED)
    status TEXT NOT NULL CHECK (status IN ('OPEN', 'PARTIAL', 'CLOSED')),
    -- Audit
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    deleted_at TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS lot_history_events (
    id TEXT PRIMARY KEY,
    tax_lot_id TEXT NOT NULL REFERENCES tax_lots(id),
    spot_transaction_id TEXT NOT NULL REFERENCES spot_transactions(id),
    account_id TEXT NOT NULL REFERENCES accounts(id),
    amount_from_lot TEXT NOT NULL CHECK (amount_from_lot GLOB '*[0-9]*' AND amount_from_lot NOT GLOB '*[^-0-9.]*'),
    sale_price_fiat TEXT NOT NULL CHECK (sale_price_fiat GLOB '*[0-9]*' AND sale_price_fiat NOT GLOB '*[^-0-9.]*'),
    gain_loss_fiat TEXT NOT NULL CHECK (gain_loss_fiat GLOB '*[0-9]*' AND gain_loss_fiat NOT GLOB '*[^-0-9.]*'),
    fiat_currency TEXT NOT NULL,
    is_taxable INTEGER NOT NULL CHECK (is_taxable IN (0, 1)),
    flag TEXT,
    notes TEXT,
    disposal_date TEXT NOT NULL, -- ISO-8601
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    deleted_at TEXT
) STRICT;

-- 1.6 updated_at & audit_log Triggers
-- PATTERN: BEFORE UPDATE sets updated_at on NEW (no recursion).
--           AFTER UPDATE only INSERTs into audit_log (no table UPDATE, no recursion).

CREATE TRIGGER IF NOT EXISTS trg_assets_updated_at BEFORE UPDATE ON assets BEGIN
    SELECT RAISE(IGNORE) WHERE NEW.updated_at = OLD.updated_at; -- ensure NEW is modified
END;

CREATE TRIGGER IF NOT EXISTS trg_assets_audit AFTER UPDATE ON assets BEGIN
    UPDATE assets SET updated_at = datetime('now', 'utc') WHERE id = NEW.id AND 0; -- no-op guard
    INSERT INTO audit_log (id, table_name, record_id, action, old_values, new_values)
    VALUES (
        lower(hex(randomblob(16))),
        'assets', NEW.id, 'UPDATE',
        json_object('symbol', OLD.symbol, 'name', OLD.name, 'deleted_at', OLD.deleted_at),
        json_object('symbol', NEW.symbol, 'name', NEW.name, 'deleted_at', NEW.deleted_at)
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_accounts_updated_at BEFORE UPDATE ON accounts
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    SELECT RAISE(IGNORE);
END;

CREATE TRIGGER IF NOT EXISTS trg_accounts_audit AFTER UPDATE ON accounts BEGIN
    INSERT INTO audit_log (id, table_name, record_id, action, old_values, new_values)
    VALUES (
        lower(hex(randomblob(16))),
        'accounts', NEW.id, 'UPDATE',
        json_object('name', OLD.name, 'type', OLD.type, 'deleted_at', OLD.deleted_at),
        json_object('name', NEW.name, 'type', NEW.type, 'deleted_at', NEW.deleted_at)
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_spot_tx_audit AFTER UPDATE ON spot_transactions BEGIN
    INSERT INTO audit_log (id, table_name, record_id, action, old_values, new_values)
    VALUES (
        lower(hex(randomblob(16))),
        'spot_transactions', NEW.id, 'UPDATE',
        json_object('tx_type', OLD.tx_type, 'status', OLD.status, 'deleted_at', OLD.deleted_at),
        json_object('tx_type', NEW.tx_type, 'status', NEW.status, 'deleted_at', NEW.deleted_at)
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_futures_tx_audit AFTER UPDATE ON futures_transactions BEGIN
    INSERT INTO audit_log (id, table_name, record_id, action, old_values, new_values)
    VALUES (
        lower(hex(randomblob(16))),
        'futures_transactions', NEW.id, 'UPDATE',
        json_object('tx_type', OLD.tx_type, 'status', OLD.status, 'deleted_at', OLD.deleted_at),
        json_object('tx_type', NEW.tx_type, 'status', NEW.status, 'deleted_at', NEW.deleted_at)
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_tax_lots_audit AFTER UPDATE ON tax_lots BEGIN
    INSERT INTO audit_log (id, table_name, record_id, action, old_values, new_values)
    VALUES (
        lower(hex(randomblob(16))),
        'tax_lots', NEW.id, 'UPDATE',
        json_object('status', OLD.status, 'remaining_qty', OLD.remaining_qty, 'deleted_at', OLD.deleted_at),
        json_object('status', NEW.status, 'remaining_qty', NEW.remaining_qty, 'deleted_at', NEW.deleted_at)
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_lot_history_events_audit AFTER UPDATE ON lot_history_events BEGIN
    INSERT INTO audit_log (id, table_name, record_id, action, old_values, new_values)
    VALUES (
        lower(hex(randomblob(16))),
        'lot_history_events', NEW.id, 'UPDATE',
        json_object('is_taxable', OLD.is_taxable, 'flag', OLD.flag, 'deleted_at', OLD.deleted_at),
        json_object('is_taxable', NEW.is_taxable, 'flag', NEW.flag, 'deleted_at', NEW.deleted_at)
    );
END;

-- 1.7 Composite Indexes
CREATE INDEX IF NOT EXISTS idx_spot_transactions_asset_time ON spot_transactions(asset_in_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_spot_transactions_account_time ON spot_transactions(account_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_futures_transactions_symbol ON futures_transactions(symbol);
CREATE INDEX IF NOT EXISTS idx_futures_transactions_account ON futures_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_tax_lots_asset_status ON tax_lots(asset_id, status);
CREATE INDEX IF NOT EXISTS idx_tax_lots_account ON tax_lots(account_id);
CREATE INDEX IF NOT EXISTS idx_lot_history_events_lot ON lot_history_events(tax_lot_id);
CREATE INDEX IF NOT EXISTS idx_lot_history_events_account ON lot_history_events(account_id);

-- 1.8 Active Views (For DuckDB Analytics)
-- Views expose acquisition_timestamp as `date` alias for ergonomic querying
CREATE VIEW IF NOT EXISTS v_active_assets AS SELECT * FROM assets WHERE deleted_at IS NULL;
CREATE VIEW IF NOT EXISTS v_active_accounts AS SELECT * FROM accounts WHERE deleted_at IS NULL;
CREATE VIEW IF NOT EXISTS v_active_spot_transactions AS SELECT * FROM spot_transactions WHERE deleted_at IS NULL;
CREATE VIEW IF NOT EXISTS v_active_futures_transactions AS SELECT * FROM futures_transactions WHERE deleted_at IS NULL;
CREATE VIEW IF NOT EXISTS v_active_tax_lots AS
    SELECT *, acquisition_timestamp AS date FROM tax_lots WHERE deleted_at IS NULL;
CREATE VIEW IF NOT EXISTS v_active_lot_history_events AS SELECT * FROM lot_history_events WHERE deleted_at IS NULL;

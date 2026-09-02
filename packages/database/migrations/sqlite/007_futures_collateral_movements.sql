-- Migration: 007_futures_collateral_movements.sql
--
-- Adds `collateral_movements`, holding the currency movements that fund or convert futures
-- collateral — separate from `futures_transactions`, which is untouched by this migration.
--
-- `futures_transactions.tx_type` is a CHECK over four position events and its `symbol` column names
-- a *contract*; a conversion or a cross-venue transfer is neither. Storing `'eur'` in `symbol` would
-- read as a position in a EUR instrument to every consumer of that column, including
-- `v_futures_realized_pnl`. Position events and collateral movements are as distinct as spot and
-- futures, and get a table of their own.
--
-- `amount` is signed on purpose: the two legs of a EUR<->USD conversion pair must sum to zero across
-- currencies while remaining separable per currency, which is a property of signed values, not of a
-- type label — the same reason `lot_custody_entries.qty_delta` is signed. Every fiat magnitude
-- elsewhere in the ledger is a non-negative magnitude with direction carried by `tx_type`; this table
-- is the second deliberate exception.
--
-- `amount` and `spread_pct` follow the same rule as `fee_amount` elsewhere in this ledger: a stated
-- `'0'` is a fact ("no spread was applied") and stays `'0'`; only genuine absence becomes NULL.
-- `amount` is NOT NULL because a collateral movement with no magnitude states nothing — there is no
-- "amount unknown" state for a movement, unlike a fee a source may simply not report. `spread_pct` is
-- nullable because Kraken's own export states it only on the EUR leg of a conversion and leaves it
-- blank everywhere else.

CREATE TABLE collateral_movements (
    id TEXT PRIMARY KEY,
    id_hash TEXT UNIQUE NOT NULL,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    movement_type TEXT NOT NULL CHECK (movement_type IN ('CONVERSION', 'CROSS_EXCHANGE_TRANSFER')),
    -- The currency this leg is denominated in ('eur', 'usd', ...), never the contract symbol.
    currency TEXT NOT NULL,
    amount TEXT NOT NULL CHECK (amount GLOB '*[0-9]*' AND amount NOT GLOB '*[^-0-9.]*'),
    spread_pct TEXT CHECK (
        spread_pct IS NULL OR (spread_pct GLOB '*[0-9]*' AND spread_pct NOT GLOB '*[^-0-9.]*')
    ),
    -- Shared by both legs of a conversion pair once the ingestion guard confirms they share an
    -- instant and oppose in sign. NULL for a movement recorded one-sided, such as the cross-exchange
    -- transfer whose counterpart lives in a different file — the absence is recorded rather than a
    -- pairing invented across files.
    pair_id TEXT,
    occurred_at TEXT NOT NULL, -- ISO-8601
    status TEXT NOT NULL DEFAULT 'COMPLETED',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    deleted_at TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS idx_collateral_movements_account_currency
    ON collateral_movements(account_id, currency);
CREATE INDEX IF NOT EXISTS idx_collateral_movements_occurred_at ON collateral_movements(occurred_at);
CREATE INDEX IF NOT EXISTS idx_collateral_movements_pair ON collateral_movements(pair_id);

CREATE TRIGGER IF NOT EXISTS trg_collateral_movements_audit AFTER UPDATE ON collateral_movements BEGIN
    INSERT INTO audit_log (id, table_name, record_id, action, old_values, new_values)
    VALUES (
        lower(hex(randomblob(16))),
        'collateral_movements', NEW.id, 'UPDATE',
        json_object('amount', OLD.amount, 'spread_pct', OLD.spread_pct, 'deleted_at', OLD.deleted_at),
        json_object('amount', NEW.amount, 'spread_pct', NEW.spread_pct, 'deleted_at', NEW.deleted_at)
    );
END;

CREATE VIEW IF NOT EXISTS v_active_collateral_movements AS
    SELECT * FROM collateral_movements WHERE deleted_at IS NULL;

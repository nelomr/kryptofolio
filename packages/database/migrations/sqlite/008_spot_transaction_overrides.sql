-- Migration: 008_spot_transaction_overrides.sql
--
-- Adds `spot_transaction_overrides`: a durable, auditable, revertible layer of user edits to a
-- spot transaction's P&L-relevant fields, keyed on the transaction's deterministic `id_hash`
-- (design.md D1 — the hash is never recomputed from edited values, so an override cannot orphan
-- itself on re-import). `spot_transactions` itself is never mutated.
--
-- This migration also:
--   * adds the missing `AFTER INSERT` audit trigger to `transfer_destination_overrides` (the same
--     gap this migration avoids introducing on the new table);
--   * folds `manual_price_overrides` into `spot_transaction_overrides` (design.md D3) and drops
--     the old table, its trigger and its active view. Every row — including soft-deleted ones —
--     is copied, with its original timestamps preserved.
--
-- CHECK FRAGILITY: the `tx_type` CHECK list below is intentionally a literal duplicate of
-- `spot_transactions.tx_type`'s CHECK list (002/004). SQLite cannot ALTER a CHECK constraint, so
-- if a future migration ever adds a `tx_type` value to `spot_transactions`, it MUST rebuild BOTH
-- tables in the same migration, or this table's CHECK list silently drifts out of sync. A database
-- integration test (migration_008 spec) asserts the two lists stay equal by reading `sqlite_master`.
--
-- @see openspec/changes/add-spot-transaction-edit-overrides/design.md (D1, D2, D3)

-- ---------------------------------------------------------------------------
-- 8.1 spot_transaction_overrides
--
-- One row per id_hash. Each editable field group is a `*_edited` flag plus its value column(s),
-- except fee, which is a three-way `fee_kind` discriminant (rule 5): CHARGED with a stated zero
-- fee is distinct from NONE, which is distinct from UNCHANGED.
-- ---------------------------------------------------------------------------

CREATE TABLE spot_transaction_overrides (
    id_hash TEXT PRIMARY KEY,

    amount_in_edited INTEGER NOT NULL DEFAULT 0 CHECK (amount_in_edited IN (0, 1)),
    amount_in TEXT CHECK (amount_in IS NULL OR (amount_in GLOB '*[0-9]*' AND amount_in NOT GLOB '*[^-0-9.]*')),

    amount_out_edited INTEGER NOT NULL DEFAULT 0 CHECK (amount_out_edited IN (0, 1)),
    amount_out TEXT CHECK (amount_out IS NULL OR (amount_out GLOB '*[0-9]*' AND amount_out NOT GLOB '*[^-0-9.]*')),

    price_edited INTEGER NOT NULL DEFAULT 0 CHECK (price_edited IN (0, 1)),
    price_fiat TEXT CHECK (
        price_fiat IS NULL OR
        (price_fiat GLOB '*[0-9]*' AND price_fiat NOT GLOB '*[^0-9.]*' AND CAST(price_fiat AS REAL) >= 0)
    ),

    total_fiat_edited INTEGER NOT NULL DEFAULT 0 CHECK (total_fiat_edited IN (0, 1)),
    -- Nullable even when edited (migration 005): "edited to NULL" and "not edited" are both real
    -- states, and the flag — not the value — is what distinguishes them.
    total_fiat TEXT CHECK (
        total_fiat IS NULL OR
        (total_fiat GLOB '*[0-9]*' AND total_fiat NOT GLOB '*[^0-9.]*' AND CAST(total_fiat AS REAL) >= 0)
    ),

    fiat_currency TEXT,

    -- Three-way fee discriminant (rule 5), not a boolean: UNCHANGED (default), NONE (an explicit
    -- edit that removes a fee) and CHARGED (a stated fee, possibly zero).
    fee_kind TEXT NOT NULL DEFAULT 'UNCHANGED' CHECK (fee_kind IN ('UNCHANGED', 'NONE', 'CHARGED')),
    fee_amount TEXT CHECK (fee_amount IS NULL OR (fee_amount GLOB '*[0-9]*' AND fee_amount NOT GLOB '*[^-0-9.]*')),
    fee_asset_id TEXT REFERENCES assets(id),

    timestamp_edited INTEGER NOT NULL DEFAULT 0 CHECK (timestamp_edited IN (0, 1)),
    timestamp TEXT,

    tx_type_edited INTEGER NOT NULL DEFAULT 0 CHECK (tx_type_edited IN (0, 1)),
    -- Literal duplicate of spot_transactions.tx_type's CHECK list — see file header.
    tx_type TEXT CHECK (tx_type IS NULL OR tx_type IN ('BUY', 'SELL', 'SWAP', 'DEPOSIT', 'WITHDRAWAL', 'STAKING', 'AIRDROP', 'REWARD', 'MINING', 'SPEND', 'FEE', 'TRANSFER_IN', 'TRANSFER_OUT', 'MIGRATION_SWAP', 'PROMOTION')),

    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    deleted_at TEXT,

    -- CHARGED <=> both fee value columns present. NONE/UNCHANGED <=> both NULL.
    CHECK (
        (fee_kind = 'CHARGED' AND fee_amount IS NOT NULL AND fee_asset_id IS NOT NULL) OR
        (fee_kind IN ('NONE', 'UNCHANGED') AND fee_amount IS NULL AND fee_asset_id IS NULL)
    ),
    -- Every *_edited flag ties to the presence of its value column(s).
    CHECK ((amount_in_edited = 1) = (amount_in IS NOT NULL)),
    CHECK ((amount_out_edited = 1) = (amount_out IS NOT NULL)),
    CHECK ((price_edited = 1) = (price_fiat IS NOT NULL AND fiat_currency IS NOT NULL)),
    -- total_fiat_edited may be 1 with total_fiat NULL (an explicit "cleared" edit); it must be 0
    -- when the row was never touched for this field. The NULL-when-edited state is asserted by a
    -- direct test rather than encoded here as a second CHECK, since it would otherwise force
    -- total_fiat_edited=0 to always mean "total_fiat IS NULL", which is already implied below.
    CHECK (total_fiat_edited = 1 OR total_fiat IS NULL),
    CHECK ((timestamp_edited = 1) = (timestamp IS NOT NULL)),
    CHECK ((tx_type_edited = 1) = (tx_type IS NOT NULL)),
    -- A row where nothing is edited is not a state worth storing.
    CHECK (
        amount_in_edited + amount_out_edited + price_edited + total_fiat_edited +
        timestamp_edited + tx_type_edited + (fee_kind <> 'UNCHANGED') > 0
    )
) STRICT;

CREATE INDEX IF NOT EXISTS idx_spot_transaction_overrides_deleted ON spot_transaction_overrides(deleted_at);

CREATE TRIGGER trg_spot_transaction_overrides_audit_insert AFTER INSERT ON spot_transaction_overrides BEGIN
    INSERT INTO audit_log (id, table_name, record_id, action, old_values, new_values)
    VALUES (
        lower(hex(randomblob(16))),
        'spot_transaction_overrides', NEW.id_hash, 'INSERT',
        NULL,
        json_object(
            'amount_in_edited', NEW.amount_in_edited, 'amount_in', NEW.amount_in,
            'amount_out_edited', NEW.amount_out_edited, 'amount_out', NEW.amount_out,
            'price_edited', NEW.price_edited, 'price_fiat', NEW.price_fiat, 'fiat_currency', NEW.fiat_currency,
            'total_fiat_edited', NEW.total_fiat_edited, 'total_fiat', NEW.total_fiat,
            'fee_kind', NEW.fee_kind, 'fee_amount', NEW.fee_amount, 'fee_asset_id', NEW.fee_asset_id,
            'timestamp_edited', NEW.timestamp_edited, 'timestamp', NEW.timestamp,
            'tx_type_edited', NEW.tx_type_edited, 'tx_type', NEW.tx_type,
            'deleted_at', NEW.deleted_at
        )
    );
END;

CREATE TRIGGER trg_spot_transaction_overrides_audit_update AFTER UPDATE ON spot_transaction_overrides BEGIN
    INSERT INTO audit_log (id, table_name, record_id, action, old_values, new_values)
    VALUES (
        lower(hex(randomblob(16))),
        'spot_transaction_overrides', NEW.id_hash, 'UPDATE',
        json_object(
            'amount_in_edited', OLD.amount_in_edited, 'amount_in', OLD.amount_in,
            'amount_out_edited', OLD.amount_out_edited, 'amount_out', OLD.amount_out,
            'price_edited', OLD.price_edited, 'price_fiat', OLD.price_fiat, 'fiat_currency', OLD.fiat_currency,
            'total_fiat_edited', OLD.total_fiat_edited, 'total_fiat', OLD.total_fiat,
            'fee_kind', OLD.fee_kind, 'fee_amount', OLD.fee_amount, 'fee_asset_id', OLD.fee_asset_id,
            'timestamp_edited', OLD.timestamp_edited, 'timestamp', OLD.timestamp,
            'tx_type_edited', OLD.tx_type_edited, 'tx_type', OLD.tx_type,
            'deleted_at', OLD.deleted_at
        ),
        json_object(
            'amount_in_edited', NEW.amount_in_edited, 'amount_in', NEW.amount_in,
            'amount_out_edited', NEW.amount_out_edited, 'amount_out', NEW.amount_out,
            'price_edited', NEW.price_edited, 'price_fiat', NEW.price_fiat, 'fiat_currency', NEW.fiat_currency,
            'total_fiat_edited', NEW.total_fiat_edited, 'total_fiat', NEW.total_fiat,
            'fee_kind', NEW.fee_kind, 'fee_amount', NEW.fee_amount, 'fee_asset_id', NEW.fee_asset_id,
            'timestamp_edited', NEW.timestamp_edited, 'timestamp', NEW.timestamp,
            'tx_type_edited', NEW.tx_type_edited, 'tx_type', NEW.tx_type,
            'deleted_at', NEW.deleted_at
        )
    );
END;

CREATE VIEW v_active_spot_transaction_overrides AS
    SELECT * FROM spot_transaction_overrides WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 8.2 transfer_destination_overrides: add the missing AFTER INSERT audit trigger
--
-- Same gap as design.md's Context notes: the adapter's upsert made the first declaration of an
-- override invisible to audit_log. The existing AFTER UPDATE trigger (004) is untouched.
-- ---------------------------------------------------------------------------

CREATE TRIGGER trg_transfer_destination_overrides_audit_insert AFTER INSERT ON transfer_destination_overrides BEGIN
    INSERT INTO audit_log (id, table_name, record_id, action, old_values, new_values)
    VALUES (
        lower(hex(randomblob(16))),
        'transfer_destination_overrides', NEW.id_hash, 'INSERT',
        NULL,
        json_object('counterparty_account_id', NEW.counterparty_account_id, 'note', NEW.note, 'deleted_at', NEW.deleted_at)
    );
END;

-- ---------------------------------------------------------------------------
-- 8.3 Unify manual_price_overrides into spot_transaction_overrides (design.md D3)
--
-- Every row is copied, including soft-deleted ones, with original created_at/updated_at/deleted_at
-- preserved so history stays reconstructable. The INSERT trigger above fires for each copied row,
-- so this migration step is itself audited with action='INSERT'.
-- ---------------------------------------------------------------------------

INSERT INTO spot_transaction_overrides
    (id_hash, price_edited, price_fiat, fiat_currency, note, created_at, updated_at, deleted_at)
SELECT id_hash, 1, price_fiat, fiat_currency, note, created_at, updated_at, deleted_at
FROM manual_price_overrides;

DROP TRIGGER IF EXISTS trg_manual_price_overrides_audit;
DROP VIEW IF EXISTS v_active_manual_price_overrides;
DROP TABLE manual_price_overrides;

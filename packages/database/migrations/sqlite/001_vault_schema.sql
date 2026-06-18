-- Vault and Settings schema for Kryptofolio backend.
-- Engine: Node.js built-in SQLite (node:sqlite) — used for the credentials vault
-- and user settings. This is NOT DuckDB.
--
-- DuckDB migrations live in: migrations/duckdb/
-- This file is loaded by SqliteVaultPortAdapter at startup.

CREATE TABLE IF NOT EXISTS system_credentials (
    id TEXT PRIMARY KEY,
    service_identifier TEXT UNIQUE NOT NULL,
    ciphertext BLOB NOT NULL,
    initialization_vector BLOB NOT NULL,
    authentication_tag BLOB NOT NULL,
    is_enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vault_metadata (
    key TEXT PRIMARY KEY,
    value BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS user_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

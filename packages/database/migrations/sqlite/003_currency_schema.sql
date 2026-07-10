-- Migration: 003_currency_schema.sql
-- Creates the exchange_rates immutable ledger for daily FX rates.
-- Required as a hard prerequisite for Phase 2B ASOF JOIN multi-currency conversions.

-- 3.1 Exchange Rates Table
CREATE TABLE IF NOT EXISTS exchange_rates (
    date    TEXT NOT NULL,          -- ISO-8601 date (YYYY-MM-DD)
    pair    TEXT NOT NULL,          -- e.g. 'USD/EUR', 'GBP/EUR'
    rate    TEXT NOT NULL,          -- Decimal string, e.g. '0.91234'
    source  TEXT NOT NULL,          -- e.g. 'ECB', 'manual'
    PRIMARY KEY (date, pair)
) STRICT;

-- 3.2 Index for optimal ASOF JOIN performance
CREATE INDEX IF NOT EXISTS idx_exchange_rates_date ON exchange_rates(date, pair);

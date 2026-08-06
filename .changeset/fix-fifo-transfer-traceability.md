---
"@kryptofolio/frontend": patch
"@kryptofolio/backend": patch
"@kryptofolio/database": patch
"@kryptofolio/shared-types": patch
"@kryptofolio/core-domain": patch
---

- **Fix FIFO Transfer Traceability**: Replaced the legacy single-account event processing with a multi-account custody model that tracks `WITHDRAWAL`/`DEPOSIT` movements correctly without consuming the original lot cost basis.
- **Data Quality Pipeline**: Added a separate `quality_flag` column and a robust flagging system (`MISSING_PRICE`, `CUSTODY_RESIDUAL`, `NEGATIVE_COST_BASIS`, etc.) decoupled from the legacy `WALLET_ACTIVATION` flag. 
- **Schema & Migration**: Included a clean-slate `004` migration that drops previously-derived data (`spot_transactions`, `tax_lots`, etc.), replacing it with `lot_custody_entries` and manual override tracking. Existing IRPF figures from previous schema versions are superseded.
- **DTO Canonicalization**: Breaking change standardizing the `status` enum (`OPEN`, `PARTIAL`, `CLOSED`), and standardizing quantity values across UI and the database.

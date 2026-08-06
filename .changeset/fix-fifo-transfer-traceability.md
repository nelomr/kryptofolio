---
"@kryptofolio/frontend": patch
"@kryptofolio/backend": patch
"@kryptofolio/database": patch
"@kryptofolio/shared-types": patch
"@kryptofolio/core-domain": patch
---

- **FIFO Engine & Traceability Pipeline**: Replaced legacy single-account event processing with a robust, multi-account custody model that correctly traces `WITHDRAWAL` and `DEPOSIT` movements without consuming the original lot cost basis.
- **Source Format Profiles**: Deployed a complete ingestion pipeline redesign. All exchange idiosyncrasies (e.g., Bit2Me row collapse) are now abstracted behind Source Profiles, allowing precise control over trade direction, fee denomination, convention, and precision behind the boundary.
- **Data Quality & Fidelity**: Implemented a comprehensive fidelity net. Added explicit data quality flags (`MISSING_PRICE`, `CUSTODY_RESIDUAL`, `NEGATIVE_COST_BASIS`) independent of legacy rules. Nullable fiat magnitudes are now correctly handled, and unresolved income rows are explicitly counted rather than silently dropped.
- **Automatic Rebuild & Manual Overrides**: Introduced automatic portfolio rebuilding mechanics and the foundation for manual fiscal overrides to correct or override lot valuations.
- **Schema & Migrations**: Applied migrations 004, 005, and 006, wiping legacy derived tables (`spot_transactions`, `tax_lots`) in favor of `lot_custody_entries` and tracking FX conversion provenance. Existing IRPF figures are superseded.
- **Tax Report UI Enhancements**: Realigned frontend DTOs to standard lot statuses (`OPEN`, `PARTIAL`, `CLOSED`). The UI now renders canonical lot status, full custody history, pending reviews, and correctly surfaces both exclusion counts. 
- **Database Stability**: Resolved an issue where DuckDB's ATTACH could orphan the SQLite WAL, and coerced DuckDB numeric booleans to prevent frontend parsing errors.

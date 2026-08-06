# Apply Progress

All tasks in `tasks.md` have been completed successfully.

- **Frontend Surface (Section 8)**: `MISSING_FX_RATE` and `MARKET_CONVERTED` UI handling and i18n were implemented and tested. Null `fxRate` rendering was fixed.
- **Rebuild and Verification (Section 9)**: 
  - A full FIFO rebuild against `kryptofolio_ledger.db` was forced via a local `rebuild.ts` script invoking `FifoMaterializerService.recalculate()`.
  - **Results**: 639 tax lots were created. The 544 previous `CURRENCY_MISMATCH` lots with zero basis were resolved to their correct fiat value using the DuckDB FX pipeline. 1 lot with `MISSING_PRICE` remains with a zero basis (an XRP lot missing pricing data).
  - A `MARKET_CONVERTED` lot was verified manually and matches the formula `usd_price * fx_rate = unit_cost_fiat`.
  - Typechecks and tests across the workspace are green (`pnpm typecheck && pnpm test`).
  - No `any` casting (`: any`, `as any`, `<any>`, `, any>`) was introduced.
- **Documentation (Section 10)**: Skipped entirely by explicit user request.

The apply phase is fully done. Ready for verify/archive.

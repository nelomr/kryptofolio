# Changelog

All notable changes to **Kriptofolio** are documented here.
Format follows [Conventional Commits](https://www.conventionalcommits.org) and [Semantic Versioning](https://semver.org).

## [1.16.8](https://github.com/nelomr/kryptofolio/releases/tag/v1.16.8) (2026-08-13)

### 🖥️ Frontend (`@kryptofolio/frontend` @ 1.16.8)

**Patch Changes**

- [`d04162e`](https://github.com/nelomr/kryptofolio/commit/d04162e8b6fb6ba61d0c0fdd9072f7e7e83b9669) Thanks [@nelomr](https://github.com/nelomr)! - Replace the unpatchable `xlsx@0.18.5` dependency (two unfixed high-severity advisories, no version
  reachable from npm) with `read-excel-file`/`write-excel-file`. Ingested `.xlsx` values are unchanged —
  verified byte-for-byte against the full real workbook corpus. `.xls` uploads are no longer accepted;
  that affordance was never documented, tested, or actually supported by any maintained reader.


## [1.16.7](https://github.com/nelomr/kryptofolio/releases/tag/v1.16.7) (2026-08-13)

### 🖥️ Frontend (`@kryptofolio/frontend` @ 1.16.7)

**Patch Changes**

- [`a049912`](https://github.com/nelomr/kryptofolio/commit/a04991238ad37146dffb02bf2aeafa4697c77ceb) Thanks [@nelomr](https://github.com/nelomr)! - Fix: the `.xlsx` importer no longer truncates numeric cells to Excel's ~11-character display format. Quantities and fees are now read from the source's own stored value, digit for digit, instead of the shorter text Excel would show for a spreadsheet cell.

  If you previously imported a Bit2Me `.xlsx` file, some quantities may have been rounded on ingestion (e.g. `149.99999997` stored as `150`). Re-importing the original file will correct them — there is no automatic migration, since the rounded value no longer carries the digits needed to recover the original.

  You may also notice fee-valuation cells in the import preview now show more digits (16-17) than before (9-11). This is the source file's own recorded content; that column is a EUR valuation only and takes no part in the tax calculation.


## [1.16.6](https://github.com/nelomr/kryptofolio/releases/tag/v1.16.6) (2026-08-13)

### 🖥️ Frontend (`@kryptofolio/frontend` @ 1.16.6)

**Patch Changes**

- [`884e48b`](https://github.com/nelomr/kryptofolio/commit/884e48bef58ca316cb3999110469ed9799725958) Thanks [@nelomr](https://github.com/nelomr)! - - **Display currency becomes arithmetic, not a label**: `base_currency` previously reached the read model as a string echoed back beside unconverted figures, so the same ledger returned identical numbers under two different currency labels. Every monetary figure is now multiplied by a resolved FX rate before it leaves DuckDB, or returned as explicitly native.
  - **Each figure converts at its own date**: a cost basis at its acquisition date, a realized gain and every per-event disposal figure at its disposal date, present value at the latest rate, and each point of a daily series at that point's own date. Unrealized PnL is derived by subtracting two already-converted terms rather than converted a third time. The rate-date rule is a pure function in `core-domain`; adapters apply a basis and never choose one.
  - **`v_fx_daily`**: one view now owns dated rate resolution — direct ECB quotes preferred over synthesised reciprocals, resolution strictly backward-looking. The DuckDB-local `user_settings` table and its `'USD'` seed are **removed**; a derived cache must not hold a second source of truth that survives no rebuild.
  - **Unconvertible figures are reported, never guessed**: a figure no stored rate can express keeps its native amount and says so, instead of entering a total at a factor of one. Two real defects fixed: 500 EUR was being summed into a USD total as 500 USD, and a non-zero cost basis below the destination scale landed on `0` — a phantom 100% gain with no signal attached.
  - **Decimal precision repaired end to end**: gratuitous `DOUBLE` money expressions in the analytics and metrics adapters now stay `DECIMAL`, with operand scales allocated from measurement of the real exchange exports rather than inherited. A unit price of `9.18695e-10` and a cost basis past `1e8` both survive the aggregations.
  - **FX ledger gap detection and backfill**: gaps are computed as an anti-join against ECB _publication_ dates taken from the ECB history document itself, never from a weekday rule, so a covered weekend or holiday is not a gap. Missing dates are filled from the ECB archive on first ingestion and on boot, with document choice an efficiency decision that never bounds coverage. Historical retrieval gets its own parse path: the previous single-date expression silently returned only the newest of 7,068 dates.
  - **The tax report states the currency of its figures**: header and export both carry the display currency and the conversion basis, and a period containing an event no rate could reach reports itself incomplete and names the affected events rather than omitting them. Also fixes an unreachable export endpoint — `/report/download` was shadowed by `/report/:year` and had been returning a 500.
  - **Per-event figures carry their own conversion outcome**: `sale_price_eur` / `gain_loss_eur` are renamed to `sale_price` / `gain_loss` carrying `ConvertedAmount` across both read paths, so the audit trail's rows and the declared base agree. The renderer now distinguishes four states — unresolved, unconvertible, gain, loss — where an unguarded sign comparison reported a failed conversion as a loss the user never had.
  - **The read that materialises stays native by contract**, fixed by test: converting there would persist display-converted figures into `lot_history_events`, indistinguishable from natively-denominated ones.
  - **The AEAT summary states no currency in its field names, and is no longer float money**: `capital_gains_eur` and its five siblings are derived from bases already converted to the display currency, so in a USD report a field named for euros held dollars. They are now `capital_gains`, `capital_losses`, `savings_base_yields`, `general_base_airdrops`, `net_patrimonial_result` and `estimated_irpf`, carried as exact decimal strings and computed with `Decimal` — the 19% IRPF estimate was a float multiplication whose result a user files with a tax authority. The frontend also stops accepting nineteen optional aliases that each defaulted to `0`, and stops computing an entire summary when the field is absent: both turned a missing figure into a declared tax base of zero that no engine produced.
- Updated dependencies [[`884e48b`](https://github.com/nelomr/kryptofolio/commit/884e48bef58ca316cb3999110469ed9799725958)]:
  - @kryptofolio/shared-types@1.1.5
  - @kryptofolio/core-domain@1.1.5

### ⚙️ Backend (`@kryptofolio/backend` @ 0.1.7)

**Patch Changes**

- [`884e48b`](https://github.com/nelomr/kryptofolio/commit/884e48bef58ca316cb3999110469ed9799725958) Thanks [@nelomr](https://github.com/nelomr)! - - **Display currency becomes arithmetic, not a label**: `base_currency` previously reached the read model as a string echoed back beside unconverted figures, so the same ledger returned identical numbers under two different currency labels. Every monetary figure is now multiplied by a resolved FX rate before it leaves DuckDB, or returned as explicitly native.
  - **Each figure converts at its own date**: a cost basis at its acquisition date, a realized gain and every per-event disposal figure at its disposal date, present value at the latest rate, and each point of a daily series at that point's own date. Unrealized PnL is derived by subtracting two already-converted terms rather than converted a third time. The rate-date rule is a pure function in `core-domain`; adapters apply a basis and never choose one.
  - **`v_fx_daily`**: one view now owns dated rate resolution — direct ECB quotes preferred over synthesised reciprocals, resolution strictly backward-looking. The DuckDB-local `user_settings` table and its `'USD'` seed are **removed**; a derived cache must not hold a second source of truth that survives no rebuild.
  - **Unconvertible figures are reported, never guessed**: a figure no stored rate can express keeps its native amount and says so, instead of entering a total at a factor of one. Two real defects fixed: 500 EUR was being summed into a USD total as 500 USD, and a non-zero cost basis below the destination scale landed on `0` — a phantom 100% gain with no signal attached.
  - **Decimal precision repaired end to end**: gratuitous `DOUBLE` money expressions in the analytics and metrics adapters now stay `DECIMAL`, with operand scales allocated from measurement of the real exchange exports rather than inherited. A unit price of `9.18695e-10` and a cost basis past `1e8` both survive the aggregations.
  - **FX ledger gap detection and backfill**: gaps are computed as an anti-join against ECB _publication_ dates taken from the ECB history document itself, never from a weekday rule, so a covered weekend or holiday is not a gap. Missing dates are filled from the ECB archive on first ingestion and on boot, with document choice an efficiency decision that never bounds coverage. Historical retrieval gets its own parse path: the previous single-date expression silently returned only the newest of 7,068 dates.
  - **The tax report states the currency of its figures**: header and export both carry the display currency and the conversion basis, and a period containing an event no rate could reach reports itself incomplete and names the affected events rather than omitting them. Also fixes an unreachable export endpoint — `/report/download` was shadowed by `/report/:year` and had been returning a 500.
  - **Per-event figures carry their own conversion outcome**: `sale_price_eur` / `gain_loss_eur` are renamed to `sale_price` / `gain_loss` carrying `ConvertedAmount` across both read paths, so the audit trail's rows and the declared base agree. The renderer now distinguishes four states — unresolved, unconvertible, gain, loss — where an unguarded sign comparison reported a failed conversion as a loss the user never had.
  - **The read that materialises stays native by contract**, fixed by test: converting there would persist display-converted figures into `lot_history_events`, indistinguishable from natively-denominated ones.
  - **The AEAT summary states no currency in its field names, and is no longer float money**: `capital_gains_eur` and its five siblings are derived from bases already converted to the display currency, so in a USD report a field named for euros held dollars. They are now `capital_gains`, `capital_losses`, `savings_base_yields`, `general_base_airdrops`, `net_patrimonial_result` and `estimated_irpf`, carried as exact decimal strings and computed with `Decimal` — the 19% IRPF estimate was a float multiplication whose result a user files with a tax authority. The frontend also stops accepting nineteen optional aliases that each defaulted to `0`, and stops computing an entire summary when the field is absent: both turned a missing figure into a declared tax base of zero that no engine produced.
- Updated dependencies [[`884e48b`](https://github.com/nelomr/kryptofolio/commit/884e48bef58ca316cb3999110469ed9799725958)]:
  - @kryptofolio/database@0.0.10
  - @kryptofolio/shared-types@1.1.5
  - @kryptofolio/core-domain@1.1.5

### 🧠 Core Domain (`@kryptofolio/core-domain` @ 1.1.5)

**Patch Changes**

- [`884e48b`](https://github.com/nelomr/kryptofolio/commit/884e48bef58ca316cb3999110469ed9799725958) Thanks [@nelomr](https://github.com/nelomr)! - - **Display currency becomes arithmetic, not a label**: `base_currency` previously reached the read model as a string echoed back beside unconverted figures, so the same ledger returned identical numbers under two different currency labels. Every monetary figure is now multiplied by a resolved FX rate before it leaves DuckDB, or returned as explicitly native.
  - **Each figure converts at its own date**: a cost basis at its acquisition date, a realized gain and every per-event disposal figure at its disposal date, present value at the latest rate, and each point of a daily series at that point's own date. Unrealized PnL is derived by subtracting two already-converted terms rather than converted a third time. The rate-date rule is a pure function in `core-domain`; adapters apply a basis and never choose one.
  - **`v_fx_daily`**: one view now owns dated rate resolution — direct ECB quotes preferred over synthesised reciprocals, resolution strictly backward-looking. The DuckDB-local `user_settings` table and its `'USD'` seed are **removed**; a derived cache must not hold a second source of truth that survives no rebuild.
  - **Unconvertible figures are reported, never guessed**: a figure no stored rate can express keeps its native amount and says so, instead of entering a total at a factor of one. Two real defects fixed: 500 EUR was being summed into a USD total as 500 USD, and a non-zero cost basis below the destination scale landed on `0` — a phantom 100% gain with no signal attached.
  - **Decimal precision repaired end to end**: gratuitous `DOUBLE` money expressions in the analytics and metrics adapters now stay `DECIMAL`, with operand scales allocated from measurement of the real exchange exports rather than inherited. A unit price of `9.18695e-10` and a cost basis past `1e8` both survive the aggregations.
  - **FX ledger gap detection and backfill**: gaps are computed as an anti-join against ECB _publication_ dates taken from the ECB history document itself, never from a weekday rule, so a covered weekend or holiday is not a gap. Missing dates are filled from the ECB archive on first ingestion and on boot, with document choice an efficiency decision that never bounds coverage. Historical retrieval gets its own parse path: the previous single-date expression silently returned only the newest of 7,068 dates.
  - **The tax report states the currency of its figures**: header and export both carry the display currency and the conversion basis, and a period containing an event no rate could reach reports itself incomplete and names the affected events rather than omitting them. Also fixes an unreachable export endpoint — `/report/download` was shadowed by `/report/:year` and had been returning a 500.
  - **Per-event figures carry their own conversion outcome**: `sale_price_eur` / `gain_loss_eur` are renamed to `sale_price` / `gain_loss` carrying `ConvertedAmount` across both read paths, so the audit trail's rows and the declared base agree. The renderer now distinguishes four states — unresolved, unconvertible, gain, loss — where an unguarded sign comparison reported a failed conversion as a loss the user never had.
  - **The read that materialises stays native by contract**, fixed by test: converting there would persist display-converted figures into `lot_history_events`, indistinguishable from natively-denominated ones.
  - **The AEAT summary states no currency in its field names, and is no longer float money**: `capital_gains_eur` and its five siblings are derived from bases already converted to the display currency, so in a USD report a field named for euros held dollars. They are now `capital_gains`, `capital_losses`, `savings_base_yields`, `general_base_airdrops`, `net_patrimonial_result` and `estimated_irpf`, carried as exact decimal strings and computed with `Decimal` — the 19% IRPF estimate was a float multiplication whose result a user files with a tax authority. The frontend also stops accepting nineteen optional aliases that each defaulted to `0`, and stops computing an entire summary when the field is absent: both turned a missing figure into a declared tax base of zero that no engine produced.
- Updated dependencies [[`884e48b`](https://github.com/nelomr/kryptofolio/commit/884e48bef58ca316cb3999110469ed9799725958)]:
  - @kryptofolio/shared-types@1.1.5

### 🗄️ Database (`@kryptofolio/database` @ 0.0.10)

**Patch Changes**

- [`884e48b`](https://github.com/nelomr/kryptofolio/commit/884e48bef58ca316cb3999110469ed9799725958) Thanks [@nelomr](https://github.com/nelomr)! - - **Display currency becomes arithmetic, not a label**: `base_currency` previously reached the read model as a string echoed back beside unconverted figures, so the same ledger returned identical numbers under two different currency labels. Every monetary figure is now multiplied by a resolved FX rate before it leaves DuckDB, or returned as explicitly native.
  - **Each figure converts at its own date**: a cost basis at its acquisition date, a realized gain and every per-event disposal figure at its disposal date, present value at the latest rate, and each point of a daily series at that point's own date. Unrealized PnL is derived by subtracting two already-converted terms rather than converted a third time. The rate-date rule is a pure function in `core-domain`; adapters apply a basis and never choose one.
  - **`v_fx_daily`**: one view now owns dated rate resolution — direct ECB quotes preferred over synthesised reciprocals, resolution strictly backward-looking. The DuckDB-local `user_settings` table and its `'USD'` seed are **removed**; a derived cache must not hold a second source of truth that survives no rebuild.
  - **Unconvertible figures are reported, never guessed**: a figure no stored rate can express keeps its native amount and says so, instead of entering a total at a factor of one. Two real defects fixed: 500 EUR was being summed into a USD total as 500 USD, and a non-zero cost basis below the destination scale landed on `0` — a phantom 100% gain with no signal attached.
  - **Decimal precision repaired end to end**: gratuitous `DOUBLE` money expressions in the analytics and metrics adapters now stay `DECIMAL`, with operand scales allocated from measurement of the real exchange exports rather than inherited. A unit price of `9.18695e-10` and a cost basis past `1e8` both survive the aggregations.
  - **FX ledger gap detection and backfill**: gaps are computed as an anti-join against ECB _publication_ dates taken from the ECB history document itself, never from a weekday rule, so a covered weekend or holiday is not a gap. Missing dates are filled from the ECB archive on first ingestion and on boot, with document choice an efficiency decision that never bounds coverage. Historical retrieval gets its own parse path: the previous single-date expression silently returned only the newest of 7,068 dates.
  - **The tax report states the currency of its figures**: header and export both carry the display currency and the conversion basis, and a period containing an event no rate could reach reports itself incomplete and names the affected events rather than omitting them. Also fixes an unreachable export endpoint — `/report/download` was shadowed by `/report/:year` and had been returning a 500.
  - **Per-event figures carry their own conversion outcome**: `sale_price_eur` / `gain_loss_eur` are renamed to `sale_price` / `gain_loss` carrying `ConvertedAmount` across both read paths, so the audit trail's rows and the declared base agree. The renderer now distinguishes four states — unresolved, unconvertible, gain, loss — where an unguarded sign comparison reported a failed conversion as a loss the user never had.
  - **The read that materialises stays native by contract**, fixed by test: converting there would persist display-converted figures into `lot_history_events`, indistinguishable from natively-denominated ones.
  - **The AEAT summary states no currency in its field names, and is no longer float money**: `capital_gains_eur` and its five siblings are derived from bases already converted to the display currency, so in a USD report a field named for euros held dollars. They are now `capital_gains`, `capital_losses`, `savings_base_yields`, `general_base_airdrops`, `net_patrimonial_result` and `estimated_irpf`, carried as exact decimal strings and computed with `Decimal` — the 19% IRPF estimate was a float multiplication whose result a user files with a tax authority. The frontend also stops accepting nineteen optional aliases that each defaulted to `0`, and stops computing an entire summary when the field is absent: both turned a missing figure into a declared tax base of zero that no engine produced.
- Updated dependencies [[`884e48b`](https://github.com/nelomr/kryptofolio/commit/884e48bef58ca316cb3999110469ed9799725958)]:
  - @kryptofolio/shared-types@1.1.5

### 📦 Shared Types (`@kryptofolio/shared-types` @ 1.1.5)

**Patch Changes**

- [`884e48b`](https://github.com/nelomr/kryptofolio/commit/884e48bef58ca316cb3999110469ed9799725958) Thanks [@nelomr](https://github.com/nelomr)! - - **Display currency becomes arithmetic, not a label**: `base_currency` previously reached the read model as a string echoed back beside unconverted figures, so the same ledger returned identical numbers under two different currency labels. Every monetary figure is now multiplied by a resolved FX rate before it leaves DuckDB, or returned as explicitly native.
  - **Each figure converts at its own date**: a cost basis at its acquisition date, a realized gain and every per-event disposal figure at its disposal date, present value at the latest rate, and each point of a daily series at that point's own date. Unrealized PnL is derived by subtracting two already-converted terms rather than converted a third time. The rate-date rule is a pure function in `core-domain`; adapters apply a basis and never choose one.
  - **`v_fx_daily`**: one view now owns dated rate resolution — direct ECB quotes preferred over synthesised reciprocals, resolution strictly backward-looking. The DuckDB-local `user_settings` table and its `'USD'` seed are **removed**; a derived cache must not hold a second source of truth that survives no rebuild.
  - **Unconvertible figures are reported, never guessed**: a figure no stored rate can express keeps its native amount and says so, instead of entering a total at a factor of one. Two real defects fixed: 500 EUR was being summed into a USD total as 500 USD, and a non-zero cost basis below the destination scale landed on `0` — a phantom 100% gain with no signal attached.
  - **Decimal precision repaired end to end**: gratuitous `DOUBLE` money expressions in the analytics and metrics adapters now stay `DECIMAL`, with operand scales allocated from measurement of the real exchange exports rather than inherited. A unit price of `9.18695e-10` and a cost basis past `1e8` both survive the aggregations.
  - **FX ledger gap detection and backfill**: gaps are computed as an anti-join against ECB _publication_ dates taken from the ECB history document itself, never from a weekday rule, so a covered weekend or holiday is not a gap. Missing dates are filled from the ECB archive on first ingestion and on boot, with document choice an efficiency decision that never bounds coverage. Historical retrieval gets its own parse path: the previous single-date expression silently returned only the newest of 7,068 dates.
  - **The tax report states the currency of its figures**: header and export both carry the display currency and the conversion basis, and a period containing an event no rate could reach reports itself incomplete and names the affected events rather than omitting them. Also fixes an unreachable export endpoint — `/report/download` was shadowed by `/report/:year` and had been returning a 500.
  - **Per-event figures carry their own conversion outcome**: `sale_price_eur` / `gain_loss_eur` are renamed to `sale_price` / `gain_loss` carrying `ConvertedAmount` across both read paths, so the audit trail's rows and the declared base agree. The renderer now distinguishes four states — unresolved, unconvertible, gain, loss — where an unguarded sign comparison reported a failed conversion as a loss the user never had.
  - **The read that materialises stays native by contract**, fixed by test: converting there would persist display-converted figures into `lot_history_events`, indistinguishable from natively-denominated ones.
  - **The AEAT summary states no currency in its field names, and is no longer float money**: `capital_gains_eur` and its five siblings are derived from bases already converted to the display currency, so in a USD report a field named for euros held dollars. They are now `capital_gains`, `capital_losses`, `savings_base_yields`, `general_base_airdrops`, `net_patrimonial_result` and `estimated_irpf`, carried as exact decimal strings and computed with `Decimal` — the 19% IRPF estimate was a float multiplication whose result a user files with a tax authority. The frontend also stops accepting nineteen optional aliases that each defaulted to `0`, and stops computing an entire summary when the field is absent: both turned a missing figure into a declared tax base of zero that no engine produced.


## [1.16.5](https://github.com/nelomr/kryptofolio/releases/tag/v1.16.5) (2026-08-06)

### 🖥️ Frontend (`@kryptofolio/frontend` @ 1.16.5)

**Patch Changes**

- [`8fd1422`](https://github.com/nelomr/kryptofolio/commit/8fd1422791d7a8acdde3f5a40d9eff2c020d7e44) Thanks [@nelomr](https://github.com/nelomr)! - - **FIFO Engine & Traceability Pipeline**: Replaced legacy single-account event processing with a robust, multi-account custody model that correctly traces `WITHDRAWAL` and `DEPOSIT` movements without consuming the original lot cost basis.
  - **Source Format Profiles**: Deployed a complete ingestion pipeline redesign. All exchange idiosyncrasies (e.g., Bit2Me row collapse) are now abstracted behind Source Profiles, allowing precise control over trade direction, fee denomination, convention, and precision behind the boundary.
  - **Data Quality & Fidelity**: Implemented a comprehensive fidelity net. Added explicit data quality flags (`MISSING_PRICE`, `CUSTODY_RESIDUAL`, `NEGATIVE_COST_BASIS`) independent of legacy rules. Nullable fiat magnitudes are now correctly handled, and unresolved income rows are explicitly counted rather than silently dropped.
  - **Automatic Rebuild & Manual Overrides**: Introduced automatic portfolio rebuilding mechanics and the foundation for manual fiscal overrides to correct or override lot valuations.
  - **Schema & Migrations**: Applied migrations 004, 005, and 006, wiping legacy derived tables (`spot_transactions`, `tax_lots`) in favor of `lot_custody_entries` and tracking FX conversion provenance. Existing IRPF figures are superseded.
  - **Tax Report UI Enhancements**: Realigned frontend DTOs to standard lot statuses (`OPEN`, `PARTIAL`, `CLOSED`). The UI now renders canonical lot status, full custody history, pending reviews, and correctly surfaces both exclusion counts.
  - **Database Stability**: Resolved an issue where DuckDB's ATTACH could orphan the SQLite WAL, and coerced DuckDB numeric booleans to prevent frontend parsing errors.
- Updated dependencies [[`8fd1422`](https://github.com/nelomr/kryptofolio/commit/8fd1422791d7a8acdde3f5a40d9eff2c020d7e44)]:
  - @kryptofolio/shared-types@1.1.4
  - @kryptofolio/core-domain@1.1.4

### ⚙️ Backend (`@kryptofolio/backend` @ 0.1.6)

**Patch Changes**

- [`8fd1422`](https://github.com/nelomr/kryptofolio/commit/8fd1422791d7a8acdde3f5a40d9eff2c020d7e44) Thanks [@nelomr](https://github.com/nelomr)! - - **FIFO Engine & Traceability Pipeline**: Replaced legacy single-account event processing with a robust, multi-account custody model that correctly traces `WITHDRAWAL` and `DEPOSIT` movements without consuming the original lot cost basis.
  - **Source Format Profiles**: Deployed a complete ingestion pipeline redesign. All exchange idiosyncrasies (e.g., Bit2Me row collapse) are now abstracted behind Source Profiles, allowing precise control over trade direction, fee denomination, convention, and precision behind the boundary.
  - **Data Quality & Fidelity**: Implemented a comprehensive fidelity net. Added explicit data quality flags (`MISSING_PRICE`, `CUSTODY_RESIDUAL`, `NEGATIVE_COST_BASIS`) independent of legacy rules. Nullable fiat magnitudes are now correctly handled, and unresolved income rows are explicitly counted rather than silently dropped.
  - **Automatic Rebuild & Manual Overrides**: Introduced automatic portfolio rebuilding mechanics and the foundation for manual fiscal overrides to correct or override lot valuations.
  - **Schema & Migrations**: Applied migrations 004, 005, and 006, wiping legacy derived tables (`spot_transactions`, `tax_lots`) in favor of `lot_custody_entries` and tracking FX conversion provenance. Existing IRPF figures are superseded.
  - **Tax Report UI Enhancements**: Realigned frontend DTOs to standard lot statuses (`OPEN`, `PARTIAL`, `CLOSED`). The UI now renders canonical lot status, full custody history, pending reviews, and correctly surfaces both exclusion counts.
  - **Database Stability**: Resolved an issue where DuckDB's ATTACH could orphan the SQLite WAL, and coerced DuckDB numeric booleans to prevent frontend parsing errors.
- Updated dependencies [[`8fd1422`](https://github.com/nelomr/kryptofolio/commit/8fd1422791d7a8acdde3f5a40d9eff2c020d7e44)]:
  - @kryptofolio/database@0.0.9
  - @kryptofolio/shared-types@1.1.4
  - @kryptofolio/core-domain@1.1.4

### 🧠 Core Domain (`@kryptofolio/core-domain` @ 1.1.4)

**Patch Changes**

- [`8fd1422`](https://github.com/nelomr/kryptofolio/commit/8fd1422791d7a8acdde3f5a40d9eff2c020d7e44) Thanks [@nelomr](https://github.com/nelomr)! - - **FIFO Engine & Traceability Pipeline**: Replaced legacy single-account event processing with a robust, multi-account custody model that correctly traces `WITHDRAWAL` and `DEPOSIT` movements without consuming the original lot cost basis.
  - **Source Format Profiles**: Deployed a complete ingestion pipeline redesign. All exchange idiosyncrasies (e.g., Bit2Me row collapse) are now abstracted behind Source Profiles, allowing precise control over trade direction, fee denomination, convention, and precision behind the boundary.
  - **Data Quality & Fidelity**: Implemented a comprehensive fidelity net. Added explicit data quality flags (`MISSING_PRICE`, `CUSTODY_RESIDUAL`, `NEGATIVE_COST_BASIS`) independent of legacy rules. Nullable fiat magnitudes are now correctly handled, and unresolved income rows are explicitly counted rather than silently dropped.
  - **Automatic Rebuild & Manual Overrides**: Introduced automatic portfolio rebuilding mechanics and the foundation for manual fiscal overrides to correct or override lot valuations.
  - **Schema & Migrations**: Applied migrations 004, 005, and 006, wiping legacy derived tables (`spot_transactions`, `tax_lots`) in favor of `lot_custody_entries` and tracking FX conversion provenance. Existing IRPF figures are superseded.
  - **Tax Report UI Enhancements**: Realigned frontend DTOs to standard lot statuses (`OPEN`, `PARTIAL`, `CLOSED`). The UI now renders canonical lot status, full custody history, pending reviews, and correctly surfaces both exclusion counts.
  - **Database Stability**: Resolved an issue where DuckDB's ATTACH could orphan the SQLite WAL, and coerced DuckDB numeric booleans to prevent frontend parsing errors.
- Updated dependencies [[`8fd1422`](https://github.com/nelomr/kryptofolio/commit/8fd1422791d7a8acdde3f5a40d9eff2c020d7e44)]:
  - @kryptofolio/shared-types@1.1.4

### 🗄️ Database (`@kryptofolio/database` @ 0.0.9)

**Patch Changes**

- [`8fd1422`](https://github.com/nelomr/kryptofolio/commit/8fd1422791d7a8acdde3f5a40d9eff2c020d7e44) Thanks [@nelomr](https://github.com/nelomr)! - - **FIFO Engine & Traceability Pipeline**: Replaced legacy single-account event processing with a robust, multi-account custody model that correctly traces `WITHDRAWAL` and `DEPOSIT` movements without consuming the original lot cost basis.
  - **Source Format Profiles**: Deployed a complete ingestion pipeline redesign. All exchange idiosyncrasies (e.g., Bit2Me row collapse) are now abstracted behind Source Profiles, allowing precise control over trade direction, fee denomination, convention, and precision behind the boundary.
  - **Data Quality & Fidelity**: Implemented a comprehensive fidelity net. Added explicit data quality flags (`MISSING_PRICE`, `CUSTODY_RESIDUAL`, `NEGATIVE_COST_BASIS`) independent of legacy rules. Nullable fiat magnitudes are now correctly handled, and unresolved income rows are explicitly counted rather than silently dropped.
  - **Automatic Rebuild & Manual Overrides**: Introduced automatic portfolio rebuilding mechanics and the foundation for manual fiscal overrides to correct or override lot valuations.
  - **Schema & Migrations**: Applied migrations 004, 005, and 006, wiping legacy derived tables (`spot_transactions`, `tax_lots`) in favor of `lot_custody_entries` and tracking FX conversion provenance. Existing IRPF figures are superseded.
  - **Tax Report UI Enhancements**: Realigned frontend DTOs to standard lot statuses (`OPEN`, `PARTIAL`, `CLOSED`). The UI now renders canonical lot status, full custody history, pending reviews, and correctly surfaces both exclusion counts.
  - **Database Stability**: Resolved an issue where DuckDB's ATTACH could orphan the SQLite WAL, and coerced DuckDB numeric booleans to prevent frontend parsing errors.
- Updated dependencies [[`8fd1422`](https://github.com/nelomr/kryptofolio/commit/8fd1422791d7a8acdde3f5a40d9eff2c020d7e44)]:
  - @kryptofolio/shared-types@1.1.4

### 📦 Shared Types (`@kryptofolio/shared-types` @ 1.1.4)

**Patch Changes**

- [`8fd1422`](https://github.com/nelomr/kryptofolio/commit/8fd1422791d7a8acdde3f5a40d9eff2c020d7e44) Thanks [@nelomr](https://github.com/nelomr)! - - **FIFO Engine & Traceability Pipeline**: Replaced legacy single-account event processing with a robust, multi-account custody model that correctly traces `WITHDRAWAL` and `DEPOSIT` movements without consuming the original lot cost basis.
  - **Source Format Profiles**: Deployed a complete ingestion pipeline redesign. All exchange idiosyncrasies (e.g., Bit2Me row collapse) are now abstracted behind Source Profiles, allowing precise control over trade direction, fee denomination, convention, and precision behind the boundary.
  - **Data Quality & Fidelity**: Implemented a comprehensive fidelity net. Added explicit data quality flags (`MISSING_PRICE`, `CUSTODY_RESIDUAL`, `NEGATIVE_COST_BASIS`) independent of legacy rules. Nullable fiat magnitudes are now correctly handled, and unresolved income rows are explicitly counted rather than silently dropped.
  - **Automatic Rebuild & Manual Overrides**: Introduced automatic portfolio rebuilding mechanics and the foundation for manual fiscal overrides to correct or override lot valuations.
  - **Schema & Migrations**: Applied migrations 004, 005, and 006, wiping legacy derived tables (`spot_transactions`, `tax_lots`) in favor of `lot_custody_entries` and tracking FX conversion provenance. Existing IRPF figures are superseded.
  - **Tax Report UI Enhancements**: Realigned frontend DTOs to standard lot statuses (`OPEN`, `PARTIAL`, `CLOSED`). The UI now renders canonical lot status, full custody history, pending reviews, and correctly surfaces both exclusion counts.
  - **Database Stability**: Resolved an issue where DuckDB's ATTACH could orphan the SQLite WAL, and coerced DuckDB numeric booleans to prevent frontend parsing errors.


## [1.16.4](https://github.com/nelomr/kryptofolio/releases/tag/v1.16.4) (2026-07-28)

### 🖥️ Frontend (`@kryptofolio/frontend` @ 1.16.4)

**Patch Changes**

- [`a616b45`](https://github.com/nelomr/kryptofolio/commit/a616b4590a32b80555b789e701cec9a0bcbded4f) Thanks [@nelomr](https://github.com/nelomr)! - - **Phase 2B Analytics & Time Series Engine**: Added DuckDB-powered OLAP queries for daily valuation, 30d annualized volatility, ATH drawdowns, and risk metrics (Sharpe Ratio, Alpha, Beta, Win Rate, Best/Worst Assets) with Hono RPC endpoints and Vue 3 UI widgets.
  - **Domain Layer Isolation & PreciseAmount Value Objects**: Removed direct `decimal.js` dependencies from domain ports (`ILedgerPort`, `IPriceProviderPort`) using branded string value objects (`PreciseAmount`), and enforced strict CSV transaction ingestion constraints.
  - **Portfolio Rebuild Sync & Base Currency Configuration**: Fixed `FifoMaterializerService` synchronization across SQLite ledgers and DuckDB analytical views, and aligned metric adapters with user-configured base currency (`userSettingsPort`).
- Updated dependencies [[`a616b45`](https://github.com/nelomr/kryptofolio/commit/a616b4590a32b80555b789e701cec9a0bcbded4f)]:
  - @kryptofolio/shared-types@1.1.3
  - @kryptofolio/core-domain@1.1.3

### ⚙️ Backend (`@kryptofolio/backend` @ 0.1.5)

**Patch Changes**

- [`a616b45`](https://github.com/nelomr/kryptofolio/commit/a616b4590a32b80555b789e701cec9a0bcbded4f) Thanks [@nelomr](https://github.com/nelomr)! - - **Phase 2B Analytics & Time Series Engine**: Added DuckDB-powered OLAP queries for daily valuation, 30d annualized volatility, ATH drawdowns, and risk metrics (Sharpe Ratio, Alpha, Beta, Win Rate, Best/Worst Assets) with Hono RPC endpoints and Vue 3 UI widgets.
  - **Domain Layer Isolation & PreciseAmount Value Objects**: Removed direct `decimal.js` dependencies from domain ports (`ILedgerPort`, `IPriceProviderPort`) using branded string value objects (`PreciseAmount`), and enforced strict CSV transaction ingestion constraints.
  - **Portfolio Rebuild Sync & Base Currency Configuration**: Fixed `FifoMaterializerService` synchronization across SQLite ledgers and DuckDB analytical views, and aligned metric adapters with user-configured base currency (`userSettingsPort`).
- Updated dependencies [[`a616b45`](https://github.com/nelomr/kryptofolio/commit/a616b4590a32b80555b789e701cec9a0bcbded4f)]:
  - @kryptofolio/database@0.0.8
  - @kryptofolio/shared-types@1.1.3
  - @kryptofolio/core-domain@1.1.3

### 🧠 Core Domain (`@kryptofolio/core-domain` @ 1.1.3)

**Patch Changes**

- Updated dependencies [[`a616b45`](https://github.com/nelomr/kryptofolio/commit/a616b4590a32b80555b789e701cec9a0bcbded4f)]:
  - @kryptofolio/shared-types@1.1.3

### 🗄️ Database (`@kryptofolio/database` @ 0.0.8)

**Patch Changes**

- [`a616b45`](https://github.com/nelomr/kryptofolio/commit/a616b4590a32b80555b789e701cec9a0bcbded4f) Thanks [@nelomr](https://github.com/nelomr)! - - **Phase 2B Analytics & Time Series Engine**: Added DuckDB-powered OLAP queries for daily valuation, 30d annualized volatility, ATH drawdowns, and risk metrics (Sharpe Ratio, Alpha, Beta, Win Rate, Best/Worst Assets) with Hono RPC endpoints and Vue 3 UI widgets.
  - **Domain Layer Isolation & PreciseAmount Value Objects**: Removed direct `decimal.js` dependencies from domain ports (`ILedgerPort`, `IPriceProviderPort`) using branded string value objects (`PreciseAmount`), and enforced strict CSV transaction ingestion constraints.
  - **Portfolio Rebuild Sync & Base Currency Configuration**: Fixed `FifoMaterializerService` synchronization across SQLite ledgers and DuckDB analytical views, and aligned metric adapters with user-configured base currency (`userSettingsPort`).

### 📦 Shared Types (`@kryptofolio/shared-types` @ 1.1.3)

**Patch Changes**

- [`a616b45`](https://github.com/nelomr/kryptofolio/commit/a616b4590a32b80555b789e701cec9a0bcbded4f) Thanks [@nelomr](https://github.com/nelomr)! - - **Phase 2B Analytics & Time Series Engine**: Added DuckDB-powered OLAP queries for daily valuation, 30d annualized volatility, ATH drawdowns, and risk metrics (Sharpe Ratio, Alpha, Beta, Win Rate, Best/Worst Assets) with Hono RPC endpoints and Vue 3 UI widgets.
  - **Domain Layer Isolation & PreciseAmount Value Objects**: Removed direct `decimal.js` dependencies from domain ports (`ILedgerPort`, `IPriceProviderPort`) using branded string value objects (`PreciseAmount`), and enforced strict CSV transaction ingestion constraints.
  - **Portfolio Rebuild Sync & Base Currency Configuration**: Fixed `FifoMaterializerService` synchronization across SQLite ledgers and DuckDB analytical views, and aligned metric adapters with user-configured base currency (`userSettingsPort`).


## [1.16.3](https://github.com/nelomr/kryptofolio/releases/tag/v1.16.3) (2026-07-10)

### ⚙️ Backend (`@kryptofolio/backend` @ 0.1.4)

**Patch Changes**

- [`3a2a413`](https://github.com/nelomr/kryptofolio/commit/3a2a4136471afeb50f815bba77c619688cb202df) Thanks [@nelomr](https://github.com/nelomr)! - Implement local-first analytical time-series database architecture leveraging DuckDB and Apache Parquet format.

  Key Changes:

  - **DuckDB Parquet Ingestion:** Developed `DuckDbParquetPriceAdapter` implementing a strict, partition-safe write strategy. New records are merged with existing Parquet partition data and deduplicated (using a `QUALIFY ROW_NUMBER() OVER (...)` SQL pattern) before executing the atomic `COPY` operation, preventing accidental directory/partition overrides.
  - **Strict Money Precision:** Configured all pricing, volume, and currency exchange schema definitions to leverage `DECIMAL(38,18)` internally, preventing floating-point inaccuracies in financial calculations.
  - **Daemon Ingestion Use Case:** Implemented `IngestDailyPricesUseCase` using a Clean Architecture "Functional Sandwich" design. Pure logical calculations determine date gaps, while impuro side effects handle domain port inputs/outputs.
  - **Seeding Pipelines:** Created automated, environment-aware seed scripts (`seed_historical_parquet.ts` and `seed_ecb_rates.ts`) for bootstrapping historical exchange rates and daily token prices from Kraken and CoinGecko fallback models.
  - **Architecture Docs:** Documented the new time-series design in `docs/architecture/duckdb-parquet-time-series.md`.

- Updated dependencies [[`3a2a413`](https://github.com/nelomr/kryptofolio/commit/3a2a4136471afeb50f815bba77c619688cb202df)]:
  - @kryptofolio/database@0.0.7

### 🗄️ Database (`@kryptofolio/database` @ 0.0.7)

**Patch Changes**

- [`3a2a413`](https://github.com/nelomr/kryptofolio/commit/3a2a4136471afeb50f815bba77c619688cb202df) Thanks [@nelomr](https://github.com/nelomr)! - Implement local-first analytical time-series database architecture leveraging DuckDB and Apache Parquet format.

  Key Changes:

  - **DuckDB Parquet Ingestion:** Developed `DuckDbParquetPriceAdapter` implementing a strict, partition-safe write strategy. New records are merged with existing Parquet partition data and deduplicated (using a `QUALIFY ROW_NUMBER() OVER (...)` SQL pattern) before executing the atomic `COPY` operation, preventing accidental directory/partition overrides.
  - **Strict Money Precision:** Configured all pricing, volume, and currency exchange schema definitions to leverage `DECIMAL(38,18)` internally, preventing floating-point inaccuracies in financial calculations.
  - **Daemon Ingestion Use Case:** Implemented `IngestDailyPricesUseCase` using a Clean Architecture "Functional Sandwich" design. Pure logical calculations determine date gaps, while impuro side effects handle domain port inputs/outputs.
  - **Seeding Pipelines:** Created automated, environment-aware seed scripts (`seed_historical_parquet.ts` and `seed_ecb_rates.ts`) for bootstrapping historical exchange rates and daily token prices from Kraken and CoinGecko fallback models.
  - **Architecture Docs:** Documented the new time-series design in `docs/architecture/duckdb-parquet-time-series.md`.


## [1.16.3](https://github.com/nelomr/kryptofolio/releases/tag/v1.16.3) (2026-06-30)

### 🖥️ Frontend (`@kryptofolio/frontend` @ 1.16.3)

**Patch Changes**

- [`bc47988`](https://github.com/nelomr/kryptofolio/commit/bc479880ca1abad28a02533d5f1c181e7efb9c6f) Thanks [@nelomr](https://github.com/nelomr)! - feat: DuckDB Vectorized Spot FIFO Engine & Real-Time PnL Federation

  Implemented the complete OLAP tax calculation engine using DuckDB. Features include vectorized FIFO lots consumption via Window Functions, proper routing of IRPF Tax Bases (Savings vs General), and asynchronous Unrealized PnL federation via the ASOF adapter.

- [`87563e7`](https://github.com/nelomr/kryptofolio/commit/87563e73af84378293398ee1daef2d5564982b55) Thanks [@nelomr](https://github.com/nelomr)! - feat: Update CI to V6

  Update CI to V6

### ⚙️ Backend (`@kryptofolio/backend` @ 0.1.3)

**Patch Changes**

- [`bc47988`](https://github.com/nelomr/kryptofolio/commit/bc479880ca1abad28a02533d5f1c181e7efb9c6f) Thanks [@nelomr](https://github.com/nelomr)! - feat: DuckDB Vectorized Spot FIFO Engine & Real-Time PnL Federation

  Implemented the complete OLAP tax calculation engine using DuckDB. Features include vectorized FIFO lots consumption via Window Functions, proper routing of IRPF Tax Bases (Savings vs General), and asynchronous Unrealized PnL federation via the ASOF adapter.

- [`87563e7`](https://github.com/nelomr/kryptofolio/commit/87563e73af84378293398ee1daef2d5564982b55) Thanks [@nelomr](https://github.com/nelomr)! - feat: Update CI to V6

  Update CI to V6

- Updated dependencies [[`87563e7`](https://github.com/nelomr/kryptofolio/commit/87563e73af84378293398ee1daef2d5564982b55)]:
  - @kryptofolio/database@0.0.6

### 🗄️ Database (`@kryptofolio/database` @ 0.0.6)

**Patch Changes**

- [`bc47988`](https://github.com/nelomr/kryptofolio/commit/bc479880ca1abad28a02533d5f1c181e7efb9c6f) Thanks [@nelomr](https://github.com/nelomr)! - feat: DuckDB Vectorized Spot FIFO Engine & Real-Time PnL Federation

  Implemented the complete OLAP tax calculation engine using DuckDB. Features include vectorized FIFO lots consumption via Window Functions, proper routing of IRPF Tax Bases (Savings vs General), and asynchronous Unrealized PnL federation via the ASOF adapter.

- [`87563e7`](https://github.com/nelomr/kryptofolio/commit/87563e73af84378293398ee1daef2d5564982b55) Thanks [@nelomr](https://github.com/nelomr)! - feat: Update CI to V6

  Update CI to V6


## [1.16.2](https://github.com/nelomr/kryptofolio/releases/tag/v1.16.2) (2026-06-26)

### 🖥️ Frontend (`@kryptofolio/frontend` @ 1.16.2)

**Patch Changes**

- [`0ed1e59`](https://github.com/nelomr/kryptofolio/commit/0ed1e59c96a7b676630212a60760ba4eb62e42f0) Thanks [@nelomr](https://github.com/nelomr)! - feat(phase1): implement SQLite OLTP ledger architecture, data ingestion pipelines, and deterministic UUID hashing

- Updated dependencies [[`0ed1e59`](https://github.com/nelomr/kryptofolio/commit/0ed1e59c96a7b676630212a60760ba4eb62e42f0)]:
  - @kryptofolio/core-domain@1.1.2
  - @kryptofolio/shared-types@1.1.2

### ⚙️ Backend (`@kryptofolio/backend` @ 0.1.2)

**Patch Changes**

- [`0ed1e59`](https://github.com/nelomr/kryptofolio/commit/0ed1e59c96a7b676630212a60760ba4eb62e42f0) Thanks [@nelomr](https://github.com/nelomr)! - feat(phase1): implement SQLite OLTP ledger architecture, data ingestion pipelines, and deterministic UUID hashing

- Updated dependencies [[`0ed1e59`](https://github.com/nelomr/kryptofolio/commit/0ed1e59c96a7b676630212a60760ba4eb62e42f0)]:
  - @kryptofolio/core-domain@1.1.2
  - @kryptofolio/database@0.0.5
  - @kryptofolio/shared-types@1.1.2

### 🧠 Core Domain (`@kryptofolio/core-domain` @ 1.1.2)

**Patch Changes**

- [`0ed1e59`](https://github.com/nelomr/kryptofolio/commit/0ed1e59c96a7b676630212a60760ba4eb62e42f0) Thanks [@nelomr](https://github.com/nelomr)! - feat(phase1): implement SQLite OLTP ledger architecture, data ingestion pipelines, and deterministic UUID hashing

- Updated dependencies [[`0ed1e59`](https://github.com/nelomr/kryptofolio/commit/0ed1e59c96a7b676630212a60760ba4eb62e42f0)]:
  - @kryptofolio/shared-types@1.1.2

### 🗄️ Database (`@kryptofolio/database` @ 0.0.5)

**Patch Changes**

- [`0ed1e59`](https://github.com/nelomr/kryptofolio/commit/0ed1e59c96a7b676630212a60760ba4eb62e42f0) Thanks [@nelomr](https://github.com/nelomr)! - feat(phase1): implement SQLite OLTP ledger architecture, data ingestion pipelines, and deterministic UUID hashing

### 📦 Shared Types (`@kryptofolio/shared-types` @ 1.1.2)

**Patch Changes**

- [`0ed1e59`](https://github.com/nelomr/kryptofolio/commit/0ed1e59c96a7b676630212a60760ba4eb62e42f0) Thanks [@nelomr](https://github.com/nelomr)! - feat(phase1): implement SQLite OLTP ledger architecture, data ingestion pipelines, and deterministic UUID hashing


## [1.16.1](https://github.com/nelomr/kryptofolio/releases/tag/v1.16.1) (2026-06-22)

### 🖥️ Frontend (`@kryptofolio/frontend` @ 1.16.1)

**Patch Changes**

- [`e56018d`](https://github.com/nelomr/kryptofolio/commit/e56018dfe7173ba24ad0af653ac6ebe5603c764c) Thanks [@nelomr](https://github.com/nelomr)! - feat(domain): phase 0 domain conditioning - implement Money VO, strict financial precision, and eradicate multi-tenancy

- Updated dependencies [[`e56018d`](https://github.com/nelomr/kryptofolio/commit/e56018dfe7173ba24ad0af653ac6ebe5603c764c)]:
  - @kryptofolio/core-domain@1.1.1
  - @kryptofolio/shared-types@1.1.1

### ⚙️ Backend (`@kryptofolio/backend` @ 0.1.1)

**Patch Changes**

- Updated dependencies [[`e56018d`](https://github.com/nelomr/kryptofolio/commit/e56018dfe7173ba24ad0af653ac6ebe5603c764c)]:
  - @kryptofolio/core-domain@1.1.1
  - @kryptofolio/shared-types@1.1.1

### 🧠 Core Domain (`@kryptofolio/core-domain` @ 1.1.1)

**Patch Changes**

- [`e56018d`](https://github.com/nelomr/kryptofolio/commit/e56018dfe7173ba24ad0af653ac6ebe5603c764c) Thanks [@nelomr](https://github.com/nelomr)! - feat(domain): phase 0 domain conditioning - implement Money VO, strict financial precision, and eradicate multi-tenancy

- Updated dependencies [[`e56018d`](https://github.com/nelomr/kryptofolio/commit/e56018dfe7173ba24ad0af653ac6ebe5603c764c)]:
  - @kryptofolio/shared-types@1.1.1

### 📦 Shared Types (`@kryptofolio/shared-types` @ 1.1.1)

**Patch Changes**

- [`e56018d`](https://github.com/nelomr/kryptofolio/commit/e56018dfe7173ba24ad0af653ac6ebe5603c764c) Thanks [@nelomr](https://github.com/nelomr)! - feat(domain): phase 0 domain conditioning - implement Money VO, strict financial precision, and eradicate multi-tenancy


## [1.16.0](https://github.com/nelomr/kryptofolio/releases/tag/v1.16.0) (2026-06-19)

### 🖥️ Frontend (`@kryptofolio/frontend` @ 1.16.0)

**Minor Changes**

- [`92580da`](https://github.com/nelomr/kryptofolio/commit/92580dad4761bbf18cfcbdc18cd2af967e87b9ae) Thanks [@nelomr](https://github.com/nelomr)! - Market Data Fiat Normalization and Backend Re-architecture:
  - **Domain & Types**: Introduced `Money`, `Currency`, and `ExchangeRate` value objects. Added `CurrencyConverter` using `decimal.js` to ensure absolute precision and prevent floating-point errors.
  - **Backend Sync**: Created `FetchAndStoreExchangeRatesUC` and a dedicated `ExchangeRateSyncJob` to sync daily fiat rates automatically from the European Central Bank (ECB) XML feed.
  - **Data Normalization**: Implemented `StreamNormalizedMarketDataUC` to intercept raw websocket ticks and normalize prices to the user's active fiat base currency in real-time.
  - **Backend Refactor**: Resolved the "God Object" anti-pattern by splitting `index.ts` into `app.ts` (pure Hono routing) and `index.ts` (DB initialization, jobs, and orchestration). Extracted mock routes into isolated modules.
  - **Frontend Settings**: Added a new `CurrencySettings` component in the UI to allow users to select their base currency (USD, EUR, GBP) and trigger manual rate synchronizations.

**Patch Changes**

- Updated dependencies [[`92580da`](https://github.com/nelomr/kryptofolio/commit/92580dad4761bbf18cfcbdc18cd2af967e87b9ae)]:
  - @kryptofolio/core-domain@1.1.0
  - @kryptofolio/shared-types@1.1.0

### ⚙️ Backend (`@kryptofolio/backend` @ 0.1.0)

**Minor Changes**

- [`92580da`](https://github.com/nelomr/kryptofolio/commit/92580dad4761bbf18cfcbdc18cd2af967e87b9ae) Thanks [@nelomr](https://github.com/nelomr)! - Market Data Fiat Normalization and Backend Re-architecture:
  - **Domain & Types**: Introduced `Money`, `Currency`, and `ExchangeRate` value objects. Added `CurrencyConverter` using `decimal.js` to ensure absolute precision and prevent floating-point errors.
  - **Backend Sync**: Created `FetchAndStoreExchangeRatesUC` and a dedicated `ExchangeRateSyncJob` to sync daily fiat rates automatically from the European Central Bank (ECB) XML feed.
  - **Data Normalization**: Implemented `StreamNormalizedMarketDataUC` to intercept raw websocket ticks and normalize prices to the user's active fiat base currency in real-time.
  - **Backend Refactor**: Resolved the "God Object" anti-pattern by splitting `index.ts` into `app.ts` (pure Hono routing) and `index.ts` (DB initialization, jobs, and orchestration). Extracted mock routes into isolated modules.
  - **Frontend Settings**: Added a new `CurrencySettings` component in the UI to allow users to select their base currency (USD, EUR, GBP) and trigger manual rate synchronizations.

**Patch Changes**

- Updated dependencies [[`92580da`](https://github.com/nelomr/kryptofolio/commit/92580dad4761bbf18cfcbdc18cd2af967e87b9ae)]:
  - @kryptofolio/core-domain@1.1.0
  - @kryptofolio/shared-types@1.1.0

### 🧠 Core Domain (`@kryptofolio/core-domain` @ 1.1.0)

**Minor Changes**

- [`92580da`](https://github.com/nelomr/kryptofolio/commit/92580dad4761bbf18cfcbdc18cd2af967e87b9ae) Thanks [@nelomr](https://github.com/nelomr)! - Market Data Fiat Normalization and Backend Re-architecture:
  - **Domain & Types**: Introduced `Money`, `Currency`, and `ExchangeRate` value objects. Added `CurrencyConverter` using `decimal.js` to ensure absolute precision and prevent floating-point errors.
  - **Backend Sync**: Created `FetchAndStoreExchangeRatesUC` and a dedicated `ExchangeRateSyncJob` to sync daily fiat rates automatically from the European Central Bank (ECB) XML feed.
  - **Data Normalization**: Implemented `StreamNormalizedMarketDataUC` to intercept raw websocket ticks and normalize prices to the user's active fiat base currency in real-time.
  - **Backend Refactor**: Resolved the "God Object" anti-pattern by splitting `index.ts` into `app.ts` (pure Hono routing) and `index.ts` (DB initialization, jobs, and orchestration). Extracted mock routes into isolated modules.
  - **Frontend Settings**: Added a new `CurrencySettings` component in the UI to allow users to select their base currency (USD, EUR, GBP) and trigger manual rate synchronizations.

**Patch Changes**

- Updated dependencies [[`92580da`](https://github.com/nelomr/kryptofolio/commit/92580dad4761bbf18cfcbdc18cd2af967e87b9ae)]:
  - @kryptofolio/shared-types@1.1.0

### 📦 Shared Types (`@kryptofolio/shared-types` @ 1.1.0)

**Minor Changes**

- [`92580da`](https://github.com/nelomr/kryptofolio/commit/92580dad4761bbf18cfcbdc18cd2af967e87b9ae) Thanks [@nelomr](https://github.com/nelomr)! - Market Data Fiat Normalization and Backend Re-architecture:
  - **Domain & Types**: Introduced `Money`, `Currency`, and `ExchangeRate` value objects. Added `CurrencyConverter` using `decimal.js` to ensure absolute precision and prevent floating-point errors.
  - **Backend Sync**: Created `FetchAndStoreExchangeRatesUC` and a dedicated `ExchangeRateSyncJob` to sync daily fiat rates automatically from the European Central Bank (ECB) XML feed.
  - **Data Normalization**: Implemented `StreamNormalizedMarketDataUC` to intercept raw websocket ticks and normalize prices to the user's active fiat base currency in real-time.
  - **Backend Refactor**: Resolved the "God Object" anti-pattern by splitting `index.ts` into `app.ts` (pure Hono routing) and `index.ts` (DB initialization, jobs, and orchestration). Extracted mock routes into isolated modules.
  - **Frontend Settings**: Added a new `CurrencySettings` component in the UI to allow users to select their base currency (USD, EUR, GBP) and trigger manual rate synchronizations.


## [1.15.12](https://github.com/nelomr/kryptofolio/releases/tag/v1.15.12) (2026-06-19)

### 🖥️ Frontend (`@kryptofolio/frontend` @ 1.15.12)

**Patch Changes**

- [`ca6ca05`](https://github.com/nelomr/kryptofolio/commit/ca6ca055b8feb1e848ebad1d2ee98b6e9d1342dd) Thanks [@nelomr](https://github.com/nelomr)! - chore: force pipeline to run release process with updated github action

## [1.15.11](https://github.com/nelomr/kryptofolio/releases/tag/v1.15.11) (2026-06-18)

### 🖥️ Frontend (`@kryptofolio/frontend` @ 1.15.11)

**Patch Changes**

- [`e53e978`](https://github.com/nelomr/kryptofolio/commit/e53e9783a8e9224dedd02654ae7ff80001bae348) Thanks [@nelomr](https://github.com/nelomr)! - chore: align frontend package version with historical global tag

## [1.15.10](https://github.com/nelomr/kryptofolio/compare/v1.15.9...v1.15.10) (2026-06-17)

### ✨ Features

* add historical portfolio drawdown curve widget ([7b4170f](https://github.com/nelomr/kryptofolio/commit/7b4170fb02ec91b8ac4b67331fa40e3479ccab7a))

## [1.15.9](https://github.com/nelomr/kryptofolio/compare/v1.15.8...v1.15.9) (2026-06-15)

### ✨ Features

* **data-ingestion:** implement ingestion wizard and improve csv header mapping ([03e91a4](https://github.com/nelomr/kryptofolio/commit/03e91a479eee1ae94d26df3a5d43f191b7d41b5b))

### ♻️  Refactors

* colocate ui components and optimize assets ([07b09c2](https://github.com/nelomr/kryptofolio/commit/07b09c21180981d8d18aad43b7fc496cfe290abe))

### 📝 Documentation

* improve architecture and api integration documentation ([baa015d](https://github.com/nelomr/kryptofolio/commit/baa015d9fedea952424e2af68e79e5f0d9fcb0db))
* **openspec:** archive update-logos-and-favicon change and sync project-branding spec ([acc504e](https://github.com/nelomr/kryptofolio/commit/acc504e67db2d85fab31008aba06652137ea2d72))

## [1.15.9](https://github.com/nelomr/kryptofolio/compare/v1.15.8...v1.15.9) (2026-06-15)

### ✨ Features

* **data-ingestion:** implement ingestion wizard and improve csv header mapping ([03e91a4](https://github.com/nelomr/kryptofolio/commit/03e91a479eee1ae94d26df3a5d43f191b7d41b5b))

### ♻️  Refactors

* colocate ui components and optimize assets ([07b09c2](https://github.com/nelomr/kryptofolio/commit/07b09c21180981d8d18aad43b7fc496cfe290abe))

### 📝 Documentation

* improve architecture and api integration documentation ([baa015d](https://github.com/nelomr/kryptofolio/commit/baa015d9fedea952424e2af68e79e5f0d9fcb0db))
* **openspec:** archive update-logos-and-favicon change and sync project-branding spec ([acc504e](https://github.com/nelomr/kryptofolio/commit/acc504e67db2d85fab31008aba06652137ea2d72))

## [1.15.9](https://github.com/nelomr/kryptofolio/compare/v1.15.8...v1.15.9) (2026-06-15)

### ✨ Features

* **data-ingestion:** implement ingestion wizard and improve csv header mapping ([f5ae0ea](https://github.com/nelomr/kryptofolio/commit/f5ae0eaa81e47647b676e31fec9f450600da1087))

### ♻️  Refactors

* colocate ui components and optimize assets ([07b09c2](https://github.com/nelomr/kryptofolio/commit/07b09c21180981d8d18aad43b7fc496cfe290abe))

### 📝 Documentation

* **openspec:** archive update-logos-and-favicon change and sync project-branding spec ([acc504e](https://github.com/nelomr/kryptofolio/commit/acc504e67db2d85fab31008aba06652137ea2d72))

## [1.15.8](https://github.com/nelomr/kryptofolio/compare/v1.15.7...v1.15.8) (2026-06-11)

### ✨ Features

* complete hexagonal architecture refactor for vault and language settings with updated documentation ([533682f](https://github.com/nelomr/kryptofolio/commit/533682f37290e7b0f7c50db50c289eb18391cca7))

## [1.15.7](https://github.com/nelomr/kryptofolio/compare/v1.15.6...v1.15.7) (2026-06-11)

### ✨ Features

* implement cryptographic vault verification and modularize settings UI ([5a733ee](https://github.com/nelomr/kryptofolio/commit/5a733ee06be99a4aa3424e326627608ccad05ac6))

## [1.15.6](https://github.com/nelomr/kryptofolio/compare/v1.15.5...v1.15.6) (2026-06-11)

### ✨ Features

* integrate Local Secrets Vault, dynamic registry, and Hexagonal Architecture ([832238d](https://github.com/nelomr/kryptofolio/commit/832238dcab3fc83bac6f5fe1cea8be207ba9fdd2))

## [1.15.5](https://github.com/nelomr/kryptofolio/compare/v1.15.4...v1.15.5) (2026-06-10)

### ✨ Features

* add portfolio risk metrics widget with rolling sharpe ratio ([5cc8bad](https://github.com/nelomr/kryptofolio/commit/5cc8bad82036e6b19ab866d55339797a2ecd3a49))

## [1.15.4](https://github.com/nelomr/kryptofolio/compare/v1.15.3...v1.15.4) (2026-06-09)

### ✨ Features

* implement volatility heatmap and isolate domain logic ([a465611](https://github.com/nelomr/kryptofolio/commit/a46561179a7c77ea46a827a7bcb6928b878b7ffb))

## [1.15.3](https://github.com/nelomr/kryptofolio/compare/v1.15.2...v1.15.3) (2026-06-09)

### ✨ Features

* implement asset allocation donut chart and metrics ([3ed4479](https://github.com/nelomr/kryptofolio/commit/3ed447968b7d111ba139b93bba054de49c9c4ede))

### ♻️  Refactors

* enforce strict hexagonal architecture and application layer ([6ee5257](https://github.com/nelomr/kryptofolio/commit/6ee525774166f91af499839143f53f34652c93fd))

## [1.15.2](https://github.com/nelomr/kryptofolio/compare/v1.15.1...v1.15.2) (2026-06-08)

### ✨ Features

* migrate frontend to Hono RPC with dynamic BFF proxy ([05a179a](https://github.com/nelomr/kryptofolio/commit/05a179a65a3565e7c08d5544dcd2c5ed776a814c))

## [1.15.1](https://github.com/nelomr/kryptofolio/compare/v1.15.0...v1.15.1) (2026-06-08)

### ✨ Features

* migrate adapters to BFF and adjust release pacing ([c77a22e](https://github.com/nelomr/kryptofolio/commit/c77a22ef366d7d02fb7577df51a1657a83df6781))

### 📝 Documentation

* **specs:** sync phase-2-bff-docs specs to main library ([d508278](https://github.com/nelomr/kryptofolio/commit/d508278e15414778d47bebbcd78b066759059dff))

## [1.15.0](https://github.com/nelomr/kryptofolio/compare/v1.14.1...v1.15.0) (2026-06-06)

### ✨ Features

* **architecture:** migrate project to pnpm monorepo workspace ([9accea3](https://github.com/nelomr/kryptofolio/commit/9accea36701616f4456ecdc5e0d73da32fea8c7a))

## [1.14.1](https://github.com/nelomr/kryptofolio/compare/v1.14.0...v1.14.1) (2026-06-06)

### 🐛 Bug Fixes

* **ui:** update portfolio banner and header titles ([7d7a5e3](https://github.com/nelomr/kryptofolio/commit/7d7a5e3ccdfc111b3fa1beede7afa6cc0fb5fbf8))

## [1.14.0](https://github.com/nelomr/kryptofolio/compare/v1.13.0...v1.14.0) (2026-06-06)

### ✨ Features

* add interactive portfolio performance history chart ([f85a38d](https://github.com/nelomr/kryptofolio/commit/f85a38d4779ea2d56d035e72f35d613585b8c696))

## [1.13.0](https://github.com/nelomr/kryptofolio/compare/v1.12.0...v1.13.0) (2026-06-05)

### ✨ Features

* implement crypto kpi dashboard cards ([e4755c1](https://github.com/nelomr/kryptofolio/commit/e4755c18d733dca698b00ad470b623a8b5826b7d))

### ♻️  Refactors

* **ui:** integrate robust css-first design system and native shadcn tokens ([a452739](https://github.com/nelomr/kryptofolio/commit/a4527397dd8bada70b1252b3a570cda0f728c04e))

## [1.12.0](https://github.com/nelomr/kryptofolio/compare/v1.11.0...v1.12.0) (2026-06-04)

### ✨ Features

* **portfolio:** redesign charts with light theme and interactive legends ([7bb7766](https://github.com/nelomr/kryptofolio/commit/7bb7766e3d175fa9729e0be4701e6bfa23f4e673))

## [1.11.0](https://github.com/nelomr/kryptofolio/compare/v1.10.0...v1.11.0) (2026-06-04)

### ✨ Features

* add manual wallet configuration and CSV ingestion ([4ac6e19](https://github.com/nelomr/kryptofolio/commit/4ac6e192ce659337e7e2327372fdb3b512dbe88a))

## [1.10.0](https://github.com/nelomr/kryptofolio/compare/v1.9.0...v1.10.0) (2026-06-04)

### ✨ Features

* separate futures tax derivatives into dedicated table and standardize error i18n ([ce2637c](https://github.com/nelomr/kryptofolio/commit/ce2637ce601fbb807595fc1fd36ed2d4785ec526))

### ♻️  Refactors

* **core:** enforce strict Hexagonal Architecture and Zod ACL ([eb9574a](https://github.com/nelomr/kryptofolio/commit/eb9574ab1a7d44818ddbd505b689ec201128b5c7))

## [1.9.0](https://github.com/nelomr/kryptofolio/compare/v1.8.1...v1.9.0) (2026-06-03)

### ✨ Features

* complete tax audit and report dashboard with dynamic year filtering and enriched UI ([c4f51e6](https://github.com/nelomr/kryptofolio/commit/c4f51e636563717219dfee0f50f5cebf3cd73b6b))

## [1.8.1](https://github.com/nelomr/kryptofolio/compare/v1.8.0...v1.8.1) (2026-06-02)

### 🐛 Bug Fixes

* finalize tax report view implementation ([acf80c9](https://github.com/nelomr/kryptofolio/commit/acf80c9b072f435c961d647f7ffb275d344954d7))

## [1.8.0](https://github.com/nelomr/kryptofolio/compare/v1.7.0...v1.8.0) (2026-06-02)

### ✨ Features

* implement Tax Domain state and UI components ([c640d2a](https://github.com/nelomr/kryptofolio/commit/c640d2ac7a916c88ffbfa4496421735fe4a1c098))

## [1.7.0](https://github.com/nelomr/kryptofolio/compare/v1.6.0...v1.7.0) (2026-06-01)

### ✨ Features

* **tax-adapters:** implement CSV parsers and MockTaxAdapter with robust validation ([31b053a](https://github.com/nelomr/kryptofolio/commit/31b053a28a14d114895a8240dcacc8e20b536ee4))

## [1.6.0](https://github.com/nelomr/kryptofolio/compare/v1.5.0...v1.6.0) (2026-05-28)

### ✨ Features

* **i18n:** implement environment-based translated strings functionality ([e21359a](https://github.com/nelomr/kryptofolio/commit/e21359ab2f85a21b42d4b8fd5576b08293f36575))

## [1.5.0](https://github.com/nelomr/kryptofolio/compare/v1.4.1...v1.5.0) (2026-05-28)

### ✨ Features

* rebrand project to Kriptofolio and enhance documentation ([2cdc620](https://github.com/nelomr/kryptofolio/commit/2cdc62021730a59507f461bcf8a4d9ffdf4a3197))

### 🐛 Bug Fixes

* correct github repository url to kryptofolio ([d68ea6c](https://github.com/nelomr/kryptofolio/commit/d68ea6c27b2fb8adf3061db9c5b9bc13ef446db6))

### 📝 Documentation

* move badges to top and update repo urls ([c93ffc7](https://github.com/nelomr/kryptofolio/commit/c93ffc775a91d03e41d06ed6e9d3de77977a2fb4))

# Changelog

All notable changes to **Portfolio Dashboard** are documented here.
Format follows [Conventional Commits](https://www.conventionalcommits.org) and [Semantic Versioning](https://semver.org).

## [1.4.1](https://github.com/nelomr/portfolio-dashboard/compare/v1.4.0...v1.4.1) (2026-05-28)

### 📝 Documentation

* implement DESIGN.md and configure AI agent UI skill ([17be785](https://github.com/nelomr/portfolio-dashboard/commit/17be785fad7d4bf54ae368e1251f921284c42050))

## [1.4.0](https://github.com/nelomr/portfolio-dashboard/compare/v1.3.6...v1.4.0) (2026-05-28)

### ✨ Features

* **ui:** implement delegated skeleton pattern and SFC columns refactor ([cd6b9c2](https://github.com/nelomr/portfolio-dashboard/commit/cd6b9c2dfef4ab40a29db84f4576c78487ead66d))

## [1.3.6](https://github.com/nelomr/portfolio-dashboard/compare/v1.3.5...v1.3.6) (2026-05-27)

### 📝 Documentation

* **readme:** enhance local development and testing instructions ([cecb121](https://github.com/nelomr/portfolio-dashboard/commit/cecb12105aaf30171df64c70456f2827e3534f06))

## [1.3.5](https://github.com/nelomr/portfolio-dashboard/compare/v1.3.4...v1.3.5) (2026-05-27)

### 📝 Documentation

* **readme:** update project description ([4f535c0](https://github.com/nelomr/portfolio-dashboard/commit/4f535c0073f057b9ba480e652fae47286fc44a03))

## [1.3.4](https://github.com/nelomr/portfolio-dashboard/compare/v1.3.3...v1.3.4) (2026-05-27)

### 📝 Documentation

* **openspec:** archive hex-arch-zod-refactor and sync all delta specs ([e1a3f94](https://github.com/nelomr/portfolio-dashboard/commit/e1a3f945346184d50a8c1d443955a2d959bf2dde))

## [1.3.3](https://github.com/nelomr/portfolio-dashboard/compare/v1.3.2...v1.3.3) (2026-05-27)

### 📝 Documentation

* **openspec:** remove deprecated portfolio-state-management spec ([2d0bb22](https://github.com/nelomr/portfolio-dashboard/commit/2d0bb22f634505874361660c48b36fcabe265fa9))

## [1.3.2](https://github.com/nelomr/portfolio-dashboard/compare/v1.3.1...v1.3.2) (2026-05-27)

### 📝 Documentation

* **openspec:** sync pinia-colada specs and archive change ([39234a8](https://github.com/nelomr/portfolio-dashboard/commit/39234a80d200c5653ab77f8d05fda11bf1c1471a))

## [1.3.1](https://github.com/nelomr/portfolio-dashboard/compare/v1.3.0...v1.3.1) (2026-05-27)

### ♻️  Refactors

* **portfolio:** implement clean architecture with zod and migrate to pinia colada ([47422b0](https://github.com/nelomr/portfolio-dashboard/commit/47422b0031560de0bb5491a5549a06727ea85fff))

## [1.3.0](https://github.com/nelomr/portfolio-dashboard/compare/v1.2.0...v1.3.0) (2026-05-26)

### ✨ Features

* **portfolio:** integrate interactive charts and refactor layout ([37d1102](https://github.com/nelomr/portfolio-dashboard/commit/37d11027d8cee5575b548573fbcd60bc0cc2be0e))

## [1.2.0](https://github.com/nelomr/portfolio-dashboard/compare/v1.1.0...v1.2.0) (2026-05-26)

### ✨ Features

* **portfolio:** implement core layout and shadcn-vue architecture ([6752ac7](https://github.com/nelomr/portfolio-dashboard/commit/6752ac77f2c90e58c60942a685f48d0bb29ae148))

## [1.1.0](https://github.com/nelomr/portfolio-dashboard/compare/v1.0.0...v1.1.0) (2026-05-26)

### ✨ Features

* **portfolio:** implement state management and composables ([836d7c4](https://github.com/nelomr/portfolio-dashboard/commit/836d7c4375e084b7dc7d3ac75e47b22072af229f))

## 1.0.0 (2026-05-26)

### ✨ Features

* add portfolio data contracts and agnostic mock fixtures ([1d18478](https://github.com/nelomr/portfolio-dashboard/commit/1d1847851aeb1be8cdf31bbc65673787520d8e24))
* initial project skeleton with Vue 3, Pinia, and TailwindCSS ([f6fbdf5](https://github.com/nelomr/portfolio-dashboard/commit/f6fbdf5f2b4b4c8812876823e4cca60a335f08fe))

### 🐛 Bug Fixes

* update CI workflow to use Node 24 and fix token syntax ([960a0d1](https://github.com/nelomr/portfolio-dashboard/commit/960a0d1e396822d076ecc805665bcfaf1b7182de))

<!-- semantic-release will prepend new entries above this line -->

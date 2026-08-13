---
"@kryptofolio/frontend": patch
---

Fix: the `.xlsx` importer no longer truncates numeric cells to Excel's ~11-character display format. Quantities and fees are now read from the source's own stored value, digit for digit, instead of the shorter text Excel would show for a spreadsheet cell.

If you previously imported a Bit2Me `.xlsx` file, some quantities may have been rounded on ingestion (e.g. `149.99999997` stored as `150`). Re-importing the original file will correct them — there is no automatic migration, since the rounded value no longer carries the digits needed to recover the original.

You may also notice fee-valuation cells in the import preview now show more digits (16-17) than before (9-11). This is the source file's own recorded content; that column is a EUR valuation only and takes no part in the tax calculation.

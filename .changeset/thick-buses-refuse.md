---
"@kryptofolio/frontend": patch
---

Replace the unpatchable `xlsx@0.18.5` dependency (two unfixed high-severity advisories, no version
reachable from npm) with `read-excel-file`/`write-excel-file`. Ingested `.xlsx` values are unchanged —
verified byte-for-byte against the full real workbook corpus. `.xls` uploads are no longer accepted;
that affordance was never documented, tested, or actually supported by any maintained reader.

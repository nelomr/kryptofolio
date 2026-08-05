---
"@kryptofolio/frontend": patch
---

Fix CSV/XLSX ingestion persisting nothing while reporting success. DuckDB's `sqlite_scanner` was
attaching the SQLite ledger read-write, which made a second SQLite library take ownership of the
write-ahead log and unlink `-wal`/`-shm` under the `node:sqlite` writer: every ingestion returned 201
with a truthful count, the server read its own rows back, and no other reader — including the FIFO
materialiser — could see them, so a restart discarded the lot. The attach is now read-only. Every
database path is also resolved from the workspace root instead of the working directory, which had
been producing a second, empty ledger and an empty historical-price tree depending on where the
process was started.

---
"@kryptofolio/frontend": patch
"@kryptofolio/backend": patch
"@kryptofolio/database": patch
---

feat: DuckDB Vectorized Spot FIFO Engine & Real-Time PnL Federation

Implemented the complete OLAP tax calculation engine using DuckDB. Features include vectorized FIFO lots consumption via Window Functions, proper routing of IRPF Tax Bases (Savings vs General), and asynchronous Unrealized PnL federation via the ASOF adapter.

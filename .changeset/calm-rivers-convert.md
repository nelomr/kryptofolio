---
"@kryptofolio/backend": patch
"@kryptofolio/frontend": patch
---

Performance history now follows the display currency: each point is converted at its own date's FX rate, points with no available rate are reported as unavailable instead of falling back to EUR or zero, and the advisor's `performance_history` tool reports in the user's base currency.

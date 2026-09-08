---
"@kryptofolio/frontend": patch
"@kryptofolio/backend": patch
---

Fixed the tax report's Futures & Derivatives table always rendering zero rows. The frontend parser required fields (`id`, snake_case transaction keys) that its route never sent — it was pointed at a per-symbol aggregate with no transaction identity. The route now serves per-transaction futures data instead, and the parser is rewritten against that data's real shape. A row that fails validation is now reported (instead of silently vanishing) for every adapter loop that parses a list.

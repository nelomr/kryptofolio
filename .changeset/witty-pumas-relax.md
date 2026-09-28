---
"@kryptofolio/frontend": patch
---

Add spot transaction editing from the Ledgers table: a modal lets you correct quantities, price, fee, date, and type for any past acquisition or disposal, saved as an auditable override that survives re-imports and can be restored. Also fixes the price-declaration form in the fiscal integrity panel to use the same editor, a bug where editing one field could silently wipe another, a missing dialog accessibility warning, and adds a connectivity notice when the live price stream drops.

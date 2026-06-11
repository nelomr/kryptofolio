import type { I18nDictionary } from "@/core/domain/models/I18nDictionary";

export const en: I18nDictionary = {
  "dashboard.title": "Kryptofolio",
  "dashboard.greeting": "Hello {name}",
  "navbar.portfolio": "Portfolio",
  "navbar.settings": "Settings",
  "navbar.logout": "Logout",

  // Common
  "common.edit_disabled": "Editing for transaction {id} is currently disabled.",
  "common.delete_disabled": "Deleting transaction {id} is currently disabled.",

  // Settings
  "settings.title": "Settings",
  "settings.description":
    "Manage your local preferences, API keys, and security settings.",
  "settings.language.title": "Interface Language",
  "settings.language.description":
    "Select the language in which the application will be displayed.",
  "settings.language.select_placeholder": "Select a language",
  "settings.language.option_es": "Spanish",
  "settings.language.option_en": "English",
  "settings.language.save_btn": "Save",
  "settings.language.saving_btn": "Saving...",
  "settings.language.success": "Language updated successfully",
  "settings.language.error": "Failed to save language",

  // Errors
  "errors.validation.title": "Data Validation Error",
  "errors.validation.parser_skipped_rows":
    "{parser} parser skipped {skipped} invalid or unsupported rows.",
  "errors.validation.malformed_record":
    "A transaction record was skipped due to malformed data.",
  "errors.validation.malformed_derivative":
    "A futures derivative record was skipped due to malformed data.",
  "errors.validation.api_malformed_data":
    "Portfolio API returned malformed data.",
  "errors.validation.csv_required":
    "Uploading a CSV requires selecting a file.",

  "portfolio.roi": "Total ROI",
  "portfolio.invested": "Invested Capital",

  // Portfolio Header
  "portfolio.analytics": "Analytics",
  "portfolio.holdings": "Holdings",
  "portfolio.metrics": "Metrics",
  "portfolio.metrics_tabs.performance_history": "Performance History",
  "portfolio.metrics_tabs.performance.kicker": "Performance History",
  "portfolio.metrics_tabs.performance.title": "Portfolio Performance",
  "portfolio.metrics_tabs.performance.desc":
    "Liquidated portfolio value vs cost basis ({cost}). Blue line = equity, dotted gray = cost basis.",
  "portfolio.metrics_tabs.performance.stats.return": "Return {range}",
  "portfolio.metrics_tabs.performance.stats.return_desc":
    "Absolute profit or loss (in Fiat) generated over the selected period.",
  "portfolio.metrics_tabs.performance.stats.vs_cost": "% vs Cost",
  "portfolio.metrics_tabs.performance.stats.vs_cost_desc":
    "Percentage yield compared to the initial investment or cost basis.",
  "portfolio.metrics_tabs.performance.stats.volatility": "Volatility",
  "portfolio.metrics_tabs.performance.stats.volatility_desc":
    "Dispersion of returns (standard deviation). Higher % means greater risk or fluctuation.",
  "portfolio.metrics_tabs.performance.stats.best_day": "Best Day",
  "portfolio.metrics_tabs.performance.stats.best_day_desc":
    "The highest percentage gain recorded in a single day.",
  "portfolio.metrics_tabs.performance.tooltip.equity": "Equity:",
  "portfolio.metrics_tabs.performance.tooltip.cost": "Cost:",

  // Risk Metrics
  "portfolio.metrics_tabs.risk.kicker": "Sharpe Ratio · Rolling 30D",
  "portfolio.metrics_tabs.risk.title": "Sharpe Ratio",
  "portfolio.metrics_tabs.risk.desc":
    "Risk-adjusted return. Over 1 = return compensates for volatility. Green band = excellent zone.",
  "portfolio.metrics_tabs.risk.current": "Current Sharpe",
  "portfolio.metrics_tabs.risk.stats.sharpe": "Sharpe YTD",
  "portfolio.metrics_tabs.risk.stats.sharpe_desc":
    "Sharpe ratio calculated over the current year (Year To Date).",
  "portfolio.metrics_tabs.risk.stats.sortino": "Sortino",
  "portfolio.metrics_tabs.risk.stats.sortino_desc":
    "Similar to Sharpe, but only penalizes negative volatility (drawdowns).",
  "portfolio.metrics_tabs.risk.stats.calmar": "Calmar",
  "portfolio.metrics_tabs.risk.stats.calmar_desc":
    "Annualized return divided by maximum drawdown.",
  "portfolio.metrics_tabs.risk.zones.excellent": "EXCELLENT",
  "portfolio.metrics_tabs.risk.zones.acceptable": "ACCEPTABLE",
  "portfolio.metrics_tabs.risk.zones.loss": "LOSS",

  "portfolio.syncing": "(Syncing...)",
  "portfolio.no_assets": "No assets found in the portfolio.",
  "portfolio.subtitle": "Institutional FIFO Engine • Fiscal Year 2026",
  "portfolio.sync_btn": "Sync Portfolio",

  // Metrics
  "metrics.net_equity": "Total Net Equity",
  "metrics.unrealized_pnl": "Unrealized P&L",
  "metrics.realized_pnl": "Realized P&L (Taxable)",

  // KPI Metrics Dashboard
  "metrics.error_loading": "Error loading KPIs:",
  "metrics.roi_total_label": "Total ROI",
  "metrics.roi_delta_desc": "in 24h",
  "metrics.invested_label": "Invested",
  "metrics.max_drawdown_label": "Max Drawdown",
  "metrics.drawdown_delta_desc": "from ATH",
  "metrics.recovered_label": "Recovered",
  "metrics.win_rate_label": "Win Rate",
  "metrics.trades_won": "Won",
  "metrics.trades_lost": "Lost",
  "metrics.trades_total": "Total",
  "metrics.average_r_label": "Average R",
  "metrics.best_worst_label": "Best / Worst",
  "metrics.dispersion_label": "Dispersion",
  "metrics.portfolio": "of Portfolio",
  "metrics.asset_allocation": "Asset Allocation",
  "metrics.distribution": "Distribution",
  "metrics.assets_kicker_upper": "ASSETS",
  "metrics.assets_kicker": "Assets",
  "metrics.assets_kicker_desc":
    "Total number of distinct crypto assets making up your current portfolio.",
  "metrics.hhi_kicker": "HHI",
  "metrics.hhi_kicker_desc":
    "Herfindahl-Hirschman Index. Measures concentration. >2500 indicates high concentration in few assets.",
  "metrics.volatility.kicker": "Volatility Heatmap",
  "metrics.volatility.title": "Daily returns · 15 weeks",
  "metrics.volatility.desc":
    "Each cell is a day. Green = positive return, red = loss, intensity = magnitude.",
  "metrics.volatility.tooltip.date": "Date",
  "metrics.volatility.tooltip.return": "Return",
  "metrics.volatility.stats.daily_avg": "Daily Avg",
  "metrics.volatility.stats.best_day": "Best Day",
  "metrics.volatility.stats.best_day_desc":
    "The highest percentage gain recorded in a single day within the heatmap.",
  "metrics.volatility.stats.worst_day": "Worst Day",
  "metrics.volatility.stats.worst_day_desc":
    "The largest percentage drop recorded in a single day.",
  "metrics.volatility.stats.bullish_days": "Bullish Days",
  "metrics.volatility.stats.bullish_days_desc":
    "Proportion of days that closed with a positive return out of the total days shown.",

  // Token Summary Cards
  "token.balance": "Balance",
  "token.current_value": "Current Value",
  "token.base_cost": "Base Cost",
  "token.unrealized_pnl": "Unrealized PnL",

  // Token Active Lots
  "token.active_lots.title": "Active FIFO Lots (Unsold Units)",
  "token.active_lots.date": "Acquisition Date",
  "token.active_lots.remaining_qty": "Remaining Qty",
  "token.active_lots.buy_price": "Buy Price",
  "token.active_lots.remaining_cost": "Remaining Cost",
  "token.active_lots.status": "Status",
  "token.active_lots.in_portfolio": "In Portfolio",

  // Token Sales History
  "token.sales_history.date": "Date",
  "token.sales_history.sold_qty": "Qty Sold",
  "token.sales_history.sell_price": "Sell Price",
  "token.sales_history.type": "Type",
  "token.sales_history.sold": "Sold",
  "token.sales_history.title": "Sales History & Realized P&L",

  // Expanded Lots Table properties merged below

  // Lot Event History
  "lot_events.date": "Event Date",
  "lot_events.concept": "Concept",
  "lot_events.sell_price": "Sell Price",
  "lot_events.notes": "Notes",
  "lot_events.non_taxable": "Non-Taxable Event",
  "lot_events.badge_activation": "Activation",
  "lot_events.badge_exempt": "Exempt",
  "lot_events.badge_gain": "PROFIT",
  "lot_events.badge_loss": "LOSS",
  "lot_events.affected_amount": "Affected Amt",
  "lot_events.pnl": "P&L (€)",
  "lot_events.non_taxable_desc":
    "This movement does not generate taxable capital gain/loss (LIRPF Art. 33.1).",

  // Tables & Columns
  "table.asset_type_crypto": "Cryptocurrency",
  "table.asset_type_fiat": "Fiat Currency",
  "table.asset": "Asset",
  "table.balance": "Balance",
  "table.avg_cost": "Avg Cost",
  "table.market_value": "Market Value",
  "table.performance": "Performance",
  "table.locations": "Locations",

  // Expanded Lots Table
  "expanded_lots.title": "FIFO Tax Lots (Open)",
  "expanded_lots.date": "Date",
  "expanded_lots.type_status": "Type / Status",
  "expanded_lots.orig_amount": "Orig. Amt",
  "expanded_lots.rest_amount": "Rest. Amt",
  "expanded_lots.location": "Location",
  "expanded_lots.unit_cost": "Unit Cost",
  "expanded_lots.total_cost": "Total Cost",
  "expanded_lots.buy": "BUY",
  "expanded_lots.sold": "SOLD",
  "expanded_lots.ai_insight": "💡 AI Insight",
  "expanded_lots.tax_loss": "Tax-Loss Harvesting",
  "expanded_lots.tax_loss_desc": " before tax closure.",
  "expanded_lots.no_lots": "No detailed tax lots found",
  "expanded_lots.view_history": "View lot history",
  "expanded_lots.unknown_exchange": "Unknown",

  // Lot Status
  "lot_status.open": "OPEN",
  "lot_status.partial": "PARTIAL",
  "lot_status.sold": "SOLD",

  // Token Details
  "token.no_details": "No details available for this asset.",
  "token.details.title": "{symbol} Details",
  "token.details.subtitle": "Complete historical and fiscal breakdown",
  "token.no_active_lots": "No active lots for this asset.",
  "token.no_sales_history": "No sales history.",
  "token.gain_loss": "Gain / Loss",

  // Transaction Types (from MockAdapter etc)
  "tx_type.buy": "Buy",
  "tx_type.sell": "Sell",
  "tx_type.deposit": "Deposit",
  "tx_type.airdrop": "Airdrop",

  // Pagination
  "pagination.prev": "Previous",
  "pagination.next": "Next",
  "pagination.showing": "Showing",
  "pagination.to": "to",
  "pagination.of": "of",
  "pagination.results": "results",
  "pagination.aria_label": "Pagination",

  // Tax Domain
  "tax.title": "Fiscal Report",
  "tax.subtitle": "AEAT IRPF Compliance • Transactions & Tax Report",
  "tax.transactions.title": "Fiscal Transactions",
  "tax.transactions.empty": "No transactions found.",
  "tax.col.date": "Date",
  "tax.col.type": "Type",
  "tax.col.asset": "Asset",
  "tax.col.amount": "Amount",
  "tax.col.price": "Price (€)",
  "tax.col.total": "Total (€)",
  "tax.col.actions": "Actions",
  // Derivatives table columns
  "tax.col.contract": "Contract",
  "tax.col.trade_price": "Trade Price",
  "tax.col.pnl": "PnL (€)",
  "tax.col.fees_funding": "Fees + Funding",
  "tax.col.status": "Status",
  "tax.derivatives.title": "Futures & Derivatives Transactions",
  "tax.derivatives.empty": "No derivatives operations found.",
  "tax.upload.title": "Upload Fiscal File",
  "tax.upload.subtitle":
    "Supports CSV and XLSX from Kraken, Bitvavo, BitUnix, Tangem, and Bit2Me.",
  "tax.upload.btn": "Upload File",
  "tax.upload.uploading": "Uploading...",
  "tax.upload.select": "Select a CSV or XLSX file",
  "tax.import.title": "Blockchain Import",
  "tax.import.subtitle": "Import transactions directly from the public ledger.",
  "tax.import.btn": "Import",
  "tax.import.importing": "Importing...",
  "tax.import.chain_label": "Chain",
  "tax.import.address_placeholder": "Wallet Address / Account ID",
  "tax.delete.btn": "Delete All",
  "tax.delete.confirm":
    "Are you sure? This will permanently delete all tax transactions.",
  "tax.entries": "ENTRIES",

  // Tax Report New Components
  "tax.header.badge": "Compliance Engine",
  "tax.header.sync": "Sync Web3",
  "tax.header.upload": "Upload CSV",
  "tax.wallets.upload": "Upload Wallets",
  "tax.wallets.upload_success": "Wallets updated successfully",
  "tax.wallets.upload_error": "Failed to upload wallets",
  "tax.wallets.all": "All Wallets",
  "tax.wallets.tooltip_title": "CSV Format Required:",
  "tax.header.pending": "Backend integration pending",
  "tax.header.delete_title": "Delete data",

  "tax.summary.capital_gains": "Capital Gains",
  "tax.summary.yields": "Yields",
  "tax.summary.total_losses": "Compensable Losses",
  "tax.summary.estimated_irpf": "Estimated IRPF (Savings Base)",

  "tax.integrity.title": "Fiscal Hospital",
  "tax.integrity.analyzing": "Analyzing data integrity...",
  "tax.integrity.healthy": "Fiscal data is consistent. No anomalies detected.",

  "tax.tabs.ledgers": "Ledgers",
  "tax.tabs.report": "Audit & Reports",
  "tax.tabs.chat": "AI Assistant",
  "tax.tabs.in_development": "(In development)",
  "tax.tabs.spot": "Spot Operations",
  "tax.tabs.futures": "Futures & Derivatives",
  "tax.tabs.spot_ledger": "Spot Ledger",
  "tax.tabs.futures_ledger": "Futures Ledger",
  "tax.tabs.spot_dev": "SPOT OPERATIONS IN DEVELOPMENT (Year Filter: {year})",
  "tax.tabs.futures_dev":
    "FUTURES & DERIVATIVES IN DEVELOPMENT (Year Filter: {year})",
  "tax.tabs.chat_dev": "AI ASSISTANT IN DEVELOPMENT",
  "tax.filters.year": "Year",
  "tax.filters.all": "All",

  // Tax Audit Report Tab (TaxFiscalControls + TaxReportDetailsTable)
  "tax.audit.fiscal_year": "Fiscal Year",
  "tax.audit.method": "Calculation Method",
  "tax.audit.method_fifo": "FIFO (First In, First Out)",
  "tax.audit.recalculate": "Recalculate",
  "tax.audit.recalculating": "Recalculating...",
  "tax.audit.download_report": "Download Report",
  "tax.audit.downloading": "Downloading...",
  "tax.audit.download_pdf": "PDF",
  "tax.audit.download_csv": "CSV",
  "tax.audit.controls_title": "Calculation Parameters",
  "tax.audit.controls_desc":
    "Fiscal year and FIFO method for AEAT audit book generation.",

  // Audit Trail Table
  "tax.audit.table_title": "FIFO Traceability Ledger (AEAT Audit)",
  "tax.audit.table_empty": "No data available for the selected fiscal year.",
  "tax.audit.table_loading": "Generating Audit Ledger...",
  "tax.audit.col_date": "Date",
  "tax.audit.col_operation": "Operation",
  "tax.audit.col_asset": "Asset",
  "tax.audit.col_exchange": "Exchange",
  "tax.audit.col_amount": "Units",
  "tax.audit.col_sale_price": "Sale Price",
  "tax.audit.col_gain_loss": "P&L",
  "tax.audit.col_fee": "Fee (€)",
  "tax.audit.col_taxable": "Taxable",
  "tax.audit.col_notes": "Traceability",
  "tax.audit.taxable_yes": "YES",
  "tax.audit.taxable_no": "NO",
  "tax.audit.badge_gain": "GAIN",
  "tax.audit.badge_loss": "LOSS",
  "tax.audit.badge_exempt": "EXEMPT",
  "tax.audit.badge_activation": "RESERVE",

  // Vault Settings
  "vault.title": "Local Secrets Vault",
  "vault.subtitle": "AES-256-GCM Cryptographic Vault",
  "vault.locked.title": "Vault Locked",
  "vault.locked.desc":
    "Enter your master password to unlock and access your local credentials.",
  "vault.locked.password_placeholder": "Master password",
  "vault.locked.unlock_btn": "Unlock Vault",
  "vault.unlocked.title": "Vault Unlocked",
  "vault.unlocked.desc":
    "Your vault is unlocked. You can securely manage your integration keys below.",

  // Vault Dynamic Providers
  "vault.provider.generic.description":
    "Configure the credentials for {providerName}.",
  "vault.provider.generic.fields.format_title":
    "Only alphanumeric characters and basic symbols (-_+=/.) are allowed",
  "vault.provider.generic.fields.apiKey.label": "API Key",
  "vault.provider.generic.fields.apiSecret.label": "API Secret",

  "vault.errors.invalid_format":
    "Invalid format: Unallowed characters detected",
  "vault.errors.invalid_password": "The provided password is incorrect",
  "vault.errors.unknown_provider": "The specified provider is not valid",
  "vault.errors.unlock_failed": "Failed to unlock vault",
  "vault.errors.save_failed": "Failed to save credentials",
  "vault.errors.toggle_failed": "Failed to change provider status",
  "vault.success.unlocked": "Vault unlocked successfully",
  "vault.success.saved": "Credentials saved securely",

  // Vault Status & Actions
  "vault.provider.status.configured": "Linked",
  "vault.provider.status.not_configured": "Unlinked",
  "vault.actions.save": "Save",
};

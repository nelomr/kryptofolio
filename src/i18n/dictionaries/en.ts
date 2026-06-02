import type { I18nDictionary } from '@/core/domain/models/I18nDictionary';

export const en: I18nDictionary = {
  'dashboard.title': 'Kryptofolio',
  'dashboard.greeting': 'Hello {name}',
  'navbar.portfolio': 'Portfolio',
  'navbar.settings': 'Settings',
  'navbar.logout': 'Logout',
  'portfolio.roi': 'Total ROI',
  'portfolio.invested': 'Invested Capital',

  // Portfolio Header
  'portfolio.analytics': 'Analytics',
  'portfolio.syncing': '(Syncing...)',
  'portfolio.no_assets': 'No assets found in the portfolio.',
  'portfolio.subtitle': 'Institutional FIFO Engine • Fiscal Year 2026',
  'portfolio.sync_btn': 'Sync Portfolio',
  
  // Metrics
  'metrics.net_equity': 'Total Net Equity',
  'metrics.unrealized_pnl': 'Unrealized P&L',
  'metrics.realized_pnl': 'Realized P&L (Taxable)',

  // Token Summary Cards
  'token.balance': 'Balance',
  'token.current_value': 'Current Value',
  'token.base_cost': 'Base Cost',
  'token.unrealized_pnl': 'Unrealized PnL',

  // Token Active Lots
  'token.active_lots.title': 'Active FIFO Lots (Unsold Units)',
  'token.active_lots.date': 'Acquisition Date',
  'token.active_lots.remaining_qty': 'Remaining Qty',
  'token.active_lots.buy_price': 'Buy Price',
  'token.active_lots.remaining_cost': 'Remaining Cost',
  'token.active_lots.status': 'Status',
  'token.active_lots.in_portfolio': 'In Portfolio',

  // Token Sales History
  'token.sales_history.date': 'Date',
  'token.sales_history.sold_qty': 'Qty Sold',
  'token.sales_history.sell_price': 'Sell Price',
  'token.sales_history.type': 'Type',
  'token.sales_history.sold': 'Sold',
  'token.sales_history.title': 'Sales History & Realized P&L',

  // Expanded Lots Table properties merged below

  // Lot Event History
  'lot_events.date': 'Event Date',
  'lot_events.concept': 'Concept',
  'lot_events.sell_price': 'Sell Price',
  'lot_events.notes': 'Notes',
  'lot_events.non_taxable': 'Non-Taxable Event',
  'lot_events.badge_activation': 'Activation',
  'lot_events.badge_exempt': 'Exempt',
  'lot_events.badge_gain': 'PROFIT',
  'lot_events.badge_loss': 'LOSS',
  'lot_events.affected_amount': 'Affected Amt',
  'lot_events.pnl': 'P&L (€)',
  'lot_events.non_taxable_desc': 'This movement does not generate taxable capital gain/loss (LIRPF Art. 33.1).',

  // Tables & Columns
  'table.asset_type_crypto': 'Cryptocurrency',
  'table.asset': 'Asset',
  'table.balance': 'Balance',
  'table.avg_cost': 'Avg Cost',
  'table.market_value': 'Market Value',
  'table.performance': 'Performance',
  'table.locations': 'Locations',
  
  // Expanded Lots Table
  'expanded_lots.title': 'FIFO Tax Lots (Open)',
  'expanded_lots.date': 'Date',
  'expanded_lots.type_status': 'Type / Status',
  'expanded_lots.orig_amount': 'Orig. Amt',
  'expanded_lots.rest_amount': 'Rest. Amt',
  'expanded_lots.location': 'Location',
  'expanded_lots.unit_cost': 'Unit Cost',
  'expanded_lots.total_cost': 'Total Cost',
  'expanded_lots.buy': 'BUY',
  'expanded_lots.sold': 'SOLD',
  'expanded_lots.ai_insight': '💡 AI Insight',
  'expanded_lots.tax_loss': 'Tax-Loss Harvesting',
  'expanded_lots.tax_loss_desc': ' before tax closure.',
  'expanded_lots.no_lots': 'No detailed tax lots found',
  'expanded_lots.view_history': 'View lot history',
  'expanded_lots.unknown_exchange': 'Unknown',
  
  // Lot Status
  'lot_status.open': 'OPEN',
  'lot_status.partial': 'PARTIAL',
  'lot_status.sold': 'SOLD',
  
  // Token Details
  'token.no_details': 'No details available for this asset.',
  'token.details.title': '{symbol} Details',
  'token.details.subtitle': 'Complete historical and fiscal breakdown',
  'token.no_active_lots': 'No active lots for this asset.',
  'token.no_sales_history': 'No sales history.',
  'token.gain_loss': 'Gain / Loss',

  // Transaction Types (from MockAdapter etc)
  'tx_type.buy': 'Buy',
  'tx_type.sell': 'Sell',
  'tx_type.deposit': 'Deposit',
  'tx_type.airdrop': 'Airdrop',

  // Pagination
  'pagination.prev': 'Previous',
  'pagination.next': 'Next',
  'pagination.showing': 'Showing',
  'pagination.to': 'to',
  'pagination.of': 'of',
  'pagination.results': 'results',
  'pagination.aria_label': 'Pagination',

  // Tax Domain
  'tax.title': 'Fiscal Report',
  'tax.subtitle': 'AEAT IRPF Compliance • Transactions & Tax Report',
  'tax.transactions.title': 'Fiscal Transactions',
  'tax.transactions.empty': 'No transactions found.',
  'tax.col.date': 'Date',
  'tax.col.type': 'Type',
  'tax.col.asset': 'Asset',
  'tax.col.amount': 'Amount',
  'tax.col.price': 'Price (€)',
  'tax.col.total': 'Total (€)',
  'tax.col.actions': 'Actions',
  'tax.upload.title': 'Upload Fiscal File',
  'tax.upload.subtitle': 'Supports CSV and XLSX from Kraken, Bitvavo, BitUnix, Tangem, and Bit2Me.',
  'tax.upload.btn': 'Upload File',
  'tax.upload.uploading': 'Uploading...',
  'tax.upload.select': 'Select a CSV or XLSX file',
  'tax.import.title': 'Blockchain Import',
  'tax.import.subtitle': 'Import transactions directly from the public ledger.',
  'tax.import.btn': 'Import',
  'tax.import.importing': 'Importing...',
  'tax.import.chain_label': 'Chain',
  'tax.import.address_placeholder': 'Wallet Address / Account ID',
  'tax.delete.btn': 'Delete All',
  'tax.delete.confirm': 'Are you sure? This will permanently delete all tax transactions.',
  'tax.entries': 'ENTRIES',
};

export const MOCK_TRANSACTIONS = [
  {
    id: 'tx-001',
    tx_type: 'BUY',
    asset_in: 'BTC',
    amount_in: 0.5,
    total_eur: 20000,
    price_eur: 40000,
    fee_eur: 5,
    timestamp: '2023-01-01T10:00:00Z',
    exchange: 'Kraken',
  },
  {
    id: 'tx-002',
    tx_type: 'BUY',
    asset_in: 'ETH',
    amount_in: 10,
    total_eur: 15000,
    price_eur: 1500,
    fee_eur: 4.5,
    timestamp: '2023-02-01T09:15:00Z',
    exchange: 'Binance',
  },
  {
    id: 'tx-003',
    tx_type: 'BUY',
    asset_in: 'SOL',
    amount_in: 200,
    total_eur: 4000,
    price_eur: 20,
    fee_eur: 2,
    timestamp: '2023-07-01T14:30:00Z',
    exchange: 'Binance',
  },
  {
    id: 'tx-004',
    tx_type: 'BUY',
    asset_in: 'ADA',
    amount_in: 5000,
    total_eur: 5000,
    price_eur: 1.0,
    fee_eur: 1.5,
    timestamp: '2023-09-01T11:00:00Z',
    exchange: 'Bit2Me',
  },
  {
    id: 'tx-005',
    tx_type: 'SELL',
    asset_out: 'SOL',
    amount_out: 100,
    total_eur: 5000,
    price_eur: 50,
    fee_eur: 5,
    timestamp: '2023-12-12T09:00:00Z',
    exchange: 'Binance',
  }
];

export const MOCK_TAX_REPORT = {
  year: 2024,
  method: 'FIFO',
  summary: {
    capital_gains_eur: 3000, // From SOL sale
    capital_losses_eur: 0,
    savings_base_yields_eur: 35,
    general_base_airdrops_eur: 0,
    net_patrimonial_result_eur: 3000,
    estimated_irpf_eur: 570, // 19% of 3000
  },
  audit_trail: [
    {
      id: 'lot-evt-001',
      disposal_date: '2023-12-12T09:00:00Z',
      amount_from_lot: 100,
      sale_price_eur: 5000,
      gain_loss_eur: 3000,
      sale_fee_eur: 5,
      is_taxable: true,
      notes: 'FIFO: Lot tx-003 partial (100 SOL @ 20 EUR cost)',
      asset_symbol: 'SOL',
      asset_logo_uri: '/crypto-icons/sol.svg',
      exchange_name: 'Binance',
      exchange_logo_uri: '/exchange-icons/binance.svg',
      operation_type: 'SELL',
    }
  ],
};

export const MOCK_FUTURES_TRANSACTIONS = [
  {
    id: 'f-tx-001',
    tx_type: 'FUTURES_TRADE',
    asset_in: 'BTC',
    amount_in: 1,
    total_eur: 0,
    price_eur: 60000,
    fee_eur: 15,
    timestamp: '2023-11-01T10:00:00Z',
    exchange: 'Kraken Futures',
  },
  {
    id: 'f-tx-002',
    tx_type: 'FUTURES_TRADE',
    asset_in: 'ETH',
    amount_in: 10,
    total_eur: 0,
    price_eur: 2500,
    fee_eur: 5,
    timestamp: '2023-12-05T14:30:00Z',
    exchange: 'Kraken Futures',
  },
  {
    id: 'f-tx-003',
    tx_type: 'FUTURES_TRADE',
    asset_in: 'SOL',
    amount_in: 50,
    total_eur: 0,
    price_eur: 120,
    fee_eur: 2.5,
    timestamp: '2024-01-10T09:15:00Z',
    exchange: 'Binance Futures',
  }
];

export const MOCK_FUTURES_DERIVATIVES = [
  {
    id: 'deriv-001',
    tx_type: 'FUTURES_TRADE',
    symbol: 'pf_btcusd', 
    amount: 1,          
    realized_pnl: 500,        
    trade_price: 60000,      
    fee_eur: 15,           
    timestamp: '2023-11-02T15:00:00Z',
    exchange: 'Kraken Futures',
    status: 'CLOSED'
  },
  {
    id: 'deriv-002',
    tx_type: 'FUTURES_TRADE',
    symbol: 'pf_ethusd',
    amount: 10,
    realized_pnl: -200,
    trade_price: 2550,
    fee_eur: 5,
    timestamp: '2023-12-06T10:00:00Z',
    exchange: 'Kraken Futures',
    status: 'CLOSED'
  },
  {
    id: 'deriv-003',
    tx_type: 'FUTURES_TRADE',
    symbol: 'pf_solusd',
    amount: 50,
    realized_pnl: 1200,
    trade_price: 140,
    fee_eur: 2.5,
    timestamp: '2024-01-15T16:45:00Z',
    exchange: 'Binance Futures',
    status: 'OPEN'
  }
];

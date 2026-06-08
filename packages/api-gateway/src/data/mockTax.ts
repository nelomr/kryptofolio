export const MOCK_TRANSACTIONS = [
  {
    id: 'tx-001',
    type: 'BUY',
    symbol: 'BTC',
    amount: 0.5,
    totalEur: 10000,
    priceEur: 20000,
    feeEur: 5,
    timestamp: '2023-01-01T10:00:00Z',
    exchange: 'Kraken',
  },
  {
    id: 'tx-002',
    type: 'BUY',
    symbol: 'BTC',
    amount: 0.0432,
    totalEur: 1144.80,
    priceEur: 26500,
    feeEur: 2,
    timestamp: '2023-07-01T09:15:00Z',
    exchange: 'Bit2Me',
  },
  {
    id: 'tx-003',
    type: 'BUY',
    symbol: 'ETH',
    amount: 4.5,
    totalEur: 8100,
    priceEur: 1800,
    feeEur: 4.05,
    timestamp: '2023-02-01T09:15:00Z',
    exchange: 'Binance',
  }
];

export const MOCK_TAX_REPORT = {
  year: 2024,
  method: 'FIFO',
  summary: {
    capitalGainsEur: 1800,
    capitalLossesEur: 300,
    savingsBaseYieldsEur: 35,
    generalBaseAirdropsEur: 0,
    netPatrimonialResultEur: 1500,
    estimatedIrpfEur: 285,
  },
  auditTrail: [
    {
      id: 'lot-evt-001',
      disposalDate: '2024-03-20T14:30:00Z',
      amountFromLot: 0.1,
      salePriceEur: 62000,
      gainLossEur: 1200,
      saleFeeEur: 3.1,
      isTaxable: true,
      notes: 'FIFO: Lot tx-001 partial (0.1 BTC @ 50000 EUR cost)',
      assetSymbol: 'BTC',
      assetLogoUri: '/crypto-icons/btc.svg',
      exchangeName: 'Kraken',
      exchangeLogoUri: '/exchange-icons/kraken.svg',
      operationType: 'SELL',
    }
  ],
};

export const MOCK_FUTURES_TRANSACTIONS = [
  {
    id: 'f-tx-001',
    type: 'FUTURES_TRADE',
    symbol: 'BTC',
    amount: 1,
    totalEur: 0,
    priceEur: 60000,
    feeEur: 15,
    timestamp: '2023-11-01T10:00:00Z',
    exchange: 'Kraken Futures',
  }
];

export const MOCK_FUTURES_DERIVATIVES = [
  {
    id: 'deriv-001',
    type: 'FUTURES_TRADE',
    contractSymbol: 'pf_btcusd',
    underlyingAsset: 'btc',
    amount: 1,
    tradePrice: 60000,
    realizedPnl: 500,
    fees: 15,
    funding: -5,
    timestamp: '2023-11-02T15:00:00Z',
    exchange: 'Kraken Futures',
    status: 'CLOSED'
  }
];

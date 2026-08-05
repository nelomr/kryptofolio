/**
 * Rows read verbatim from the user's own exports, one representative row (or pair) per source that
 * carries a fee — the digit-for-digit net exists to catch fee/quantity loss, and a fee-free row
 * proves nothing about that. Cross-checked against `realSourceRows.ts` in `packages/core-domain`,
 * which was itself verified against the real files at
 * `/Users/nelo/proyectos/AgenteIA/cripto-proyect/listadoTransacciones` before this file was written —
 * every value below matches that verification, digit for digit.
 */

/** `kraken_spot.csv` — one trade, both legs, each carrying its own fee in its own asset. */
export const KRAKEN_SPOT_HEADERS = [
  'txid', 'refid', 'time', 'type', 'subtype', 'aclass', 'subclass', 'asset', 'wallet', 'amount', 'fee', 'balance',
] as const;

export const KRAKEN_SPOT_TRADE_EUR_LEG = {
  txid: 'L5XP4H-3LJWR-CW7WT2',
  refid: 'TUOS3K-XAE5A-4KPZEA',
  time: '2025-10-10 21:51:47',
  type: 'trade',
  subtype: 'tradespot',
  aclass: 'currency',
  subclass: 'fiat',
  asset: 'EUR',
  wallet: 'spot / main',
  amount: '-326.3115',
  fee: '0',
  balance: '0.0078',
} as const;

export const KRAKEN_SPOT_TRADE_PLUME_LEG = {
  txid: 'LDTWPD-ZTSJJ-46OCME',
  refid: 'TUOS3K-XAE5A-4KPZEA',
  time: '2025-10-10 21:51:47',
  type: 'trade',
  subtype: 'tradespot',
  aclass: 'currency',
  subclass: 'crypto',
  asset: 'PLUME',
  wallet: 'spot / main',
  amount: '5393.57839',
  fee: '13.48397',
  balance: '7425.85156',
} as const;

/**
 * `kraken_spot.csv`'s `TZ7N3Z-O5Z5O-ODPRUX` group: a trade whose EUR leg *and* whose ENA leg each
 * state their own non-zero fee, in two different currencies. `LedgerSpotTransaction` has one
 * `fee_amount`/`fee_asset_id` pair, so this pair's EUR-side fee (`1.0210`) is not persisted anywhere —
 * only the ENA-side fee survives. Balance confirms the source really did charge both: `500.0000`
 * (prior balance) − `495.5398` (amount) − `1.0210` (EUR fee) = `3.4392`, the row's own stated balance.
 * Kept here as a named, measured gap rather than folded into the passing net, per this net's own
 * purpose: certify what the pipeline gets right, and name what it does not, rather than picking a
 * fixture that never exercises the question.
 */
export const KRAKEN_SPOT_DOUBLE_FEE_EUR_LEG = {
  txid: 'LRIU6S-CYGNG-PJVXPP',
  refid: 'TZ7N3Z-O5Z5O-ODPRUX',
  time: '2025-10-02 09:51:00',
  type: 'trade',
  subtype: 'tradespot',
  aclass: 'currency',
  subclass: 'fiat',
  asset: 'EUR',
  wallet: 'spot / main',
  amount: '-495.5398',
  fee: '1.0210',
  balance: '3.4392',
} as const;

export const KRAKEN_SPOT_DOUBLE_FEE_ENA_LEG = {
  txid: 'LVKBSX-D3VTL-MAK5VH',
  refid: 'TZ7N3Z-O5Z5O-ODPRUX',
  time: '2025-10-02 09:51:00',
  type: 'trade',
  subtype: 'tradespot',
  aclass: 'currency',
  subclass: 'crypto',
  asset: 'ENA',
  wallet: 'spot / main',
  amount: '959.50873',
  fee: '1.86123',
  balance: '957.64750',
} as const;

/** `kraken_futures.csv` — a `futures trade` row settling its fee in the `usd` collateral. */
export const KRAKEN_FUTURES_HEADERS = [
  'uid', 'dateTime', 'account', 'type', 'symbol', 'contract', 'change', 'new balance',
  'new average entry price', 'trade price', 'mark price', 'funding rate', 'realized pnl', 'fee',
  'realized funding', 'collateral', 'conversion spread percentage', 'liquidation fee', 'position uid',
] as const;

export const KRAKEN_FUTURES_TRADE_ROW = {
  uid: '4a19ac39-1091-43bb-bea3-98bf98c82061',
  dateTime: '2026-02-08 16:42:52',
  account: 'flex',
  type: 'futures trade',
  symbol: 'usd',
  contract: 'pf_xrpusd',
  change: '-3.81000000000',
  'new balance': '0.00000000000',
  'new average entry price': '',
  'trade price': '1.42319000000000000000',
  'mark price': '1.42372579167000000000',
  'funding rate': '-0.000028384605269555',
  'realized pnl': '-3.65210000000',
  fee: '0.16440000000',
  'realized funding': '0.00650000000',
  collateral: '',
  'conversion spread percentage': '',
  'liquidation fee': '',
  'position uid': '',
} as const;

/** `bitvavo_spot.csv` — a `buy` row: quantity, quote total and fee all in different combinations. */
export const BITVAVO_HEADERS = [
  'Timezone', 'Date', 'Time', 'Type', 'Currency', 'Amount', 'Quote Currency', 'Quote Price',
  'Received / Paid Currency', 'Received / Paid Amount', 'Fee currency', 'Fee amount', 'Status',
  'Transaction ID', 'Address',
] as const;

export const BITVAVO_BUY_ROW = {
  Timezone: 'Europe/Madrid',
  Date: '2026-02-05',
  Time: '16:29:01.408',
  Type: 'buy',
  Currency: 'ETH',
  Amount: '0.30338',
  'Quote Currency': 'EUR',
  'Quote Price': '1645',
  'Received / Paid Currency': 'EUR',
  'Received / Paid Amount': '-499.81',
  'Fee currency': 'EUR',
  'Fee amount': '0.7499',
  Status: 'Completed',
  'Transaction ID': 'a00b3738-8d5e-4cee-b074-33a3d074ff77',
  Address: '',
} as const;

/** `bitunix_spot.csv` — the on-chain withdrawal, the file's only row with a stated fee. */
export const BITUNIX_HEADERS = [
  'Date (UTC)', 'Label', 'Outgoing Asset', 'Outgoing Amount', 'Incoming Asset', 'Incoming Amount',
  'Fee Asset', 'Fee Amount', 'Trx. ID', 'Comment',
] as const;

export const BITUNIX_WITHDRAW_ROW = {
  'Date (UTC)': '2025-12-13 22:03:31',
  Label: 'Withdraw',
  'Outgoing Asset': 'ADA',
  'Outgoing Amount': '546.844684',
  'Incoming Asset': '',
  'Incoming Amount': '0',
  'Fee Asset': 'ADA',
  'Fee Amount': '1',
  'Trx. ID': 'T0010',
  Comment: 'On-chain Withdraw',
} as const;

/** `tangem_activacion_xrp.csv` — its only row. */
export const TANGEM_HEADERS = ['Date', 'Type', 'Asset', 'Amount', 'Fee', 'Notes'] as const;

export const TANGEM_ACTIVATION_ROW = {
  Date: '2025-06-03 10:01:00 UTC',
  Type: 'WALLET_ACTIVATION',
  Asset: 'XRP',
  Amount: '1.0',
  Fee: '0.0',
  Notes: 'Tangem Base Reserve',
} as const;

/** `bit2me_spot_2025.xlsx` — a `Trade` row (fee stated in the destination asset). */
export const BIT2ME_HEADERS = [
  'Tipo de operación', 'Cantidad de destino', 'Moneda de destino', 'Cantidad de origen',
  'Moneda de origen', 'Comisión de la operación', 'Moneda de la comisión', 'Exchange', 'Grupo',
  'Descripción', 'Fecha',
] as const;

export const BIT2ME_TRADE_ROW = {
  'Tipo de operación': 'Trade',
  'Cantidad de destino': '1923.81685263',
  'Moneda de destino': 'JASMY',
  'Cantidad de origen': '50',
  'Moneda de origen': 'EUR',
  'Comisión de la operación': '9.57098884',
  'Moneda de la comisión': 'JASMY',
  Exchange: 'Bit2Me',
  Grupo: 'trading',
  Descripción: 'trading 0aa9ba9c-dbe3-49e7-95bb-172a7b5a8b7d',
  Fecha: '2025-01-19 22:49',
} as const;

/** `bit2me_spot_2025.xlsx` — a `Withdrawal` row (D21: fee is the origen/destino gap, not the stated column). */
export const BIT2ME_WITHDRAWAL_ROW = {
  'Tipo de operación': 'Withdrawal',
  'Cantidad de destino': '1.536429',
  'Moneda de destino': 'HBAR',
  'Cantidad de origen': '2.236429',
  'Moneda de origen': 'HBAR',
  'Comisión de la operación': '0.210620368',
  'Moneda de la comisión': 'EUR',
  Exchange: 'Bit2Me',
  Grupo: 'blockchain',
  Descripción: 'wallet b83277f8-77d5-4591-a47e-309e35b4b779 tx_hash:0.0.734891-1738248739-028188115',
  Fecha: '2025-01-30 14:52',
} as const;

import type { TransactionRow, InvalidTransactionRow, TransactionMappedData } from "@kryptofolio/shared-types";
import { getTransactionMappedDataSchema } from "@kryptofolio/shared-types";

export const COLUMN_DICTIONARY: Record<string, string[]> = {
  // Identificadores y Agrupamiento
  tx_id: ["txid", "transaction id", "hash", "order id", "uid", "trade id", "trx. id"],
  group_id: ["refid", "reference", "group", "grupo", "linked tx"],
  
  // Base
  date: ["date", "fecha", "timestamp", "utc_time", "datetime", "date (utc)", "time"], // Separated from time
  time: ["hora"],
  timezone: ["timezone", "tz", "zona horaria", "time zone"],
  tx_type: ["type", "tipo", "tipo de operación", "action", "acción", "operation", "ordertype", "side"],
  exchange: ["exchange", "platform", "venue"],
  description: ["description", "descripción", "notes", "memo", "remark2", "misc", "comment"],
  status: ["status", "estado", "state"],
  source_address: ["source_address", "source address", "address in", "dirección origen"],
  destination_address: ["destination_address", "destination address", "address out", "dirección destino", "address"],
  balance: ["balance", "saldo", "new balance"],
  
  // Fallback
  amount: ["amount", "cantidad", "size", "vol", "volume", "change", "quantity transacted"],
  asset: ["asset", "coin", "currency", "token", "moneda", "underlying"],
  
  // Direccionales (Spot)
  amount_in: ["amount in", "buy amount", "received amount", "cantidad recibida", "cantidad de destino", "incoming amount"],
  asset_in: ["asset in", "buy asset", "received asset", "moneda recibida", "moneda de destino", "incoming asset"],
  amount_out: ["amount out", "sell amount", "sent amount", "paid amount", "cantidad enviada", "cantidad pagada", "cantidad de origen", "outgoing amount"],
  asset_out: ["asset out", "sell asset", "sent asset", "moneda enviada", "moneda pagada", "moneda de origen", "outgoing asset"],
  
  // Fiat / Quote
  total_fiat: ["total", "value", "quote amount", "fiat amount", "total eur", "received / paid amount", "received/paid amount", "cost", "subtotal", "total (inclusive of fees)"],
  price_fiat: ["price", "precio", "spot price", "quote price", "trade price", "spot price at transaction"],
  quote_currency: ["quote asset", "quote currency", "spot price currency"],
  fiat_currency: ["fiat currency", "fiat", "received / paid currency", "received/paid currency"],
  
  // Fees
  fee_amount: ["fee", "comisión", "comision", "fee amount", "comisión de la operación", "fees and/or spread"],
  fee_currency: ["fee asset", "fee currency", "fee coin", "moneda comision", "moneda de la comisión"],
  
  // Futuros
  symbol: ["symbol", "contract", "pair", "par"],
  realized_pnl: ["pnl", "realized pnl", "profit", "beneficio"],
  pnl_currency: ["pnl asset", "pnl currency"],
  funding_amount: ["funding", "realized funding", "funding fee", "funding rate"],
  funding_currency: ["funding asset", "funding currency"],

  // Metadata passthrough
  metadata: [],
};

export function getAvailableColumns(): string[] {
  return Object.keys(COLUMN_DICTIONARY);
}

/**
 * Returns the best generic mapping for an array of headers.
 */
export function guessColumnMapping(headers: string[]): Record<string, string | null> {
  const usedProps = new Set<string>();

  return headers.reduce((mapping, header) => {
    const matchedEntry = Object.entries(COLUMN_DICTIONARY).find(([, patterns]) =>
      patterns.some((pattern) => pattern.toLowerCase() === header.trim().toLowerCase())
    );

    const matchedProp = matchedEntry?.[0];

    if (matchedProp && !usedProps.has(matchedProp)) {
      mapping[header] = matchedProp;
      usedProps.add(matchedProp);
    } else {
      mapping[header] = "metadata";
    }

    return mapping;
  }, {} as Record<string, string | null>);
}

export function validateRow(row: TransactionRow, marketType: 'SPOT' | 'FUTURES' = 'SPOT'): TransactionRow {
  const schema = getTransactionMappedDataSchema(marketType);
  const parsed = schema.safeParse(row.mappedData);

  if (parsed.success) {
    return {
      ...row,
      mappedData: parsed.data,
      errors: [],
      hasError: false,
    };
  }

  const errors = parsed.error.errors.map((err) => `${err.path[0]}: ${err.message}`);

  return {
    ...row,
    errors,
    hasError: true,
  };
}

export function mapToEntity(
  originalRow: Record<string, unknown>,
  mapping: Record<string, string | null>, // sourceHeader -> targetProp
  index: number,
  marketType: 'SPOT' | 'FUTURES' = 'SPOT'
): TransactionRow {
  const mappedData: Record<string, any> = {
    // Initialized explicitly to match backend schema optionally
    metadata: {},
  };

  for (const [sourceHeader, targetProp] of Object.entries(mapping)) {
    const value = originalRow[sourceHeader];
    if (value === undefined || value === null) continue;

    if (targetProp === null || targetProp === "metadata") {
      mappedData.metadata[sourceHeader] = String(value);
    } else {
      mappedData[targetProp] = String(value);
    }
  }

  const row: InvalidTransactionRow = {
    id: `row-${Date.now()}-${index}`,
    originalData: originalRow,
    mappedData: mappedData as Partial<TransactionMappedData>,
    errors: [],
    hasError: true,
  };

  return validateRow(row, marketType);
}

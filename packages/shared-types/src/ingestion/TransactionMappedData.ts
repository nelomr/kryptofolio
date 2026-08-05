import { z } from 'zod';
import { FISCAL_CLASSIFICATION_FLAGS } from '../schemas/fifo-policy.js';

export const BaseTransactionMappedDataSchema = z.object({
  // Identifiers & Grouping
  tx_id: z.string().nullable().optional(),
  group_id: z.string().nullable().optional(),
  /**
   * Links the two legs of one physical custody movement, once the source's own reference has been
   * validated to behave like one — same instant, at most two legs. Never set from a category column.
   */
  transfer_group_id: z.string().nullable().optional(),
  account_id: z.string().nullable().optional(),
  
  // Base Fields
  date: z.string().nullable().optional(),
  time: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
  timestamp: z.string().nullable().optional(),
  tx_type: z.string({ required_error: 'ingestion.errors.tx_type_required' }).min(1, 'ingestion.errors.tx_type_required').nullable(),
  exchange: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  source_address: z.string().nullable().optional(),
  destination_address: z.string().nullable().optional(),
  balance: z.string()
    .refine((val) => val === '' || !isNaN(Number(val)), { message: 'ingestion.errors.amount_invalid' })
    .nullable()
    .optional(),
  
  // Generic fallback for mapping
  amount: z.string()
    .refine((val) => val === '' || !isNaN(Number(val)), { message: 'ingestion.errors.amount_invalid' })
    .nullable()
    .optional(),
  asset: z.string().nullable().optional(),
  
  // Spot: Directional Assets
  asset_in: z.string().nullable().optional(),
  amount_in: z.string()
    .refine((val) => val === '' || !isNaN(Number(val)), { message: 'ingestion.errors.amount_invalid' })
    .nullable()
    .optional(),
  asset_out: z.string().nullable().optional(),
  amount_out: z.string()
    .refine((val) => val === '' || !isNaN(Number(val)), { message: 'ingestion.errors.amount_invalid' })
    .nullable()
    .optional(),
  
  // Fiat / Quote
  total_fiat: z.string()
    .refine((val) => val === '' || !isNaN(Number(val)), { message: 'ingestion.errors.amount_invalid' })
    .nullable()
    .optional(),
  price_fiat: z.string()
    .refine((val) => val === '' || !isNaN(Number(val)), { message: 'ingestion.errors.amount_invalid' })
    .nullable()
    .optional(),
  quote_currency: z.string().nullable().optional(),
  fiat_currency: z.string().nullable().optional(),
  
  // Fees
  fee_amount: z.string()
    .refine((val) => val === '' || !isNaN(Number(val)), { message: 'ingestion.errors.amount_invalid' })
    .nullable()
    .optional(),
  fee_currency: z.string().nullable().optional(),
  
  // Futures
  symbol: z.string().nullable().optional(),
  realized_pnl: z.string()
    .refine((val) => val === '' || !isNaN(Number(val)), { message: 'ingestion.errors.amount_invalid' })
    .nullable()
    .optional(),
  pnl_currency: z.string().nullable().optional(),
  funding_amount: z.string()
    .refine((val) => val === '' || !isNaN(Number(val)), { message: 'ingestion.errors.amount_invalid' })
    .nullable()
    .optional(),
  funding_currency: z.string().nullable().optional(),
  
  /**
   * Fiscal classification the canonical `tx_type` cannot express, resolved from the source label.
   *
   * Separate from `tx_type` because the two answer different questions: `tx_type` says what the
   * engine must do with the amounts, this says what kind of operation the user performed. A wallet
   * activation acquires an asset like any other acquisition and still has to be reportable as an
   * activation.
   */
  fiscal_flag: z.enum(FISCAL_CLASSIFICATION_FLAGS).nullable().optional(),

  // Preserved Extra Metadata
  metadata: z.record(z.string(), z.string()).optional().default({}),
});

export type TransactionMappedData = z.infer<typeof BaseTransactionMappedDataSchema>

export const getTransactionMappedDataSchema = (marketType: 'SPOT' | 'FUTURES' = 'SPOT') => 
  BaseTransactionMappedDataSchema.superRefine((data, ctx) => {
    // Ensure we have some form of time data
    const hasTimeData = !!data.date || !!data.timestamp;
    if (!hasTimeData) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["date"],
        message: "ingestion.errors.time_data_missing",
      });
    }

    if (marketType === 'FUTURES') {
      // Futures Validation
      // Use fallback between symbol and asset if either is missing, since CSVs may map them interchangeably
      const asset = data.asset || data.symbol;
      const symbol = data.symbol || data.asset;

      // 1. Trade operation
      const hasTrade = !!data.amount && !!symbol && !!data.price_fiat && !!asset;
      
      // 2. PnL settlement (inherit quote_currency or asset/symbol if pnl_currency is missing)
      const pnlCurrency = data.pnl_currency || data.quote_currency || asset;
      const hasPnl = !!data.realized_pnl && !!pnlCurrency;
      
      // 3. Funding settlement
      const fundingCurrency = data.funding_currency || data.quote_currency || asset;
      const hasFunding = !!data.funding_amount && !!fundingCurrency;

      // 4. Generic movement (transfer, conversion, deposit, withdrawal, collateral)
      const hasMovement = !!data.amount && !!asset;

      if (!hasTrade && !hasPnl && !hasFunding && !hasMovement) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["amount"],
          message: "ingestion.errors.financial_data_missing",
        });
      }
    } else {
      // Spot Validation
      const hasGeneric = !!data.amount && !!data.asset;
      const hasIn = !!data.amount_in && !!data.asset_in;
      const hasOut = !!data.amount_out && !!data.asset_out;
      const hasFiat = !!data.total_fiat && !!data.fiat_currency;

      if (!hasGeneric && !hasIn && !hasOut && !hasFiat) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["amount"],
          message: "ingestion.errors.financial_data_missing",
        });
      }
    }
  });

export interface ValidTransactionRow {
  id: string;
  id_hash?: string;
  originalData: Record<string, unknown>;
  mappedData: TransactionMappedData;
  errors: never[];
  hasError: false;
}

export interface InvalidTransactionRow {
  id: string;
  id_hash?: string;
  originalData: Record<string, unknown>;
  mappedData: Partial<TransactionMappedData>;
  errors: string[];
  hasError: true;
}

export type TransactionRow = ValidTransactionRow | InvalidTransactionRow;

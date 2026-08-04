import type { TransactionMappedData } from "@kryptofolio/shared-types";
import { normalizeMetadataKeys } from "./normalizer/metadataNormalizer";
import { transactionHandlers } from "./normalizer/handlers";
import { resolveFeeDenomination } from "./normalizer/feeDenomination";
import type { FiscalClassificationFlag } from "@kryptofolio/shared-types";

/**
 * Source labels that state a fiscal classification the canonical `tx_type` vocabulary does not
 * carry. This is the single producer of the flag in the running application.
 */
const FISCAL_FLAG_BY_LABEL: Readonly<Record<string, FiscalClassificationFlag>> = {
  wallet_activation: "WALLET_ACTIVATION",
};

/**
 * Their canonical `tx_type` is owned exclusively by `classifyCustodyMovement`; this set exists so the
 * fallback mapping below cannot coerce an unclassified movement into a plausible type.
 */
const MOVEMENT_LABELS: ReadonlySet<string> = new Set([
  "deposit",
  "deposito",
  "depósito",
  "withdrawal",
  "withdraw",
  "retiro",
  "transfer",
  "transferencia",
]);

/**
 * Normalizes a TransactionMappedData object to always provide
 * explicit directional properties according to the Backend MockTax Contracts.
 * 
 * Strict Rule: ZERO MATH ALLOWED. If a field is missing, it is passed as null.
 * The backend inference engine is responsible for all calculations.
 */
export function normalizeTransactionDirection(
  mappedData: TransactionMappedData
): TransactionMappedData {
  const normalized = { ...mappedData };
  
  // 1. Normalize metadata keys
  normalized.metadata = normalizeMetadataKeys(normalized.metadata || {});

  // 2. Normalize Timestamp (Combine Date and Time to UTC ISO 8601)
  if (normalized.date) {
    let dateStr = normalized.date.trim();
    
    // If the date string already contains a space (e.g. "2023-01-01 12:00:00"), replace it with T
    if (dateStr.includes(" ")) {
      dateStr = dateStr.replace(" ", "T");
    }
    
    // If no time component is present, add the provided time or default to midnight
    if (!dateStr.includes("T")) {
      const timeStr = normalized.time ? `T${normalized.time.trim()}` : "T00:00:00";
      dateStr = `${dateStr}${timeStr}`;
    }

    // Ensure it is explicitly marked as UTC
    if (!dateStr.endsWith("Z")) {
      dateStr = `${dateStr}Z`;
    }
    
    normalized.timestamp = dateStr;
    
    // Remove the temporary raw fields
    delete normalized.date;
    delete normalized.time;
  }

  // 3. Normalize directional properties
  const tx_type = normalized.tx_type?.toLowerCase().trim() || "";
  /**
   * What the source wrote, kept so the mapping below can tell whether a handler resolved the type.
   * Comparing against the lower- and upper-case forms instead missed every Title-Case label a real
   * export uses — Bit2Me writes `Trade` and Bitunix `Withdraw` — and left them unmapped.
   */
  const sourceTxType = normalized.tx_type;
  
  // We use functional handlers purely for struct mapping (not math)
  const handler = transactionHandlers[tx_type];

  if (handler) {
    handler(normalized);
  }

  resolveFeeDenomination(normalized);

  const fiscalFlag = FISCAL_FLAG_BY_LABEL[tx_type];
  if (fiscalFlag) {
    normalized.fiscal_flag = fiscalFlag;
  }

  const TYPE_MAP: Record<string, string> = {
    // Trade
    buy: "BUY",
    compra: "BUY",
    sell: "SELL",
    venta: "SELL",
    trade: "BUY",
    
    // Movements are absent from this map on purpose: the label alone does not say whether 500 EUR
    // was funded or 179 XRP was moved between wallets. `classifyCustodyMovement` owns their type.

    /**
     * A wallet activation locks crypto that arrives with no purchase record, so it behaves as an
     * acquisition valued at the market price of the moment. `BUY` is the only acquisition type that
     * invents no income: `AIRDROP` and `MINING` would report the reserve in the general base and
     * `STAKING` / `REWARD` in the savings base, none of which the user ever earned. What the
     * operation actually was is carried by `fiscal_flag`, not by this label.
     */
    wallet_activation: "BUY",

    // Crypto Native Income
    staking: "STAKING",
    campaign_new_user_incentive: "PROMOTION",
    airdrop: "AIRDROP",
    reward: "REWARD",
    recompensa: "REWARD",
    dividend: "DIVIDEND",
    dividendo: "DIVIDEND",
    mining: "MINING",
    mineria: "MINING",
    earn: "EARN",
    cashback: "CASHBACK",
    gift: "GIFT",
    regalo: "GIFT",
    present: "GIFT",

    // Crypto Native Expenses
    fee: "FEE",
    comision: "FEE",
    payment: "PAYMENT",
    pago: "PAYMENT",
    donation: "DONATION",
    donacion: "DONATION",
    burn: "BURN",
    quema: "BURN",
  };

  // Uppercasing an unclassified movement would produce a valid-looking `DEPOSIT` / `WITHDRAWAL`.
  // Preserving the raw label makes `toSpotTxType` reject the row and name the offending value.
  const handlerResolvedType = normalized.tx_type !== sourceTxType;
  const isUnresolvedMovement = MOVEMENT_LABELS.has(tx_type) && !handlerResolvedType;

  // An absent label stays absent: there is nothing to map, and `""` would read as a stated type.
  if (tx_type !== "" && !isUnresolvedMovement && !handlerResolvedType) {
    normalized.tx_type = TYPE_MAP[tx_type] ?? normalized.tx_type?.toUpperCase() ?? "";
  }
  
  // Clean up generic mapping fields so they don't pollute the backend payload
  // if they were successfully moved to directional fields.
  if (normalized.amount_in || normalized.amount_out) {
    delete normalized.amount;
  }
  if (normalized.asset_in || normalized.asset_out) {
    delete normalized.asset;
  }

  return normalized;
}

import type { SourceFormatProfileTable } from "./types";

/**
 * The measured export formats.
 *
 * Every declaration here was read off the user's own files rather than anticipated: the header rows
 * are verbatim, the conventions were reconciled arithmetically against the real rows, and where a
 * source ships no independent redundancy the invariant says so instead of asserting something the
 * profile itself computes.
 *
 * Typed as a total record over the identifier vocabulary, so adding a source without a profile is a
 * compile error rather than a silent fallthrough at run time.
 */
export const SOURCE_FORMAT_PROFILES: SourceFormatProfileTable = {
  "kraken-spot": {
    id: "kraken-spot",
    label: "Kraken (spot ledger)",
    market: { kind: "SPOT" },
    signature: {
      kind: "HEADER_SET",
      required: ["txid", "refid", "aclass", "subclass", "wallet", "balance"],
      forbidden: ["position uid", "funding rate", "Tipo de operación", "Outgoing Asset"],
    },
    // No fee-currency column: the fee is charged in the asset the row moves.
    feeDenomination: { kind: "ROW_ASSET" },
    // `amount` is net and `fee` is charged on top. Established by the running balance, not assumed:
    // `7704.160 PUMP` with a `17.720` fee lands as `7686.440`.
    feeConvention: { kind: "NET_PLUS_FEE" },
    directionalFill: { kind: "ONE_SIDED" },
    columnRoles: {
      references: ["refid"],
      categoryLabels: ["type", "subtype", "aclass", "subclass", "wallet"],
    },
    // `balance = previous + amount − fee` per asset: reconciled on 34 of 34 real rows, and Kraken's
    // own documentation states the formula. The column takes no part in any derivation.
    invariant: { kind: "RUNNING_BALANCE", rowOrder: "OLDEST_FIRST" },
  },

  "kraken-futures": {
    id: "kraken-futures",
    label: "Kraken (futures ledger)",
    market: { kind: "FUTURES" },
    signature: {
      kind: "HEADER_SET",
      required: ["uid", "dateTime", "funding rate", "realized pnl", "position uid"],
      forbidden: ["txid", "Tipo de operación"],
    },
    feeDenomination: { kind: "COLLATERAL_CURRENCY" },
    feeConvention: { kind: "NET_PLUS_FEE" },
    directionalFill: { kind: "ONE_SIDED" },
    columnRoles: {
      // `uid` is unique on all 1100 rows of the real export: it names the row, not the operation, so
      // it can never link two rows and is not a reference. It is also what the mapper reads as
      // `tx_id`, which is the field a per-row identifier belongs in.
      references: [],
      categoryLabels: ["account", "type", "contract", "position uid"],
    },
    /**
     * `new balance` is a running balance and it very nearly qualifies: read oldest-first per
     * (account, symbol) it reconciles on 1099 of 1100 real rows. The single break is a EUR
     * conversion whose stated balance is rounded — Kraken's own figure is 167.75030000000 where the
     * arithmetic gives 167.75032984614 — so the redundancy is not exact, and an inexact invariant
     * needs a tolerance, which is what hides real drift. Declared as none until the futures
     * ingestion path exists to measure it properly.
     */
    invariant: { kind: "NONE" },
  },

  "bit2me-spot": {
    id: "bit2me-spot",
    label: "Bit2Me",
    market: { kind: "SPOT" },
    signature: {
      kind: "HEADER_SET",
      required: [
        "Tipo de operación",
        "Cantidad de destino",
        "Moneda de destino",
        "Cantidad de origen",
        "Moneda de origen",
        "Comisión de la operación",
        "Moneda de la comisión",
        "Grupo",
        "Fecha",
      ],
      forbidden: [],
    },
    // `Moneda de la comisión` varies per row: it names the acquired asset on 98 of the 118 trade
    // rows and EUR on the 45 movement rows. The column is therefore read per row, like Bitvavo's.
    feeDenomination: { kind: "NAMED_COLUMN", sourceColumn: "Moneda de la comisión" },
    // Origin and destination are both written, so the fee is their difference.
    feeConvention: { kind: "GROSS_AND_NET" },
    // All 42 `Deposit` rows repeat the same asset and amount on both sides. This is also what makes
    // the euro figure on a movement row a valuation rather than a quantity: the fee that really left
    // the wallet is `origen − destino` in the asset, and the euro number is only its price.
    directionalFill: { kind: "BOTH_SIDES_WRITTEN" },
    columnRoles: {
      // `Grupo` holds wallet compartments — earn, trading, pocket, blockchain, bank-transfer — so a
      // whole multi-year history shares five values. Merging on it collapsed 706 rows into 5.
      references: [],
      categoryLabels: ["Grupo", "Exchange", "Tipo de operación"],
    },
    // Gross, net and fee are three columns of which the profile derives one, so any relation among
    // them is a tautology. Bit2Me's convention is caught by the digit-for-digit net, not here.
    invariant: { kind: "NONE" },
  },

  "bitvavo-spot": {
    id: "bitvavo-spot",
    label: "Bitvavo",
    market: { kind: "SPOT" },
    signature: {
      kind: "HEADER_SET",
      required: [
        "Timezone",
        "Quote Currency",
        "Quote Price",
        "Received / Paid Currency",
        "Received / Paid Amount",
        "Fee currency",
        "Fee amount",
        "Transaction ID",
      ],
      forbidden: [],
    },
    // The column really does vary inside one file: EUR on a buy, XRP on a withdrawal.
    feeDenomination: { kind: "NAMED_COLUMN", sourceColumn: "Fee currency" },
    // The paid total already contains the fee: 0.30338 × 1645 = 499.0601, plus 0.7499, is the
    // 499.81 the row reports as paid. Adding the fee again would raise the basis to 500.5599.
    feeConvention: { kind: "FEE_INSIDE_TOTAL" },
    directionalFill: { kind: "ONE_SIDED" },
    columnRoles: {
      // Unique on all 42 real rows, and the source writes one row per operation — both sides of a
      // trade sit in `Amount` and `Received / Paid Amount` — so there is never a second leg to link.
      // Like Bitunix's `Trx. ID`, the name suggests a reference and the data refuses it.
      references: [],
      categoryLabels: ["Type", "Status", "Timezone"],
    },
    // `quantity × price + fee = paid` spans four columns, none derived from the others. Exact on all
    // 12 real rows that carry the four values; the other 30 are deposits and withdrawals with no
    // price, which the check reports as unverifiable rather than passing.
    invariant: { kind: "OVER_DETERMINED_ROW" },
  },

  "bitunix-spot": {
    id: "bitunix-spot",
    label: "Bitunix",
    market: { kind: "SPOT" },
    signature: {
      kind: "HEADER_SET",
      required: [
        "Date (UTC)",
        "Label",
        "Outgoing Asset",
        "Outgoing Amount",
        "Incoming Asset",
        "Incoming Amount",
        "Fee Asset",
        "Fee Amount",
        "Trx. ID",
      ],
      forbidden: [],
    },
    feeDenomination: { kind: "NAMED_COLUMN", sourceColumn: "Fee Asset" },
    // The outgoing amount is net: 546.844684 withdrawn plus a 1 ADA fee is exactly the 547.844684
    // the two deposits credited.
    feeConvention: { kind: "NET_PLUS_FEE" },
    directionalFill: { kind: "ONE_SIDED" },
    columnRoles: {
      // `Trx. ID` looks like a reference and is not one: `T0009` appears on two distinct deposits
      // eleven minutes apart in the real export. Declaring it a reference would offer the aggregator
      // a merge key that merges unrelated operations.
      references: [],
      categoryLabels: ["Label", "Comment", "Trx. ID"],
    },
    invariant: { kind: "NONE" },
  },

  tangem: {
    id: "tangem",
    label: "Tangem",
    market: { kind: "SPOT" },
    signature: {
      kind: "HEADER_SET",
      required: ["Date", "Type", "Asset", "Amount", "Fee", "Notes"],
      // A six-column Date/Type/Asset/Amount/Fee/Notes export is a genuine subset of what a minimal
      // export elsewhere could produce, so this profile needs negative evidence before it wins.
      forbidden: [
        "txid",
        "refid",
        "subclass",
        "uid",
        "position uid",
        "Quote Currency",
        "Transaction ID",
        "Outgoing Asset",
        "Tipo de operación",
      ],
    },
    feeDenomination: { kind: "ROW_ASSET" },
    feeConvention: { kind: "NET_PLUS_FEE" },
    directionalFill: { kind: "ONE_SIDED" },
    columnRoles: { references: [], categoryLabels: ["Type", "Notes"] },
    invariant: { kind: "NONE" },
  },

  generic: {
    id: "generic",
    label: "Unrecognised source",
    // Declaring no market is what leaves the user's own choice of market standing.
    market: { kind: "UNDECLARED" },
    // Reached only by the absence of a match. A signature that matches everything would make every
    // file ambiguous.
    signature: { kind: "NOT_DETECTABLE" },
    // Whatever the user mapped onto the fee currency is the only evidence available; where a
    // non-zero fee has none, the row is reported rather than given the row's asset by default.
    feeDenomination: { kind: "NAMED_COLUMN", sourceColumn: "fee_currency" },
    feeConvention: { kind: "UNDETERMINED" },
    directionalFill: { kind: "ONE_SIDED" },
    columnRoles: { references: [], categoryLabels: [] },
    invariant: { kind: "NONE" },
  },
};

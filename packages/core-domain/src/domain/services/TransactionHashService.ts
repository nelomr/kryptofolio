import type { TransactionMappedData } from "@kryptofolio/shared-types";

export type HashableData = Partial<TransactionMappedData> & {
  account_id?: string | null;
};

/**
 * Generates a deterministic SHA-256 hash for a mapped transaction row to prevent duplicates.
 * Uses the most unique combination of fields: date, amount, ticker, and type.
 *
 * @param mappedData The validated mapped data
 * @returns A promise that resolves to the hex representation of the SHA-256 hash
 */
export async function generateIdHash(
  mappedData: HashableData,
): Promise<string> {
  const {
    tx_id,
    timestamp = "",
    tx_type = "",
    amount_in = "",
    amount_out = "",
    asset_in = "",
    asset_out = "",
    fee_amount = "",
    account_id = "",
    // Fallbacks for older data structures
    amount = "",
    asset = "",
    symbol = ""
  } = mappedData;

  if (tx_id) {
    const encoder = new TextEncoder();
    const data = encoder.encode(String(tx_id).trim());
    try {
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch (error) {
      let hash = 5381;
      const str = String(tx_id).trim();
      for (let i = 0; i < str.length; i++) {
        hash = (hash * 33) ^ str.charCodeAt(i);
      }
      return Math.abs(hash).toString(16);
    }
  }

  const activeAmountIn = amount_in || amount || "";
  const activeAssetIn = asset_in || asset || symbol || "";

  const uniqueString = `${timestamp}_${tx_type}_${activeAmountIn}_${amount_out}_${activeAssetIn}_${asset_out}_${fee_amount}_${account_id}`
    .toLowerCase()
    .trim();

  const encoder = new TextEncoder();
  const data = encoder.encode(uniqueString);

  try {
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (error) {
    let hash = 5381;
    for (let i = 0; i < uniqueString.length; i++) {
      hash = (hash * 33) ^ uniqueString.charCodeAt(i);
    }
    return Math.abs(hash).toString(16);
  }
}

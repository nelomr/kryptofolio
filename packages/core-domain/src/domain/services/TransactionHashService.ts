import type { TransactionMappedData } from "@kryptofolio/shared-types";

/**
 * Generates a deterministic SHA-256 hash for a mapped transaction row to prevent duplicates.
 * Uses the most unique combination of fields: date, amount, ticker, and type.
 *
 * @param mappedData The validated mapped data
 * @returns A promise that resolves to the hex representation of the SHA-256 hash
 */
export async function generateIdHash(
  mappedData: TransactionMappedData,
): Promise<string> {
  const {
    timestamp,
    amount,
    asset,
    amount_in,
    amount_out,
    asset_in,
    asset_out,
    symbol,
    tx_type,
  } = mappedData;

  const activeAmount = amount || amount_in || amount_out || "";
  const activeAsset = asset || asset_in || asset_out || symbol || "";

  const uniqueString = `${timestamp}_${activeAmount}_${activeAsset}_${tx_type}`
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

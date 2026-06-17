export const METADATA_DICTIONARY: Record<string, string[]> = {
  account_id: ["account", "wallet", "address", "source_address", "destination_address"],
  network: ["network", "chain", "red"],
  status: ["status", "estado", "state"],
  subtype: ["subtype", "aclass", "subclass", "subtipo"],
  balance: ["balance", "saldo"],
  funding_rate: ["funding rate", "realized funding"],
  collateral: ["collateral", "margin"],
};

/**
 * Normalizes residual metadata keys.
 * If a key matches a pattern in the dictionary, it is renamed to the standard key.
 * Otherwise, it's kept as is (lowercase).
 */
export function normalizeMetadataKeys(
  rawMetadata: Record<string, string>
): Record<string, string> {
  return Object.entries(rawMetadata).reduce((normalized, [key, value]) => {
    const cleanKey = key.toLowerCase().trim();
    const matchedEntry = Object.entries(METADATA_DICTIONARY).find(([, patterns]) =>
      patterns.some((pattern) => pattern === cleanKey)
    );

    const newKey = matchedEntry?.[0] ?? key.toLowerCase().trim();
    normalized[newKey] = value;
    
    return normalized;
  }, {} as Record<string, string>);
}

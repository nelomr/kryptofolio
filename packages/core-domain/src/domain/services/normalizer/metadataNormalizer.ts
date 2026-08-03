export const METADATA_DICTIONARY: Record<string, string[]> = {
  // A sub-wallet designation and an account identifier are different things: Kraken's `wallet`
  // column names a compartment *within* an account ("spot / main", "earn"), so folding it into
  // `account_id` both loses the compartment and overwrites the account it belongs to.
  // `grupo` is Bit2Me's header for the same concept: `earn`, `trading`, `pocket`, `blockchain`.
  wallet: ["wallet", "subwallet", "sub_wallet", "cartera", "subcartera", "grupo", "group"],
  account_id: ["account", "address", "source_address", "destination_address"],
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

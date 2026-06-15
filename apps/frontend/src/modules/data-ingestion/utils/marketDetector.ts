export type MarketType = "SPOT" | "FUTURES"

const FUTURES_KEYWORDS = ["future", "futuro", "deriv"]

/**
 * Automatically detects the market type based on the file name.
 * If any of the target keywords are found in the file name, it returns 'FUTURES'.
 * Otherwise, it defaults to 'SPOT'.
 */
export function detectMarketTypeFromFile(fileName: string | null | undefined): MarketType {
  if (!fileName) return "SPOT"

  const fileNameLower = fileName.toLowerCase()
  const isFutures = FUTURES_KEYWORDS.some((keyword) =>
    fileNameLower.includes(keyword),
  )

  return isFutures ? "FUTURES" : "SPOT"
}

export type MarketType = "SPOT" | "FUTURES"

const FUTURES_KEYWORDS = ["future", "futuro", "deriv"]

/**
 * The fallback for a source no profile recognises, and nothing more.
 *
 * It guesses the market from the *file name*, which says nothing reliable about what a file contains:
 * a real Kraken futures ledger saved under any other name reads as spot here, and every row in it
 * would then be ingested into the wrong market. Every measured source declares its market on its
 * profile as a fact, and the wizard consults that first; only the `generic` profile, which declares
 * none, ever reaches this function. Do not call it anywhere a profile is available — two detections
 * over one file can disagree, and this is the one whose reasoning the user cannot see.
 */
export function detectMarketTypeFromFile(fileName: string | null | undefined): MarketType {
  if (!fileName) return "SPOT"

  const fileNameLower = fileName.toLowerCase()
  const isFutures = FUTURES_KEYWORDS.some((keyword) =>
    fileNameLower.includes(keyword),
  )

  return isFutures ? "FUTURES" : "SPOT"
}

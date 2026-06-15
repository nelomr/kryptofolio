import { DateTime } from "luxon";

/**
 * Normalizes a date and optional time string into a strict UTC ISO 8601 timestamp using Luxon.
 *
 * @param dateStr Raw date string from CSV (e.g., '2023-12-01', '2023/12/01', '01-12-2023')
 * @param timeStr Raw time string from CSV (e.g., '15:30:00')
 * @param timezone The source timezone of the CSV (e.g., 'UTC', 'Europe/Madrid')
 * @returns ISO 8601 UTC timestamp string, or null if invalid
 */
export function normalizeToUtcIso(
  dateStr: string | null,
  timeStr: string | null,
  timezone: string,
): string | null {
  if (!dateStr) return null;

  let cleanDate = dateStr.trim();
  let cleanTime = timeStr ? timeStr.trim() : "";

  // If dateStr contains space-separated date and time (e.g. '2026-02-08 09:40:59')
  if (cleanDate.includes(" ") && !cleanDate.includes("T")) {
    const parts = cleanDate.split(" ");
    cleanDate = parts[0].trim();
    if (!cleanTime && parts[1]) {
      cleanTime = parts[1].trim();
    }
  }

  if (!cleanTime) {
    cleanTime = "00:00:00";
  }

  const isoMatch = cleanDate.match(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/,
  );
  if (isoMatch) {
    const dt = DateTime.fromISO(cleanDate, { setZone: true });
    if (dt.isValid) {
      return dt.toUTC().toISO() ?? null;
    }
  }

  let normalizedDateStr = cleanDate.replace(/\//g, "-");

  const dmYMatch = normalizedDateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmYMatch) {
    normalizedDateStr = `${dmYMatch[3]}-${dmYMatch[2]}-${dmYMatch[1]}`;
  }

  const naiveDateTimeStr = `${normalizedDateStr}T${cleanTime}`;

  try {
    const dt = DateTime.fromISO(naiveDateTimeStr, { zone: timezone });

    if (!dt.isValid) {
      console.warn(
        `Failed to parse and normalize date: ${dateStr} ${timeStr} with timezone ${timezone}. Reason: ${dt.invalidReason}`,
      );
      return null;
    }

    return dt.toUTC().toISO() ?? null;
  } catch (error) {
    console.warn(
      `Exception while parsing date: ${dateStr} ${timeStr} with timezone ${timezone}`,
      error,
    );
    return null;
  }
}

/**
 * useFormatters — Composable description.
 */

export function formatCurrency(value: number | string | undefined | null): string {
  if (value === undefined || value === null) return '€0.00'
  const numValue = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(numValue)) return '€0.00'
  
  const locale = typeof navigator !== 'undefined' && navigator.language ? navigator.language : (import.meta.env.VITE_APP_LOCALE || 'en-US')
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(numValue)
}

export function formatPercent(value: number | string | undefined | null): string {
  if (value === undefined || value === null) return '0.00%'
  const numValue = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(numValue)) return '0.00%'
  
  // Intl.NumberFormat with style: 'percent' automatically multiplies by 100.
  // Wait, if the input is already a percentage like 5.5 (meaning 5.5%),
  // passing it directly to Intl percent formatter as 5.5 will result in 550%.
  // Typically, ROI is passed as a percentage value (e.g. 5.5).
  // So we divide by 100 before formatting.
  const locale = typeof navigator !== 'undefined' && navigator.language ? navigator.language : (import.meta.env.VITE_APP_LOCALE || 'en-US')
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(numValue / 100)
}

export function formatNumber(val: number | string | undefined | null): string {
  if (val === undefined || val === null) return '-'
  const v = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(v)) return '-'
  if (v > 0 && v < 0.001) return v.toFixed(8)
  const locale = typeof navigator !== 'undefined' && navigator.language ? navigator.language : (import.meta.env.VITE_APP_LOCALE || 'en-US')
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(v)
}

export function formatDate(val: number | string | Date | undefined | null): string {
  if (!val) return '---'
  let date: Date;
  if (val instanceof Date) {
    date = val;
  } else if (!isNaN(Number(val)) && (typeof val === 'number' || (typeof val === 'string' && val.trim() !== ""))) {
    const num = Number(val);
    const timestamp = String(num).length <= 11 ? num * 1000 : num;
    date = new Date(timestamp);
  } else {
    date = new Date(val as string);
  }
  if (isNaN(date.getTime())) return String(val).substring(0, 10);
  const locale = typeof navigator !== 'undefined' && navigator.language ? navigator.language : (import.meta.env.VITE_APP_LOCALE || 'en-US')
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date)
}

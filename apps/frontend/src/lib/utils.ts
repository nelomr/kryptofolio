import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const MONETARY_FIELDS = [
  'amount', 'price_eur', 'total_eur', 'cost_basis_eur', 'pnl_eur', 'fee_eur',
  'original_amount', 'remaining_amount', 'acquisition_price', 'current_value_eur',
  'unrealized_pnl_eur', 'capital_gains_eur', 'capital_losses_eur',
  'savings_base_yields_eur', 'estimated_irpf_eur', 'total_equity_eur',
  'total_cost_basis_eur', 'total_pnl_eur', 'pnl_percentage'
];

export function safeAmountToNumber(val: string | number | null | undefined): number {
  if (val === null || val === undefined || val === '') return 0;
  const n = typeof val === 'string' ? parseFloat(val) : val;
  return isNaN(n) ? 0 : parseFloat(n.toFixed(5));
}

export function gt(a: string | number, b: string | number): boolean {
  return safeAmountToNumber(a) > safeAmountToNumber(b);
}

export function lt(a: string | number, b: string | number): boolean {
  return safeAmountToNumber(a) < safeAmountToNumber(b);
}

export function isPositive(val: string | number): boolean {
  return safeAmountToNumber(val) > 0;
}

export function isNegative(val: string | number): boolean {
  return safeAmountToNumber(val) < 0;
}

export function isZero(val: string | number | null | undefined): boolean {
  if (val === null || val === undefined) return true;
  return Math.abs(safeAmountToNumber(val)) < 0.00001;
}

export function formatAmount(val: string | number | null | undefined): string {
  return safeAmountToNumber(val).toFixed(5);
}

/**
 * Generates a consistent hex color string from a given text (e.g., asset symbol).
 * Useful for deterministic UI coloring in charts and avatars.
 */
export function stringToColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const color = Math.floor(Math.abs((Math.sin(hash) * 10000) % 1 * 16777215)).toString(16)
  return '#' + '000000'.substring(0, 6 - color.length) + color
}

/**
 * Generates a deterministic Hue value (0-360) from a string.
 * This is used to feed CSS variables (--badge-hue) for perfect light/dark mode contrast via Tailwind.
 */
export function getDeterministicHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash % 359);
}

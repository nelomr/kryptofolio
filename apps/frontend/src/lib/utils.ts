import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Vue's CSSProperties/StyleValue types don't index CSS custom properties (`--foo`).
 * Use this to type `:style` bindings that set custom properties, e.g. `--badge-hue`.
 */
export type CSSVars = Record<`--${string}`, string | number>

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

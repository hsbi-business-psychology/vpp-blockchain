import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Highest value a survey can carry (same ceiling as the contract). */
export const MAX_POINTS = 255

/**
 * Display points with up to two decimals in the given UI language:
 * 0.25 → "0,25" (de) / "0.25" (en), 2 → "2". Also hides floating-point
 * noise from sums such as 0.1 + 0.2.
 */
export function formatPoints(value: number, locale?: string): string {
  return value.toLocaleString(locale, { maximumFractionDigits: 2 })
}

/**
 * Parse a points value typed by an admin. Accepts a comma or a dot as the
 * decimal separator ("0,25", "1.5"). Returns null unless the value is
 * greater than 0, at most MAX_POINTS and has at most two decimals.
 */
export function parsePointsInput(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null
  const value = Number(normalized)
  if (!(value > 0) || value > MAX_POINTS) return null
  return value
}

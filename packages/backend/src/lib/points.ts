/**
 * @module points
 *
 * Points are handled as plain decimal numbers throughout the backend and
 * the API (0.25, 1, 1.5). The V3 contract stores them as integer
 * centipoints (1 point = 100); these helpers do the conversion and the
 * German display formatting.
 */

/** Highest value a survey can carry (same ceiling as the V2 uint8 field). */
export const MAX_POINTS = 255

export function toCentiPoints(points: number): number {
  return Math.round(points * 100)
}

export function fromCentiPoints(centi: bigint | number): number {
  return Number(centi) / 100
}

/** True when `points` has at most two decimals (0.25 yes, 0.125 no). */
export function hasAtMostTwoDecimals(points: number): boolean {
  return Math.abs(points * 100 - Math.round(points * 100)) < 1e-6
}

/** True when `points` is not a whole number. */
export function isFractional(points: number): boolean {
  return toCentiPoints(points) % 100 !== 0
}

/** German display: 0.25 → "0,25", 2 → "2", 1.5 → "1,5". */
export function formatPointsDe(points: number): string {
  return points.toLocaleString('de-DE', { maximumFractionDigits: 2 })
}

/**
 * Person colour palette, ordered so that consecutive picks differ strongly in
 * *lightness* as well as hue — this keeps people distinguishable when the roster
 * is printed in grayscale. The print view pairs each colour with a fill pattern
 * (see PATTERNS) so colour is never the only cue.
 */
export const PALETTE = [
  '#1f6feb', // blue
  '#e3742a', // orange
  '#2a9d4a', // green
  '#b5299a', // magenta
  '#0d9aa8', // teal
  '#c62828', // red
  '#7a52c9', // purple
  '#8a6d00', // olive/gold
] as const

/** SVG-ish CSS pattern id per palette slot; used as a grayscale-safe swatch fill. */
export const PATTERNS = [
  'solid',
  'stripe',
  'dots',
  'grid',
  'diag',
  'cross',
  'vertical',
  'horizontal',
] as const

export type PatternName = (typeof PATTERNS)[number]

/** Pick the next colour that is least used among existing people. */
export function nextColor(usedColors: string[]): string {
  const counts = new Map<string, number>(PALETTE.map((c) => [c, 0]))
  for (const c of usedColors) counts.set(c, (counts.get(c) ?? 0) + 1)
  let best: string = PALETTE[0]
  let bestN = Infinity
  for (const c of PALETTE) {
    const n = counts.get(c) ?? 0
    if (n < bestN) {
      bestN = n
      best = c
    }
  }
  return best
}

/** Deterministic pattern for a colour, based on its slot in the palette. */
export function patternFor(color: string): PatternName {
  const i = PALETTE.indexOf(color as (typeof PALETTE)[number])
  return PATTERNS[(i < 0 ? 0 : i) % PATTERNS.length]
}

/** Initials for a name, e.g. "Sam Taylor" -> "ST", "mum" -> "MU". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

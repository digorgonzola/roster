import type { CSSProperties } from 'react'
import type { Person } from '../types'
import { initials, patternFor } from '../palette'

interface SwatchProps {
  color: string
  size?: number
}

/** A colour swatch that also carries a grayscale-safe fill pattern. */
export function Swatch({ color, size = 14 }: SwatchProps) {
  const style = { '--pc': color, width: size, height: size } as CSSProperties
  return <span className={`swatch pat-${patternFor(color)}`} style={style} aria-hidden />
}

interface PersonChipProps {
  person: Person | null
  /** Show only initials (compact, for grid cells). */
  compact?: boolean
}

export function PersonChip({ person, compact }: PersonChipProps) {
  if (!person) {
    return <span className="chip chip-empty">—</span>
  }
  const style = { '--pc': person.color } as CSSProperties
  return (
    <span className="chip" style={style} title={person.name}>
      <Swatch color={person.color} />
      <span className="chip-label">{compact ? initials(person.name) : person.name}</span>
    </span>
  )
}

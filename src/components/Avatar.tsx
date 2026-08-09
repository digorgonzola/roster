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

interface AvatarProps {
  person: Person | null
  size?: number
}

/**
 * Two-letter person box: initials over a tinted pattern swatch.
 * A null person renders the dashed "?" unassigned marker.
 */
export function Avatar({ person, size = 20 }: AvatarProps) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) } as CSSProperties
  if (!person) {
    return <span className="avatar avatar-unassigned" style={style} title="Unassigned">?</span>
  }
  return (
    <span
      className={`avatar pat-${patternFor(person.color)}`}
      style={{ ...style, '--pc': person.color } as CSSProperties}
      title={person.name}
    >
      <span className="avatar-label">{initials(person.name)}</span>
    </span>
  )
}

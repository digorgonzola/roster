import type { DayIndex, DayPart, Person, TimeOfDay } from './types'
import { DAY_NAMES } from './week'

export const DAY_PARTS: readonly DayPart[] = ['morning', 'afternoon', 'evening']

const PART_ABBREV: Record<DayPart, string> = { morning: 'am', afternoon: 'pm', evening: 'eve' }

export function blockedParts(person: Person, day: DayIndex): DayPart[] {
  return person.unavailable?.[day] ?? []
}

export function isAllDayUnavailable(person: Person, day: DayIndex): boolean {
  const blocked = blockedParts(person, day)
  return DAY_PARTS.every((part) => blocked.includes(part))
}

/**
 * Can this person not do a chore in `timeOfDay` on `day`?
 * An 'anytime' (or unset) chore can be done in any free part of the day, so
 * it is blocked only when the whole day is.
 */
export function isUnavailable(person: Person, day: DayIndex, timeOfDay: TimeOfDay | undefined): boolean {
  if (!timeOfDay || timeOfDay === 'anytime') return isAllDayUnavailable(person, day)
  return blockedParts(person, day).includes(timeOfDay)
}

/** Toggle one day-part on/off, dropping empty days so the field stays sparse. */
export function withPartToggled(person: Person, day: DayIndex, part: DayPart): Person {
  const current = blockedParts(person, day)
  const next = current.includes(part)
    ? current.filter((p) => p !== part)
    : DAY_PARTS.filter((p) => p === part || current.includes(p))
  return withBlockedParts(person, day, next)
}

/** Block the whole day, or free it entirely if it was already fully blocked. */
export function withDayToggled(person: Person, day: DayIndex): Person {
  return withBlockedParts(person, day, isAllDayUnavailable(person, day) ? [] : [...DAY_PARTS])
}

function withBlockedParts(person: Person, day: DayIndex, parts: DayPart[]): Person {
  const unavailable = { ...person.unavailable }
  if (parts.length) unavailable[day] = parts
  else delete unavailable[day]
  const { unavailable: _drop, ...rest } = person
  return Object.keys(unavailable).length ? { ...rest, unavailable } : rest
}

/** Compact summary for lists, e.g. "Mon pm · Wed" ('' when always free). */
export function unavailabilitySummary(person: Person): string {
  const days = Object.keys(person.unavailable ?? {}).map(Number).sort((a, b) => a - b) as DayIndex[]
  return days
    .map((day) => {
      const parts = blockedParts(person, day)
      if (!parts.length) return ''
      if (isAllDayUnavailable(person, day)) return DAY_NAMES[day]
      return `${DAY_NAMES[day]} ${DAY_PARTS.filter((p) => parts.includes(p)).map((p) => PART_ABBREV[p]).join('/')}`
    })
    .filter(Boolean)
    .join(' · ')
}

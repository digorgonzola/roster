import type { DayIndex } from './types'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const MS_PER_WEEK = 7 * MS_PER_DAY

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
export const DAY_NAMES_LONG = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
] as const

/** Format a Date as local 'YYYY-MM-DD' (no timezone drift). */
export function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Parse a local 'YYYY-MM-DD' into a Date at local midnight. */
export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

/** Weekday of a date as DayIndex, where Monday = 0 .. Sunday = 6. */
export function toDayIndex(d: Date): DayIndex {
  return (((d.getDay() + 6) % 7) as DayIndex)
}

/**
 * First day of the week containing `d`.
 * weekStartsOn: 0 = Sunday, 1 = Monday.
 */
export function startOfWeek(d: Date, weekStartsOn: 0 | 1): Date {
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = base.getDay() // 0 = Sun .. 6 = Sat
  const diff = (day - weekStartsOn + 7) % 7
  return addDays(base, -diff)
}

/** The 7 dates of the week beginning at `weekStart`. */
export function daysOfWeek(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

/** True if 'YYYY-MM-DD' falls within the 7-day window from `weekStart`. */
export function isDateInWeek(dateStr: string, weekStart: Date): boolean {
  const t = parseYmd(dateStr).getTime()
  const start = weekStart.getTime()
  return t >= start && t < start + MS_PER_WEEK
}

/**
 * Whole-day count for a date, from its calendar Y/M/D (DST- and timezone-safe).
 * Used to advance daily rotations deterministically.
 */
export function dayNumber(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / MS_PER_DAY)
}

/**
 * Monday-anchored week number for a date, independent of the Mon/Sun display
 * setting, so weekly rotations stay stable when the user toggles week start.
 * Anchored to Monday 1970-01-05 (dayNumber 4).
 */
export function weekNumber(d: Date): number {
  return Math.floor((dayNumber(d) - 4) / 7)
}

/** Absolute month index (year*12+month), for advancing monthly rotations. */
export function monthIndex(d: Date): number {
  return d.getFullYear() * 12 + d.getMonth()
}

/**
 * Is `date` the Nth occurrence of its weekday within its month?
 * nth 1..4 = first..fourth; 'last' = the final one that month.
 */
export function isNthWeekdayOfMonth(date: Date, weekday: DayIndex, nth: number | 'last'): boolean {
  if (toDayIndex(date) !== weekday) return false
  const dom = date.getDate()
  if (nth === 'last') {
    const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
    return dom + 7 > daysInMonth
  }
  return Math.floor((dom - 1) / 7) + 1 === nth
}

/** Human label like "4 – 10 Aug 2026" for the week beginning at weekStart. */
export function weekLabel(weekStart: Date): string {
  const end = addDays(weekStart, 6)
  const sameMonth = weekStart.getMonth() === end.getMonth()
  const sameYear = weekStart.getFullYear() === end.getFullYear()
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  const startStr = weekStart.toLocaleDateString(undefined, sameMonth && sameYear ? { day: 'numeric' } : opts)
  const endStr = end.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  return `${startStr} – ${endStr}`
}

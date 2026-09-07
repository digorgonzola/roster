import type { Chore, Person, Schedule } from './types'
import { WEEK_ZERO_DAY_NUMBER, dayNumber, monthIndex, occurrenceWeek, toDayIndex, weekNumber } from './week'

/**
 * Resolve who is responsible for a chore on a specific occurrence `date`.
 *
 * - manual: the fixed person (or null if unset / deleted).
 * - rotate weekly: same person for the whole week, advancing one person each
 *   week the chore occurs.
 * - rotate daily: advances one person each occurrence.
 *
 * Rotation is deterministic (no stored cursor, no randomness), so navigating
 * back and forth always yields the same person, and it is keyed to Monday-anchored
 * weeks / absolute days so it is unaffected by the Mon/Sun display setting.
 */
export function assigneeForDate(
  chore: Chore,
  date: Date,
  people: Person[],
  /**
   * Stable phase offset for this chore (its position among rotated chores).
   * Staggers rotations so different chores don't all land on the same person
   * in the same week/day.
   */
  offset = 0,
): Person | null {
  const byId = (id: string | null) =>
    id == null ? null : people.find((p) => p.id === id) ?? null

  if (chore.assignment.mode === 'manual') {
    return byId(chore.assignment.personId)
  }

  if (chore.assignment.mode === 'byday') {
    return byId(chore.assignment.byDay[toDayIndex(date)] ?? null)
  }

  const ids = chore.assignment.personIds.filter((id) => people.some((p) => p.id === id))
  if (ids.length === 0) return null

  const counter = rotationCounter(chore.schedule, date, chore.assignment.period === 'daily')
  const idx = (((counter + offset) % ids.length) + ids.length) % ids.length
  return byId(ids[idx])
}

/**
 * How many steps the rotation has advanced by `date`.
 *
 * Weekly chores count *occurrences*, not calendar days or weeks. Counting
 * days lands the same person on every occurrence whenever the gap between
 * scheduled days is a multiple of the group size (Wed + Sun with 4 people is
 * always 4 days apart); counting weeks does the same for a fortnightly chore
 * with 2 people.
 */
function rotationCounter(schedule: Schedule, date: Date, perDay: boolean): number {
  if (schedule.kind === 'monthly') return monthIndex(date)
  if (schedule.kind === 'oneoff') return perDay ? dayNumber(date) : weekNumber(date)
  const week = occurrenceWeek(schedule, date)
  if (!perDay) return week
  const rank = schedule.days.indexOf(toDayIndex(date))
  if (rank < 0) return dayNumber(date)
  // + WEEK_ZERO_DAY_NUMBER keeps every-day chores on the dayNumber sequence
  // they used before per-occurrence counting, so existing rosters don't reshuffle.
  return week * schedule.days.length + rank + WEEK_ZERO_DAY_NUMBER
}

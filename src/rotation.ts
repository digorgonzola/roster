import type { Chore, Person } from './types'
import { dayNumber, monthIndex, toDayIndex, weekNumber } from './week'

/**
 * Resolve who is responsible for a chore on a specific occurrence `date`.
 *
 * - manual: the fixed person (or null if unset / deleted).
 * - rotate weekly: same person for the whole week, advancing one person each week.
 * - rotate daily: advances one person each day.
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

  // Monthly chores advance once per month; otherwise per day or per week.
  const counter =
    chore.schedule.kind === 'monthly'
      ? monthIndex(date)
      : chore.assignment.period === 'daily'
        ? dayNumber(date)
        : weekNumber(date)
  const idx = (((counter + offset) % ids.length) + ids.length) % ids.length
  return byId(ids[idx])
}

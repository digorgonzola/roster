import type { Chore, DayIndex, Person, Schedule } from './types'
import { isUnavailable } from './availability'
import { WEEK_ZERO_DAY_NUMBER, dayNumber, monthIndex, occurrenceWeek, toDayIndex, weekNumber } from './week'

const mod = (x: number, n: number) => ((x % n) + n) % n

/**
 * Resolve who is responsible for a chore on a specific occurrence `date`.
 *
 * - manual: the fixed person (or null if unset / deleted).
 * - rotate weekly: same person for the whole week, advancing one person each
 *   week the chore occurs.
 * - rotate daily: advances one person each occurrence.
 *
 * A rotation works around people who are unavailable at the chore's time of day
 * by *swapping* two occurrences (see blockAssignment), so nobody loses their
 * turn and nobody absorbs someone else's. It is null when nobody can do it.
 * Fixed assignments (manual / byday) are the user's explicit choice and are
 * returned as set.
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

  const perDay = chore.assignment.period === 'daily'
  const counter = rotationCounter(chore.schedule, date, perDay)
  const slot = mod(counter + offset, ids.length)
  const day = toDayIndex(date)

  const free = (person: Person | null, days: DayIndex[]) =>
    !!person && days.every((d) => !isUnavailable(person, d, chore.timeOfDay))
  /** Next person in the list who is free on every one of `days`. */
  const nextFree = (days: DayIndex[]) => {
    for (let step = 0; step < ids.length; step++) {
      const person = byId(ids[(slot + step) % ids.length])
      if (free(person, days)) return person
    }
    return null
  }

  const days = slotDays(chore.schedule, counter, perDay)
  if (days) {
    const block = Math.floor((counter + offset) / ids.length)
    const swapped = byId(blockAssignment(chore, ids, people, block, offset, perDay)[slot])
    if (free(swapped, days)) return swapped
  }

  // A one-off has no block to swap within, and a slot no swap could cover still
  // needs doing, so hand it to the next available person. Falling back to just
  // this day keeps the chore staffed when nobody can cover a weekly rotation's
  // whole week — better a split week than an unassigned one.
  return (days && nextFree(days)) ?? nextFree([day])
}

/**
 * The weekdays one rotation slot covers, derived from its counter alone.
 * Availability depends on the weekday and never on the calendar date, so a
 * whole block can be enumerated without inverting counters back into dates.
 *
 * A daily rotation's slot covers the single scheduled day its counter names; a
 * weekly one covers every day the chore runs that week, so the week stays with
 * one person. Null means there is no block to speak of (a one-off runs once).
 */
function slotDays(schedule: Schedule, counter: number, perDay: boolean): DayIndex[] | null {
  if (schedule.kind === 'oneoff') return null
  if (schedule.kind === 'monthly') return [schedule.weekday]
  if (schedule.days.length === 0) return null
  if (!perDay) return schedule.days
  return [schedule.days[mod(counter - WEEK_ZERO_DAY_NUMBER, schedule.days.length)]]
}

/**
 * Resolve a whole block of `n` consecutive occurrences at once, where `n` is the
 * size of the rotation. Because the slot index is `(counter + offset) % n`, slot
 * p starts out on `ids[p]` — so a block hands every person in the rotation
 * exactly one turn.
 *
 * Slots whose person is unavailable are repaired by *swapping* with another slot
 * both people can cover, which keeps that guarantee. Passing the turn forward
 * instead (what this replaces) took it off the skipped person for good and piled
 * it onto whoever happened to sit next in the list — and handed them two days
 * running whenever the skip fell just before their own turn.
 *
 * Slots that no swap can fix are left on their original person for the caller to
 * detect; it falls back to the next available person rather than leaving the
 * chore undone.
 */
function blockAssignment(
  chore: Chore,
  ids: string[],
  people: Person[],
  block: number,
  offset: number,
  perDay: boolean,
): string[] {
  const n = ids.length
  const canDo = (id: string, days: DayIndex[]) => {
    const person = people.find((p) => p.id === id)
    return !!person && days.every((d) => !isUnavailable(person, d, chore.timeOfDay))
  }

  const days = Array.from({ length: n }, (_, p) =>
    slotDays(chore.schedule, block * n + p - offset, perDay) ?? [])
  const assigned = [...ids]

  for (let p = 0; p < n; p++) {
    if (canDo(assigned[p], days[p])) continue
    // Prefer the furthest slot: trading with a neighbour is what produced the
    // back-to-back repeats in the first place.
    let best = -1
    for (let q = 0; q < n; q++) {
      if (q === p) continue
      if (!canDo(assigned[q], days[p]) || !canDo(assigned[p], days[q])) continue
      if (best < 0 || Math.abs(q - p) > Math.abs(best - p)) best = q
    }
    if (best < 0) continue
    ;[assigned[p], assigned[best]] = [assigned[best], assigned[p]]
  }
  return assigned
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

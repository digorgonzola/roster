import type { AppState, Chore, WeeklySchedule, WeekEntry } from './types'
import { assigneeForDate } from './rotation'
import { addDays, isDateInWeek, isNthWeekdayOfMonth, parseYmd, toDayIndex, weekNumber, ymd } from './week'
import { timeOrder } from './timeofday'

/** Does a (possibly fortnightly/monthly) weekly chore run in the week of `date`? */
export function weeklyOccursOn(s: WeeklySchedule, date: Date): boolean {
  const interval = s.intervalWeeks && s.intervalWeeks > 1 ? s.intervalWeeks : 1
  if (interval === 1) return true
  const anchor = s.anchorWeek ?? 0
  return (((weekNumber(date) - anchor) % interval) + interval) % interval === 0
}

/**
 * Expand all chores into their occurrences within the week beginning `weekStart`.
 * This is the single source of truth that both the on-screen week view and the
 * printout render from.
 *
 * - weekly chores emit one entry per selected weekday that falls in the week.
 * - one-off chores emit a single entry when their date lands inside the week.
 * - paused (switched-off) chores emit nothing.
 *
 * Rotated chores are phase-offset so they spread across people rather than all
 * landing on the same person (see the offset maps below).
 *
 * Entries are sorted by day, then time of day, then chore name, for stable display.
 */
/**
 * Phase offsets so rotated chores stagger instead of colliding. Daily, weekly
 * and monthly rotations are numbered in *separate* sequences because they
 * advance on different clocks (day number vs week number): each group gets
 * 0, 1, 2, … so that, for up to (number of people) chores in a group, they map
 * to different people, and each chore still rotates through everyone over time.
 *
 * Since schema v2 the offset is frozen on the chore (`rotationOffset`) at
 * creation or migration, so reordering the chores array never reassigns
 * people. The dense fallback below only covers in-memory chores that have no
 * stored offset yet (e.g. the editor's rotate preview).
 */
type RotationGroup = 'daily' | 'weekly' | 'monthly'

function rotationGroup(c: Chore): RotationGroup {
  if (c.schedule.kind === 'monthly') return 'monthly'
  return c.assignment.mode === 'rotate' && c.assignment.period === 'daily' ? 'daily' : 'weekly'
}

export function rotationOffsets(chores: Chore[]): Map<string, number> {
  const offsets = new Map<string, number>()
  const next: Record<RotationGroup, number> = { daily: 0, weekly: 0, monthly: 0 }
  for (const c of chores) {
    if (c.assignment.mode !== 'rotate' || c.rotationOffset === undefined) continue
    offsets.set(c.id, c.rotationOffset)
    const g = rotationGroup(c)
    next[g] = Math.max(next[g], c.rotationOffset + 1)
  }
  for (const c of chores) {
    if (c.assignment.mode !== 'rotate' || c.rotationOffset !== undefined) continue
    offsets.set(c.id, next[rotationGroup(c)]++)
  }
  return offsets
}

/** The offset a new rotating chore should freeze: next free slot in its group. */
export function nextRotationOffset(existing: Chore[], chore: Chore): number {
  const g = rotationGroup(chore)
  let next = 0
  for (const c of existing) {
    if (c.assignment.mode !== 'rotate' || rotationGroup(c) !== g) continue
    const offset = c.rotationOffset
    if (offset !== undefined && offset >= next) next = offset + 1
  }
  return next
}

export function entriesForWeek(state: AppState, weekStart: Date): WeekEntry[] {
  const entries: WeekEntry[] = []
  const offsets = rotationOffsets(state.chores)

  for (const chore of state.chores) {
    if (chore.paused) continue
    const offset = offsets.get(chore.id) ?? 0

    if (chore.schedule.kind === 'weekly') {
      const sched = chore.schedule
      for (let i = 0; i < 7; i++) {
        const date = addDays(weekStart, i)
        const dayIndex = toDayIndex(date)
        if (sched.days.includes(dayIndex) && weeklyOccursOn(sched, date)) {
          const assignee = assigneeForDate(chore, date, state.people, offset)
          entries.push({ chore, dayIndex, date: ymd(date), assignee })
        }
      }
    } else if (chore.schedule.kind === 'monthly') {
      const sched = chore.schedule
      for (let i = 0; i < 7; i++) {
        const date = addDays(weekStart, i)
        if (isNthWeekdayOfMonth(date, sched.weekday, sched.nth)) {
          const assignee = assigneeForDate(chore, date, state.people, offset)
          entries.push({ chore, dayIndex: toDayIndex(date), date: ymd(date), assignee })
        }
      }
    } else {
      if (isDateInWeek(chore.schedule.date, weekStart)) {
        const date = parseYmd(chore.schedule.date)
        const assignee = assigneeForDate(chore, date, state.people, offset)
        entries.push({ chore, dayIndex: toDayIndex(date), date: chore.schedule.date, assignee })
      }
    }
  }

  entries.sort(
    (a, b) =>
      a.dayIndex - b.dayIndex ||
      timeOrder(a.chore.timeOfDay) - timeOrder(b.chore.timeOfDay) ||
      a.chore.name.localeCompare(b.chore.name),
  )
  return entries
}

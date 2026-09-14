import type { AppState, Chore, DayIndex, WeeklySchedule, WeekEntry } from './types'
import { assigneeForDate } from './rotation'
import { isUnavailable } from './availability'
import { addDays, isDateInWeek, isNthWeekdayOfMonth, parseYmd, startOfWeek, toDayIndex, weekNumber, weeklyInterval, ymd } from './week'
import { timeOrder } from './timeofday'

/** Enough hill-climbing for a household-sized week; it settles well inside this. */
const MAX_BALANCE_PASSES = 8

/** Does a (possibly fortnightly/monthly) weekly chore run in the week of `date`? */
export function weeklyOccursOn(s: WeeklySchedule, date: Date): boolean {
  const interval = weeklyInterval(s)
  if (interval === 1) return true
  const anchor = s.anchorWeek ?? 0
  return (((weekNumber(date) - anchor) % interval) + interval) % interval === 0
}

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
 * landing on the same person (see the offset maps above), and then balanced so
 * no one person collects a day's worth of chores while someone else has none.
 *
 * Entries are sorted by day, then time of day, then chore name, for stable display.
 */
export function entriesForWeek(state: AppState, weekStart: Date): WeekEntry[] {
  // Balancing makes an occurrence's assignee depend on the rest of its week, so
  // the window has to be the Monday week, not the displayed one: otherwise the
  // roster would reshuffle when the Mon/Sun display setting changed, and the ICS
  // feed (which walks overlapping display weeks and de-dupes by UID) could emit
  // two different assignees for one date.
  const monday = startOfWeek(weekStart, 1)
  const covering = monday.getTime() === weekStart.getTime() ? [monday] : [monday, addDays(monday, 7)]
  const from = weekStart.getTime()
  const to = addDays(weekStart, 7).getTime()

  const entries = covering
    .flatMap((ws) => balanceDailyLoad(expandWeek(state, ws)))
    .filter((e) => {
      const t = parseYmd(e.date).getTime()
      return t >= from && t < to
    })

  entries.sort(
    (a, b) =>
      a.dayIndex - b.dayIndex ||
      timeOrder(a.chore.timeOfDay) - timeOrder(b.chore.timeOfDay) ||
      a.chore.name.localeCompare(b.chore.name),
  )
  return entries
}

/** Every occurrence in the 7 days from `weekStart`, before any balancing. */
function expandWeek(state: AppState, weekStart: Date): WeekEntry[] {
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

  return entries
}

/**
 * Even out how much each person has to do on any one day.
 *
 * Rotations advance on their own clocks and never look at one another, so one
 * person can collect several chores on a day another has none. This trades the
 * assignees of two occurrences *of the same chore* on different days, which
 * leaves every person's weekly total for that chore untouched: it can move work
 * off a crowded day without undoing the rotation's own fairness.
 *
 * Fixed assignments (manual / byday) are the user's explicit choice and never
 * move, though they still count towards a person's load for the day. A trade is
 * only made when both people are free at the chore's time of day on the day they
 * are moving to.
 */
function balanceDailyLoad(entries: WeekEntry[]): WeekEntry[] {
  const out = [...entries]
  const key = (day: DayIndex, id: string) => `${day}:${id}`
  const load = new Map<string, number>()
  const at = (day: DayIndex, id: string) => load.get(key(day, id)) ?? 0
  const bump = (day: DayIndex, id: string, by: number) => load.set(key(day, id), at(day, id) + by)
  for (const e of out) if (e.assignee) bump(e.dayIndex, e.assignee.id, 1)

  const byChore = new Map<string, number[]>()
  for (let i = 0; i < out.length; i++) {
    const e = out[i]
    if (e.chore.assignment.mode !== 'rotate' || !e.assignee) continue
    const seen = byChore.get(e.chore.id)
    if (seen) seen.push(i)
    else byChore.set(e.chore.id, [i])
  }

  for (let pass = 0; pass < MAX_BALANCE_PASSES; pass++) {
    let traded = false
    for (const seen of byChore.values()) {
      for (let a = 0; a < seen.length; a++) {
        for (let b = a + 1; b < seen.length; b++) {
          const x = out[seen[a]]
          const y = out[seen[b]]
          const px = x.assignee
          const py = y.assignee
          if (!px || !py || px.id === py.id || x.dayIndex === y.dayIndex) continue
          if (isUnavailable(px, y.dayIndex, y.chore.timeOfDay)) continue
          if (isUnavailable(py, x.dayIndex, x.chore.timeOfDay)) continue
          // Change in Σ load², which falls when the two busiest pairings break up.
          const delta =
            2 * (at(x.dayIndex, py.id) + at(y.dayIndex, px.id)
               - at(x.dayIndex, px.id) - at(y.dayIndex, py.id)) + 4
          if (delta >= 0) continue
          bump(x.dayIndex, px.id, -1)
          bump(x.dayIndex, py.id, 1)
          bump(y.dayIndex, py.id, -1)
          bump(y.dayIndex, px.id, 1)
          out[seen[a]] = { ...x, assignee: py }
          out[seen[b]] = { ...y, assignee: px }
          traded = true
        }
      }
    }
    if (!traded) break
  }
  return out
}

import { describe, expect, it } from 'vitest'
import type { Chore, DayPart, Person, WeeklySchedule } from './types'
import { assigneeForDate } from './rotation'
import { entriesForWeek } from './schedule'
import { addDays, dayNumber, weekNumber } from './week'

const people: Person[] = ['p1', 'p2', 'p3', 'p4'].map((id) => ({ id, name: id, color: '#000' }))
const ids = people.map((p) => p.id)

const chore = (schedule: WeeklySchedule, period: 'daily' | 'weekly', personIds = ids): Chore => ({
  id: 'c',
  name: 'c',
  schedule,
  assignment: { mode: 'rotate', period, personIds },
  rotationOffset: 0,
})

const monday = new Date(2026, 8, 7) // Monday 2026-09-07

const assignees = (c: Chore, weeks: number) =>
  Array.from({ length: weeks }, (_, w) =>
    entriesForWeek({ schemaVersion: 2, people, chores: [c], weekStartsOn: 1, done: {} }, addDays(monday, w * 7)),
  )
    .flat()
    .map((e) => e.assignee?.id)

describe('rotate daily', () => {
  it('advances one person per occurrence, not per calendar day', () => {
    // Wed + Sun are 4 days apart: a day-counting rotation with 4 people
    // would hand both days to the same person every week.
    const c = chore({ kind: 'weekly', days: [2, 6] }, 'daily')
    const seq = assignees(c, 4)
    expect(seq).toHaveLength(8)
    for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1])
    expect(new Set(seq.slice(0, 4)).size).toBe(4)
    expect(seq.slice(4)).toEqual(seq.slice(0, 4))
  })

  it('keeps the historical day-number sequence for every-day chores', () => {
    const c = chore({ kind: 'weekly', days: [0, 1, 2, 3, 4, 5, 6] }, 'daily')
    for (let i = 0; i < 14; i++) {
      const d = addDays(monday, i)
      expect(assigneeForDate(c, d, people, 1)?.id).toBe(ids[(dayNumber(d) + 1) % 4])
    }
  })

  it('does not skip people across the weeks a fortnightly chore is off', () => {
    const c = chore({ kind: 'weekly', days: [0, 3], intervalWeeks: 2, anchorWeek: weekNumber(monday) }, 'daily')
    const seq = assignees(c, 4)
    expect(seq).toEqual(['p1', 'p2', 'p3', 'p4'].map((id) => id))
  })
})

describe('rotate weekly', () => {
  it('advances one person per occurrence week for fortnightly chores', () => {
    // Weeks advance by 2 per occurrence: counting weeks with 2 people
    // would give the same person every time.
    const c = chore({ kind: 'weekly', days: [0], intervalWeeks: 2, anchorWeek: weekNumber(monday) }, 'weekly', ['p1', 'p2'])
    expect(assignees(c, 8)).toEqual(['p1', 'p2', 'p1', 'p2'])
  })

  it('is unchanged for every-week chores', () => {
    const c = chore({ kind: 'weekly', days: [0, 4] }, 'weekly')
    for (let w = 0; w < 4; w++) {
      const d = addDays(monday, w * 7)
      expect(assigneeForDate(c, d, people, 2)?.id).toBe(ids[(weekNumber(d) + 2) % 4])
      expect(assigneeForDate(c, addDays(d, 4), people, 2)?.id).toBe(ids[(weekNumber(d) + 2) % 4])
    }
  })
})

describe('unavailable people', () => {
  const away = (id: string, day: number, parts: DayPart[]) =>
    people.map((p) => (p.id === id ? { ...p, unavailable: { [day]: parts } } : p))
  const wholeDay: DayPart[] = ['morning', 'afternoon', 'evening']

  it('hands a rotated occurrence to the next available person', () => {
    // Weekly rotation on Mondays: offset 0 in week of `monday` lands on ids[weekNumber % 4].
    const c = { ...chore({ kind: 'weekly', days: [0] }, 'weekly'), timeOfDay: 'afternoon' as const }
    const expected = ids[weekNumber(monday) % 4]
    const next = ids[(weekNumber(monday) + 1) % 4]
    expect(assigneeForDate(c, monday, people)?.id).toBe(expected)
    expect(assigneeForDate(c, monday, away(expected, 0, ['afternoon']))?.id).toBe(next)
  })

  it('does not skip for a different day-part or an anytime chore on a part-blocked day', () => {
    const c = chore({ kind: 'weekly', days: [0] }, 'weekly')
    const expected = ids[weekNumber(monday) % 4]
    const partly = away(expected, 0, ['afternoon'])
    expect(assigneeForDate({ ...c, timeOfDay: 'morning' }, monday, partly)?.id).toBe(expected)
    expect(assigneeForDate(c, monday, partly)?.id).toBe(expected)
    expect(assigneeForDate(c, monday, away(expected, 0, wholeDay))?.id).not.toBe(expected)
  })

  it('is unassigned when everyone is away', () => {
    const c = chore({ kind: 'weekly', days: [2] }, 'daily')
    const all = people.map((p) => ({ ...p, unavailable: { 2: wholeDay } }))
    expect(assigneeForDate(c, addDays(monday, 2), all)).toBeNull()
  })

  it('leaves fixed assignments alone', () => {
    const c: Chore = { id: 'm', name: 'm', schedule: { kind: 'weekly', days: [0] }, assignment: { mode: 'manual', personId: 'p1' } }
    expect(assigneeForDate(c, monday, away('p1', 0, wholeDay))?.id).toBe('p1')
  })
})

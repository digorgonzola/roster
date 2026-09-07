import { describe, expect, it } from 'vitest'
import type { Chore, Person, WeeklySchedule } from './types'
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

import { describe, expect, it } from 'vitest'
import type { Chore, DayPart, Person, WeeklySchedule } from './types'
import { assigneeForDate } from './rotation'
import { isUnavailable } from './availability'
import { entriesForWeek } from './schedule'
import { addDays, dayNumber, toDayIndex, weekNumber } from './week'

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

  it('keeps a weekly rotation on one person for the whole week', () => {
    // Blocked on any day the chore runs = blocked for that week's turn, so the
    // week moves to someone else rather than splitting across two people.
    const c = { ...chore({ kind: 'weekly', days: [0, 3] }, 'weekly', ['p1', 'p2', 'p3']), timeOfDay: 'evening' as const }
    const blocked = away('p1', 3, ['evening'])
    for (let w = 0; w < 6; w++) {
      const mon = addDays(monday, w * 7)
      const who = assigneeForDate(c, mon, blocked, 0)?.id
      expect(who).not.toBe('p1')
      expect(assigneeForDate(c, addDays(mon, 3), blocked, 0)?.id).toBe(who)
    }
  })

  it('leaves fixed assignments alone', () => {
    const c: Chore = { id: 'm', name: 'm', schedule: { kind: 'weekly', days: [0] }, assignment: { mode: 'manual', personId: 'p1' } }
    expect(assigneeForDate(c, monday, away('p1', 0, wholeDay))?.id).toBe('p1')
  })
})

describe('swapping around unavailable days', () => {
  // A nightly chore over five people, three with standing evening commitments.
  const eve: DayPart[] = ['evening']
  const household: Person[] = [
    { id: 'ana', name: 'Ana', color: '#000' },
    { id: 'ben', name: 'Ben', color: '#000' },
    { id: 'cass', name: 'Cass', color: '#000', unavailable: { 0: eve } },
    { id: 'dev', name: 'Dev', color: '#000', unavailable: { 2: eve, 3: eve, 4: eve } },
    { id: 'fin', name: 'Fin', color: '#000', unavailable: { 3: eve } },
  ]
  const nightly: Chore = {
    id: 'set-table',
    name: 'Set table',
    timeOfDay: 'evening',
    schedule: { kind: 'weekly', days: [0, 1, 2, 3, 4, 5, 6] },
    assignment: { mode: 'rotate', period: 'daily', personIds: household.map((p) => p.id) },
    rotationOffset: 0,
  }
  const size = household.length
  const blocks = 4
  /** `blocks` whole blocks, starting from the first block boundary on or after
   *  `monday` so the run covers complete rotations of everyone. */
  const run = (offset: number) => {
    let start = 0
    while ((dayNumber(addDays(monday, start)) + offset) % size !== 0) start++
    return Array.from({ length: blocks * size }, (_, i) => {
      const d = addDays(monday, start + i)
      return { day: toDayIndex(d), who: assigneeForDate(nightly, d, household, offset)?.id }
    })
  }

  it('never hands the same person two days in a row', () => {
    // A person blocked on the Monday evening used to pass that turn to the
    // next in the list, who then reached their own turn on the Tuesday.
    for (let offset = 0; offset < size; offset++) {
      const seq = run(offset).map((e) => e.who)
      for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1])
    }
  })

  it('never schedules anyone on a day they are unavailable', () => {
    for (let offset = 0; offset < size; offset++) {
      for (const { day, who } of run(offset)) {
        const person = household.find((p) => p.id === who)!
        expect(isUnavailable(person, day, 'evening')).toBe(false)
      }
    }
  })

  it('still gives everyone an equal share', () => {
    // Swapping moves a turn to another day, so being away costs nobody their
    // share and lands nobody with someone else's.
    for (let offset = 0; offset < size; offset++) {
      const counts = new Map<string, number>()
      for (const { who } of run(offset)) counts.set(who!, (counts.get(who!) ?? 0) + 1)
      expect([...counts.values()]).toEqual(household.map(() => blocks))
    }
  })
})

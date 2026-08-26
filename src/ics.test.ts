import { describe, expect, it } from 'vitest'
import type { AppState, Chore } from './types'
import { buildCalendar, buildTasks, calendarName } from './ics'

const NOW = new Date('2026-08-24T00:00:00Z')
// Monday 2026-08-24 begins the week; the sample chores fall inside it.
const START = new Date(2026, 7, 24)

const people = [
  { id: 'p1', name: 'Alex', color: '#111' },
  { id: 'p2', name: 'Sam', color: '#222' },
]

const state = (chores: Chore[]): AppState => ({
  schemaVersion: 2,
  people,
  chores,
  weekStartsOn: 1,
  done: {},
})

const oneOff = (id: string, date: string, personId: string | null): Chore => ({
  id,
  name: id,
  schedule: { kind: 'oneoff', date },
  assignment: { mode: 'manual', personId },
})

describe('buildCalendar', () => {
  it('wraps events in a VCALENDAR with CRLF line endings', () => {
    const ics = buildCalendar(state([oneOff('Dishes', '2026-08-25', 'p2')]), {
      start: START,
      weeks: 1,
      now: NOW,
    })
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    expect(ics).toContain('VERSION:2.0')
    expect(ics.split('\r\n').filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1)
  })

  it('emits an all-day event with an exclusive next-day DTEND', () => {
    const ics = buildCalendar(state([oneOff('Dishes', '2026-08-25', 'p2')]), {
      start: START,
      weeks: 1,
      now: NOW,
    })
    expect(ics).toContain('DTSTART;VALUE=DATE:20260825')
    expect(ics).toContain('DTEND;VALUE=DATE:20260826')
    expect(ics).toContain('SUMMARY:Dishes — Sam')
    expect(ics).toContain('UID:Dishes.2026-08-25@roster')
  })

  it('labels an unassigned occurrence rather than dropping it', () => {
    const ics = buildCalendar(state([oneOff('Dishes', '2026-08-25', null)]), {
      start: START,
      weeks: 1,
      now: NOW,
    })
    expect(ics).toContain('SUMMARY:Dishes (unassigned)')
  })

  it('filters to a single person when personId is given', () => {
    const ics = buildCalendar(
      state([oneOff('Dishes', '2026-08-25', 'p2'), oneOff('Bins', '2026-08-26', 'p1')]),
      { start: START, weeks: 1, now: NOW, personId: 'p2' },
    )
    expect(ics).toContain('SUMMARY:Dishes — Sam')
    expect(ics).not.toContain('Bins')
  })

  it('materialises each weekly occurrence once across a multi-week window', () => {
    const weekly: Chore = {
      id: 'Vacuum',
      name: 'Vacuum',
      schedule: { kind: 'weekly', days: [0] }, // Mondays
      assignment: { mode: 'manual', personId: 'p1' },
    }
    const ics = buildCalendar(state([weekly]), { start: START, weeks: 3, now: NOW })
    const uids = ics.split('\r\n').filter((l) => l.startsWith('UID:'))
    expect(uids).toEqual([
      'UID:Vacuum.2026-08-24@roster',
      'UID:Vacuum.2026-08-31@roster',
      'UID:Vacuum.2026-09-07@roster',
    ])
  })

  it('escapes commas, semicolons and newlines in text values', () => {
    const chore: Chore = {
      ...oneOff('Tidy', '2026-08-25', 'p2'),
      name: 'Tidy, sweep; mop',
      notes: 'line1\nline2',
    }
    const ics = buildCalendar(state([chore]), { start: START, weeks: 1, now: NOW })
    expect(ics).toContain('SUMMARY:Tidy\\, sweep\\; mop — Sam')
    expect(ics).toContain('line1\\nline2')
  })

  it('folds content lines to 75 octets', () => {
    const chore = { ...oneOff('X', '2026-08-25', 'p2'), name: 'A'.repeat(200) }
    const ics = buildCalendar(state([chore]), { start: START, weeks: 1, now: NOW })
    for (const line of ics.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    }
  })
})

describe('buildTasks', () => {
  it('emits VTODOs with a DUE date and NEEDS-ACTION status', () => {
    const ics = buildTasks(state([oneOff('Dishes', '2026-08-25', 'p2')]), {
      start: START,
      weeks: 1,
      now: NOW,
    })
    expect(ics).toContain('BEGIN:VTODO')
    expect(ics).toContain('DUE;VALUE=DATE:20260825')
    expect(ics).toContain('STATUS:NEEDS-ACTION')
  })
})

describe('calendarName', () => {
  it('names a person feed and the household feed', () => {
    expect(calendarName(state([]), 'p2')).toBe("Sam's chores")
    expect(calendarName(state([]))).toBe('Household chores')
  })
})

import { describe, expect, it } from 'vitest'
import type { AppState, Chore, DayIndex, DayPart, Person, TimeOfDay } from './types'
import { entriesForWeek, nextRotationOffset, rotationOffsets } from './schedule'
import { assigneeForDate } from './rotation'
import { isUnavailable } from './availability'
import { addDays, parseYmd } from './week'

const rotate = (id: string, offset: number | undefined, period: 'daily' | 'weekly'): Chore => ({
  id,
  name: id,
  schedule: { kind: 'weekly', days: [0, 1, 2, 3, 4, 5, 6] },
  assignment: { mode: 'rotate', period, personIds: ['p1', 'p2', 'p3'] },
  ...(offset !== undefined ? { rotationOffset: offset } : {}),
})

const state = (chores: Chore[]): AppState => ({
  schemaVersion: 2,
  people: [
    { id: 'p1', name: 'Alex', color: '#111' },
    { id: 'p2', name: 'Sam', color: '#222' },
    { id: 'p3', name: 'Jordan', color: '#333' },
  ],
  chores,
  weekStartsOn: 1,
  done: {},
})

describe('rotationOffsets', () => {
  it('prefers frozen offsets and numbers the rest after them', () => {
    const offsets = rotationOffsets([
      rotate('a', 2, 'weekly'),
      rotate('b', undefined, 'weekly'),
      rotate('c', 0, 'weekly'),
    ])
    expect(offsets.get('a')).toBe(2)
    expect(offsets.get('c')).toBe(0)
    expect(offsets.get('b')).toBe(3)
  })

  it('numbers daily and weekly rotations in separate sequences', () => {
    const offsets = rotationOffsets([
      rotate('d1', undefined, 'daily'),
      rotate('w1', undefined, 'weekly'),
      rotate('d2', undefined, 'daily'),
    ])
    expect(offsets.get('d1')).toBe(0)
    expect(offsets.get('d2')).toBe(1)
    expect(offsets.get('w1')).toBe(0)
  })
})

describe('nextRotationOffset', () => {
  it('returns the next free slot within the chore group', () => {
    const existing = [rotate('a', 0, 'weekly'), rotate('b', 3, 'weekly'), rotate('c', 5, 'daily')]
    expect(nextRotationOffset(existing, rotate('new', undefined, 'weekly'))).toBe(4)
    expect(nextRotationOffset(existing, rotate('new', undefined, 'daily'))).toBe(6)
    expect(nextRotationOffset([], rotate('new', undefined, 'weekly'))).toBe(0)
  })
})

describe('paused chores', () => {
  it('emit no occurrences but keep their rotation offset reserved', () => {
    const weekStart = new Date(2026, 7, 3) // Monday 2026-08-03
    const chores = [
      { ...rotate('off', 0, 'weekly'), paused: true },
      rotate('on', 1, 'weekly'),
    ]
    const entries = entriesForWeek(state(chores), weekStart)
    expect(entries.every((e) => e.chore.id === 'on')).toBe(true)
    expect(entries).toHaveLength(7)
    // The paused chore still holds slot 0, so 'on' keeps its own assignee.
    expect(rotationOffsets(chores).get('on')).toBe(1)
  })
})

describe('rotation stability under reorder', () => {
  it('keeps every assignee when the chores array is reordered', () => {
    const chores = [
      rotate('a', 0, 'weekly'),
      rotate('b', 1, 'weekly'),
      rotate('c', 0, 'daily'),
      rotate('d', 2, 'weekly'),
    ]
    const weekStart = new Date(2026, 7, 3) // Monday 2026-08-03

    const before = entriesForWeek(state(chores), weekStart)
    const after = entriesForWeek(state([...chores].reverse()), weekStart)

    const key = (e: { chore: Chore; date: string }) => `${e.chore.id}@${e.date}`
    const beforeMap = new Map(before.map((e) => [key(e), e.assignee?.id ?? null]))
    expect(after).toHaveLength(before.length)
    for (const e of after) {
      expect(e.assignee?.id ?? null).toBe(beforeMap.get(key(e)))
    }
  })
})

describe('daily load balancing', () => {
  const weekStart = new Date(2026, 8, 14) // Monday 2026-09-14
  const eve: DayPart[] = ['evening']
  const every: DayIndex[] = [0, 1, 2, 3, 4, 5, 6]
  const household: Person[] = [
    { id: 'ana', name: 'Ana', color: '#000' },
    { id: 'ben', name: 'Ben', color: '#000' },
    { id: 'cass', name: 'Cass', color: '#000', unavailable: { 0: eve } },
    { id: 'dev', name: 'Dev', color: '#000', unavailable: { 2: eve, 3: eve, 4: eve } },
    { id: 'fin', name: 'Fin', color: '#000', unavailable: { 3: eve } },
  ]
  const ids = household.map((p) => p.id)
  const daily = (name: string, offset: number, timeOfDay: TimeOfDay): Chore => ({
    id: name,
    name,
    timeOfDay,
    schedule: { kind: 'weekly', days: every },
    assignment: { mode: 'rotate', period: 'daily', personIds: ids },
    rotationOffset: offset,
  })
  // Eight nightly chores over five people, three with evening commitments.
  const busy: AppState = {
    schemaVersion: 2,
    people: household,
    weekStartsOn: 1,
    done: {},
    chores: [
      daily('Feed the cat', 0, 'evening'),
      daily('Feed the dog', 1, 'evening'),
      daily('Feed the chickens', 2, 'morning'),
      daily('Walk dog', 3, 'afternoon'),
      daily('Empty dishwasher', 4, 'morning'),
      daily('Stack dishwasher', 5, 'evening'),
      daily('Empty cat litter', 6, 'anytime'),
      daily('Set table', 7, 'evening'),
    ],
  }

  /** dayIndex → person id → how many chores they have that day. */
  const loadByDay = (s: AppState, ws: Date) => {
    const load = new Map<string, number>()
    for (const e of entriesForWeek(s, ws)) {
      if (!e.assignee) continue
      const k = `${e.dayIndex}:${e.assignee.id}`
      load.set(k, (load.get(k) ?? 0) + 1)
    }
    return load
  }

  it('leaves nobody idle on a day someone else is loaded up', () => {
    // Rotations advance on their own clocks, so before balancing this week gave
    // one person four chores on the Thursday and another none.
    const load = loadByDay(busy, weekStart)
    for (const day of every) {
      const counts = household.map((p) => load.get(`${day}:${p.id}`) ?? 0)
      const free = household.filter((p) => !isUnavailable(p, day, 'evening')).length
      // Only an evening block can justify a gap, and then only for the blocked.
      if (free === household.length) expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
      expect(Math.max(...counts)).toBeLessThanOrEqual(3)
    }
  })

  it('leaves every weekly per-chore total exactly as the rotation set it', () => {
    // Trading two occurrences of the same chore moves work between days without
    // touching the rotation's own fairness.
    const offsets = rotationOffsets(busy.chores)
    const rotated = new Map<string, number>()
    const balanced = new Map<string, number>()
    for (const e of entriesForWeek(busy, weekStart)) {
      const raw = assigneeForDate(e.chore, parseYmd(e.date), household, offsets.get(e.chore.id) ?? 0)
      if (raw) rotated.set(`${e.chore.id}|${raw.id}`, (rotated.get(`${e.chore.id}|${raw.id}`) ?? 0) + 1)
      if (e.assignee) balanced.set(`${e.chore.id}|${e.assignee.id}`, (balanced.get(`${e.chore.id}|${e.assignee.id}`) ?? 0) + 1)
    }
    expect([...balanced].sort()).toEqual([...rotated].sort())
  })

  it('never moves a chore onto a day its person is unavailable', () => {
    for (const e of entriesForWeek(busy, weekStart)) {
      if (!e.assignee) continue
      expect(isUnavailable(e.assignee, e.dayIndex, e.chore.timeOfDay)).toBe(false)
    }
  })

  it('never moves a fixed assignment', () => {
    const fixed: Chore = {
      id: 'bins', name: 'bins', timeOfDay: 'anytime',
      schedule: { kind: 'weekly', days: [0, 3] },
      assignment: { mode: 'manual', personId: 'ana' },
    }
    const entries = entriesForWeek({ ...busy, chores: [...busy.chores, fixed] }, weekStart)
    const bins = entries.filter((e) => e.chore.id === 'bins')
    expect(bins).toHaveLength(2)
    expect(bins.every((e) => e.assignee?.id === 'ana')).toBe(true)
  })

  it('gives a date the same assignee whichever week start asks for it', () => {
    // Balancing is anchored to the Monday week, so the Mon/Sun display setting
    // cannot reshuffle the roster and overlapping ICS expansions always agree.
    const fromMonday = new Map(entriesForWeek(busy, weekStart).map((e) => [`${e.chore.id}@${e.date}`, e.assignee?.id]))
    for (const shift of [-1, 1]) {
      for (const e of entriesForWeek({ ...busy, weekStartsOn: 0 }, addDays(weekStart, shift))) {
        const seen = fromMonday.get(`${e.chore.id}@${e.date}`)
        if (seen !== undefined) expect(e.assignee?.id).toBe(seen)
      }
    }
  })
})

import { describe, expect, it } from 'vitest'
import type { AppState, Chore } from './types'
import { entriesForWeek, nextRotationOffset, rotationOffsets } from './schedule'

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

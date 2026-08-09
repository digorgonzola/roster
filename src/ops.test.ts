import { describe, expect, it } from 'vitest'
import type { AppState, Chore } from './types'
import { applyOp } from './ops'

const chore = (over: Partial<Chore>): Chore => ({
  id: 'c1',
  name: 'Chore',
  schedule: { kind: 'weekly', days: [0] },
  assignment: { mode: 'manual', personId: null },
  ...over,
})

const base = (): AppState => ({
  schemaVersion: 2,
  people: [
    { id: 'p1', name: 'Alex', color: '#111' },
    { id: 'p2', name: 'Sam', color: '#222' },
  ],
  chores: [],
  weekStartsOn: 1,
  done: {},
})

describe('applyOp', () => {
  it('adds, updates and deletes people', () => {
    let s = base()
    s = applyOp(s, { t: 'addPerson', person: { id: 'p3', name: 'Jo', color: '#333' } })
    expect(s.people).toHaveLength(3)
    s = applyOp(s, { t: 'updatePerson', person: { id: 'p3', name: 'Joan', color: '#333' } })
    expect(s.people[2].name).toBe('Joan')
    s = applyOp(s, { t: 'deletePerson', id: 'p3' })
    expect(s.people.map((p) => p.id)).toEqual(['p1', 'p2'])
  })

  it('deletePerson prunes every assignment mode', () => {
    let s = base()
    s.chores = [
      chore({ id: 'c1', assignment: { mode: 'manual', personId: 'p2' } }),
      chore({ id: 'c2', assignment: { mode: 'rotate', personIds: ['p1', 'p2'] }, rotationOffset: 0 }),
      chore({ id: 'c3', assignment: { mode: 'byday', byDay: { 0: 'p2', 1: 'p1' } } }),
    ]
    s = applyOp(s, { t: 'deletePerson', id: 'p2' })
    expect(s.chores[0].assignment).toEqual({ mode: 'manual', personId: null })
    expect(s.chores[1].assignment).toEqual({ mode: 'rotate', personIds: ['p1'] })
    expect(s.chores[2].assignment).toEqual({ mode: 'byday', byDay: { 0: null, 1: 'p1' } })
  })

  it('saveChore inserts new chores and freezes a rotation offset', () => {
    let s = base()
    s = applyOp(s, {
      t: 'saveChore',
      chore: chore({ id: 'c1', assignment: { mode: 'rotate', personIds: ['p1', 'p2'] } }),
    })
    s = applyOp(s, {
      t: 'saveChore',
      chore: chore({ id: 'c2', assignment: { mode: 'rotate', personIds: ['p1', 'p2'] } }),
    })
    expect(s.chores.map((c) => c.rotationOffset)).toEqual([0, 1])
  })

  it('saveChore keeps an existing frozen offset on edit', () => {
    let s = base()
    const c = chore({ id: 'c1', assignment: { mode: 'rotate', personIds: ['p1'] }, rotationOffset: 4 })
    s = applyOp(s, { t: 'saveChore', chore: c })
    s = applyOp(s, { t: 'saveChore', chore: { ...c, name: 'Renamed' } })
    expect(s.chores).toHaveLength(1)
    expect(s.chores[0].name).toBe('Renamed')
    expect(s.chores[0].rotationOffset).toBe(4)
  })

  it('deleteChore removes its completion history', () => {
    let s = base()
    s.chores = [chore({ id: 'c1' }), chore({ id: 'c2' })]
    s.done = { '2026-08-03': ['c1', 'c2'], '2026-08-04': ['c1'] }
    s = applyOp(s, { t: 'deleteChore', id: 'c1' })
    expect(s.done).toEqual({ '2026-08-03': ['c2'] })
  })

  it('assign sets manual, byday and rotate assignments', () => {
    let s = base()
    s.chores = [
      chore({ id: 'c1' }),
      chore({ id: 'c2', assignment: { mode: 'byday', byDay: { 0: null } } }),
      chore({ id: 'c3' }),
    ]
    s = applyOp(s, { t: 'assign', choreId: 'c1', date: '2026-08-03', choice: 'p2' })
    expect(s.chores[0].assignment).toEqual({ mode: 'manual', personId: 'p2' })

    // 2026-08-03 is a Monday: byday index 0.
    s = applyOp(s, { t: 'assign', choreId: 'c2', date: '2026-08-03', choice: 'p1' })
    expect(s.chores[1].assignment).toEqual({ mode: 'byday', byDay: { 0: 'p1' } })

    s = applyOp(s, { t: 'assign', choreId: 'c3', date: '2026-08-03', choice: 'rotate' })
    expect(s.chores[2].assignment).toEqual({
      mode: 'rotate',
      period: 'weekly',
      personIds: ['p1', 'p2'],
    })
    expect(s.chores[2].rotationOffset).toBe(0)
  })

  it('setDone is idempotent in both directions', () => {
    let s = base()
    s.chores = [chore({ id: 'c1' })]
    const on = { t: 'setDone', date: '2026-08-03', choreId: 'c1', done: true } as const
    const off = { t: 'setDone', date: '2026-08-03', choreId: 'c1', done: false } as const

    s = applyOp(s, on)
    expect(s.done).toEqual({ '2026-08-03': ['c1'] })
    expect(applyOp(s, on)).toBe(s)

    s = applyOp(s, off)
    expect(s.done).toEqual({})
    expect(applyOp(s, off)).toBe(s)
  })

  it('setWeekStartsOn and replaceState apply directly', () => {
    let s = base()
    s = applyOp(s, { t: 'setWeekStartsOn', v: 0 })
    expect(s.weekStartsOn).toBe(0)
    const fresh = base()
    expect(applyOp(s, { t: 'replaceState', state: fresh })).toBe(fresh)
  })
})

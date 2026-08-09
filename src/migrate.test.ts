import { describe, expect, it } from 'vitest'
import { migrate } from './migrate'

/** A saved blob from the v1 (unversioned, integer-id) schema. */
const v1Blob = {
  people: [
    { id: 1, name: 'Alex', color: '#1f6feb' },
    { id: 2, name: 'Sam', color: '#e3742a' },
    { id: 3, name: 'Jordan', color: '#2a9d4a' },
  ],
  weekStartsOn: 1,
  done: { '2026-08-03': [1, 3] },
  chores: [
    {
      id: 1,
      name: 'Empty dishwasher',
      schedule: { kind: 'weekly', days: [0, 1, 2, 3, 4, 5, 6] },
      assignment: { mode: 'rotate', period: 'daily', personIds: [1, 2, 3] },
    },
    {
      id: 2,
      name: 'Take out bins',
      schedule: { kind: 'weekly', days: [2] },
      assignment: { mode: 'rotate', period: 'weekly', personIds: [1, 2] },
    },
    {
      id: 3,
      name: 'Vacuum living areas',
      schedule: { kind: 'weekly', days: [5] },
      assignment: { mode: 'manual', personId: 2 },
    },
    {
      id: 4,
      name: 'Walk dog by day',
      schedule: { kind: 'weekly', days: [0, 2] },
      assignment: { mode: 'byday', byDay: { 0: 1, 2: null } },
    },
    {
      id: 5,
      name: 'Clean toilets',
      schedule: { kind: 'weekly', days: [5], intervalWeeks: 2, anchorWeek: 10 },
      assignment: { mode: 'rotate', period: 'weekly', personIds: [1, 2, 3] },
    },
    {
      id: 6,
      name: 'Deep clean bathroom',
      schedule: { kind: 'monthly', weekday: 5, nth: 1 },
      assignment: { mode: 'rotate', period: 'weekly', personIds: [1, 2, 3] },
    },
  ],
}

describe('migrate v1 -> v2', () => {
  const out = migrate(JSON.parse(JSON.stringify(v1Blob)))

  it('stamps the schema version', () => {
    expect(out.schemaVersion).toBe(2)
  })

  it('stringifies ids and keeps references intact', () => {
    expect(out.people.map((p) => p.id)).toEqual(['1', '2', '3'])
    expect(out.chores.map((c) => c.id)).toEqual(['1', '2', '3', '4', '5', '6'])
    expect(out.done).toEqual({ '2026-08-03': ['1', '3'] })

    const manual = out.chores[2].assignment
    expect(manual).toEqual({ mode: 'manual', personId: '2' })

    const byday = out.chores[3].assignment
    expect(byday).toEqual({ mode: 'byday', byDay: { 0: '1', 2: null } })

    const rotate = out.chores[0].assignment
    expect(rotate.mode === 'rotate' && rotate.personIds).toEqual(['1', '2', '3'])
  })

  it('freezes rotation offsets with the legacy order-based numbering', () => {
    const offsets = Object.fromEntries(out.chores.map((c) => [c.name, c.rotationOffset]))
    expect(offsets).toEqual({
      'Empty dishwasher': 0, // first daily
      'Take out bins': 0, // first weekly
      'Vacuum living areas': undefined, // manual: no offset
      'Walk dog by day': undefined, // byday: no offset
      'Clean toilets': 1, // second weekly
      'Deep clean bathroom': 0, // first monthly
    })
  })

  it('fills defaults for missing optional fields', () => {
    const bare = migrate({ people: [], chores: [] })
    expect(bare).toEqual({ schemaVersion: 2, people: [], chores: [], weekStartsOn: 1, done: {} })
  })

  it('passes a v2 blob through unchanged apart from defaults', () => {
    const again = migrate(JSON.parse(JSON.stringify(out)))
    expect(again).toEqual(out)
  })
})

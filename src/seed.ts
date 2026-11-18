import type { AppState } from './types'
import { weekNumber } from './week'

/** A small, friendly example so the app isn't blank on first open. */
export function seedState(): AppState {
  const people = [
    { id: 'p-alex', name: 'Alex', color: '#1f6feb' },
    { id: 'p-sam', name: 'Sam', color: '#e3742a' },
    { id: 'p-jordan', name: 'Jordan', color: '#2a9d4a' },
  ]
  return {
    schemaVersion: 2,
    people,
    weekStartsOn: 1,
    done: {},
    chores: [
      {
        id: 'c-dishwasher',
        name: 'Empty dishwasher',
        effort: 'light',
        timeOfDay: 'morning',
        schedule: { kind: 'weekly', days: [0, 1, 2, 3, 4, 5, 6] },
        assignment: { mode: 'rotate', period: 'daily', personIds: ['p-alex', 'p-sam', 'p-jordan'] },
        rotationOffset: 0,
      },
      {
        id: 'c-bins',
        name: 'Take out bins',
        notes: 'Kerbside collection',
        effort: 'light',
        timeOfDay: 'evening',
        schedule: { kind: 'weekly', days: [2] },
        assignment: { mode: 'rotate', period: 'weekly', personIds: ['p-alex', 'p-sam'] },
        rotationOffset: 0,
      },
      {
        id: 'c-vacuum',
        name: 'Vacuum living areas',
        effort: 'medium',
        timeOfDay: 'afternoon',
        schedule: { kind: 'weekly', days: [5] },
        assignment: { mode: 'manual', personId: 'p-sam' },
      },
      {
        id: 'c-lawn',
        name: 'Mow lawn',
        effort: 'heavy',
        timeOfDay: 'afternoon',
        schedule: { kind: 'weekly', days: [6] },
        assignment: { mode: 'manual', personId: 'p-jordan' },
      },
      {
        id: 'c-toilets',
        name: 'Clean toilets',
        effort: 'medium',
        timeOfDay: 'afternoon',
        schedule: { kind: 'weekly', days: [5], intervalWeeks: 2, anchorWeek: weekNumber(new Date()) },
        assignment: { mode: 'rotate', period: 'weekly', personIds: ['p-alex', 'p-sam', 'p-jordan'] },
        rotationOffset: 1,
      },
      {
        id: 'c-bathroom',
        name: 'Deep clean bathroom',
        effort: 'heavy',
        timeOfDay: 'afternoon',
        schedule: { kind: 'monthly', weekday: 5, nth: 1 }, // first Saturday
        assignment: { mode: 'rotate', period: 'weekly', personIds: ['p-alex', 'p-sam', 'p-jordan'] },
        rotationOffset: 0,
      },
    ],
  }
}

import type { AppState } from './types'
import { weekNumber } from './week'
import { migrate } from './migrate'
import { buildCalendar, buildTasks, calendarName } from './ics'

const KEY = 'roster.state.v1'

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

/** Basic shape guard so a corrupt/foreign JSON blob can't crash the app. */
function isValid(x: unknown): x is AppState {
  if (!x || typeof x !== 'object') return false
  const s = x as Record<string, unknown>
  return Array.isArray(s.people) && Array.isArray(s.chores)
}

export function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (isValid(parsed)) return migrate(parsed)
    }
  } catch {
    // fall through to seed
  }
  return seedState()
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

/** Debounced persist to localStorage. */
export function save(state: AppState): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      // storage full / disabled — nothing we can safely do here
    }
  }, 250)
}

export function clearStored(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

/** Trigger a browser download of `text` as `filename` with the given MIME type. */
function download(text: string, filename: string, type: string): void {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Trigger a download of the current roster as a JSON file. */
export function exportJson(state: AppState): void {
  download(JSON.stringify(state, null, 2), 'chore-roster.json', 'application/json')
}

/** How many weeks of occurrences a downloaded .ics file covers. */
const ICS_WEEKS = 8

/** A filename-safe stem from a person's name, or 'household'. */
function icsStem(state: AppState, personId?: string): string {
  const person = personId ? state.people.find((p) => p.id === personId) : undefined
  const base = person ? person.name : 'household'
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'chores'
}

/** Download an .ics of chore occurrences as calendar events (VEVENT). */
export function exportIcs(state: AppState, personId?: string): void {
  const ics = buildCalendar(state, {
    start: new Date(),
    weeks: ICS_WEEKS,
    personId,
    now: new Date(),
    name: calendarName(state, personId),
  })
  download(ics, `chores-${icsStem(state, personId)}.ics`, 'text/calendar')
}

/** Download an .ics of chore occurrences as tasks (VTODO), for reminder apps. */
export function exportTasksIcs(state: AppState, personId?: string): void {
  const ics = buildTasks(state, {
    start: new Date(),
    weeks: ICS_WEEKS,
    personId,
    now: new Date(),
    name: calendarName(state, personId),
  })
  download(ics, `chore-tasks-${icsStem(state, personId)}.ics`, 'text/calendar')
}

/** Read + validate a user-picked JSON file. Rejects on bad shape. */
export function importJson(file: File): Promise<AppState> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        if (isValid(parsed)) resolve(migrate(parsed))
        else reject(new Error('Not a valid roster file.'))
      } catch {
        reject(new Error('Could not read that file.'))
      }
    }
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.readAsText(file)
  })
}

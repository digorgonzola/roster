import type { AppState } from './types'
import { weekNumber } from './week'

const KEY = 'roster.state.v1'

/** A small, friendly example so the app isn't blank on first open. */
export function seedState(): AppState {
  const people = [
    { id: 1, name: 'Alex', color: '#1f6feb' },
    { id: 2, name: 'Sam', color: '#e3742a' },
    { id: 3, name: 'Jordan', color: '#2a9d4a' },
  ]
  return {
    people,
    weekStartsOn: 1,
    done: {},
    chores: [
      {
        id: 1,
        name: 'Empty dishwasher',
        effort: 'light',
        timeOfDay: 'morning',
        schedule: { kind: 'weekly', days: [0, 1, 2, 3, 4, 5, 6] },
        assignment: { mode: 'rotate', period: 'daily', personIds: [1, 2, 3] },
      },
      {
        id: 2,
        name: 'Take out bins',
        notes: 'Kerbside collection',
        effort: 'light',
        timeOfDay: 'evening',
        schedule: { kind: 'weekly', days: [2] },
        assignment: { mode: 'rotate', period: 'weekly', personIds: [1, 2] },
      },
      {
        id: 3,
        name: 'Vacuum living areas',
        effort: 'medium',
        timeOfDay: 'afternoon',
        schedule: { kind: 'weekly', days: [5] },
        assignment: { mode: 'manual', personId: 2 },
      },
      {
        id: 4,
        name: 'Mow lawn',
        effort: 'heavy',
        timeOfDay: 'afternoon',
        schedule: { kind: 'weekly', days: [6] },
        assignment: { mode: 'manual', personId: 3 },
      },
      {
        id: 5,
        name: 'Clean toilets',
        effort: 'medium',
        timeOfDay: 'afternoon',
        schedule: { kind: 'weekly', days: [5], intervalWeeks: 2, anchorWeek: weekNumber(new Date()) },
        assignment: { mode: 'rotate', period: 'weekly', personIds: [1, 2, 3] },
      },
      {
        id: 6,
        name: 'Deep clean bathroom',
        effort: 'heavy',
        timeOfDay: 'afternoon',
        schedule: { kind: 'monthly', weekday: 5, nth: 1 }, // first Saturday
        assignment: { mode: 'rotate', period: 'weekly', personIds: [1, 2, 3] },
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

/** Fill defaults for fields older saved states won't have (`done`). */
function normalize(parsed: AppState): AppState {
  return {
    ...parsed,
    weekStartsOn: parsed.weekStartsOn === 0 ? 0 : 1,
    done: parsed.done && typeof parsed.done === 'object' ? parsed.done : {},
  }
}

export function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (isValid(parsed)) return normalize(parsed)
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

/** Trigger a download of the current roster as a JSON file. */
export function exportJson(state: AppState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'chore-roster.json'
  a.click()
  URL.revokeObjectURL(url)
}

/** Read + validate a user-picked JSON file. Rejects on bad shape. */
export function importJson(file: File): Promise<AppState> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        if (isValid(parsed)) resolve(normalize(parsed))
        else reject(new Error('Not a valid roster file.'))
      } catch {
        reject(new Error('Could not read that file.'))
      }
    }
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.readAsText(file)
  })
}

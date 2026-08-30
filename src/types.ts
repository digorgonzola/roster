// ---- Data model -----------------------------------------------------------

/** Days are 0..6 == Monday..Sunday throughout the app (see week.ts). */
export type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type Effort = 'light' | 'medium' | 'heavy'

/** When in the day a chore happens, so a day reads morning → evening. */
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'anytime'

export interface Person {
  id: string
  name: string
  /** On-screen colour only. The print view relies on name + initials + pattern. */
  color: string
}

/** Recurring on one or more weekdays. */
export interface WeeklySchedule {
  kind: 'weekly'
  days: DayIndex[]
  /** How often, in weeks: 1 = weekly (default), 2 = fortnightly, 3, 4 = ~monthly. */
  intervalWeeks?: number
  /** Week-number phase: the chore occurs when (weekNumber - anchorWeek) % intervalWeeks === 0. */
  anchorWeek?: number
}

/** A single irregular chore on a specific calendar date. */
export interface OneOffSchedule {
  kind: 'oneoff'
  date: string // 'YYYY-MM-DD'
}

/** Which occurrence of a weekday within a month. 'last' = the final one. */
export type MonthlyNth = 1 | 2 | 3 | 4 | 'last'

/** Calendar-monthly, e.g. the first Saturday of each month. */
export interface MonthlySchedule {
  kind: 'monthly'
  weekday: DayIndex
  nth: MonthlyNth
}

export type Schedule = WeeklySchedule | OneOffSchedule | MonthlySchedule

/** One fixed person does it. */
export interface ManualAssignment {
  mode: 'manual'
  personId: string | null
}

/** Rotates one person forward across the listed people, each day or each week. */
export interface RotateAssignment {
  mode: 'rotate'
  /** 'weekly' = same person all week; 'daily' = advances every day. Missing = weekly. */
  period?: 'daily' | 'weekly'
  personIds: string[]
}

/** A fixed person per weekday, e.g. Tue → Jim, Wed → Bob. */
export interface ByDayAssignment {
  mode: 'byday'
  /** Keyed by DayIndex (0=Mon..6=Sun). Missing / null = unassigned that day. */
  byDay: Partial<Record<DayIndex, string | null>>
}

export type Assignment = ManualAssignment | RotateAssignment | ByDayAssignment

export interface Chore {
  id: string
  name: string
  notes?: string
  effort?: Effort
  /** Time slot for chronological ordering. Missing = 'anytime'. */
  timeOfDay?: TimeOfDay
  schedule: Schedule
  assignment: Assignment
  /**
   * Frozen rotation phase, assigned once at creation (or by migration).
   * Keeps rotations stable when the chores array is reordered or merged.
   */
  rotationOffset?: number
  /**
   * Seasonal on/off switch: true = the chore emits no occurrences anywhere
   * (roster, print, calendar feeds) but keeps its schedule, assignment and
   * rotation offset for when it's switched back on. Missing = on.
   */
  paused?: boolean
}

export interface AppState {
  /** Stored-blob schema version. Bump with a matching step in migrate.ts. */
  schemaVersion: 2
  people: Person[]
  chores: Chore[]
  /** 0 = week starts Sunday, 1 = week starts Monday. */
  weekStartsOn: 0 | 1
  /**
   * Household names for the day-parts, e.g. morning → "Before school".
   * Missing keys fall back to the defaults in timeofday.ts.
   */
  timeOfDayLabels?: Partial<Record<TimeOfDay, string>>
  /** Completed occurrences, keyed 'YYYY-MM-DD' → chore ids done that day. */
  done: Record<string, string[]>
}

/** A single expanded occurrence of a chore within a given week. */
export interface WeekEntry {
  chore: Chore
  dayIndex: DayIndex
  date: string // 'YYYY-MM-DD'
  assignee: Person | null
}

import type { AppState, WeekEntry } from './types'
import { entriesForWeek } from './schedule'
import { addDays, parseYmd, startOfWeek } from './week'
import { slotLabel, timeLabel } from './timeofday'

/**
 * iCalendar (RFC 5545) generation for chore occurrences.
 *
 * Pure and DOM-free so it runs both in the browser (the Settings download) and
 * in the Worker (the subscribable feed). It materialises one component per
 * occurrence — via the same `entriesForWeek` expander the app renders from —
 * rather than emitting compact RRULEs, because a rotating chore's assignee (and
 * therefore its title) changes every occurrence, which a single recurring event
 * can't express.
 *
 * Two flavours share the same occurrences:
 * - `buildCalendar` → VEVENT, the universal format. Every calendar app imports
 *   it, and a served feed keeps a subscribing calendar up to date.
 * - `buildTasks` → VTODO, for task apps that import them (Apple Reminders,
 *   Microsoft To Do). Note: subscribed calendars ignore VTODO, and Google Tasks
 *   imports neither — VTODO is a one-time-import convenience only.
 */

const PRODID = '-//roster//chore roster//EN'

export interface IcsOptions {
  /** First day to include; the window starts at the week containing it. */
  start: Date
  /** How many weeks of occurrences to materialise from `start`. */
  weeks: number
  /** Restrict to one person's chores; omit for the whole household. */
  personId?: string
  /** DTSTAMP value, injected so callers control it (and tests stay stable). */
  now: Date
  /** X-WR-CALNAME shown by many calendar apps as the calendar's name. */
  name?: string
}

/** Escape TEXT values per RFC 5545 §3.3.11 (backslash, comma, semicolon, newline). */
function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** 'YYYY-MM-DD' → DATE value 'YYYYMMDD'. */
function icsDate(ymd: string): string {
  return ymd.replace(/-/g, '')
}

/** A Date → UTC DATE-TIME value 'YYYYMMDDTHHMMSSZ'. */
function icsStamp(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return (
    `${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  )
}

/**
 * Fold one content line to ≤75 octets (RFC 5545 §3.1). Continuation lines begin
 * with a space, which counts toward the limit, and we never split a multi-byte
 * character. Folding on characters would be wrong for accented names/emoji, so
 * we measure UTF-8 byte length.
 */
function fold(line: string): string {
  const enc = new TextEncoder()
  const pieces: string[] = []
  let cur = ''
  let bytes = 0
  for (const ch of line) {
    const b = enc.encode(ch).length
    const limit = pieces.length === 0 ? 75 : 74 // continuations lose one octet to the leading space
    if (bytes + b > limit) {
      pieces.push(cur)
      cur = ch
      bytes = b
    } else {
      cur += ch
      bytes += b
    }
  }
  pieces.push(cur)
  return pieces.join('\r\n ')
}

/** Human title: "Wash dishes — Sam", or "(unassigned)" when nobody holds it. */
function summary(e: WeekEntry): string {
  return e.assignee ? `${e.chore.name} — ${e.assignee.name}` : `${e.chore.name} (unassigned)`
}

/** Description lines: time-of-day slot, effort, then any notes. */
function description(e: WeekEntry, state: AppState): string {
  const parts: string[] = [slotLabel(state.timeOfDayLabels, e.chore.timeOfDay ?? 'anytime')]
  if (e.chore.effort) parts.push(`Effort: ${e.chore.effort}`)
  if (e.chore.notes?.trim()) parts.push(e.chore.notes.trim())
  return parts.join('\n')
}

/**
 * Walk the window week by week and yield each occurrence once. De-duped by UID
 * so a chore that appears in overlapping expansions is never emitted twice.
 */
function occurrences(state: AppState, opts: IcsOptions): WeekEntry[] {
  const weekStart = startOfWeek(opts.start, state.weekStartsOn)
  const seen = new Set<string>()
  const out: WeekEntry[] = []
  for (let w = 0; w < opts.weeks; w++) {
    const ws = addDays(weekStart, w * 7)
    for (const e of entriesForWeek(state, ws)) {
      if (opts.personId && e.assignee?.id !== opts.personId) continue
      const uid = occurrenceUid(e)
      if (seen.has(uid)) continue
      seen.add(uid)
      out.push(e)
    }
  }
  return out
}

/** Stable per-occurrence id so re-fetching a feed updates rather than duplicates. */
function occurrenceUid(e: WeekEntry): string {
  return `${e.chore.id}.${e.date}@roster`
}

function wrap(name: string, body: string[]): string[] {
  return [`BEGIN:${name}`, ...body, `END:${name}`]
}

/** VEVENT for one occurrence, as an all-day event on its date. */
function vevent(e: WeekEntry, state: AppState, stamp: string): string[] {
  return wrap('VEVENT', [
    `UID:${occurrenceUid(e)}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${icsDate(e.date)}`,
    `DTEND;VALUE=DATE:${icsDate(nextYmd(e.date))}`,
    `SUMMARY:${escapeText(summary(e))}`,
    `DESCRIPTION:${escapeText(description(e, state))}`,
    ...(e.assignee ? [`CATEGORIES:${escapeText(e.assignee.name)}`] : []),
    'TRANSP:TRANSPARENT',
  ])
}

/** VTODO for one occurrence, due on its date. */
function vtodo(e: WeekEntry, state: AppState, stamp: string): string[] {
  return wrap('VTODO', [
    `UID:${occurrenceUid(e)}`,
    `DTSTAMP:${stamp}`,
    `DUE;VALUE=DATE:${icsDate(e.date)}`,
    `SUMMARY:${escapeText(summary(e))}`,
    `DESCRIPTION:${escapeText(description(e, state))}`,
    'STATUS:NEEDS-ACTION',
  ])
}

/** The day after a 'YYYY-MM-DD' date, as 'YYYY-MM-DD' (all-day DTEND is exclusive). */
function nextYmd(ymd: string): string {
  const d = addDays(parseYmd(ymd), 1)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function calendar(name: string, components: string[][]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    ...components.flat(),
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** A VEVENT calendar of chore occurrences in the window. */
export function buildCalendar(state: AppState, opts: IcsOptions): string {
  const stamp = icsStamp(opts.now)
  const events = occurrences(state, opts).map((e) => vevent(e, state, stamp))
  return calendar(opts.name ?? 'Chore roster', events)
}

/** A VTODO calendar (tasks) of chore occurrences in the window. */
export function buildTasks(state: AppState, opts: IcsOptions): string {
  const stamp = icsStamp(opts.now)
  const todos = occurrences(state, opts).map((e) => vtodo(e, state, stamp))
  return calendar(opts.name ?? 'Chore tasks', todos)
}

/** Default label for a person's or the household's calendar. */
export function calendarName(state: AppState, personId?: string): string {
  const person = personId ? state.people.find((p) => p.id === personId) : undefined
  return person ? `${person.name}'s chores` : 'Household chores'
}

// Re-exported so callers can label their own UI without re-deriving the mapping.
export { timeLabel }

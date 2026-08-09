import type { AppState, Chore, Person, TimeOfDay, WeekEntry } from './types'
import { DAY_NAMES, DAY_NAMES_LONG, parseYmd } from './week'

const NTH_LABEL: Record<string, string> = {
  '1': 'First', '2': 'Second', '3': 'Third', '4': 'Fourth', last: 'Last',
}

/** "9 Aug" for a 'YYYY-MM-DD' string. */
export function shortDate(dateStr: string): string {
  const d = parseYmd(dateStr)
  return `${d.getDate()} ${d.toLocaleDateString(undefined, { month: 'short' })}`
}

/** How often a weekly chore repeats, in words. Empty for plain weekly. */
export function intervalLabel(intervalWeeks: number | undefined): string {
  const iv = intervalWeeks && intervalWeeks > 1 ? intervalWeeks : 1
  if (iv === 1) return ''
  return iv === 2 ? 'every 2 weeks' : `every ${iv} weeks`
}

/** One-line rule summary for a chore list row, e.g. "Tue, Fri · afternoon". */
export function choreRuleSummary(c: Chore): string {
  const parts: string[] = []
  if (c.schedule.kind === 'weekly') {
    const { days, intervalWeeks } = c.schedule
    const dayStr = days.length === 7 ? 'Every day' : days.map((d) => DAY_NAMES[d]).join(', ')
    parts.push(dayStr)
    const iv = intervalLabel(intervalWeeks)
    if (iv) parts.push(iv)
  } else if (c.schedule.kind === 'monthly') {
    parts.push(`${NTH_LABEL[String(c.schedule.nth)]} ${DAY_NAMES_LONG[c.schedule.weekday]}`)
  } else {
    parts.push(`One-off · ${shortDate(c.schedule.date)}`)
  }
  if (c.timeOfDay && c.timeOfDay !== 'anytime') parts.push(c.timeOfDay)
  return parts.join(' · ')
}

/** True when the chore still needs a person somewhere in its assignment. */
export function needsPerson(c: Chore): boolean {
  const a = c.assignment
  if (a.mode === 'manual') return a.personId == null
  if (a.mode === 'rotate') return a.personIds.length === 0
  const days = c.schedule.kind === 'weekly' ? c.schedule.days : []
  return days.some((d) => a.byDay[d] == null)
}

/** Uppercase assignee tag for a chore list row: person, ROTATE, PER DAY or UNASSIGNED. */
export function assigneeTag(c: Chore, people: Person[]): string {
  if (needsPerson(c)) return 'Unassigned'
  const a = c.assignment
  if (a.mode === 'manual') return people.find((p) => p.id === a.personId)?.name ?? 'Unassigned'
  if (a.mode === 'rotate') return 'Rotate'
  return 'Per day'
}

/** Compact time-of-day tag for mobile rows. */
export function timeTag(t: TimeOfDay | undefined): string {
  switch (t) {
    case 'morning': return 'AM'
    case 'afternoon': return 'PM'
    case 'evening': return 'Eve'
    default: return 'Any'
  }
}

/** "Sunday 9 Aug" for a 'YYYY-MM-DD' string. */
export function longDate(dateStr: string): string {
  const d = parseYmd(dateStr)
  return `${DAY_NAMES_LONG[(d.getDay() + 6) % 7]} ${d.getDate()} ${d.toLocaleDateString(undefined, { month: 'short' })}`
}

/** Is this occurrence ticked off? */
export function isEntryDone(done: AppState['done'], entry: WeekEntry): boolean {
  return done[entry.date]?.includes(entry.chore.id) ?? false
}

/** Muted meta line for a "my day" row, e.g. "Heavy · every 2 weeks". */
export function myDayMeta(entry: WeekEntry, people: Person[]): string {
  const c = entry.chore
  if (c.assignment.mode === 'rotate' && c.assignment.personIds.length > 1) {
    const others = c.assignment.personIds
      .filter((id) => id !== entry.assignee?.id)
      .map((id) => people.find((p) => p.id === id)?.name)
      .filter(Boolean)
    if (others.length) return `Rotating with ${others.join(', ')} · your turn`
  }
  const parts: string[] = []
  if (c.effort && c.effort !== 'light') parts.push(c.effort[0].toUpperCase() + c.effort.slice(1))
  if (c.schedule.kind === 'weekly') {
    const iv = intervalLabel(c.schedule.intervalWeeks)
    if (iv) parts.push(iv)
  } else if (c.schedule.kind === 'monthly') {
    parts.push('monthly')
  } else {
    parts.push('one-off')
  }
  return parts.join(' · ')
}

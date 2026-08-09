import type { TimeOfDay } from './types'

/** Ordered day-parts so chores read chronologically (morning → evening). */
export const TIME_SLOTS: { key: TimeOfDay; label: string; hint: string }[] = [
  { key: 'morning', label: 'Morning', hint: 'before school' },
  { key: 'afternoon', label: 'Afternoon', hint: 'after school' },
  { key: 'evening', label: 'Evening', hint: 'before bed' },
  { key: 'anytime', label: 'Anytime', hint: 'no set time' },
]

const ORDER: Record<TimeOfDay, number> = {
  morning: 0,
  afternoon: 1,
  evening: 2,
  anytime: 3,
}

/** Sort key for a chore's time slot; undefined sorts as 'anytime' (last). */
export function timeOrder(t: TimeOfDay | undefined): number {
  return t ? ORDER[t] : ORDER.anytime
}

export function timeLabel(t: TimeOfDay | undefined): string {
  return (TIME_SLOTS.find((s) => s.key === t) ?? TIME_SLOTS[3]).label
}

/** The household's name for a slot, falling back to the default label. */
export function slotLabel(
  labels: Partial<Record<TimeOfDay, string>> | undefined,
  t: TimeOfDay,
): string {
  return labels?.[t] || timeLabel(t)
}

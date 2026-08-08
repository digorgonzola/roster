import type { AppState, WeekEntry } from '../types'
import { entriesForWeek } from '../schedule'
import { DAY_NAMES, daysOfWeek, toDayIndex } from '../week'
import { timeLabel, timeOrder } from '../timeofday'
import { PersonChip } from './PersonChip'

interface Props {
  state: AppState
  weekStart: Date
}

export function WeekView({ state, weekStart }: Props) {
  const entries = entriesForWeek(state, weekStart)
  const cols = daysOfWeek(weekStart)

  // Chores that actually occur this week, in first-seen order.
  const choreOrder: number[] = []
  const map = new Map<string, WeekEntry>()
  for (const e of entries) {
    if (!choreOrder.includes(e.chore.id)) choreOrder.push(e.chore.id)
    map.set(`${e.chore.id}:${e.dayIndex}`, e)
  }
  const choresThisWeek = choreOrder
    .map((id) => state.chores.find((c) => c.id === id)!)
    .filter(Boolean)
    .sort((a, b) => timeOrder(a.timeOfDay) - timeOrder(b.timeOfDay) || a.name.localeCompare(b.name))

  if (choresThisWeek.length === 0) {
    return (
      <div className="weekview empty">
        <p className="muted">No chores scheduled this week. Add some above, or step to another week.</p>
      </div>
    )
  }

  return (
    <div className="weekview">
      <table className="roster-grid">
        <thead>
          <tr>
            <th className="corner">Chore</th>
            {cols.map((d) => (
              <th key={d.toISOString()}>
                <span className="dow">{DAY_NAMES[toDayIndex(d)]}</span>
                <span className="dom">{d.getDate()}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {choresThisWeek.map((c) => (
            <tr key={c.id}>
              <th scope="row" className="chore-cell">
                <span className="chore-name">{c.name}</span>
                <span className={`time-tag t-${c.timeOfDay ?? 'anytime'}`}>{timeLabel(c.timeOfDay)}</span>
                {c.notes && <span className="chore-sub">{c.notes}</span>}
              </th>
              {cols.map((d) => {
                const entry = map.get(`${c.id}:${toDayIndex(d)}`)
                return (
                  <td key={d.toISOString()} className={entry ? 'on' : ''}>
                    {entry && (
                      <span className="cell-inner">
                        <span className="tick" aria-hidden />
                        <PersonChip person={entry.assignee} compact />
                      </span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

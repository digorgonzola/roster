import type { AppState, WeekEntry } from '../types'
import { entriesForWeek } from '../schedule'
import { DAY_NAMES, daysOfWeek, toDayIndex, weekLabel } from '../week'
import { initials, patternFor } from '../palette'
import { timeLabel, timeOrder } from '../timeofday'

export type PrintLayout = 'grid' | 'cards'

interface Props {
  state: AppState
  weekStart: Date
  layout: PrintLayout
}

export function PrintRoster({ state, weekStart, layout }: Props) {
  const entries = entriesForWeek(state, weekStart)
  return (
    <div className="print-root">
      <header className="print-header">
        <h1>Household Chore Roster</h1>
        <p className="print-week">Week of {weekLabel(weekStart)}</p>
      </header>

      {layout === 'grid'
        ? <GridLayout state={state} weekStart={weekStart} entries={entries} />
        : <CardsLayout state={state} entries={entries} />}

      <Legend state={state} />
    </div>
  )
}

function GridLayout({ state, weekStart, entries }: { state: AppState; weekStart: Date; entries: WeekEntry[] }) {
  const cols = daysOfWeek(weekStart)
  const choreOrder: number[] = []
  const map = new Map<string, WeekEntry>()
  for (const e of entries) {
    if (!choreOrder.includes(e.chore.id)) choreOrder.push(e.chore.id)
    map.set(`${e.chore.id}:${e.dayIndex}`, e)
  }
  const chores = choreOrder
    .map((id) => state.chores.find((c) => c.id === id)!)
    .filter(Boolean)
    .sort((a, b) => timeOrder(a.timeOfDay) - timeOrder(b.timeOfDay) || a.name.localeCompare(b.name))

  if (chores.length === 0) return <p className="print-empty">No chores scheduled this week.</p>

  return (
    <table className="print-grid">
      <thead>
        <tr>
          <th className="corner">Chore</th>
          {cols.map((d) => (
            <th key={d.toISOString()}>
              {DAY_NAMES[toDayIndex(d)]}<br />
              <span className="pg-date">{d.getDate()}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {chores.map((c) => (
          <tr key={c.id}>
            <th scope="row" className="pg-chore">
              {c.name}
              <span className="pg-time">{timeLabel(c.timeOfDay)}</span>
            </th>
            {cols.map((d) => {
              const e = map.get(`${c.id}:${toDayIndex(d)}`)
              return (
                <td key={d.toISOString()} className={e ? 'pg-on' : 'pg-off'}>
                  {e && (
                    <span className="pg-cell">
                      <span className="pg-tick" />
                      <PrintName person={e.assignee} />
                    </span>
                  )}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function CardsLayout({ state, entries }: { state: AppState; entries: WeekEntry[] }) {
  // Group entries by assignee id (null bucket for unassigned).
  const byPerson = new Map<number | 'none', WeekEntry[]>()
  for (const e of entries) {
    const key = e.assignee ? e.assignee.id : 'none'
    if (!byPerson.has(key)) byPerson.set(key, [])
    byPerson.get(key)!.push(e)
  }

  const cards = state.people
    .map((p) => ({ person: p, items: byPerson.get(p.id) ?? [] }))
    .filter((c) => c.items.length > 0)

  const unassigned = byPerson.get('none') ?? []

  if (cards.length === 0 && unassigned.length === 0)
    return <p className="print-empty">No chores scheduled this week.</p>

  return (
    <div className="print-cards">
      {cards.map(({ person, items }) => (
        <div key={person.id} className="print-card">
          <div className="pc-head">
            <span className={`pc-swatch pat-${patternFor(person.color)}`} style={{ ['--pc' as string]: person.color }} />
            <span className="pc-name">{person.name}</span>
            <span className="pc-initials">{initials(person.name)}</span>
          </div>
          <ul className="pc-list">
            {sortByDay(items).map((e, i) => (
              <li key={i}>
                <span className="pc-tick" />
                <span className="pc-day">{DAY_NAMES[e.dayIndex]}</span>
                <span className="pc-time">{timeLabel(e.chore.timeOfDay)}</span>
                <span className="pc-chore">{e.chore.name}</span>
                {e.chore.notes && <span className="pc-note">{e.chore.notes}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {unassigned.length > 0 && (
        <div className="print-card unassigned">
          <div className="pc-head">
            <span className="pc-swatch pat-solid" style={{ ['--pc' as string]: '#ffffff' }} />
            <span className="pc-name">Unassigned</span>
          </div>
          <ul className="pc-list">
            {sortByDay(unassigned).map((e, i) => (
              <li key={i}>
                <span className="pc-tick" />
                <span className="pc-day">{DAY_NAMES[e.dayIndex]}</span>
                <span className="pc-time">{timeLabel(e.chore.timeOfDay)}</span>
                <span className="pc-chore">{e.chore.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Legend({ state }: { state: AppState }) {
  if (state.people.length === 0) return null
  return (
    <div className="print-legend">
      <span className="pl-title">Key:</span>
      {state.people.map((p) => (
        <span key={p.id} className="pl-item">
          <span className={`pc-swatch pat-${patternFor(p.color)}`} style={{ ['--pc' as string]: p.color }} />
          {p.name} ({initials(p.name)})
        </span>
      ))}
    </div>
  )
}

function PrintName({ person }: { person: WeekEntry['assignee'] }) {
  if (!person) return <span className="pg-name none">—</span>
  return (
    <span className="pg-name">
      <span className={`pg-swatch pat-${patternFor(person.color)}`} style={{ ['--pc' as string]: person.color }} />
      {person.name}
    </span>
  )
}

function sortByDay(items: WeekEntry[]): WeekEntry[] {
  return [...items].sort(
    (a, b) =>
      a.dayIndex - b.dayIndex ||
      timeOrder(a.chore.timeOfDay) - timeOrder(b.chore.timeOfDay) ||
      a.chore.name.localeCompare(b.chore.name),
  )
}

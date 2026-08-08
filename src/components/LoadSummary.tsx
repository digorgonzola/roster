import type { AppState } from '../types'
import { entriesForWeek } from '../schedule'
import { Swatch } from './PersonChip'

interface Props {
  state: AppState
  weekStart: Date
}

/**
 * Per-person chore count for the week, as bars, so it's obvious at a glance who
 * is carrying the most and whether the load is even. Screen-only (inside the
 * no-print area) — it's a planning aid, not part of the printed roster.
 */
export function LoadSummary({ state, weekStart }: Props) {
  const entries = entriesForWeek(state, weekStart)

  const counts = new Map<number, number>()
  let unassigned = 0
  for (const e of entries) {
    if (e.assignee) counts.set(e.assignee.id, (counts.get(e.assignee.id) ?? 0) + 1)
    else unassigned++
  }

  const rows = state.people.map((p) => ({ person: p, n: counts.get(p.id) ?? 0 }))
  const max = Math.max(1, ...rows.map((r) => r.n))
  const total = rows.reduce((s, r) => s + r.n, 0)
  const busiest = Math.max(0, ...rows.map((r) => r.n))
  const quietest = rows.length ? Math.min(...rows.map((r) => r.n)) : 0
  const uneven = busiest - quietest

  if (state.people.length === 0) return null

  return (
    <section className="panel load-panel">
      <div className="panel-head">
        <h2>Workload this week</h2>
        {rows.length > 1 && (
          <span className={`balance-pill ${uneven <= 1 ? 'ok' : uneven <= 3 ? 'warn' : 'bad'}`}>
            {uneven === 0 ? 'Perfectly even' : uneven <= 1 ? 'Well balanced' : `Off by ${uneven}`}
          </span>
        )}
      </div>

      {total === 0 ? (
        <p className="muted">No chores assigned this week.</p>
      ) : (
        <ul className="load-list">
          {rows
            .slice()
            .sort((a, b) => b.n - a.n || a.person.name.localeCompare(b.person.name))
            .map(({ person, n }) => (
              <li key={person.id} className={`load-row${n === busiest && n > 0 ? ' top' : ''}`}>
                <span className="load-name">
                  <Swatch color={person.color} />
                  {person.name}
                </span>
                <span className="load-bar">
                  <span
                    className="load-fill"
                    style={{ width: `${(n / max) * 100}%`, background: person.color }}
                  />
                </span>
                <span className="load-count">{n}</span>
              </li>
            ))}
          {unassigned > 0 && (
            <li className="load-row unassigned">
              <span className="load-name">Unassigned</span>
              <span className="load-bar">
                <span className="load-fill none" style={{ width: `${(unassigned / max) * 100}%` }} />
              </span>
              <span className="load-count">{unassigned}</span>
            </li>
          )}
        </ul>
      )}
    </section>
  )
}

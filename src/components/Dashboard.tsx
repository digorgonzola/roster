import type { AppState, WeekEntry } from '../types'
import { entriesForWeek } from '../schedule'
import { DAY_NAMES, daysOfWeek, toDayIndex, ymd } from '../week'
import { TIME_SLOTS, slotLabel } from '../timeofday'
import { isEntryDone } from '../labels'
import { Avatar } from './Avatar'

export type DashboardView = 'grid' | 'lanes'

export interface AssignTarget {
  choreId: string
  date: string
}

interface Props {
  state: AppState
  weekStart: Date
  view: DashboardView
  onViewChange: (v: DashboardView) => void
  personFilter: string | null
  onFilterChange: (id: string | null) => void
  onOpenChore: (id: string) => void
  onAssign: (target: AssignTarget) => void
  onAddChore: () => void
  onExport: () => void
}

export function Dashboard(props: Props) {
  const { state, weekStart, view, personFilter } = props
  const entries = entriesForWeek(state, weekStart)
  const cols = daysOfWeek(weekStart)
  const todayStr = ymd(new Date())
  const unassigned = entries.filter((e) => !e.assignee)

  const chip = (e: WeekEntry, compact = false) => {
    const done = isEntryDone(state.done, e)
    const dim = personFilter !== null && e.assignee?.id !== personFilter
    const cls = [
      'chip',
      e.assignee ? '' : 'chip-unassigned',
      done ? 'chip-done' : '',
      dim ? 'chip-dim' : '',
    ].filter(Boolean).join(' ')
    return (
      <button
        key={`${e.chore.id}:${e.date}`}
        className={cls}
        onClick={() => (e.assignee ? props.onOpenChore(e.chore.id) : props.onAssign({ choreId: e.chore.id, date: e.date }))}
        title={e.assignee ? `${e.chore.name} — ${e.assignee.name}` : `${e.chore.name} — unassigned, click to assign`}
      >
        {!compact && <Avatar person={e.assignee} size={18} />}
        <span className="chip-name">{e.chore.name}</span>
      </button>
    )
  }

  return (
    <div className="dashboard">
      {state.chores.length > 0 && (
      <div className="filter-bar no-print">
        <span className="filter-label">Filter</span>
        <button
          className={`tag ${personFilter === null ? 'tag-outline' : 'tag-neutral'}`}
          onClick={() => props.onFilterChange(null)}
        >
          Everyone
        </button>
        {state.people.map((p) => (
          <button
            key={p.id}
            className={`tag ${personFilter === p.id ? 'tag-outline' : 'tag-neutral'}`}
            onClick={() => props.onFilterChange(personFilter === p.id ? null : p.id)}
          >
            {p.name}
          </button>
        ))}
        <span className="filter-right">
          <span className="seg">
            <label className="seg-opt">
              <input type="radio" name="dashview" checked={view === 'grid'} onChange={() => props.onViewChange('grid')} />
              Grid
            </label>
            <label className="seg-opt">
              <input type="radio" name="dashview" checked={view === 'lanes'} onChange={() => props.onViewChange('lanes')} />
              People
            </label>
          </span>
          <span className="unassigned-count">Unassigned · {unassigned.length}</span>
        </span>
      </div>
      )}

      <div className="dash-body">
        {state.chores.length === 0 ? (
          <div className="dash-empty">
            <h4>No chores yet</h4>
            <p className="text-muted">
              This grid shows who does what across the week. Add the first
              chore and it appears here on its scheduled days.
            </p>
            <button className="btn btn-primary" onClick={props.onAddChore}>Add a chore</button>
          </div>
        ) : view === 'grid' ? (
          <div className="week-grid">
            <div className="wg-corner" />
            {cols.map((d) => {
              const isToday = ymd(d) === todayStr
              return (
                <div key={d.toISOString()} className={`wg-day${isToday ? ' today' : ''}`}>
                  {DAY_NAMES[toDayIndex(d)]} {d.getDate()}{isToday ? ' · today' : ''}
                </div>
              )
            })}
            {TIME_SLOTS.map((slot) => (
              <div key={slot.key} className="wg-row">
                <div className="wg-slot">{slotLabel(state.timeOfDayLabels, slot.key)}</div>
                {cols.map((d) => {
                  const isToday = ymd(d) === todayStr
                  const cellEntries = entries.filter(
                    (e) => e.dayIndex === toDayIndex(d) && (e.chore.timeOfDay ?? 'anytime') === slot.key,
                  )
                  return (
                    <div key={d.toISOString()} className={`wg-cell${isToday ? ' today' : ''}`}>
                      {cellEntries.map((e) => chip(e))}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        ) : (
          <div className="lanes">
            <div className="lane lane-head">
              <div className="lane-person">Person</div>
              {cols.map((d) => {
                const isToday = ymd(d) === todayStr
                return (
                  <div key={d.toISOString()} className={`wg-day${isToday ? ' today' : ''}`}>
                    {DAY_NAMES[toDayIndex(d)]}
                  </div>
                )
              })}
            </div>
            {state.people.map((p) => (
              <div key={p.id} className="lane">
                <div className="lane-person">
                  <Avatar person={p} size={24} />
                  <strong>{p.name}</strong>
                </div>
                {cols.map((d) => (
                  <div key={d.toISOString()} className={`lane-cell${ymd(d) === todayStr ? ' today' : ''}`}>
                    {entries
                      .filter((e) => e.dayIndex === toDayIndex(d) && e.assignee?.id === p.id)
                      .map((e) => chip(e, true))}
                  </div>
                ))}
              </div>
            ))}
            {unassigned.length > 0 && (
              <div className="lane lane-unassigned">
                <div className="lane-person">
                  <Avatar person={null} size={24} />
                  <strong>Unassigned</strong>
                </div>
                {cols.map((d) => (
                  <div key={d.toISOString()} className="lane-cell">
                    {unassigned.filter((e) => e.dayIndex === toDayIndex(d)).map((e) => chip(e, true))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {state.chores.length > 0 && (
        <aside className="rail no-print">
          <RailLoad state={state} entries={entries} />
          <hr className="hr" />
          <h6>Needs a person</h6>
          {unassigned.length === 0 ? (
            <p className="text-muted rail-empty">Everything has a person.</p>
          ) : (
            unassigned.map((e) => (
              <button
                key={`${e.chore.id}:${e.date}`}
                className="rail-assign"
                onClick={() => props.onAssign({ choreId: e.chore.id, date: e.date })}
              >
                <span>{e.chore.name} · {DAY_NAMES[e.dayIndex]}</span>
                <span className="rail-assign-cta">Assign</span>
              </button>
            ))
          )}
          <hr className="hr" />
          <button className="btn btn-secondary btn-block" onClick={props.onAddChore}>Add chore</button>
          <button className="btn btn-secondary btn-block" onClick={props.onExport}>Export JSON</button>
        </aside>
        )}
      </div>
    </div>
  )
}

function RailLoad({ state, entries }: { state: AppState; entries: WeekEntry[] }) {
  const counts = new Map<string, number>()
  for (const e of entries) {
    if (e.assignee) counts.set(e.assignee.id, (counts.get(e.assignee.id) ?? 0) + 1)
  }
  const max = Math.max(1, ...state.people.map((p) => counts.get(p.id) ?? 0))
  return (
    <>
      <h6>Load this week</h6>
      {state.people.length === 0 && <p className="text-muted rail-empty">No people yet.</p>}
      {state.people.map((p) => {
        const n = counts.get(p.id) ?? 0
        return (
          <div key={p.id} className="rail-load">
            <span className="rail-load-name">{p.name}<span className="rail-load-n">{n}</span></span>
            <span className="rail-load-bar"><span style={{ width: `${(n / max) * 100}%` }} /></span>
          </div>
        )
      })}
    </>
  )
}

import type { AppState, WeekEntry } from '../types'
import { entriesForWeek } from '../schedule'
import { DAY_NAMES, daysOfWeek, toDayIndex, weekLabelLong } from '../week'
import { initials, patternFor } from '../palette'
import { TIME_SLOTS, slotLabel } from '../timeofday'
import type { PrintOptions } from './PrintPanel'

export type PrintLayout = 'grid' | 'cards'

interface Props {
  state: AppState
  weekStart: Date
  layout: PrintLayout
  options: PrintOptions
}

export function PrintRoster({ state, weekStart, layout, options }: Props) {
  let entries = entriesForWeek(state, weekStart)
  if (options.hideUnassigned) entries = entries.filter((e) => e.assignee)

  const printedOn = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className={`print-root print-${layout}`}>
      {/* @page can't be scoped by class, so the layout injects its own sheet size. */}
      <style>{`@media print { @page { size: A4 ${layout === 'grid' ? 'landscape' : 'portrait'}; margin: 12mm; } }`}</style>

      <header className="pr-masthead">
        <div className="pr-masthead-left">
          <span className="pr-kicker">Household roster</span>
          <h1 className="pr-week">{weekLabelLong(weekStart)}</h1>
        </div>
        <div className="pr-masthead-right">
          {layout === 'cards' && <span className="pr-cut">Cut along the rules · one card each</span>}
          {options.personKey && layout === 'grid' && (
            <span className="pr-key">
              {state.people.map((p) => (
                <span key={p.id} className="pr-key-item">
                  <PrintSwatch color={p.color} label={initials(p.name)} />
                  <b>{p.name}</b>
                </span>
              ))}
            </span>
          )}
        </div>
      </header>

      {layout === 'grid'
        ? <PrintGrid state={state} weekStart={weekStart} entries={entries} options={options} />
        : <PrintCards state={state} entries={entries} options={options} />}

      <footer className="pr-footer">
        <span>
          {layout === 'grid'
            ? "Tick it when it's done."
            : 'Swatch = colour + pattern, so the card still reads photocopied.'}
        </span>
        <span>Printed {printedOn}</span>
      </footer>
    </div>
  )
}

function PrintSwatch({ color, label }: { color: string; label?: string }) {
  return (
    <span className={`pr-swatch pat-${patternFor(color)}`} style={{ ['--pc' as string]: color }}>
      {label && <span className="pr-swatch-label">{label}</span>}
    </span>
  )
}

function Entry({ e, options }: { e: WeekEntry; options: PrintOptions }) {
  return (
    <div className="pr-entry">
      {options.tickBoxes && <span className="pr-tick" />}
      <span className="pr-entry-text">
        <b className="pr-entry-initials">{e.assignee ? initials(e.assignee.name) : '—'}</b>{' '}
        {e.chore.name}
        {options.notes && e.chore.notes && <span className="pr-entry-note"> · {e.chore.notes}</span>}
      </span>
    </div>
  )
}

function PrintGrid({ state, weekStart, entries, options }: {
  state: AppState
  weekStart: Date
  entries: WeekEntry[]
  options: PrintOptions
}) {
  const cols = daysOfWeek(weekStart)
  if (state.chores.length === 0) return <p className="pr-empty">No chores scheduled this week.</p>

  return (
    <div className="pr-grid">
      <div className="pr-grid-corner" />
      {cols.map((d) => (
        <div key={d.toISOString()} className="pr-grid-day">
          <b>{DAY_NAMES[toDayIndex(d)]}</b>
          <span>{d.getDate()} {d.toLocaleDateString(undefined, { month: 'short' })}</span>
        </div>
      ))}
      {TIME_SLOTS.map((slot) => (
        <div key={slot.key} className="pr-grid-row">
          <div className="pr-grid-slot">{slotLabel(state.timeOfDayLabels, slot.key)}</div>
          {cols.map((d) => (
            <div key={d.toISOString()} className="pr-grid-cell">
              {entries
                .filter((e) => e.dayIndex === toDayIndex(d) && (e.chore.timeOfDay ?? 'anytime') === slot.key)
                .map((e) => <Entry key={`${e.chore.id}:${e.date}`} e={e} options={options} />)}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function PrintCards({ state, entries, options }: {
  state: AppState
  entries: WeekEntry[]
  options: PrintOptions
}) {
  const byPerson = new Map<string | 'none', WeekEntry[]>()
  for (const e of entries) {
    const key = e.assignee ? e.assignee.id : 'none'
    if (!byPerson.has(key)) byPerson.set(key, [])
    byPerson.get(key)!.push(e)
  }
  const cards = state.people
    .map((p) => ({ person: p, items: byPerson.get(p.id) ?? [] }))
    .filter((c) => c.items.length > 0)
  const unassigned = options.hideUnassigned ? [] : (byPerson.get('none') ?? [])

  if (cards.length === 0 && unassigned.length === 0)
    return <p className="pr-empty">No chores scheduled this week.</p>

  const dayRows = (items: WeekEntry[]) => {
    const byDay = new Map<number, WeekEntry[]>()
    for (const e of items) {
      if (!byDay.has(e.dayIndex)) byDay.set(e.dayIndex, [])
      byDay.get(e.dayIndex)!.push(e)
    }
    return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, dayItems]) => (
      <div key={day} className="pr-card-dayrow">
        <span className="pr-card-day">{DAY_NAMES[day]}</span>
        <span className="pr-card-lines">
          {dayItems.map((e) => (
            <span key={`${e.chore.id}:${e.date}`} className="pr-card-line">
              {options.tickBoxes && <span className="pr-tick" />}
              {e.chore.name}
              {options.notes && e.chore.notes && <span className="pr-entry-note"> · {e.chore.notes}</span>}
            </span>
          ))}
        </span>
      </div>
    ))
  }

  return (
    <div className="pr-cards">
      {cards.map(({ person, items }) => (
        <div key={person.id} className="pr-card">
          <div className="pr-card-head">
            {options.personKey && <PrintSwatch color={person.color} label={initials(person.name)} />}
            <b className="pr-card-name">{person.name}</b>
            <span className="pr-card-jobs">{items.length} job{items.length === 1 ? '' : 's'}</span>
          </div>
          {dayRows(items)}
        </div>
      ))}
      {unassigned.length > 0 && (
        <div className="pr-card pr-card-unassigned">
          <div className="pr-card-head">
            <b className="pr-card-name">Unassigned</b>
            <span className="pr-card-jobs">{unassigned.length}</span>
          </div>
          {dayRows(unassigned)}
        </div>
      )}
    </div>
  )
}

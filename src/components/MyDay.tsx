import type { AppState, Person, WeekEntry } from '../types'
import { entriesForWeek } from '../schedule'
import { startOfWeek, ymd } from '../week'
import { TIME_SLOTS } from '../timeofday'
import { isEntryDone, longDate, myDayMeta } from '../labels'
import { Avatar } from './Avatar'

interface Props {
  state: AppState
  person: Person | null
  onPersonChange: (id: number) => void
  onToggleDone: (date: string, choreId: number) => void
}

/** Mobile "my day": one family member's chores for today, tick to complete. */
export function MyDay({ state, person, onPersonChange, onToggleDone }: Props) {
  const today = new Date()
  const todayStr = ymd(today)
  const weekStart = startOfWeek(today, state.weekStartsOn)
  const entries = entriesForWeek(state, weekStart).filter(
    (e) => e.date === todayStr && e.assignee && person && e.assignee.id === person.id,
  )
  const doneCount = entries.filter((e) => isEntryDone(state.done, e)).length

  const row = (e: WeekEntry) => {
    const done = isEntryDone(state.done, e)
    const meta = myDayMeta(e, state.people)
    return (
      <button
        key={`${e.chore.id}:${e.date}`}
        className={`myday-row${done ? ' done' : ''}`}
        onClick={() => onToggleDone(e.date, e.chore.id)}
      >
        <span className="myday-check" aria-hidden>{done && '✓'}</span>
        <span className="myday-row-text">
          <span className="myday-row-name">{e.chore.name}</span>
          {meta && <span className="myday-row-meta text-muted">{meta}</span>}
        </span>
      </button>
    )
  }

  return (
    <div className="myday">
      <header className="myday-header">
        <div className="myday-header-top">
          <span className="myday-date">{longDate(todayStr)}</span>
          {state.people.length > 1 && (
            <span className="myday-switch">
              {state.people.map((p) => (
                <button
                  key={p.id}
                  className={`myday-switch-btn${person?.id === p.id ? ' on' : ''}`}
                  onClick={() => onPersonChange(p.id)}
                  aria-label={`Show ${p.name}'s day`}
                >
                  <Avatar person={p} size={24} />
                </button>
              ))}
            </span>
          )}
        </div>
        <h2>{person ? `${person.name}'s day` : 'Today'}</h2>
        {entries.length > 0 && (
          <div className="myday-progress">
            <span className="myday-progress-bar">
              <span style={{ width: `${(doneCount / entries.length) * 100}%` }} />
            </span>
            <span className="myday-progress-count">{doneCount} / {entries.length}</span>
          </div>
        )}
      </header>

      <div className="myday-body">
        {person === null ? (
          <p className="text-muted">Add people on the People tab first.</p>
        ) : (
          <>
            {TIME_SLOTS.map((slot) => {
              const slotEntries = entries.filter((e) => (e.chore.timeOfDay ?? 'anytime') === slot.key)
              if (slotEntries.length === 0) return null
              return (
                <section key={slot.key} className="myday-slot">
                  <h6>{slot.label}</h6>
                  {slotEntries.map(row)}
                </section>
              )
            })}
            <div className="myday-empty text-muted">
              {entries.length === 0
                ? `Nothing today — enjoy it, ${person.name}.`
                : doneCount === entries.length
                  ? 'All done for today.'
                  : 'Nothing else today'}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

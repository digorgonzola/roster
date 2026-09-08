import { Fragment, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import type { AppState, Chore, DayIndex, Person, TimeOfDay } from '../types'
import { entriesForWeek } from '../schedule'
import { PALETTE, nextColor, patternFor } from '../palette'
import { DAY_NAMES, DAY_NAMES_LONG } from '../week'
import { slotLabel } from '../timeofday'
import {
  DAY_PARTS,
  blockedParts,
  isAllDayUnavailable,
  unavailabilitySummary,
  withDayToggled,
  withPartToggled,
} from '../availability'
import { Avatar, Swatch } from './Avatar'

interface Props {
  state: AppState
  weekStart: Date
  onAdd: (name: string, color: string) => void
  onUpdate: (person: Person) => void
  onDelete: (id: string) => void
}

function patternLabel(color: string): string {
  const name = patternFor(color)
  return name[0].toUpperCase() + name.slice(1)
}

function choreCount(chores: Chore[], personId: string): number {
  return chores.filter((c) => {
    const a = c.assignment
    if (a.mode === 'manual') return a.personId === personId
    if (a.mode === 'rotate') return a.personIds.includes(personId)
    return Object.values(a.byDay).includes(personId)
  }).length
}

export function PeoplePage({ state, weekStart, onAdd, onUpdate, onDelete }: Props) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(() => nextColor(state.people.map((p) => p.color)))
  const [availabilityFor, setAvailabilityFor] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  const entries = entriesForWeek(state, weekStart)
  const counts = new Map<string, number>()
  for (const e of entries) {
    if (e.assignee) counts.set(e.assignee.id, (counts.get(e.assignee.id) ?? 0) + 1)
  }
  const max = Math.max(1, ...state.people.map((p) => counts.get(p.id) ?? 0))

  const add = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onAdd(trimmed, color)
    setName('')
    setColor(nextColor([...state.people.map((p) => p.color), color]))
  }

  return (
    <div className="page-narrow">
      <div className="page-title">
        <h2>Household</h2>
        <button className="btn btn-primary" onClick={() => nameRef.current?.focus()}>
          <Plus size={16} /> Add person
        </button>
      </div>

      {state.people.length === 0 ? (
        <p className="text-muted">No people yet — add the members of your household below.</p>
      ) : (
        <table className="table people-table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Swatch</th>
              <th className="pt-wide">Chores</th>
              <th className="pt-wide">Week load</th>
              <th>Unavailable</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.people.map((p) => {
              const n = counts.get(p.id) ?? 0
              const editingAvailability = availabilityFor === p.id
              const summary = unavailabilitySummary(p)
              return (
                <Fragment key={p.id}>
                <tr>
                  <td>
                    <div className="pt-person">
                      <Avatar person={p} size={24} />
                      <input
                        className="pt-name"
                        value={p.name}
                        onChange={(e) => onUpdate({ ...p, name: e.target.value })}
                        aria-label={`Name for ${p.name}`}
                      />
                    </div>
                  </td>
                  <td className="pt-swatch">
                    <button
                      className="pt-swatch-btn"
                      title="Change swatch"
                      onClick={() => {
                        const i = PALETTE.indexOf(p.color as (typeof PALETTE)[number])
                        onUpdate({ ...p, color: PALETTE[(i + 1) % PALETTE.length] })
                      }}
                    >
                      <Swatch color={p.color} size={16} />
                      <span className="text-muted">{patternLabel(p.color)}</span>
                    </button>
                  </td>
                  <td className="pt-count pt-wide">{choreCount(state.chores, p.id)}</td>
                  <td className="pt-wide">
                    <span className="pt-load"><span style={{ width: `${(n / max) * 100}%` }} /></span>
                  </td>
                  <td className="pt-avail">
                    <button
                      className={`pt-avail-btn${summary ? '' : ' text-muted'}`}
                      aria-expanded={editingAvailability}
                      onClick={() => setAvailabilityFor(editingAvailability ? null : p.id)}
                    >
                      {summary || 'Always free'}
                    </button>
                  </td>
                  <td className="pt-actions">
                    <button className="btn btn-ghost" onClick={() => onDelete(p.id)} aria-label={`Remove ${p.name}`}>
                      Remove
                    </button>
                  </td>
                </tr>
                {editingAvailability && (
                  <tr className="pt-avail-row">
                    <td colSpan={6}>
                      <AvailabilityGrid person={p} labels={state.timeOfDayLabels} onUpdate={onUpdate} />
                    </td>
                  </tr>
                )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      )}

      <hr className="hr" />
      <h6>Add person</h6>
      <div className="add-person">
        <div className="field add-person-name">
          <label>Name</label>
          <input
            ref={nameRef}
            className="input"
            type="text"
            placeholder="e.g. Nan"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
        </div>
        <div className="field">
          <label>Swatch</label>
          <div className="swatch-picker" role="group" aria-label="Swatch">
            {PALETTE.map((c) => (
              <button
                key={c}
                className={`swatch-pick${color === c ? ' selected' : ''}`}
                onClick={() => setColor(c)}
                title={`${patternLabel(c)}`}
              >
                <Swatch color={c} size={22} />
              </button>
            ))}
          </div>
        </div>
        <button className="btn btn-secondary add-person-btn" onClick={add}>Add</button>
      </div>
      <p className="text-muted footnote">Swatch is colour + pattern, so the printed roster still reads in black and white.</p>
    </div>
  )
}

/**
 * Weekday × day-part toggles for a person's standing commitments. A day
 * header blocks or frees the whole day; each cell blocks one part.
 */
function AvailabilityGrid({ person, labels, onUpdate }: {
  person: Person
  labels: Partial<Record<TimeOfDay, string>> | undefined
  onUpdate: (person: Person) => void
}) {
  return (
    <div className="avail">
      <div className="avail-grid" role="group" aria-label={`When ${person.name} is unavailable`}>
        <span />
        {DAY_NAMES.map((label, i) => {
          const day = i as DayIndex
          const allDay = isAllDayUnavailable(person, day)
          return (
            <button
              key={label}
              type="button"
              className={`avail-day${allDay ? ' on' : ''}`}
              aria-pressed={allDay}
              title={`${allDay ? 'Free' : 'Block'} all ${DAY_NAMES_LONG[day]}`}
              onClick={() => onUpdate(withDayToggled(person, day))}
            >
              {label}
            </button>
          )
        })}
        {DAY_PARTS.map((part) => (
          <Fragment key={part}>
            <span className="avail-part">{slotLabel(labels, part)}</span>
            {DAY_NAMES.map((_, i) => {
              const day = i as DayIndex
              const on = blockedParts(person, day).includes(part)
              return (
                <button
                  key={day}
                  type="button"
                  className={`avail-cell${on ? ' on' : ''}`}
                  aria-pressed={on}
                  aria-label={`${DAY_NAMES_LONG[day]} ${slotLabel(labels, part)}`}
                  onClick={() => onUpdate(withPartToggled(person, day, part))}
                />
              )
            })}
          </Fragment>
        ))}
      </div>
      <p className="text-muted avail-hint">
        Rotating chores skip {person.name} at these times. Chores fixed to {person.name} stay put and show a warning.
      </p>
    </div>
  )
}

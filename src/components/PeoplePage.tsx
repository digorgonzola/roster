import { useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import type { AppState, Chore, Person } from '../types'
import { entriesForWeek } from '../schedule'
import { PALETTE, nextColor, patternFor } from '../palette'
import { Avatar, Swatch } from './Avatar'

interface Props {
  state: AppState
  weekStart: Date
  onAdd: (name: string, color: string) => void
  onUpdate: (person: Person) => void
  onDelete: (id: string) => void
  onExport: () => void
  onImport: (file: File) => void
  onReset: () => void
  onWeekStartsOn: (v: 0 | 1) => void
  importError: string
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

export function PeoplePage({ state, weekStart, onAdd, onUpdate, onDelete, onExport, onImport, onReset, onWeekStartsOn, importError }: Props) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(() => nextColor(state.people.map((p) => p.color)))
  const fileRef = useRef<HTMLInputElement>(null)
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
              <th>Chores</th>
              <th>Week load</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.people.map((p) => {
              const n = counts.get(p.id) ?? 0
              return (
                <tr key={p.id}>
                  <td className="pt-person">
                    <Avatar person={p} size={24} />
                    <input
                      className="pt-name"
                      value={p.name}
                      onChange={(e) => onUpdate({ ...p, name: e.target.value })}
                      aria-label={`Name for ${p.name}`}
                    />
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
                  <td className="pt-count">{choreCount(state.chores, p.id)}</td>
                  <td>
                    <span className="pt-load"><span style={{ width: `${(n / max) * 100}%` }} /></span>
                  </td>
                  <td className="pt-actions">
                    <button className="btn btn-ghost" onClick={() => onDelete(p.id)} aria-label={`Remove ${p.name}`}>
                      Remove
                    </button>
                  </td>
                </tr>
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

      <hr className="hr" />
      <h6>Data</h6>
      <div className="data-row">
        <label className="week-start-field">
          <span className="text-muted">Week starts</span>
          <select
            className="input"
            value={state.weekStartsOn}
            onChange={(e) => onWeekStartsOn(Number(e.target.value) as 0 | 1)}
          >
            <option value={1}>Monday</option>
            <option value={0}>Sunday</option>
          </select>
        </label>
        <button className="btn btn-secondary" onClick={onExport}>Export JSON</button>
        <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>Import JSON</button>
        <button className="btn btn-ghost" onClick={onReset}>Reset to example</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onImport(f)
            e.target.value = ''
          }}
        />
      </div>
      {importError && <p className="editor-error">{importError}</p>}
      <p className="text-muted footnote">Data is stored in this browser. Export to back up or move it to another device.</p>
    </div>
  )
}

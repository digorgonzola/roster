import { useState } from 'react'
import type { Person } from '../types'
import { PALETTE, nextColor } from '../palette'
import { Swatch } from './PersonChip'

interface Props {
  people: Person[]
  onAdd: (name: string, color: string) => void
  onUpdate: (person: Person) => void
  onDelete: (id: number) => void
}

export function PeopleManager({ people, onAdd, onUpdate, onDelete }: Props) {
  const [name, setName] = useState('')

  const add = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onAdd(trimmed, nextColor(people.map((p) => p.color)))
    setName('')
  }

  return (
    <section className="panel">
      <h2>People</h2>

      <div className="add-row">
        <input
          type="text"
          placeholder="Add a person…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          aria-label="Person name"
        />
        <button className="btn primary" onClick={add}>Add</button>
      </div>

      {people.length === 0 ? (
        <p className="muted">No people yet — add the members of your household.</p>
      ) : (
        <ul className="people-list">
          {people.map((p) => (
            <li key={p.id} className="person-row">
              <input
                className="name-input"
                value={p.name}
                onChange={(e) => onUpdate({ ...p, name: e.target.value })}
                aria-label={`Name for ${p.name}`}
              />
              <div className="color-picker" role="group" aria-label="Colour">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    className={`color-dot${p.color === c ? ' selected' : ''}`}
                    onClick={() => onUpdate({ ...p, color: c })}
                    title={c}
                  >
                    <Swatch color={c} size={18} />
                  </button>
                ))}
              </div>
              <button className="btn danger ghost" onClick={() => onDelete(p.id)} aria-label={`Remove ${p.name}`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

import { useMemo, useState } from 'react'
import { RotateCw } from 'lucide-react'
import type { AppState } from '../types'
import { entriesForWeek } from '../schedule'
import { longDate } from '../labels'
import { Avatar } from './Avatar'

export interface AssignTarget {
  choreId: number
  date: string
}

export type AssignChoice = number | 'rotate'

interface Props {
  state: AppState
  weekStart: Date
  target: AssignTarget
  onAssign: (target: AssignTarget, choice: AssignChoice) => void
  onClose: () => void
}

export function AssignSheet({ state, weekStart, target, onAssign, onClose }: Props) {
  const chore = state.chores.find((c) => c.id === target.choreId)

  const { counts, lightestId } = useMemo(() => {
    const entries = entriesForWeek(state, weekStart)
    const counts = new Map<number, number>()
    for (const p of state.people) counts.set(p.id, 0)
    for (const e of entries) {
      if (e.assignee) counts.set(e.assignee.id, (counts.get(e.assignee.id) ?? 0) + 1)
    }
    let lightestId: number | null = null
    for (const p of state.people) {
      if (lightestId === null || (counts.get(p.id) ?? 0) < (counts.get(lightestId) ?? 0)) lightestId = p.id
    }
    return { counts, lightestId }
  }, [state, weekStart])

  const [choice, setChoice] = useState<AssignChoice | null>(lightestId)

  if (!chore) return null

  const meta = [
    longDate(target.date),
    chore.schedule.kind === 'oneoff' ? 'one-off' : chore.schedule.kind,
    chore.effort ?? 'light',
  ].join(' · ')

  return (
    <div className="assign-backdrop" onClick={onClose}>
      <div className="assign-sheet" role="dialog" aria-label={`Assign ${chore.name}`} onClick={(e) => e.stopPropagation()}>
        <span className="assign-grab" aria-hidden />
        <h3>{chore.name}</h3>
        <p className="text-muted assign-meta">{meta}</p>
        <hr className="hr" />
        <h6>Assign to</h6>
        <div className="assign-people">
          {state.people.map((p) => {
            const n = counts.get(p.id) ?? 0
            const lightest = p.id === lightestId
            return (
              <button
                key={p.id}
                className={`assign-row${choice === p.id ? ' selected' : ''}${lightest ? ' lightest' : ''}`}
                onClick={() => setChoice(p.id)}
              >
                <Avatar person={p} size={28} />
                <span className="assign-name">{p.name}</span>
                <span className={`assign-count${lightest ? ' accent' : ''}`}>
                  {n} this week{lightest ? ' · lightest' : ''}
                </span>
              </button>
            )
          })}
          <button
            className={`assign-row assign-rotate${choice === 'rotate' ? ' selected' : ''}`}
            onClick={() => setChoice('rotate')}
          >
            <span className="assign-rotate-icon"><RotateCw size={14} /></span>
            <span className="assign-name">Rotate between everyone</span>
          </button>
        </div>
        <div className="assign-actions">
          <button
            className="btn btn-primary assign-confirm"
            disabled={choice === null}
            onClick={() => { if (choice !== null) onAssign(target, choice) }}
          >
            Assign
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

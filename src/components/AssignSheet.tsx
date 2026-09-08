import { useMemo, useState } from 'react'
import { RotateCw } from 'lucide-react'
import type { AppState } from '../types'
import { entriesForWeek } from '../schedule'
import { isUnavailable } from '../availability'
import { longDate } from '../labels'
import { parseYmd, toDayIndex } from '../week'
import { Avatar } from './Avatar'

export interface AssignTarget {
  choreId: string
  date: string
}

/** A person id, or the reserved 'rotate' choice (never a real id, see ids.ts). */
export type AssignChoice = string | 'rotate'

interface Props {
  state: AppState
  weekStart: Date
  target: AssignTarget
  onAssign: (target: AssignTarget, choice: AssignChoice) => void
  onClose: () => void
}

export function AssignSheet({ state, weekStart, target, onAssign, onClose }: Props) {
  const chore = state.chores.find((c) => c.id === target.choreId)
  const day = toDayIndex(parseYmd(target.date))
  const unavailable = (id: string) => {
    const p = state.people.find((x) => x.id === id)
    return !!p && !!chore && isUnavailable(p, day, chore.timeOfDay)
  }

  const { counts, lightestId } = useMemo(() => {
    const entries = entriesForWeek(state, weekStart)
    const counts = new Map<string, number>()
    for (const p of state.people) counts.set(p.id, 0)
    for (const e of entries) {
      if (e.assignee) counts.set(e.assignee.id, (counts.get(e.assignee.id) ?? 0) + 1)
    }
    // Suggest the lightest *available* person; anyone away that day is still selectable.
    let lightestId: string | null = null
    for (const p of state.people) {
      if (unavailable(p.id)) continue
      if (lightestId === null || (counts.get(p.id) ?? 0) < (counts.get(lightestId) ?? 0)) lightestId = p.id
    }
    return { counts, lightestId }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, weekStart, target])

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
            const away = unavailable(p.id)
            return (
              <button
                key={p.id}
                className={`assign-row${choice === p.id ? ' selected' : ''}${lightest ? ' lightest' : ''}`}
                onClick={() => setChoice(p.id)}
              >
                <Avatar person={p} size={28} />
                <span className="assign-name">{p.name}</span>
                <span className={`assign-count${lightest ? ' accent' : ''}${away ? ' warn' : ''}`}>
                  {n} this week{lightest ? ' · lightest' : ''}{away ? ' · unavailable' : ''}
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

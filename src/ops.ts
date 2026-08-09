import type { AppState, Chore, DayIndex } from './types'
import { parseYmd, toDayIndex } from './week'
import { nextRotationOffset } from './schedule'

/**
 * Every roster mutation, as a plain serializable intent. The same reducer runs
 * in the browser (optimistic) and, once sharing lands, in the Worker
 * (authoritative), so both sides stay in step.
 *
 * Ids are minted by the caller (see ids.ts) except `saveChore` with an empty
 * id, which the caller must fill before dispatch.
 */
export type Op =
  | { t: 'addPerson'; person: AppState['people'][number] }
  | { t: 'updatePerson'; person: AppState['people'][number] }
  | { t: 'deletePerson'; id: string }
  /** Upsert: inserts when no chore has this id, replaces otherwise. */
  | { t: 'saveChore'; chore: Chore }
  | { t: 'deleteChore'; id: string }
  /** From the assign sheet: a person id, or 'rotate' for everyone. */
  | { t: 'assign'; choreId: string; date: string; choice: string | 'rotate' }
  /** Idempotent set (not a toggle), safe under replay and duplicate delivery. */
  | { t: 'setDone'; date: string; choreId: string; done: boolean }
  | { t: 'setWeekStartsOn'; v: 0 | 1 }
  /** Import / reset. Clobbers concurrent edits by design; UI confirms first. */
  | { t: 'replaceState'; state: AppState }

export function applyOp(s: AppState, op: Op): AppState {
  switch (op.t) {
    case 'addPerson':
      // Upsert: duplicate delivery (op echo after an optimistic apply) is a no-op.
      if (s.people.some((p) => p.id === op.person.id)) {
        return { ...s, people: s.people.map((p) => (p.id === op.person.id ? op.person : p)) }
      }
      return { ...s, people: [...s.people, op.person] }

    case 'updatePerson':
      return { ...s, people: s.people.map((p) => (p.id === op.person.id ? op.person : p)) }

    case 'deletePerson':
      return {
        ...s,
        people: s.people.filter((p) => p.id !== op.id),
        chores: s.chores.map((c) => pruneAssignment(c, op.id)),
      }

    case 'saveChore': {
      const chore = withRotationOffset(op.chore, s.chores)
      if (s.chores.some((c) => c.id === chore.id)) {
        return { ...s, chores: s.chores.map((c) => (c.id === chore.id ? chore : c)) }
      }
      return { ...s, chores: [...s.chores, chore] }
    }

    case 'deleteChore': {
      const done: AppState['done'] = {}
      for (const [date, ids] of Object.entries(s.done)) {
        const kept = ids.filter((x) => x !== op.id)
        if (kept.length) done[date] = kept
      }
      return { ...s, chores: s.chores.filter((c) => c.id !== op.id), done }
    }

    case 'assign':
      return {
        ...s,
        chores: s.chores.map((c) => {
          if (c.id !== op.choreId) return c
          if (op.choice === 'rotate') {
            const rotated: Chore = {
              ...c,
              assignment: { mode: 'rotate', period: 'weekly', personIds: s.people.map((p) => p.id) },
            }
            return withRotationOffset(rotated, s.chores)
          }
          if (c.assignment.mode === 'byday') {
            const day = toDayIndex(parseYmd(op.date))
            return { ...c, assignment: { mode: 'byday', byDay: { ...c.assignment.byDay, [day]: op.choice } } }
          }
          return { ...c, assignment: { mode: 'manual', personId: op.choice } }
        }),
      }

    case 'setDone': {
      const current = s.done[op.date] ?? []
      const has = current.includes(op.choreId)
      if (op.done === has) return s
      const next = op.done ? [...current, op.choreId] : current.filter((x) => x !== op.choreId)
      const done = { ...s.done }
      if (next.length) done[op.date] = next
      else delete done[op.date]
      return { ...s, done }
    }

    case 'setWeekStartsOn':
      return { ...s, weekStartsOn: op.v }

    case 'replaceState':
      return op.state
  }
}

/** A rotating chore keeps its frozen offset; one without gets the next free slot. */
function withRotationOffset(chore: Chore, existing: Chore[]): Chore {
  if (chore.assignment.mode !== 'rotate' || chore.rotationOffset !== undefined) return chore
  const others = existing.filter((c) => c.id !== chore.id)
  return { ...chore, rotationOffset: nextRotationOffset(others, chore) }
}

/** Remove a deleted person from a chore's assignment, whatever its mode. */
export function pruneAssignment(c: Chore, removedId: string): Chore {
  const a = c.assignment
  if (a.mode === 'manual') {
    return a.personId === removedId ? { ...c, assignment: { mode: 'manual', personId: null } } : c
  }
  if (a.mode === 'byday') {
    const byDay = { ...a.byDay }
    for (const k of Object.keys(byDay)) {
      const d = Number(k) as DayIndex
      if (byDay[d] === removedId) byDay[d] = null
    }
    return { ...c, assignment: { mode: 'byday', byDay } }
  }
  return {
    ...c,
    assignment: { ...a, personIds: a.personIds.filter((id) => id !== removedId) },
  }
}

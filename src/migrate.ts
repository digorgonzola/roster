import type { AppState, Chore } from './types'

/**
 * Bring a parsed roster blob (any past schema) up to the current schema.
 *
 * v1 (unversioned): integer ids, no rotationOffset.
 *   - Stringify every id and id reference. `String(1)` = `"1"` is deterministic,
 *     so all cross-references stay intact with no remapping.
 *   - Freeze rotation offsets with the old order-based numbering, so existing
 *     rosters keep their exact assignments.
 * v2: current. Only defaults are filled in.
 *
 * The caller guards shape (arrays exist); this function tolerates missing
 * optional fields but assumes people/chores are arrays.
 */
export function migrate(parsed: unknown): AppState {
  const raw = parsed as Record<string, unknown>
  const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 1

  let state = raw as unknown as AppState
  if (version < 2) state = v1ToV2(raw)

  return {
    ...state,
    schemaVersion: 2,
    weekStartsOn: state.weekStartsOn === 0 ? 0 : 1,
    done: state.done && typeof state.done === 'object' ? state.done : {},
  }
}

/** Legacy blob with integer ids everywhere. Only fields v1 could contain. */
interface V1Chore extends Omit<Chore, 'id' | 'assignment' | 'rotationOffset'> {
  id: number
  assignment:
    | { mode: 'manual'; personId: number | null }
    | { mode: 'rotate'; period?: 'daily' | 'weekly'; personIds: number[] }
    | { mode: 'byday'; byDay: Partial<Record<number, number | null>> }
}

function v1ToV2(raw: Record<string, unknown>): AppState {
  const people = (raw.people as { id: number; name: string; color: string }[]).map((p) => ({
    ...p,
    id: String(p.id),
  }))

  const v1Chores = raw.chores as V1Chore[]
  const offsets = legacyRotationOffsets(v1Chores)

  const chores: Chore[] = v1Chores.map((c) => ({
    ...c,
    id: String(c.id),
    assignment: migrateAssignment(c.assignment),
    ...(offsets.has(c.id) ? { rotationOffset: offsets.get(c.id) } : {}),
  }))

  const done: AppState['done'] = {}
  const rawDone = raw.done
  if (rawDone && typeof rawDone === 'object') {
    for (const [date, ids] of Object.entries(rawDone as Record<string, unknown>)) {
      if (Array.isArray(ids)) done[date] = ids.map((id) => String(id))
    }
  }

  return {
    schemaVersion: 2,
    people,
    chores,
    weekStartsOn: raw.weekStartsOn === 0 ? 0 : 1,
    done,
  }
}

function migrateAssignment(a: V1Chore['assignment']): Chore['assignment'] {
  if (a.mode === 'manual') {
    return { mode: 'manual', personId: a.personId === null ? null : String(a.personId) }
  }
  if (a.mode === 'rotate') {
    return { ...a, personIds: a.personIds.map((id) => String(id)) }
  }
  const byDay: Record<number, string | null> = {}
  for (const [day, personId] of Object.entries(a.byDay)) {
    byDay[Number(day)] = personId === null || personId === undefined ? null : String(personId)
  }
  return { mode: 'byday', byDay }
}

/**
 * The pre-v2 offset numbering: dense counters in chores-array order, one
 * sequence per rotation clock (daily / weekly / monthly). Copied here so the
 * migration freezes the offsets each roster already shows, then never changes.
 */
function legacyRotationOffsets(chores: V1Chore[]): Map<number, number> {
  const offsets = new Map<number, number>()
  let dailyK = 0
  let weeklyK = 0
  let monthlyK = 0
  for (const c of chores) {
    if (c.assignment.mode !== 'rotate') continue
    if (c.schedule.kind === 'monthly') offsets.set(c.id, monthlyK++)
    else offsets.set(c.id, c.assignment.period === 'daily' ? dailyK++ : weeklyK++)
  }
  return offsets
}

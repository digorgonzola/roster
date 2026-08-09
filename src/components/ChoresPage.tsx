import { useEffect, useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { Chore, DayIndex, Effort, MonthlyNth, Person, TimeOfDay } from '../types'
import { DAY_NAMES, DAY_NAMES_LONG, addDays, toDayIndex, weekNumber, ymd } from '../week'
import { rotationOffsets, weeklyOccursOn } from '../schedule'
import { assigneeForDate } from '../rotation'
import { TIME_SLOTS, slotLabel } from '../timeofday'
import { assigneeTag, choreRuleSummary, needsPerson } from '../labels'
import { Avatar } from './Avatar'

/** null = nothing selected, 'new' = drafting a new chore, else a chore id. */
export type ChoreSelection = string | null

/** The reserved 'new' selection is never a real chore id (ids come from ids.ts). */
function selectedChoreId(sel: ChoreSelection): string | null {
  return sel !== null && sel !== 'new' ? sel : null
}

interface Props {
  chores: Chore[]
  people: Person[]
  weekStart: Date
  /** Household day-part names from Settings; defaults apply when missing. */
  timeOfDayLabels?: Partial<Record<TimeOfDay, string>>
  selection: ChoreSelection
  onSelect: (sel: ChoreSelection) => void
  onSave: (chore: Chore) => void
  onDelete: (id: string) => void
}

interface Draft {
  name: string
  notes: string
  effort: Effort
  timeOfDay: TimeOfDay
  scheduleKind: 'weekly' | 'monthly' | 'oneoff'
  days: DayIndex[]
  intervalWeeks: number
  startNextWeek: boolean
  monthlyNth: MonthlyNth
  monthlyWeekday: DayIndex
  date: string
  mode: 'manual' | 'rotate' | 'byday'
  manualPersonId: string | null
  rotateIds: string[]
  rotatePeriod: 'daily' | 'weekly'
  byDay: Partial<Record<DayIndex, string | null>>
}

const INTERVALS: { weeks: number; label: string }[] = [
  { weeks: 1, label: 'Every week' },
  { weeks: 2, label: 'Every fortnight' },
  { weeks: 3, label: 'Every 3 weeks' },
  { weeks: 4, label: 'Every 4 weeks' },
]

const NTHS: { value: MonthlyNth; label: string }[] = [
  { value: 1, label: 'First' },
  { value: 2, label: 'Second' },
  { value: 3, label: 'Third' },
  { value: 4, label: 'Fourth' },
  { value: 'last', label: 'Last' },
]

const EFFORTS: Effort[] = ['light', 'medium', 'heavy']

const emptyDraft = (people: Person[]): Draft => ({
  name: '',
  notes: '',
  effort: 'light',
  timeOfDay: 'anytime',
  scheduleKind: 'weekly',
  days: [],
  intervalWeeks: 1,
  startNextWeek: false,
  monthlyNth: 1,
  monthlyWeekday: 5,
  date: '',
  mode: 'manual',
  manualPersonId: people[0]?.id ?? null,
  rotateIds: people.map((p) => p.id),
  rotatePeriod: 'weekly',
  byDay: {},
})

function draftFromChore(c: Chore, people: Person[]): Draft {
  return {
    name: c.name,
    notes: c.notes ?? '',
    effort: c.effort ?? 'light',
    timeOfDay: c.timeOfDay ?? 'anytime',
    scheduleKind: c.schedule.kind,
    days: c.schedule.kind === 'weekly' ? c.schedule.days : [],
    intervalWeeks: c.schedule.kind === 'weekly' ? (c.schedule.intervalWeeks ?? 1) : 1,
    startNextWeek: c.schedule.kind === 'weekly' ? !weeklyOccursOn(c.schedule, new Date()) : false,
    monthlyNth: c.schedule.kind === 'monthly' ? c.schedule.nth : 1,
    monthlyWeekday: c.schedule.kind === 'monthly' ? c.schedule.weekday : 5,
    date: c.schedule.kind === 'oneoff' ? c.schedule.date : '',
    mode: c.assignment.mode,
    manualPersonId: c.assignment.mode === 'manual' ? c.assignment.personId : (people[0]?.id ?? null),
    rotateIds: c.assignment.mode === 'rotate' ? c.assignment.personIds : people.map((p) => p.id),
    rotatePeriod: c.assignment.mode === 'rotate' ? (c.assignment.period ?? 'weekly') : 'weekly',
    byDay: c.assignment.mode === 'byday' ? { ...c.assignment.byDay } : {},
  }
}

function buildChore(draft: Draft, id: string): Chore {
  let assignment: Chore['assignment']
  if (draft.mode === 'manual') {
    assignment = { mode: 'manual', personId: draft.manualPersonId }
  } else if (draft.mode === 'rotate') {
    assignment = { mode: 'rotate', period: draft.rotatePeriod, personIds: draft.rotateIds }
  } else {
    const byDay: Partial<Record<DayIndex, string | null>> = {}
    for (const d of draft.days) byDay[d] = draft.byDay[d] ?? null
    assignment = { mode: 'byday', byDay }
  }
  return {
    id,
    name: draft.name.trim(),
    notes: draft.notes.trim() || undefined,
    effort: draft.effort,
    timeOfDay: draft.timeOfDay,
    schedule:
      draft.scheduleKind === 'weekly'
        ? {
            kind: 'weekly',
            days: draft.days,
            ...(draft.intervalWeeks > 1
              ? {
                  intervalWeeks: draft.intervalWeeks,
                  anchorWeek: weekNumber(new Date()) + (draft.startNextWeek ? 1 : 0),
                }
              : {}),
          }
        : draft.scheduleKind === 'monthly'
          ? { kind: 'monthly', weekday: draft.monthlyWeekday, nth: draft.monthlyNth }
          : { kind: 'oneoff', date: draft.date },
    assignment,
  }
}

export function ChoresPage({ chores, people, weekStart, timeOfDayLabels, selection, onSelect, onSave, onDelete }: Props) {
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setError('')
    const editingId = selectedChoreId(selection)
    if (selection === 'new') setDraft(emptyDraft(people))
    else if (editingId !== null) {
      const c = chores.find((x) => x.id === editingId)
      setDraft(c ? draftFromChore(c, people) : null)
    } else setDraft(null)
    // Rebuild the draft only when the selected chore changes, not on every list edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection])

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d))

  const editingId = selectedChoreId(selection)
  const editingChore = editingId !== null ? chores.find((c) => c.id === editingId) : undefined

  const filtered = chores.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()))
  const needCount = chores.filter(needsPerson).length

  const submit = () => {
    if (!draft) return
    if (!draft.name.trim()) return setError('Give the chore a name.')
    if (draft.scheduleKind === 'weekly' && draft.days.length === 0)
      return setError('Pick at least one day.')
    if (draft.scheduleKind === 'oneoff' && !draft.date)
      return setError('Pick a date.')
    onSave(buildChore(draft, editingId ?? ''))
    setError('')
    if (selection === 'new') onSelect(null)
  }

  return (
    <div className="chores-page">
      <div className="chores-list-pane">
        <div className="chores-toolbar">
          <input
            className="input"
            type="search"
            placeholder="Search chores"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn btn-primary" onClick={() => onSelect('new')}>
            <Plus size={16} /> Add
          </button>
        </div>
        <ul className="chores-list">
          {filtered.map((c) => (
            <li key={c.id}>
              <button
                className={`chore-row${selection === c.id ? ' selected' : ''}`}
                onClick={() => onSelect(c.id)}
              >
                <span className="chore-row-main">
                  <strong>{c.name}</strong>
                  <span className="chore-row-rule">{choreRuleSummary(c)}</span>
                </span>
                <span className={`chore-row-tag${needsPerson(c) ? ' unassigned' : ''}`}>
                  {assigneeTag(c, people)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="chores-footer text-muted">
          {chores.length} chore{chores.length === 1 ? '' : 's'}
          {needCount > 0 && <> · {needCount} need{needCount === 1 ? 's' : ''} a person</>}
        </p>
      </div>

      <div className="chores-editor-pane">
        {draft === null ? (
          <p className="text-muted editor-empty">
            {chores.length === 0
              ? 'No chores yet. Add the first one.'
              : 'Pick a chore on the left, or add a new one.'}
          </p>
        ) : (
          <Editor
            draft={draft}
            set={set}
            setDraft={setDraft}
            people={people}
            chores={chores}
            weekStart={weekStart}
            timeOfDayLabels={timeOfDayLabels}
            isNew={selection === 'new'}
            editingName={editingChore?.name}
            error={error}
            onSubmit={submit}
            onCancel={() => onSelect(null)}
            onDelete={editingId !== null ? () => { onDelete(editingId); onSelect(null) } : undefined}
          />
        )}
      </div>
    </div>
  )
}

interface EditorProps {
  draft: Draft
  set: <K extends keyof Draft>(k: K, v: Draft[K]) => void
  setDraft: (fn: (d: Draft | null) => Draft | null) => void
  people: Person[]
  chores: Chore[]
  weekStart: Date
  timeOfDayLabels?: Partial<Record<TimeOfDay, string>>
  isNew: boolean
  editingName?: string
  error: string
  onSubmit: () => void
  onCancel: () => void
  onDelete?: () => void
}

function Editor({ draft, set, setDraft, people, chores, weekStart, timeOfDayLabels, isNew, editingName, error, onSubmit, onCancel, onDelete }: EditorProps) {
  const toggleDay = (d: DayIndex) =>
    setDraft((prev) => prev && ({
      ...prev,
      days: prev.days.includes(d) ? prev.days.filter((x) => x !== d) : [...prev.days, d].sort((a, b) => a - b),
    }))

  const toggleRotate = (id: string) =>
    setDraft((prev) => prev && ({
      ...prev,
      rotateIds: prev.rotateIds.includes(id)
        ? prev.rotateIds.filter((x) => x !== id)
        : [...prev.rotateIds, id],
    }))

  const setByDay = (day: DayIndex, personId: string | null) =>
    setDraft((prev) => prev && ({ ...prev, byDay: { ...prev.byDay, [day]: personId } }))

  // 'byday' only makes sense for weekly chores; drop back to manual otherwise.
  const setScheduleKind = (kind: Draft['scheduleKind']) =>
    setDraft((prev) => prev && ({
      ...prev,
      scheduleKind: kind,
      mode: kind !== 'weekly' && prev.mode === 'byday' ? 'manual' : prev.mode,
    }))

  return (
    <div className="editor">
      <div className="editor-title">
        <h3>{isNew ? 'Add chore' : 'Edit chore'}</h3>
        {editingName && <span className="text-muted editor-subtitle">{editingName}</span>}
      </div>
      <hr className="hr" />

      <div className="editor-cols">
        <div className="field">
          <label>Name</label>
          <input className="input" type="text" value={draft.name} placeholder="e.g. Feed the cat"
            onChange={(e) => set('name', e.target.value)} />
        </div>
        <div className="field">
          <label>Notes</label>
          <input className="input" type="text" value={draft.notes} placeholder="optional"
            onChange={(e) => set('notes', e.target.value)} />
        </div>
      </div>

      <div className="editor-cols">
        <div className="field">
          <label>Effort</label>
          <span className="seg">
            {EFFORTS.map((e) => (
              <label key={e} className="seg-opt">
                <input type="radio" name="effort" checked={draft.effort === e} onChange={() => set('effort', e)} />
                {e[0].toUpperCase() + e.slice(1)}
              </label>
            ))}
          </span>
        </div>
        <div className="field">
          <label>Time of day</label>
          <span className="seg">
            {TIME_SLOTS.map((s) => (
              <label key={s.key} className="seg-opt" title={s.hint}>
                <input type="radio" name="timeofday" checked={draft.timeOfDay === s.key} onChange={() => set('timeOfDay', s.key)} />
                {slotLabel(timeOfDayLabels, s.key)}
              </label>
            ))}
          </span>
        </div>
      </div>

      <hr className="hr" />
      <h6>Schedule</h6>
      <div className="radio-row">
        <label className="radio">
          <input type="radio" name="schedkind" checked={draft.scheduleKind === 'weekly'} onChange={() => setScheduleKind('weekly')} />
          <span className="dot" /> Weekly
        </label>
        <label className="radio">
          <input type="radio" name="schedkind" checked={draft.scheduleKind === 'monthly'} onChange={() => setScheduleKind('monthly')} />
          <span className="dot" /> Monthly
        </label>
        <label className="radio">
          <input type="radio" name="schedkind" checked={draft.scheduleKind === 'oneoff'} onChange={() => setScheduleKind('oneoff')} />
          <span className="dot" /> One-off date
        </label>
      </div>

      <div className="panel-surface">
        {draft.scheduleKind === 'weekly' ? (
          <>
            <div className="field">
              <label>Repeats on</label>
              <div className="weekday-toggles">
                {DAY_NAMES.map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    className={`weekday-toggle${draft.days.includes(i as DayIndex) ? ' on' : ''}`}
                    onClick={() => toggleDay(i as DayIndex)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="editor-cols">
              <div className="field">
                <label>How often</label>
                <select className="input" value={draft.intervalWeeks} onChange={(e) => set('intervalWeeks', Number(e.target.value))}>
                  {INTERVALS.map((iv) => (
                    <option key={iv.weeks} value={iv.weeks}>{iv.label}</option>
                  ))}
                </select>
              </div>
              {draft.intervalWeeks > 1 && (
                <div className="field">
                  <label>Starting</label>
                  <span className="seg">
                    <label className="seg-opt">
                      <input type="radio" name="starting" checked={!draft.startNextWeek} onChange={() => set('startNextWeek', false)} />
                      This week
                    </label>
                    <label className="seg-opt">
                      <input type="radio" name="starting" checked={draft.startNextWeek} onChange={() => set('startNextWeek', true)} />
                      Next week
                    </label>
                  </span>
                </div>
              )}
            </div>
          </>
        ) : draft.scheduleKind === 'monthly' ? (
          <div className="editor-cols">
            <div className="field">
              <label>Which</label>
              <select className="input" value={String(draft.monthlyNth)}
                onChange={(e) => set('monthlyNth', (e.target.value === 'last' ? 'last' : Number(e.target.value)) as MonthlyNth)}>
                {NTHS.map((n) => (
                  <option key={String(n.value)} value={String(n.value)}>{n.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Weekday</label>
              <select className="input" value={draft.monthlyWeekday} onChange={(e) => set('monthlyWeekday', Number(e.target.value) as DayIndex)}>
                {DAY_NAMES_LONG.map((label, i) => (
                  <option key={label} value={i}>{label}</option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="field">
            <label>Date</label>
            <input className="input" type="date" value={draft.date} onChange={(e) => set('date', e.target.value)} />
          </div>
        )}
      </div>

      <hr className="hr" />
      <h6>Who does it</h6>
      <div className="radio-row">
        <label className="radio">
          <input type="radio" name="whomode" checked={draft.mode === 'manual'} onChange={() => set('mode', 'manual')} />
          <span className="dot" /> One person
        </label>
        <label className="radio">
          <input type="radio" name="whomode" checked={draft.mode === 'rotate'} onChange={() => set('mode', 'rotate')} />
          <span className="dot" /> Rotate
        </label>
        <label className={`radio${draft.scheduleKind !== 'weekly' ? ' disabled' : ''}`}>
          <input type="radio" name="whomode" disabled={draft.scheduleKind !== 'weekly'}
            checked={draft.mode === 'byday'} onChange={() => set('mode', 'byday')} />
          <span className="dot" /> Different person each weekday
        </label>
      </div>

      <div className="panel-surface">
        {people.length === 0 ? (
          <p className="text-muted">Add people first, on the People page.</p>
        ) : draft.mode === 'manual' ? (
          <div className="field">
            <label>Person</label>
            <select className="input" value={draft.manualPersonId ?? ''}
              onChange={(e) => set('manualPersonId', e.target.value || null)}>
              <option value="">— Unassigned —</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        ) : draft.mode === 'rotate' ? (
          <>
            <div className="field">
              <label>Rotate between</label>
              <div className="rotate-chips">
                {people.map((p) => {
                  const on = draft.rotateIds.includes(p.id)
                  return (
                    <button key={p.id} type="button"
                      className={`rotate-chip${on ? ' on' : ''}`}
                      onClick={() => toggleRotate(p.id)}>
                      {on ? <><Avatar person={p} size={18} /> {p.name} <X size={12} /></> : <>+ {p.name}</>}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="field">
              <label>Advance</label>
              <span className="seg">
                <label className="seg-opt">
                  <input type="radio" name="advance" checked={draft.rotatePeriod === 'daily'} onChange={() => set('rotatePeriod', 'daily')} />
                  Every day
                </label>
                <label className="seg-opt">
                  <input type="radio" name="advance" checked={draft.rotatePeriod === 'weekly'} onChange={() => set('rotatePeriod', 'weekly')} />
                  Every week
                </label>
              </span>
            </div>
            <RotatePreview draft={draft} chores={chores} people={people} weekStart={weekStart} />
          </>
        ) : (
          <div className="field">
            <label>Who, on each day</label>
            {draft.days.length === 0 ? (
              <p className="text-muted">Pick the weekdays above first.</p>
            ) : (
              <div className="byday-rows">
                {draft.days.map((d) => (
                  <div key={d} className="byday-row">
                    <span className="byday-day">{DAY_NAMES[d]}</span>
                    <select className="input" value={draft.byDay[d] ?? ''}
                      onChange={(e) => setByDay(d, e.target.value || null)}>
                      <option value="">— Unassigned —</option>
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {error && <p className="editor-error">{error}</p>}

      <div className="editor-actions">
        <button className="btn btn-primary" onClick={onSubmit}>Save chore</button>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        {onDelete && !isNew && (
          <button className="btn btn-ghost editor-delete" onClick={onDelete}>Delete</button>
        )}
      </div>
    </div>
  )
}

/** Computed rotation preview, from the same assigneeForDate the live roster uses. */
function RotatePreview({ draft, chores, people, weekStart }: {
  draft: Draft
  chores: Chore[]
  people: Person[]
  weekStart: Date
}) {
  const preview = useMemo(() => {
    if (draft.rotateIds.length === 0) return []
    // A stand-in id that no real chore uses keeps the offset map honest for new chores.
    const id = 'rotate-preview'
    const chore = buildChore({ ...draft, mode: 'rotate' }, id)
    const offset = rotationOffsets([...chores, chore]).get(id) ?? 0
    const dates: Date[] = []
    if (draft.rotatePeriod === 'weekly') {
      for (let k = 0; k < 4; k++) dates.push(addDays(weekStart, k * 7 + 3))
    } else {
      // Daily advance: the next 4 scheduled occurrences.
      const days = draft.scheduleKind === 'weekly' && draft.days.length ? draft.days : [0, 1, 2, 3, 4, 5, 6]
      for (let i = 0; i < 28 && dates.length < 4; i++) {
        const d = addDays(weekStart, i)
        if (days.includes(toDayIndex(d))) dates.push(d)
      }
    }
    return dates.map((d) => ({
      key: ymd(d),
      name: assigneeForDate(chore, d, people, offset)?.name ?? '—',
    }))
  }, [draft, chores, people, weekStart])

  if (preview.length === 0) return null
  return (
    <div className="rotate-preview">
      <span className="rotate-preview-label">{draft.rotatePeriod === 'weekly' ? 'Next 4 weeks' : 'Next 4 days'}</span>
      {preview.map((p) => (
        <span key={p.key} className="rotate-preview-name">{p.name}</span>
      ))}
    </div>
  )
}

import { useState } from 'react'
import type { Chore, DayIndex, Effort, MonthlyNth, Person, TimeOfDay } from '../types'
import { DAY_NAMES, weekNumber } from '../week'
import { weeklyOccursOn } from '../schedule'
import { TIME_SLOTS, timeLabel } from '../timeofday'
import { PersonChip } from './PersonChip'

const INTERVALS: { weeks: number; label: string }[] = [
  { weeks: 1, label: 'Weekly' },
  { weeks: 2, label: 'Fortnightly' },
  { weeks: 3, label: 'Every 3 wks' },
  { weeks: 4, label: 'Every 4 wks' },
]

const NTHS: { value: MonthlyNth; label: string }[] = [
  { value: 1, label: 'First' },
  { value: 2, label: 'Second' },
  { value: 3, label: 'Third' },
  { value: 4, label: 'Fourth' },
  { value: 'last', label: 'Last' },
]

const NTH_LABEL: Record<string, string> = { '1': 'First', '2': 'Second', '3': 'Third', '4': 'Fourth', last: 'Last' }

interface Props {
  chores: Chore[]
  people: Person[]
  onSave: (chore: Chore) => void
  onDelete: (id: number) => void
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
  manualPersonId: number | null
  rotateIds: number[]
  rotatePeriod: 'daily' | 'weekly'
  byDay: Partial<Record<DayIndex, number | null>>
}

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

const EFFORTS: Effort[] = ['light', 'medium', 'heavy']

export function ChoreManager({ chores, people, onSave, onDelete }: Props) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(people))
  const [error, setError] = useState('')

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))

  const toggleDay = (d: DayIndex) =>
    setDraft((prev) => ({
      ...prev,
      days: prev.days.includes(d) ? prev.days.filter((x) => x !== d) : [...prev.days, d].sort(),
    }))

  const setDays = (days: DayIndex[]) => setDraft((prev) => ({ ...prev, days: [...days].sort() }))
  const ALL_DAYS: DayIndex[] = [0, 1, 2, 3, 4, 5, 6]
  const WEEKDAYS: DayIndex[] = [0, 1, 2, 3, 4]
  const WEEKENDS: DayIndex[] = [5, 6]

  const toggleRotate = (id: number) =>
    setDraft((prev) => ({
      ...prev,
      rotateIds: prev.rotateIds.includes(id)
        ? prev.rotateIds.filter((x) => x !== id)
        : [...prev.rotateIds, id],
    }))

  const setByDay = (day: DayIndex, personId: number | null) =>
    setDraft((prev) => ({ ...prev, byDay: { ...prev.byDay, [day]: personId } }))

  // 'byday' only makes sense for weekly chores; drop back to manual otherwise.
  const setScheduleKind = (kind: 'weekly' | 'monthly' | 'oneoff') =>
    setDraft((prev) => ({
      ...prev,
      scheduleKind: kind,
      mode: kind !== 'weekly' && prev.mode === 'byday' ? 'manual' : prev.mode,
    }))

  const resetForm = () => {
    setEditingId(null)
    setDraft(emptyDraft(people))
    setError('')
  }

  const startEdit = (c: Chore) => {
    setEditingId(c.id)
    setDraft(draftFromChore(c, people))
    setError('')
  }

  const submit = () => {
    const name = draft.name.trim()
    if (!name) return setError('Give the chore a name.')
    if (draft.scheduleKind === 'weekly' && draft.days.length === 0)
      return setError('Pick at least one day for a weekly chore.')
    if (draft.scheduleKind === 'oneoff' && !draft.date)
      return setError('Pick a date for a one-off chore.')

    let assignment: Chore['assignment']
    if (draft.mode === 'manual') {
      assignment = { mode: 'manual', personId: draft.manualPersonId }
    } else if (draft.mode === 'rotate') {
      assignment = { mode: 'rotate', period: draft.rotatePeriod, personIds: draft.rotateIds }
    } else {
      // keep only the days actually scheduled
      const byDay: Partial<Record<DayIndex, number | null>> = {}
      for (const d of draft.days) byDay[d] = draft.byDay[d] ?? null
      assignment = { mode: 'byday', byDay }
    }

    const chore: Chore = {
      id: editingId ?? 0,
      name,
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
    onSave(chore)
    resetForm()
  }

  const formEl = (
    <div className="chore-form">
        <div className="field">
          <label>Chore</label>
          <input
            type="text"
            placeholder="e.g. Dishes, Mow lawn, Feed the cat"
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </div>

        <div className="field">
          <label>Effort</label>
          <div className="segmented">
            {EFFORTS.map((e) => (
              <button
                key={e}
                className={draft.effort === e ? 'seg on' : 'seg'}
                onClick={() => set('effort', e)}
                type="button"
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Time of day</label>
          <div className="segmented wrap">
            {TIME_SLOTS.map((s) => (
              <button
                key={s.key}
                type="button"
                className={draft.timeOfDay === s.key ? 'seg on' : 'seg'}
                onClick={() => set('timeOfDay', s.key)}
                title={s.hint}
              >
                {s.label}
              </button>
            ))}
          </div>
          <p className="hint">Sets the order chores appear in — morning tasks first, e.g. “before school”.</p>
        </div>

        <div className="field">
          <label>Schedule</label>
          <div className="segmented">
            <button
              className={draft.scheduleKind === 'weekly' ? 'seg on' : 'seg'}
              onClick={() => setScheduleKind('weekly')}
              type="button"
            >
              Weekly
            </button>
            <button
              className={draft.scheduleKind === 'monthly' ? 'seg on' : 'seg'}
              onClick={() => setScheduleKind('monthly')}
              type="button"
            >
              Monthly
            </button>
            <button
              className={draft.scheduleKind === 'oneoff' ? 'seg on' : 'seg'}
              onClick={() => setScheduleKind('oneoff')}
              type="button"
            >
              One-off
            </button>
          </div>
        </div>

        {draft.scheduleKind === 'weekly' ? (
          <div className="field">
            <label>Days</label>
            <div className="days">
              {DAY_NAMES.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  className={draft.days.includes(i as DayIndex) ? 'day on' : 'day'}
                  onClick={() => toggleDay(i as DayIndex)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="day-quick">
              <button type="button" className="link-btn" onClick={() => setDays(ALL_DAYS)}>All week</button>
              <button type="button" className="link-btn" onClick={() => setDays(WEEKDAYS)}>Weekdays</button>
              <button type="button" className="link-btn" onClick={() => setDays(WEEKENDS)}>Weekends</button>
              <button type="button" className="link-btn" onClick={() => setDays([])}>Clear</button>
            </div>

            <label className="sub-label">Repeats</label>
            <div className="segmented wrap">
              {INTERVALS.map((iv) => (
                <button
                  key={iv.weeks}
                  type="button"
                  className={draft.intervalWeeks === iv.weeks ? 'seg on' : 'seg'}
                  onClick={() => set('intervalWeeks', iv.weeks)}
                >
                  {iv.label}
                </button>
              ))}
            </div>
            {draft.intervalWeeks > 1 && (
              <div className="starts-row">
                <span className="rotate-period-label">Starts</span>
                <div className="segmented">
                  <button
                    type="button"
                    className={!draft.startNextWeek ? 'seg on' : 'seg'}
                    onClick={() => set('startNextWeek', false)}
                  >
                    This week
                  </button>
                  <button
                    type="button"
                    className={draft.startNextWeek ? 'seg on' : 'seg'}
                    onClick={() => set('startNextWeek', true)}
                  >
                    Next week
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : draft.scheduleKind === 'monthly' ? (
          <div className="field">
            <label>Which day each month</label>
            <div className="monthly-pick">
              <div className="segmented wrap">
                {NTHS.map((n) => (
                  <button
                    key={String(n.value)}
                    type="button"
                    className={draft.monthlyNth === n.value ? 'seg on' : 'seg'}
                    onClick={() => set('monthlyNth', n.value)}
                  >
                    {n.label}
                  </button>
                ))}
              </div>
              <div className="days">
                {DAY_NAMES.map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    className={draft.monthlyWeekday === i ? 'day on' : 'day'}
                    onClick={() => set('monthlyWeekday', i as DayIndex)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <p className="hint">
              e.g. {NTH_LABEL[String(draft.monthlyNth)]} {DAY_NAMES[draft.monthlyWeekday]} of every month.
            </p>
          </div>
        ) : (
          <div className="field">
            <label>Date</label>
            <input type="date" value={draft.date} onChange={(e) => set('date', e.target.value)} />
          </div>
        )}

        <div className="field">
          <label>Assign</label>
          <div className="segmented">
            <button
              className={draft.mode === 'manual' ? 'seg on' : 'seg'}
              onClick={() => set('mode', 'manual')}
              type="button"
            >
              One person
            </button>
            <button
              className={draft.mode === 'rotate' ? 'seg on' : 'seg'}
              onClick={() => set('mode', 'rotate')}
              type="button"
            >
              Rotate
            </button>
            {draft.scheduleKind === 'weekly' && (
              <button
                className={draft.mode === 'byday' ? 'seg on' : 'seg'}
                onClick={() => set('mode', 'byday')}
                type="button"
              >
                Per day
              </button>
            )}
          </div>
        </div>

        {people.length === 0 ? (
          <p className="muted">Add people first to assign chores.</p>
        ) : draft.mode === 'manual' ? (
          <div className="field">
            <label>Person</label>
            <select
              value={draft.manualPersonId ?? ''}
              onChange={(e) => set('manualPersonId', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— Unassigned —</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        ) : draft.mode === 'byday' ? (
          <div className="field">
            <label>Who, on each day</label>
            {draft.days.length === 0 ? (
              <p className="hint">Pick the days above first, then choose a person for each.</p>
            ) : (
              <div className="byday-list">
                {[...draft.days].sort((a, b) => a - b).map((d) => (
                  <div key={d} className="byday-row">
                    <span className="byday-day">{DAY_NAMES[d]}</span>
                    <select
                      value={draft.byDay[d] ?? ''}
                      onChange={(e) => setByDay(d, e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">— Unassigned —</option>
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
            <p className="hint">A fixed person for each day, e.g. Jim cooks Tue, Bob cooks Wed.</p>
          </div>
        ) : (
          <div className="field">
            <label>Rotate between</label>
            <div className="rotate-people">
              {people.map((p) => (
                <label key={p.id} className="check">
                  <input
                    type="checkbox"
                    checked={draft.rotateIds.includes(p.id)}
                    onChange={() => toggleRotate(p.id)}
                  />
                  <PersonChip person={p} />
                </label>
              ))}
            </div>
            <div className="rotate-period">
              <span className="rotate-period-label">Advance</span>
              <div className="segmented">
                <button
                  type="button"
                  className={draft.rotatePeriod === 'daily' ? 'seg on' : 'seg'}
                  onClick={() => set('rotatePeriod', 'daily')}
                >
                  Every day
                </button>
                <button
                  type="button"
                  className={draft.rotatePeriod === 'weekly' ? 'seg on' : 'seg'}
                  onClick={() => set('rotatePeriod', 'weekly')}
                >
                  Every week
                </button>
              </div>
            </div>
            <p className="hint">
              {draft.rotatePeriod === 'daily'
                ? 'A different person each day, cycling in this order.'
                : 'Same person all week, advancing one person each week, in this order.'}
            </p>
          </div>
        )}

        <div className="field">
          <label>Notes</label>
          <input
            type="text"
            placeholder="optional"
            value={draft.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        </div>

        {error && <p className="error">{error}</p>}

        <div className="form-actions">
          <button className="btn primary" onClick={submit} type="button">
            {editingId ? 'Save changes' : 'Add chore'}
          </button>
          {editingId && (
            <button className="btn ghost" onClick={resetForm} type="button">Cancel</button>
          )}
        </div>
      </div>
  )

  return (
    <section className="panel">
      <h2>Chores</h2>

      {/* Add form at the top; while editing, the form moves inline to the row instead */}
      {editingId === null && formEl}

      {chores.length > 0 && (
        <ul className="chore-list">
          {chores.map((c) =>
            editingId === c.id ? (
              <li key={c.id} className="chore-item editing-inline">{formEl}</li>
            ) : (
              <li key={c.id} className="chore-item">
                <div className="chore-main">
                  <strong>{c.name}</strong>
                  <span className={`time-tag t-${c.timeOfDay ?? 'anytime'}`}>{timeLabel(c.timeOfDay)}</span>
                  <span className="badge">{c.effort ?? 'light'}</span>
                  <span className="chore-sched">{scheduleSummary(c)}</span>
                  {c.notes && <span className="chore-notes">{c.notes}</span>}
                </div>
                <div className="chore-assign">{assignmentSummary(c, people)}</div>
                <div className="chore-actions">
                  <button className="btn ghost" onClick={() => startEdit(c)}>Edit</button>
                  <button className="btn danger ghost" onClick={() => onDelete(c.id)}>Delete</button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  )
}

function scheduleSummary(c: Chore): string {
  if (c.schedule.kind === 'oneoff') return `One-off · ${c.schedule.date}`
  if (c.schedule.kind === 'monthly')
    return `${NTH_LABEL[String(c.schedule.nth)]} ${DAY_NAMES[c.schedule.weekday]} · monthly`
  const { days, intervalWeeks } = c.schedule
  const iv = intervalWeeks && intervalWeeks > 1 ? intervalWeeks : 1
  const freq = iv === 1 ? '' : iv === 2 ? 'Fortnightly · ' : `Every ${iv} wks · `
  const dayStr = days.length === 7 ? 'Every day' : days.map((d) => DAY_NAMES[d]).join(', ')
  return freq + dayStr
}

function assignmentSummary(c: Chore, people: Person[]) {
  const a = c.assignment
  if (a.mode === 'manual') {
    const p = people.find((x) => x.id === a.personId) ?? null
    return <PersonChip person={p} />
  }
  if (a.mode === 'byday') {
    const days = (Object.keys(a.byDay) as unknown as string[])
      .map(Number)
      .sort((x, y) => x - y) as DayIndex[]
    return (
      <span className="rotate-summary">
        <span className="rotate-label">Per day:</span>
        {days.map((d) => {
          const p = people.find((x) => x.id === a.byDay[d]) ?? null
          return (
            <span key={d} className="byday-chip">
              <span className="byday-chip-day">{DAY_NAMES[d]}</span>
              <PersonChip person={p} compact />
            </span>
          )
        })}
      </span>
    )
  }
  const chosen = a.personIds
    .map((id) => people.find((p) => p.id === id))
    .filter((p): p is Person => Boolean(p))
  return (
    <span className="rotate-summary">
      <span className="rotate-label">Rotates {a.period === 'daily' ? 'daily' : 'weekly'}:</span>
      {chosen.length === 0 ? <span className="muted">none</span> : chosen.map((p) => <PersonChip key={p.id} person={p} />)}
    </span>
  )
}

import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import type { AppState, DayIndex } from '../types'
import { entriesForWeek } from '../schedule'
import { DAY_NAMES, addDays, daysOfWeek, toDayIndex, ymd } from '../week'
import { longDate, timeTag } from '../labels'
import { Avatar } from './Avatar'
import type { AssignTarget } from './AssignSheet'

interface Props {
  state: AppState
  weekStart: Date
  onPrevWeek: () => void
  onNextWeek: () => void
  selectedDay: DayIndex
  onSelectDay: (d: DayIndex) => void
  onAssign: (target: AssignTarget) => void
  onOpenChore: (id: string) => void
  onAddChore: () => void
}

/** Mobile parent week: day strip + that day's chores, with inline assign. */
export function MobileWeek({ state, weekStart, onPrevWeek, onNextWeek, selectedDay, onSelectDay, onAssign, onOpenChore, onAddChore }: Props) {
  const entries = entriesForWeek(state, weekStart)
  const cols = daysOfWeek(weekStart)
  const dayDate = addDays(weekStart, cols.findIndex((d) => toDayIndex(d) === selectedDay))
  const dayEntries = entries.filter((e) => e.dayIndex === selectedDay)
  const todayStr = ymd(new Date())

  return (
    <div className="mweek">
      <header className="mweek-header">
        <h2>This week</h2>
        <span className="mweek-nav">
          <button className="btn btn-secondary btn-icon" onClick={onPrevWeek} aria-label="Previous week">
            <ChevronLeft size={16} />
          </button>
          <button className="btn btn-secondary btn-icon" onClick={onNextWeek} aria-label="Next week">
            <ChevronRight size={16} />
          </button>
        </span>
      </header>

      <div className="mweek-strip">
        {cols.map((d) => {
          const di = toDayIndex(d)
          const cls = [
            'mweek-day',
            di === selectedDay ? 'on' : '',
            ymd(d) === todayStr ? 'today' : '',
          ].filter(Boolean).join(' ')
          return (
            <button key={d.toISOString()} className={cls} onClick={() => onSelectDay(di)}>
              <span className="mweek-day-dow">{DAY_NAMES[di]}</span>
              <span className="mweek-day-dom">{d.getDate()}</span>
            </button>
          )
        })}
      </div>

      <div className="mweek-body">
        <h6>{longDate(ymd(dayDate))} · {dayEntries.length} chore{dayEntries.length === 1 ? '' : 's'}</h6>
        {dayEntries.map((e) =>
          e.assignee ? (
            <button
              key={`${e.chore.id}:${e.date}`}
              className="mweek-row"
              onClick={() => onOpenChore(e.chore.id)}
            >
              <Avatar person={e.assignee} size={28} />
              <span className="mweek-row-name">{e.chore.name}</span>
              <span className="mweek-row-tod text-muted">{timeTag(e.chore.timeOfDay)}</span>
            </button>
          ) : (
            <button
              key={`${e.chore.id}:${e.date}`}
              className="mweek-row unassigned"
              onClick={() => onAssign({ choreId: e.chore.id, date: e.date })}
            >
              <Avatar person={null} size={28} />
              <span className="mweek-row-name">{e.chore.name}</span>
              <span className="mweek-row-assign">Assign</span>
            </button>
          ),
        )}
        {dayEntries.length === 0 && <div className="myday-empty text-muted">Nothing this day</div>}
        <button className="btn btn-primary btn-block mweek-add" onClick={onAddChore}>
          <Plus size={16} /> Add chore
        </button>
      </div>
    </div>
  )
}

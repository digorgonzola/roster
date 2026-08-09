import { ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import { weekLabel } from '../week'

export type Page = 'week' | 'chores' | 'people' | 'print'

interface Props {
  page: Page
  onNavigate: (page: Page) => void
  weekStart: Date
  onPrevWeek: () => void
  onThisWeek: () => void
  onNextWeek: () => void
}

const LINKS: { page: Page; label: string }[] = [
  { page: 'week', label: 'This week' },
  { page: 'chores', label: 'Chores' },
  { page: 'people', label: 'People' },
]

export function Nav({ page, onNavigate, weekStart, onPrevWeek, onThisWeek, onNextWeek }: Props) {
  return (
    <div className="no-print">
      <header className="nav">
        <span className="nav-brand">ROSTER</span>
        <nav className="nav-links">
          {LINKS.map((l) => (
            <a
              key={l.page}
              href="#"
              aria-current={page === l.page || (page === 'print' && l.page === 'week') ? 'page' : undefined}
              onClick={(e) => { e.preventDefault(); onNavigate(l.page) }}
            >
              {l.label}
            </a>
          ))}
        </nav>
      </header>
      {(page === 'week' || page === 'print') && (
        <div className="week-bar">
          <div className="week-nav">
            <button className="btn btn-secondary btn-icon" onClick={onPrevWeek} aria-label="Previous week">
              <ChevronLeft size={16} />
            </button>
            <button className="btn btn-secondary" onClick={onThisWeek}>This week</button>
            <button className="btn btn-secondary btn-icon" onClick={onNextWeek} aria-label="Next week">
              <ChevronRight size={16} />
            </button>
            <span className="week-label">{weekLabel(weekStart)}</span>
          </div>
          {page === 'week' && (
            <button className="btn btn-primary" onClick={() => onNavigate('print')}>
              <Printer size={16} /> Print roster
            </button>
          )}
        </div>
      )}
    </div>
  )
}

import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

interface Props {
  title: ReactNode
  description?: ReactNode
  /** Right-aligned buttons; they wrap under the title on narrow screens. */
  actions?: ReactNode
  /** Above the title, e.g. a back link. */
  before?: ReactNode
}

export function PageHeader({ title, description, actions, before }: Props) {
  return (
    <header className="page-header">
      <div>
        {before}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  )
}

interface WeekNavProps {
  onPrevWeek: () => void
  onNextWeek: () => void
  /** Omit to hide the "This week" button. */
  onThisWeek?: () => void
}

export function WeekNav({ onPrevWeek, onThisWeek, onNextWeek }: WeekNavProps) {
  return (
    <span className="week-nav">
      <button className="btn btn-icon" onClick={onPrevWeek} aria-label="Previous week">
        <ChevronLeft size={16} />
      </button>
      {onThisWeek && <button className="btn" onClick={onThisWeek}>This week</button>}
      <button className="btn btn-icon" onClick={onNextWeek} aria-label="Next week">
        <ChevronRight size={16} />
      </button>
    </span>
  )
}

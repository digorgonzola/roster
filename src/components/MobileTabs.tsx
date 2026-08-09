export type MobileTab = 'today' | 'week' | 'chores' | 'people'

interface Props {
  tab: MobileTab
  onChange: (t: MobileTab) => void
}

const TABS: { key: MobileTab; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'chores', label: 'Chores' },
  { key: 'people', label: 'People' },
]

export function MobileTabs({ tab, onChange }: Props) {
  return (
    <nav className="mtabs no-print">
      {TABS.map((t) => (
        <button
          key={t.key}
          className={`mtab${tab === t.key ? ' on' : ''}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  )
}

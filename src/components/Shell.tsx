import { AppSwitcher } from 'app-switcher'
import { CalendarCheck, type LucideIcon, User } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Me } from '../sync/protocol'

export interface NavItem<K extends string> {
  key: K
  label: string
  tabLabel: string
  icon: LucideIcon
  /** Sidebar only; below 1024px it is reached through the top-bar avatar. */
  isSidebarOnly?: boolean
}

interface Props<K extends string> {
  items: NavItem<K>[]
  current: K
  onNavigate: (key: K) => void
  /** The page the top-bar avatar opens. */
  accountKey: K
  me: Me | null
  children: ReactNode
}

/** "Stefan Hattrell" from "stefan.hattrell@example.com". */
function accountName(email: string): string {
  return email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

function accountInitials(email: string): string {
  return accountName(email)
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
}

function AccountAvatar({ me }: { me: Me | null }) {
  return (
    <span className="account-avatar" aria-hidden="true">
      {me ? accountInitials(me.email) : <User size={16} />}
    </span>
  )
}

function Wordmark() {
  return (
    <span className="wordmark">
      <span className="wordmark__mark">
        <CalendarCheck size={20} />
      </span>
      Roster
    </span>
  )
}

/** Left rail at 1024px and wider; top bar and bottom tab bar below that. */
export function Shell<K extends string>({ items, current, onNavigate, accountKey, me, children }: Props<K>) {
  const links = (labelKey: 'label' | 'tabLabel') =>
    items
      .filter((item) => labelKey === 'label' || !item.isSidebarOnly)
      .map((item) => {
        const Icon = item.icon
        return (
          <a
            key={item.key}
            href="#"
            aria-current={item.key === current ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault()
              onNavigate(item.key)
            }}
          >
            <Icon size={20} aria-hidden />
            <span>{item[labelKey]}</span>
          </a>
        )
      })

  const memberCount = me?.household.members.length ?? 0

  return (
    <div className="shell no-print">
      <aside className="sidebar" aria-label="Main">
        <div className="sidebar__brand">
          <Wordmark />
          <AppSwitcher current="roster" align="start" />
        </div>
        <nav className="nav">{links('label')}</nav>
        {me && (
          <div className="sidebar__footer">
            <AccountAvatar me={me} />
            <div className="account">
              <strong>{accountName(me.email)}</strong>
              <span>
                {memberCount > 1 ? `${me.household.name} · ${memberCount} people` : me.household.name}
              </span>
            </div>
          </div>
        )}
      </aside>
      <div className="shell__body">
        <header className="topbar">
          <Wordmark />
          <div className="topbar__actions">
            <AppSwitcher current="roster" />
            <a
              className="topbar__account"
              href="#"
              aria-label={me ? `Settings for ${accountName(me.email)}` : 'Settings'}
              aria-current={current === accountKey ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault()
                onNavigate(accountKey)
              }}
            >
              <AccountAvatar me={me} />
            </a>
          </div>
        </header>
        <main className="main" id="main">
          {children}
        </main>
      </div>
      <nav className="tabbar" aria-label="Main">
        {links('tabLabel')}
      </nav>
    </div>
  )
}

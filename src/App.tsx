import { useEffect, useMemo, useState } from 'react'
import type { AppState, Chore, DayIndex, Person, TimeOfDay } from './types'
import { load, save, exportJson, exportIcs, exportTasksIcs, importJson, clearStored } from './storage'
import { seedState } from './seed'
import { newId } from './ids'
import { applyOp, type Op } from './ops'
import {
  SyncClient,
  SyncRequestError,
  acceptInvite,
  calendarFeedUrl,
  clearLegacyShareConfig,
  enableCalendarFeed,
  fetchCalendarToken,
  fetchMe,
  leaveHousehold,
  rememberHousehold,
  resetLocalHousehold,
} from './sync/client'
import type { InviteForMe, Me } from './sync/protocol'
import { addDays, startOfWeek, toDayIndex, weekLabel } from './week'
import { CalendarDays, ListChecks, Printer, Settings, Sun, Users } from 'lucide-react'
import { Shell, type NavItem } from './components/Shell'
import { PageHeader, WeekNav } from './components/PageHeader'
import { Dashboard, type DashboardView } from './components/Dashboard'
import { ChoresPage, type ChoreSelection } from './components/ChoresPage'
import { PeoplePage } from './components/PeoplePage'
import { SIGN_OUT_URL, SettingsPage } from './components/SettingsPage'
import { InviteBanner } from './components/Household'
import { PrintPanel, type PrintOptions } from './components/PrintPanel'
import { PrintRoster, type PrintLayout } from './components/PrintRoster'
import { AssignSheet, type AssignChoice, type AssignTarget } from './components/AssignSheet'
import { MyDay } from './components/MyDay'
import { MobileWeek } from './components/MobileWeek'
type Page = 'week' | 'chores' | 'people' | 'settings' | 'print'
type MobileTab = 'today' | 'week' | 'chores' | 'people' | 'settings'

const SHARED_ITEMS: NavItem<Exclude<Page, 'print'>>[] = [
  { key: 'week', label: 'This week', tabLabel: 'Week', icon: CalendarDays },
  { key: 'chores', label: 'Chores', tabLabel: 'Chores', icon: ListChecks },
  { key: 'people', label: 'People', tabLabel: 'People', icon: Users },
  { key: 'settings', label: 'Settings', tabLabel: 'Settings', icon: Settings, isSidebarOnly: true },
]

const PAGE_ITEMS: NavItem<Page>[] = SHARED_ITEMS

const MOBILE_ITEMS: NavItem<MobileTab>[] = [
  { key: 'today', label: 'Today', tabLabel: 'Today', icon: Sun },
  ...SHARED_ITEMS,
]

/** Below this width the desktop views fall back to the mobile day list. */
function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 700px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 700px)')
    const onChange = (e: MediaQueryListEvent) => setMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return mobile
}

/** The local roster and queued ops belong to the previous household: drop them and boot again. */
function reloadIntoNewHousehold(): void {
  resetLocalHousehold()
  clearStored()
  location.reload()
}

export default function App() {
  const [state, setState] = useState<AppState>(() => load())
  const [anchor, setAnchor] = useState<Date>(() => new Date())
  const [page, setPage] = useState<Page>('week')
  const [mobileTab, setMobileTab] = useState<MobileTab>('today')
  const [dashboardView, setDashboardView] = useState<DashboardView>('grid')
  const [personFilter, setPersonFilter] = useState<string | null>(null)
  const [choreSelection, setChoreSelection] = useState<ChoreSelection>(null)
  const [selectedDay, setSelectedDay] = useState<DayIndex>(() => toDayIndex(new Date()))
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null)
  const [myDayPersonId, setMyDayPersonId] = useState<string | null>(null)
  const [printLayout, setPrintLayout] = useState<PrintLayout>('grid')
  const [printOptions, setPrintOptions] = useState<PrintOptions>({
    tickBoxes: true,
    personKey: true,
    notes: false,
    hideUnassigned: false,
  })
  const [importError, setImportError] = useState('')
  // Set when the dashboard rail jumps to the calendar settings, so the section
  // scrolls into view and flashes once. Cleared after the Settings page reacts.
  const [focusCalendar, setFocusCalendar] = useState(false)
  const isMobile = useIsMobile()

  // ---- Sync ----
  const [sync] = useState(() => new SyncClient())
  const [me, setMe] = useState<Me | null>(null)
  const [accessError, setAccessError] = useState('')
  const [inviteBannerDismissed, setInviteBannerDismissed] = useState(false)
  const [deviceCount, setDeviceCount] = useState<number | null>(null)
  const [calToken, setCalToken] = useState<string | null>(null)
  const [calError, setCalError] = useState('')

  // On boot: who is signed in, and the feed token if a member enabled it.
  // Offline is fine here: the roster runs from the local copy and syncs later.
  useEffect(() => {
    clearLegacyShareConfig()
    fetchMe()
      .then((signedIn) => {
        if (!rememberHousehold(signedIn.household.id)) {
          reloadIntoNewHousehold()
          return
        }
        setMe(signedIn)
      })
      .catch((err: unknown) => {
        if (err instanceof SyncRequestError && err.status === 403) {
          setAccessError('This account is not in the household. Sign out and sign in with a household account.')
        } else {
          console.warn('Could not load the signed-in member', err)
        }
      })
    fetchCalendarToken()
      .then(setCalToken)
      .catch((err: unknown) => console.warn('Could not load the calendar feed token', err))
  }, [])

  // The client pushes remote ops (WebSocket, with a slow poll as fallback)
  // and delivers snapshots rebased over the pending queue.
  useEffect(() => {
    sync.start({
      onRemoteOp: (op: Op) => setState((s) => applyOp(s, op)),
      onSnapshot: (remote, pending) => setState(pending.reduce(applyOp, remote)),
      onPresence: setDeviceCount,
      onHouseholdChanged: reloadIntoNewHousehold,
    })
    return () => {
      sync.stop()
      setDeviceCount(null)
    }
  }, [sync])

  const enableCalendar = async () => {
    setCalError('')
    try {
      setCalToken(await enableCalendarFeed())
    } catch {
      setCalError('Could not enable the calendar feed. Check your connection and try again.')
    }
  }

  const joinHousehold = async (invite: InviteForMe) => {
    if (!me) return
    const { household } = me
    if (
      household.members.length === 1 &&
      !confirm(
        `You are the only member of ${household.name}. Its roster stays behind and nobody will see it. Join ${invite.householdName}?`,
      )
    ) {
      return
    }
    await acceptInvite(invite.id)
    reloadIntoNewHousehold()
  }

  const leaveCurrentHousehold = async () => {
    if (!me) return
    if (!confirm(`Leave ${me.household.name}? You get a new, empty household. The roster stays with the others.`)) return
    await leaveHousehold()
    reloadIntoNewHousehold()
  }

  const feedUrlFor = (personId: string | undefined, tasks: boolean): string | null =>
    calToken ? calendarFeedUrl(calToken, { personId, tasks }) : null

  useEffect(() => { save(state) }, [state])

  const weekStart = useMemo(
    () => startOfWeek(anchor, state.weekStartsOn),
    [anchor, state.weekStartsOn],
  )

  /**
   * Single write path: every mutation is an Op through the shared reducer,
   * applied locally first (optimistic), then joins the client's persisted
   * queue and replays in order once the room is reachable.
   */
  const dispatch = (op: Op) => {
    setState((s) => applyOp(s, op))
    sync.push(op)
  }

  // ---- People ----
  const addPerson = (name: string, color: string) =>
    dispatch({ t: 'addPerson', person: { id: newId(), name, color } })

  const updatePerson = (person: Person) => dispatch({ t: 'updatePerson', person })

  const deletePerson = (id: string) => dispatch({ t: 'deletePerson', id })

  // ---- Chores ----
  const saveChore = (chore: Chore) =>
    dispatch({ t: 'saveChore', chore: chore.id === '' ? { ...chore, id: newId() } : chore })

  const deleteChore = (id: string) => dispatch({ t: 'deleteChore', id })

  // Seasonal on/off, e.g. firewood in winter only. Off = hidden everywhere.
  const setChorePaused = (choreId: string, paused: boolean) =>
    dispatch({ t: 'setChorePaused', choreId, paused })

  // ---- Completion (per occurrence per date; history, never rewritten) ----
  const toggleDone = (date: string, key: string) =>
    dispatch({ t: 'setDone', date, choreId: key, done: !(state.done[date] ?? []).includes(key) })

  // ---- Assigning (writes to the chore, not the occurrence) ----
  const assign = (target: AssignTarget, choice: AssignChoice) => {
    dispatch({ t: 'assign', choreId: target.choreId, date: target.date, choice })
    setAssignTarget(null)
  }

  // ---- Data ----
  const doImport = async (file: File) => {
    if (!confirm('Importing replaces the roster for everyone in the household. Continue?')) {
      return
    }
    try {
      dispatch({ t: 'replaceState', state: await importJson(file) })
      setImportError('')
    } catch (e) {
      setImportError((e as Error).message)
    }
  }

  const resetAll = () => {
    if (confirm('Reset the roster to the starting example? This replaces it for everyone in the household.')) {
      clearStored()
      dispatch({ t: 'replaceState', state: seedState() })
    }
  }

  const doPrint = () => {
    // let React paint the chosen layout before the print dialog opens
    setTimeout(() => window.print(), 50)
  }

  const openChore = (id: ChoreSelection) => {
    setChoreSelection(id)
    setPage('chores')
    setMobileTab('chores')
  }

  const myDayPerson =
    state.people.find((p) => p.id === myDayPersonId) ?? state.people[0] ?? null

  const peoplePage = (
    <PeoplePage
      state={state}
      weekStart={weekStart}
      onAdd={addPerson}
      onUpdate={updatePerson}
      onDelete={deletePerson}
    />
  )

  const settingsPage = (mobile: boolean) => (
    <SettingsPage
      state={state}
      mobile={mobile}
      onWeekStartsOn={(v) => dispatch({ t: 'setWeekStartsOn', v })}
      onRenameSlot={(slot: TimeOfDay, label: string) => dispatch({ t: 'setTimeSlotLabel', slot, label })}
      onExport={() => exportJson(state)}
      onImport={doImport}
      onReset={resetAll}
      importError={importError}
      me={me}
      onMeChange={setMe}
      onJoinHousehold={joinHousehold}
      onLeaveHousehold={leaveCurrentHousehold}
      deviceCount={deviceCount}
      onExportIcs={(personId, tasks) => (tasks ? exportTasksIcs(state, personId) : exportIcs(state, personId))}
      calError={calError}
      onEnableCalendar={() => void enableCalendar()}
      feedUrlFor={feedUrlFor}
      focusCalendar={focusCalendar}
      onFocusHandled={() => setFocusCalendar(false)}
    />
  )

  const choresPage = (
    <ChoresPage
      chores={state.chores}
      people={state.people}
      weekStart={weekStart}
      timeOfDayLabels={state.timeOfDayLabels}
      selection={choreSelection}
      onSelect={setChoreSelection}
      onSave={saveChore}
      onDelete={deleteChore}
      onSetPaused={setChorePaused}
    />
  )

  const bannerInvite = inviteBannerDismissed ? undefined : me?.invitesForMe[0]
  const banner = accessError ? (
    <div className="app-banner app-banner-error no-print" role="alert">
      {accessError}
      <a className="btn btn-ghost" href={SIGN_OUT_URL}>Sign out</a>
    </div>
  ) : bannerInvite ? (
    <InviteBanner invite={bannerInvite} onJoin={joinHousehold} onDismiss={() => setInviteBannerDismissed(true)} />
  ) : null

  const weekNav = (
    <WeekNav
      onPrevWeek={() => setAnchor((d) => addDays(d, -7))}
      onThisWeek={() => setAnchor(new Date())}
      onNextWeek={() => setAnchor((d) => addDays(d, 7))}
    />
  )

  return (
    <div className="app">
      {isMobile ? (
        <Shell items={MOBILE_ITEMS} current={mobileTab} onNavigate={setMobileTab} accountKey="settings" me={me}>
          {banner}
          {mobileTab === 'today' && (
            <MyDay
              state={state}
              person={myDayPerson}
              onPersonChange={setMyDayPersonId}
              onToggleDone={toggleDone}
            />
          )}
          {mobileTab === 'week' && (
            <MobileWeek
              state={state}
              weekStart={weekStart}
              onPrevWeek={() => setAnchor((d) => addDays(d, -7))}
              onNextWeek={() => setAnchor((d) => addDays(d, 7))}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              onAssign={setAssignTarget}
              onOpenChore={openChore}
              onAddChore={() => openChore('new')}
            />
          )}
          {mobileTab === 'chores' && choresPage}
          {mobileTab === 'people' && peoplePage}
          {mobileTab === 'settings' && settingsPage(true)}
        </Shell>
      ) : (
        <Shell
          items={PAGE_ITEMS}
          current={page === 'print' ? 'week' : page}
          onNavigate={setPage}
          accountKey="settings"
          me={me}
        >
          {banner}
          {page === 'week' && (
            <>
              <PageHeader
                title={weekLabel(weekStart)}
                description="Who does what, day by day."
                actions={
                  <>
                    {weekNav}
                    {state.chores.length > 0 && (
                      <button className="btn btn-primary" onClick={() => setPage('print')}>
                        <Printer size={16} /> Print roster
                      </button>
                    )}
                  </>
                }
              />
              <Dashboard
                state={state}
                weekStart={weekStart}
                view={dashboardView}
                onViewChange={setDashboardView}
                personFilter={personFilter}
                onFilterChange={setPersonFilter}
                onOpenChore={openChore}
                onAssign={setAssignTarget}
                onAddChore={() => openChore('new')}
                onExport={() => exportJson(state)}
                onOpenCalendar={() => {
                  setPage('settings')
                  setFocusCalendar(true)
                }}
              />
            </>
          )}
          {page === 'chores' && choresPage}
          {page === 'people' && peoplePage}
          {page === 'settings' && settingsPage(false)}
          {page === 'print' && (
            <PrintPanel
              weekLabel={weekLabel(weekStart)}
              weekNav={weekNav}
              layout={printLayout}
              onLayoutChange={setPrintLayout}
              options={printOptions}
              onOptionsChange={setPrintOptions}
              onPrint={doPrint}
              onBack={() => setPage('week')}
              preview={
                <PrintRoster state={state} weekStart={weekStart} layout={printLayout} options={printOptions} />
              }
            />
          )}
        </Shell>
      )}

      {assignTarget && (
        <AssignSheet
          state={state}
          weekStart={weekStart}
          target={assignTarget}
          onAssign={assign}
          onClose={() => setAssignTarget(null)}
        />
      )}

      {/* Print-only output — hidden on screen, shown when printing */}
      <div className="print-only">
        <PrintRoster state={state} weekStart={weekStart} layout={printLayout} options={printOptions} />
      </div>
    </div>
  )
}

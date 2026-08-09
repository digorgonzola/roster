import { useEffect, useMemo, useState } from 'react'
import type { AppState, Chore, DayIndex, Person } from './types'
import { load, save, exportJson, importJson, clearStored, seedState } from './storage'
import { addDays, parseYmd, startOfWeek, toDayIndex } from './week'
import { Nav, type Page } from './components/Nav'
import { Dashboard, type DashboardView } from './components/Dashboard'
import { ChoresPage, type ChoreSelection } from './components/ChoresPage'
import { PeoplePage } from './components/PeoplePage'
import { PrintPanel, type PrintOptions } from './components/PrintPanel'
import { PrintRoster, type PrintLayout } from './components/PrintRoster'
import { AssignSheet, type AssignChoice, type AssignTarget } from './components/AssignSheet'
import { MyDay } from './components/MyDay'
import { MobileWeek } from './components/MobileWeek'
import { MobileTabs, type MobileTab } from './components/MobileTabs'

function nextId(items: { id: number }[]): number {
  return items.reduce((max, i) => Math.max(max, i.id), 0) + 1
}

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

export default function App() {
  const [state, setState] = useState<AppState>(() => load())
  const [anchor, setAnchor] = useState<Date>(() => new Date())
  const [page, setPage] = useState<Page>('week')
  const [mobileTab, setMobileTab] = useState<MobileTab>('today')
  const [dashboardView, setDashboardView] = useState<DashboardView>('grid')
  const [personFilter, setPersonFilter] = useState<number | null>(null)
  const [choreSelection, setChoreSelection] = useState<ChoreSelection>(null)
  const [selectedDay, setSelectedDay] = useState<DayIndex>(() => toDayIndex(new Date()))
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null)
  const [myDayPersonId, setMyDayPersonId] = useState<number | null>(null)
  const [printLayout, setPrintLayout] = useState<PrintLayout>('grid')
  const [printOptions, setPrintOptions] = useState<PrintOptions>({
    tickBoxes: true,
    personKey: true,
    notes: false,
    hideUnassigned: false,
  })
  const [importError, setImportError] = useState('')
  const isMobile = useIsMobile()

  useEffect(() => { save(state) }, [state])

  const weekStart = useMemo(
    () => startOfWeek(anchor, state.weekStartsOn),
    [anchor, state.weekStartsOn],
  )

  // ---- People ----
  const addPerson = (name: string, color: string) =>
    setState((s) => ({ ...s, people: [...s.people, { id: nextId(s.people), name, color }] }))

  const updatePerson = (person: Person) =>
    setState((s) => ({ ...s, people: s.people.map((p) => (p.id === person.id ? person : p)) }))

  const deletePerson = (id: number) =>
    setState((s) => ({
      ...s,
      people: s.people.filter((p) => p.id !== id),
      chores: s.chores.map((c) => pruneAssignment(c, id)),
    }))

  // ---- Chores ----
  const saveChore = (chore: Chore) =>
    setState((s) => {
      if (chore.id === 0) {
        return { ...s, chores: [...s.chores, { ...chore, id: nextId(s.chores) }] }
      }
      return { ...s, chores: s.chores.map((c) => (c.id === chore.id ? chore : c)) }
    })

  const deleteChore = (id: number) =>
    setState((s) => {
      const done: AppState['done'] = {}
      for (const [date, ids] of Object.entries(s.done)) {
        const kept = ids.filter((x) => x !== id)
        if (kept.length) done[date] = kept
      }
      return { ...s, chores: s.chores.filter((c) => c.id !== id), done }
    })

  // ---- Completion (per chore per date; history, never rewritten) ----
  const toggleDone = (date: string, choreId: number) =>
    setState((s) => {
      const current = s.done[date] ?? []
      const next = current.includes(choreId)
        ? current.filter((x) => x !== choreId)
        : [...current, choreId]
      const done = { ...s.done }
      if (next.length) done[date] = next
      else delete done[date]
      return { ...s, done }
    })

  // ---- Assigning (writes to the chore, not the occurrence) ----
  const assign = (target: AssignTarget, choice: AssignChoice) => {
    setState((s) => ({
      ...s,
      chores: s.chores.map((c) => {
        if (c.id !== target.choreId) return c
        if (choice === 'rotate') {
          return { ...c, assignment: { mode: 'rotate', period: 'weekly', personIds: s.people.map((p) => p.id) } }
        }
        if (c.assignment.mode === 'byday') {
          const day = toDayIndex(parseYmd(target.date))
          return { ...c, assignment: { mode: 'byday', byDay: { ...c.assignment.byDay, [day]: choice } } }
        }
        return { ...c, assignment: { mode: 'manual', personId: choice } }
      }),
    }))
    setAssignTarget(null)
  }

  // ---- Data ----
  const doImport = async (file: File) => {
    try {
      setState(await importJson(file))
      setImportError('')
    } catch (e) {
      setImportError((e as Error).message)
    }
  }

  const resetAll = () => {
    if (confirm('Reset the roster to the starting example? This clears your saved data.')) {
      clearStored()
      setState(seedState())
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
      onExport={() => exportJson(state)}
      onImport={doImport}
      onReset={resetAll}
      onWeekStartsOn={(v) => setState((s) => ({ ...s, weekStartsOn: v }))}
      importError={importError}
    />
  )

  const choresPage = (
    <ChoresPage
      chores={state.chores}
      people={state.people}
      weekStart={weekStart}
      selection={choreSelection}
      onSelect={setChoreSelection}
      onSave={saveChore}
      onDelete={deleteChore}
    />
  )

  return (
    <div className="app">
      {isMobile ? (
        <div className="mobile-shell no-print">
          <main className="mobile-main">
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
          </main>
          <MobileTabs tab={mobileTab} onChange={setMobileTab} />
        </div>
      ) : (
        <div className="no-print">
          <Nav
            page={page}
            onNavigate={setPage}
            weekStart={weekStart}
            onPrevWeek={() => setAnchor((d) => addDays(d, -7))}
            onThisWeek={() => setAnchor(new Date())}
            onNextWeek={() => setAnchor((d) => addDays(d, 7))}
          />
          <main>
            {page === 'week' && (
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
              />
            )}
            {page === 'chores' && choresPage}
            {page === 'people' && peoplePage}
            {page === 'print' && (
              <PrintPanel
                layout={printLayout}
                onLayoutChange={setPrintLayout}
                options={printOptions}
                onOptionsChange={setPrintOptions}
                onPrint={doPrint}
                preview={
                  <PrintRoster state={state} weekStart={weekStart} layout={printLayout} options={printOptions} />
                }
              />
            )}
          </main>
        </div>
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

function pruneAssignment(c: Chore, removedId: number): Chore {
  const a = c.assignment
  if (a.mode === 'manual') {
    return a.personId === removedId ? { ...c, assignment: { mode: 'manual', personId: null } } : c
  }
  if (a.mode === 'byday') {
    const byDay = { ...a.byDay }
    for (const k of Object.keys(byDay)) {
      const d = Number(k) as keyof typeof byDay
      if (byDay[d] === removedId) byDay[d] = null
    }
    return { ...c, assignment: { mode: 'byday', byDay } }
  }
  return {
    ...c,
    assignment: { ...a, personIds: a.personIds.filter((id) => id !== removedId) },
  }
}

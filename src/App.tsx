import { useEffect, useMemo, useState } from 'react'
import type { AppState, Chore, DayIndex, Person } from './types'
import { load, save, exportJson, importJson, clearStored, seedState } from './storage'
import { newId } from './ids'
import { applyOp, type Op } from './ops'
import { addDays, startOfWeek, toDayIndex } from './week'
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
  const isMobile = useIsMobile()

  useEffect(() => { save(state) }, [state])

  const weekStart = useMemo(
    () => startOfWeek(anchor, state.weekStartsOn),
    [anchor, state.weekStartsOn],
  )

  /**
   * Single write path: every mutation is an Op through the shared reducer.
   * The sync layer (when sharing lands) forwards the same ops to the server.
   */
  const dispatch = (op: Op) => setState((s) => applyOp(s, op))

  // ---- People ----
  const addPerson = (name: string, color: string) =>
    dispatch({ t: 'addPerson', person: { id: newId(), name, color } })

  const updatePerson = (person: Person) => dispatch({ t: 'updatePerson', person })

  const deletePerson = (id: string) => dispatch({ t: 'deletePerson', id })

  // ---- Chores ----
  const saveChore = (chore: Chore) =>
    dispatch({ t: 'saveChore', chore: chore.id === '' ? { ...chore, id: newId() } : chore })

  const deleteChore = (id: string) => dispatch({ t: 'deleteChore', id })

  // ---- Completion (per chore per date; history, never rewritten) ----
  const toggleDone = (date: string, choreId: string) =>
    dispatch({ t: 'setDone', date, choreId, done: !(state.done[date] ?? []).includes(choreId) })

  // ---- Assigning (writes to the chore, not the occurrence) ----
  const assign = (target: AssignTarget, choice: AssignChoice) => {
    dispatch({ t: 'assign', choreId: target.choreId, date: target.date, choice })
    setAssignTarget(null)
  }

  // ---- Data ----
  const doImport = async (file: File) => {
    try {
      dispatch({ t: 'replaceState', state: await importJson(file) })
      setImportError('')
    } catch (e) {
      setImportError((e as Error).message)
    }
  }

  const resetAll = () => {
    if (confirm('Reset the roster to the starting example? This clears your saved data.')) {
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

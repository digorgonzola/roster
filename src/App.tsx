import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppState, Chore, Person } from './types'
import { load, save, exportJson, importJson, clearStored, seedState } from './storage'
import { addDays, startOfWeek, weekLabel } from './week'
import { PeopleManager } from './components/PeopleManager'
import { ChoreManager } from './components/ChoreManager'
import { WeekView } from './components/WeekView'
import { LoadSummary } from './components/LoadSummary'
import { PrintRoster, type PrintLayout } from './components/PrintRoster'

function nextId(items: { id: number }[]): number {
  return items.reduce((max, i) => Math.max(max, i.id), 0) + 1
}

type Tab = 'roster' | 'chores' | 'people' | 'print' | 'backup'

const TABS: { key: Tab; label: string }[] = [
  { key: 'roster', label: 'Roster' },
  { key: 'chores', label: 'Chores' },
  { key: 'people', label: 'People' },
  { key: 'print', label: 'Print' },
  { key: 'backup', label: 'Backup' },
]

export default function App() {
  const [state, setState] = useState<AppState>(() => load())
  const [tab, setTab] = useState<Tab>('roster')
  const [anchor, setAnchor] = useState<Date>(() => new Date())
  const [printLayout, setPrintLayout] = useState<PrintLayout>('grid')
  const [importError, setImportError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

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
    setState((s) => ({ ...s, chores: s.chores.filter((c) => c.id !== id) }))

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

  const doPrint = (layout: PrintLayout) => {
    setPrintLayout(layout)
    // let React paint the chosen layout before the print dialog opens
    setTimeout(() => window.print(), 50)
  }

  return (
    <div className="app">
      <header className="topbar no-print">
        <h1>🧹 Household Chore Roster</h1>
        {(tab === 'roster' || tab === 'print') && (
          <div className="week-nav">
            <button className="btn" onClick={() => setAnchor((d) => addDays(d, -7))} aria-label="Previous week">‹</button>
            <button className="btn" onClick={() => setAnchor(new Date())}>This week</button>
            <button className="btn" onClick={() => setAnchor((d) => addDays(d, 7))} aria-label="Next week">›</button>
            <span className="week-label">{weekLabel(weekStart)}</span>
          </div>
        )}
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={tab === t.key ? 'tab on' : 'tab'}
              aria-current={tab === t.key ? 'page' : undefined}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {t.key === 'chores' && state.chores.length > 0 && <span className="tab-count">{state.chores.length}</span>}
              {t.key === 'people' && state.people.length > 0 && <span className="tab-count">{state.people.length}</span>}
            </button>
          ))}
        </nav>
      </header>

      <main className="layout no-print">
        {tab === 'roster' && (
          <div className="col">
            <section className="panel">
              <div className="panel-head">
                <h2>This week</h2>
                <label className="week-start">
                  Week starts
                  <select
                    value={state.weekStartsOn}
                    onChange={(e) => setState((s) => ({ ...s, weekStartsOn: Number(e.target.value) as 0 | 1 }))}
                  >
                    <option value={1}>Monday</option>
                    <option value={0}>Sunday</option>
                  </select>
                </label>
              </div>
              <WeekView state={state} weekStart={weekStart} />
            </section>

            <LoadSummary state={state} weekStart={weekStart} />
          </div>
        )}

        {tab === 'chores' && (
          <div className="col col-narrow">
            <ChoreManager
              chores={state.chores}
              people={state.people}
              onSave={saveChore}
              onDelete={deleteChore}
            />
          </div>
        )}

        {tab === 'people' && (
          <div className="col col-narrow">
            <PeopleManager
              people={state.people}
              onAdd={addPerson}
              onUpdate={updatePerson}
              onDelete={deletePerson}
            />
          </div>
        )}

        {tab === 'print' && (
          <div className="col">
            <section className="panel print-panel">
              <h2>Print roster</h2>
              <div className="print-controls">
                <div className="segmented">
                  <button className={printLayout === 'grid' ? 'seg on' : 'seg'} onClick={() => setPrintLayout('grid')}>
                    Weekly grid
                  </button>
                  <button className={printLayout === 'cards' ? 'seg on' : 'seg'} onClick={() => setPrintLayout('cards')}>
                    Per-person
                  </button>
                </div>
                <button className="btn primary" onClick={() => doPrint(printLayout)}>🖨 Print / Save PDF</button>
              </div>
              <p className="hint">A4, grayscale-safe. Choose a layout, then print. Set your browser to “Save as PDF” for a digital copy.</p>

              <div className="print-preview">
                <PrintRoster state={state} weekStart={weekStart} layout={printLayout} />
              </div>
            </section>
          </div>
        )}

        {tab === 'backup' && (
          <div className="col col-narrow">
            <section className="panel data-panel">
              <h2>Backup</h2>
              <div className="data-actions">
                <button className="btn" onClick={() => exportJson(state)}>Export JSON</button>
                <button className="btn" onClick={() => fileRef.current?.click()}>Import JSON</button>
                <button className="btn danger ghost" onClick={resetAll}>Reset to example</button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) doImport(f)
                    e.target.value = ''
                  }}
                />
              </div>
              {importError && <p className="error">{importError}</p>}
              <p className="hint">Data is stored in this browser. Export to back up or move it to another device.</p>
            </section>
          </div>
        )}
      </main>

      {/* Print-only output — hidden on screen, shown when printing */}
      <div className="print-only">
        <PrintRoster state={state} weekStart={weekStart} layout={printLayout} />
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

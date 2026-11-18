import { useState } from 'react'
import { ArrowLeft, Check, Printer } from 'lucide-react'
import type { ReactNode } from 'react'
import type { PrintLayout } from './PrintRoster'
import { PageHeader } from './PageHeader'

export interface PrintOptions {
  tickBoxes: boolean
  personKey: boolean
  notes: boolean
  hideUnassigned: boolean
}

interface Props {
  weekLabel: string
  /** Previous / next week buttons, so the week can change without leaving this page. */
  weekNav: ReactNode
  layout: PrintLayout
  onLayoutChange: (l: PrintLayout) => void
  options: PrintOptions
  onOptionsChange: (o: PrintOptions) => void
  onPrint: () => void
  onBack: () => void
  /** The live PrintRoster, shown when Preview is toggled on. */
  preview: ReactNode
}

const OPTION_LABELS: { key: keyof PrintOptions; label: string }[] = [
  { key: 'tickBoxes', label: 'Tick boxes' },
  { key: 'personKey', label: 'Person key with patterns' },
  { key: 'notes', label: 'Include chore notes' },
  { key: 'hideUnassigned', label: 'Hide unassigned' },
]

export function PrintPanel({ weekLabel, weekNav, layout, onLayoutChange, options, onOptionsChange, onPrint, onBack, preview }: Props) {
  const [showPreview, setShowPreview] = useState(false)

  return (
    <div className="page-narrow">
      <PageHeader
        before={
          <button className="backlink" onClick={onBack}>
            <ArrowLeft size={16} /> Back to the week
          </button>
        }
        title="Print roster"
        description={weekLabel}
        actions={weekNav}
      />

      <section className="card">
        <h2 className="section-title">Layout</h2>
        <div className="print-layouts">
          <button
            className={`print-layout-card${layout === 'grid' ? ' selected' : ''}`}
            onClick={() => onLayoutChange('grid')}
          >
            <span className="print-schematic schematic-grid" aria-hidden>
              {Array.from({ length: 7 }, (_, i) => <span key={i} />)}
            </span>
            <strong>Weekly grid</strong>
            <span className="text-muted">A4 landscape · everyone on one sheet</span>
          </button>
          <button
            className={`print-layout-card${layout === 'people' ? ' selected' : ''}`}
            onClick={() => onLayoutChange('people')}
          >
            <span className="print-schematic schematic-people" aria-hidden>
              {Array.from({ length: 4 }, (_, i) => <span key={i} />)}
            </span>
            <strong>People rows</strong>
            <span className="text-muted">A4 landscape · one row per person</span>
          </button>
          <button
            className={`print-layout-card${layout === 'cards' ? ' selected' : ''}`}
            onClick={() => onLayoutChange('cards')}
          >
            <span className="print-schematic schematic-cards" aria-hidden>
              {Array.from({ length: 4 }, (_, i) => <span key={i} />)}
            </span>
            <strong>Per-person cards</strong>
            <span className="text-muted">A4 portrait · one card each</span>
          </button>
        </div>

        <h2 className="section-title">Options</h2>
        <div className="print-options">
          {OPTION_LABELS.map(({ key, label }) => (
            <label key={key} className="checkbox">
              <input
                type="checkbox"
                checked={options[key]}
                onChange={(e) => onOptionsChange({ ...options, [key]: e.target.checked })}
              />
              <span className="checkbox-box">{options[key] && <Check size={14} strokeWidth={3} />}</span>
              {label}
            </label>
          ))}
        </div>

        <div className="print-actions">
          <button className="btn btn-primary" onClick={onPrint}>
            <Printer size={16} /> Print / Save PDF
          </button>
          <button className="btn" onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? 'Hide preview' : 'Preview'}
          </button>
          <span className="text-muted print-note">Grayscale-safe</span>
        </div>
      </section>
      {showPreview && <div className="print-preview">{preview}</div>}
    </div>
  )
}

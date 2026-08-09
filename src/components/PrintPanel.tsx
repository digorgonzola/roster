import { useState } from 'react'
import { Check, Printer } from 'lucide-react'
import type { ReactNode } from 'react'
import type { PrintLayout } from './PrintRoster'

export interface PrintOptions {
  tickBoxes: boolean
  personKey: boolean
  notes: boolean
  hideUnassigned: boolean
}

interface Props {
  layout: PrintLayout
  onLayoutChange: (l: PrintLayout) => void
  options: PrintOptions
  onOptionsChange: (o: PrintOptions) => void
  onPrint: () => void
  /** The live PrintRoster, shown when Preview is toggled on. */
  preview: ReactNode
}

const OPTION_LABELS: { key: keyof PrintOptions; label: string }[] = [
  { key: 'tickBoxes', label: 'Tick boxes' },
  { key: 'personKey', label: 'Person key with patterns' },
  { key: 'notes', label: 'Include chore notes' },
  { key: 'hideUnassigned', label: 'Hide unassigned' },
]

export function PrintPanel({ layout, onLayoutChange, options, onOptionsChange, onPrint, preview }: Props) {
  const [showPreview, setShowPreview] = useState(false)

  return (
    <div className="page-narrow">
      <h2>Print roster</h2>
      <hr className="hr" />

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
        <button className="btn btn-secondary" onClick={() => setShowPreview((v) => !v)}>
          {showPreview ? 'Hide preview' : 'Preview'}
        </button>
        <span className="text-muted print-note">Grayscale-safe</span>
      </div>

      {showPreview && <div className="print-preview">{preview}</div>}
    </div>
  )
}

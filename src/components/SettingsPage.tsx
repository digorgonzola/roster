import { useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { renderSVG } from 'uqr'
import type { AppState, TimeOfDay } from '../types'
import { TIME_SLOTS, slotLabel } from '../timeofday'

interface Props {
  state: AppState
  mobile: boolean
  onWeekStartsOn: (v: 0 | 1) => void
  onRenameSlot: (slot: TimeOfDay, label: string) => void
  onExport: () => void
  onImport: (file: File) => void
  onReset: () => void
  importError: string
  /** Null while this roster is not shared. */
  shareLink: string | null
  shareBusy: boolean
  shareError: string
  /** Authed sockets in the room; null while the push channel is down. */
  deviceCount: number | null
  onShare: () => void
  onStopShare: () => void
}

function syncStatus(deviceCount: number | null): string {
  return deviceCount !== null && deviceCount > 1
    ? `Syncing with ${deviceCount} devices`
    : 'Syncing'
}

function QrCode({ text }: { text: string }) {
  const svg = renderSVG(text, { border: 2 })
  return (
    <img
      className="share-qr"
      alt="QR code for the share link"
      src={`data:image/svg+xml,${encodeURIComponent(svg)}`}
    />
  )
}

/** Link + copy + QR + stop, shown while the roster is shared (design 3b). */
function ShareCard({ shareLink, deviceCount, onStopShare }: {
  shareLink: string
  deviceCount: number | null
  onStopShare: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard blocked: the link stays selectable in the input
    }
  }

  return (
    <div className="share-card">
      <div className="share-status">
        <span className="share-dot" />
        <strong>{syncStatus(deviceCount)}</strong>
      </div>
      <div className="data-row">
        <input
          className="input share-link"
          readOnly
          value={shareLink}
          onFocus={(e) => e.target.select()}
          aria-label="Share link"
        />
        <button className="btn btn-secondary" onClick={() => void copyLink()}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="text-muted footnote share-card-note">
        Anyone with this link can view and edit. Open it on another device to sync.
      </p>
      {showQr && <QrCode text={shareLink} />}
      <div className="share-card-actions">
        <button className="btn btn-secondary" onClick={() => setShowQr((v) => !v)}>
          {showQr ? 'Hide QR code' : 'Show QR code'}
        </button>
        <button className="btn btn-ghost share-stop" onClick={onStopShare}>Stop syncing</button>
      </div>
    </div>
  )
}

/** Inline editor for the four day-part names. */
function SlotLabelEditor({ state, onRenameSlot, onDone }: {
  state: AppState
  onRenameSlot: (slot: TimeOfDay, label: string) => void
  onDone: () => void
}) {
  return (
    <div className="slot-editor">
      {TIME_SLOTS.map((s) => (
        <label key={s.key} className="slot-editor-row">
          <span className="text-muted">{s.label}</span>
          <input
            className="input"
            defaultValue={state.timeOfDayLabels?.[s.key] ?? ''}
            placeholder={s.label}
            onBlur={(e) => onRenameSlot(s.key, e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </label>
      ))}
      <div>
        <button className="btn btn-secondary" onClick={onDone}>Done</button>
      </div>
    </div>
  )
}

function WeekStartSeg({ value, onChange }: { value: 0 | 1; onChange: (v: 0 | 1) => void }) {
  return (
    <span className="seg">
      {([['Monday', 1], ['Sunday', 0]] as const).map(([label, v]) => (
        <label key={v} className="seg-opt">
          <input type="radio" name="week-starts" checked={value === v} onChange={() => onChange(v)} />
          {label}
        </label>
      ))}
    </span>
  )
}

export function SettingsPage(props: Props) {
  const { state, mobile } = props
  const [renaming, setRenaming] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept="application/json"
      style={{ display: 'none' }}
      onChange={(e) => {
        const f = e.target.files?.[0]
        if (f) props.onImport(f)
        e.target.value = ''
      }}
    />
  )

  if (mobile) return <MobileSettings {...props} fileRef={fileRef} fileInput={fileInput} />

  return (
    <div className="settings-page">
      <h2>Settings</h2>
      <p className="text-muted settings-tagline">Everything that isn't a chore or a person.</p>

      <hr className="hr settings-hr" />
      <h6>General</h6>
      <div className="settings-rows">
        <div className="settings-label">Week starts on</div>
        <div>
          <WeekStartSeg value={state.weekStartsOn} onChange={props.onWeekStartsOn} />
          <p className="text-muted footnote">Sets the first column of the week grid and the printed roster.</p>
        </div>

        <div className="settings-label">Time-of-day labels</div>
        <div>
          {renaming ? (
            <SlotLabelEditor state={state} onRenameSlot={props.onRenameSlot} onDone={() => setRenaming(false)} />
          ) : (
            <div className="slot-tags">
              {TIME_SLOTS.map((s) => (
                <span key={s.key} className="tag tag-outline">{slotLabel(state.timeOfDayLabels, s.key)}</span>
              ))}
              <button className="btn btn-ghost slot-rename" onClick={() => setRenaming(true)}>Rename</button>
            </div>
          )}
          <p className="text-muted footnote">Used as the row headings on the dashboard.</p>
        </div>
      </div>

      <hr className="hr settings-hr" />
      <h6>Sharing</h6>
      <div className="settings-rows">
        <div className="settings-label">Family sync</div>
        <div>
          {props.shareLink ? (
            <ShareCard shareLink={props.shareLink} deviceCount={props.deviceCount} onStopShare={props.onStopShare} />
          ) : (
            <>
              <div className="data-row">
                <button className="btn btn-primary" onClick={props.onShare} disabled={props.shareBusy}>
                  {props.shareBusy ? 'Starting…' : 'Share roster'}
                </button>
                <span className="text-muted footnote share-none">Not shared yet</span>
              </div>
              <p className="text-muted footnote">
                Creates a private link that keeps this roster in sync between family devices.
              </p>
            </>
          )}
          {props.shareError && <p className="editor-error">{props.shareError}</p>}
        </div>
      </div>

      <hr className="hr settings-hr" />
      <h6>Data</h6>
      <div className="settings-rows">
        <div className="settings-label">Backup</div>
        <div>
          <div className="data-row">
            <button className="btn btn-secondary" onClick={props.onExport}>Export JSON</button>
            <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>Import JSON</button>
          </div>
          {props.importError && <p className="editor-error">{props.importError}</p>}
          <p className="text-muted footnote">
            Data is stored in this browser. Export to back it up or move it to another device.
          </p>
        </div>

        <div className="settings-label settings-label-danger">Start over</div>
        <div>
          <div className="data-row">
            <button className="btn btn-secondary btn-danger-outline" onClick={props.onReset}>Reset to example</button>
          </div>
          <p className="text-muted footnote">Replaces every person and chore with the sample household. Asks first.</p>
        </div>
      </div>
      {fileInput}
    </div>
  )
}

/** Design 3c: grouped list rows; the drill-in rows expand in place. */
function MobileSettings(props: Props & {
  fileRef: React.RefObject<HTMLInputElement | null>
  fileInput: React.ReactNode
}) {
  const { state } = props
  const [open, setOpen] = useState<'week' | 'labels' | 'sync' | null>(null)
  const toggle = (k: 'week' | 'labels' | 'sync') => setOpen((v) => (v === k ? null : k))

  return (
    <div className="mset">
      <header className="mset-header"><h2>Settings</h2></header>

      <h6 className="mset-section">General</h6>
      <button className="mset-row" onClick={() => toggle('week')} aria-expanded={open === 'week'}>
        <span className="mset-row-label">Week starts on</span>
        <span className="text-muted">{state.weekStartsOn === 1 ? 'Monday' : 'Sunday'}</span>
        <ChevronRight size={16} className={`mset-chevron${open === 'week' ? ' open' : ''}`} />
      </button>
      {open === 'week' && (
        <div className="mset-detail">
          <WeekStartSeg value={state.weekStartsOn} onChange={props.onWeekStartsOn} />
        </div>
      )}

      <button className="mset-row" onClick={() => toggle('labels')} aria-expanded={open === 'labels'}>
        <span className="mset-row-label">Time-of-day labels</span>
        <ChevronRight size={16} className={`mset-chevron${open === 'labels' ? ' open' : ''}`} />
      </button>
      {open === 'labels' && (
        <div className="mset-detail">
          <SlotLabelEditor state={state} onRenameSlot={props.onRenameSlot} onDone={() => setOpen(null)} />
        </div>
      )}

      <h6 className="mset-section">Sharing</h6>
      {props.shareLink ? (
        <>
          <button className="mset-row mset-row-tall" onClick={() => toggle('sync')} aria-expanded={open === 'sync'}>
            <span className="mset-row-main">
              <span className="mset-row-top">
                <span className="share-dot" />
                <span className="mset-row-label">{syncStatus(props.deviceCount)}</span>
              </span>
              <span className="text-muted mset-row-sub">Tap for link and QR</span>
            </span>
            <ChevronRight size={16} className={`mset-chevron${open === 'sync' ? ' open' : ''}`} />
          </button>
          {open === 'sync' && (
            <div className="mset-detail">
              <ShareCard shareLink={props.shareLink} deviceCount={props.deviceCount} onStopShare={props.onStopShare} />
            </div>
          )}
        </>
      ) : (
        <button className="mset-row" onClick={props.onShare} disabled={props.shareBusy}>
          <span className="mset-row-label">{props.shareBusy ? 'Starting…' : 'Share roster'}</span>
          <span className="text-muted">Not shared yet</span>
        </button>
      )}
      {props.shareError && <p className="editor-error mset-error">{props.shareError}</p>}

      <h6 className="mset-section">Data</h6>
      <button className="mset-row" onClick={props.onExport}>
        <span className="mset-row-label">Export a backup</span>
      </button>
      <button className="mset-row" onClick={() => props.fileRef.current?.click()}>
        <span className="mset-row-label">Import a backup</span>
      </button>
      {props.importError && <p className="editor-error mset-error">{props.importError}</p>}
      <button className="mset-row mset-row-danger" onClick={props.onReset}>
        <span className="mset-row-label">Reset to example</span>
      </button>
      {props.fileInput}
    </div>
  )
}

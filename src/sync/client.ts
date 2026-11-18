import type { AppState } from '../types'
import type { Op } from '../ops'
import {
  CALENDAR_TOKEN_PARAM,
  type CalendarFeedResponse,
  type ClientMessage,
  type Me,
  type OpRequest,
  type OpResponse,
  type ServerMessage,
  type Snapshot,
} from './protocol'

/**
 * Client side of the household roster.
 *
 * Cloudflare Access signs each member in, and its cookie rides along on every
 * same-origin request, so the client holds no credential of its own.
 *
 * Data flow:
 * - Local edits apply optimistically, join a persisted pending queue, and
 *   flush to the room over HTTP in order. The queue survives a reload, so
 *   offline edits replay when the connection returns.
 * - Remote edits arrive over a WebSocket push channel. A gap in `rev` (or a
 *   reconnect) triggers a snapshot refetch, rebased over the pending queue.
 * - While the socket is down, a slow poll (30s) keeps devices converging.
 */

const PENDING_KEY = 'roster.pending.v1'
/** Share-link credentials from before sign-in. Removed so no device keeps an unused secret. */
const LEGACY_KEYS = ['roster.share.v1', 'roster.cal.v1']
const FALLBACK_POLL_MS = 30_000
const BACKOFF_MIN_MS = 1_000
const BACKOFF_MAX_MS = 30_000

export interface SyncHandlers {
  /** A remote op to apply on top of current local state. */
  onRemoteOp: (op: Op) => void
  /**
   * Authoritative snapshot. `pending` holds local ops the server has not
   * acknowledged yet: re-apply them on top (`pending.reduce(applyOp, state)`).
   */
  onSnapshot: (state: AppState, pending: Op[]) => void
  /**
   * Connected-device count from the room. Null while the push channel is
   * down, when the count is unknown.
   */
  onPresence?: (devices: number | null) => void
}

export function clearLegacyShareConfig(): void {
  try {
    for (const key of LEGACY_KEYS) localStorage.removeItem(key)
  } catch {
    // storage disabled: nothing stored to clear
  }
}

/** The signed-in household member. */
export async function fetchMe(): Promise<Me> {
  return (await (await expectOk(await fetch('/api/me'))).json()) as Me
}

/** The calendar feed token, or null until a member enables the feed. */
export async function fetchCalendarToken(): Promise<string | null> {
  const res = await expectOk(await fetch('/api/calendar'))
  return ((await res.json()) as CalendarFeedResponse).token
}

/** Create the household's feed token (or get the existing one). */
export async function enableCalendarFeed(): Promise<string> {
  const res = await expectOk(
    await fetch('/api/calendar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }),
  )
  const { token } = (await res.json()) as CalendarFeedResponse
  if (token === null) throw new Error('calendar feed token missing')
  return token
}

/** The subscribable .ics URL for a person (or the whole household). */
export function calendarFeedUrl(token: string, opts: { personId?: string; tasks?: boolean } = {}): string {
  const u = new URL(`${location.origin}/api/calendar.ics`)
  u.searchParams.set(CALENDAR_TOKEN_PARAM, token)
  if (opts.personId) u.searchParams.set('person', opts.personId)
  if (opts.tasks) u.searchParams.set('kind', 'tasks')
  return u.toString()
}

export class SyncRequestError extends Error {
  constructor(readonly status: number) {
    super(`sync request failed: ${status}`)
    this.name = 'SyncRequestError'
  }
}

async function expectOk(res: Response): Promise<Response> {
  if (!res.ok) throw new SyncRequestError(res.status)
  return res
}

function loadPending(): Op[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY)
    const parsed = raw ? (JSON.parse(raw) as Op[]) : []
    if (Array.isArray(parsed)) return parsed
  } catch {
    // corrupt queue: drop it, the server state wins
  }
  return []
}

function savePending(pending: Op[]): void {
  try {
    if (pending.length) localStorage.setItem(PENDING_KEY, JSON.stringify(pending))
    else localStorage.removeItem(PENDING_KEY)
  } catch {
    // storage full: the queue still lives in memory for this session
  }
}

export class SyncClient {
  private rev = 0
  private pending: Op[] = loadPending()
  private flushing = false
  private handlers: SyncHandlers | null = null
  private ws: WebSocket | null = null
  private wsUp = false
  private backoffMs = BACKOFF_MIN_MS
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private stopped = false

  /** Wire up callbacks, open the push channel, and flush any queued ops. */
  start(handlers: SyncHandlers): void {
    this.handlers = handlers
    this.stopped = false
    this.connect()
    this.setPolling(true)
    void this.flush()
    void this.refreshSnapshot().catch(() => {})
  }

  /** Close the channel and stop timers. The pending queue stays persisted. */
  stop(): void {
    this.stopped = true
    this.handlers = null
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.setPolling(false)
    this.ws?.close()
    this.ws = null
  }

  /** Queue a locally-applied op and start delivering. */
  push(op: Op): void {
    this.pending.push(op)
    savePending(this.pending)
    void this.flush()
  }

  // ---- Delivery --------------------------------------------------------

  private async flush(): Promise<void> {
    if (this.flushing) return
    this.flushing = true
    let sawStale = false
    try {
      while (this.pending.length > 0) {
        const res = await this.send(this.pending[0], this.rev)
        this.rev = Math.max(this.rev, res.rev)
        if (res.stale) sawStale = true
        this.pending.shift()
        savePending(this.pending)
      }
      if (sawStale) await this.refreshSnapshot()
    } catch {
      // offline or signed out: keep the queue, retry on reconnect/poll
    } finally {
      this.flushing = false
    }
  }

  private async refreshSnapshot(): Promise<void> {
    const snapshot = await this.fetchSnapshot()
    if (snapshot.rev <= this.rev && this.pending.length === 0) return
    this.rev = Math.max(this.rev, snapshot.rev)
    this.handlers?.onSnapshot(snapshot.state, [...this.pending])
  }

  // ---- Push channel ------------------------------------------------------

  private connect(): void {
    if (this.stopped) return
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${scheme}://${location.host}/api/ws`)
    this.ws = ws

    ws.onopen = () => {
      const hello: ClientMessage = { t: 'hello' }
      ws.send(JSON.stringify(hello))
    }

    ws.onmessage = (event) => {
      let msg: ServerMessage
      try {
        msg = JSON.parse(String(event.data)) as ServerMessage
      } catch {
        return
      }
      if (msg.t === 'ok') {
        this.wsUp = true
        this.backoffMs = BACKOFF_MIN_MS
        this.setPolling(false)
        void this.flush()
        if (msg.rev !== this.rev) void this.refreshSnapshot().catch(() => {})
        return
      }
      if (msg.t === 'op') {
        if (msg.rev <= this.rev) return // already counted (own op ack)
        if (msg.rev === this.rev + 1) {
          this.rev = msg.rev
          this.handlers?.onRemoteOp(msg.op)
        } else {
          void this.refreshSnapshot().catch(() => {})
        }
        return
      }
      if (msg.t === 'presence') {
        this.handlers?.onPresence?.(msg.devices)
      }
    }

    ws.onclose = () => {
      if (this.ws !== ws) return
      this.ws = null
      this.wsUp = false
      this.handlers?.onPresence?.(null)
      if (this.stopped) return
      this.setPolling(true)
      this.reconnectTimer = setTimeout(() => this.connect(), this.backoffMs)
      this.backoffMs = Math.min(this.backoffMs * 2, BACKOFF_MAX_MS)
    }

    ws.onerror = () => ws.close()
  }

  /** Slow safety-net poll, only while the push channel is down. */
  private setPolling(on: boolean): void {
    if (on && !this.pollTimer && !this.stopped && !this.wsUp) {
      this.pollTimer = setInterval(() => {
        void this.flush()
        void this.refreshSnapshot().catch(() => {})
      }, FALLBACK_POLL_MS)
    } else if (!on && this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  // ---- HTTP ------------------------------------------------------------

  async fetchSnapshot(): Promise<Snapshot> {
    const res = await expectOk(await fetch('/api/state'))
    return (await res.json()) as Snapshot
  }

  private async send(op: Op, baseRev: number): Promise<OpResponse> {
    const body: OpRequest = { baseRev, op }
    const res = await expectOk(
      await fetch('/api/op', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    )
    return (await res.json()) as OpResponse
  }
}

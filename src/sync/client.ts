import type { AppState } from '../types'
import type { Op } from '../ops'
import {
  ROSTER_KEY_HEADER,
  type ClientMessage,
  type CreateRoomResponse,
  type InitRequest,
  type OpRequest,
  type OpResponse,
  type ServerMessage,
  type Snapshot,
} from './protocol'

/**
 * Client side of roster sharing.
 *
 * The share credential is a capability: the room id plus a random 128-bit
 * key. Both travel only in the URL *fragment* (`#/r/<roomId>/<key>`), which
 * browsers never send to servers, and after the first open they live in
 * localStorage. Requests carry the room id in the path and the key in the
 * `X-Roster-Key` header.
 *
 * Data flow while shared:
 * - Local edits apply optimistically, join a persisted pending queue, and
 *   flush to the room over HTTP in order. The queue survives a reload, so
 *   offline edits replay when the connection returns.
 * - Remote edits arrive over a WebSocket push channel. A gap in `rev` (or a
 *   reconnect) triggers a snapshot refetch, rebased over the pending queue.
 * - While the socket is down, a slow poll (30s) keeps devices converging.
 */

const SHARE_KEY = 'roster.share.v1'
const PENDING_KEY = 'roster.pending.v1'
const FALLBACK_POLL_MS = 30_000
const BACKOFF_MIN_MS = 1_000
const BACKOFF_MAX_MS = 30_000

export interface ShareConfig {
  roomId: string
  key: string
}

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

export function loadShareConfig(): ShareConfig | null {
  try {
    const raw = localStorage.getItem(SHARE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ShareConfig
    if (typeof parsed.roomId === 'string' && typeof parsed.key === 'string') return parsed
  } catch {
    // corrupt config: treat as not sharing
  }
  return null
}

function saveShareConfig(config: ShareConfig): void {
  localStorage.setItem(SHARE_KEY, JSON.stringify(config))
}

export function clearShareConfig(): void {
  localStorage.removeItem(SHARE_KEY)
  localStorage.removeItem(PENDING_KEY)
}

export function shareLink(config: ShareConfig): string {
  return `${location.origin}/#/r/${config.roomId}/${config.key}`
}

/** Parse `#/r/<roomId>/<key>` from a location hash. */
export function parseShareLink(hash: string): ShareConfig | null {
  const m = hash.match(/^#\/r\/([0-9a-f-]{36})\/([A-Za-z0-9_-]{16,64})$/)
  return m ? { roomId: m[1], key: m[2] } : null
}

function newRoomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

async function expectOk(res: Response): Promise<Response> {
  if (!res.ok) throw new Error(`sync request failed: ${res.status}`)
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

  constructor(readonly config: ShareConfig) {}

  /** Create a room seeded with `state`, persist the credential, return the client. */
  static async create(state: AppState): Promise<SyncClient> {
    const created = await expectOk(await fetch('/api/rooms', { method: 'POST' }))
    const { roomId } = (await created.json()) as CreateRoomResponse
    const config: ShareConfig = { roomId, key: newRoomKey() }

    const body: InitRequest = { keyHash: await sha256Hex(config.key), state }
    await expectOk(
      await fetch(`/api/rooms/${config.roomId}/init`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    )
    saveShareConfig(config)
    const client = new SyncClient(config)
    client.rev = 1
    return client
  }

  /** Join an existing room from a share link and persist the credential. */
  static async join(config: ShareConfig): Promise<{ client: SyncClient; snapshot: Snapshot }> {
    const client = new SyncClient(config)
    const snapshot = await client.fetchSnapshot()
    client.rev = snapshot.rev
    saveShareConfig(config)
    return { client, snapshot }
  }

  /** Wire up callbacks, open the push channel, and flush any queued ops. */
  start(handlers: SyncHandlers): void {
    this.handlers = handlers
    this.stopped = false
    this.connect()
    this.setPolling(true)
    void this.flush()
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
      // offline or unauthorized: keep the queue, retry on reconnect/poll
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
    const ws = new WebSocket(`${scheme}://${location.host}/api/rooms/${this.config.roomId}/ws`)
    this.ws = ws

    ws.onopen = () => {
      const auth: ClientMessage = { t: 'auth', key: this.config.key }
      ws.send(JSON.stringify(auth))
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
    const res = await expectOk(
      await fetch(`/api/rooms/${this.config.roomId}/state`, {
        headers: { [ROSTER_KEY_HEADER]: this.config.key },
      }),
    )
    return (await res.json()) as Snapshot
  }

  private async send(op: Op, baseRev: number): Promise<OpResponse> {
    const body: OpRequest = { baseRev, op }
    const res = await expectOk(
      await fetch(`/api/rooms/${this.config.roomId}/op`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [ROSTER_KEY_HEADER]: this.config.key,
        },
        body: JSON.stringify(body),
      }),
    )
    return (await res.json()) as OpResponse
  }
}

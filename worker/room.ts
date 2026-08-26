import { DurableObject } from 'cloudflare:workers'
import type { AppState } from '../src/types'
import { applyOp, type Op } from '../src/ops'
import { migrate } from '../src/migrate'
import { buildCalendar, buildTasks, calendarName } from '../src/ics'
import type {
  CalendarEnableRequest,
  ClientMessage,
  InitRequest,
  OpRequest,
  OpResponse,
  ServerMessage,
  Snapshot,
} from '../src/sync/protocol'
import { CALENDAR_TOKEN_PARAM, ROSTER_KEY_HEADER } from '../src/sync/protocol'
import type { Env } from './env'

/** Auth failures allowed before every further attempt is delayed. */
const FAIL_LIMIT = 5
const FAIL_DELAY_MS = 1000

/** How many weeks of occurrences the subscribable feed materialises ahead. */
const FEED_WEEKS = 13

/**
 * One shared roster. The DO serializes all writes, so ops apply one at a
 * time to the authoritative state and `rev` increases by exactly 1 per op.
 *
 * Storage keys: `state` (AppState JSON), `rev` (number), `keyHash` (hex
 * SHA-256 of the room key), `fails` (auth failure counter).
 */
export class RosterRoom extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const route = `${request.method} ${url.pathname.replace(/^.*\/api\/rooms\/[^/]+/, '')}`

    if (route === 'POST /init') return this.init(request)
    if (route === 'GET /state') return this.snapshot(request)
    if (route === 'POST /op') return this.op(request)
    if (route === 'GET /ws') return this.upgrade(request)
    if (route === 'POST /calendar') return this.enableCalendar(request)
    if (route === 'GET /calendar.ics') return this.serveCalendar(request)
    return json({ error: 'not found' }, 404)
  }

  /**
   * Push channel. The socket is accepted through the Hibernation API so an
   * idle room costs nothing; it starts unauthenticated and receives no
   * broadcasts until the first message presents the key.
   */
  private upgrade(request: Request): Response {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return json({ error: 'expected websocket' }, 426)
    }
    const pair = new WebSocketPair()
    this.ctx.acceptWebSocket(pair[1])
    pair[1].serializeAttachment({ authed: false })
    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const attachment = (ws.deserializeAttachment() ?? {}) as { authed?: boolean }
    if (attachment.authed) return // receive-only channel: ignore chatter

    let auth: ClientMessage | null = null
    try {
      auth = JSON.parse(typeof message === 'string' ? message : '') as ClientMessage
    } catch {
      // fall through to close below
    }
    const stored = await this.ctx.storage.get<string>('keyHash')
    const fails = (await this.ctx.storage.get<number>('fails')) ?? 0
    if (fails >= FAIL_LIMIT) await scheduler.wait(FAIL_DELAY_MS)

    if (
      auth?.t === 'auth' &&
      typeof auth.key === 'string' &&
      stored !== undefined &&
      (await hashesMatch(auth.key, stored))
    ) {
      if (fails > 0) await this.ctx.storage.put('fails', 0)
      ws.serializeAttachment({ authed: true })
      const rev = (await this.ctx.storage.get<number>('rev')) ?? 0
      ws.send(JSON.stringify({ t: 'ok', rev } satisfies ServerMessage))
      this.broadcastPresence()
      return
    }
    await this.ctx.storage.put('fails', fails + 1)
    ws.close(1008, 'unauthorized')
  }

  webSocketClose(): void {
    this.broadcastPresence()
  }

  webSocketError(): void {
    this.broadcastPresence()
  }

  private authedSockets(): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => {
      if (ws.readyState !== WebSocket.READY_STATE_OPEN) return false
      const attachment = (ws.deserializeAttachment() ?? {}) as { authed?: boolean }
      return attachment.authed === true
    })
  }

  /** Tell every device how many are connected, for the Settings page. */
  private broadcastPresence(): void {
    const sockets = this.authedSockets()
    const payload = JSON.stringify({ t: 'presence', devices: sockets.length } satisfies ServerMessage)
    for (const ws of sockets) {
      try {
        ws.send(payload)
      } catch {
        // socket died between the filter and the send: the next event corrects the count
      }
    }
  }

  private broadcast(message: ServerMessage): void {
    const payload = JSON.stringify(message)
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = (ws.deserializeAttachment() ?? {}) as { authed?: boolean }
      if (attachment.authed) ws.send(payload)
    }
  }

  /** First caller sets the key hash and seed state. Later calls get 409. */
  private async init(request: Request): Promise<Response> {
    const existing = await this.ctx.storage.get('keyHash')
    if (existing !== undefined) return json({ error: 'room already initialized' }, 409)

    const body = (await request.json()) as InitRequest
    if (typeof body.keyHash !== 'string' || !/^[0-9a-f]{64}$/.test(body.keyHash)) {
      return json({ error: 'bad keyHash' }, 400)
    }
    const state = migrate(body.state)
    await this.ctx.storage.put({ keyHash: body.keyHash, state, rev: 1 })
    return json({ rev: 1 } satisfies Partial<Snapshot>, 200)
  }

  private async snapshot(request: Request): Promise<Response> {
    const denied = await this.checkKey(request)
    if (denied) return denied
    const [rev, state] = await Promise.all([
      this.ctx.storage.get<number>('rev'),
      this.ctx.storage.get<AppState>('state'),
    ])
    if (rev === undefined || state === undefined) return json({ error: 'not initialized' }, 404)
    return json({ rev, state } satisfies Snapshot, 200)
  }

  private async op(request: Request): Promise<Response> {
    const denied = await this.checkKey(request)
    if (denied) return denied
    const rev = await this.ctx.storage.get<number>('rev')
    const state = await this.ctx.storage.get<AppState>('state')
    if (rev === undefined || state === undefined) return json({ error: 'not initialized' }, 404)

    const body = (await request.json()) as OpRequest
    const op = body.op as Op | undefined
    if (!op || typeof op.t !== 'string') return json({ error: 'bad op' }, 400)

    const next = applyOp(state, op)
    const nextRev = rev + 1
    await this.ctx.storage.put({ state: next, rev: nextRev })
    this.broadcast({ t: 'op', rev: nextRev, op })
    return json({ rev: nextRev, stale: body.baseRev !== rev } satisfies OpResponse, 200)
  }

  /** Register the feed token hash (authed with the room key). Idempotent. */
  private async enableCalendar(request: Request): Promise<Response> {
    const denied = await this.checkKey(request)
    if (denied) return denied
    const body = (await request.json()) as CalendarEnableRequest
    if (typeof body.tokenHash !== 'string' || !/^[0-9a-f]{64}$/.test(body.tokenHash)) {
      return json({ error: 'bad tokenHash' }, 400)
    }
    await this.ctx.storage.put('calTokenHash', body.tokenHash)
    return json({ ok: true }, 200)
  }

  /**
   * Serve a rolling window of chore occurrences as an .ics feed. The token in
   * the query grants read-only access; it cannot be used to write ops. No
   * key/token means the feed is not enabled or the token is wrong: 401 either
   * way, so a bad URL never reveals whether the room exists.
   */
  private async serveCalendar(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const token = url.searchParams.get(CALENDAR_TOKEN_PARAM)
    const stored = await this.ctx.storage.get<string>('calTokenHash')
    if (token === null || stored === undefined || !(await hashesMatch(token, stored))) {
      return json({ error: 'unauthorized' }, 401)
    }
    const state = await this.ctx.storage.get<AppState>('state')
    if (state === undefined) return json({ error: 'not initialized' }, 404)

    const personId = url.searchParams.get('person') ?? undefined
    const tasks = url.searchParams.get('kind') === 'tasks'
    const now = new Date()
    const opts = {
      start: now,
      weeks: FEED_WEEKS,
      personId,
      now,
      name: calendarName(state, personId),
    }
    const body = tasks ? buildTasks(state, opts) : buildCalendar(state, opts)
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'text/calendar; charset=utf-8',
        'cache-control': 'no-cache',
      },
    })
  }

  /** Null when the presented key matches; an error Response otherwise. */
  private async checkKey(request: Request): Promise<Response | null> {
    const stored = await this.ctx.storage.get<string>('keyHash')
    if (stored === undefined) return json({ error: 'not initialized' }, 404)

    const fails = (await this.ctx.storage.get<number>('fails')) ?? 0
    if (fails >= FAIL_LIMIT) await scheduler.wait(FAIL_DELAY_MS)

    const key = request.headers.get(ROSTER_KEY_HEADER)
    if (key && (await hashesMatch(key, stored))) {
      if (fails > 0) await this.ctx.storage.put('fails', 0)
      return null
    }
    await this.ctx.storage.put('fails', fails + 1)
    return json({ error: 'unauthorized' }, 401)
  }
}

async function hashesMatch(presentedKey: string, storedHex: string): Promise<boolean> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(presentedKey))
  const stored = hexToBytes(storedHex)
  if (stored === null || stored.byteLength !== 32) return false
  return crypto.subtle.timingSafeEqual(digest, stored.buffer as ArrayBuffer)
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/.test(hex) || hex.length % 2 !== 0) return null
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

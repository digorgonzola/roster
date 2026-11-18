import { DurableObject } from 'cloudflare:workers'
import type { AppState } from '../src/types'
import { applyOp, type Op } from '../src/ops'
import { seedState } from '../src/seed'
import { buildCalendar, buildTasks, calendarName } from '../src/ics'
import type {
  CalendarFeedResponse,
  ClientMessage,
  OpRequest,
  OpResponse,
  ServerMessage,
  Snapshot,
} from '../src/sync/protocol'
import { CALENDAR_TOKEN_PARAM } from '../src/sync/protocol'
import type { Env } from './env'
import { json } from './http'

/** How many weeks of occurrences the subscribable feed materialises ahead. */
const FEED_WEEKS = 13

/**
 * The household's shared roster. The DO serializes all writes, so ops apply
 * one at a time to the authoritative state and `rev` increases by exactly 1
 * per op.
 *
 * Only the Worker reaches this object, and it forwards a request only after
 * Cloudflare Access identified a household member. The calendar feed is the
 * one exception: it carries its own read-only token.
 *
 * Storage keys: `state` (AppState JSON), `rev` (number), `calToken` (feed
 * token). Rooms made before sign-in also hold unused `keyHash`, `fails` and
 * `calTokenHash` keys.
 */
export class RosterRoom extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const route = `${request.method} ${url.pathname.replace(/^\/api/, '')}`

    if (route === 'GET /state') return this.snapshot()
    if (route === 'POST /op') return this.op(request)
    if (route === 'GET /ws') return this.upgrade(request)
    if (route === 'GET /calendar') return this.readCalendarToken()
    if (route === 'POST /calendar') return this.enableCalendar()
    if (route === 'GET /calendar.ics') return this.serveCalendar(request)
    return json({ error: 'NOT_FOUND_ROUTE' }, 404)
  }

  /** Push channel, through the Hibernation API so an idle room costs nothing. */
  private upgrade(request: Request): Response {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return json({ error: 'VALIDATION_EXPECTED_WEBSOCKET' }, 426)
    }
    const pair = new WebSocketPair()
    this.ctx.acceptWebSocket(pair[1])
    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    let hello: ClientMessage | null = null
    try {
      hello = JSON.parse(typeof message === 'string' ? message : '') as ClientMessage
    } catch {
      return // receive-only channel: ignore chatter
    }
    if (hello?.t !== 'hello') return
    const { rev } = await this.load()
    ws.send(JSON.stringify({ t: 'ok', rev } satisfies ServerMessage))
    this.broadcastPresence()
  }

  webSocketClose(): void {
    this.broadcastPresence()
  }

  webSocketError(): void {
    this.broadcastPresence()
  }

  private openSockets(): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => ws.readyState === WebSocket.READY_STATE_OPEN)
  }

  /** Tell every device how many are connected, for the Settings page. */
  private broadcastPresence(): void {
    const sockets = this.openSockets()
    this.broadcast({ t: 'presence', devices: sockets.length }, sockets)
  }

  private broadcast(message: ServerMessage, sockets = this.openSockets()): void {
    const payload = JSON.stringify(message)
    for (const ws of sockets) {
      try {
        ws.send(payload)
      } catch {
        // socket died between the filter and the send: the next event corrects the count
      }
    }
  }

  /** The stored roster, seeded with the example household on first use. */
  private async load(): Promise<Snapshot> {
    const [rev, state] = await Promise.all([
      this.ctx.storage.get<number>('rev'),
      this.ctx.storage.get<AppState>('state'),
    ])
    if (rev !== undefined && state !== undefined) return { rev, state }
    const seeded = { rev: 1, state: seedState() }
    await this.ctx.storage.put(seeded)
    return seeded
  }

  private async snapshot(): Promise<Response> {
    const { rev, state } = await this.load()
    return json({ rev, state } satisfies Snapshot)
  }

  private async op(request: Request): Promise<Response> {
    const { rev, state } = await this.load()

    const body = (await request.json()) as OpRequest
    const op = body.op as Op | undefined
    if (!op || typeof op.t !== 'string') return json({ error: 'VALIDATION_BAD_OP' }, 400)

    const next = applyOp(state, op)
    const nextRev = rev + 1
    await this.ctx.storage.put({ state: next, rev: nextRev })
    this.broadcast({ t: 'op', rev: nextRev, op })
    return json({ rev: nextRev, stale: body.baseRev !== rev } satisfies OpResponse)
  }

  private async readCalendarToken(): Promise<Response> {
    const token = (await this.ctx.storage.get<string>('calToken')) ?? null
    return json({ token } satisfies CalendarFeedResponse)
  }

  /** Create the feed token once. Later calls return the same token, so every member shares one URL. */
  private async enableCalendar(): Promise<Response> {
    let token = await this.ctx.storage.get<string>('calToken')
    if (token === undefined) {
      token = randomToken()
      await this.ctx.storage.put('calToken', token)
    }
    return json({ token } satisfies CalendarFeedResponse)
  }

  /**
   * Serve a rolling window of chore occurrences as an .ics feed. The token in
   * the query grants read-only access; it cannot be used to write ops. A
   * missing or wrong token gets 401 either way, so a bad URL reveals nothing.
   */
  private async serveCalendar(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const presented = url.searchParams.get(CALENDAR_TOKEN_PARAM)
    const stored = await this.ctx.storage.get<string>('calToken')
    if (presented === null || stored === undefined || !(await tokensMatch(presented, stored))) {
      return json({ error: 'AUTH_BAD_FEED_TOKEN' }, 401)
    }
    const { state } = await this.load()

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
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Compare digests so the comparison is constant-time even when the lengths differ.
async function tokensMatch(presented: string, stored: string): Promise<boolean> {
  const encode = (text: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  const [a, b] = await Promise.all([encode(presented), encode(stored)])
  return crypto.subtle.timingSafeEqual(a, b)
}

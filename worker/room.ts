import { DurableObject } from 'cloudflare:workers'
import type { AppState } from '../src/types'
import { applyOp, type Op } from '../src/ops'
import { seedState } from '../src/seed'
import { buildCalendar, buildTasks, calendarName } from '../src/ics'
import type {
  ClientMessage,
  OpRequest,
  OpResponse,
  ServerMessage,
  Snapshot,
} from '../src/sync/protocol'
import type { Env } from './env'
import { json } from './http'

/** Set by the Worker on forwarded requests: the signed-in member. */
export const MEMBER_EMAIL_HEADER = 'X-Roster-Member'

/** How many weeks of occurrences the subscribable feed materialises ahead. */
const FEED_WEEKS = 13

/**
 * One household's shared roster, named by the household id. The DO
 * serializes all writes, so ops apply one at a time to the authoritative
 * state and `rev` increases by exactly 1 per op.
 *
 * Only the Worker reaches this object. It forwards a request only after it
 * found the signed-in member's household, or a valid calendar feed token.
 *
 * Storage keys: `state` (AppState JSON), `rev` (number). Rooms made before
 * sign-in also hold unused `keyHash`, `fails` and `calTokenHash` keys.
 */
export class RosterRoom extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const route = `${request.method} ${url.pathname}`

    if (route === 'GET /state') return this.snapshot()
    if (route === 'POST /op') return this.op(request)
    if (route === 'GET /ws') return this.upgrade(request)
    if (route === 'POST /disconnect') return this.disconnect(request)
    if (route === 'GET /calendar.ics') return this.serveCalendar(request)
    return json({ error: 'NOT_FOUND_ROUTE' }, 404)
  }

  /** Push channel, through the Hibernation API so an idle room costs nothing. */
  private upgrade(request: Request): Response {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return json({ error: 'VALIDATION_EXPECTED_WEBSOCKET' }, 426)
    }
    const pair = new WebSocketPair()
    // Tagged with the member, so their sockets close when they leave the household.
    const email = request.headers.get(MEMBER_EMAIL_HEADER)
    this.ctx.acceptWebSocket(pair[1], email ? [email] : [])
    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  /** A member left this household: stop pushing its roster to their open devices. */
  private disconnect(request: Request): Response {
    const email = request.headers.get(MEMBER_EMAIL_HEADER)
    if (email) {
      for (const ws of this.ctx.getWebSockets(email)) ws.close(4001, 'left household')
    }
    this.broadcastPresence()
    return json({ ok: true })
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

  /** Serve a rolling window of chore occurrences as an .ics feed. The Worker checked the feed token. */
  private async serveCalendar(request: Request): Promise<Response> {
    const url = new URL(request.url)
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

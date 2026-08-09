import { DurableObject } from 'cloudflare:workers'
import type { AppState } from '../src/types'
import { applyOp, type Op } from '../src/ops'
import { migrate } from '../src/migrate'
import type { InitRequest, OpRequest, OpResponse, Snapshot } from '../src/sync/protocol'
import { ROSTER_KEY_HEADER } from '../src/sync/protocol'
import type { Env } from './env'

/** Auth failures allowed before every further attempt is delayed. */
const FAIL_LIMIT = 5
const FAIL_DELAY_MS = 1000

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
    return json({ error: 'not found' }, 404)
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
    return json({ rev: nextRev, stale: body.baseRev !== rev } satisfies OpResponse, 200)
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

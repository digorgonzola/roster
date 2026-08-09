import type { AppState } from '../types'
import type { Op } from '../ops'
import {
  ROSTER_KEY_HEADER,
  type CreateRoomResponse,
  type InitRequest,
  type OpRequest,
  type OpResponse,
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
 */

const SHARE_KEY = 'roster.share.v1'

export interface ShareConfig {
  roomId: string
  key: string
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

export class SyncClient {
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
    return new SyncClient(config)
  }

  /** Join an existing room from a share link and persist the credential. */
  static async join(config: ShareConfig): Promise<{ client: SyncClient; snapshot: Snapshot }> {
    const client = new SyncClient(config)
    const snapshot = await client.fetchSnapshot()
    saveShareConfig(config)
    return { client, snapshot }
  }

  async fetchSnapshot(): Promise<Snapshot> {
    const res = await expectOk(
      await fetch(`/api/rooms/${this.config.roomId}/state`, {
        headers: { [ROSTER_KEY_HEADER]: this.config.key },
      }),
    )
    return (await res.json()) as Snapshot
  }

  async send(op: Op, baseRev: number): Promise<OpResponse> {
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

import type { AppState } from '../types'
import type { Op } from '../ops'

/**
 * HTTP protocol between the app and a RosterRoom Durable Object.
 *
 * The room key travels only in the `X-Roster-Key` header (never in a URL),
 * and the server stores only its SHA-256 hash.
 */

/** POST /api/rooms */
export interface CreateRoomResponse {
  roomId: string
}

/** POST /api/rooms/:roomId/init */
export interface InitRequest {
  /** Hex SHA-256 of the room key. The server never sees the key itself here. */
  keyHash: string
  state: AppState
}

/** GET /api/rooms/:roomId/state */
export interface Snapshot {
  rev: number
  state: AppState
}

/** POST /api/rooms/:roomId/op */
export interface OpRequest {
  /** The revision the client applied the op on. Advisory: see `stale`. */
  baseRev: number
  op: Op
}

export interface OpResponse {
  /** Revision after this op applied. */
  rev: number
  /**
   * True when baseRev was behind, so the client missed at least one op and
   * must refetch the snapshot to converge.
   */
  stale: boolean
}

export const ROSTER_KEY_HEADER = 'X-Roster-Key'

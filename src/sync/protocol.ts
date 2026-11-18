import type { AppState } from '../types'
import type { Op } from '../ops'

/**
 * HTTP protocol between the app and the household's RosterRoom Durable Object.
 *
 * Cloudflare Access signs every request in; the Worker checks the identity and
 * forwards it to the one room this deployment serves. There is no room id or
 * key in the client.
 */

/** GET /api/me */
export interface Me {
  email: string
  /** Every household address, sorted. */
  household: string[]
}

/** GET /api/state */
export interface Snapshot {
  rev: number
  state: AppState
}

/** POST /api/op */
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

/**
 * GET /api/calendar reads the feed token, POST /api/calendar creates it once.
 * The token grants read-only access to GET /api/calendar.ics, which calendar
 * apps fetch without signing in. Null until a member enables the feed.
 */
export interface CalendarFeedResponse {
  token: string | null
}

/** Query parameter carrying the feed token on GET /calendar.ics. */
export const CALENDAR_TOKEN_PARAM = 'token'

// ---- WebSocket push channel (GET /api/ws) ----------------------------------
//
// The socket is receive-only for roster data: clients still send ops over
// HTTP POST /api/op. The Worker authenticates the upgrade request, so the first
// client message only asks the room for its current rev.

/** Client to server. */
export type ClientMessage = { t: 'hello' }

/** Server to client. */
export type ServerMessage =
  /** Reply to hello. The client refetches the snapshot when rev is ahead. */
  | { t: 'ok'; rev: number }
  /** An op applied to the room (any client, including the receiver). */
  | { t: 'op'; rev: number; op: Op }
  /** How many devices hold an open socket, sent on every join/leave. */
  | { t: 'presence'; devices: number }

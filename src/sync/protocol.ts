import type { AppState } from '../types'
import type { Op } from '../ops'

/**
 * HTTP protocol between the app and the Worker.
 *
 * Cloudflare Access signs every request in. The Worker finds the person's
 * household (each person is in exactly one) and forwards roster requests to
 * that household's RosterRoom Durable Object. The client never names a
 * household in a URL.
 */

export interface HouseholdInvite {
  id: string
  email: string
  invitedBy: string
  createdAt: string
}

export interface Household {
  id: string
  name: string
  /** Member emails, sorted. */
  members: string[]
  /** Pending invites from this household. */
  invites: HouseholdInvite[]
}

/** A pending invite for the signed-in person into another household. */
export interface InviteForMe {
  id: string
  householdName: string
  invitedBy: string
}

/**
 * GET /api/me, and the response of every household change:
 * PATCH /api/household { name }, POST /api/household/invites { email },
 * DELETE /api/household/invites/:id, POST /api/household/invites/:id/accept,
 * POST /api/household/leave.
 */
export interface Me {
  email: string
  household: Household
  invitesForMe: InviteForMe[]
}

export const HOUSEHOLD_NAME_MAX = 60

export interface HouseholdPatch {
  /** 1 to HOUSEHOLD_NAME_MAX characters after trimming. */
  name: string
}

export interface InviteRequest {
  email: string
}

/**
 * Sent on POST /api/op with the household id the client's pending ops belong
 * to. When the person has moved household since, the Worker answers 409
 * `CONFLICT_HOUSEHOLD_CHANGED` so old ops never reach the new household.
 */
export const HOUSEHOLD_HEADER = 'X-Roster-Household'
export const HOUSEHOLD_CHANGED = 'CONFLICT_HOUSEHOLD_CHANGED'

/** Error responses carry a stable code (AUTH_*, VALIDATION_*, NOT_FOUND_*, CONFLICT_*, INTERNAL_*). */
export interface ErrorResponse {
  error: string
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
 * GET /api/calendar reads the household's feed token, POST /api/calendar
 * creates it once. The token grants read-only access to GET
 * /api/calendar.ics, which calendar apps fetch without signing in. Null until
 * a member enables the feed.
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

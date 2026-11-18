import { CALENDAR_TOKEN_PARAM, HOUSEHOLD_HEADER } from '../src/sync/protocol'
import { authenticate } from './auth'
import { getConfig } from './config'
import { findHouseholdByCalendarToken } from './db'
import type { Env } from './env'
import { AppError, HouseholdChangedError, NotFoundError } from './errors'
import { withHousehold } from './households'
import { assertJsonBody, assertSameOrigin, json } from './http'
import { MEMBER_EMAIL_HEADER } from './room'
import { getCalendar, postCalendar } from './routes/calendar'
import {
  cancelInvite,
  getMe,
  patchHousehold,
  postAccept,
  postInvite,
  postLeave,
  type HouseholdContext,
} from './routes/household'

export { RosterRoom } from './room'

type Handler = (ctx: HouseholdContext) => Promise<Response>

const HOUSEHOLD_ROUTES: Record<string, Handler> = {
  'GET /api/me': getMe,
  'PATCH /api/household': patchHousehold,
  'POST /api/household/invites': postInvite,
  'DELETE /api/household/invites/:id': cancelInvite,
  'POST /api/household/invites/:id/accept': postAccept,
  'POST /api/household/leave': postLeave,
  'GET /api/calendar': getCalendar,
  'POST /api/calendar': postCalendar,
}

/** Roster routes forwarded to the household's RosterRoom, by path inside the room. */
const ROOM_ROUTES: Record<string, string> = {
  'GET /api/state': '/state',
  'POST /api/op': '/op',
  'GET /api/ws': '/ws',
}

const INVITE_PATH = /^\/api\/household\/invites\/([0-9a-f-]{36})(\/accept)?$/

/**
 * Routes:
 *   GET /api/calendar.ics   read-only feed; the token in the query is the credential
 *   household and calendar  HOUSEHOLD_ROUTES, for the signed-in person's household
 *   roster                  ROOM_ROUTES, forwarded to that household's RosterRoom
 * Everything else under /api is 404; other paths fall through to static assets (SPA fallback).
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    try {
      return await handleApi(request, url, env)
    } catch (err) {
      return errorResponse(err)
    }
  },
} satisfies ExportedHandler<Env>

function room(env: Env, householdId: string): DurableObjectStub {
  return env.ROOMS.get(env.ROOMS.idFromName(householdId))
}

async function handleApi(request: Request, url: URL, env: Env): Promise<Response> {
  const config = getConfig(env)

  // Calendar apps cannot sign in through Access, so this path has an Access bypass policy.
  if (url.pathname === '/api/calendar.ics' && request.method === 'GET') return serveFeed(url, env)

  const identity = await authenticate(request, config)
  assertSameOrigin(request)
  assertJsonBody(request)
  const member = await withHousehold(env.DB, config, identity)

  const invite = url.pathname.match(INVITE_PATH)
  const routeKey = `${request.method} ${invite ? `/api/household/invites/:id${invite[2] ?? ''}` : url.pathname}`

  const handler = HOUSEHOLD_ROUTES[routeKey]
  if (handler) {
    return handler({
      request,
      db: env.DB,
      member,
      inviteId: invite?.[1],
      disconnect: (householdId, email) => disconnect(env, householdId, email),
    })
  }

  const roomPath = ROOM_ROUTES[routeKey]
  if (!roomPath) throw new NotFoundError('route')
  const sentHousehold = request.headers.get(HOUSEHOLD_HEADER)
  if (sentHousehold !== null && sentHousehold !== member.householdId) throw new HouseholdChangedError(sentHousehold)

  const forwarded = new Request(`https://room${roomPath}`, request)
  forwarded.headers.set(MEMBER_EMAIL_HEADER, member.email)
  return room(env, member.householdId).fetch(forwarded)
}

async function serveFeed(url: URL, env: Env): Promise<Response> {
  const token = url.searchParams.get(CALENDAR_TOKEN_PARAM)
  const householdId = token ? await findHouseholdByCalendarToken(env.DB, token) : null
  // A missing or wrong token gets the same 401, so a bad URL reveals nothing.
  if (householdId === null) return json({ error: 'AUTH_BAD_FEED_TOKEN' }, 401)
  const feedUrl = new URL('https://room/calendar.ics')
  for (const key of ['person', 'kind']) {
    const value = url.searchParams.get(key)
    if (value !== null) feedUrl.searchParams.set(key, value)
  }
  return room(env, householdId).fetch(feedUrl)
}

async function disconnect(env: Env, householdId: string, email: string): Promise<void> {
  await room(env, householdId).fetch('https://room/disconnect', {
    method: 'POST',
    headers: { [MEMBER_EMAIL_HEADER]: email },
  })
}

function errorResponse(err: unknown): Response {
  if (err instanceof AppError) return json({ error: err.code }, err.status)
  console.error(err)
  return json({ error: 'INTERNAL_ERROR' }, 500)
}

import type { Me } from '../src/sync/protocol'
import { authenticate } from './auth'
import { getConfig } from './config'
import type { Env } from './env'
import { AuthError, CrossSiteRequestError, UnsupportedMediaTypeError } from './errors'
import { assertJsonBody, assertSameOrigin, json } from './http'

export { RosterRoom } from './room'

/**
 * Routes:
 *   GET /api/calendar.ics   read-only feed; the token in the query is the credential
 *   GET /api/me             the signed-in household member
 *   *   /api/...            authenticated, then forwarded to the household's room
 * Everything else falls through to static assets (SPA fallback).
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

async function handleApi(request: Request, url: URL, env: Env): Promise<Response> {
  const config = getConfig(env)
  const room = env.ROOMS.get(env.ROOMS.idFromName(config.householdRoomId))

  // Calendar apps cannot sign in through Access, so this path has an Access bypass policy.
  if (url.pathname === '/api/calendar.ics' && request.method === 'GET') return room.fetch(request)

  const identity = await authenticate(request, config)
  assertSameOrigin(request)
  assertJsonBody(request)

  if (url.pathname === '/api/me' && request.method === 'GET') {
    return json({ email: identity.email, household: [...config.householdEmails].sort() } satisfies Me)
  }
  return room.fetch(request)
}

function errorResponse(err: unknown): Response {
  if (err instanceof AuthError || err instanceof CrossSiteRequestError || err instanceof UnsupportedMediaTypeError) {
    return json({ error: err.code }, err.status)
  }
  console.error(err)
  return json({ error: 'INTERNAL_ERROR' }, 500)
}

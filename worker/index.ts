import type { CreateRoomResponse } from '../src/sync/protocol'
import type { Env } from './env'

export { RosterRoom } from './room'

/**
 * Routes:
 *   POST /api/rooms                  mint a room id (the DO initializes lazily)
 *   *    /api/rooms/:roomId/...      forward to that room's Durable Object
 * Everything else falls through to static assets (SPA fallback).
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      const body: CreateRoomResponse = { roomId: crypto.randomUUID() }
      return new Response(JSON.stringify(body), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    }

    const match = url.pathname.match(/^\/api\/rooms\/([0-9a-f-]{36})(\/.*)?$/)
    if (match) {
      const room = env.ROOMS.get(env.ROOMS.idFromName(match[1]))
      return room.fetch(request)
    }

    if (url.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      })
    }

    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>

import { CrossSiteRequestError, UnsupportedMediaTypeError } from './errors'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Rejects state-changing requests and socket upgrades that a browser sent from
 * another site (CSRF and cross-site WebSocket hijacking). The Access cookie
 * rides along on cross-site form posts and socket handshakes, so a cookie alone
 * does not prove the app made the request. Sec-Fetch-Site is set by every
 * current browser; Origin is the fallback for older ones. A request with
 * neither comes from a non-browser client, which cannot borrow a member's cookie.
 * @throws CrossSiteRequestError (403)
 */
export function assertSameOrigin(request: Request): void {
  const isUpgrade = request.headers.get('upgrade')?.toLowerCase() === 'websocket'
  if (SAFE_METHODS.has(request.method) && !isUpgrade) return

  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite !== null) {
    if (fetchSite !== 'same-origin') throw new CrossSiteRequestError(fetchSite)
    return
  }

  const origin = request.headers.get('origin')
  if (origin !== null && origin !== new URL(request.url).origin) throw new CrossSiteRequestError(origin)
}

/**
 * Requiring application/json forces a CORS preflight for cross-site callers,
 * a second guard after assertSameOrigin.
 * @throws UnsupportedMediaTypeError (415)
 */
export function assertJsonBody(request: Request): void {
  if (SAFE_METHODS.has(request.method)) return
  const contentType = request.headers.get('content-type') ?? ''
  if (contentType.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new UnsupportedMediaTypeError(contentType)
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

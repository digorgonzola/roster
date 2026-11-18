import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from 'jose'
import type { Config } from './config'
import { AuthError, ConfigError } from './errors'

export interface Identity {
  email: string
}

// One key set per team domain per isolate, so jose's JWKS cache and cooldown survive across requests.
const keySets = new Map<string, JWTVerifyGetKey>()

function accessKeys(teamDomain: string): JWTVerifyGetKey {
  let keys = keySets.get(teamDomain)
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`))
    keySets.set(teamDomain, keys)
  }
  return keys
}

/**
 * Identifies the household member behind a request from the Cloudflare Access JWT.
 * `getKey` replaces the remote Access key set in tests.
 * @throws AuthError 401 for a missing or invalid token, 403 for a valid token outside the household.
 */
export async function authenticate(request: Request, config: Config, getKey?: JWTVerifyGetKey): Promise<Identity> {
  if (config.devIdentityEmail) return { email: config.devIdentityEmail }
  if (!config.access) throw new ConfigError('Access settings are required without DEV_IDENTITY_EMAIL')

  const token = request.headers.get('Cf-Access-Jwt-Assertion')
  if (!token) throw new AuthError(401)

  const { teamDomain, aud } = config.access
  const { payload } = await jwtVerify(token, getKey ?? accessKeys(teamDomain), {
    issuer: teamDomain,
    audience: aud,
    algorithms: ['RS256'],
  }).catch((err: unknown) => {
    throw isTokenFault(err) ? new AuthError(401) : err
  })

  const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null
  if (!email || !config.householdEmails.has(email)) throw new AuthError(403)
  return { email }
}

// An unreachable or broken key endpoint is our outage (500), not the caller's bad token.
function isTokenFault(err: unknown): boolean {
  return err instanceof errors.JOSEError && !(err instanceof errors.JWKSTimeout || err instanceof errors.JWKSInvalid)
}

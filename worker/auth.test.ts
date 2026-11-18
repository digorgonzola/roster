import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTVerifyGetKey } from 'jose'
import { beforeAll, describe, expect, it } from 'vitest'
import { authenticate } from './auth'
import { parseConfig, type Config } from './config'
import type { Env } from './env'
import { AuthError } from './errors'

const TEAM_DOMAIN = 'https://household.cloudflareaccess.com'
const AUD = 'a'.repeat(64)

const config: Config = parseConfig({
  ENVIRONMENT: 'production',
  ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
  ACCESS_AUD: AUD,
} as unknown as Env)

let privateKey: CryptoKey
let getKey: JWTVerifyGetKey

beforeAll(async () => {
  const pair = await generateKeyPair('RS256')
  privateKey = pair.privateKey
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'test', alg: 'RS256' }
  getKey = createLocalJWKSet({ keys: [jwk] })
})

function sign(claims: Record<string, unknown>, { audience = AUD, expiresIn = '5m' } = {}): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer(TEAM_DOMAIN)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(privateKey)
}

function request(token?: string): Request {
  return new Request('https://roster.example.com/api/me', {
    headers: token ? { 'Cf-Access-Jwt-Assertion': token } : {},
  })
}

async function authStatus(run: Promise<unknown>): Promise<number> {
  const err = await run.then(
    () => null,
    (caught: unknown) => caught,
  )
  if (!(err instanceof AuthError)) throw new Error(`expected AuthError, got ${String(err)}`)
  return err.status
}

describe('authenticate', () => {
  it('accepts a valid Access token and lowercases the email', async () => {
    const token = await sign({ email: 'One@Example.com' })
    expect(await authenticate(request(token), config, getKey)).toEqual({ email: 'one@example.com' })
  })

  it('rejects a missing header with 401', async () => {
    expect(await authStatus(authenticate(request(), config, getKey))).toBe(401)
  })

  it('rejects a token for another Access application with 401', async () => {
    const token = await sign({ email: 'one@example.com' }, { audience: 'b'.repeat(64) })
    expect(await authStatus(authenticate(request(token), config, getKey))).toBe(401)
  })

  it('rejects an expired token with 401', async () => {
    const token = await sign({ email: 'one@example.com' }, { expiresIn: '10 minutes ago' })
    expect(await authStatus(authenticate(request(token), config, getKey))).toBe(401)
  })

  it('rejects a garbage token with 401', async () => {
    expect(await authStatus(authenticate(request('not.a.jwt'), config, getKey))).toBe(401)
  })

  it('accepts any email the Access policy let in', async () => {
    const token = await sign({ email: 'stranger@example.com' })
    expect(await authenticate(request(token), config, getKey)).toEqual({ email: 'stranger@example.com' })
  })

  it('rejects a valid token without an email with 403', async () => {
    const token = await sign({ common_name: 'service-token' })
    expect(await authStatus(authenticate(request(token), config, getKey))).toBe(403)
  })

  it('uses the dev identity without a token in development', async () => {
    const devConfig = parseConfig({
      ENVIRONMENT: 'development',
      DEV_IDENTITY_EMAIL: 'one@example.com',
    } as unknown as Env)
    expect(await authenticate(request(), devConfig)).toEqual({ email: 'one@example.com' })
  })
})

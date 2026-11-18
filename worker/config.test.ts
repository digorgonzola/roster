import { describe, expect, it } from 'vitest'
import { parseConfig } from './config'
import type { Env } from './env'
import { ConfigError } from './errors'

const VALID = {
  ENVIRONMENT: 'production',
  ACCESS_TEAM_DOMAIN: 'https://household.cloudflareaccess.com',
  ACCESS_AUD: 'a'.repeat(64),
  HOUSEHOLD_EMAILS: ' One@Example.com , two@example.com',
  HOUSEHOLD_ROOM_ID: '00000000-0000-4000-8000-000000000000',
}

const parse = (overrides: Record<string, string | undefined>) => () =>
  parseConfig({ ...VALID, ...overrides } as unknown as Env)

describe('parseConfig', () => {
  it('parses a production config and normalises emails', () => {
    const config = parse({})()
    expect(config.householdEmails).toEqual(new Set(['one@example.com', 'two@example.com']))
    expect(config.access).toEqual({ teamDomain: VALID.ACCESS_TEAM_DOMAIN, aud: VALID.ACCESS_AUD })
    expect(config.devIdentityEmail).toBeNull()
  })

  it.each([
    ['an unknown environment', { ENVIRONMENT: 'staging' }],
    ['a missing room id', { HOUSEHOLD_ROOM_ID: undefined }],
    ['a room id that is not a UUID', { HOUSEHOLD_ROOM_ID: 'household' }],
    ['missing household emails', { HOUSEHOLD_EMAILS: '' }],
    ['a bad household email', { HOUSEHOLD_EMAILS: 'one@example.com,nope' }],
    ['a missing AUD', { ACCESS_AUD: undefined }],
    ['a bad team domain', { ACCESS_TEAM_DOMAIN: 'https://example.com' }],
    ['a dev identity outside development', { DEV_IDENTITY_EMAIL: 'one@example.com' }],
  ])('rejects %s', (_, overrides) => {
    expect(parse(overrides)).toThrow(ConfigError)
  })

  it('rejects a dev identity outside the household', () => {
    expect(parse({ ENVIRONMENT: 'development', DEV_IDENTITY_EMAIL: 'stranger@example.com' })).toThrow(ConfigError)
  })

  it('skips Access settings when a dev identity is set in development', () => {
    const config = parse({
      ENVIRONMENT: 'development',
      DEV_IDENTITY_EMAIL: 'two@example.com',
      ACCESS_AUD: undefined,
      ACCESS_TEAM_DOMAIN: undefined,
    })()
    expect(config.access).toBeNull()
    expect(config.devIdentityEmail).toBe('two@example.com')
  })
})

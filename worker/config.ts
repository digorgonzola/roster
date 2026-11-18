import type { Env } from './env'
import { ConfigError } from './errors'

const ENVIRONMENTS = ['development', 'preview', 'production'] as const
const TEAM_DOMAIN_PATTERN = /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/
const AUD_PATTERN = /^[a-f0-9]{64}$/
export const EMAIL_PATTERN = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/

export interface AccessConfig {
  teamDomain: string
  aud: string
}

export interface Config {
  environment: (typeof ENVIRONMENTS)[number]
  /** Null only when local development uses devIdentityEmail instead of Access. */
  access: AccessConfig | null
  /** People who join the default household at first sign-in instead of getting a new one. */
  defaultHouseholdEmails: ReadonlySet<string>
  devIdentityEmail: string | null
}

// Env is the same object for every request to an isolate, so parse it once.
const cache = new WeakMap<Env, Config>()

/** The only reader of Worker env vars. @throws ConfigError on missing or invalid configuration. */
export function getConfig(env: Env): Config {
  let config = cache.get(env)
  if (!config) {
    config = parseConfig(env)
    cache.set(env, config)
  }
  return config
}

export function parseConfig(env: Env): Config {
  const environment = ENVIRONMENTS.find((e) => e === env.ENVIRONMENT)
  if (!environment) throw new ConfigError(`ENVIRONMENT must be one of ${ENVIRONMENTS.join(', ')}`)

  const devIdentityEmail = env.DEV_IDENTITY_EMAIL ? parseEmail(env.DEV_IDENTITY_EMAIL, 'DEV_IDENTITY_EMAIL') : null
  if (devIdentityEmail && environment !== 'development') {
    throw new ConfigError('DEV_IDENTITY_EMAIL is only allowed when ENVIRONMENT=development')
  }

  const defaultHouseholdEmails = new Set(
    (env.HOUSEHOLD_EMAILS ?? '')
      .split(',')
      .filter((entry) => entry.trim() !== '')
      .map((entry) => parseEmail(entry, 'HOUSEHOLD_EMAILS')),
  )

  return Object.freeze({
    environment,
    access: devIdentityEmail ? null : parseAccess(env),
    defaultHouseholdEmails,
    devIdentityEmail,
  })
}

function parseAccess(env: Env): AccessConfig {
  const teamDomain = required(env.ACCESS_TEAM_DOMAIN, 'ACCESS_TEAM_DOMAIN')
  const aud = required(env.ACCESS_AUD, 'ACCESS_AUD')
  if (!TEAM_DOMAIN_PATTERN.test(teamDomain)) {
    throw new ConfigError('ACCESS_TEAM_DOMAIN must look like https://<team>.cloudflareaccess.com')
  }
  if (!AUD_PATTERN.test(aud)) throw new ConfigError('ACCESS_AUD must be the 64-character Access application AUD tag')
  return { teamDomain, aud }
}

function required(value: string | undefined, name: string): string {
  const trimmed = value?.trim()
  if (!trimmed) throw new ConfigError(`${name} is required`)
  return trimmed
}

function parseEmail(value: string, name: string): string {
  const email = value.trim().toLowerCase()
  if (!EMAIL_PATTERN.test(email)) throw new ConfigError(`${name} has an invalid email address`)
  return email
}

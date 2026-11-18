export interface Env {
  ROOMS: DurableObjectNamespace
  ASSETS: Fetcher
  DB: D1Database
  ENVIRONMENT?: string
  ACCESS_TEAM_DOMAIN?: string
  ACCESS_AUD?: string
  /**
   * Optional, comma-separated: people who join the default household at first sign-in. A secret
   * (`wrangler secret put`) so addresses stay out of the repo.
   */
  HOUSEHOLD_EMAILS?: string
  /** Local development only (.dev.vars): skips Access and acts as this household member. */
  DEV_IDENTITY_EMAIL?: string
}

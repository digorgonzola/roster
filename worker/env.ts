export interface Env {
  ROOMS: DurableObjectNamespace
  ASSETS: Fetcher
  ENVIRONMENT?: string
  ACCESS_TEAM_DOMAIN?: string
  ACCESS_AUD?: string
  /** The one roster this deployment serves (the RosterRoom name). */
  HOUSEHOLD_ROOM_ID?: string
  /** Comma-separated; set with `wrangler secret put` so household addresses stay out of the repo. */
  HOUSEHOLD_EMAILS?: string
  /** Local development only (.dev.vars): skips Access and acts as this household member. */
  DEV_IDENTITY_EMAIL?: string
}

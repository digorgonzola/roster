import type { Identity } from './auth'
import type { Config } from './config'
import { addHouseholdOfOne, findMembershipHousehold, joinHousehold, type NewHousehold } from './db'

/** The roster shared before households existed (migrations/0001_households.sql inserts it). */
export const DEFAULT_HOUSEHOLD_ID = '10fef99a-d5dc-465f-9c6b-6e149637dd17'

export interface Member extends Identity {
  householdId: string
}

/** A new household of one for `email`, named after the part before the @. */
export function newHouseholdFor(email: string): NewHousehold {
  return { id: crypto.randomUUID(), name: `${email.split('@')[0]}'s household` }
}

/**
 * Adds the person's household from their membership. At first sign-in a person in HOUSEHOLD_EMAILS
 * joins the default household; anyone else gets a new household of one. A pending invite does not
 * move them: the app asks first.
 */
export async function withHousehold(db: D1Database, config: Config, identity: Identity): Promise<Member> {
  let householdId = await findMembershipHousehold(db, identity.email)
  if (householdId === null) {
    const now = new Date().toISOString()
    if (config.defaultHouseholdEmails.has(identity.email)) {
      await joinHousehold(db, identity.email, DEFAULT_HOUSEHOLD_ID, now)
      householdId = (await findMembershipHousehold(db, identity.email)) ?? DEFAULT_HOUSEHOLD_ID
    } else {
      householdId = await addHouseholdOfOne(db, identity.email, newHouseholdFor(identity.email), now)
    }
  }
  return { ...identity, householdId }
}

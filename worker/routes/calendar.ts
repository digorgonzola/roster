import type { CalendarFeedResponse } from '../../src/sync/protocol'
import { ensureCalendarToken, readCalendarToken } from '../db'
import { json } from '../http'
import type { HouseholdContext } from './household'

export async function getCalendar({ db, member }: HouseholdContext): Promise<Response> {
  return json({ token: await readCalendarToken(db, member.householdId) } satisfies CalendarFeedResponse)
}

/** Creates the household's feed token once; later calls return the same token. */
export async function postCalendar({ db, member }: HouseholdContext): Promise<Response> {
  return json({ token: await ensureCalendarToken(db, member.householdId, randomToken()) } satisfies CalendarFeedResponse)
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

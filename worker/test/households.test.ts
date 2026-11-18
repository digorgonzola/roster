import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import type { Op } from '../../src/ops'
import type { CalendarFeedResponse, Me, Snapshot } from '../../src/sync/protocol'
import { HOUSEHOLD_HEADER } from '../../src/sync/protocol'
import { DEFAULT_HOUSEHOLD_ID } from '../households'
import worker from '../index'

const ORIGIN = 'https://roster.test'
// In HOUSEHOLD_EMAILS (vitest.config.ts): joins the default household at first sign-in.
const YOU = 'you@example.com'
const PARTNER = 'partner@example.com'
// Not in HOUSEHOLD_EMAILS: gets a household of one at first sign-in.
const SAM = 'sam@example.net'
const JO = 'jo@example.org'

interface Result<T> {
  status: number
  body: T
}

/** Calls the API as `email`, the way DEV_IDENTITY_EMAIL switches the person in local development. */
async function as<T>(
  email: string,
  method: string,
  path: string,
  { body, headers = {} }: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<Result<T>> {
  const request = new Request(`${ORIGIN}${path}`, {
    method,
    headers: { 'sec-fetch-site': 'same-origin', ...(method === 'GET' ? {} : { 'content-type': 'application/json' }), ...headers },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  })
  const response = await worker.fetch(request, { ...env, DEV_IDENTITY_EMAIL: email })
  const text = await response.text()
  return { status: response.status, body: (text.startsWith('{') ? JSON.parse(text) : text) as T }
}

const me = async (email: string) => (await as<Me>(email, 'GET', '/api/me')).body

async function invite(from: string, email: string): Promise<string> {
  const { status, body } = await as<Me>(from, 'POST', '/api/household/invites', { body: { email } })
  expect(status).toBe(201)
  return body.household.invites.find((pending) => pending.email === email)!.id
}

const addPerson = (email: string, name: string, headers?: Record<string, string>) =>
  as<{ rev: number }>(email, 'POST', '/api/op', {
    body: { baseRev: 1, op: { t: 'addPerson', person: { id: `p-${name}`, name, color: '#123456' } } satisfies Op },
    headers,
  })

const peopleOf = async (email: string) =>
  (await as<Snapshot>(email, 'GET', '/api/state')).body.state.people.map((person) => person.name)

describe('first sign-in', () => {
  it('puts a person from HOUSEHOLD_EMAILS in the default household', async () => {
    const [you, partner] = [await me(YOU), await me(PARTNER)]
    expect(you.household.id).toBe(DEFAULT_HOUSEHOLD_ID)
    expect(partner.household).toMatchObject({ id: DEFAULT_HOUSEHOLD_ID, members: [PARTNER, YOU] })
  })

  it('gives anyone else a household of one, named after them', async () => {
    const sam = await me(SAM)
    expect(sam.household).toMatchObject({ name: "sam's household", members: [SAM], invites: [] })
    expect(sam.household.id).not.toBe(DEFAULT_HOUSEHOLD_ID)
  })

  it('does not move a person with a pending invite: the app asks first', async () => {
    await me(YOU)
    await invite(YOU, SAM)
    const sam = await me(SAM)
    expect(sam.household.id).not.toBe(DEFAULT_HOUSEHOLD_ID)
    expect(sam.invitesForMe).toEqual([{ id: expect.any(String), householdName: 'Household', invitedBy: YOU }])
  })
})

describe('roster isolation', () => {
  it('keeps each household on its own roster', async () => {
    expect((await addPerson(YOU, 'Ada')).status).toBe(200)
    expect((await addPerson(SAM, 'Bea')).status).toBe(200)
    expect(await peopleOf(PARTNER)).toContain('Ada')
    expect(await peopleOf(PARTNER)).not.toContain('Bea')
    expect(await peopleOf(SAM)).toContain('Bea')
    expect(await peopleOf(SAM)).not.toContain('Ada')
  })

  it('refuses ops sent for a household the person has left', async () => {
    const { household } = await me(SAM)
    const stale = await addPerson(YOU, 'Cy', { [HOUSEHOLD_HEADER]: household.id })
    expect(stale).toMatchObject({ status: 409, body: { error: 'CONFLICT_HOUSEHOLD_CHANGED' } })
    expect((await addPerson(YOU, 'Cy', { [HOUSEHOLD_HEADER]: DEFAULT_HOUSEHOLD_ID })).status).toBe(200)
  })

  it('does not forward unknown or old room routes', async () => {
    expect((await as(YOU, 'POST', '/api/disconnect')).status).toBe(404)
    expect((await as(YOU, 'GET', `/api/rooms/${DEFAULT_HOUSEHOLD_ID}/state`)).status).toBe(404)
  })
})

describe('invites', () => {
  it('refuses a member of this household, a second pending invite and a bad address', async () => {
    await me(PARTNER)
    await invite(YOU, SAM)
    const member = await as(YOU, 'POST', '/api/household/invites', { body: { email: 'Partner@Example.com' } })
    const again = await as(YOU, 'POST', '/api/household/invites', { body: { email: SAM } })
    const bad = await as(YOU, 'POST', '/api/household/invites', { body: { email: 'not an email' } })
    expect(member).toMatchObject({ status: 409, body: { error: 'CONFLICT_ALREADY_MEMBER' } })
    expect(again).toMatchObject({ status: 409, body: { error: 'CONFLICT_ALREADY_INVITED' } })
    expect(bad).toMatchObject({ status: 400, body: { error: 'VALIDATION_BAD_REQUEST' } })
  })

  it('lets only the invited person accept, and moves them with the roster', async () => {
    await addPerson(YOU, 'Ada')
    const inviteId = await invite(YOU, SAM)
    const stranger = await as(JO, 'POST', `/api/household/invites/${inviteId}/accept`)
    expect(stranger).toMatchObject({ status: 404, body: { error: 'NOT_FOUND_RESOURCE' } })

    const accepted = await as<Me>(SAM, 'POST', `/api/household/invites/${inviteId}/accept`)
    expect(accepted.status).toBe(200)
    expect(accepted.body.household).toMatchObject({ id: DEFAULT_HOUSEHOLD_ID, members: [SAM, YOU], invites: [] })
    expect(await peopleOf(SAM)).toContain('Ada')
    expect((await as(SAM, 'POST', `/api/household/invites/${inviteId}/accept`)).status).toBe(404)
  })

  it('lets members of the inviting household cancel; to others the invite does not exist', async () => {
    await me(PARTNER)
    const inviteId = await invite(YOU, SAM)
    expect((await as(JO, 'DELETE', `/api/household/invites/${inviteId}`)).status).toBe(404)
    const cancelled = await as<Me>(PARTNER, 'DELETE', `/api/household/invites/${inviteId}`)
    expect(cancelled.body.household.invites).toEqual([])
    expect((await me(SAM)).invitesForMe).toEqual([])
  })

  it('drops the pending invites of a household its last member left', async () => {
    const joInvite = await invite(SAM, JO)
    const samInvite = await invite(YOU, SAM)
    await as(SAM, 'POST', `/api/household/invites/${samInvite}/accept`)
    expect((await me(JO)).invitesForMe).toEqual([])
    expect((await as(JO, 'POST', `/api/household/invites/${joInvite}/accept`)).status).toBe(404)
  })
})

describe('household settings', () => {
  it('renames the household for every member', async () => {
    const renamed = await as<Me>(YOU, 'PATCH', '/api/household', { body: { name: '  The Hattrells ' } })
    expect(renamed.body.household.name).toBe('The Hattrells')
    expect((await me(PARTNER)).household.name).toBe('The Hattrells')
    expect((await as(YOU, 'PATCH', '/api/household', { body: { name: '' } })).status).toBe(400)
  })

  it('refuses to let the only member leave', async () => {
    expect(await as(SAM, 'POST', '/api/household/leave')).toMatchObject({ status: 409, body: { error: 'CONFLICT_ONLY_MEMBER' } })
  })

  it('moves a leaving member to a new household of one; the roster stays behind', async () => {
    await me(PARTNER)
    await addPerson(YOU, 'Ada')
    const left = await as<Me>(PARTNER, 'POST', '/api/household/leave')
    expect(left.body.household).toMatchObject({ name: "partner's household", members: [PARTNER] })
    expect(await peopleOf(PARTNER)).not.toContain('Ada')
    expect((await me(YOU)).household.members).toEqual([YOU])
  })
})

describe('calendar feed', () => {
  it('gives each household one token and serves only that household', async () => {
    expect((await as<CalendarFeedResponse>(YOU, 'GET', '/api/calendar')).body.token).toBeNull()
    const { token } = (await as<CalendarFeedResponse>(YOU, 'POST', '/api/calendar')).body
    expect((await as<CalendarFeedResponse>(PARTNER, 'POST', '/api/calendar')).body.token).toBe(token)

    const feed = await worker.fetch(new Request(`${ORIGIN}/api/calendar.ics?token=${token}`), env)
    expect(feed.status).toBe(200)
    expect(await feed.text()).toContain('BEGIN:VCALENDAR')

    const wrong = await worker.fetch(new Request(`${ORIGIN}/api/calendar.ics?token=nope`), env)
    expect(wrong.status).toBe(401)
    const missing = await worker.fetch(new Request(`${ORIGIN}/api/calendar.ics`), env)
    expect(missing.status).toBe(401)
  })
})

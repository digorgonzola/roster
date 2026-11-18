import { HOUSEHOLD_NAME_MAX, type HouseholdPatch, type InviteRequest, type Me } from '../../src/sync/protocol'
import { EMAIL_PATTERN } from '../config'
import {
  acceptInvite,
  deleteInvite,
  findMembershipHousehold,
  findPendingInvite,
  insertInvite,
  leaveHousehold,
  listInvitesFor,
  readHousehold,
  renameHousehold,
  countMembers,
} from '../db'
import { AlreadyInvitedError, AlreadyMemberError, NotFoundError, OnlyMemberError, ValidationError } from '../errors'
import { newHouseholdFor, type Member } from '../households'
import { json } from '../http'

const DUPLICATE_INVITE = /UNIQUE constraint failed: household_invites\./

export interface HouseholdContext {
  request: Request
  db: D1Database
  member: Member
  /** Path parameter, for the invite routes. */
  inviteId?: string
  /** Closes the person's sockets in a household they just left. */
  disconnect: (householdId: string, email: string) => Promise<void>
}

async function readMe(db: D1Database, email: string, householdId: string): Promise<Me> {
  const [household, invitesForMe] = await Promise.all([readHousehold(db, householdId), listInvitesFor(db, email)])
  return { email, household, invitesForMe }
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const body = (await request.json().catch(() => null)) as unknown
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('body')
  return body as Record<string, unknown>
}

function parseName(body: Record<string, unknown>): HouseholdPatch {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (name.length < 1 || name.length > HOUSEHOLD_NAME_MAX) throw new ValidationError('name')
  return { name }
}

function parseInvite(body: Record<string, unknown>): InviteRequest {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!EMAIL_PATTERN.test(email) || email.length > 254) throw new ValidationError('email')
  return { email }
}

export async function getMe({ db, member }: HouseholdContext): Promise<Response> {
  return json(await readMe(db, member.email, member.householdId))
}

export async function patchHousehold({ request, db, member }: HouseholdContext): Promise<Response> {
  const { name } = parseName(await readBody(request))
  await renameHousehold(db, member.householdId, name)
  return json(await readMe(db, member.email, member.householdId))
}

export async function postInvite({ request, db, member }: HouseholdContext): Promise<Response> {
  const { email } = parseInvite(await readBody(request))
  if ((await findMembershipHousehold(db, email)) === member.householdId) throw new AlreadyMemberError(email)
  try {
    await insertInvite(db, member.householdId, { id: crypto.randomUUID(), email, invitedBy: member.email }, new Date().toISOString())
  } catch (err) {
    if (err instanceof Error && DUPLICATE_INVITE.test(err.message)) throw new AlreadyInvitedError(email)
    throw err
  }
  return json(await readMe(db, member.email, member.householdId), 201)
}

/** Any member of the inviting household can cancel; to anyone else the invite does not exist. */
export async function cancelInvite({ db, member, inviteId }: HouseholdContext): Promise<Response> {
  const invite = inviteId ? await findPendingInvite(db, inviteId) : null
  if (!invite || invite.householdId !== member.householdId) throw new NotFoundError('invite')
  await deleteInvite(db, member.householdId, invite.id)
  return json(await readMe(db, member.email, member.householdId))
}

/**
 * Only the invited person can accept; to anyone else the invite does not exist (404, never 403).
 * The old household keeps its roster, even when this was its last member; its pending invites are
 * then deleted, so nobody can join it and see the roster.
 */
export async function postAccept({ db, member, inviteId, disconnect }: HouseholdContext): Promise<Response> {
  const invite = inviteId ? await findPendingInvite(db, inviteId) : null
  if (!invite || invite.email !== member.email) throw new NotFoundError('invite')
  if (!(await acceptInvite(db, invite, member.householdId, new Date().toISOString()))) throw new NotFoundError('invite')
  await disconnect(member.householdId, member.email)
  return json(await readMe(db, member.email, invite.householdId))
}

/** The person moves to a new household of one; the roster stays with the members left behind. */
export async function postLeave({ db, member, disconnect }: HouseholdContext): Promise<Response> {
  if ((await countMembers(db, member.householdId)) <= 1) throw new OnlyMemberError(member.householdId)
  const household = newHouseholdFor(member.email)
  await leaveHousehold(db, member.email, member.householdId, household, new Date().toISOString())
  await disconnect(member.householdId, member.email)
  const householdId = (await findMembershipHousehold(db, member.email)) ?? household.id
  return json(await readMe(db, member.email, householdId))
}

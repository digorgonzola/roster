import type { Household, HouseholdInvite, InviteForMe } from '../src/sync/protocol'

export interface NewHousehold {
  id: string
  name: string
}

export interface PendingInvite {
  id: string
  householdId: string
  email: string
}

export async function findMembershipHousehold(db: D1Database, email: string): Promise<string | null> {
  const row = await db.prepare('SELECT household_id FROM memberships WHERE email = ?').bind(email).first<{ household_id: string }>()
  return row?.household_id ?? null
}

/** Joins an existing household. A concurrent first request may win; the caller re-reads the membership. */
export async function joinHousehold(db: D1Database, email: string, householdId: string, now: string): Promise<void> {
  await db
    .prepare('INSERT INTO memberships (email, household_id, joined_at) VALUES (?, ?, ?) ON CONFLICT (email) DO NOTHING')
    .bind(email, householdId, now)
    .run()
}

function insertHouseholdStatement(db: D1Database, household: NewHousehold, now: string): D1PreparedStatement {
  return db.prepare('INSERT INTO households (id, name, created_at) VALUES (?, ?, ?)').bind(household.id, household.name, now)
}

// A household that a concurrent request left without members: nobody can ever see it, so drop it.
function deleteEmptyHouseholdStatement(db: D1Database, householdId: string): D1PreparedStatement {
  return db
    .prepare('DELETE FROM households WHERE id = ? AND NOT EXISTS (SELECT 1 FROM memberships WHERE household_id = ?)')
    .bind(householdId, householdId)
}

// Nobody may join a household with no members and see its roster.
function deleteOrphanInvitesStatement(db: D1Database, householdId: string): D1PreparedStatement {
  return db
    .prepare(
      `DELETE FROM household_invites WHERE household_id = ? AND accepted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM memberships WHERE household_id = ?)`,
    )
    .bind(householdId, householdId)
}

/** A new household of one for `email`. Returns the household the person is in afterwards. */
export async function addHouseholdOfOne(db: D1Database, email: string, household: NewHousehold, now: string): Promise<string> {
  await db.batch([
    insertHouseholdStatement(db, household, now),
    db
      .prepare('INSERT INTO memberships (email, household_id, joined_at) VALUES (?, ?, ?) ON CONFLICT (email) DO NOTHING')
      .bind(email, household.id, now),
    deleteEmptyHouseholdStatement(db, household.id),
  ])
  return (await findMembershipHousehold(db, email)) ?? household.id
}

export async function readHousehold(db: D1Database, householdId: string): Promise<Household> {
  const [household, members, invites] = await db.batch([
    db.prepare('SELECT id, name FROM households WHERE id = ?').bind(householdId),
    db.prepare('SELECT email FROM memberships WHERE household_id = ? ORDER BY email').bind(householdId),
    db
      .prepare(
        `SELECT id, email, invited_by, created_at FROM household_invites
          WHERE household_id = ? AND accepted_at IS NULL ORDER BY created_at`,
      )
      .bind(householdId),
  ])
  const row = (household.results as { id: string; name: string }[])[0]
  if (!row) throw new Error(`household missing for a member: ${householdId}`)
  return {
    id: row.id,
    name: row.name,
    members: (members.results as { email: string }[]).map((m) => m.email),
    invites: (invites.results as { id: string; email: string; invited_by: string; created_at: string }[]).map(
      (i): HouseholdInvite => ({ id: i.id, email: i.email, invitedBy: i.invited_by, createdAt: i.created_at }),
    ),
  }
}

export async function listInvitesFor(db: D1Database, email: string): Promise<InviteForMe[]> {
  const { results } = await db
    .prepare(
      `SELECT i.id, h.name AS household_name, i.invited_by FROM household_invites i
         JOIN households h ON h.id = i.household_id
        WHERE i.email = ? AND i.accepted_at IS NULL ORDER BY i.created_at`,
    )
    .bind(email)
    .all<{ id: string; household_name: string; invited_by: string }>()
  return results.map((r) => ({ id: r.id, householdName: r.household_name, invitedBy: r.invited_by }))
}

export async function countMembers(db: D1Database, householdId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM memberships WHERE household_id = ?')
    .bind(householdId)
    .first<{ n: number }>()
  return row?.n ?? 0
}

export async function renameHousehold(db: D1Database, householdId: string, name: string): Promise<void> {
  await db.prepare('UPDATE households SET name = ? WHERE id = ?').bind(name, householdId).run()
}

/** @throws the D1 UNIQUE error (household_invites_pending) when this person already has a pending invite. */
export async function insertInvite(
  db: D1Database,
  householdId: string,
  invite: { id: string; email: string; invitedBy: string },
  now: string,
): Promise<void> {
  await db
    .prepare('INSERT INTO household_invites (id, household_id, email, invited_by, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(invite.id, householdId, invite.email, invite.invitedBy, now)
    .run()
}

export async function findPendingInvite(db: D1Database, inviteId: string): Promise<PendingInvite | null> {
  const row = await db
    .prepare('SELECT id, household_id, email FROM household_invites WHERE id = ? AND accepted_at IS NULL')
    .bind(inviteId)
    .first<{ id: string; household_id: string; email: string }>()
  return row ? { id: row.id, householdId: row.household_id, email: row.email } : null
}

export async function deleteInvite(db: D1Database, householdId: string, inviteId: string): Promise<void> {
  await db
    .prepare('DELETE FROM household_invites WHERE id = ? AND household_id = ? AND accepted_at IS NULL')
    .bind(inviteId, householdId)
    .run()
}

/**
 * Moves the invited person into the inviting household, in one batch. Returns false when the invite
 * was already used or the inviting household has no members left.
 */
export async function acceptInvite(db: D1Database, invite: PendingInvite, fromHouseholdId: string, now: string): Promise<boolean> {
  const [accepted] = await db.batch([
    db
      .prepare(
        `UPDATE household_invites SET accepted_at = ? WHERE id = ? AND accepted_at IS NULL
           AND EXISTS (SELECT 1 FROM memberships WHERE household_id = ?)`,
      )
      .bind(now, invite.id, invite.householdId),
    db
      .prepare(
        `UPDATE memberships SET household_id = ?, joined_at = ? WHERE email = ?
           AND EXISTS (SELECT 1 FROM household_invites WHERE id = ? AND accepted_at = ?)`,
      )
      .bind(invite.householdId, now, invite.email, invite.id, now),
    deleteOrphanInvitesStatement(db, fromHouseholdId),
  ])
  return (accepted.meta.changes ?? 0) > 0
}

/** Moves the person from `fromHouseholdId` to a new household of one, in one batch. */
export async function leaveHousehold(
  db: D1Database,
  email: string,
  fromHouseholdId: string,
  household: NewHousehold,
  now: string,
): Promise<void> {
  await db.batch([
    insertHouseholdStatement(db, household, now),
    db
      .prepare('UPDATE memberships SET household_id = ?, joined_at = ? WHERE email = ? AND household_id = ?')
      .bind(household.id, now, email, fromHouseholdId),
    // A concurrent move already took the person elsewhere: drop the unused household.
    deleteEmptyHouseholdStatement(db, household.id),
    // Two last members leaving at once can still empty the old household.
    deleteOrphanInvitesStatement(db, fromHouseholdId),
  ])
}

export async function readCalendarToken(db: D1Database, householdId: string): Promise<string | null> {
  const row = await db.prepare('SELECT cal_token FROM households WHERE id = ?').bind(householdId).first<{ cal_token: string | null }>()
  return row?.cal_token ?? null
}

/** Sets the token only when the household has none, so every member shares one feed URL. */
export async function ensureCalendarToken(db: D1Database, householdId: string, token: string): Promise<string> {
  await db.prepare('UPDATE households SET cal_token = ? WHERE id = ? AND cal_token IS NULL').bind(token, householdId).run()
  const stored = await readCalendarToken(db, householdId)
  if (stored === null) throw new Error(`household missing for a member: ${householdId}`)
  return stored
}

export async function findHouseholdByCalendarToken(db: D1Database, token: string): Promise<string | null> {
  const row = await db.prepare('SELECT id FROM households WHERE cal_token = ?').bind(token).first<{ id: string }>()
  return row?.id ?? null
}

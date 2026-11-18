import { Fragment, useState, type ReactNode } from 'react'
import { SyncRequestError, cancelInvite, inviteMember, renameHousehold } from '../sync/client'
import { HOUSEHOLD_NAME_MAX, type InviteForMe, type Me } from '../sync/protocol'

/** Copy for a failed household request: by exact error code, then by code prefix (e.g. VALIDATION). */
interface ErrorCopy {
  byCode: Record<string, string>
  fallback: string
}

const RENAME_ERRORS: ErrorCopy = {
  byCode: { VALIDATION: `Enter a name of 1 to ${HOUSEHOLD_NAME_MAX} characters.` },
  fallback: 'Could not rename the household. Check your connection and try again.',
}
const INVITE_ERRORS: ErrorCopy = {
  byCode: {
    CONFLICT_ALREADY_MEMBER: 'They are already in this household.',
    CONFLICT_ALREADY_INVITED: 'They already have an invite.',
    VALIDATION: 'Enter a valid email address.',
  },
  fallback: 'Could not send the invite. Check your connection and try again.',
}
const CANCEL_ERRORS: ErrorCopy = {
  byCode: { NOT_FOUND: 'That invite is no longer open.' },
  fallback: 'Could not cancel the invite. Check your connection and try again.',
}
const JOIN_ERRORS: ErrorCopy = {
  byCode: { NOT_FOUND: 'That invite is no longer open.' },
  fallback: 'Could not join. Check your connection and try again.',
}
const LEAVE_ERRORS: ErrorCopy = {
  byCode: { CONFLICT_ONLY_MEMBER: 'You are the only member.' },
  fallback: 'Could not leave. Check your connection and try again.',
}

function errorMessage(err: unknown, copy: ErrorCopy): string {
  const code = err instanceof SyncRequestError ? (err.code ?? '') : ''
  return copy.byCode[code] ?? copy.byCode[code.split('_')[0]] ?? copy.fallback
}

/**
 * One household request at a time: `busyKey` names the running action so every
 * household button can disable, and its error shows next to the control that failed.
 */
function useHouseholdAction() {
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<{ key: string; message: string } | null>(null)

  /** Resolves true when the action succeeded. */
  const run = async (key: string, action: () => Promise<void>, copy: ErrorCopy): Promise<boolean> => {
    setBusyKey(key)
    setError(null)
    try {
      await action()
      return true
    } catch (err) {
      console.warn(`Household action ${key} failed`, err)
      setError({ key, message: errorMessage(err, copy) })
      return false
    } finally {
      setBusyKey(null)
    }
  }

  const errorFor = (key: string): string | null => (error?.key === key ? error.message : null)
  return { busy: busyKey !== null, run, errorFor }
}

function ActionError({ message }: { message: string | null }) {
  return message ? <p className="editor-error" role="alert">{message}</p> : null
}

/** Top-of-app prompt for the first invite waiting for the signed-in person. */
export function InviteBanner({ invite, onJoin, onDismiss }: {
  invite: InviteForMe
  onJoin: (invite: InviteForMe) => Promise<void>
  onDismiss: () => void
}) {
  const action = useHouseholdAction()
  const error = action.errorFor('join')
  return (
    <div className="app-banner no-print" role="status">
      <span>{invite.invitedBy} invited you to join <strong>{invite.householdName}</strong>.</span>
      {error && <span className="editor-error">{error}</span>}
      <button
        className="btn btn-primary"
        disabled={action.busy}
        onClick={() => void action.run('join', () => onJoin(invite), JOIN_ERRORS)}
      >
        Join
      </button>
      <button className="btn btn-ghost" onClick={onDismiss}>Not now</button>
    </div>
  )
}

interface HouseholdDetailsProps {
  me: Me
  /** Label above content (mobile drill-in) instead of the desktop two-column rows. */
  stacked: boolean
  onMeChange: (me: Me) => void
  /** Asks first, joins, and reloads into the new household. Rejects when the request fails. */
  onJoinHousehold: (invite: InviteForMe) => Promise<void>
  /** Asks first, leaves, and reloads into a new household. Rejects when the request fails. */
  onLeaveHousehold: () => Promise<void>
}

/**
 * Name, members, invites and leaving. Desktop renders label/content pairs for
 * the parent's `settings-rows` grid; `stacked` renders a single column.
 */
export function HouseholdDetails({ me, stacked, onMeChange, onJoinHousehold, onLeaveHousehold }: HouseholdDetailsProps) {
  const { household } = me
  const action = useHouseholdAction()
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [email, setEmail] = useState('')

  const saveName = async () => {
    const name = nameDraft.trim()
    if (name === household.name) {
      setEditingName(false)
      return
    }
    if (await action.run('rename', async () => onMeChange(await renameHousehold(name)), RENAME_ERRORS)) {
      setEditingName(false)
    }
  }

  const sendInvite = async () => {
    if (await action.run('invite', async () => onMeChange(await inviteMember(email.trim())), INVITE_ERRORS)) {
      setEmail('')
    }
  }

  const nameContent = editingName ? (
    <form className="household-form" onSubmit={(e) => { e.preventDefault(); void saveName() }}>
      <label className="cal-field">
        <span className="text-muted">Household name</span>
        <input
          className="input"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          required
          maxLength={HOUSEHOLD_NAME_MAX}
          autoFocus
        />
      </label>
      <button type="submit" className="btn" disabled={action.busy || nameDraft.trim() === ''}>Save</button>
      <button type="button" className="btn btn-ghost" onClick={() => setEditingName(false)}>Cancel</button>
    </form>
  ) : (
    <div className="household-name">
      <strong>{household.name}</strong>
      <button
        className="btn btn-ghost slot-rename"
        onClick={() => {
          setNameDraft(household.name)
          setEditingName(true)
        }}
      >
        Rename
      </button>
    </div>
  )

  const groups: { label: string; danger?: boolean; content: ReactNode }[] = [
    {
      label: 'Name',
      content: <>{nameContent}<ActionError message={action.errorFor('rename')} /></>,
    },
    {
      label: 'Members',
      content: (
        <ul className="household-list">
          {household.members.map((member) => (
            <li key={member}>
              {member}
              {member.toLowerCase() === me.email.toLowerCase() && <span className="text-muted">(you)</span>}
            </li>
          ))}
        </ul>
      ),
    },
    {
      label: 'Invite someone',
      content: (
        <>
          {household.invites.length > 0 && (
            <ul className="household-list" aria-label="Pending invites">
              {household.invites.map((invite) => (
                <li key={invite.id}>
                  {invite.email}
                  <span className="text-muted">invite pending</span>
                  <button
                    className="btn btn-ghost"
                    disabled={action.busy}
                    aria-label={`Cancel the invite for ${invite.email}`}
                    onClick={() =>
                      void action.run(
                        `cancel:${invite.id}`,
                        async () => onMeChange(await cancelInvite(invite.id)),
                        CANCEL_ERRORS,
                      )
                    }
                  >
                    Cancel
                  </button>
                  <ActionError message={action.errorFor(`cancel:${invite.id}`)} />
                </li>
              ))}
            </ul>
          )}
          <form className="household-form" onSubmit={(e) => { e.preventDefault(); void sendInvite() }}>
            <label className="cal-field">
              <span className="text-muted">Invite by email</span>
              <input
                className="input"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <button type="submit" className="btn" disabled={action.busy}>Send invite</button>
          </form>
          <ActionError message={action.errorFor('invite')} />
          <p className="text-muted footnote">
            They also need to be on the Access sign-in list before they can sign in.
          </p>
        </>
      ),
    },
  ]

  if (me.invitesForMe.length > 0) {
    groups.push({
      label: 'Invites for you',
      content: (
        <ul className="household-list">
          {me.invitesForMe.map((invite) => (
            <li key={invite.id}>
              <span>{invite.invitedBy} invited you to join <strong>{invite.householdName}</strong>.</span>
              <button
                className="btn"
                disabled={action.busy}
                aria-label={`Join ${invite.householdName}`}
                onClick={() => void action.run(`join:${invite.id}`, () => onJoinHousehold(invite), JOIN_ERRORS)}
              >
                Join
              </button>
              <ActionError message={action.errorFor(`join:${invite.id}`)} />
            </li>
          ))}
        </ul>
      ),
    })
  }

  if (household.members.length > 1) {
    groups.push({
      label: 'Leave household',
      danger: true,
      content: (
        <>
          <div className="data-row">
            <button
              className="btn btn-danger"
              disabled={action.busy}
              onClick={() => void action.run('leave', onLeaveHousehold, LEAVE_ERRORS)}
            >
              Leave household
            </button>
          </div>
          <ActionError message={action.errorFor('leave')} />
          <p className="text-muted footnote">You get a new, empty household. The roster stays with the others. Asks first.</p>
        </>
      ),
    })
  }

  const labelClass = (danger?: boolean) => `settings-label${danger ? ' settings-label-danger' : ''}`

  if (stacked) {
    return (
      <div className="household-stack">
        {groups.map((g) => (
          <div key={g.label}>
            <div className={labelClass(g.danger)}>{g.label}</div>
            <div className="household-group">{g.content}</div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <>
      {groups.map((g) => (
        <Fragment key={g.label}>
          <div className={labelClass(g.danger)}>{g.label}</div>
          <div className="household-group">{g.content}</div>
        </Fragment>
      ))}
    </>
  )
}

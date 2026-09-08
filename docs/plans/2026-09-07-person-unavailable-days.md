# Per-person unavailable days

## Context

Household members have standing weekly commitments: Tom is at dance on Monday
afternoons, James is at soccer all day Wednesday. The scheduler currently
ignores this, so rotations hand them chores they cannot do and fixed
assignments can be set on days they are away.

Goal: let each person record the weekday day-parts they are unavailable, have
rotations skip them on those occurrences, and warn when a fixed assignment
collides with an unavailable slot.

Out of scope: one-off absences (holidays, sick days), labels/reasons for the
commitment, fairness rebalancing beyond "skip to the next available person".

## Architecture

```
Person.unavailable                 availability.ts
{ 0: ['afternoon'], 2: ALL }  ──▶  isUnavailable(person, day, timeOfDay)
                                        │
          ┌─────────────────────────────┼──────────────────────────┐
          ▼                             ▼                          ▼
   rotation.ts                    ChoresPage.tsx              AssignSheet.tsx
   rotate: skip forward           manual/byday: warn          mark people
   to next available              rotate: "skipped" note      "unavailable"
   (null if nobody can)                                       for that date
          │
          ▼
   schedule.entriesForWeek  ──▶  Dashboard / MobileWeek / MyDay / Print / ICS
                                  (no change: null assignee = unassigned)

   PeoplePage.tsx: 7 day × 3 day-part toggle grid per person ──▶ updatePerson op
```

The worker shares `types.ts` and `ops.ts`, so no server change: `updatePerson`
already replaces the whole person record.

## Key interfaces

```ts
// types.ts
export type DayPart = Exclude<TimeOfDay, 'anytime'>
export interface Person {
  ...
  /** Weekday → day-parts this person can't do chores. Missing = free. */
  unavailable?: Partial<Record<DayIndex, DayPart[]>>
}

// availability.ts
export const DAY_PARTS: readonly DayPart[]
/** 'anytime' (or undefined) chores are only blocked when the whole day is. */
export function isUnavailable(p: Person, day: DayIndex, t: TimeOfDay | undefined): boolean
export function isAllDayUnavailable(p: Person, day: DayIndex): boolean
/** "Mon pm · Wed" for the people table; '' when always free. */
export function unavailabilitySummary(p: Person): string

// rotation.ts (signature unchanged)
assigneeForDate(chore, date, people, offset)
  // rotate: idx = (counter+offset) % n, then advance while
  // isUnavailable(ids[idx], day, chore.timeOfDay), at most n steps → null
```

## Implementation Order

- [x] 1. `types.ts`: add `DayPart` and `Person.unavailable`.
- [x] 2. `availability.ts` + `availability.test.ts` (depends on 1).
- [x] 3. `rotation.ts`: skip unavailable people in rotate mode; tests in
      `rotation.test.ts` (depends on 2).
- [x] 4. `PeoplePage.tsx` + CSS: availability column and toggle grid, saved via
      the existing `onUpdate` (depends on 2).
      _deviation: the people table already overflowed a 375px phone before this
      change; added a ≤700px rule hiding the Chores and Week load columns so the
      new column fits (load is still on the dashboard rail)._
- [x] 5. `ChoresPage.tsx`: conflict warning for manual/byday, skipped note for
      rotate (depends on 2).
- [x] 6. `AssignSheet.tsx`: mark people unavailable on the target date.
- [x] 7. README "People" bullet; progress log.

## Verification

```bash
pnpm test
./node_modules/.bin/tsc -b --force && ./node_modules/.bin/tsc -p worker
pnpm build
```

Manual: People → set Tom unavailable Mon afternoon; a Monday afternoon rotating
chore skips Tom, a Monday morning one does not; a fixed Monday afternoon chore
for Tom shows the warning in the editor.

## Notes / Deferred

- **Skip-to-next, not rebalance.** When the rotation lands on an unavailable
  person the next available person in the list takes that occurrence. The
  skipped person is not "owed" a turn: tracking that would need history or a
  scan from an epoch, and the previous rotation fix deliberately kept
  assignment stateless and stable. Household fairness drift is small.
- **Fixed assignments are respected, not overridden.** The user chose that
  person explicitly; silently unassigning would be surprising. The editor and
  assign sheet warn instead.
- **'anytime' chores** are blocked only when all three day-parts are blocked,
  since the person can do them in a free part of the day.
- **No schema bump.** The field is optional; old blobs need no migration.
- Deferred: one-off dates away, reasons/labels, fairness rebalancing.

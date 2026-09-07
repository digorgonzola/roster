# Progress — stefan-hattrell

## 2026-09-07
### Accomplished
- Fixed chore rotation so it advances one person per *occurrence* instead of per
  calendar day / week (`src/rotation.ts`). Wed+Sun with 4 people no longer gives
  the same person both days; fortnightly chores with a weekly advance no longer
  stick on one person.
- Shared `weeklyInterval` / `occurrenceWeek` helpers in `src/week.ts`; the
  editor's rotate preview now skips non-occurrence weeks.
- Added `src/rotation.test.ts` covering both bugs and backward compatibility.
### Decisions
- Every-day daily rotations keep their old day-number sequence (via the
  `WEEK_ZERO_DAY_NUMBER` term) so existing rosters don't reshuffle on deploy.
  Chores on a subset of days do reshuffle once; that is the bug being fixed.
### Next Steps
- Open a PR from `claude/chore-rotation-algorithm-b9ac59`.

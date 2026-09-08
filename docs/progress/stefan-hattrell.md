# Progress — stefan-hattrell

## 2026-09-07 (evening)
### Accomplished
- Per-person unavailable days: `Person.unavailable` (weekday → blocked
  day-parts), `src/availability.ts` helpers + tests, rotations skip unavailable
  people (`assigneeForDate`), People page toggle grid, chore editor warnings
  for fixed assignments, assign sheet marks. Plan:
  `docs/plans/2026-09-07-person-unavailable-days.md`.
### Decisions
- Skip-to-next-available rather than fairness rebalancing; keeps rotation
  stateless and stable. Fixed (manual/byday) assignments are respected, not
  overridden; the UI warns instead.
- 'anytime' chores are blocked only when the whole day is blocked.
- No schema bump: the field is optional and the worker shares the types.
### Next Steps
- Open a PR from `claude/chore-scheduling-unavailable-days-6ae357`.
- Consider one-off absences (holidays) if the household needs them.

## 2026-09-07
Fixed rotations to advance per occurrence, not per calendar day/week
(`src/rotation.ts`, tests in `src/rotation.test.ts`); shared `weeklyInterval` /
`occurrenceWeek` helpers in `src/week.ts`. Merged as PR #55 from
`claude/chore-rotation-algorithm-b9ac59`.

# Working on Liftoff

## Reporting changes

**Every time changes are made, summarise each one in a single line of plain
English.** No jargon, no paragraphs — one line per change, so the whole set can
be read at a glance. This applies without exception, including to small fixes.

Detail belongs in the commit message and in `innovation/`; the chat reply is the
one-line list.

## Standing constraints

- **Never alter the program data.** `plan.ts`, `pureBodybuilding.ts` and
  `library.ts` hold a Jeff Nippard sheet and are read exactly as authored. Reps,
  target RPE, set counts and exercise names come from the sheet; the app only
  ever fills in the weight, which the sheet deliberately leaves blank.
- **No deload detection.** The lifter plans their own deloads.
- Advice is a suggestion, pre-filled and overridable — never applied on the
  lifter's behalf.

## Where the reasoning lives

- `innovation/TRAINING_LOGIC.md` — how Afterburn turns logged sets into advice,
  written to be argued with. Known weaknesses are listed at the end.
- `innovation/DECISION_LOG.md` — why each decision was made, including the ones
  that were tried and reverted.
- `innovation/FOCUS_LOGIC.md`, `innovation/KAIROS_LOGIC.md` — the same for the
  other workspaces.

Keep these current when the logic changes. They exist so a later session can
argue with the reasoning rather than re-derive it.

## Verifying

`npm test`, `npm run lint`, `npx tsc -b` and `npm run build` all clean before
pushing. Timezone-sensitive logic gets run under a second zone
(`TZ=Asia/Kolkata npm test`). Anything visual gets checked by driving the real
build in a browser — three separate bugs in this codebase were invisible to a
green test suite and only showed up on screen.

# Liftoff (Focus): workspace logic, and where to attack it

How the Focus workspace — tasks, roadmap, habits, streaks — stores state, syncs
it, and decides what to show.

Written to be **argued with**, like `TRAINING_LOGIC.md` and `KAIROS_LOGIC.md`.
Reasons are stated for the non-obvious decisions, and the last section lists
what is known to be weak. If you are reviewing this, start there.

| Concern | File |
| --- | --- |
| All state, persistence, cloud load/save | `src/store/useStore.ts` |
| Types and seed content | `src/store/data.ts` |
| Day streaks | `src/lib/streak.ts` |
| Habit scheduling and habit streaks | `src/lib/habits.ts` |
| Two-device merge | `src/lib/sync.ts` |
| What the coach surfaces | `src/lib/coach.ts` |

---

## 1. Storage, and who owns it

Local-first in `localStorage` under `liftoff`, with optional sync to `user_data`
in Supabase, isolated per account by RLS.

The workspace is stamped with the `ownerId` that wrote it. A different account
signing into the same browser **resets the local copy** rather than merging it.
Without that, the loader's merge would show one person another's tasks and then
upload them into the second account's cloud row on the next save. A `null`
ownerId means "written before this was tracked" and is adopted rather than
discarded, so nobody loses a real workspace to the upgrade.

Loading **merges** rather than overwrites (`mergeState` in `sync.ts`), so a
freshly opened device never wipes the cloud, and history logged on any device
survives.

---

## 2. Streaks

Two different questions, and they need two different answers.

**"Did you show up today?"** — `streakFromDays` in `streak.ts`. Walks back one
calendar day at a time over `activityHistory`, allowing a single grace day so
one slip does not reset everything.

**"Are you keeping to this habit's schedule?"** — `habitStreak` in `habits.ts`.

The bug this fixed: habits used the day-by-day walk. For a habit scheduled
Mon/Wed/Fri, Tuesday is not a miss — it is not a training day. Run through the
daily walk, a **perfectly kept Mon/Wed/Fri habit reads a streak of 2, forever**:
the walk spends its grace day on Thursday and breaks on Tuesday. A once-a-week
habit reads 1. A streak that cannot grow is worse than no streak at all, and it
punishes exactly the user who set their schedule up honestly.

`habitStreak` walks the days the habit was **due**, counting consecutive
completed occasions, with the same one-slip grace.

**Decisions worth challenging**

- *Unscheduled days are stepped over, not counted.* A completion logged on a day
  the habit was not due is a bonus: kept in history and drawn on the strip, but
  it cannot extend the streak, because the streak measures keeping to the
  schedule.
- *The walk stops at `createdAt`.* Time before the habit existed is not missed
  time. A habit created on Friday and kept twice reads 2, not 2-with-a-broken-
  grace.
- *A weekly habit with no weekdays picked is due every day.* That is what the
  add form allows, so the fallback matches it rather than making the habit
  impossible to complete.
- *`missedLastDue` asks about the previous **due** day.* The "don't miss twice"
  warning compared against literal yesterday, so a Mon/Wed/Fri habit showed it
  on every single session.
- *The 7-day strip draws an unscheduled day as a dashed outline.* Drawn the same
  as a missed day, a Mon/Wed/Fri habit looked like it was failing four days a
  week.

`longestStreak` is the best of the stored value, the longest run anywhere in
history, and the current streak — so an import or a merge can never under-report
it.

---

## 3. Restoring a backup

`importData` in `useStore.ts`, driven from Settings.

**The bug this fixed.** It caught every failure, logged to the console, and
returned nothing — while Settings announced *"Backup imported successfully"*
unconditionally. A truncated file, a wrong-format file, or a JSON file that was
never a Liftoff backup all looked like a clean restore. That is the worst
possible moment to lie: someone restoring a backup may then delete the file.

It now returns `{ ok: true }` or `{ ok: false, error }`, and rejects in three
stages before touching any state:

1. not valid JSON
2. not a JSON **object** (an array, string, number or `null` would otherwise be
   handed to `set()`)
3. an object carrying **none** of the workspace's collections — `tasks`,
   `habits`, `phases`, `ideas`, `activityHistory`, `focusSessions`

Stage 3 is deliberately "any one of", not "all of", so a genuine backup taken
before a feature existed still restores. Settings shows the real message, in red
when it failed, and clears the file input so the same file can be retried.

---

## 4. Hover-revealed actions on a phone

Several rows fade their actions in on hover — delete a habit, delete an idea,
the schedule row's controls — via `opacity-0 group-hover:opacity-100`.

A phone has no hover. Those buttons sat at opacity 0 permanently, so on the
device this app is actually used on there was **no visible way to delete a
habit at all**. The element still received taps, but nothing showed it was
there.

Fixed once in `index.css` rather than at seven call sites, so the pattern stays
safe to use:

```css
@media (hover: none) {
  [class~='group-hover:opacity-100'] { opacity: 1; }
}
```

Matching the utility token in an attribute selector avoids escaping the `:` in
the class name. Specificity ties with `.opacity-0` and this sheet is later in
the cascade, so it wins without `!important`. Verified both ways: on a touch
context the delete buttons compute to opacity 1, on a desktop context they stay
at 0 until hover.

---

## 6. The dashboard rebuild — and the evidence behind each piece

Triggered by the owner, verbatim: *"the Liftoff Focus app really looks bad — I'm
not able to use it. If I mark a task as done I can see the same task marked done
on my dashboard, it's cluttered and doesn't make sense. Afterburn is very easy to
use and informative. If we're not able to improve we'll have to shut it down."*

### 6.1 What was wrong, measured

Seeded with a realistic week (9 tasks, 3 habits, focus sessions, a 6-day streak)
and rendered at 390x844:

| Problem | Detail |
| --- | --- |
| **Completed tasks came back** | `recentWins(tasks)` rendered a "Recent wins" list of exactly the tasks already shown on the Tasks page under Completed. Finishing work ADDED to the home screen instead of clearing it. This was the owner's specific complaint and it was real. |
| **The biggest card said "Not started"** | `hasRoadmap` is false without a roadmap, so the largest card read *"Progress — Not started / Map out your plan"* to someone with nine tasks, three habits, 3.9 hours of focus and a six-day streak. It could only read a roadmap and ignored everything else. |
| **The countdown appeared twice** | "120 days to go" in the headline and "120 / Days left" as a stat, on one screen. |
| **Habits were absent** | Three habits configured, none on the home screen. The daily loop had no home. |
| **The main action was dismissal** | One task under "Up next" with a full-width "Mark complete" button — the primary action on the home screen was to make something disappear. |

**Two things that looked like bugs and were not.** The streak and focus-hours
tiles both read 0 on the first pass. That was the test fixture writing
`{startedAt, minutes}` and setting `streak` directly, when the real shapes are
`{date, durationMins, kind}` and `streak` is DERIVED from `activityHistory`.
Reported as bugs they would have been fabrications; both work correctly.

### 6.2 What replaced it

New engine at `src/focus/today.ts` — pure, deterministic, every function takes
`now` so nothing depends on the clock.

| Card | What it answers | Evidence |
| --- | --- | --- |
| **Your day** | tasks and habits due now, one tickable list | Masicampo & Baumeister (2011, JPSP): unfinished goals produce intrusive thoughts and worse performance on unrelated tasks; making a SPECIFIC PLAN eliminated the effect |
| **This week vs last** | what moved, against your own previous week | Amabile & Kramer, ~12,000 diary entries from 238 people: progress on meaningful work is the single strongest marker of a good day |
| **Consistency** | a rate over 14 days, with a dot row | Lally et al. (2010), 96 people over 12 weeks: median 66 days to automaticity (range 18-254), and **missing one day did not alter the curve** |
| **This week** | a finish line close enough to pull toward | Kivetz, Urminsky & Zheng (2006), 948 café-card holders: gaps between visits shrank ~20% as the card filled |

Plus `scheduledTime` on habits, which had existed on the type and in `addHabit`
since the beginning with **no UI that could set it**. Gollwitzer & Sheeran's
meta-analysis — 94 tests, ~8,000 participants — puts "when situation X, I will
do Y" at **d = 0.65** on goal attainment. It is now in the add-habit form and
shown on the habit row and in the Today list.

### 6.3 Decisions worth challenging

- *Overdue tasks are pulled INTO today, and lead the list.* A task you missed is
  still today's problem; leaving it on another screen is how it stays missed.
  The cost is that a long-neglected task nags daily. Marked "N days late" rather
  than silently merged.
- *A task with no due date never appears.* Otherwise every unscheduled idea
  piles into today and the list stops meaning anything. The cost is that the
  dashboard is empty until you schedule something — which the empty state says.
- *A task ticked TODAY stays in the list; one finished on an earlier day drops.*
  Ticking something must not make it vanish under your finger.
- *Done items are NOT sorted to the bottom.* Same reason: reordering under the
  finger is disorienting. Strikethrough carries the distinction instead.
- *The comparison is to your own last week, never to a target.* A target set
  months ago mostly measures how optimistic you were that day.
- *No arrow at all until there is a real previous week.* Inventing a direction
  from one week of data is the mistake the training side had to be rebuilt to
  stop (`DECISION_LOG.md` §6.4).

### 6.4 Deliberately NOT built

- **Points, badges, levels.** Nothing in the evidence supports them for personal
  goals, and they would cheapen an app used seriously.
- **A streak that resets to zero.** Directly contradicted by Lally et al. The
  old `streak` field still exists and still feeds the coach; it is simply no
  longer what the dashboard leads with.
- **AI-written encouragement on the dashboard.** There is a Coach tab for that.
  A dashboard should show facts.
- **Any rebuild of Tasks or Focus.** Both measured clean; they work.

### 6.5 A bug introduced and caught in the same pass

`weekReview` first compared a task's due date against the current INSTANT, so
everything due today counted as "slipped" from the moment the screen loaded —
telling you that you had failed at tasks you still had all afternoon to do.
Now compares against the start of today. Covered by a regression test.

### 6.6 Timezone: two fixtures that passed only in UTC

The first test run went green immediately, which was suspicious. Run under
`TZ=Pacific/Auckland` two tests failed: `NOW` was built from a `Z` timestamp
whose LOCAL weekday is Wednesday at UTC+12, while the fixture asserted Tuesday,
and day keys were produced by slicing an ISO string (UTC) while `dayKey()`
formats local. The production code was correct throughout — it reads the user's
local day everywhere — but the tests would have passed in CI and failed on the
owner's machine in UTC+5:30. `NOW` is now constructed in local time and day keys
go through `date-fns`. The suite runs green under UTC, Asia/Kolkata,
America/Los_Angeles, Pacific/Auckland and Pacific/Kiritimati (UTC+14).

### 6.7 UI audit across the workspace

Every Focus screen measured in both themes.

| Fixed | Detail |
| --- | --- |
| Contrast on cards | `--text-subtle` was tuned against `--bg` only, so it passed on the page and still failed on every card. Re-tuned against `--elevated` in all four theme scopes. |
| Light-mode semantic colours | `--success`, `--danger`, `--warning` and `--cozy` are tuned to glow against black and measured **2.9-4.4:1 on white**, where they carry "2 days late", "Overdue", the week deltas. Darkened for the two LIGHT scopes only; same hue, dark mode untouched. |
| **Opacity on a var() colour, a third time** | `text-ink-subtle/40` computes to `rgb(244,243,241)` — that is `--text`, the BRIGHTEST token. Every one of these asked for "dimmer" and got "brightest". Three sites, now using real `opacity-*` utilities. |
| 7px text | The habit strip drew its weekday letter at 7px, under half the 11px floor. Cell 14px -> 20px, letter 7px -> 11px. |
| Floating buttons over content | The panic button sat bottom-LEFT, exactly where headings are — measured covering the word "CONSISTENCY". Moved to the right column above the FAB; bottom padding raised from 112px to 208px so both clear the last card. |
| Unlabelled fields | Habit name, habit emoji, focus task, brain-dump capture — four fields a screen reader announced as blank. |
| Truncated task titles | Wrapped to two lines instead. The distinguishing half of a title was being cut. |
| Stats stepper buttons | Unlabelled and under 44px. |

### 6.8 Known weaknesses of the rebuild

1. **The accent coral reads at 4.0-4.4:1 as small text on white.** Nav labels,
   "Today", the selected calendar day. Fixing it means darkening `--accent`,
   which is the workspace's identity colour and also fills every primary
   button — a brand decision, deliberately left for the owner rather than
   changed silently.
2. **Schedule day cells are 39x64.** Seven columns cannot be 44px wide on a
   390px screen without a 2px gutter. Passes WCAG 2.5.8 (24x24 minimum); fails
   the 44px AAA guidance. Left as is.
3. **"This week" is Monday-start and hardcoded.** No setting for people whose
   week starts Sunday.
4. **Consistency reads `activityHistory`, which the app writes on any activity.**
   It measures "opened and did something", not "did the work". A day where you
   ticked one trivial task counts the same as a full one.
5. **The roadmap is still a separate, unintegrated feature.** The dashboard no
   longer nags about it, but it also no longer surfaces it at all.

---


## 7. Known weaknesses — start here

Ordered by how likely they are to matter.

1. **`user_data` does not cascade from `auth.users`.** `journal_data` and
   `workout_data` are foreign-keyed to the auth user and clean themselves up;
   `user_data.id` is a plain `text` primary key. Deleting an account therefore
   strands its Focus workspace row in the database.
2. **Merge is last-write-wins per collection, not per item.** `mergeState`
   unions by id, but two devices editing the *same* task while offline will lose
   one side's edit. There is no field-level merge and no conflict surface.
3. **`ConsistencyGraph` computes its own best streak** from the visible window
   rather than reading `longestStreak`, so the number it shows can disagree with
   the one on the dashboard. Cosmetic, but it is the same word for two different
   figures.
4. **Habit completion is a single boolean per day.** There is no count, no
   partial credit and no "how much" — a habit is done or not, which makes
   quantity habits ("read 20 pages") really only "did you sit down".
5. **Archived habits are filtered in the UI, never in the store.** `habitLog`
   keeps growing for a habit nobody sees, and the archive flag has no UI to set
   it — only `deleteHabit`, which is destructive and takes the history with it.
6. **`toggleHabitToday` is today-only.** Forgetting to tick something yesterday
   cannot be corrected, which quietly corrupts a streak the user actually kept.
7. **The 7-day strip is fixed at 7 days.** For a once-a-week habit that is a
   single square, so the strip says almost nothing.

## Testing

`src/lib/habits.test.ts`, `src/store/import.test.ts`, `src/lib/sync.test.ts`,
`src/store/account-isolation.test.ts`.

The habit tests assert against the old behaviour directly — a perfect
Mon/Wed/Fri history is checked to read ≤2 through `streakFromDays` and 12
through `habitStreak`, so the regression cannot come back silently. The
`toggleLogDay` test fails if the entry is mutated in place rather than replaced.

```bash
npm test
```

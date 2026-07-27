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

## 5. Known weaknesses — start here

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

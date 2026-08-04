# Innovation

Everything invented for Liftoff that goes beyond logging what happened — the
code that tries to tell you something you did not already know, and the record
of how it was built, tested, and repeatedly found wrong.

Kept in one folder deliberately. This is the part most likely to be *incorrect*
rather than merely broken, and incorrect is harder to notice: a training app
that shows you a wrong number does not crash, it just quietly gives bad advice.
Grouping it makes it easy to find, argue with, and fix.

```
innovation/
  README.md            ← you are here: the target, the results, the Q&A
  TRAINING_LOGIC.md    ← how Afterburn decides what to tell you, and where to attack it
  DECISION_LOG.md      ← chronological: what was built, measured, got wrong, refused
  FOCUS_LOGIC.md       ← the Liftoff workspace: the dashboard, streaks, restores, sync
  KAIROS_LOGIC.md      ← the diary: search, resurfacing, photos

src/afterburn/innovation/
  blockReport.ts       ← what the whole block actually bought
  strength.ts          ← did this lift actually get stronger? (the hard one)
  returns.ts           ← which lifts are earning their sets
  equipment.ts         ← what you can actually add to the bar
  loadModel.ts         ← this lifter's own kilos-per-RPE
  *.test.ts            ← including three backtests that grade the engine itself
```

Every document here ends with a ranked **"known weaknesses — start here"**
section. If you are reviewing this, read those first. They are written to be
argued with.

---

## The target

> *Make the app tell me something true that I could not work out myself, and
> never tell me something confident that it cannot support.*

The second half turned out to be the hard part, and most of the work below is
about it.

Three standing constraints, set by the app's owner and never violated:

- **The program is never modified.** The Jeff Nippard sheet is read exactly as
  authored.
- **No deload detection.** The lifter plans their own deloads.
- **Nothing is ever applied automatically.** Every output is a suggestion.

---

## What was achieved

| # | Invention | The problem it solves | Measured result |
| --- | --- | --- | --- |
| 1 | **Exercise classification audit** | a name matching no rule is silently worth **zero sets**, which looks like under-training rather than a bug | 169 names audited: **18 counted for nothing, 11 for the wrong muscle**. On a real week 1, Back went 8.5 → 11.5 sets/wk, crossing from "below MEV, add sets" to optimal |
| 2 | **Microcycle-aware volume** | landmarks are per 7 days; this program runs 8 training days over ~11 | 24 chest sets no longer read "over MRV — cut back" when the true rate is ~15/wk |
| 3 | **Provisional week on the chart** | a half-logged week dropped the line from ~54 t to ~6 t, every week | partial weeks now draw dashed with an "on pace for" projection |
| 4 | **Equipment-aware load step** | a 2.5 kg jump is 2.5% on a barbell and **25% on a 10 kg dumbbell**; the app used to go silent | silence replaced by a double-progression prescription |
| 5 | **Return-on-volume ledger** | nothing tells you which lifts earned their share of a finite set budget | ranks lifts by e1RM gained per ten sets, and names the sheet's own swaps |
| 6 | **Strength verdict rebuilt** | the ledger was inventing directions for lifts that never moved | false direction on genuinely stalled lifts: **64% → 17%** |
| 7 | **"Cannot tell" as its own answer** | "flat" was being asserted where nothing could be read either way | 53% of stalled and 78% of very noisy lifts now return *unknown* instead of a bluff |
| 8 | **Diagnosis before blame** | "swap this exercise" was the first suggestion and the least likely cause | effort → load → volume → exercise, in that order |
| 9 | **Block report** | ten weeks of work left no mark; every number was in the log but never added up | one screen: weeks, sessions, tonnage, adherence, sets taken to failure, biggest gain, what bought least, PRs |
| 10 | **An unfinished week is not judged** | one session into week 3 the card said "12 under-trained" and told you to add sets everywhere — a shortfall made by the calendar | the last *complete* week is read instead, and the running one is named |
| 11 | **Placeholder slots kept out of results** | the block's "biggest gain" was "Weak Point Exercise 2 (optional)" — a blank slot in the sheet | excluded from the ledger, PRs and the lift count; their sets still count for volume |
| 12 | **Interruptions handled** | skipping one day and stopping froze the volume card on the previous week forever | "in progress" expires after a cycle plus a week; ending early was already safe |
| 13 | **Second look at the fixes** | the repairs above shipped five defects of their own, and the transparent-bar bug existed in four more places | all fixed; two earlier claims corrected rather than dropped |
| 14 | **Focus dashboard rebuilt** | completing a task put it back on your home screen; the biggest card said "Not started" to an active user; a 120-day countdown printed twice | Today / momentum / consistency / this week, each tied to a named study |
| 15 | **Morning CO2 nudge** | the test is only useful as a trend, and a trend needs a fixed time of day — one taken "whenever" is worth much less | a window 09:30-11:00, a different line each slot, silent the moment it's logged |
| 16 | **Note recall** | a note written on a lift was filed where you'd never see it again — least of all standing in front of that machine next week | shown on the exercise itself, plus a weekly digest; expires after a week |
| 17 | **The nudge reaches a closed phone** | the reminder could only fire while a tab was alive — which is precisely not the situation at 09:30, when the app is shut and the phone is in a pocket | a server push on a 5-minute cron, using the timezone stored on each device; four slots a morning, keyed per zone so two countries cannot silence each other |
| 18 | **Code Recall** | every engine in here reported on training that was already over; none of it was in front of you at the one moment it could change what you do | at most three grounded instructions before the session, plus a motivational line that is measured or absent — and it finally reads the set ratings, which nothing had ever looked at |

Also repaired along the way, outside Afterburn: habit streaks that could never
exceed 2 for a Mon/Wed/Fri habit, a backup restore that reported success
unconditionally, row actions that were invisible on a phone, and a diary that
re-uploaded every inline photo on every save.

---

## Every question that drove this, and the answer

Roughly chronological. Each links to where the reasoning lives.

**"My volume numbers look wrong."**
They were. 18 of the program's own exercises counted for nothing at all, and 11
were credited to the wrong muscle — moving sets between muscles so both readings
were wrong. → `TRAINING_LOGIC.md` §1b

**"I just switched to week 3 — how should that show on the graph?"**
Nothing changes until the first week-3 session is logged, because the chart only
reflects logged work. Then it *drops*, because a one-day week is being compared
against finished ones. That was a real flaw, now fixed with a dashed partial and
a pace projection. → `TRAINING_LOGIC.md` §1a

**"Should volume be per 7 days or per the program's own week?"**
Different answer for each chart, and they should disagree. The **tonnage** chart
stays per-cycle: within one program every week has the same 8 days, and
normalising would punish you for spreading a week out through illness. **Volume
IQ** must normalise, because MEV/MAV/MRV are published per 7 days. →
`DECISION_LOG.md` §2

**"1 rep at RPE 2.5 should suggest more reps, not more weight."**
Correct, and it went further than that: when the smallest jump the equipment
allows is bigger than the gap justifies, the app used to say **nothing**.
Silence reads as "all good", which is how a set stays easy for months. →
`TRAINING_LOGIC.md` §3

**"Can a machine learning model help fine-tune this?"**
Yes, and one idea specifically: **partial pooling across your lifts**. Detection
is weak because every lift is fitted in isolation on a handful of noisy points,
but your lifts are not independent. Where it would *not* help is also recorded —
the signal-to-noise limit is information-theoretic, and a confident model at the
same true accuracy is strictly worse than admitting uncertainty. →
`DECISION_LOG.md` §7

**"What do these features contribute to a normal person?"**
Mostly: the app used to quietly tell you wrong things. It never crashed, so
nothing looked broken — it just gave bad advice with a straight face. →
`README.md` "What was achieved"

**"Is the innovation actually correct, or are we hallucinating?"**
Partly hallucinating, as it turned out. An audit of code that had *passing
tests* found three defects, one of which made the safety net fail open on the
commonest shape of real data. Then every constant was re-derived from its
textbook definition in a script importing nothing from the app, and every
citation re-checked at source. → `DECISION_LOG.md` §6.7 and §8

**"Find the UI mistakes — here is what it looks like on my phone."**
Six screenshots found what an emulated audit had missed: with one of eight
sessions logged, Volume IQ was holding a part-finished week against a whole
week's landmarks and telling the lifter to add sets to twelve muscles. Also: the
sticky header computed to *fully transparent*, so text scrolled through it. →
`DECISION_LOG.md` §11

**"What if I end a workout early, or skip one completely?"**
Ending early is safe — the day still counts, so the week still completes.
Skipping one and simply stopping was **not**: the volume card froze on the
previous week permanently, hiding real sessions. "In progress" now expires after
one microcycle plus a week. All five interruption patterns are tested. →
`DECISION_LOG.md` §11.6

**"I am still sure there are bugs — step back and look at it new."**
Correct. Five were inside the fixes themselves — including tap targets that
stole each other's taps, and a "not trained yet" list that repeated the exact
mistake the volume fix was built to stop. The transparent-bar bug turned out to
exist in four more places, including the mobile bottom tab bar. Two claims from
the previous pass were also wrong and are corrected in place. →
`DECISION_LOG.md` §11.7

**"The Focus app looks bad and I can't use it — if we can't improve it we'll shut it down."**
Fair. Marking a task done put it straight back on the dashboard under "Recent
wins", and the largest card read *"Not started"* to someone with nine tasks and
a six-day streak. Rebuilt around four questions with evidence behind each: what
is due now, what moved this week, how often you showed up, and what the week
bought. The unused `scheduledTime` field turned out to be the highest-evidence
change in the app — d = 0.65 — and nothing could set it. →
`FOCUS_LOGIC.md` §6

**"Remind me every morning to do the CO2 test, and tell me next week what notes I left."**
Both built. The nudge is windowed rather than a single alarm, because the test
only means anything as a trend and a trend needs a fixed time of day. Notes come
back on the exercise they belong to, for a week, then expire. The interesting
part was that both passed their unit tests while the reminder was invisible in a
real browser — the check ran before the banner had mounted. →
`TRAINING_LOGIC.md` §7

**"Set up the server push so it works when the app is closed."**
Done. The zone lives on each push subscription rather than on the account, so
09:30 means 09:30 where the *phone* is, and travelling corrects itself on the
next open; a subscription with no zone is skipped rather than assumed to be UTC,
because guessing buzzes someone at 3am. The de-dup key carries the zone, or two
devices in two countries silence each other. The scheduling rule now exists in
two runtimes and is held byte-identical by a test. Driving a real browser found a
third instance of this feature's recurring bug: tapping the banner from Focus
landed on the Programs tab, because the Afterburn tree is lazy and nothing was
listening yet. → `TRAINING_LOGIC.md` §7c, `DECISION_LOG.md` §12

**"Build an engine that reads my lifts, my RPEs and my set ratings and tells
me how to approach the session — and something motivational. Call it Code
Recall."**
Built. Three instructions at most, each with the numbers that produced it and the
reason one tap away. The find along the way: every set already carried a 1-5 star
rating and **nothing in the app had ever read it** — it was written to storage and
never looked at again. It is the only subjective channel separate from RPE, and
the separation is the point: RPE says how hard a set was, the rating says how
well it went. A lift that is hard enough and still rates one star is an execution
problem, and adding weight — the one thing a load-only engine would suggest — is
the one thing that cannot help. The motivational half is measured or absent;
there is no rung for "let's go, champ".

A step-back review an hour later found three defects in it, all mine: the card
could contradict itself ("hold your top sets below target" beside "go up"), the
motivational line read two endpoints of a noisy series and announced 10.1 kg of
progress where the app's own fitted trend says 0.00, and the brief was replaced
by the logger at the exact moment you would act on it. All three fixed, each
pinned by a regression built from the series that exposed it. Each cue now also
carries a one-tap verdict — the seed of the ground truth this engine, alone among
them, had no way to collect. → `TRAINING_LOGIC.md` §6, `DECISION_LOG.md` §13

**"Make sure the model doesn't overfit."**
It is **not** overfitted to the seeds it was tuned on — five unseen draws
reproduce it within 4 points — and it sits on a plateau rather than a knife
edge. But it **is** fitted to the assumption that sessions are independent, and
they are not: with correlated noise the false-alarm rate triples to 35%. The
textbook correction was implemented, measured to do nothing, and **deleted**. →
`DECISION_LOG.md` §9

---

## What is still wrong

Stated plainly, because a limitation you know about is cheaper than one you
discover later.

1. **Correlated noise defeats the trend test.** If your bad patches last weeks
   rather than days, roughly **one flat lift in three** may be mislabelled.
   Measured, not guessed, and the attempted fix was removed for not working.
2. **Detection is weak from few sessions.** A genuinely progressing lift is
   caught about half the time from 4–9 sessions. More sessions help a lot
   (55% → 84% at twenty), but a handful cannot settle it.
3. **The calibration rests on simulated lifters.** Gaussian, independent noise.
   Real data is neither.
4. **e1RM is Epley, from 1985, derived on the bench press.** A 2026 equation fit
   on 303,494 sets is plausibly better, but the only validation available here
   was circular and its units are unresolved. Deliberately not adopted.
5. **Exercise classification is keyword matching.** Every name the *program* can
   produce is covered and locked down by a test, but a hand-typed custom name
   can still match nothing — and an unmatched name is worth zero sets.

Full ranked lists live at the end of each document.

---

## Running it

```bash
npm test     # 632 tests, 41 files
npm run lint
npm run build
```

Three of those test files grade the engine rather than the code:
`strength.backtest.test.ts` calibrates the decision threshold against simulated
lifters with known ground truth, `strength.compare.test.ts` asserts the current
engine invents fewer directions than the one it replaced, and
`strength.holdout.test.ts` checks the threshold against unseen draws and noise
shapes it was never tuned on.

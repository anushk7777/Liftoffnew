# Afterburn: training logic, and where to attack it

How Afterburn turns logged sets into advice — volume status, the progress
verdict, and what weight to put on the bar next time.

Written to be **argued with**. Every non-obvious decision below has a stated
reason, and the last section lists what is known to be weak. If you are a
reviewer or an agent looking for flaws, start there.

**Nothing here modifies a program.** `plan.ts`, `pureBodybuilding.ts` and
`library.ts` are read exactly as authored. There is no deload detection — the
lifter plans their own deloads.

| Concern | File |
| --- | --- |
| Per-muscle volume vs landmarks | `src/afterburn/volume.ts` |
| Set-vs-set progress, RPE gap → load | `src/afterburn/progression.ts` |
| Personal load-per-RPE model | `src/afterburn/innovation/loadModel.ts` |
| Workout screen wiring | `src/afterburn/Afterburn.tsx` |
| Pre-session brief (Code Recall) | `src/afterburn/innovation/codeRecall.ts` |

---

## 1. Volume is a rate, not a total

`analyzeVolume` in `volume.ts`.

The MEV / MAV / MRV landmarks are published as **sets per seven days**. A
program week is not a calendar week: Pure Bodybuilding runs **eight training
days**, which with rest lands around **ten or eleven calendar days**.

The bug this fixed: 24 chest sets over an 11-day microcycle were compared
against a 7-day MRV of 22 and reported **"over MRV — cut back"**. The real rate
is ~15 sets/week, squarely productive. The app was advising a cut on volume that
should have been trained.

Sets are now divided by the lifter's own microcycle length and judged as a
weekly rate. The UI shows both: `15 sets/wk · 24 logged`.

**Decisions worth challenging**

- *Microcycle length is the **median span of FINISHED cycles***
  (`microcycleDays`), with the in-progress cycle used only as a lower bound.
  Median so one cycle interrupted by illness does not stretch the estimate.
- *The denominator never drops below 7, and is capped at 21.* Seven is the
  landmarks' own basis, so a smaller denominator scales the rate **up** and can
  invent an "over MRV" that is not there. Found on review: the in-progress cycle
  was informing its own denominator, so three days into a new week the span was
  3, the rate came out more than doubled, and the original false alarm returned
  through the back door. Erring long can under-report volume, which is the safe
  direction — it never tells someone to cut work they should be doing.
- *Divided by the cycle's **length**, not by days elapsed.* A week two days in
  has genuinely done two days of work; dividing by two would report a wild rate
  off a single session.
- *The window still resets each program week.* A rolling window was tried and
  reverted: two existing tests encoded the reset deliberately, it matches the UI
  copy, and it matches how a lifter thinks about a block.
- *An unfinished week is not judged at all.* The note above used to end "the
  cost is that a partially complete week reads low — honest, but it can look
  alarming mid-cycle". It was worse than alarming. One session into week 3 the
  card read **"Week 3 · Build: 12 under-trained"** and told the lifter to add
  sets to twelve of thirteen muscles — a shortfall produced by the calendar, not
  by training. `analyzeVolume` now takes the program, counts logged days against
  prescribed days, and analyses the last **complete** week while naming the one
  still running. With no complete week behind it the report is marked
  `provisional` and the UI withholds every badge and recommendation. Projecting
  the partial week forward was tried on paper and rejected: one push day
  multiplied by eight reports chest **over MRV**, which is the same error with
  the sign flipped. Detail in `DECISION_LOG.md` §11.1.
- *"In progress" expires after one microcycle plus seven days.* Without an
  expiry, skipping a single day and stopping there left the card reporting the
  week BEFORE it, permanently — real logged sessions invisible with no way back.
  A week that has had its whole cycle plus a week of grace is not being trained
  any more, so whatever is in it is read as-is. The cycle length comes from the
  lifter's own finished weeks, so the rule calibrates itself rather than being
  tuned to one program. Ending a workout early does NOT hold a week open — the
  day still counts as done. `DECISION_LOG.md` §11.6.

### 1a. The volume-by-program-week chart

`volumeByProgramWeek` in `store.ts`, drawn by `Chart.tsx` from `Progress.tsx`.

One point per program week, grouped by the `weekId` stamped on each session
**when it was logged**. Switching the active week writes nothing — the chart
only ever reflects logged work, so moving to week 3 changes nothing until the
first week-3 session is saved.

**The bug this fixed.** A week's point only reaches its real height once every
day in it is logged. Plotted plain, the first session of a new week dropped the
line from a finished week's total (~54 t) to one day's (~6 t) and then climbed
back over the next ten days. Every single week, the chart said volume had
collapsed. The headline number and the "overall" delta both read the last point,
so they collapsed too.

Now, while the week is incomplete:

- the final leg is **dashed** and its dot **hollow**, so a partial is never read
  as a finished value
- a **projection ring** sits above it at `partial ÷ days done × days planned` —
  the figure that actually compares with the weeks before it
- the subtitle reads `day 3 of 8 · on pace for 82.7 t` instead of a meaningless
  overall delta
- **high/low and the gridline labels describe values actually reached**, so they
  exclude both the partial and the projection. Reporting "high 82.7 t" for a
  number no week has hit is a lie; the plot *scale* still spans everything drawn,
  or the ring would fall outside the chart.

Completion is read from `weekAdherence`, so it counts program days done, not
calendar days. When the week finishes, everything reverts to solid and the
overall delta returns.

Worth challenging: the projection is a **linear pace estimate** and assumes the
remaining days resemble the ones done. Pure Bodybuilding's days are not equal —
an Arms day carries far less tonnage than a Legs day — so early in a week the
projection can be off by a fair margin. Weighting by each day's planned set
count would be more honest.

### 1b. Which muscle a lift counts for

`classifyExercise` in `volume.ts`. Exercises are logged as free text with no
muscle tag, so each name is matched against an ordered rule table — first match
wins — crediting 1.0 set to each primary muscle and 0.5 to each secondary.

**This is the weakest link in the whole volume feature**, because a name that
matches nothing is worth **zero sets** and simply disappears. That does not look
like a bug; it looks like you under-trained a muscle. A name that matches the
*wrong* rule is worse still — it moves the sets to another muscle, so one reads
high and the other low, and both recommendations are wrong.

Auditing all 169 names the loaded program can put on screen found **18 counting
for nothing and 11 counted as the wrong muscle**:

| Name | Was | Now | Why it went wrong |
| --- | --- | --- | --- |
| Reverse DB Flye | chest | shoulders | `"Flye"` contains `"fly"`, and `"reverse fly"` never matched as one substring because the equipment sits between the words |
| DB Incline Curl | chest | biceps | the `incline` rule ran before the biceps rule and read it as a bench press |
| Low Incline DB Press | shoulders | chest | `"db press"` meant an overhead press and swallowed the incline bench too |
| …Row + Kelso Shrug | traps only | back + traps | the shrug rule claimed the whole movement and the row vanished |
| Reverse Nordic | hamstrings | quads | `"nordic"` matched, but the knee *extends* — it is the opposite movement |
| Bench Dip | chest | triceps | matched on `"bench"` |
| Decline Barbell Press | *nothing* | chest | no rule mentioned decline |
| Straight-Bar Lat Prayer | *nothing* | back | a week-1 exercise, counting for zero |
| Hip adduction ×4 | *nothing* | adductors | no such muscle existed |
| Hyperextension, Pallof press, vacuums, rollouts, Y-raise, band walks | *nothing* | as labelled | simply absent |

Two mechanisms were added to the rule table to make this expressible:

- **A keyword may be an array**, meaning *all of these words appear, in any
  order*. `['reverse', 'fly']` catches "Reverse DB Flye" and "Reverse Cable
  Flye" without also catching a chest flye.
- **A rule may carry `not`**, an exclusion list. The overhead-press rule now
  refuses any name containing incline, decline, bench, chest or pec.

**Adductors became a thirteenth muscle.** The program trains them directly and
often — machine, cable and Copenhagen adduction, three sets, twice a cycle.
Folding that into glutes would both overstate glutes and hide the work.

**MEV 0 means optional.** Adductors are the first muscle whose minimum effective
volume is zero: the compounds cover them, so skipping them is a choice, not a
shortfall. A muscle with no MEV is never reported as under-trained or neglected,
and does not pad the "dialed in" count when untouched — but its MRV ceiling
still applies.

A superset prefix (`A1: Machine Hip Adduction`) is stripped before matching; it
labels the pairing, not the movement. Unfilled weak-point picker slots are
recognised as placeholders so they are not reported as unknown lifts.

The guard against regression is a test that walks **every name in the loaded
program** — main slots, substitutions and weak-point options — and asserts the
list of unclassified names is empty. Neck work is the one deliberate exception:
there is no neck landmark, so it stays unclassified rather than being credited
somewhere false. (The trap it guards: "Neck Curls" contains "curl".)

---

## 2. The set verdict

`setVerdict` in `progression.ts`. Compares a set against **the same position**
last time — set 3 against set 3 — rather than a summary line for the exercise.

Precedence:

1. More weight at equal-or-more reps → **progress**
2. Same weight, more reps → **progress**
3. Same weight and reps, **lower RPE** → **progress**
4. Same weight, reps and RPE → *matched*
5. Less weight or fewer reps → **regression**
6. Heavier for fewer reps → deliberately **not** progress

Rule 3 exists because RPE falling at a constant load is the earliest form of
getting stronger, and it always precedes being able to add weight. Calling it
"matched" hid the exact moment a lifter became ready to move up.

Rule 6 is a judgement call: trading reps for load may be a good session or a bad
one, and the app should not hand it a green chip on the lifter's behalf.

`exerciseProgress` (in `progression.ts`) reads the whole lift as total volume
across matched positions, so one heavy set cannot hide two that fell.

Note there is a **second, unrelated `exerciseProgress` in `store.ts`** — the
per-session top-weight and estimated-1RM series the coach summarises. Same name,
different module, different job; importing the wrong one is an easy mistake.
That one used to read e1RM off the heaviest set alone, which under-reports:
80×3 estimates 88, while a 60×15 back-off estimates 90. Top weight and best
e1RM are now tracked separately, matching how `detectPRs` already scored them.

---

## 3. RPE gap → what to change

`loadHint` and `learnedLoadHint` in `progression.ts`.

The sheet prescribes an RPE. When a set comes in under it, that gap is the
overload instruction — but **the gap does not always mean load**.

**Reps are checked first.** RPE is a function of load *and* reps together, so an
easy set that fell short of the prescribed reps says nothing about the weight:
the prescribed work simply was not done. One rep of a five-rep target at RPE 2.5
returns a `reps` verdict — *get the full 5 at this weight first* — not a heavier
suggestion. Only once the reps are met does an easy rating mean the load is
light.

**Then the equipment gets a veto.** `equipment.ts`.

The step was a flat 2.5 kg for everything. Equipment does not work that way:

| lift | smallest jump | as a share of the load |
| --- | --- | --- |
| barbell @ 100 kg | +2.5 kg | 2.5% |
| machine @ 60 kg | +5 kg | 8.3% |
| **dumbbell @ 10 kg** | **+2.5 kg** | **25%** |

A dumbbell is logged *per hand*, so the smallest pair in the rack is an enormous
relative increment on small isolation work. When the RPE gap justifies less than
half a step, the suggestion used to round back to the current weight and the app
**said nothing at all**. Silence reads as "all good" — and that is exactly how a
set stays easy for months: the only jump available is unmakeable, so nothing
ever changes.

That case now returns `kind: 'more-reps'` — *stay at 10 kg and push past 10 reps*
— which is plain double progression, and the smaller increment.

- The step is guessed from the exercise name (`equipmentOf`), ordered so a cable
  movement that names a bar attachment ("Straight-Bar Lat Prayer") is not read
  as a barbell.
- Where a gym might have either 2.5 kg or 5 kg jumps, the **smaller** is
  assumed. Guessing small risks suggesting a weight that turns out unmakeable,
  which the lifter sees instantly. Guessing large silently converts a real load
  increase into "add reps", which is invisible and would stall progression.
- An unrecognised name keeps the old flat 2.5 kg, so nothing regresses.
- The personal model gets a **second opinion** on a `more-reps` verdict: the flat
  3%-per-point rule may fail to clear the step where this lifter's own figure
  clears it easily. Only when both fail does `more-reps` stand.

Guards, all deliberate:

- Silent below a **1.5-point gap** — inside the noise of rating your own effort.
- A ranged target (`7-8`) is read as **7**, so it cannot over-prescribe.
- Silent when rounding lands back on the weight already used.
- Silent when the set was **harder** than asked.
- Reads the **heaviest** set on the card, not the largest RPE gap. Picking by
  gap systematically picks the lightest set: a 40 kg opener at RPE 3 produced a
  confident "try 45 kg" for a lift whose working weight is 100 kg.

It is always a suggestion. Nothing is ever applied automatically.

---

## 4. The personal load model

`loadModel.ts`. Replaces the textbook "1 RPE ≈ 3% of load" with the lifter's own
figure.

**How.** RPE is reps-in-reserve inverted, so 5 reps at RPE 8 means about 7 were
available. Fit weight against that estimate per exercise, and the sheet's target
reads straight off the curve. The slope is the lifter's kilos per RPE point.

**Why not a neural network.** A few hundred sets is nowhere near enough to train
one; it would memorise the history rather than generalise. A weighted line fit
is more accurate at this sample size *and* explainable — which matters when the
output is what to put on a bar. This was asked for explicitly and declined
deliberately.

### Bad days — the problem this had to solve

On a rough day the reported RPE is **honest**. 100 kg genuinely felt like RPE 9.
The set is not inaccurate, it is missing context: how good the day was. Four
defences, and they matter more than the fit:

1. **Recency weighting**, halving every 42 days, so old bad patches and an old
   strength level stop deciding today's weight.
2. **Session-level residuals.** A bad day makes *every* lift feel heavy, so it
   appears as a whole session sitting off the curve; a genuine strength change
   shows on one lift and persists. Off sessions are **down-weighted to 15%, not
   deleted** — one bad Tuesday cannot drag next week down, three in a row still
   move it, because by then it is real.
3. **Medians throughout**, so one outlier cannot lead the fit.
4. **An "Off day" button** in the logger. The lifter knows before the app can
   infer it; the session stays in history and on the charts and is excluded
   from the fit entirely.

The off-day threshold is "twice the typical miss, floored at 2% of working
weight and at least 2.5 kg". **The floor is load-bearing**: on clean data the
typical miss approaches zero, and twice-nothing flags every session as an off
day and quietly down-weights the whole history.

### When it refuses to answer

`confidence: 'none'` with a reason — no fabricated numbers:

| reason | meaning |
| --- | --- |
| `no-data` | no usable sets for this lift |
| `too-few` | under 6 sets |
| `no-spread` | every set at the same distance from failure — a point, not a curve |
| `stale` | newest set older than 35 days; after a layoff the old curve is a different lifter |
| `erratic` | slope points the wrong way, i.e. the data contradicts itself |

`confidence: 'low'` still answers but is labelled a guide: few effective sets,
data older than 21 days, or spread past 10% of working weight. When the model
declines, the flat 3% rule takes over **and the UI says so**.

Warm-ups are excluded by **effort** (RPE < 5), not by distance from failure. An
earlier version capped reps-to-failure and would have silently discarded genuine
high-rep work such as 15 reps at RPE 8.

---

## 5. Return on volume — which lifts are earning their sets

`returns.ts`, shown on Progress as "What's paying off".

Every training app can tell you what you lifted. None tell you which lifts
earned their place. A lifter spends a fixed, scarce budget — sets they can
recover from — across ten or twelve movements. Some pay. Some have paid nothing
for two months and nobody notices, because the only thing tracked is that the
sets got done.

Each lift is ranked by **estimated 1RM gained per ten sets invested**, over a
90-day window. Where a lift has returned nothing, the swaps the program itself
already sanctions are named.

**It is deliberately hard to convince**, because a ranking built on noise is
worse than no ranking — it would have you drop exercises for no reason:

- Under **3 sessions**, or a span under **14 days**, the verdict is `unknown`,
  never `flat`. Absence of evidence is said plainly, and those rows sink to the
  bottom rather than sitting among real results with a misleading zero.
- The trend is a **least-squares slope against time**, not last-minus-first. One
  bad day at either end cannot decide a lift's fate, and unevenly spaced
  sessions are handled correctly. A test covers exactly this: four sessions
  climbing hard then one poor one still reads as progress.
- A gain counts only once it clears a **noise floor** of `max(2.5 kg, 2% of the
  working e1RM)`. e1RM is an estimate and small numbers wobble.
- **Rough days are excluded**, same as the load model — and their sets are not
  charged to the lift either, so a bad day costs nothing in both directions.

**Substitutions are indexed by family, not by sheet name.** A substitution is
not itself a program slot, so once you swap to "DB Flye" that name appears
nowhere as a key — and the lift you are *actually doing* would be the one lift
that never gets alternatives suggested. Every member of a slot's family maps to
its siblings.

**Decisions worth challenging**

- *e1RM is the yardstick.* It conflates load and reps, which is what we want for
  "did this get stronger", but it is an Epley estimate and drifts at very high
  reps.
- *Per ten sets, not per session.* Sets are the recoverable currency; a lift
  done for 2 sets is genuinely cheaper than one done for 5.
- *90 days is arbitrary.* Long enough to span a block, short enough that a lift
  fixed two blocks ago is not condemned by ancient history.
- *A lift can read flat because the program intends it to.* Deload weeks and
  high-rep pump work will not move e1RM much, and this does not know that. It
  reports what the numbers did, not whether that was the plan.

### 5a. How "did it get stronger" is actually decided

`strength.ts`. Split out from the ledger because the hard part is not whether
the number went up — it is whether that beats this lift's own noise.

**What the first version got wrong.** Backtested against 400 simulated lifters
per condition with known ground truth, the original engine asserted a direction
for **64% of lifters whose strength never moved at all** — and 75% of flat-but-
noisy ones. It called 32% of genuinely stalled lifts "declining". Most of the
ledger's confident verdicts were noise wearing a chip.

| Truth | old engine | now |
| --- | --- | --- |
| genuinely stalled | invents a direction **64%** | **17%** |
| flat, very noisy | invents a direction **75%** | **20%** |
| flat, reps drifting | invents a direction **~67%** | **18%** |
| genuinely progressing | caught 89% | caught 48% |

The rest of the stalled and noisy populations are now returned as *unknown*
(53% and 78% respectively) rather than as an asserted "flat".

Sensitivity halved, and that is the trade being made deliberately: the old 89%
is not comparable, because the same engine "found" movement in two thirds of
lifters who had none. What matters is the gap between the two, and the gap got
wider.

**Four changes, each forced by a measurement rather than an opinion.**

1. *Theil-Sen instead of least squares.* A test that failed was right to fail:
   four sessions climbing hard then one poor one (100, 108, 116, 124, 104) has
   one point 20 kg below the line, and squaring residuals let it dominate both
   the slope and the scatter. The median of pairwise slopes recovers the true
   slope exactly there.

   Scatter is measured robustly too — but **not by MAD alone**, which an audit
   showed collapses to zero whenever half or more of the residuals are zero.
   Theil-Sen makes that common, because its intercept is a median and pins the
   line through the middle of the data: four sessions at one weight plus two
   outliers, the exact shape of real stalled data, gave a scatter of **zero**
   while ranging from 20 to 180. That fed `underpowered` and made it fail
   **open**, so the app asserted a confident "flat" on data it could read
   nothing from. The estimate is now
   `max(1.4826 x MAD, 1.2533 x mean absolute residual)`; the second term cannot
   collapse unless every point lies exactly on the line.

2. *Mann-Kendall in place of a t-test.* The natural partner to Theil-Sen: it
   asks whether the ordering consistently points one way, without assuming a
   shape for the noise. The threshold `Z_CRITICAL = 1.25` was set by sweeping
   it against the simulated populations, not chosen. At 1.0 the false-alarm
   rate sat near 30% **no matter how many sessions were available** — that is a
   property of the threshold, not of the evidence.

   *Consequence found on audit:* Mann-Kendall's statistic is capped at
   `n(n-1)/2`, so the highest Z three sessions can reach is **1.044 — below the
   threshold**. Three sessions could never be called a trend however cleanly
   they climbed, while the UI promised a verdict after three. The minimum is now
   **four**, stated in `MIN_SESSIONS_FOR_VERDICT` and in the UI copy.

3. *A rep-drift penalty.* Simulating a lifter whose true strength never changes:
   reps drifting 8 -> 15 reports **-3.8 kg**, and 12 -> 8 reports **+3.3 kg**,
   against real gains of +6 to +7 kg in the same data. Drift alone produces half
   a real gain. Measured across the rep range, one rep of drift is worth up to
   **0.67% of e1RM**, and that is now added to the bar a gain must clear.

4. *The mean of the working sets, not the best one.* One lucky opening set could
   carry a session where the other two fell. Minimal-detectable-change work
   consistently finds smaller thresholds for average than for best values.

**"Flat" and "cannot tell" are now different answers.** Failing the trend test
means one of two very different things — *I looked and there is nothing there*
or *I could not have seen it either way*. Calling both FLAT is a bluff, and it
was leading to swap suggestions built on nothing. When a lift's scatter is wider
than a gain worth finding (5% of e1RM), the verdict is `unknown` and no
diagnosis or swap is offered.

**Two things were deliberately NOT changed**, both after testing:

- *Epley stays.* It sits within 2.3% of published rep-max tables from 3 to 12
  reps. The 2026 weight-dependent equation (fit on 303,494 sets) is plausibly
  better, but the one validation available here was circular — published
  percentage tables are themselves close to the classical model, so they cannot
  referee between them. Adopting an unvalidated formula that also drives PR
  detection was not worth it. **The kg/lb question is unresolved**: `ln(w)` is
  unit-dependent and the source is a US app, so feeding it kilos may be wrong.
- *High-rep sets stay in.* An earlier plan was to discard sets above 12 reps.
  Testing killed it: a lifter always doing 15s whose true 1RM goes 100 -> 110 is
  reported at +9.8 kg, **98% of the truth**, because a constant bias cancels in
  a trend. Only drift matters, and drift is handled directly.

### 5b. Is the threshold overfitted?

`Z_CRITICAL` was chosen by sweeping against simulated lifters — and then scored
against those same lifters. That is tuning on the data and reporting on the
data, so it was tested properly afterwards (`strength.holdout.test.ts`).

**Not overfitted to the seeds.** Five completely unseen draws reproduce the
tuning run to within 4 points: 39% caught, 13% false alarm, against the tuned
41% / 11%.

**Not a knife edge.** Thresholds of 1.15, 1.25 and 1.35 give 41/41/39% caught
and 14/14/12% false. It sits on a plateau, so the exact value is not load-
bearing.

**Holds well outside the band it was tuned in.** Noise from 2% to 15%, true
gains from 3% to 30%, 4 to 20 sessions, rep drift up to 8 — the false-alarm rate
stays between 8% and 20% throughout.

**But it IS fitted to one assumption, and that assumption is wrong.**
Mann-Kendall requires the sessions to be independent. Training is not: a bad
*week* makes consecutive sessions sag together, and a run that drifts together
looks monotone. On simulated AR(1) noise with genuinely flat strength, the
false-alarm rate roughly **triples to 35%**. Skewed noise (sessions failing
worse than they succeed) reaches 21%.

The textbook remedy — widening the variance by the series' own autocorrelation —
was **implemented and then removed**, because it was measured to do nothing:

| n | lag-1 measured | variance inflation | false alarm |
| --- | --- | --- | --- |
| 6 | 0.03 | 1.07× | 33% |
| 12 | 0.23 | 1.61× | 34% |
| 20 | 0.40 | 2.31× | 30% |

Two reasons it fails. Estimating lag-1 from residuals is self-defeating, since
removing the fitted trend removes the correlation with it — at n = 6 the
residual estimate came out **negative (−0.18) against a true 0.70**. And as n
grows the inflation grows, but so does the raw statistic, and they cancel. A
correction that does not correct is worse than none, because it looks like the
problem is handled.

So this is a **known, quantified failure mode rather than a fixed one**, and the
hold-out test asserts it at its measured size so a regression shows up as a test
failure rather than as quietly worse advice.

### 5c. Diagnosing a flat lift before blaming the exercise

`diagnoseFlat` in `strength.ts`. Checked in order: **effort**, then **load
dropping**, then **load never moving**, then **volume**, and only then the
exercise itself.

This exists because the original feature had the priority backwards. The 2025
consensus on training-response heterogeneity is that weekly sets, proximity to
failure and rest drive outcomes while exercise **selection is comparatively
flexible** — so "swap this" is the least likely explanation, and swapping a lift
you train too easily just gets you a new lift you train too easily.

A dropping load and a static load get different messages. Telling someone the
weight "hasn't moved" when they have taken 6 kg off it is simply false, and
hides the thing they would most want to notice.

The effort gap has to reach 1.5 RPE before it is raised: ratings 3-4 reps from
failure are systematically underestimated, so a small shortfall is not evidence.

---

## 5d. The block report

`blockReport` in `innovation/blockReport.ts`, shown on Progress.

A block ends and nothing happens. You close the app on the last session of week
10 exactly as you closed it on the first session of week 1, and ten weeks of
work leaves no mark. Every number needed to say what happened was already in the
log — it had just never been added up.

Nothing here is a new measurement. It reads engines that already exist — the
strength verdict, program-week tonnage, PR detection, adherence — so the report
and the charts can never disagree about the same figure.

**Deload weeks are excluded from the strength trend, and only from that.**

This is **not** deload detection, which the app deliberately does not do. The
program *names* those weeks itself ("Week 5 · Deload") and deliberately drops the
load in them. A strength trend spanning one measures the taper, not the block.

It matters because Pure Bodybuilding ends **both** of its blocks with a deload —
so the report would show no "biggest gain" at exactly the moment it is read.
Verified by seeding four weeks (a gain is found: +16 kg) and then five (it
vanishes).

The deload still counts in tonnage, sets, adherence and the weekly bars, because
that work was done.

**Read from the program, not the session.** A session keeps whatever `weekName`
it was stamped with when logged, which can be missing, stale, or from an older
revision of the sheet — and the filter would then silently do nothing. Deload
week *ids* are resolved from the program and matched on `weekId`. A test covers
exactly this: sessions carrying a non-matching `weekName` must still be excluded.

**Sets taken to failure** are counted as sets logged at RPE 10 — failure by
definition, nothing left in the tank. This is the sheet's own measure: Pure
Bodybuilding asks for RPE 10 on the last set of **75** of its exercises. The
share is measured against **rated** sets rather than all sets, because an
unrated set says nothing about how hard it was, and counting it as "not to
failure" would punish you for leaving the box empty.

**Decisions worth challenging**

- *It stays quiet rather than guessing.* One logged session gets a headline and
  nothing else — no "biggest gain" computed from a single point.
- *A stall is only named when it cost something* (6+ sets). A lift you did twice
  is not a finding.
- *"Complete" means every week of the program*, not every week you touched —
  otherwise one finished week would read as a finished block.
- *Only sessions whose `weekId` belongs to this program count*, so stale
  sessions from a previous program cannot inflate the tonnage.

---

## 6. Code Recall — the pre-session brief

Everything above is retrospective. The volume card, the returns ledger, the
block report — all of it is delivered *after* the training it describes, and none
of it is in front of you at the one moment it could change what you do: standing
in the gym doorway about to start.

Code Recall reads the same data and answers one question — *given what actually
happened, how should I approach THIS session?* — as at most three instructions
with the numbers that produced them.

`codeRecall` in `innovation/codeRecall.ts`, drawn by `CodeRecall.tsx` at the top
of the Workout tab.

### The rules it plays by

1. **Every cue is grounded in this lifter's data.** No generic coaching. If the
   evidence is not there the cue does not appear — an app that always has three
   tips is an app whose tips mean nothing.
2. **Nothing is suggested that cannot be acted on in the next hour.** "Improve
   your sleep" is true and useless at 6pm.
3. **Three cues, maximum**, one per lift and one per kind. The fourth-best tip is
   not worth the first three going unread.
4. **It never modifies the program**, and it does not detect deloads.
5. **Pure, and takes `now`**, so the whole brief is testable without a clock.

### The signal nobody was reading

Every logged set carries a 1–5 star `rating`, and until now **literally nothing
in the app read it** — it was written to storage and never looked at again.

It is the only subjective channel separate from RPE, and that separation is what
makes it worth having. RPE says how *hard* a set was; the rating says how *well*
it went. The two come apart in both directions, and each direction is a different
instruction:

| Pattern | What it means | The cue |
| --- | --- | --- |
| Poorly rated **at** the prescribed RPE | The load is right and the set still feels wrong | Do not add weight — fix the set-up first, and here are the sheet's own alternatives |
| Well rated **under** the prescribed RPE | Clean and easy | This is the lift to push today |

The first one matters most. Adding weight is the single thing that cannot help a
lift that is already hard enough and still rating one star, and it is exactly
what a load-only engine would tell you to do.

### Notes steer it, they are not just repeated back

A note is the only place the lifter says something the numbers cannot. "Left
shoulder pinched on the last set" and "seat notch 4, not 5" sit in the same field
as the load and the RPE, and until now the app only ever handed them back
verbatim — which misses that some of them should **change** the advice.

The case that matters: a lift logged at RPE 6 with five-star ratings and a note
saying the shoulder pinched. Every number says add weight. That is the one
instruction that cannot be right, and it is exactly what an engine reading only
numbers produces.

So each note is read for signals, and each signal does something:

| Signal | Example | What it does |
| --- | --- | --- |
| **pain** | "left knee pain", "tweaked my back", "twinge" | **Vetoes** every add-load cue on that lift, and takes priority 14 — above the load and rating rules |
| **failure** | "failed rep 8", "had to rack it" | Vetoes add-load; says repeat the weight before building on it |
| **form** | "form broke", "used momentum", "sloppy" | Corroborates an overshoot — quoted inside the "open lighter" cue rather than competing with it |
| **setup** | "seat notch 4", "pin 7", "different handle" | Warns the numbers are not comparable until the set-up matches |
| **positive** | "felt great", "smooth" | Nothing on its own; kept so the lexicon is symmetric and testable |

Two deliberate choices in the lexicon:

- **"Sore", "tight" and "stiff" are NOT pain.** They are what people write after
  every hard session. Including them would veto a load increase almost every
  time, and the most valuable cue in the engine would never fire again.
- **"No pain", "didn't hurt", "pain free" are guarded against**, in both word
  orders. The worst false positive available is the best note a lifter can write
  becoming the one that blocks their progress.

The costs are not symmetric, which is why pain gets the benefit of the doubt
everywhere else: a false positive costs one skipped load increase; a false
negative tells someone with a sore shoulder to add weight.

This is keyword matching, with the same weakness as the exercise classifier in
§1b — it reads the words people usually use, and a note phrased another way is
invisible to it.

### The nine rules, in the order they compete

| Priority | Rule | Fires when | Refuses when |
| --- | --- | --- | --- |
| 10 | Readiness | CO2 well below your own baseline, or well above | The reading is over 36h old, or missing |
| 16 | Rating — push it | ≥4★ mean and ≥1 RPE under target | Fewer than 4 rated sets across 2 sessions |
| 18/20 | Load | Last top set ≥1.5 RPE off target | No target, no logged RPE, or the day was marked rough |
| 22 | Rating — do not load it | ≤2.5★ mean and ≥60% of sets ≤2★ | As above |
| 26 | Restart | The last outing of this day was ended early or marked rough | It finished normally |
| 30/32 | Volume | A muscle this day trains is over MRV or under MEV | The volume report is provisional |
| 40 | Order | One of today's lifts is paying and another is flat | Fewer than two lifts have verdicts |
| 14/19/24/34/50 | Note | You wrote a note on one of today's lifts, inside the window — priority by what it says (pain, missed reps, form, set-up, plain) | The window has expired |
| 60 | Calibration | Your last 12+ sets are all the same RPE (sd < 0.35) | The ratings vary |
| 70 | Technique | The sheet prescribes one for a last set | It does not |

Readiness sorts above load on purpose: what weight to put on the bar is the wrong
question if today is a day to trim the session.

### The motivational half

The user asked for something motivational, and the honest version of that is
**measured, or absent**.

Amabile and Kramer's diary study (~12,000 daily entries, 238 people) found that
of every event that lifts motivation, the largest single one is evidence of
concrete progress in meaningful work — ahead of recognition, incentives and
encouragement. Bandura's account of self-efficacy puts mastery experience — your
own past performance — above every other source. Both point the same way: a
specific number the lifter earned beats any sentence the app could compose.

So the "spark" is ranked, and each rung quotes something real:

1. **A measured gain on a lift you are about to do** — "6kg stronger on Incline
   DB Press than when you started it", over a span, above the same 2.5 kg bar the
   rest of the app uses for a real change.
2. **Proximity to finishing the week** — Kivetz et al. (948 coffee cards)
   measured effort accelerating as a goal comes into view.
3. **Turning up** — sessions in the last four weeks. Not a streak: a streak
   punishes one missed day and this does not.
4. **Nothing measured yet** → an implementation intention rather than a cheer
   (Gollwitzer and Sheeran, 94 tests, ~8,000 participants, d = 0.65): "log the
   RPE on every set today", which is the thing that makes the next brief real.

There is no fifth rung. "Let's go, champ" is not motivation, it is furniture.

### Decisions worth challenging

- *Three cues.* Arbitrary. Fewer risks dropping something that mattered; more
  risks the whole card going unread.
- *One cue per kind.* Two lifts can both be badly rated and only one is named.
- *The rating thresholds (≤2.5★ mean, ≥60% poor, 4 sets, 2 sessions).* Judgement,
  not measurement — there is no ground truth for what a star means, and the
  numbers were picked to be conservative rather than fitted.
- *The brief is for the next unlogged session in the cycle.* A finished week gets
  no brief, and a lifter using only custom days gets none either, because there
  is no "next in the cycle" to point at.
- *Readiness freshness is 36 hours.* Long enough for a reading taken yesterday
  morning to still count for an evening session; short enough that Tuesday cannot
  advise Saturday.

## 7. Two things the app knew but never told you — and getting one of them out

### 7a. The morning CO2 nudge

The CO2 tolerance test is only useful as a **trend**, and a trend needs the
measurement taken at roughly the same time each day — resting, before food and
caffeine, before training. A score taken at 9am and one taken at 9pm are not
readings of the same thing. So a test you remember "at some point" is worth much
less than one taken in a fixed window.

`co2Nudge` in `innovation/recall.ts`.

- **Window, not an alarm.** Opens 09:30, asks again on a slot every 30 minutes,
  closes 11:00. Past 11:00 it goes quiet for the day: a reading at 3pm would
  pollute the very trend the reminder exists to protect, and an app that nags
  all day gets muted.
- **Silent the instant it is logged.** Nothing kills a reminder faster than one
  that fires after you have already done the thing. Checked against the local
  calendar day, so a reading at 00:05 counts for that day.
- **A different line each slot**, tightening as the window closes — by 11:00 it
  genuinely is the last useful moment.
- **Pure and parameterised on `now`**, so the whole schedule is testable without
  a clock.

**Decisions worth challenging**

- *30-minute slots, four nudges maximum.* Arbitrary. Fewer risks missing the
  window; more is nagging.
- *Silence is keyed to the calendar day, not to 24 hours.* A test at 23:55 does
  not silence the next morning, which is right — but a shift worker logging at
  02:00 silences that day rather than the one they think of as "last night".
- *The window is hardcoded.* Someone who trains at 6am wants it earlier. It
  should be a setting.

**Delivery** is covered in 7c: the in-app half only fires while a tab is alive,
so the cold path — a phone fully closed at 09:30 — is served by a server push.

### 7b. Note recall

You write "left knee felt off on the last set" into an exercise note and the app
files it where you will never see it again. The next time that lift comes round
— exactly when the note is worth something — it is eight screens deep in
History.

`noteForExercise` and `noteDigest` in `innovation/recall.ts`.

- **On the exercise, in the logger**, at the moment you are standing in front of
  the machine.
- **A weekly digest on Progress**, so a note about something with no obvious
  home ("logged this weight but the machine was set differently") still surfaces.
- **One week by default**, then it expires. Roughly one microcycle: you meet the
  lift again while the note still applies, and it does not accumulate into a wall
  of stale text. Configurable in Settings — off, 1/2/4 weeks, or never expire.
- **Only the latest note per exercise.** A note from three sessions ago has
  usually been superseded; stacking them turns a reminder into a diary.
- **Renders nothing at all when nothing was noted**, so the app is exactly as it
  was for anyone who does not use notes.

**Decisions worth challenging**

- *Latest only.* If you write two genuinely different notes on the same lift a
  week apart, the older is lost from recall (it stays in History).
- *Matching is by exercise NAME.* Rename a lift and its notes stop following it —
  the same weakness the volume classifier has.
- *Future-dated sessions are ignored*, so a clock skew or hand-edited backup
  cannot show you a note before you wrote it.

### 7c. Getting it to a closed phone

The in-app nudge had one flaw that mattered more than everything else in 7a: at
09:30 the app is shut and the phone is in a pocket, which is precisely the
situation it could not handle. It arrived on the next open *inside* the window,
which on most mornings meant not at all.

`send-co2-nudge` (Supabase Edge Function) on a 5-minute `pg_cron`, pushing
through the VAPID setup that already existed for task reminders.

- **The zone lives on the subscription, not on the account.** The phone is the
  thing that buzzes, so `push_subscriptions.time_zone` is per device, written on
  subscribe and refreshed on every app open. A phone that flies to another
  country starts nudging on the new local morning the first time Liftoff is
  opened there — no setting, no prompt.
- **A missing zone sends nothing.** A subscription made before the column
  existed is skipped and counted in the response as `missingZone`, rather than
  defaulting to UTC and buzzing someone at 3am. It self-heals on the next open.
- **The de-dup key is (user, zone, local day, slot)** and is *claimed before
  sending*. The zone is in the key on purpose: two devices in different countries
  are in genuinely different mornings, and keying on the day alone would let the
  first to fire silence the second for the rest of the day.
- **Five minutes, not one.** The window is 90 minutes long and the ledger makes
  overlapping ticks harmless, so a minute of precision would buy nothing and cost
  288 extra invocations a day. Five also divides every real UTC offset —
  including the 30-minute ones (India, Adelaide) and the 45-minute ones (Nepal,
  Chatham) — so 09:30 local is always a tick the cron lands on.
- **Five minutes of grace past 11:00**, so a cron tick that runs late still
  delivers the last call instead of dropping it silently. It cannot add a fifth
  nudge: the slot index is unchanged for the whole half hour after 11:00, and the
  slot is part of the key.
- **Only one of the two halves raises an OS notification.** When a push
  subscription exists the server owns that job and the client draws only the
  in-app banner — the thing push cannot do. Both use the same notification tag as
  a second line of defence, so a duplicate would replace rather than stack.
- **Tapping it opens the test**, via `/?co2=1` → switch to Afterburn → Progress.
  A service worker can only hand the app a URL, so the intent is latched at boot
  and claimed when the lazily-loaded Afterburn tree mounts. The flag is stripped
  from the address bar on the way through, or a refresh next Tuesday reopens it.

**The duplication, and why it is safe.** The Edge Function is deployed by pasting
one file into the Supabase dashboard, so it cannot import from `src/`. The
scheduling rule therefore exists twice — the classic way a reminder ends up
firing at the right hour in the browser and the wrong hour on a phone. It is
written once in `innovation/co2Server.ts`, copied verbatim by
`scripts/sync-co2-shared.mjs`, and `co2ServerParity.test.ts` fails the build if
the two differ by a single character.

**Decisions worth challenging**

- *Per-device zone rather than per-account.* Two devices in two countries both
  nudge, each on its own morning. Arguably a laptop left at home should not.
- *`missingZone` skips silently.* Correct, but invisible — there is no in-app
  sign that a device will not be nudged until it has been opened once.
- *The server trusts `workout_data.recovery` for "already logged".* Sync is
  ~1 second after logging, so a nudge could in principle be sent in the gap.
  Never observed, and the window is a 5-minute tick wide.
- *The grace is 5 minutes because the cron is.* If the cron period changes, the
  grace has to change with it; nothing enforces that beyond a comment.

**The honest limitation that remains:** iOS delivers web push only to a PWA
**installed to the Home Screen** (iOS 16.4+). In a plain Safari tab there is no
push at all, and the in-app nudge is still the only path.

---


## 8. Known weaknesses — start here

Ordered by how likely they are to matter.

1. **`lastPerformance` matches on exercise name only.** A program running the
   same lift twice in a day (top set and back-offs) shows both cards the same
   reference, so a heavy triple can be offered as the comparison for a set of
   eight. Matching on rep target or cycle slot would fix it. Visible today on
   Pure Bodybuilding's squat days.
2. **The load model pools all rep ranges for a lift.** A single line is fitted
   across singles and sets of fifteen, where the true relationship flattens at
   the high-rep end. Predictions near the edges of the logged range are the
   least trustworthy.
3. **`classifyExercise` is still keyword matching.** Every name the loaded
   program can produce is now covered and locked down by a test, but a *custom*
   exercise typed by hand can still match nothing — and an unmatched name is
   worth zero sets, silently making a muscle look under-trained. `unclassified`
   is surfaced in the report, but the count is still wrong until it is renamed.
   The real fix is letting the lifter tag an exercise with its muscles once and
   remembering it.
4. **`3%` per RPE point is a population constant** used whenever the model is
   not confident. It is roughly right in the mid range and worse at the extremes.
5. **RPE ratings are self-reported and drift.** Someone whose calibration
   changes over a block is learned as a strength change. Recency weighting
   limits the damage; nothing detects it.
6. **Off-day detection needs 2+ sets of a lift in a session** to see a pattern,
   so it cannot judge a single-exercise session.
7. **The microcycle length is a median over completed cycles.** A lifter who
   changes program structure mid-block gets a stale denominator until enough new
   cycles accumulate.
8. **Volume is only counted from sets with reps recorded** (`isHardSet`), so an
   unlogged set is invisible to volume even if it was performed.
9. **The return-on-volume ranking cannot tell intent from failure.** A lift
   programmed for high-rep pump work, or one carried through a deload, will read
   flat because e1RM did not move — which is true, and not the same as the lift
   being useless.
10. **Detection is weak with few sessions, and honestly so.** Even after this
   work, a genuinely progressing lift is only caught about half the time from
   4-9 sessions at realistic noise. More sessions help a lot (55% -> 84% at 20),
   but the honest position is that a handful of sessions cannot settle it.
11. **Correlated noise defeats the trend test, measurably.** With AR(1) session
   noise and genuinely flat strength, about **one lift in three** is called a
   mover (35%, against 13% on independent noise); skewed noise reaches 21%. A
   variance correction was tried and removed for doing nothing — see 5b. If
   your bad patches last weeks rather than days, treat "working" and "going
   back" with more suspicion than the chip implies.
12. **Equipment is guessed from the exercise name.** A gym with 1 kg micro
   plates or 5 kg dumbbell jumps will get the step wrong, and there is no way
   to tell it otherwise. Letting the lifter set the step per lift would fix it.

## Testing

`src/afterburn/{volume,classify,progression,co2Reminder,deepLink}.test.ts and
src/afterburn/innovation/{loadModel,equipment,returns,strength,recall,codeRecall,co2Server,co2ServerParity}*.test.ts`
— the behavioural claims above are covered, including the 11-day-cycle miscalibration, one rough
session barely moving the prescription, a sustained real drop still being
followed, every refusal case, and every exercise name the program can show.

The nudge's schedule is tested against real zones rather than against UTC: the
window opens at 09:30 local in seven zones including the 45-minute (Kathmandu)
and +14 (Kiritimati) offsets, keeps opening on six DST-transition mornings
including Lord Howe's 30-minute shift, and a minute-by-minute sweep of three
whole days per zone asserts it never fires outside the window and never exceeds
four slots in a local day. One test hands the browser rule and the server rule
the same instant and requires identical wording, so the screen and the push can
never disagree.

Code Recall is tested on its refusals as much as its rules — half of
`codeRecall.test.ts` asserts that a cue stays silent without evidence, because a
rule that fires on thin data is worse than no rule: it teaches the lifter to
ignore the ones that are right. Six mutations were introduced deliberately to
check those refusals have teeth (drop the readiness staleness check, count
unrated sets as zero stars, stop ignoring rough days, let future-dated sessions
through, and relax each of the two rating guards); every one was caught.

```bash
npm test        # 551 tests, 39 files

# The schedule is timezone logic, so run it somewhere else too:
TZ=Asia/Kathmandu npm test
TZ=Australia/Lord_Howe npm test
```

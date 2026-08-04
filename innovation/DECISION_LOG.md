# Decision log

A running record of what was built, what was measured, what was **wrong**, and
what was deliberately *not* done. `TRAINING_LOGIC.md`, `FOCUS_LOGIC.md` and
`KAIROS_LOGIC.md` describe how the app works today; this file describes how it
got there, including the routes that turned out to be dead ends.

Written for whoever reviews this next. The mistakes are the useful part — a
decision with no recorded reasoning gets re-litigated, and a mistake with no
record gets repeated.

## Timeline — read in this order if you are lost

The sections below are in the order the work actually happened, so this doubles
as a chronology. Each entry names what triggered it, so you can find the thread
you need without reading the whole file.

| Section | What triggered it | Outcome |
| --- | --- | --- |
| **1** Volume classification | volume numbers looked wrong | 169 names audited; 18 counted for nothing, 11 for the wrong muscle |
| **2** Program-week chart | "I just switched to week 3 — how should that show?" | partial weeks no longer read as a collapse |
| **3** Liftoff repairs | whole-app review | habit streaks, backup restore, buttons unreachable on a phone |
| **4** Kairos repairs | whole-app review | diary search; inline photos re-uploaded on every save |
| **5** Equipment-aware load step | "1 rep at RPE 2.5 should suggest more reps, not more weight" | silence replaced by a double-progression prescription |
| **6** Return-on-volume ledger | "suggest something that hasn't been done yet" | built, shipped, then found badly miscalibrated |
| &nbsp;&nbsp;6.2 Research pass | "search modern research, are we building good?" | six findings; two overturned decisions already made |
| &nbsp;&nbsp;6.4–6.6 Rebuild | the backtest in 6.4 | Theil-Sen, Mann-Kendall, drift penalty, "cannot tell" as its own answer |
| &nbsp;&nbsp;6.7 Audit | "verify the invention, find flaws" | three defects found in code that had passing tests |
| **7** Machine learning | "can ML fine-tune our inventions?" | yes — partial pooling; and where it would not help |
| **8** Independent verification | "make sure we are not hallucinating" | every constant re-derived from first principles; citations re-checked |
| **9** Overfitting audit | "make sure the model doesn't overfit" | not overfitted to seeds; IS fitted to an independence assumption, measured and left in place |
| **10** Block report + app-wide fuzz | "add sets to failure, the card looks bad, find any other bugs" | card rebuilt; three more crashes found, one in the core store |
| **11** UI/UX audit on a real phone | screenshots from the user's own device | a half-finished week was being judged as a shortfall; the header had no background; two tabs unreachable |
| &nbsp;&nbsp;11.6 Interruptions | "what if I end early or skip a workout?" | a week you never finish used to freeze the card on the week before it, forever |
| &nbsp;&nbsp;11.7 Second look | "I am sure there are still bugs — step back" | five defects inside the fixes themselves, incl. the transparent-bar bug in four more places; two earlier claims corrected |

**Sections 8 and 9 are the ones to trust.** Everything before it is reasoning; that one
is arithmetic that does not depend on the code being right.

---

## 1. Volume: which muscle a lift counts for

**Why.** An exercise name that matches no rule is silently worth **zero sets**.
That does not look like a bug; it looks like you under-trained a muscle.

**What was measured.** Every one of the **169 names** the loaded program can put
on screen — main slots, substitutions, weak-point options — run through
`classifyExercise`. Result: **151 classified, 18 counting for nothing, and 11
counted as the wrong muscle.**

The wrong-muscle cases were worse than the misses, because they move sets from
one muscle to another and both readings end up wrong:

| Name | Was | Why |
| --- | --- | --- |
| Reverse DB Flye | chest | `"Flye"` contains `"fly"`, and `"reverse fly"` never matched as one substring with equipment between the words |
| DB Incline Curl | chest | the `incline` rule ran before biceps |
| Low Incline DB Press | shoulders | `"db press"` meant overhead press and swallowed the bench |
| …Row + Kelso Shrug | traps only | the shrug rule ate the row |
| Reverse Nordic | hamstrings | matched `nordic`, but the knee *extends* |
| Bench Dip | chest | matched `bench` |

**Invented.** Two mechanisms so the table could express what it needed to:
a keyword may be an **array** (all these words, any order), and a rule may carry
**`not`** (an exclusion list). Also `isPlaceholderExercise`, so unfilled
weak-point slots are not reported as unknown lifts.

**Result on real data.** A full 8-day microcycle of week 1: Back went
**8.5 → 11.5 sets/wk**, crossing from "below MEV, add sets" to optimal, because
Straight-Bar Lat Prayer and the 45° hyperextension — 5 sets — had been counting
for nothing. Chest went **14 → 12 raw**, correctly, because an Incline DB
Stretch-Curl had been booked as a chest press. Every delta reconciled by hand.

**Also invented.** Adductors as a thirteenth muscle, and the first with MEV 0 —
meaning *optional*: never reported as under-trained when untouched, never
padding the "dialed in" count, but the MRV ceiling still applies.

**Mistake made along the way.** The first attempt gave the straight-arm lat
group `chest` as a secondary, which silently reclassified `1-Arm Lat Pull-In`
from `back (biceps)` to `back (chest)`. Caught by reading the full mapping table
rather than only the unclassified list. Lesson: when changing an ordered rule
table, diff **every** output, not just the ones you were aiming at.

**Guarded by** a test that walks every name the program can produce and asserts
nothing is unclassified. Neck work is the single deliberate exception — no
landmark exists, so it stays uncounted rather than credited somewhere false.
The trap it guards: *"Neck Curls" contains "curl"*.

---

## 2. The volume-by-program-week chart

**Why.** A week's point only reaches full height once every day in it is logged,
so the first session of a new week dropped the line from ~54 t to ~6 t. Every
single week, the chart said volume had collapsed.

**Built.** Dashed final leg, hollow dot, a projection ring at
`partial ÷ days done × days planned`, and `day 3 of 8 · on pace for 82.7 t` in
place of an overall delta that compared a partial against whole weeks.

**Caught during review.** With the projection included in the axis extent, the
"high" readout began reporting **82.7 t — a figure no week had ever hit**. Split
into two ranges: the plot *scale* spans everything drawn (or the ring falls off
the chart), while the *labels* describe only values actually reached.

**Not done, and why.** Normalising this chart to sets-per-7-days was considered
and rejected. Within one program every week has the same 8 training days, so
weeks are already comparable; normalising would make a week you *completed* but
spread over 18 days read low, punishing you for illness. Confirmed by test:
same program, same 8 workouts, stretched cycle → tonnage correctly unchanged at
24.0 t, while Volume IQ correctly reads lower per week. **The two charts
disagreeing there is information, not a bug.**

---

## 3. Liftoff: habits, backups, and buttons you cannot tap

**Habit streaks** counted consecutive **calendar** days. A perfectly kept
Mon/Wed/Fri habit read a streak of **2, forever** — the walk spent its grace day
on Thursday and broke on Tuesday. A once-a-week habit read 1. Verified live at
12 after the fix.

**Mistake.** The first API returned `{ streak, graceAvailable }`. A test then
showed `graceAvailable` was false for essentially every finite history, because
the walk always continues past the last completion and consumes the grace on the
first miss it finds. It was uninterpretable and nothing consumed it, so it was
**deleted rather than explained**. A field that needs a paragraph to read
correctly is a bug in the interface.

**Backup restore** announced *"Backup imported successfully"* unconditionally
while `importData` swallowed every failure — at the exact moment someone might
delete the file they restored from. Now three-stage validation returning
`{ ok }` or `{ ok, error }`, shown in red on failure.

**Hover-revealed actions** were unreachable on a phone: `opacity-0
group-hover:opacity-100` never resolves without hover, so there was **no visible
way to delete a habit** on the device this app is used on. Fixed once in CSS by
matching the utility token under `@media (hover: none)` rather than editing
seven call sites. Verified both ways — opacity 1 on touch, still 0 until hover
on desktop.

---

## 4. Kairos: search, and photos re-uploaded on every save

**Search.** A diary you cannot search stops being useful at exactly the point it
becomes valuable — a few hundred entries in, when scrolling finds nothing.
`searchMoments` matches words, place, song and the mood's own label. Every term
must match (narrowing is the point) but a term may match any field, so you need
not remember which one it was. Case and accents are ignored, done by NFD
normalising and stripping the combining-diacritics block — written as an escape
rather than the literal characters, which are invisible in source and easily
mangled by an editor.

**The sync bug.** Photo migration was guarded by a one-shot flag set at app load.
So a photo captured *after* load stayed inline as base64 for the rest of the
session, and a failed upload was never retried. Every debounced save pushes the
**whole moments array**, so each inline photo — a few hundred KB as base64 — was
re-uploaded in full on every later change. The guard now only prevents two
migrations running at once, is released in a `finally`, and capture triggers
migration immediately.

**Mistake.** The mood chips came out 30 px tall from padding alone. Picking a
mood is the main interaction on the capture screen. Caught by measuring every
tap target in a real browser rather than by eye.

---

## 5. Suggesting reps when the next weight is unmakeable

**Why.** The load step was a flat 2.5 kg for everything.

| lift | smallest jump | share of load |
| --- | --- | --- |
| barbell @ 100 kg | +2.5 kg | 2.5% |
| machine @ 60 kg | +5 kg | 8.3% |
| **dumbbell @ 10 kg** | **+2.5 kg** | **25%** |

When the RPE gap justified less than half a step, the suggestion rounded back to
the current weight and the app returned `null` — **silence**. Silence reads as
"all good", and that is precisely how a set stays easy for months.

**Built.** `equipment.ts` guesses equipment from the name; a new `more-reps`
verdict prescribes reps at the same load. Where a gym might have 2.5 kg or 5 kg
jumps the **smaller** is assumed: guessing small risks an unmakeable suggestion,
which the lifter sees instantly, while guessing large silently converts a real
load increase into "add reps" and would stall progression invisibly.

**Design point worth keeping.** The personal load model gets a *second opinion*
before `more-reps` stands — the flat 3%-per-point rule may fail to clear the
step where the lifter's own measured figure clears it easily.

**Failed test that was right.** An existing test asserted `loadHint` returns
`null` for `('2.5', '5', '8', 2.5)`. It now returns `more-reps`. The old
assertion encoded the silence this change exists to remove, so the test was
rewritten with the reasoning in its body rather than the behaviour reverted.

**Mistake.** A test expected `107.5` for a 2-point gap on 100 kg. The answer is
`105` — 100 × 1.06 = 106, which rounds to 105 on a 2.5 kg step. **My arithmetic
was wrong, not the code.** Always recompute by hand before trusting an
expectation.

**Verified live**, both on one card at the same RPE gap: the curl gets *"next
weight up on dumbbells is +2.5kg — a 25% jump, push past 10 reps instead"*, the
squat gets *"try 105kg"*.

---

## 6. The return-on-volume ledger, and rebuilding it

This is the one that went wrong and had to be redone. It is the most useful
entry in this file.

### 6.1 What was built first

Rank each lift by e1RM gained per ten sets over 90 days; where a lift returned
nothing, name the swaps the program already sanctions. Least-squares slope,
best-set e1RM per session, and a noise floor of `max(2.5 kg, 2% of e1RM)` —
**a number I invented**.

It looked convincing. Verified in the browser, tests passing, plausible output.

### 6.2 What the research said

| Finding | Consequence here |
| --- | --- |
| Thresholds ignoring measurement error **inflate response rates** | my invented floor had no defence |
| Minimal detectable change is **smaller for average than best** values | reading the best set was adding noise |
| Weekly sets, proximity to failure and rest drive outcomes; **exercise selection is comparatively flexible** | "swap this exercise" was the *least* likely explanation, and I had made it the first |
| RIR at 3-4 reps from failure is **systematically underestimated**; above 12 reps ratings degrade | not all logged RPE deserves equal weight |
| A 2026 equation fit on **303,494 sets** beats Epley by 17-22% | our e1RM formula is from 1985 and was derived on the bench press |

### 6.3 What the measurements said

**e1RM formula.** Tested Epley, Brzycki and the 2026 weight-dependent equation
against published rep-max percentage tables. Epley 1.73% mean error, Brzycki
1.53%, the new equation 5.29–10.82% depending on units.

**That test was circular and I said so.** The published percentage tables are
themselves close to the classical model, so they cannot referee between
classical formulas and a challenger. The result proves nothing. **Not adopted**
— see 6.6.

**Rep drift.** Simulating a lifter whose true strength never changes:

| what happened | reported |
| --- | --- |
| reps drift 12 → 8 | **+3.3 kg** |
| reps drift 8 → 15 | **−3.8 kg** |
| real gain, reps stable | +6 to +7 kg |

**Drift alone manufactures half a real gain.** Measured across the rep range,
one rep of drift is worth up to **0.67% of e1RM** at the 90th percentile.

**A constant high rep count is harmless.** A lifter always doing 15s whose true
1RM goes 100 → 110 is reported at **+9.8 kg, 98% of the truth** — a constant
bias cancels in a trend. This killed a planned change (5.6).

### 6.4 The backtest — the finding that forced the rebuild

400 simulated lifters per condition, known ground truth, real code.

| Truth | first version | after rebuild |
| --- | --- | --- |
| genuinely stalled | invents a direction **64%** | **17%** |
| flat, very noisy | invents a direction **75%** | **20%** |
| flat, reps drifting | invents a direction **~67%** | **18%** |
| genuinely progressing | caught 89% | caught 48% |

Most of what the new engine no longer asserts becomes *unknown* rather than
*flat*: 53% of stalled lifters and 78% of very noisy ones.

It called **32% of genuinely stalled lifts "declining"**. The feature I had
verified in a browser and covered with passing tests was, on anything not
obviously moving, close to a random verdict generator.

Sensitivity halved. That trade is deliberate: the old 89% is not comparable when
the same engine "found" movement in two thirds of lifters who had none. What
matters is the **gap**, and the gap widened.

### 6.5 What was changed, and why each

1. **Theil-Sen instead of least squares.** A test failed and was right to:
   100, 108, 116, 124, **104** has one point 20 kg below the line, and squaring
   residuals let it dominate both slope and scatter, so a clearly climbing lift
   read as no trend. The median of pairwise slopes recovers the true slope
   exactly. Scatter measured robustly too, as `1.4826 × MAD`.

2. **Mann-Kendall instead of a t-test.** The natural partner to Theil-Sen: it
   asks whether the ordering consistently points one way without assuming a
   shape for the noise.

3. **The threshold was swept, not chosen.** At z = 1.0 the false-alarm rate sat
   near **30% no matter how many sessions were available** — a property of the
   threshold, not the evidence. z = 1.25 takes it to ~11%.

   ```
      z    caught   false alarm   drift fooled
    0.00      86%          71%            51%
    1.00      56%          25%            23%
    1.25      41%          11%            14%     <- chosen
    2.00      12%           2%             2%
   ```

   **Mistake.** My first scoring function picked z = 2.0, which catches 12% of
   real movers — the feature would say "flat" for nearly everything. The score
   was dominated by penalty terms. A metric that optimises to a useless answer
   is a broken metric, not a discovery.

4. **A rep-drift penalty**, at the measured 0.67% per rep.

5. **The mean of the working sets, not the best one.**

6. **"Flat" and "cannot tell" became different answers.** Failing the trend test
   means one of two very different things — *I looked and there is nothing* or
   *I could not have seen it either way*. Calling both FLAT is a bluff, and it
   was producing swap suggestions built on nothing. When scatter is wider than a
   gain worth finding (5% of e1RM), the verdict is `unknown` and no diagnosis or
   swap is offered.

7. **Diagnosis before blame.** Effort → load dropping → load static → volume →
   and only then the exercise. Swapping a lift you train too easily just gets
   you a new lift you train too easily.

   **Caught in the live app**, not in a test: a leg curl whose weight had
   *dropped* 6 kg was told *"the weight hasn't moved"*. Dropping and never-moving
   are different situations and now have different messages.

### 6.6 Deliberately NOT implemented

**The 2026 e1RM equation.** Plausibly better — 303,494 sets, beat four classical
formulas on all 183 exercises tested. Not adopted because the only validation
available here was circular, and because **`ln(w)` is unit-dependent**: the
source is a US app, so feeding it kilograms may silently distort everything.
Changing a number that also drives PR detection on that footing is not
justified. Revisit with real logged data, or if the paper's units are confirmed.

**Discarding sets above 12 reps.** Planned, then killed by measurement: a
constant bias cancels in a trend (98% of the true gain recovered at a fixed 15
reps). It would have thrown away good data to solve a problem that does not
exist. Only *drift* matters, and drift is handled directly.

**Normalising the tonnage chart to 7 days.** Rejected on the merits and
confirmed by the user: it would punish a completed week that got spread out.

**A deload detector.** Explicitly refused by the user, who plans their own
deloads. Not built, and `TRAINING_LOGIC.md` states this at the top so a future
agent does not helpfully add one.

**Weighting sets by RPE reliability** and **swap tracking (before/after)** —
designed, justified by the research, not yet built.

### 6.7 Audit of the rebuild — three flaws it shipped with

The rebuilt engine was reviewed again before pushing, reading the code against
its own claims rather than trusting the write-up. Three real defects, two of
them serious.

**A. The scatter estimate collapsed to zero on the commonest shape of real
data.** Scatter was `1.4826 x MAD`. MAD is zero whenever half or more of the
residuals are zero — and Theil-Sen makes that likely, because its intercept is a
median and therefore pins the line through the middle of the points. Measured:

```
[70,130,75]                  MAD-scale 0.0   mean|resid| 19.2
[70,70,130,70]               MAD-scale 0.0   mean|resid| 15.0
[70,130,70,130,70]           MAD-scale 0.0   mean|resid| 24.0
[100,100,100,100,180,20]     MAD-scale 0.0   mean|resid| 26.7
```

The last is four sessions at one weight plus two outliers — *exactly* what a
stalled lift looks like in practice. A zero scatter made `underpowered` false,
so the verdict came out **FLAT, asserted**, on data ranging 20 to 180, and a
swap was suggested off the back of it. **The safety net the whole rewrite was
built around failed open on the common case.**

Fixed with `max(1.4826 x MAD, 1.2533 x mean absolute residual)`. Both are
consistent estimators of sigma for normal noise, so they agree on clean data and
the max costs nothing; the mean-absolute form cannot collapse unless every point
lies exactly on the line. Verified: all four cases above now report
`underpowered`, and a genuinely motionless lift (identical every session) still
correctly reports scatter 0 and a confident *flat*.

**B. Three sessions could never produce a verdict, while the UI promised one
after three.** Mann-Kendall's S is capped at `n(n-1)/2`, so:

```
n    max S   max z    can ever clear Z_CRITICAL = 1.25?
3        3   1.044    NO — impossible
4        6   1.698    yes
5       10   2.205    yes
```

A perfect +30 kg climb across three sessions returned `real = false`. The
minimum is now **four**, named `MIN_SESSIONS_FOR_VERDICT` and reflected in the
UI copy. It is also the honest cut: a slope from three points leaves one degree
of freedom, which cannot support the scatter estimate the verdict depends on.

**C. Comments described an implementation that had been deleted.** The file
header, the `fitTrend` doc block and the `tStat` field all still described *"a
t-test on the fitted slope"* and *"|slope| / standard error of slope"*, from the
least-squares version that Theil-Sen replaced. `tStat` was typed
`number | null` and could never be null. In a codebase where the docs are the
contract, a stale comment is a defect — corrected, and the fact that
`typicalError` deliberately does **not** enter the practical threshold is now
stated explicitly, because the task description implied it did.

All three are covered by permanent tests in `returns.test.ts` under *"flaws
found auditing the rebuilt engine"*.

### 6.8 Small mistakes worth recording

- A JSX substitution list was written as `join('</span> or <span>')`, which
  would have rendered literal markup as text. Caught by reading the diff.
- `my` (a mean from the removed least-squares code) survived into the new
  version as an undefined reference. Caught by the test run, not by review.
- Two diagnosis tests used weights `40 + i`, which is genuine progress — the
  engine correctly refused to call it flat. **The fixtures were wrong, not the
  code.**
- A browser check searched for `"What's paying off"` and reported the section
  missing. CSS uppercases the heading, so `innerText` returns
  `"WHAT'S PAYING OFF"`. Nearly chased a rendering bug that did not exist.

---

## 7. Can machine learning fine-tune any of this?

Worth answering precisely, because the honest answer is "yes, but not where you
would expect, and not the parts that look like AI".

### Already machine learning, in the boring sense

The thresholds are **not hand-picked**. `Z_CRITICAL` came from a grid search
over simulated populations, scored against known ground truth. That is
hyperparameter optimisation. The load model in `loadModel.ts` is a weighted
least-squares fit with exponential recency decay — a learned per-user model. The
useful framing is not "should we add ML" but "which estimator is right for the
sample size we have".

### Where a model would genuinely help

**1. Partial pooling across your lifts — the highest-value idea by far.**

The single biggest limitation is that a genuinely progressing lift is caught
only ~48% of the time from 4-9 sessions. That is because **every lift is fitted
in isolation**, and 6 noisy points cannot support a confident slope.

But your lifts are not independent. If you are progressing on five of six, the
sixth is *a priori* more likely to be progressing too. A hierarchical
(multilevel) model shares strength across lifts: each lift gets its own slope,
shrunk toward your overall trend by an amount the data decides. Lifts with lots
of clean sessions barely move; noisy ones borrow heavily from the rest.

This is the standard answer to exactly our problem — many related series, few
observations each — and it typically buys the equivalent of several extra
sessions per lift. It is a few hundred lines, needs no training infrastructure,
and runs on-device.

**2. Learning your noise structure rather than assuming it.**

The calibration assumes Gaussian, independent session-to-session noise. Real
noise is probably **autocorrelated** — a bad *week*, not a bad *day* — and
skewed, since sessions fail worse than they succeed. Estimating that structure
from your own history would sharpen every threshold. Known weakness #11 in
`TRAINING_LOGIC.md`.

**3. A personal load-rep curve instead of Epley.**

The right resolution of the e1RM question is not to adopt someone else's
equation but to fit **your own** exponent per lift. This is the same move
`loadModel.ts` already makes for kilos-per-RPE, applied to the rep axis. It also
sidesteps the kg/lb ambiguity entirely, because your data defines the units.
Needs a few hundred sets on a lift.

**4. Change-point detection.**

One slope over 90 days assumes one regime. Real training has blocks, deloads and
injuries. Segmented regression would answer "when did this stop working?" rather
than "what was the average over three months?" — a better question.

### Where it would not help, and should be resisted

**The signal-to-noise problem is information-theoretic, not algorithmic.** With
four sessions and 6% noise you cannot reliably detect a 10% gain. No model
creates information that is not in the data. A neural network here would produce
*confident-looking* output at exactly the same true accuracy, which is strictly
worse than admitting uncertainty.

**Data volume is off by orders of magnitude.** One lifter generates a few
thousand sets a year. That is enough for a dozen regression coefficients, not
for a learned model with millions of parameters, which would memorise the
history rather than generalise from it.

**Explainability is a feature, not a nicety.** *"Your sets averaged RPE 7.2, so
push closer before swapping"* is actionable. *"The model assigns 0.31"* is not,
and the user cannot audit it. Every number this app shows can be traced to a
rule stated in these docs.

### Recommendation

**Partial pooling (#1)**, as a Bayesian hierarchical model over the lifts in the
current block. It attacks the exact weakness the backtest exposed, it is
tractable on-device, and it keeps every output explainable. Everything else on
this list is worth less than that one change.

---

## 8. Independent verification — checking we are not fooling ourselves

Everything above is reasoning about code, and code can pass its own tests while
being wrong, because a test that computes its expectation *using the function
under test* proves nothing. This section is the arithmetic that does not depend
on any of it.

**Determinism.** The suite was run five consecutive times: 301 passed, identical
every run. The backtests use a seeded LCG, so their numbers are reproducible
rather than fresh random draws each time.

**Every constant re-derived from its definition**, in a script importing nothing
from the app:

| Constant | Claimed to be | Independently derived | Result |
| --- | --- | --- | --- |
| `1.4826` | `1 / Φ⁻¹(0.75)` | Φ⁻¹(0.75) = 0.6744897501960817 → 1.4826 | match |
| `1.2533` | `√(π/2)` | 1.2533141... | match |
| Mann-Kendall `Var(S)` | `n(n−1)(2n+5)/18` | exhaustive enumeration of **all permutations** at n = 3,4,5,6 | match at every n |
| max z at n=3 | 1.0445 | `(3−1)/√(66/18)` | match — confirms four sessions is the true minimum |
| `DRIFT_PER_REP` | 0.0067 | 90th percentile recomputed from the rep-max table | 0.667% |
| Epley inversion | exact | invert then re-apply at three loads | exact to 1e-6 |

Verifying `Var(S)` by enumerating every permutation matters: it confirms the
textbook formula is being applied correctly rather than merely being quoted,
which is precisely where a plausible-looking mistake would hide.

**Outputs re-derived by hand and compared to the app.** Four cases, computed
externally from the pairwise-slope definition:

| Case | Hand | App | |
| --- | --- | --- | --- |
| outlier fixture, Theil-Sen gain | 39.9 kg | 39.9 kg | match |
| linear 100→130 kg: gain / sets / per-10-sets | 40.0 / 12 / 33.3 | 40.0 / 12 / 33.3 | match |
| no rep drift → threshold | 2.5 (floor) | 2.5 | match |
| drift of 6 reps at level 133.3 → threshold | 5.4 | 5.4 | match |

The same script also confirmed that least squares would have reported a slope of
**0.212 kg/day against Theil-Sen's 0.676** on the outlier fixture — the exact
failure that motivated the change, measured rather than asserted.

**A characteristic this surfaced, now tested explicitly.** On that fixture the
*estimate* is robust (+39.9 kg) but the *confidence* correctly is not: one late
reversal makes 3 of 10 ordered pairs disagree, giving Z = 0.73, under threshold.
So the lift reports **"cannot tell"** rather than a decline — and no swap is
suggested. At five sessions one bad day costs the verdict; by eight it is
absorbed. The test that covers this used to be named as though it asserted
continued progress, which over-promised; it now asserts both halves.

**Citations re-checked at source**, not from memory. The claim the diagnosis
ordering rests on is verbatim from the conference summary: *"Exercise selection
can be flexible, whereas training program variables including weekly sets,
volume-load, rest interval duration, and training proximity to failure
meaningfully influence hypertrophic outcomes in the general population."* The
average-versus-best finding is confirmed too: *"MDCs were generally smaller for
average than best values."* `RPE_SHORTFALL = 1.5` sits inside the reported 1–2
rep under-prediction band for experienced lifters.

**What this does not prove.** The calibration still rests on *simulated* lifters
with Gaussian, independent noise. Real session-to-session variation is likely
autocorrelated (a bad week, not a bad day) and skewed. The arithmetic is
verified; the population model is an assumption, and it is known weakness #11.

---

## 9. Overfitting audit — was the threshold fitted to its own test data?

`Z_CRITICAL` was chosen by sweeping against simulated lifters, then scored
against those same lifters. Tune on the data, report on the data — the classic
way to publish a flattering number. Tested three ways afterwards
(`strength.holdout.test.ts`).

**Not overfitted to the seeds.** Five unseen draws reproduce the tuning run to
within four points — 39% caught and 13% false alarm, against the tuned
41% / 11%. Seed-to-seed spread was 4 points.

**Not a knife edge.** 1.15 / 1.25 / 1.35 give 41 / 41 / 39% caught and
14 / 14 / 12% false. The choice sits on a plateau, so its exact value is not
load-bearing — which is the property you want from a tuned constant.

**Survives regimes it never saw.** Noise 2%-15%, true gains 3%-30%, 4 to 20
sessions, rep drift up to 8: false alarms stayed between **8% and 20%**
throughout.

**But it IS fitted to an assumption, and the assumption is false.**
Mann-Kendall requires independent observations. Training is not: a bad *week*
makes consecutive sessions sag together, and a run that drifts together looks
monotone — exactly what the test counts.

| noise shape | false alarm |
| --- | --- |
| independent (the tuning regime) | 13% |
| **autocorrelated, AR(1)** | **35%** |
| skewed | 21% |

**A fix was implemented and then deleted.** The textbook remedy is to widen the
variance by the series' own autocorrelation. Measured, it did nothing:

| n | lag-1 measured | variance inflation | false alarm |
| --- | --- | --- | --- |
| 6 | 0.03 | 1.07× | 33% |
| 12 | 0.23 | 1.61× | 34% |
| 20 | 0.40 | 2.31× | 30% |

Two reasons. Estimating lag-1 from residuals is self-defeating — removing the
fitted trend removes the correlation with it, and at n = 6 the estimate came out
**negative (−0.18) against a true 0.70**. And as n rises the inflation rises,
but so does the raw statistic, and they cancel.

**Deleting it was the right call.** A correction that does not correct is worse
than none, because it looks like the problem is handled — and this log already
argues that a mechanism which cannot be shown to earn its place should not
ship. The failure is now asserted at its *measured* size in the hold-out test
(autocorrelated must stay between 25% and 45%), so a regression surfaces as a
failing test rather than as quietly worse advice.

**What a user should take from it.** If your bad patches last weeks rather than
days, roughly one flat lift in three could be mislabelled. Known weakness #11,
now with a number attached instead of a hedge.

---

## 10. Fuzzing the whole app — three crashes nobody had hit yet

After the block report went in, the same fuzz approach that had found two
crashes in the innovation modules was pointed at the rest of the app: every
combination of malformed weight / reps / RPE, plus structural nasties (no
sessions, no entries, unparseable dates, sessions sharing one instant, missing
fields, 1e308 loads) and broken program shapes, across volume, the store,
recovery, nutrition, streaks, habits and Kairos.

It found **`weekAdherence` throwing on a program whose `weeks` or `days` was
missing** — the same class of bug as before, but this time in the **core store
rather than the new code**, and worse: `weekAdherence` is called from the
Progress screen on every render, so a throw there **blanks the whole page**
instead of losing one number.

Reachable for the same reason as the others: the program is persisted to
localStorage and restored verbatim, so a partial write, an older schema or a bad
sync produces exactly that shape.

The sweep is now permanent (`src/app-robustness.test.ts`) and asserts two
things: nothing throws, and no NaN or Infinity reaches a field the UI renders.

**The lesson worth keeping.** Three of the five crashes found in this whole
project came from the same root — traversing the persisted program object
without guarding every level. Passing tests said nothing about it, because tests
supply well-formed fixtures. Fuzzing is the only thing that found any of them.

---

## 11. The UI/UX audit — and the bug the screenshots found

Triggered by six screenshots taken on the owner's own phone, after a measured
audit of the Progress tab on an emulated 390x844 viewport. The emulator found
layout and contrast problems. The real screenshots found a **correctness** bug
that the emulator had missed, because the emulated fixture always seeded whole
weeks and the real device was one session into week 3.

### 11.1 Volume IQ was judging a week that had not happened yet

The screen read:

> **Week 3 · Build: 12 under-trained.**
> Back — 6.5 sets/wk — BELOW MEV — *Add ~4 sets/wk to actually drive growth.*

One of eight prescribed sessions had been logged. So one eighth of the week's
work had genuinely been done, and every muscle was "short" of a whole week's
landmark by construction. Twelve of thirteen muscles were being told to add
sets, on the second day of a training week, by arithmetic rather than by
anything about the training.

This is the same class of error as the chart bug in §2 — comparing a partial
week against finished ones — in the one place it had not been fixed.

**Two fixes were considered and one rejected.**

*Rejected: project the partial week forward.* Multiply what has been logged by
`daysPlanned / daysDone`. This is what the tonnage chart does, and it works
there because tonnage is one aggregate number that accumulates evenly. Per
muscle it fails badly: one push day scaled by eight puts chest at 8x its true
rate and reports **over MRV — cut back**. Trading a false "under-trained" for a
false "over-trained" is not an improvement; it is the same mistake with the
sign flipped.

*Adopted: do not judge an unfinished week at all.* A program week becomes
readable when it is finished. `analyzeVolume` now takes the program (optionally,
so every existing caller is unaffected), counts logged days against prescribed
days for the newest week, and:

- **week unfinished, a complete week behind it** → analyse the last complete
  week, and say plainly which week is still running:
  *"Week 3 · Build is 1 of 8 days in — it'll be read once you finish it."*
- **week unfinished, nothing complete behind it** → show the sets logged so far,
  flagged `provisional`; the UI withholds every status badge and every
  "add N sets" line, and the headline states what was logged instead of naming
  a shortfall.
- **week finished** → exactly as before.

Verified end to end in the browser against the real Pure Bodybuilding program.
With week 3 one day in, the card now reads **"Week 2 · Build: 4 under-trained,
9 dialed in"** — the last week that actually finished — rather than
**"Week 3 · Build: 12 under-trained"**. Four tests cover the three branches plus
the no-program path.

### 11.2 The header had no background at all

`bg-background/80` on the sticky header computed to `rgba(0, 0, 0, 0)`.
Tailwind v3 cannot apply an `/opacity` modifier to a `var()` colour — a fact
already written down in `tailwind.config.js`, and violated in four places
including the fixed workout footer. Only `backdrop-blur-xl` separated the header
from the page, and a blur does not hide white text at full opacity: screenshots
show a lift name and a status badge colliding with the app title.

Replaced with a `.glass-bar` utility using `color-mix(in srgb, var(--bg) 96%,
transparent)` and an opaque fallback under `@supports not (backdrop-filter)`.
Measured after the fix: text scrolled under the bar renders at **1.10:1**
against the background — the same as empty page.

**This fix was incomplete** — see §11.7. The same construct existed under three
other colour names (`--sidebar`, `--surface`) in the Liftoff top nav, the mobile
header and the mobile bottom tab bar. Grepping for the one string that had
already been found, rather than for the pattern, missed all three.

### 11.3 Placeholder slots were being reported as achievements

`isPlaceholderExercise()` existed and was used by the volume audit, but neither
`returns.ts` nor `blockReport.ts` called it. So the block's headline read:

> **BIGGEST GAIN — Weak Point Exercise 2 (optional), +13.6 kg estimated 1RM**

The number is real; the name is a blank slot in the sheet. It cannot be
repeated, swapped, or acted on. Placeholders are now excluded from the ledger,
from PR chips, and from the lift count — while their sets still count towards
tonnage and volume, because that work was done.

### 11.4 Everything else, measured

| Finding | Measured before | After |
| --- | --- | --- |
| Section headings and secondary copy | 2.6–3.0:1 in all four themes | ≥4.6:1, muted/subtle gap preserved |
| Tab strip | 544px of tabs in a 390px viewport; "Programs" invisible, selected pill clipped | edge-fade mask + active tab scrolled into view |
| Text under 11px | 38 elements (incl. 9px chart axis labels) | none |
| Tap targets under 44px | 14 | all real controls at 44px, via a `.tap-44` overlay that keeps the drawn size |
| Unlabelled inputs | 2 | none |
| Truncated titles | "Week 2 · Build · Pull #2 (Mid-Bac…" | week name removed from the title (it was repeated in the picker below); day names wrap |
| Chart axis labels | drawn under the series; "45 s" struck through by the line | drawn last, with a halo |
| PR chips | "SNATCH-GRIP RDL 98 E1RM" — no separator, no unit | "Snatch-Grip RDL · 98 kg e1RM", sentence case |
| Progress section order | block report 2.8 screens down, below a breath-hold timer and a weight logger | analytics first, data entry last |
| Volume IQ intro | 379 characters before any data | one line, with the rest behind "How this is counted" |
| "Remove API key" | bare grey text, no confirmation | labelled destructive button with a confirm |
| A dash tinted as a warning | `tone` read off `pct = 0` before checking `total > 0` | guarded |

### 11.5 What was NOT changed, and why

- **The inline link `aistudio.google.com/apikey` is 178x20.** WCAG 2.5.8
  explicitly exempts links inline in a sentence; enlarging it would break the
  paragraph it sits in.
- **The tab strip still scrolls.** Five tabs cannot fit 390px at a legible size.
  The fix makes the overflow visible and guarantees the selected tab is on
  screen, rather than pretending the strip fits.
- **The volume landmarks, the program, and deload handling are untouched.** The
  program is read exactly as the sheet authors it, and the app still never
  infers a deload.

---


### 11.6 "What if I end early, or skip a workout?" — the follow-up that found a second bug

Asked immediately after 11.1 shipped, and it was the right question: the rule in
11.1 keys off *"has this week finished?"*, so anything that stops a week from
ever finishing was a live risk. Five interruption patterns were simulated
against the real engine rather than reasoned about.

| What the lifter does | What the app did | Verdict |
| --- | --- | --- |
| Ends a workout early (2 sets instead of 12) | day still counts as done, week completes normally | fine — `completionMap` keys on `completedAt`, not on how much was logged |
| Pauses mid-workout and comes back | draft is not a session; nothing counts until finished | fine |
| Skips a day, then starts the next week | the short week is read as soon as a newer week exists | fine |
| **Skips a day and stops there** | **stuck on the PREVIOUS week, permanently** | **bug** |
| **Abandons a week after one session** | **stuck on the PREVIOUS week, permanently** | **bug** |

The last two are the same failure: a week that will never be finished waits
forever to be finished, and while it waits the card reports the week *before*
it. Three logged sessions of real training become permanently invisible. Worse
than the bug in 11.1, because 11.1 at least corrected itself once the week
completed — this one had no exit.

**Fix: "in progress" expires.** A week stops being treated as live once it has
had one full microcycle plus `WEEK_GRACE_DAYS = 7` of grace. After that,
whatever is in it is what happened, and it is read as the current window.

Why that shape, and what was rejected:

- **Rejected: a percentage threshold** ("judge it once 75% of the days are
  done"). Invents a constant with nothing behind it, and still strands the
  abandoned-after-one-session case forever.
- **Rejected: time since the last session in the week.** Cannot work — the
  analyser anchors to the newest session in the log, so an abandoned week's
  "time since" never grows. This needed real wall-clock time, so `analyzeVolume`
  now takes an optional `now`, matching `liftReturns` and `blockReport`.
- **Adopted: one microcycle plus a calendar week.** The cycle length is already
  measured from the lifter's own finished weeks (`microcycleDays`), so the rule
  self-calibrates to whoever is using it — nothing is hardcoded to Pure
  Bodybuilding. The 7-day grace is generous enough that illness or travel does
  not change the reading underneath a real, slow week, and short enough that an
  abandoned one resolves on its own.

Measured after the fix, on a week left at 3 of 4 days: **one day later** it
still shows the last complete week (you might yet finish it); **thirty days
later** it reads the short week itself, with the pending note gone. A genuinely
slow week five days past its last session is untouched.

**The tonnage chart had the identical bug.** `latestInProgress` in
`Progress.tsx` tested only `done < total`, so an abandoned week kept its final
point dashed and captioned *"day 3 of 4 · on pace for 92 t"* — a forecast for a
week that ended months ago. Same expiry now applies to both, so the chart and
the volume card can never disagree about whether a week is still running.

Five permanent tests cover the five patterns above.

**Performance, since it was asked in the same breath.** Measured on two years of
training (160 sessions, 3,840 logged sets, 20 program weeks):

| | |
| --- | --- |
| `analyzeVolume` without the program (old path) | 3.73 ms |
| `analyzeVolume` with the program (new path) | 3.27 ms |
| `liftReturns` | 0.10 ms |
| `blockReport` | 35 ms |

The new work is a day count per week and one date comparison — below the noise
floor. `blockReport` is the expensive one and always was; it is memoised on
`[sessions, program]`, so it runs when the data changes, not on every render.

### 11.7 Second look — what the first pass got wrong

Asked to step back and re-examine everything as new, on the grounds that more
bugs existed. They did, and most of them were in code written in 11.1-11.6. Two
claims from the earlier pass also turned out to be wrong and are corrected here
rather than quietly dropped.

**Bugs found in the fixes themselves**

| Found | Cause | Fix |
| --- | --- | --- |
| The star and the pencil on every workout row stole each other's taps | `.tap-44` centres an invisible 44px overlay on a 32px button; at an 8px gap the two overlays crossed by 4px, and the later-painted one won | row gap 8px -> 12px, putting the centres exactly 44px apart so the targets meet without overlapping |
| A provisional week listed muscles in an order nothing explained — Back with 10 sets below Glutes with 1 | rows are sorted by status severity, and 11.1 hid the status badge without changing the sort | provisional weeks sort by sets done, descending |
| "1 sets so far" | no pluralisation on the provisional label | pluralised |
| "Not trained (Week 1 · Build) — QUADS, CALVES" two days into an eight-day week | the same error 11.1 exists to prevent, one section lower: leg day had not come round yet | reads "Not trained yet" while the week is provisional |
| The Liftoff top nav, the mobile header and **the mobile bottom tab bar** had no background | `bg-[var(--sidebar)]/85`, `bg-[var(--surface)]/85`, `bg-[var(--surface)]/90` — the identical Tailwind-v3 construct from 11.2, in colours 11.2 did not grep for | `.glass-bar` now takes a `--glass` override; all four sites converted. A repo-wide grep for `bg-[var(--*)]/` returns nothing |

The last one is the lesson: 11.2 fixed `bg-background/80` and stopped there,
having "found the bug". The same defect existed four more times under three
other colour names, including on the bottom navigation of the mobile shell.

**Two corrections to the previous pass**

1. *"Switching tabs jumps the page to the top — caused by my `scrollIntoView`."*
   **Wrong.** Removing `scrollIntoView` did not change it: scroll is already 0
   within 60 ms of the click, before any smooth scroll could animate. The real
   cause is the content swap briefly shortening the page so the browser clamps
   the scroll offset. Pre-existing, and arguably wanted — you land at the top of
   the tab you opened. The replacement (scroll the strip sideways, never the
   page) is still the better code and was kept, but it fixed a latent problem,
   not the observed one.
2. *Contrast failures reported against `document.body`.* Measuring against the
   body's colour rather than the nearest painted background inflated the count.
   Re-measured properly, "Preview client page" at a reported 1.00:1 is an accent
   on its own 10%-alpha tint over white — really about 3.9:1. Reporting it as
   1.00:1 would have been a fabricated defect.

**Checked and found clean** (worth recording so it is not re-checked blindly):
a brand-new account with no data on all five tabs — no crashes, no `NaN`,
`undefined` or `[object Object]` leaking into the UI; the diary's gradient
headings, which register as 1.1:1 because `color` is transparent under
`background-clip: text` — a false positive, not a defect; and placeholder text,
which the token change lifted from 1.55:1 to 1.98:1, still nowhere near the
17.85:1 of real entered text, so the "a placeholder must not read as a value"
rule in `index.css` still holds.

**Known and deliberately not changed**

- The Focus active nav label sits at **3.64:1** — it is `--cozy`, a brand
  coral, at 11px. Fixing it means changing the workspace's identity colour,
  which is the owner's call, not a silent edit.
- The "Supabase isn't configured" warning is **2.80:1** in light mode. Real, but
  it only appears when the environment is misconfigured.

## 12. Getting the CO2 nudge to a phone that is switched off

§11 built the morning nudge; this made it arrive. The in-app reminder could only
fire while a tab was alive, which is the one situation a 09:30 reminder is not
in: the app is shut and the phone is in a pocket. It arrived on the next open
*inside* the window, which on most mornings meant not at all.

`supabase/functions/send-co2-nudge/index.ts`, on a 5-minute `pg_cron`, pushing
through the VAPID setup that already existed for task reminders.

### 12.1 The server does not know when your morning is

The window is local — 09:30 to 11:00 where you are — and the sender runs on UTC.
Nothing in the database said where any device was.

The zone is now stored **per subscription, not per account** (`push_subscriptions
.time_zone`), written on subscribe and refreshed on every app open. The phone is
the thing that buzzes, so a phone that flies somewhere starts nudging on the new
local morning the first time Liftoff is opened there. No setting, no prompt.

A subscription with no zone yet is **skipped and counted**, never assumed to be
UTC. Guessing would buzz someone at 3am; skipping self-heals on the next open,
and the response reports `missingZone` so the cause is visible rather than
mysterious.

### 12.2 The de-dup key has to carry the zone

The obvious ledger key is (user, local day, slot). It is wrong, and the way it is
wrong is easy to miss: two devices belonging to one person in two countries are
in genuinely different mornings, but their local *date strings* are usually the
same. Whichever fired first would claim the key and silence the other for the
rest of the day.

The key is (user, **zone**, local day, slot), and it is **claimed before
sending**. Claiming after would turn any provider blip into a loop that re-sends
every 5 minutes for 90 minutes. Both are asserted by tests that fail when the
behaviour is reverted (see 12.5).

### 12.3 Five minutes, and five minutes of grace

The cron runs every 5 minutes, not every minute. The window is 90 minutes long
and the ledger makes overlapping ticks harmless, so a minute of precision buys
nothing and costs 288 extra invocations a day. Five also divides every real UTC
offset — including the 30-minute ones (India, Adelaide) and the 45-minute ones
(Nepal, Chatham) — so 09:30 local is always a tick the cron lands on.

The sender allows 5 minutes of grace past 11:00, because without it a tick that
ran late would drop the last call silently. The grace cannot produce a fifth
nudge: the slot index is unchanged for the whole half hour after 11:00, and the
slot is part of the key. A minute-by-minute sweep asserts exactly four.

### 12.4 One rule, two runtimes

The Edge Function is deployed by pasting one file into the Supabase dashboard, so
it cannot import from `src/`. The scheduling rule therefore exists twice — the
classic way a reminder ends up firing at the right hour in the browser and the
wrong hour on a phone, invisible in review and noticed only in bed.

It is written once in `src/afterburn/innovation/co2Server.ts`, copied verbatim by
`scripts/sync-co2-shared.mjs`, and `co2ServerParity.test.ts` fails the build if
the two differ by a character. The parity test re-implements the extraction
rather than importing it from the script: a check that shares its parser with the
tool it checks agrees with that tool even when both are wrong.

The rule was also rewritten to take a zone and an instant instead of reading the
clock, which is what made DST, half-hour offsets and travel testable rather than
hoped-for. One test hands the browser rule and the server rule the same instant
and requires identical wording, so the screen and the push can never disagree.

### 12.5 Testing an Edge Function that cannot be run

Everything that can actually go wrong here lives in the orchestration, not the
arithmetic, and none of it is reachable from a unit test of the schedule.

So vitest aliases the function's `npm:` specifiers to in-memory fakes
(`src/test/stubs/`) and the test imports **the real file** — the exact bytes that
get pasted into the dashboard — stubs `Deno.serve` to capture the handler, and
drives whole requests against a fake Postgres that enforces the migration's
primary keys. 22 tests cover two phones in two countries, five overlapping cron
ticks in one slot, a reading logged mid-window, a dead subscription, a database
that refuses, and test mode leaving no trace.

Three mutations were introduced deliberately to check the tests have teeth, and
each was caught by exactly the test that should have caught it:

| Mutation | Caught by |
| --- | --- |
| zone dropped from the de-dup key | *does not let a phone in one country silence a phone in another* |
| missing zone defaulted to UTC | *skips a subscription with no timezone rather than guessing UTC* |
| cron grace removed | *still delivers the 11:00 last call when a tick runs 4 minutes late* |

### 12.6 The bug the browser found

Tapping the banner **from Focus** landed on the Programs tab, not the test.

The banner switched workspace and then dispatched `afterburn:open-co2`
immediately — but in Focus the whole Afterburn tree is lazy and unmounted, so
nothing was listening. The event went nowhere. This is the third time in this
feature that the same shape of bug has appeared: code that raises an intent runs
before the code that handles it exists. It passed every unit test, and it was
only visible by driving a real browser and reading which tab came up.

Both paths now latch the intent (`deepLink.ts`) rather than shouting it: the URL
one for a tapped notification, the in-app one for the banner. The URL flag is
stripped from the address bar on the way through, or a refresh next Tuesday
reopens the test.

### 12.7 Only one notification

With push on, the server sends the nudge whether the app is open or shut — so the
client raising its own OS notification would put a duplicate card in the shade.
The client now suppresses its copy when a subscription exists and draws only the
in-app banner, which is the one thing push cannot do. Both use the same
notification tag as a second line of defence, and `push-sw.js` sets `renotify` so
a replacing notification still alerts (without it, the 10:00 nudge would silently
overwrite the 09:30 one and the reminder would appear to have stopped).

Verified in a browser across 12 combinations of time, workspace and subscription
state: banner counts and OS notification counts both as intended, and nothing at
all once the test is logged.

### 12.8 What is still weak

- A laptop left at home nudges on its own morning too. Arguably it should not.
- `missingZone` is invisible in the app — a device that has not been opened since
  the migration will not be nudged and nothing says so.
- The server trusts `workout_data.recovery` for "already logged". Sync is about a
  second behind logging, so a nudge could in principle be sent in that gap.
- The grace is 5 minutes because the cron is. Change one and the other has to
  change too; only a comment says so.
- **iOS delivers web push only to a PWA installed to the Home Screen.** In a
  plain Safari tab there is no push at all and the in-app nudge is the only path.

## 13. Code Recall — putting the engine in front of the session

Every engine in this log reports on training that is already over. The volume
card, the returns ledger, the block report: all retrospective, none of it in
front of the lifter at the one moment it could change what they do.

`codeRecall` in `innovation/codeRecall.ts`, drawn at the top of the Workout tab.

### 13.1 The signal that had never been read

Every logged set carries a 1-5 star `rating`. Grepping for who consumed it found
exactly two places — the widget that writes it, and the History row that prints
it back. **Nothing had ever analysed it.** It had been collected for months and
thrown away.

It is the only subjective channel separate from RPE, and that separation is what
makes it worth having. RPE says how hard a set was; the rating says how well it
went. They come apart in both directions and each direction is a different
instruction — and one of them is the opposite of what a load-only engine would
say. A lift at the prescribed RPE that keeps rating one star is an execution
problem: adding weight is the single thing that cannot help it, and adding weight
is precisely what the RPE gap alone would have recommended.

Thresholds (≤2.5★ mean, ≥60% of sets ≤2★, over ≥4 sets and ≥2 sessions) are
judgement, not measurement. There is no ground truth for what a star means, so
they were set conservatively — the cost of a missed cue is nothing, and the cost
of a wrong one is that every other cue stops being believed.

### 13.2 Refusing is the feature

Half of `codeRecall.test.ts` asserts silence. Each rule has an explicit refusal:
a readiness reading over 36 hours old, fewer than four rated sets, no target RPE
on the sheet, a day the lifter marked rough, a provisional volume report, an
expired note.

The reasoning: three cues appear every session whether or not there is anything
to say, so any rule willing to fire on thin evidence will fire *often*, and the
lifter learns to skip the card. One wrong cue costs more than ten missing ones.

Six mutations were introduced to check the refusals have teeth. Each was caught
by exactly the test that should have caught it:

| Mutation | Caught by |
| --- | --- |
| readiness staleness check removed | *refuses to quote a stale reading* |
| unrated sets counted as zero stars | *ignores unrated sets rather than counting them as zero stars* |
| rough days no longer skipped for the load cue | *ignores a day the lifter marked rough* |
| future-dated sessions allowed through | *reads nothing from the future* |
| one session allowed to be a rating "pattern" | *needs a pattern, not one bad day* |
| the four-set minimum relaxed to two | *needs a pattern, not one bad day* |
| the note veto on add-load cues removed | *vetoes the load cue on a lift whose note did not win the slot* |
| the pain-negation guard removed | *does not read a clean bill of health as an injury* |

The last two initially both survived: the original test could not tell the two
guards apart, because its fixture failed the set count and the session count at
the same time. A case with four poor sets in a **single** session separates them.

### 13.3 Two bugs the rules found in the shared history

- **Malformed sessions crashed the brief.** Fuzzing had already found `entries`
  and `sets` arriving undefined from a restored backup, and every engine
  downstream (`analyzeVolume`, `liftReturns`, `sessionPoints`) indexes into them
  without asking. Code Recall is the first thing to touch all of them at once, so
  it cleans the history at the door — one guard instead of thirty.
- **A future-dated session was briefed on.** Clock skew or a hand-edited backup
  could produce a cue about a workout that had not happened. Note recall already
  refused this; the two must not disagree. Now dropped in the same sanitiser.

### 13.3b Letting the notes steer

Note recall (§7b of TRAINING_LOGIC) resurfaced notes verbatim. That is useful and
it is not the same as letting them influence anything.

The motivating case: a lift logged at RPE 6, rated five stars, with a note saying
the shoulder pinched. The RPE gap says add weight. The star ratings say add
weight. Both are wrong, and no amount of numeric evidence can see why.

Notes are now read for five signals (pain, failure, form, set-up, positive), and
**pain and failure veto every add-load cue on that lift** — the load rule and the
rating rule both check it before recommending more weight. A pain note also sorts
at priority 14, above both.

Two lexicon decisions worth challenging:

- *"Sore", "tight" and "stiff" are deliberately not pain.* They are what people
  write after every hard session, and including them would veto a load increase
  almost every time — the most valuable cue in the engine would stop firing.
- *Negation is guarded in both word orders.* "No pain today" and "shoulder pain
  free at last" must not read as injuries. This was caught by a test, not by
  design: the first pass only handled the negation-first form, so the single best
  note a lifter can write was being treated as the worst.

The veto is not redundant with the one-cue-per-lift rule, though it looks it. A
brief holds one note cue; when two lifts both carry pain notes, only one gets the
slot, and without the explicit veto the other would still be offered a load
increase. That is the case the regression test pins.

### 13.4 Motivation, measured or absent

The brief asked for "something motivational". The honest reading of that is a
number the lifter earned, not a sentence the app composed.

Amabile and Kramer (~12,000 diary entries, 238 people) found progress in
meaningful work to be the single largest lifter of motivation, ahead of
recognition and incentives. Bandura puts mastery experience above every other
source of self-efficacy. Both say the same thing: quote their own result.

So the spark is a ranked ladder — a measured gain on a lift about to be trained,
then proximity to finishing the week (Kivetz et al., 948 coffee cards, ~20%
acceleration near a goal), then sessions completed lately, then — with nothing
measured yet — an implementation intention (Gollwitzer and Sheeran, 94 tests,
d = 0.65) telling the lifter the one thing that makes the *next* brief real.

There is deliberately no final rung. If none of those hold, nothing is shown.

### 13.5 A red suite found on the way

Two tests in `src/lib/habits.test.ts` were failing before any of this work
started, and reproduced with the branch stashed. `streakFromDays` walked back
from `new Date()` and took no `today` parameter, while the tests compared it
against a fixed Monday. They passed for a few days and went red on the Thursday.

Fixed the way every other engine here already works: an optional `today`,
defaulting to now. A regression test reads the same three logged days from four
vantage points, which also documents the grace-day behaviour in one place.

### 13.7 The zoomed-out review, and the three defects it found

A step-back audit of the feature within the hour of shipping it, done by running
it rather than reading it. Three defects, all mine, all invisible to the 76 tests
that had just passed.

**The card contradicted itself.** Under-recovered plus a lift under target
produced, on one screen: "hold your top sets a point below target and drop the
last set of each accessory", then "Incline DB Press has room — go up", then "take
every optional set on chest today". Each true alone; together, no instruction at
all. A veto existed for notes and had never been extended to readiness — the other
input that can overrule a number. Every add-work rule now asks permission, and
`under` refuses it; cues that reduce work still pass, because they agree with
autoregulating.

**The motivational line celebrated gains that had not happened.** It read the
first session against the last on `bestE1RM` — two endpoints of a noisy series —
while §5a of TRAINING_LOGIC refuses to call a gain without Theil-Sen and a
significance test. On loads of 24, 32, 33, 32, 33, 32, 33, 32 the fit reports
**0.00 kg** and the line announced **"you are 10.1 kg stronger"**. The most
embarrassing possible version of the "measured, or absent" principle: measured
badly, and therefore worse than absent. Now goes through `fitTrend` with
`real === true` and a four-session floor.

**The brief vanished at the moment it would be acted on.** `showLogger ? Logger :
ProgramView` — read the cue, tap Start, and the instruction leaves the screen
exactly as the weight is chosen. Minimising the draft brought it back, which
nobody would find. The logger now carries a collapsed one-liner.

Also sharpened in the same pass: the load rule acted on a single outing while the
rating rule next door demanded two sessions and four sets, so the previous outing
must now at least not contradict; "go up" gained the actual target weight from the
personal load model that the logger was already computing after the fact; and
`depth: 'thin'` — computed since the first commit and never surfaced — now says so.

**Checked and found fine:** performance, at 24 ms for a full brief over 150
sessions and 3,600 sets. Reported rather than optimised, because there was
nothing to optimise. A perf concern would have been easy to invent and false.

### 13.6 What is still weak

- **Three cues, one per kind, is arbitrary.** Two lifts can both be badly rated
  and only one gets named.
- **The rating thresholds are judgement.** Conservative, but unfitted — there is
  no data on what a star means to this lifter, or to any lifter.
- **A finished week gets no brief**, and neither does someone training only
  custom days: there is no "next in the cycle" to point at.
- **The order cue assumes exercise order is a choice.** On a fixed sheet, "spend
  your freshest sets on X" may mean reordering the day, which is a bigger
  suggestion than one line implies.
- **Nothing validates the advice against outcomes yet.** Every other engine here
  has a backtest; this one still has none. What changed is that it is now
  *possible*: the `cueOutcomes` ledger records whether each cue was followed,
  keyed so a session can be joined to it. The backtest itself is unwritten, and
  will stay unwritten until there are months of answers to fit against.
- **The feedback chips conflate two questions.** "Not useful" is answerable
  before the session; "did this" really only afterwards, and nothing asks you to
  come back and say so — so the ledger will be biased towards cues answered in
  the doorway.


## 14. Making the engine grade itself, and change itself

The prescription had been shipping for a while with nothing checking whether its
numbers were any good. Wiring that up is what turns a suggestion into something
with a track record — and it is also the only source of objective ground truth
this app has ever had, since every other engine here was calibrated against
simulated lifters.

### 14.1 Freeze, don't recompute

The obvious implementation is to replay today's engine over an old session and
score it. That is wrong in a way that would never show up: the model changes over
time, so you would be grading a number that was never displayed — and the score
would improve every time the engine did, for free.

So the prescription is written onto the session while it is open. The subtle part
is *when it stops moving*: it tracks the screen right up until the first set is
logged, then freezes forever. Before the first rep, swapping an exercise or adding
a set genuinely changes what the app is predicting, and the record should follow.
After it, a prediction edited with the result in hand is not a prediction.

### 14.2 The pruning trap

Grading matched prescription to result by position, which is wrong because
finishing a session drops the blank sets and closes the gap. Skip set 1, do sets
2 and 3, and set 1's prescription lines up against set 2's result — the engine
scored on a prediction it never made. Each prescribed row now carries the
`LoggedSet.id` it was written for; position survives only as the fallback for
records written before the field existed.

### 14.3 Walk-forward, or the number means nothing

A constant offset can always reduce error on the data it was computed from. Fit
the bias on everything, report the improvement, and you get a positive number
every time regardless of whether the correction would help going forward.

So: fit on the earlier sets, measure on the later ones the fit never saw, adopt
only if it wins there. The test that pins this builds a lift whose bias *reverses*
halfway through — pooled, the halves cancel to a bias of zero and a naive fit
would call it perfectly calibrated while it is wrong by 1.5 points in both
directions.

### 14.4 Two ways the loop eats itself

Both were found by reasoning about the feedback path rather than by a failing
test, and both would have looked fine indefinitely.

**Oscillation.** A correction that works drives later misses to zero. Pool those
with the biased sets that earned it and the measured bias halves; the correction
retracts; the bias comes back. Forever — with every individual step measured
correctly. Fixed by recording, on every graded set, the correction in force when
it was prescribed, and undoing it before fitting. The test asserts the pooled
median is 0.5 and would propose 0.985, against the 0.97 that is actually right.

**Runaway.** The factor recorded has to be the one that *reached the bar*. A −3%
shade on 40 kg is 38.8, which is 40 again on a 2.5 kg step. Record the request
rather than the result and the next fit subtracts an adjustment that never
happened, over-reads the remaining bias, and asks for more.

### 14.5 Two false statements, found only by looking

The suite was green and the card said, above three sets all reading 40 kg:

> Shaded down 3% … Later sets are eased off because that is what your own last
> 8 outings did.

Neither was true. The 3% had been rounded away, and the measured fade was too
small to survive the same rounding. Both claims are now keyed on the numbers
actually changing, and the correction names the weight it moved from rather than
a percentage that the plates may not have honoured.

This is the fourth time in this codebase a defect has been invisible to a green
suite and obvious on screen. The pattern is always the same: a sentence computed
from an input, printed beside a number computed from the same input *plus
rounding*.

### 14.6 Reporting what it left alone

The panel's headline is how many lifts it checked and **did not** change. That is
deliberate. "Changed 1 of 2 lifts and left 1 alone after checking" is a stronger
claim than any accuracy figure, because it is the sentence a system that was
quietly drifting could not say. Rejections stay in the log for the same reason —
a log containing only successes cannot be used to catch drift.

Adopted corrections are shown in the accent colour, not red-for-down and
green-for-up: a correction has no good or bad direction, and colouring half of
them as an alarm would misread them.

### 14.7 What is still weak

- **The counterfactual is modelled, not measured.** "What the miss would have
  been at another weight" assumes 3% per RPE point holds locally. Nobody
  re-lifted the set. Everything downstream inherits that assumption.
- **A coarse equipment step can absorb a correction entirely**, so the engine can
  be right about a lift and unable to act on it. Letting the lifter set the step
  per lift is the fix, and is already weakness #12.
- **Sets without an RPE do not grade**, which on this program quietly removes the
  last set of many exercises — often the hardest one.
- **Corrections key on the exercise name.** Swap to a variant and it starts over.
- **Nothing yet grades the grader.** The accuracy panel reports the engine's
  error; nothing reports whether the *accuracy panel* is well calibrated, and
  with a few dozen sets the trend split is a coarse instrument.

## Testing

```bash
npm test        # 632 tests, 41 files
```

Beyond unit tests, each behavioural claim in this log was checked against
seeded data in a real browser: the classifier over a full 8-day microcycle of
the actual program, the chart at 3-of-8 and 8-of-8 days, the habit streak at 12,
the double-progression hint with a dumbbell and a squat on one card, the hover
fix on touch and desktop contexts, and the ledger over a six-session block.

The backtests live in `src/afterburn/innovation/strength.backtest.test.ts` and
`strength.compare.test.ts` and are permanent — the second asserts that the new
engine invents fewer directions than the one it replaced, so that regression
cannot come back quietly.

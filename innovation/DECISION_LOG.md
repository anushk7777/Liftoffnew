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

## Testing

```bash
npm test        # 304 tests, 28 files
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

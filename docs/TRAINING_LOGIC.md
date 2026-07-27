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
| Personal load-per-RPE model | `src/afterburn/loadModel.ts` |
| Workout screen wiring | `src/afterburn/Afterburn.tsx` |

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
  off a single session. The cost is that a partially complete week reads low —
  which is honest, but can look alarming mid-cycle.
- *The window still resets each program week.* A rolling window was tried and
  reverted: two existing tests encoded the reset deliberately, it matches the UI
  copy, and it matches how a lifter thinks about a block.

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

`exerciseProgress` reads the whole lift as total volume across matched
positions, so one heavy set cannot hide two that fell.

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

## 5. Known weaknesses — start here

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

## Testing

`src/afterburn/{volume,classify,progression,loadModel}.test.ts` — the behavioural
claims above are covered, including the 11-day-cycle miscalibration, one rough
session barely moving the prescription, a sustained real drop still being
followed, every refusal case, and every exercise name the program can show.

```bash
npm test
```

// Afterburn recovery readiness — the CO2 tolerance test.
//
// Protocol (Andrew Huberman / Brian Mackenzie): a few relaxed breaths, then one
// full inhale, then exhale as slowly and controllably as possible — you time the
// EXHALE only, in seconds. A longer controlled exhale = better CO2 tolerance =
// a more parasympathetic, better-recovered nervous system. Tracking it daily
// gives a readiness signal: a score well below your own baseline flags
// under-recovery and a cue to autoregulate training. Pure + deterministic.
import type { RecoveryEntry } from './types';

export type RecoveryBand = 'poor' | 'moderate' | 'good' | 'excellent';

interface BandDef {
  band: RecoveryBand;
  min: number; // inclusive lower bound, seconds
  label: string;
  advice: string;
}

// Commonly-cited CO2 tolerance bands (seconds of controlled exhale).
const BANDS: BandDef[] = [
  { band: 'excellent', min: 60, label: 'Excellent', advice: 'Strong CO2 tolerance — your nervous system looks well-regulated. Train hard.' },
  { band: 'good', min: 40, label: 'Good', advice: 'Solid recovery state. Good to push your planned sessions.' },
  { band: 'moderate', min: 25, label: 'Moderate', advice: 'Average tolerance — fine to train, but keep an eye on sleep and stress.' },
  { band: 'poor', min: 0, label: 'Poor', advice: 'Low CO2 tolerance — high autonomic stress / under-recovered. Favour a lighter day.' },
];

/** Classify a CO2 tolerance score (seconds) into a recovery band. */
export function co2Band(score: number): { band: RecoveryBand; label: string; advice: string } {
  const b = BANDS.find((x) => score >= x.min) ?? BANDS[BANDS.length - 1];
  return { band: b.band, label: b.label, advice: b.advice };
}

export type ReadinessVerdict = 'recovered' | 'moderate' | 'under' | 'na';

export interface Readiness {
  latest: number | null; // most recent score
  latestDate: string | null;
  baseline: number | null; // rolling mean of prior entries (today excluded)
  band: RecoveryBand | null;
  deltaPct: number | null; // latest vs baseline, %
  verdict: ReadinessVerdict;
  advice: string;
}

/** Readiness from the most recent score vs the user's own rolling baseline.
 *  `under` when the latest band is poor, or the latest is materially below
 *  baseline (≲85%). Drives the logger's autoregulation banner. */
export function recoveryReadiness(entries: RecoveryEntry[], window = 14): Readiness {
  const valid = entries
    .filter((e) => Number.isFinite(e.co2Score) && e.co2Score > 0)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date)); // newest first
  if (valid.length === 0) {
    return { latest: null, latestDate: null, baseline: null, band: null, deltaPct: null, verdict: 'na', advice: 'Log a CO2 tolerance test to start tracking recovery.' };
  }
  const latest = valid[0];
  const { band } = co2Band(latest.co2Score);

  const priors = valid.slice(1, 1 + window).map((e) => e.co2Score);
  const baseline = priors.length ? priors.reduce((a, b) => a + b, 0) / priors.length : null;
  const deltaPct = baseline != null && baseline > 0 ? Math.round(((latest.co2Score - baseline) / baseline) * 100) : null;

  let verdict: ReadinessVerdict;
  if (band === 'poor' || (deltaPct != null && deltaPct <= -15)) verdict = 'under';
  else if (band === 'excellent' || band === 'good') verdict = deltaPct != null && deltaPct <= -10 ? 'moderate' : 'recovered';
  else verdict = 'moderate';

  const advice =
    verdict === 'under'
      ? 'Recovery looks low today — autoregulate: trim sets/RPE, rest longer, and stop a lift when speed or form drops. Prioritise sleep and stress.'
      : verdict === 'recovered'
        ? 'Recovery looks good — green light to train as planned.'
        : 'Recovery is okay — train as planned but listen to your body and don’t force grinder sets.';

  return { latest: latest.co2Score, latestDate: latest.date, baseline: baseline != null ? Math.round(baseline * 10) / 10 : null, band, deltaPct, verdict, advice };
}

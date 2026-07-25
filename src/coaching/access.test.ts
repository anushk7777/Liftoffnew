// The coach gate decides who sees the roster. It is the single check standing
// between "my clients" and "everyone", and when it silently returned false the
// whole coaching section vanished with no way to tell why — so it gets tests.
import { describe, it, expect } from 'vitest';
import { isCoach, COACH_EMAIL } from './api';

describe('isCoach', () => {
  it('accepts the configured coach address', () => {
    expect(isCoach(COACH_EMAIL)).toBe(true);
  });

  it('ignores case and surrounding whitespace', () => {
    expect(isCoach(COACH_EMAIL.toUpperCase())).toBe(true);
    expect(isCoach(`  ${COACH_EMAIL}  `)).toBe(true);
  });

  it('rejects every other account', () => {
    expect(isCoach('someone.else@gmail.com')).toBe(false);
    expect(isCoach('priya@example.com')).toBe(false);
  });

  it('rejects a missing or empty session email', () => {
    // The failure mode that hid the tab: no session yet, or auth errored out.
    expect(isCoach(null)).toBe(false);
    expect(isCoach('')).toBe(false);
    expect(isCoach('   ')).toBe(false);
  });

  it('does not match on a lookalike or substring address', () => {
    const [local, domain] = COACH_EMAIL.split('@');
    expect(isCoach(local)).toBe(false);
    expect(isCoach(`${local}@evil.com`)).toBe(false);
    expect(isCoach(`attacker+${local}@${domain}`)).toBe(false);
    expect(isCoach(`x${COACH_EMAIL}`)).toBe(false);
  });
});

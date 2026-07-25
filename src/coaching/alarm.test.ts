import { describe, it, expect, beforeEach } from 'vitest';
import { parseTime, alarmDue, markAlarmFired } from './alarm';

const at = (h: number, m: number) => new Date(2026, 6, 25, h, m, 0);

beforeEach(() => localStorage.clear());

describe('parseTime', () => {
  it('parses HH:MM', () => {
    expect(parseTime('07:30')).toBe(450);
    expect(parseTime('00:00')).toBe(0);
    expect(parseTime('23:59')).toBe(1439);
  });
  it('rejects nonsense', () => {
    expect(parseTime('25:00')).toBeNull();
    expect(parseTime('7:5')).toBeNull();
    expect(parseTime(null)).toBeNull();
    expect(parseTime('')).toBeNull();
  });
});

describe('alarmDue', () => {
  it('fires at the set time', () => {
    expect(alarmDue('07:30', at(7, 30))).toBe(true);
  });
  it('still fires if the app opens a few minutes late', () => {
    expect(alarmDue('07:30', at(7, 34))).toBe(true);
  });
  it('does not fire before the time, or long after', () => {
    expect(alarmDue('07:30', at(7, 29))).toBe(false);
    expect(alarmDue('07:30', at(7, 40))).toBe(false);
    expect(alarmDue('07:30', at(19, 30))).toBe(false);
  });
  it('only fires once per day', () => {
    expect(alarmDue('07:30', at(7, 30))).toBe(true);
    markAlarmFired(at(7, 30));
    expect(alarmDue('07:30', at(7, 32))).toBe(false);
  });
  it('is off when no time is set', () => {
    expect(alarmDue(null, at(7, 30))).toBe(false);
  });
});

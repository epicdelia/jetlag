import { describe, expect, it } from 'vitest';
import {
  isValidTimeZone,
  localDayNumber,
  localToUtc,
  offsetHours,
  parseHHmm,
  parseInstant,
  toIso,
  formatHHmm,
  DAY,
} from '../src/time';
import { normalize, intersect, subtract, splitAt } from '../src/intervals';
import { tminClockMinutes } from '../src/phase';

const day = (iso: string) => Date.parse(iso + 'T00:00:00Z') / DAY;

describe('time zones', () => {
  it('validates IANA names and rejects raw offsets / junk', () => {
    expect(isValidTimeZone('America/Toronto')).toBe(true);
    expect(isValidTimeZone('Asia/Kathmandu')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(isValidTimeZone('+05:00')).toBe(false);
    expect(isValidTimeZone('-0300')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(' Europe/London')).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
  });

  it('resolves offsets per instant, DST-correct, including :30 and :45 zones', () => {
    expect(offsetHours('America/Toronto', Date.parse('2026-07-01T12:00:00Z'))).toBe(-4);
    expect(offsetHours('America/Toronto', Date.parse('2026-12-01T12:00:00Z'))).toBe(-5);
    expect(offsetHours('Europe/London', Date.parse('2026-07-01T12:00:00Z'))).toBe(1);
    expect(offsetHours('Asia/Kolkata', Date.parse('2026-07-01T12:00:00Z'))).toBe(5.5);
    expect(offsetHours('Asia/Kathmandu', Date.parse('2026-07-01T12:00:00Z'))).toBe(5.75);
    expect(offsetHours('Australia/Sydney', Date.parse('2026-11-11T12:00:00Z'))).toBe(11);
    expect(offsetHours('Pacific/Kiritimati', Date.parse('2026-11-11T12:00:00Z'))).toBe(14);
    // exact transition instant: US fall-back 2026-11-01 06:00Z
    expect(offsetHours('America/New_York', Date.parse('2026-11-01T05:59:00Z'))).toBe(-4);
    expect(offsetHours('America/New_York', Date.parse('2026-11-01T06:00:00Z'))).toBe(-5);
  });

  it('converts local wall time to UTC; gap → later valid instant, overlap → first occurrence', () => {
    expect(toIso(localToUtc('America/Toronto', day('2026-11-10'), 23 * 60))).toBe('2026-11-11T04:00:00Z');
    expect(toIso(localToUtc('Europe/London', day('2026-07-10'), 21 * 60))).toBe('2026-07-10T20:00:00Z');
    // spring forward 2026-03-08 02:00 → 03:00 in New York: 02:30 does not exist
    expect(toIso(localToUtc('America/New_York', day('2026-03-08'), 150))).toBe('2026-03-08T07:30:00Z');
    // fall back 2026-11-01 02:00 → 01:00: 01:30 happens twice, take the first (EDT)
    expect(toIso(localToUtc('America/New_York', day('2026-11-01'), 90))).toBe('2026-11-01T05:30:00Z');
    // minutes roll over into the next day
    expect(toIso(localToUtc('UTC', day('2026-11-10'), 25 * 60))).toBe('2026-11-11T01:00:00Z');
  });

  it('computes local calendar dates across the date line', () => {
    const t = Date.parse('2026-11-11T10:00:00Z');
    expect(localDayNumber('Pacific/Honolulu', t)).toBe(day('2026-11-11'));
    expect(localDayNumber('Asia/Tokyo', t)).toBe(day('2026-11-11'));
    const u = Date.parse('2026-11-11T16:00:00Z');
    expect(localDayNumber('Asia/Tokyo', u)).toBe(day('2026-11-12'));
    expect(localDayNumber('Pacific/Honolulu', u)).toBe(day('2026-11-11'));
    expect(formatHHmm('Asia/Kathmandu', Date.parse('2026-11-11T00:00:00Z'))).toBe('05:45');
  });
});

describe('parsing', () => {
  it('parses HH:mm strictly', () => {
    expect(parseHHmm('00:00')).toBe(0);
    expect(parseHHmm('23:59')).toBe(1439);
    expect(parseHHmm('07:30')).toBe(450);
    for (const bad of ['7:30', '24:00', '23:60', '0730', 'ab:cd', '', ' 07:30', '07:30:00', null, 730]) {
      expect(parseHHmm(bad)).toBeNaN();
    }
  });

  it('parses ISO instants only with an explicit zone designator', () => {
    expect(parseInstant('2026-11-11T02:00:00Z')).toBe(Date.parse('2026-11-11T02:00:00Z'));
    expect(parseInstant('2026-11-11T02:00Z')).toBe(Date.parse('2026-11-11T02:00:00Z'));
    expect(parseInstant('2026-11-10T21:00:00-05:00')).toBe(Date.parse('2026-11-11T02:00:00Z'));
    expect(parseInstant('2026-11-11T02:00:00')).toBeNaN();
    expect(parseInstant('2026-11-11 02:00:00Z')).toBeNaN();
    expect(parseInstant('2026-13-45T02:00:00Z')).toBeNaN();
    expect(parseInstant(undefined)).toBeNaN();
  });
});

describe('intervals', () => {
  it('normalizes, intersects, subtracts and splits', () => {
    expect(normalize([[5, 7], [1, 3], [2, 4], [7, 8], [9, 9]])).toEqual([[1, 4], [5, 8]]);
    expect(intersect([[0, 10]], [[2, 3], [5, 12]])).toEqual([[2, 3], [5, 10]]);
    expect(subtract([[0, 10]], [[2, 3], [5, 12]])).toEqual([[0, 2], [3, 5]]);
    expect(subtract([[0, 10]], [])).toEqual([[0, 10]]);
    expect(splitAt([[0, 10]], [0, 4, 10, 12])).toEqual([[0, 4], [4, 10]]);
  });
});

describe('phase estimate (§1)', () => {
  it('places Tmin 3/3.5/2.5 h before wake, clamped to [1.5, D/2]', () => {
    expect(tminClockMinutes(23 * 60, 7 * 60, 'intermediate')).toBe(4 * 60);
    expect(tminClockMinutes(23 * 60, 7 * 60, 'early')).toBe(3.5 * 60);
    expect(tminClockMinutes(60, 9 * 60, 'late')).toBe(6.5 * 60);
    // 5 h sleep: D/2 = 2.5 caps the 3.5 h early-type offset
    expect(tminClockMinutes(0, 5 * 60, 'early')).toBe(2.5 * 60);
    // 4 h sleep, late: 2.5 > D/2 = 2 → 2
    expect(tminClockMinutes(2 * 60, 6 * 60, 'late')).toBe(4 * 60);
  });
});

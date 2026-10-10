import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GUILD_TIMEZONE,
  addDays,
  isValidTimeZone,
  nextOccurrence,
  zonedDate,
  zonedTimeToEpoch,
} from '../src/time';

/** The zone these DST cases are written for. */
const HELSINKI = 'Europe/Helsinki';

const iso = (ms: number) => new Date(ms).toISOString();
const at = (date: string, hour: number, minute: number) =>
  iso(zonedTimeToEpoch(date, hour, minute, HELSINKI));

describe('zonedTimeToEpoch', () => {
  it('uses UTC+3 in summer and UTC+2 in winter', () => {
    expect(at('2026-07-01', 13, 40)).toBe('2026-07-01T10:40:00.000Z');
    expect(at('2026-12-01', 13, 40)).toBe('2026-12-01T11:40:00.000Z');
  });

  it('handles midnight and the end of the day', () => {
    expect(at('2026-07-01', 0, 0)).toBe('2026-06-30T21:00:00.000Z');
    expect(at('2026-12-01', 23, 59)).toBe('2026-12-01T21:59:00.000Z');
  });

  it('switches offset on the DST days', () => {
    // 2026-03-29: clocks go 03:00 -> 04:00 at 01:00Z.
    expect(at('2026-03-29', 2, 59)).toBe('2026-03-29T00:59:00.000Z'); // EET, UTC+2
    expect(at('2026-03-29', 4, 0)).toBe('2026-03-29T01:00:00.000Z'); // EEST, UTC+3
    expect(at('2026-03-29', 13, 40)).toBe('2026-03-29T10:40:00.000Z');
    expect(at('2026-03-28', 13, 40)).toBe('2026-03-28T11:40:00.000Z');
    // 2026-10-25: clocks go 04:00 -> 03:00 at 01:00Z.
    expect(at('2026-10-25', 2, 59)).toBe('2026-10-24T23:59:00.000Z'); // EEST, UTC+3
    expect(at('2026-10-25', 4, 0)).toBe('2026-10-25T02:00:00.000Z'); // EET, UTC+2
    expect(at('2026-10-25', 13, 40)).toBe('2026-10-25T11:40:00.000Z');
    expect(at('2026-10-24', 13, 40)).toBe('2026-10-24T10:40:00.000Z');
  });

  it('resolves a nonexistent (spring-forward gap) time to the first instant after the gap', () => {
    // 03:30 does not exist on 2026-03-29; the clocks jump from 03:00 to 04:00 at 01:00Z.
    expect(at('2026-03-29', 3, 30)).toBe('2026-03-29T01:00:00.000Z');
    expect(at('2026-03-29', 3, 0)).toBe('2026-03-29T01:00:00.000Z');
    expect(at('2026-03-29', 3, 59)).toBe('2026-03-29T01:00:00.000Z');
  });

  it('resolves an ambiguous (fall-back overlap) time to the earlier instant', () => {
    // 03:30 happens twice on 2026-10-25: 00:30Z (UTC+3) and 01:30Z (UTC+2).
    expect(at('2026-10-25', 3, 30)).toBe('2026-10-25T00:30:00.000Z');
    expect(at('2026-10-25', 3, 0)).toBe('2026-10-25T00:00:00.000Z');
  });

  it('rejects invalid input', () => {
    expect(() => zonedTimeToEpoch('2026-13-01', 1, 0, HELSINKI)).toThrow();
    expect(() => zonedTimeToEpoch('2026-02-30', 1, 0, HELSINKI)).toThrow();
    expect(() => zonedTimeToEpoch('26-02-03', 1, 0, HELSINKI)).toThrow();
    expect(() => zonedTimeToEpoch('2026-02-03', 24, 0, HELSINKI)).toThrow();
    expect(() => zonedTimeToEpoch('2026-02-03', 1, 60, HELSINKI)).toThrow();
    expect(() => zonedTimeToEpoch('2026-02-03', 1.5, 0, HELSINKI)).toThrow();
  });

  it('works for other zones', () => {
    expect(iso(zonedTimeToEpoch('2026-07-01', 12, 0, 'UTC'))).toBe('2026-07-01T12:00:00.000Z');
    expect(iso(zonedTimeToEpoch('2026-07-01', 12, 0, 'America/New_York'))).toBe(
      '2026-07-01T16:00:00.000Z',
    );
  });
});

describe('zonedDate', () => {
  it('rolls over at local midnight, not UTC midnight', () => {
    // Summer: local midnight starting 2026-07-02 is 21:00Z on 2026-07-01.
    expect(zonedDate(Date.parse('2026-07-01T20:59:59.999Z'), HELSINKI)).toBe('2026-07-01');
    expect(zonedDate(Date.parse('2026-07-01T21:00:00.000Z'), HELSINKI)).toBe('2026-07-02');
    // Winter: local midnight starting 2026-12-02 is 22:00Z on 2026-12-01.
    expect(zonedDate(Date.parse('2026-12-01T21:59:59.999Z'), HELSINKI)).toBe('2026-12-01');
    expect(zonedDate(Date.parse('2026-12-01T22:00:00.000Z'), HELSINKI)).toBe('2026-12-02');
  });

  it('follows the DST switch days', () => {
    expect(zonedDate(Date.parse('2026-03-29T00:59:59Z'), HELSINKI)).toBe('2026-03-29');
    expect(zonedDate(Date.parse('2026-10-24T20:59:59Z'), HELSINKI)).toBe('2026-10-24');
    expect(zonedDate(Date.parse('2026-10-24T21:00:00Z'), HELSINKI)).toBe('2026-10-25');
  });

  it('handles the New Year boundary', () => {
    expect(zonedDate(Date.parse('2026-12-31T21:59:59Z'), HELSINKI)).toBe('2026-12-31');
    expect(zonedDate(Date.parse('2026-12-31T22:00:00Z'), HELSINKI)).toBe('2027-01-01');
  });
});

describe('addDays', () => {
  it('does calendar arithmetic across months, years and leap days', () => {
    expect(addDays('2026-10-10', 1)).toBe('2026-10-11');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-10-10', -7)).toBe('2026-10-03');
    expect(addDays('2026-10-10', 0)).toBe('2026-10-10');
  });
});

describe('nextOccurrence', () => {
  const next = (nowIso: string, hour = 13, minute = 40) =>
    iso(nextOccurrence(Date.parse(nowIso), hour, minute, HELSINKI));

  it('returns today when the time is still ahead, tomorrow once it has passed', () => {
    expect(next('2026-07-01T08:00:00Z')).toBe('2026-07-01T10:40:00.000Z');
    expect(next('2026-07-01T10:39:59.999Z')).toBe('2026-07-01T10:40:00.000Z');
    expect(next('2026-07-01T10:41:00Z')).toBe('2026-07-02T10:40:00.000Z');
  });

  it('is strictly after now', () => {
    expect(next('2026-07-01T10:40:00.000Z')).toBe('2026-07-02T10:40:00.000Z');
    expect(next('2026-12-01T11:40:00.000Z')).toBe('2026-12-02T11:40:00.000Z');
  });

  it('uses the local date, not the UTC date', () => {
    // 22:30Z on 2026-07-01 is already 01:30 on 2026-07-02 in Europe/Helsinki.
    expect(next('2026-07-01T22:30:00Z')).toBe('2026-07-02T10:40:00.000Z');
  });

  describe('around the spring switch (2026-03-29)', () => {
    it('Saturday 13:40 is still on winter time', () => {
      expect(next('2026-03-28T08:00:00Z')).toBe('2026-03-28T11:40:00.000Z');
    });
    it('after Saturday 13:40 the next one is Sunday 13:40 on summer time', () => {
      // One calendar day later but only 23 hours of real time.
      expect(next('2026-03-28T11:40:00Z')).toBe('2026-03-29T10:40:00.000Z');
      expect(
        nextOccurrence(Date.parse('2026-03-28T11:40:00Z'), 13, 40, HELSINKI) -
          Date.parse('2026-03-28T11:40:00Z'),
      ).toBe(23 * 3600 * 1000);
    });
    it('on the switch day itself, before and after the switch', () => {
      expect(next('2026-03-29T00:30:00Z')).toBe('2026-03-29T10:40:00.000Z'); // 02:30 EET
      expect(next('2026-03-29T01:30:00Z')).toBe('2026-03-29T10:40:00.000Z'); // 04:30 EEST
      expect(next('2026-03-29T10:40:00Z')).toBe('2026-03-30T10:40:00.000Z');
    });
  });

  describe('around the autumn switch (2026-10-25)', () => {
    it('Saturday 13:40 is still on summer time', () => {
      expect(next('2026-10-24T08:00:00Z')).toBe('2026-10-24T10:40:00.000Z');
    });
    it('after Saturday 13:40 the next one is Sunday 13:40 on winter time', () => {
      // One calendar day later but 25 hours of real time.
      expect(next('2026-10-24T10:40:00Z')).toBe('2026-10-25T11:40:00.000Z');
      expect(
        nextOccurrence(Date.parse('2026-10-24T10:40:00Z'), 13, 40, HELSINKI) -
          Date.parse('2026-10-24T10:40:00Z'),
      ).toBe(25 * 3600 * 1000);
    });
    it('on the switch day itself, before and after the switch', () => {
      expect(next('2026-10-25T00:30:00Z')).toBe('2026-10-25T11:40:00.000Z'); // 03:30 EEST
      expect(next('2026-10-25T01:30:00Z')).toBe('2026-10-25T11:40:00.000Z'); // 03:30 EET
      expect(next('2026-10-25T11:40:00Z')).toBe('2026-10-26T11:40:00.000Z');
    });
  });

  it('handles the gap time and the overlap time as scheduled times', () => {
    expect(next('2026-03-28T22:00:00Z', 3, 30)).toBe('2026-03-29T01:00:00.000Z');
    expect(next('2026-03-29T01:00:00Z', 3, 30)).toBe('2026-03-30T00:30:00.000Z');
    expect(next('2026-10-24T22:00:00Z', 3, 30)).toBe('2026-10-25T00:30:00.000Z');
    // After the earlier 03:30 passed, the next is the following day, not the second 03:30.
    expect(next('2026-10-25T00:30:00Z', 3, 30)).toBe('2026-10-26T01:30:00.000Z');
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA zone names, including the default', () => {
    for (const tz of [DEFAULT_GUILD_TIMEZONE, 'America/New_York', 'Asia/Tokyo', 'UTC']) {
      expect(isValidTimeZone(tz)).toBe(true);
    }
  });

  it('rejects unknown zones, fixed offsets, empty and oversized values and non-strings', () => {
    for (const tz of [
      'Mars/Olympus',
      '',
      ' ',
      '+02:00',
      'Europe/Helsinki ',
      'Europe\u0000/Helsinki',
      `${'a'.repeat(65)}`,
      '../etc',
    ]) {
      expect(isValidTimeZone(tz)).toBe(false);
    }
    for (const tz of [undefined, null, 5, {}, ['UTC']]) {
      expect(isValidTimeZone(tz)).toBe(false);
    }
  });
});

describe('time zones other than the default', () => {
  it('finds 13:40 New York time across the US DST switches', () => {
    const ny = (nowIso: string) =>
      iso(nextOccurrence(Date.parse(nowIso), 13, 40, 'America/New_York'));
    // Clocks go forward on 2027-03-14: Saturday 13:40 EST is 18:40Z, Sunday 13:40 EDT is 17:40Z.
    expect(ny('2027-03-13T18:40:00Z')).toBe('2027-03-14T17:40:00.000Z');
    // Clocks go back on 2027-11-07: Saturday 13:40 EDT is 17:40Z, Sunday 13:40 EST is 18:40Z.
    expect(ny('2027-11-06T17:40:00Z')).toBe('2027-11-07T18:40:00.000Z');
    // The 2026 switches too.
    expect(ny('2026-03-07T18:40:00Z')).toBe('2026-03-08T17:40:00.000Z');
    expect(ny('2026-10-31T17:40:00Z')).toBe('2026-11-01T18:40:00.000Z');
  });
});

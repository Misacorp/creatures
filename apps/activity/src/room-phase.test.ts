import { describe, expect, it } from 'vitest';
import { msUntilNextPhase, phaseAt } from './room-phase';

const HEL = 'Europe/Helsinki';
const H = 3_600_000;
const iso = (s: string): number => Date.parse(s);

describe('phaseAt', () => {
  it('reads the guild-local hour, not the UTC one', () => {
    // 2026-06-10: Helsinki is UTC+3.
    expect(phaseAt(iso('2026-06-10T09:00:00Z'), HEL)).toBe('day'); // 12:00
    expect(phaseAt(iso('2026-06-10T15:30:00Z'), HEL)).toBe('twilight'); // 18:30
    expect(phaseAt(iso('2026-06-10T17:00:00Z'), HEL)).toBe('night'); // 20:00
    expect(phaseAt(iso('2026-06-10T02:59:00Z'), HEL)).toBe('night'); // 05:59
    expect(phaseAt(iso('2026-06-10T03:00:00Z'), HEL)).toBe('twilight'); // 06:00
    expect(phaseAt(iso('2026-06-10T05:00:00Z'), HEL)).toBe('day'); // 08:00
    // The same instant is a different phase in another zone.
    expect(phaseAt(iso('2026-06-10T09:00:00Z'), 'America/New_York')).toBe('night'); // 05:00
  });

  it('is null for an unknown timezone', () => {
    expect(phaseAt(0, 'Not/AZone')).toBeNull();
    expect(msUntilNextPhase(0, 'Not/AZone')).toBeNull();
  });
});

describe('msUntilNextPhase', () => {
  it('counts to the next whole local hour boundary', () => {
    // 12:00 Helsinki (day): dusk starts at 18:00, six hours later.
    expect(msUntilNextPhase(iso('2026-06-10T09:00:00Z'), HEL)).toBe(6 * H);
    // 18:30 (twilight): night at 20:00, 1.5 h.
    expect(msUntilNextPhase(iso('2026-06-10T15:30:00Z'), HEL)).toBe(1.5 * H);
    // 23:00 (night): dawn at 06:00 the next day, 7 h.
    expect(msUntilNextPhase(iso('2026-06-10T20:00:00Z'), HEL)).toBe(7 * H);
    // 07:59:30 (dawn): day at 08:00, 30 s.
    expect(msUntilNextPhase(iso('2026-06-10T04:59:30Z'), HEL)).toBe(30_000);
  });

  it('is positive on the boundary itself and gives the length of the new phase', () => {
    // Exactly 20:00 Helsinki: night has just begun and lasts until 06:00.
    expect(msUntilNextPhase(iso('2026-06-10T17:00:00Z'), HEL)).toBe(10 * H);
  });

  it('follows the clock change in spring (03:00 jumps to 04:00 on 2026-03-29)', () => {
    // 2026-03-28 23:00Z is 01:00 EET. Dawn is 06:00 EEST = 03:00Z, four real hours later (not five).
    expect(phaseAt(iso('2026-03-28T23:00:00Z'), HEL)).toBe('night');
    expect(msUntilNextPhase(iso('2026-03-28T23:00:00Z'), HEL)).toBe(4 * H);
    expect(phaseAt(iso('2026-03-29T02:59:00Z'), HEL)).toBe('night');
    expect(phaseAt(iso('2026-03-29T03:00:00Z'), HEL)).toBe('twilight');
  });

  it('follows the clock change in autumn (04:00 falls back to 03:00 on 2026-10-25)', () => {
    // 2026-10-25 00:30Z is 03:30 EEST. Dawn is 06:00 EET = 04:00Z, three and a half real hours later
    // (not two and a half).
    expect(phaseAt(iso('2026-10-25T00:30:00Z'), HEL)).toBe('night');
    expect(msUntilNextPhase(iso('2026-10-25T00:30:00Z'), HEL)).toBe(3.5 * H);
    expect(phaseAt(iso('2026-10-25T03:59:00Z'), HEL)).toBe('night');
    expect(phaseAt(iso('2026-10-25T04:00:00Z'), HEL)).toBe('twilight');
  });

  it('handles a half-hour offset zone', () => {
    // Asia/Kolkata is UTC+5:30: 12:00 local is 06:30Z; dusk at 18:00 local is 12:30Z.
    expect(msUntilNextPhase(iso('2026-06-10T06:30:00Z'), 'Asia/Kolkata')).toBe(6 * H);
  });

  it('always lands on the boundary: the phase differs just after and not just before', () => {
    const zones = [HEL, 'UTC', 'America/New_York', 'Australia/Lord_Howe', 'Asia/Kathmandu'];
    for (const zone of zones) {
      for (let i = 0; i < 40; i++) {
        const now = iso('2026-03-20T00:07:13Z') + i * 7 * H + i * 91_000;
        const wait = msUntilNextPhase(now, zone);
        expect(wait, zone).not.toBeNull();
        const w = wait ?? 0;
        expect(w).toBeGreaterThan(0);
        expect(phaseAt(now + w, zone)).not.toBe(phaseAt(now, zone));
        expect(phaseAt(now + w - 1, zone)).toBe(phaseAt(now, zone));
      }
    }
  });
});

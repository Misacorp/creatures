import { describe, expect, it } from 'vitest';
import { FALLBACK_PHASE, phaseOrFallback } from './use-room-phase';

describe('phaseOrFallback', () => {
  const noonUtc = Date.UTC(2026, 5, 15, 10, 0); // 13:00 in Helsinki (summer)

  it('uses the guild timezone', () => {
    expect(phaseOrFallback(noonUtc, 'Europe/Helsinki')).toBe('day');
    expect(phaseOrFallback(noonUtc, 'America/Los_Angeles')).not.toBe('day');
  });

  it('lights the room as at night when the timezone is not known or not valid', () => {
    expect(FALLBACK_PHASE).toBe('night');
    expect(phaseOrFallback(noonUtc, null)).toBe('night');
    expect(phaseOrFallback(noonUtc, 'Not/AZone')).toBe('night');
  });
});

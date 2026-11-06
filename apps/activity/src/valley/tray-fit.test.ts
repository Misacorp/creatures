import { describe, expect, it } from 'vitest';
import { trayColumnsFit } from './Tray';

describe('trayColumnsFit', () => {
  it('counts the 72 px columns that fit across a phone', () => {
    expect(trayColumnsFit(390)).toBe(5);
    expect(trayColumnsFit(320)).toBe(4);
  });

  it('is never less than one', () => {
    expect(trayColumnsFit(10)).toBe(1);
  });
});

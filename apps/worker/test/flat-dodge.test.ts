import { describe, expect, it } from 'vitest';
import { flatDodgeBp } from '../src/gear-worn';

describe('the flat dodge the creature page adds to the Speed part', () => {
  it('is 0 without a modifier sheet or without the field', () => {
    expect(flatDodgeBp(undefined)).toBe(0);
    expect(flatDodgeBp({})).toBe(0);
  });

  it('reads the sheet’s dodgeBp', () => {
    expect(flatDodgeBp({ dodgeBp: 300 })).toBe(300);
  });

  it('ignores a value that is not a positive whole number', () => {
    expect(flatDodgeBp({ dodgeBp: -5 })).toBe(0);
    expect(flatDodgeBp({ dodgeBp: 1.5 })).toBe(0);
    expect(flatDodgeBp({ dodgeBp: '300' } as never)).toBe(0);
  });
});

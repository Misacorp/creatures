import { describe, expect, it } from 'vitest';
import { shownBranch } from '../src/branch';

describe('shownBranch', () => {
  it.each(['main', 'dev', 'ccr-9c099cd6-3t86xs', 'feature/living-room', 'v1.2_fix'])(
    'shows %s',
    (name) => {
      expect(shownBranch(name)).toBe(name);
    },
  );

  it.each(['', 'has space', 'a:b', '<b>', 'x'.repeat(101), 'ä'])('leaves out %j', (name) => {
    expect(shownBranch(name)).toBeUndefined();
  });

  it('leaves out a value that is not a string', () => {
    expect(shownBranch(undefined)).toBeUndefined();
    expect(shownBranch(42)).toBeUndefined();
  });
});

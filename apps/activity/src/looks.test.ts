import { describe, expect, it } from 'vitest';
import { applyLook, isLook, LOOKS } from './looks';

function fakeRoot() {
  const attrs = new Map<string, string>();
  const root = {
    dataset: {} as Record<string, string>,
    removeAttribute: (name: string) => {
      attrs.delete(name);
      delete root.dataset['look'];
    },
  };
  return root as unknown as HTMLElement;
}

describe('looks', () => {
  it('starts with the current look', () => {
    expect(LOOKS[0]).toBe('current');
    expect(isLook('current')).toBe(true);
    expect(isLook('nope')).toBe(false);
  });

  it('removes data-look for current and unknown ids', () => {
    const root = fakeRoot();
    root.dataset['look'] = 'x';
    applyLook('current', root);
    expect(root.dataset['look']).toBeUndefined();
  });
});

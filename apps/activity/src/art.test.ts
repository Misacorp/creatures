import { describe, expect, it } from 'vitest';
import { elementClass, elementSlug } from './art';

describe('the element slug', () => {
  it('passes a plain element id through', () => {
    expect(elementSlug('tide')).toBe('tide');
    expect(elementSlug('half-moon')).toBe('half-moon');
  });

  it('turns anything that is not a lower-case slug into "unknown"', () => {
    for (const bad of ['', 'Tide', 'ti de', 'tide"><b>', 'a_b', 'tide1']) {
      expect(elementSlug(bad), bad).toBe('unknown');
    }
  });

  it('gives the colour class only for a real slug', () => {
    expect(elementClass('ember')).toBe('el-ember');
    expect(elementClass(null)).toBe('');
    expect(elementClass('Ember')).toBe('');
  });
});

import { describe, expect, it } from 'vitest';
import { elementClass, elementSlug, markPalette } from './art';
import { content } from '@creatures/game';

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

describe('Mire in the stylesheet and the palettes', () => {
  const css = import.meta.glob<string>('./styles/**/*.css', {
    query: '?raw',
    import: 'default',
    eager: true,
  });
  const all = Object.values(css).join('\n');

  it('colours Mire creatures, chips, slot cues and the Muddied mark like the other elements', () => {
    expect(elementClass('mire')).toBe('el-mire');
    expect(markPalette('mire')).toEqual({ m: '#b8864a' });
    expect(all).toContain('--mire: #b8864a;');
    for (const element of content.elements) {
      expect(all, `el-${element.id}`).toContain(`.el-${element.id} {`);
      expect(all, `t-${element.id}`).toContain(`.t-${element.id} {`);
      expect(all, `cue-el-${element.id}`).toContain(`.cue-el-${element.id} {`);
      expect(all, `--${element.id}`).toContain(`--${element.id}: #`);
    }
  });
});

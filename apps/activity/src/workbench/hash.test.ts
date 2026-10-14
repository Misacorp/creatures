import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW, formatHash, parseHash, viewProps } from './hash';
import { changedProps, cleanProps, cleanValue } from './props';
import { requireEntry } from './registry';

const bar = requireEntry('Bar');

describe('the address of a workbench view', () => {
  it('is empty for the index and parses back to the defaults', () => {
    expect(formatHash(null, {}, '390', 'dusk')).toBe('');
    expect(parseHash('')).toEqual(DEFAULT_VIEW);
    expect(parseHash('#')).toEqual(DEFAULT_VIEW);
  });

  it('round-trips a component, its changed props, the width and the background', () => {
    const props = { ...bar.defaults, value: 12, tone: 'spark' };
    const hash = formatHash(bar, props, '360', 'night');
    const view = parseHash(hash);
    expect(view.component).toBe('Bar');
    expect(view.width).toBe('360');
    expect(view.background).toBe('night');
    expect(viewProps(bar, view)).toEqual(props);
  });

  it('writes only what differs from the defaults', () => {
    const hash = formatHash(bar, { ...bar.defaults, value: 12 }, '390', 'dusk');
    expect(parseHash(hash).props).toEqual({ value: 12 });
    expect(formatHash(bar, bar.defaults, '390', 'dusk')).not.toContain('p=');
  });

  it('keeps text with odd characters intact', () => {
    const props = { ...bar.defaults, label: 'a&b=c#d "q" \u{1F600} <b>' };
    const view = parseHash(formatHash(bar, props, '390', 'dusk'));
    expect(viewProps(bar, view)).toEqual(props);
  });

  it('falls back to the defaults for rubbish', () => {
    expect(parseHash('#c=Bar&w=999&bg=pink').width).toBe('390');
    expect(parseHash('#c=Bar&w=999&bg=pink').background).toBe('dusk');
    expect(parseHash('#c=Bar&p=%7Bnot-json').props).toEqual({});
    expect(parseHash('#c=Bar&p=%5B1%2C2%5D').props).toEqual({});
    expect(parseHash(`#c=Bar&p=${'x'.repeat(5000)}`)).toEqual(DEFAULT_VIEW);
  });
});

describe('cleaning props from an address', () => {
  it('drops unknown names, wrong kinds and values out of range or list', () => {
    const clean = cleanProps(bar, {
      value: 9999,
      max: 'ten',
      tone: 'purple',
      smooth: 'yes',
      label: 42,
      evil: '<script>',
    });
    expect(clean).toEqual({ ...bar.defaults, value: 200 });
    expect(Object.keys(clean)).not.toContain('evil');
  });

  it('keeps numbers whole unless the control has a fractional step', () => {
    expect(cleanValue({ kind: 'number', min: 0, max: 10 }, 2.6, 0)).toBe(3);
    expect(cleanValue({ kind: 'number', min: 0, max: 1, step: 0.1 }, 0.25, 0)).toBe(0.25);
    expect(cleanValue({ kind: 'number', min: 0, max: 10 }, Number.NaN, 4)).toBe(4);
    expect(cleanValue({ kind: 'number', min: 0, max: 10 }, -5, 4)).toBe(0);
  });

  it('cuts text to its length in code points', () => {
    expect(
      cleanValue({ kind: 'text', maxLength: 3 }, '\u{1F600}\u{1F600}\u{1F600}\u{1F600}', ''),
    ).toBe('\u{1F600}\u{1F600}\u{1F600}');
  });

  it('reports the changed props only', () => {
    expect(changedProps(bar, { ...bar.defaults, value: 1 })).toEqual({ value: 1 });
  });
});

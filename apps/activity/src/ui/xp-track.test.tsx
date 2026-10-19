import { afterEach, describe, expect, it } from 'vitest';
import { byClass, createPage, visibleText, type FakeElement, type Page } from '../test-dom';
import { DEFAULT_XP_SIZE, XP_SIZES, XpTrack } from './XpTrack';

/** Every stylesheet as text: the tests' DOM has no layout, so the size lock is checked in the source. */
const sheets = import.meta.glob<string>('../styles/**/*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const trackCss = sheets['../styles/components/xp-track.css'] ?? '';

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

function drawn(size?: (typeof XP_SIZES)[number]): FakeElement {
  page?.unmount();
  page = createPage();
  page.draw(
    <XpTrack level={7} value={50} max={200} label="Experience" levelEntry="level" size={size} />,
  );
  const [track] = byClass(page.root, 'xp-static');
  if (track === undefined) throw new Error('no track');
  return track;
}

describe('the XpTrack looks', () => {
  it('has a default look, which is one of the looks', () => {
    expect(XP_SIZES).toContain(DEFAULT_XP_SIZE);
    expect(drawn().getAttribute('class')).toContain(`xp-size-${DEFAULT_XP_SIZE}`);
  });

  it('draws the class of each look, the level tag and the bar as its two children', () => {
    for (const size of XP_SIZES) {
      const track = drawn(size);
      expect(track.getAttribute('class')).toContain(`xp-size-${size}`);
      const [level, bar] = track.childNodes as FakeElement[];
      expect(level?.getAttribute('class')).toContain('xp-lv');
      expect(visibleText(level as FakeElement)).toBe('Lv 7');
      expect(bar?.getAttribute('class')).toContain('xp-bar');
      expect(bar?.getAttribute('aria-valuetext')).toBe('50 / 200');
    }
  });
});

describe('the size lock', () => {
  it('puts the level tag and the bar in one grid row of one height', () => {
    const line = trackCss.slice(trackCss.indexOf('\n.xp-static {'));
    const body = line.slice(line.indexOf('{') + 1, line.indexOf('}'));
    expect(body).toContain('display: grid');
    expect(body).toContain('grid-template-rows: var(--xp-h)');
    expect(body).toContain('align-items: stretch');
  });

  it('gives the tag and the bar no height of their own, only the row (border-box, no min-height)', () => {
    const at = trackCss.indexOf('.xp-static > .xp-lv,\n.xp-static > .xp-bar {');
    expect(at).toBeGreaterThan(-1);
    const body = trackCss.slice(trackCss.indexOf('{', at) + 1, trackCss.indexOf('}', at));
    expect(body).toContain('box-sizing: border-box');
    expect(body).toContain('height: auto');
    expect(body).toContain('min-height: 0');
  });

  it('lets a look change only the variables, never a height on the tag or the bar', () => {
    const bare = trackCss.replace(/\/\*[\s\S]*?\*\//g, '');
    const heights = [...bare.matchAll(/(?<![-\w])(?:min-|max-)?height\s*:\s*([^;]+);/g)].map((m) =>
      m[0].replace(/\s+/g, ' '),
    );
    // The lock's own `height: auto` and `min-height: 0`, and nothing else.
    expect(heights).toEqual(['height: auto;', 'min-height: 0;']);
    expect(trackCss).toContain('--xp-h');
  });

  it('is set by no other stylesheet: no screen overrides the track or its parts', () => {
    const offenders: string[] = [];
    for (const [path, source] of Object.entries(sheets)) {
      if (path.endsWith('components/xp-track.css')) continue;
      const bare = source.replace(/\/\*[\s\S]*?\*\//g, '');
      for (const block of bare.matchAll(/([^{}]*\.xp-static[^{}]*)\{([^}]*)\}/g)) {
        if (/(?<![-\w])(?:min-|max-)?height\s*:/.test(block[2] ?? '')) offenders.push(path);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps every look at least one type-scale step of 12 px tall (1.25 rem or more)', () => {
    const sizes = [...trackCss.matchAll(/--xp-h:\s*([\d.]+)rem/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(1);
    for (const rem of sizes) expect(rem).toBeGreaterThanOrEqual(1.25);
  });
});

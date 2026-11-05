import { describe, expect, it } from 'vitest';

/**
 * A guard against a second, hand-built "two columns on a desktop that collapse on a phone" (ux-patterns.md,
 * "Shared components", `ui/Columns`). A wrapper that is `display: contents` below a width and a real column from it
 * was copied three times (the Workshop, the open dungeon run, the Raid) before it became `ui/Columns`. A view's CSS
 * may not set `display: contents` except for the rules listed here; to fix a failure, draw the screen with `Columns`
 * and `Column` (their comments say how).
 */

const styles = import.meta.glob<string>('./styles/views/**/*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** The selectors of view rules that may be `display: contents`, and why: neither is a column wrapper. */
const ALLOWED: { selector: string; why: string }[] = [
  {
    selector: '.world-map-places li',
    why: 'the map markers are positioned in the map, not laid out',
  },
  {
    selector: '.gs-act',
    why: 'an actor wrapper of the Valley Games scene, a hook for its animation classes',
  },
];

/** Every selector of a rule whose body sets `display: contents`, from a stylesheet's text. */
function contentsSelectors(css: string): string[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const found: string[] = [];
  for (const rule of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/display:\s*contents/.test(rule[2] ?? '')) {
      found.push(
        ...(rule[1] ?? '').split(',').map((selector) => selector.trim().replace(/\s+/g, ' ')),
      );
    }
  }
  return found;
}

describe('one way to build two columns', () => {
  it('finds the view stylesheets', () => {
    expect(Object.keys(styles).length).toBeGreaterThan(20);
  });

  it('finds a display: contents rule the way it looks for one', () => {
    expect(contentsSelectors('/* x */ .a, .b { display: contents; }')).toEqual(['.a', '.b']);
    expect(contentsSelectors('.a { display: block; }')).toEqual([]);
  });

  it('keeps display: contents column wrappers out of the views', () => {
    const found = Object.entries(styles).flatMap(([file, css]) =>
      contentsSelectors(css)
        .filter((selector) => !ALLOWED.some((a) => a.selector === selector))
        .map((selector) => `${file}: ${selector}`),
    );
    expect(found, 'a hand-built column wrapper in a view stylesheet (use ui/Columns)').toEqual([]);
  });

  it('lists only allowed rules that exist', () => {
    const all = Object.values(styles).flatMap(contentsSelectors);
    for (const { selector } of ALLOWED) expect(all).toContain(selector);
  });
});

import { describe, expect, it } from 'vitest';

/**
 * Spacing inside a popover comes from one scale (ux-patterns.md, "Spacing inside a popover"): the stacks
 * in popover.css space a popover's parts, and the parts never set an outer margin of their own (2026-10-28:
 * a part's own margin lost to a broader rule and the "More in How to play" button sat 2px under the text).
 * The layout itself is checked in a browser by `scripts/popover-audit.mjs`; this keeps the rule in CI.
 */
const sheets = import.meta.glob<string>('../styles/**/*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
});

interface Rule {
  file: string;
  selector: string;
  body: string;
}

/** The plain rules of a stylesheet (at-rule blocks are opened, their inner rules kept). */
function rules(file: string, css: string): Rule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const found: Rule[] = [];
  for (const match of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (match[1] ?? '').trim();
    if (!selector.startsWith('@')) found.push({ file, selector, body: match[2] ?? '' });
  }
  return found;
}

const all = Object.entries(sheets).flatMap(([file, css]) => rules(file, css));

/** The last compound of each selector in the list: the element the rule styles. */
const subjects = (selector: string): string[] =>
  selector.split(',').map(
    (s) =>
      s
        .trim()
        .split(/\s+|>|\+|~/)
        .filter(Boolean)
        .at(-1) ?? '',
  );

const MARGIN = /(^|;|\s)margin(-top|-bottom|-block[a-z-]*)?\s*:/;

describe('spacing inside a popover', () => {
  it('reads the stylesheets', () => {
    expect(all.length).toBeGreaterThan(100);
  });

  it('sets the scale on the popover', () => {
    const popover = all.find((r) => r.selector === '.popover');
    for (const token of ['--pop-tight', '--pop-gap', '--pop-action', '--pop-pad'])
      expect(popover?.body).toContain(token);
  });

  it('gives no popover part a vertical margin of its own: the stacks space them', () => {
    const offenders = all
      .filter((r) => !r.selector.includes(':nth-child'))
      .filter((r) => subjects(r.selector).some((s) => /\.pop-[a-z]/.test(s)))
      .filter((r) => MARGIN.test(r.body))
      .map((r) => `${r.file}: ${r.selector}`);
    expect(offenders).toEqual([]);
  });

  it('puts the larger step above any button or action row', () => {
    const action = all.find((r) =>
      r.selector.includes(':nth-child(n + 2):is(.pop-actions, .pop-more, button)'),
    );
    expect(action?.body).toContain('var(--pop-action)');
  });
});

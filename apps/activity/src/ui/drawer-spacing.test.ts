import { describe, expect, it } from 'vitest';

/**
 * Spacing inside a drawer or sheet comes from one scale (ux-patterns.md, "Spacing inside a drawer or
 * sheet"): the stacks in drawer.css space the parts of a drawer's body, toolbar and footer and of a sheet,
 * and the parts never set a vertical margin of their own (2026-10-28: every part had its own margin and
 * gap, so the gaps were 2 to 16px in seven different steps and a button sat 4 and 6px under the text).
 * The layout itself is checked in a browser by `scripts/overlay-audit.mjs`; this keeps the rule in CI.
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

/**
 * Stylesheets whose parts only ever draw inside a drawer or a sheet: every rule in them is checked.
 * (Shared parts that a page draws too, like `.actions`, `.reason`, `.drill-head`, keep their margin for the
 * page; inside a stack the stack's `:nth-child` rule outweighs it, and the browser audit's (e) check
 * catches a drawer where it does not.)
 */
const DRAWER_FILES = [
  '../styles/components/evolve.css',
  '../styles/components/recipe-card.css',
  '../styles/components/roster-picker.css',
  '../styles/components/picker.css',
  '../styles/views/expeditions/send.css',
];

/** Classes of drawer-only parts that live in a stylesheet shared with a page. */
const DRAWER_PARTS =
  /^(\.|[a-z0-9]*\.)(dnd-|ip-|book-|idc|item-detail|item-actions|equip-on|dismantle-|place-(body|tags|flavor|fact|deep|lives|trips)|ge-picker|reach-|job-ready|haul)/;

/** Any vertical margin: `margin`, `margin-top`, `margin-bottom`, `margin-block`, `margin-block-start`, ... */
const MARGIN = /(^|;|\s)(margin(?:-top|-bottom|-block[a-z-]*)?)\s*:\s*([^;]+)/g;

/** A reset, a ring's `var(--px)` (3px, outside a pixel frame), a negative scroll-box margin and `auto` on the sides are not spacing. */
function spacing(body: string): string[] {
  const found: string[] = [];
  for (const m of body.matchAll(MARGIN)) {
    const prop = m[2] ?? '';
    const value = (m[3] ?? '').trim();
    const parts = value.match(/calc\((?:[^()]|\([^()]*\))*\)|\S+/g) ?? [];
    // `margin` shorthand: top and bottom are the first and the third (or first) value.
    const vertical =
      prop === 'margin'
        ? [parts[0], parts[2] ?? parts[0]]
        : prop === 'margin-block'
          ? parts
          : [value];
    for (const v of vertical) {
      if (v === undefined) continue;
      const ok =
        /^0(px|rem)?$/.test(v) ||
        v === 'var(--px)' ||
        v.startsWith('-') ||
        /^calc\(var\(--px\) \* -1\)$/.test(v) ||
        v === 'auto'; // only ever on the sides of a block, never on a stack's axis
      if (!ok) found.push(`${prop}: ${value}`);
    }
  }
  return found;
}

describe('spacing inside a drawer or sheet', () => {
  it('reads the stylesheets', () => {
    expect(all.length).toBeGreaterThan(100);
    for (const file of DRAWER_FILES) expect(Object.keys(sheets)).toContain(file);
  });

  it('sets the scale once, on the root, with the popover steps and a section step', () => {
    const tokens = all.find((r) => r.file.endsWith('drawer.css') && r.selector === ':root');
    expect(tokens?.body).toMatch(/--dr-tight:\s*0\.25rem/);
    expect(tokens?.body).toMatch(/--dr-gap:\s*0\.5rem/);
    expect(tokens?.body).toMatch(/--dr-action:\s*0\.75rem/);
    expect(tokens?.body).toMatch(/--dr-section:\s*1rem/);
    expect(tokens?.body).toContain('--dr-pad');
  });

  it('spaces the children of every stack, with the weight of two classes', () => {
    const stackRules = all.filter(
      (r) => r.file.endsWith('drawer.css') && r.selector.includes(':nth-child'),
    );
    const bySel = (needle: string) => stackRules.find((r) => r.selector.includes(needle));
    for (const stack of [
      '.drawer-body',
      '.drawer-toolbar',
      '.drawer-footer',
      '.sheet',
      '.dr-stack',
    ]) {
      expect(stackRules.some((r) => r.selector.includes(stack))).toBe(true);
    }
    const reset = stackRules.find((r) => r.selector.endsWith('> :nth-child(n)'));
    expect(reset?.selector).toContain('.dr-group');
    expect(reset?.body).toContain('margin-block: 0');
    expect(bySel('.dr-group > :nth-child(n + 2)')?.body).toContain('var(--dr-tight)');
    expect(bySel('.dr-section')?.body).toContain('var(--dr-section)');
    const action = stackRules.find((r) => r.selector.includes('.send-button'));
    expect(action?.body).toContain('var(--dr-action)');
    const plain = stackRules.find(
      (r) => r.selector.includes('.drawer-body') && r.selector.endsWith(':nth-child(n + 2)'),
    );
    expect(plain?.body).toContain('var(--dr-gap)');
  });

  it('gives the body one padding: the head and the toolbar add none below', () => {
    const rule = (selector: string) =>
      all.find((r) => r.file.endsWith('drawer.css') && r.selector === selector)?.body ?? '';
    expect(rule('.drawer-body')).toContain('padding: var(--dr-gap) var(--dr-pad) var(--dr-pad)');
    expect(rule('.drawer-head')).toContain('padding: 0 var(--dr-pad);');
    expect(rule('.drawer-toolbar')).toContain('padding: var(--dr-gap) var(--dr-pad) 0;');
    expect(rule('.drawer-footer')).toContain('padding: var(--dr-gap) var(--dr-pad) var(--dr-pad)');
    expect(all.find((r) => r.selector === '.sheet')?.body).toContain('padding: var(--dr-pad)');
  });

  it('gives no drawer part a vertical margin of its own: the stacks space them', () => {
    const offenders = all
      .filter((r) => !r.selector.includes(':nth-child') && !r.selector.includes('.place-panel'))
      .filter(
        (r) =>
          DRAWER_FILES.includes(r.file) || subjects(r.selector).some((s) => DRAWER_PARTS.test(s)),
      )
      .flatMap((r) => spacing(r.body).map((what) => `${r.file}: ${r.selector} { ${what} }`));
    expect(offenders).toEqual([]);
  });

  it('knows what counts as spacing', () => {
    expect(spacing('margin: 0.5rem 0;')).toHaveLength(2);
    expect(spacing('margin: 0 0 0.25rem;')).toHaveLength(1);
    expect(spacing('margin-top: 1rem;')).toHaveLength(1);
    expect(spacing('margin: 0; margin-inline: 0.5rem;')).toEqual([]);
    expect(spacing('margin: var(--px);')).toEqual([]);
    expect(spacing('margin: -0.375rem;')).toEqual([]);
    expect(spacing('margin: 0 auto;')).toEqual([]);
    expect(spacing('margin-left: auto;')).toEqual([]);
  });
});

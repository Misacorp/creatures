import { afterEach, describe, expect, it } from 'vitest';
import { FakeElement, byClass, createPage, visibleText, type Page } from '../test-dom';
import { Nameplate } from './Nameplate';

/**
 * `ui/Nameplate` is the one small label on art (ux-patterns.md, "One label, many uses"): its options, and a guard
 * against a hand-built copy (an ink plate with bone words drawn by a view's own class).
 */

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

function plate(vnode: preact.ComponentChild): FakeElement {
  page = createPage();
  page.draw(vnode);
  const [el] = byClass(page.root, 'nameplate');
  if (el === undefined) throw new Error('no nameplate');
  return el;
}

const classes = (el: FakeElement): string[] => (el.getAttribute('class') ?? '').split(' ');
const parts = (el: FakeElement): FakeElement[] =>
  el.childNodes.filter((n): n is FakeElement => n instanceof FakeElement);

describe('Nameplate options', () => {
  it('plain: the name alone, medium, bone, not bold', () => {
    const el = plate(<Nameplate>Signpost</Nameplate>);
    expect(classes(el)).toEqual(expect.arrayContaining(['nameplate', 'pix', 'nameplate-md']));
    expect(classes(el)).toContain('nameplate-bone');
    expect(classes(el)).not.toContain('nameplate-bold');
    expect(parts(el).map((p) => p.getAttribute('class'))).toEqual(['nameplate-name']);
    expect(visibleText(el)).toBe('Signpost');
  });

  it('bold is an option, not a second component', () => {
    expect(classes(plate(<Nameplate bold>Forge</Nameplate>))).toContain('nameplate-bold');
  });

  it('a level comes first, in its own yellow part, then the name', () => {
    const el = plate(
      <Nameplate level={12} size="sm">
        Cindle
      </Nameplate>,
    );
    expect(parts(el).map((p) => p.getAttribute('class'))).toEqual([
      'nameplate-level',
      'nameplate-name',
    ]);
    expect(parts(el).map((p) => p.textContent)).toEqual(['12', 'Cindle']);
    expect(classes(el)).toContain('nameplate-sm');
  });

  it('a level of 0 is still shown (only undefined leaves it out)', () => {
    expect(parts(plate(<Nameplate level={0}>New</Nameplate>))).toHaveLength(2);
  });

  it('tone gold is a class', () => {
    expect(classes(plate(<Nameplate tone="gold">Games</Nameplate>))).toContain('nameplate-gold');
  });

  it('a gain comes last, in its own part, "+N"; none for 0 or when absent', () => {
    const el = plate(
      <Nameplate level={3} gain={42}>
        Cindle
      </Nameplate>,
    );
    expect(parts(el).map((p) => p.getAttribute('class'))).toEqual([
      'nameplate-level',
      'nameplate-name',
      'nameplate-gain',
    ]);
    expect(visibleText(parts(el)[2] as FakeElement)).toBe('+42');
    expect(parts(plate(<Nameplate gain={0}>Cindle</Nameplate>))).toHaveLength(1);
    expect(parts(plate(<Nameplate>Cindle</Nameplate>))).toHaveLength(1);
  });

  it("an owner is another player's name after the creature's, in its own muted part, before a gain; none when empty", () => {
    const el = plate(
      <Nameplate level={4} owner="Mia" gain={3}>
        Cindle
      </Nameplate>,
    );
    expect(parts(el).map((p) => p.getAttribute('class'))).toEqual([
      'nameplate-level',
      'nameplate-name',
      'nameplate-owner',
      'nameplate-gain',
    ]);
    expect(visibleText(parts(el)[2] as FakeElement)).toBe('Mia');
    expect(parts(plate(<Nameplate owner="">Cindle</Nameplate>))).toHaveLength(1);
    expect(visibleText(plate(<Nameplate owner="<b>x</b>">Cindle</Nameplate>))).toContain('<b>x</b>');
  });

  it('draws the words as text, never as markup', () => {
    const el = plate(<Nameplate>{'<b>Hi</b>'}</Nameplate>);
    expect(visibleText(el)).toBe('<b>Hi</b>');
    expect(
      byClass(el, 'nameplate-name')[0]?.childNodes.every((n) => !(n instanceof FakeElement)),
    ).toBe(true);
  });
});

const raw = import.meta.glob<string>(['../**/*.tsx', '../**/*.css'], {
  query: '?raw',
  import: 'default',
  eager: true,
});
/** The sources by their path from `src/` (the glob names this folder's own files `./X`). */
const sources: Record<string, string> = Object.fromEntries(
  Object.entries(raw).map(([path, text]) => [
    path.startsWith('./') ? `ui/${path.slice(2)}` : path.replace(/^\.\.\//, ''),
    text,
  ]),
);

describe('one small label on art', () => {
  it('finds the sources', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(100);
  });

  it('the valley draws its labels with ui/Nameplate, never its own plate', () => {
    for (const [path, text] of Object.entries(sources)) {
      if (path.includes('/proto/') || path.endsWith('.test.tsx')) continue;
      if (path.startsWith('valley/') || path === 'styles/views/valley.css') {
        expect(text, `${path}: a hand-built plate`).not.toMatch(
          /vy-plate|function Plate\b|<Plate\b/,
        );
      }
    }
  });

  it('only ui/Nameplate and its stylesheet use the nameplate classes', () => {
    for (const [path, text] of Object.entries(sources)) {
      if (path === 'ui/Nameplate.tsx' || path === 'styles/components/nameplate.css') continue;
      if (path.endsWith('.test.tsx')) continue;
      expect(text, `${path} draws a nameplate by hand`).not.toMatch(
        /class=["'{`][^"'}`]*\bnameplate\b/,
      );
    }
  });

  it('the places on the map and the creatures in the scenes use it', () => {
    expect(sources['valley/ValleyMap.tsx']).toContain("from '../ui/Nameplate'");
    expect(sources['valley/PlaceScene.tsx']).toContain("from '../ui/Nameplate'");
  });
});

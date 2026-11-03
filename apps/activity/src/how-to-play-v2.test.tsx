import { GLOSSARY_SECTIONS, GLOSSARY_SECTIONS_V2, content, glossaryEntry } from '@creatures/game';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HowToPlay } from './HowToPlay';
import { SectionArt } from './HowToPlayArt';
import { V2_KEPT_SECTIONS, pageSections, sectionOnPage } from './how-to-pages';
import {
  BOARD_EXAMPLE_MOVE,
  markExample,
  rankPicture,
  weekendStrip,
  exampleSpecies,
} from './howto';
import { PopoverHost } from './PopoverHost';
import { KeywordText } from './ui/KeywordText';
import { FakeElement, byClass, byName, createPage, find, visibleText, type Page } from './test-dom';

let page: Page | null = null;

beforeEach(() => {
  // The popover places itself against the window.
  // The page scrolls itself to the top when it opens; the fake elements have no such method.
  Reflect.set(FakeElement.prototype, 'scrollTo', () => undefined);
  Reflect.set(globalThis, 'window', {
    innerHeight: 800,
    innerWidth: 400,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
});

afterEach(() => {
  page?.unmount();
  page = null;
  Reflect.deleteProperty(globalThis, 'window');
  Reflect.deleteProperty(FakeElement.prototype, 'scrollTo');
});

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

describe('which sections the page shows', () => {
  it('shows the shipped twelve while combat v2 is off', () => {
    expect(pageSections(false).map((s) => s.id)).toEqual([...GLOSSARY_SECTIONS]);
  });

  it('shows the six combat v2 sections first, then the shipped ones it keeps, once combat v2 is on', () => {
    const ids = pageSections(true).map((s) => s.id);
    expect(ids.slice(0, 6)).toEqual([...GLOSSARY_SECTIONS_V2]);
    expect(ids.slice(6)).toEqual(
      GLOSSARY_SECTIONS.filter((s) => (V2_KEPT_SECTIONS as readonly string[]).includes(s)),
    );
    for (const gone of ['first-week', 'creatures', 'combos', 'raid-week', 'finale', 'ranks']) {
      expect(ids, gone).not.toContain(gone);
    }
  });

  it('sends a link to the section that took over a gone one, and to the top when nothing did', () => {
    expect(sectionOnPage('gear', true)).toBe('gear');
    expect(sectionOnPage('combos', true)).toBe('v2-marks');
    expect(sectionOnPage('creatures', true)).toBe('v2-knacks');
    expect(sectionOnPage('finale', true)).toBe('v2-weekend');
    expect(sectionOnPage('ranks', true)).toBe('v2-rank');
    expect(sectionOnPage('first-week', true)).toBeNull();
    expect(sectionOnPage(null, true)).toBeNull();
    // The shipped page is untouched.
    expect(sectionOnPage('combos', false)).toBe('combos');
    expect(sectionOnPage('v2-marks', false)).toBeNull();
  });
});

describe('the pictures of the combat v2 page', () => {
  it('draws one for each of the six sections, from the game’s own pieces', () => {
    for (const id of GLOSSARY_SECTIONS_V2) {
      page?.unmount();
      page = createPage();
      page.draw(
        <PopoverHost onOpenHowTo={() => undefined}>
          <SectionArt id={id} />
        </PopoverHost>,
      );
      expect(find(page.root, () => true).length, id).toBeGreaterThan(1);
    }
  });

  it('shows the weekend with the schedule’s days: stage 1 and 2 on the weekend, the finale on Sunday', () => {
    expect(weekendStrip().map((s) => [s.event, s.title, s.day])).toEqual([
      ['phase1', 'Stage 1', 'Sat'],
      ['phase2', 'Stage 2', 'Sun'],
      ['finale', 'Live finale', 'Sun'],
    ]);
    const moved = { phase1: { weekday: 5 }, phase2: { weekday: 6 }, finale: { weekday: 7 } };
    expect(weekendStrip(moved).map((s) => s.day)).toEqual(['Fri', 'Sat', 'Sun']);
  });

  it('marks with the worked example: its Setter and Payoff, a mark of two and an older one of another element', () => {
    const example = markExample();
    expect(example?.setter).toBe('splashet');
    expect(content.creatures.find((c) => c.id === example?.payoff)?.role).toBe('payoff');
    expect(example?.marks).toHaveLength(2);
    expect(example?.marks[0]?.count).toBe(2);
    expect(example?.marks[0]?.element).not.toBe(example?.marks[1]?.element);
    expect(exampleSpecies('setter')?.id).toBe(example?.setter);
  });

  it('names the board’s example move with words the page teaches', () => {
    const board =
      pageSections(true)
        .find((s) => s.id === 'v2-board')
        ?.lines.join(' ') ?? '';
    expect(board).toContain(BOARD_EXAMPLE_MOVE.target);
    expect(board).toContain(BOARD_EXAMPLE_MOVE.shape);
  });

  it('ticks the first boss of the track, lights the second and hides the rest', () => {
    const picture = rankPicture();
    expect(picture.map((p) => p.state)).toEqual(['beaten', 'current', 'later', 'later']);
    expect(picture.map((p) => p.boss)).toEqual(['tidal-colossus', 'cinder-wyrm', null, null]);
    for (const { boss } of picture) {
      if (boss !== null)
        expect(
          content.bosses.some((b) => b.id === boss),
          boss,
        ).toBe(true);
    }
  });
});

describe('a keyword chip', () => {
  it('is tap-for-help: a button that opens the keyword’s entry', () => {
    page = createPage();
    page.draw(
      <PopoverHost onOpenHowTo={() => undefined}>
        <p>
          <KeywordText text="{Spend}s all of them. Its {Crit}s are bigger." />
        </p>
      </PopoverHost>,
    );
    const chip = first(byName(page.root, 'button', 'Spends'));
    expect(chip.getAttribute('data-glossary-tag')).not.toBeNull();
    expect(byName(page.root, 'button', 'Crits')).toHaveLength(1);
    page.click(chip);
    const entry = glossaryEntry('kw-spend');
    expect(entry?.title).toBe('Spend');
    expect(visibleText(page.root)).toContain(entry?.short ?? '?');
  });

  it('is plain text with help off, for a chip inside a button', () => {
    page = createPage();
    page.draw(
      <PopoverHost onOpenHowTo={() => undefined}>
        <button type="button">
          <KeywordText text="{Mark} the boss" help={false} />
        </button>
      </PopoverHost>,
    );
    expect(byName(page.root, 'button', /.*/)).toHaveLength(1);
    expect(byClass(page.root, 'tag')).toHaveLength(1);
    expect(visibleText(page.root)).toBe('Mark the boss');
  });

  it('is plain text without a popover host, and for a word with no entry', () => {
    page = createPage();
    page.draw(
      <p>
        <KeywordText text="{Mark} and {Nothing}" />
      </p>,
    );
    expect(byName(page.root, 'button', /.*/)).toHaveLength(0);
    expect(visibleText(page.root)).toBe('Mark and Nothing');
  });
});

describe('the page', () => {
  it('draws the combat v2 sections with chips in their lines when combat v2 is on, the shipped ones when off', () => {
    page = createPage();
    page.draw(
      <PopoverHost onOpenHowTo={() => undefined}>
        <HowToPlay section={null} nonce={0} onClose={() => undefined} v2 />
      </PopoverHost>,
    );
    const text = visibleText(page.root);
    expect(text).toContain('Marks and reactions');
    expect(text).toContain('The Boss Rank');
    expect(text).not.toContain('Combos');
    // A keyword in a line is a chip button, not braces.
    expect(text).not.toContain('{');
    expect(byName(page.root, 'button', 'Mark').length).toBeGreaterThan(0);

    page.draw(
      <PopoverHost onOpenHowTo={() => undefined}>
        <HowToPlay section={null} nonce={0} onClose={() => undefined} />
      </PopoverHost>,
    );
    const shipped = visibleText(page.root);
    expect(shipped).toContain('Combos');
    expect(shipped).not.toContain('Marks and reactions');
  });
});

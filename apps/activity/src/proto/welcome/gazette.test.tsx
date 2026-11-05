import { afterEach, describe, expect, it, vi } from 'vitest';
import { GearItemsContext } from '../../gear-items-context';
import { PopoverHost } from '../../PopoverHost';
import {
  byClass,
  byName,
  byRole,
  createPage,
  visibleText,
  type FakeElement,
  type Page,
} from '../../test-dom';
import { Finds, MAX_ROW, rowEntries, splitRow } from './Gazette';
import { welcomeOf, type Find, type Story } from './highlights';
import { StoryPlate, resetClosed } from './PlaceStories';
import { DAILY, WEEKLY } from './journey';
import { castOf, markerBubbles, welcomeWorld } from './welcome-world';

/**
 * The Gazette's finds are the game's own Find components: a piece opens its full item card in a popover, a
 * blueprint and a newcomer are the same boxes as in a trip's haul, parts are tappable count badges. Played
 * from the prototype's sample world, so the ids are real.
 */

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
  resetClosed();
  vi.unstubAllGlobals();
});

const world = welcomeWorld();
const cast = castOf(world);

function draw(finds: Find[]): Page {
  // A phone: no hover, so a tap is how a piece opens.
  if (!('window' in globalThis)) {
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
  }
  page = createPage();
  page.draw(
    <PopoverHost onOpenHowTo={() => undefined}>
      <GearItemsContext.Provider value={world.items}>
        <Finds finds={finds} label="Found" />
      </GearItemsContext.Provider>
    </PopoverHost>,
  );
  return page;
}

const first = (list: FakeElement[]): FakeElement => {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
};

describe('the sample cast of the welcome-back popup', () => {
  it('shows pieces of the sample bag by their inventory id, one of every rarity', () => {
    const ids = world.items.map((i) => i.id);
    for (const piece of cast.pieces) expect(ids).toContain(piece.id);
    expect(new Set(cast.pieces.map((p) => p.rarity))).toEqual(new Set(['common', 'rare', 'epic']));
    expect(cast.blueprints.length).toBeGreaterThan(0);
    expect(cast.creatures.every((c) => c.level > 0)).toBe(true);
  });

  it('turns the markers of what the popup did not tell into the valley’s bubbles', () => {
    const welcome = welcomeOf(DAILY, 0, cast);
    const bubbles = markerBubbles(welcome.markers);
    expect(bubbles).toHaveLength(welcome.markers.length);
  });

  it('shows a piece of the bag in every visit that has a piece story, with a card to open', () => {
    for (const journey of [DAILY, WEEKLY]) {
      for (let i = 0; i < journey.visits.length; i += 1) {
        for (const story of welcomeOf(journey, i, cast).highlights) {
          if (story.kind !== 'piece') continue;
          expect(story.finds.length).toBeGreaterThan(0);
          for (const f of story.finds) {
            if (f.kind === 'item') expect(world.items.map((x) => x.id)).toContain(f.piece.id);
          }
        }
      }
    }
  });
});

describe('what a story found', () => {
  it('shows a piece as a find that opens its full item card on a tap', () => {
    const piece = cast.pieces.find((p) => p.rarity === 'epic');
    if (piece === undefined) throw new Error('the sample bag has no epic piece');
    const p = draw([{ kind: 'item', piece }]);
    const button = first(byClass(p.root, 'find-row-button'));
    expect(button.getAttribute('aria-label')).toContain('Details');
    expect(byRole(p.root, 'dialog')).toHaveLength(0);
    p.click(button);
    expect(byRole(p.root, 'dialog')).toHaveLength(1);
    expect(byClass(p.root, 'idc')).toHaveLength(1);
  });

  it('shows a blueprint and a newcomer as their small pictures, named for screen readers', () => {
    const baseId = cast.blueprints[0];
    if (baseId === undefined) throw new Error('the sample world has no blueprint');
    const p = draw([
      { kind: 'blueprint', baseId },
      { kind: 'newcomer', species: 'cindle' },
    ]);
    const labels = byClass(p.root, 'find-row-button')
      .concat(byClass(p.root, 'find-compact-help'))
      .map((el) => el.getAttribute('aria-label') ?? '');
    expect(labels.some((l) => l.startsWith('Blueprint:'))).toBe(true);
    expect(labels.some((l) => l.startsWith('New:'))).toBe(true);
    // Never the big boxes, in the Gazette too (Misa, 2026-11-04).
    expect(byClass(p.root, 'find-card')).toHaveLength(0);
  });

  it('shows parts as count badges in the same row', () => {
    const p = draw([{ kind: 'parts', parts: [{ part: 'scrap', amount: 120 }] }]);
    expect(byClass(p.root, 'part-count')).toHaveLength(1);
    expect(visibleText(p.root)).toContain('120');
  });

  it('draws nothing for a story with no finds', () => {
    const p = draw([]);
    expect(byClass(p.root, 'wb-finds')).toHaveLength(0);
  });
});

describe('a place telling its waiting stories', () => {
  /** A phone: no hover. The plate is drawn on its own (the creatures' strip is only for a place with no floor). */
  function drawPlate(stories: readonly Story[], place = 'school'): Page {
    if (!('window' in globalThis)) {
      vi.stubGlobal('window', {
        matchMedia: () => ({ matches: false }),
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      });
    }
    page = createPage();
    page.draw(
      <PopoverHost onOpenHowTo={() => undefined}>
        <StoryPlate waiting={{ stories, cast, items: world.items }} stage={false} place={place} />
      </PopoverHost>,
    );
    return page;
  }

  /** The untold stories of the weekly player's last visit that wait at the Signpost. */
  const waiting = (): Story[] => {
    const w = welcomeOf(WEEKLY, WEEKLY.visits.length - 1, cast);
    return w.markers.find((m) => m.place === 'signpost')?.stories ?? [];
  };

  it('tells each story as the Gazette does, a headline and its line, in the order given', () => {
    const stories = waiting();
    expect(stories.length).toBeGreaterThan(0);
    const p = drawPlate(stories);
    const text = visibleText(p.root);
    let at = -1;
    for (const s of stories) {
      const next = text.indexOf(s.headline);
      expect(next).toBeGreaterThan(at);
      at = next;
      if (s.blurb !== '') expect(text).toContain(s.blurb);
    }
    expect(byClass(p.root, 'wb-brief-headline')).toHaveLength(stories.length);
  });

  it('shows the finds as the shared Find components, a piece opening its full card on a tap', () => {
    const stories = waiting().filter((s) => s.finds.some((f) => f.kind === 'item'));
    expect(stories.length).toBeGreaterThan(0);
    const p = drawPlate(stories);
    const button = first(byClass(p.root, 'find-row-button'));
    p.click(button);
    expect(byRole(p.root, 'dialog')).toHaveLength(1);
    expect(byClass(p.root, 'idc')).toHaveLength(1);
  });

  it('draws nothing when no story waits', () => {
    const p = drawPlate([]);
    expect(byClass(p.root, 'wb-clip')).toHaveLength(0);
  });

  it('shows a story’s finds as one small row, never as boxes one under another', () => {
    const stories = waiting().filter((s) => s.finds.length > 0);
    const p = drawPlate(stories);
    const lists = byClass(p.root, 'find-list').filter((el) =>
      (el.getAttribute('class') ?? '').split(/\s+/).includes('compact'),
    );
    expect(lists.length).toBe(stories.length);
    expect(byClass(p.root, 'find-card')).toHaveLength(0);
    // A small find has its picture only: no name or tags beside it (the name is for screen readers).
    expect(byClass(p.root, 'find-row-tags')).toHaveLength(0);
  });
});

describe('closing a place’s stories', () => {
  const stories = (): Story[] =>
    welcomeOf(WEEKLY, WEEKLY.visits.length - 1, cast).markers.flatMap((m) => m.stories);

  function drawPlate(place: string): Page {
    if (!('window' in globalThis)) {
      vi.stubGlobal('window', {
        matchMedia: () => ({ matches: true }),
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      });
    }
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    page = createPage();
    page.draw(
      <PopoverHost onOpenHowTo={() => undefined}>
        <StoryPlate
          waiting={{ stories: stories(), cast, items: world.items }}
          stage={false}
          place={place}
        />
      </PopoverHost>,
    );
    return page;
  }

  it('is the shared Alert with its X, and has no Hide word or "N stories" chip', () => {
    const p = drawPlate('school');
    expect(byClass(p.root, 'alert')).toHaveLength(1);
    expect(byClass(p.root, 'wb-clip')).toHaveLength(1);
    expect(byName(p.root, 'button', 'Close the stories')).toHaveLength(1);
    expect(visibleText(p.root)).not.toMatch(/\bHide\b/);
    expect(byClass(p.root, 'wb-clip-chip')).toHaveLength(0);
  });

  it('closes on the X and stays closed for that place only when it is visited again', () => {
    let p = drawPlate('school');
    p.click(first(byName(p.root, 'button', 'Close the stories')));
    expect(byClass(p.root, 'wb-clip')).toHaveLength(0);
    p.unmount();
    page = null;
    p = drawPlate('school');
    expect(byClass(p.root, 'wb-clip')).toHaveLength(0);
    expect(byClass(p.root, 'wb-clip-chip')).toHaveLength(0);
    p.unmount();
    page = null;
    p = drawPlate('forge');
    expect(byClass(p.root, 'wb-clip')).toHaveLength(1);
  });
});

describe('a small row of finds', () => {
  const pieces = cast.pieces.map((piece) => ({ kind: 'item', piece }) as const);
  const six: Find[] = pieces.slice(0, 6);

  it('holds a few entries and counts the rest, parts one badge each', () => {
    const entries = rowEntries([
      {
        kind: 'parts',
        parts: [
          { part: 'scrap', amount: 3 },
          { part: 'tide-shard', amount: 2 },
        ],
      },
      ...pieces.slice(0, 2),
    ]);
    expect(entries.map((e) => e.kind)).toEqual(['part', 'part', 'item', 'item']);
    const four = splitRow(entries, 0, false);
    expect(four.shown).toHaveLength(MAX_ROW);
    expect(four.more).toBe(0);
    const more = splitRow(rowEntries(six), 0, false);
    expect(more.shown).toHaveLength(MAX_ROW);
    expect(more.hidden).toBe(six.length - MAX_ROW);
    expect(more.more).toBe(six.length - MAX_ROW);
    // Tapped, everything shows; what has no picture stays a written count.
    const open = splitRow(rowEntries(six), 3, true);
    expect(open.shown).toHaveLength(six.length);
    expect(open.hidden).toBe(0);
    expect(open.more).toBe(3);
  });

  it('writes "+N more" as a button that shows the rest, and the row stays tappable piece by piece', () => {
    page?.unmount();
    page = createPage();
    page.draw(
      <PopoverHost onOpenHowTo={() => undefined}>
        <GearItemsContext.Provider value={world.items}>
          <Finds finds={six} label="Found" />
        </GearItemsContext.Provider>
      </PopoverHost>,
    );
    const root = page.root;
    const shown = (): number => byClass(root, 'find-row-button').length;
    expect(shown()).toBe(MAX_ROW);
    const button = first(byClass(page.root, 'wb-more-button'));
    expect(visibleText(button)).toBe(`+${String(six.length - MAX_ROW)} more`);
    page.click(button);
    expect(shown()).toBe(six.length);
    expect(byClass(page.root, 'wb-more-button')).toHaveLength(0);
  });

  it('says what has no picture as plain text, not a button', () => {
    page?.unmount();
    page = createPage();
    page.draw(
      <PopoverHost onOpenHowTo={() => undefined}>
        <GearItemsContext.Provider value={world.items}>
          <Finds finds={six.slice(0, 2)} label="Found" unshown={5} />
        </GearItemsContext.Provider>
      </PopoverHost>,
    );
    expect(byClass(page.root, 'wb-more-button')).toHaveLength(0);
    expect(visibleText(first(byClass(page.root, 'wb-more-note')))).toBe('+5 more');
  });
});

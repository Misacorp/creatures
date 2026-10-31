import { afterEach, describe, expect, it, vi } from 'vitest';
import { GearItemsContext } from '../../gear-items-context';
import { PopoverHost } from '../../PopoverHost';
import {
  byClass,
  byRole,
  createPage,
  visibleText,
  type FakeElement,
  type Page,
} from '../../test-dom';
import { Finds } from './Gazette';
import { welcomeOf, type Find } from './highlights';
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

  it('shows a blueprint and a newcomer as the shared find boxes', () => {
    const baseId = cast.blueprints[0];
    if (baseId === undefined) throw new Error('the sample world has no blueprint');
    const p = draw([
      { kind: 'blueprint', baseId },
      { kind: 'newcomer', species: 'cindle' },
    ]);
    expect(visibleText(p.root)).toContain('Blueprint:');
    expect(byClass(p.root, 'find-card')).toHaveLength(1);
    expect(visibleText(p.root)).toContain('New!');
  });

  it('shows parts as count badges that open their help', () => {
    const p = draw([{ kind: 'parts', parts: [{ part: 'scrap', amount: 120 }] }]);
    expect(byClass(p.root, 'part-count')).toHaveLength(1);
    expect(visibleText(p.root)).toContain('120');
  });

  it('draws nothing for a story with no finds', () => {
    const p = draw([]);
    expect(byClass(p.root, 'wb-finds')).toHaveLength(0);
  });
});

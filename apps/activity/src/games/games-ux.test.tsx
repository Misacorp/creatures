import { RULES, gamesFavourHelp } from '@creatures/game';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PopoverHost } from '../PopoverHost';
import { gamesXpParts } from '../games-view';
import type { GamesResult } from '../games-types';
import { MORE_LABEL } from '../glossary-ui';
import {
  FakeElement,
  byClass,
  byName,
  byRole,
  createPage,
  visibleText,
  type Page,
} from '../test-dom';
import { GAMES_FIXTURES, gamesRoster } from '../workbench/games-tab-sample';
import { gamesFit } from './art/GamesScene';
import { EventCard } from './GamesParts';
import { GamesResults } from './GamesResults';

/**
 * Misa's phone test (2026-10-23): a favour icon says what it means in that event and links to the
 * Games' part of How to play; each XP row shows where its experience came from; the scene fills a
 * phone's width.
 */
let page: Page | null = null;

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});

afterEach(() => {
  page?.unmount();
  page = null;
  vi.unstubAllGlobals();
});

const LINEUP = GAMES_FIXTURES.entries.next.lineup;

describe('a favour icon in the Games', () => {
  beforeEach(() => {
    // The little the fake DOM leaves out that the popover asks a browser for (its place on the page).
    vi.stubGlobal('window', {
      innerHeight: 800,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    Reflect.set(FakeElement.prototype, 'getBoundingClientRect', () => ({
      top: 0,
      left: 0,
      width: 10,
      height: 10,
    }));
  });

  afterEach(() => {
    Reflect.deleteProperty(FakeElement.prototype, 'getBoundingClientRect');
  });

  it("opens the favour's Games line, its name and a link to the Games in How to play", () => {
    const event = LINEUP[0];
    if (event === undefined) throw new Error('no event');
    const favour = event.favours[0];
    if (favour === undefined) throw new Error('no favour');
    const onHowTo = vi.fn();
    page = createPage();
    page.draw(
      <PopoverHost onOpenHowTo={onHowTo}>
        <ul>
          <EventCard event={event} next={GAMES_FIXTURES.entries.next} creatures={gamesRoster()} />
        </ul>
      </PopoverHost>,
    );
    const icons = byClass(page.root, 'ge-favour');
    expect(icons).toHaveLength(event.favours.length);
    const [icon] = icons;
    if (icon === undefined) throw new Error('no icon');
    page.click(icon);
    const dialog = byRole(page.root.parentNode ?? page.root, 'dialog')[0];
    if (dialog === undefined) throw new Error('no popover');
    const note = gamesFavourHelp(favour);
    expect(note).toMatch(/have an advantage here\.$/u);
    expect(visibleText(byClass(dialog, 'pop-short')[0] ?? dialog)).toBe(note);
    // The icon is the picture; the general glossary text is not there.
    expect(byClass(dialog, 'pop-visual')).toHaveLength(1);
    expect(byClass(dialog, 'pop-lines')).toHaveLength(0);
    const [more] = byName(dialog, 'button', MORE_LABEL);
    if (more === undefined) throw new Error('no link');
    page.click(more);
    expect(onHowTo).toHaveBeenCalledWith('games');
  });
});

function result(over: Partial<GamesResult>): GamesResult {
  return {
    eventId: 'melon-run',
    creatureIds: ['a'],
    place: 1,
    medal: 'gold',
    pin: false,
    pins: [],
    xp: 0,
    ...over,
  };
}

describe('where a creature’s Games experience came from', () => {
  const xp = RULES.games.xp;

  it('is entering, the medal and the pin, as the server pays', () => {
    expect(gamesXpParts(result({}), 'a')).toEqual([
      { kind: 'enter', xp: xp.enter },
      { kind: 'medal', medal: 'gold', xp: xp.place[0] },
    ]);
    expect(gamesXpParts(result({ medal: 'bronze', place: 3, pins: ['a'] }), 'a')).toEqual([
      { kind: 'enter', xp: xp.enter },
      { kind: 'medal', medal: 'bronze', xp: xp.place[2] },
      { kind: 'pin', xp: xp.pin },
    ]);
    // Off the podium: entering only; a teammate's pin is not yours.
    expect(gamesXpParts(result({ medal: null, place: 6, pins: ['b'] }), 'a')).toEqual([
      { kind: 'enter', xp: xp.enter },
    ]);
  });

  it('shows each reason beside the name, and the place off the podium', () => {
    const roster = gamesRoster();
    const [one, two] = roster;
    if (one === undefined || two === undefined) throw new Error('no roster');
    const results = [
      result({
        eventId: 'melon-run',
        creatureIds: [one.id],
        pins: [one.id],
        pin: true,
        xp: xp.enter + (xp.place[0] ?? 0) + xp.pin,
      }),
      result({
        eventId: 'pepper-panic',
        creatureIds: [two.id],
        place: 6,
        medal: null,
        xp: xp.enter,
      }),
    ];
    page = createPage();
    page.draw(<GamesResults results={results} lineup={LINEUP} creatures={roster} />);
    const rows = byClass(page.root, 'xp-row');
    expect(rows).toHaveLength(2);
    const parts = (i: number): string[] =>
      byClass(rows[i] ?? page!.root, 'gr-xp-part').map((el) => el.getAttribute('aria-label') ?? '');
    expect(parts(0)).toEqual([
      `${String(xp.enter)} for entering`,
      `${String(xp.place[0])} for gold`,
      `${String(xp.pin)} for a pin`,
    ]);
    expect(parts(1)).toEqual([`${String(xp.enter)} for entering`, '6th place']);
    expect(visibleText(byClass(rows[1] ?? page.root, 'gr-xp-parts')[0] ?? page.root)).toBe(
      `+${String(xp.enter)}6th`,
    );
    // The medal and the pin are pictures beside their numbers.
    expect(byClass(rows[0] ?? page.root, 'gm-medal')).toHaveLength(1);
    expect(byClass(rows[0] ?? page.root, 'gm-pin')).toHaveLength(1);
  });
});

describe('the scene on a phone', () => {
  it('fills the width: a whole scale, zoomed the rest of the way', () => {
    expect(gamesFit(360)).toEqual({ scale: 1, zoom: 1.875 });
    expect(gamesFit(390)).toEqual({ scale: 2, zoom: 1.0156 });
    expect(gamesFit(412)).toEqual({ scale: 2, zoom: 1.0729 });
  });

  it('stays whole where the width is a whole multiple, and never shrinks', () => {
    expect(gamesFit(384)).toEqual({ scale: 2, zoom: 1 });
    expect(gamesFit(576)).toEqual({ scale: 3, zoom: 1 });
    expect(gamesFit(150)).toEqual({ scale: 1, zoom: 1 });
  });
});

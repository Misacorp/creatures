/**
 * The adopted fixes of the phase 4 panel review (`docs/design/valley/reviews/2026-11-05-phase4-shell.md`), one
 * test for each behaviour that has no test of its own file: props in depth order, whole-number scales, the
 * Places list's order, the arena's timing, the wide paddock, the Gazette's note, picture crop and gains, the HUD's way back.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AwaySource, AwaySummary } from '../api';
import { Hud } from '../Hud';
import { PopoverHost } from '../PopoverHost';
import { byClass, byName, createPage, find, type Page } from '../test-dom';
import { Nameplate } from '../ui/Nameplate';
import { HOME_NOW, homeInput } from '../workbench/home-sample';
import { PlaceScene } from './PlaceScene';
import { TrayCreature } from './Tray';
import { placesLabel } from './ValleyFrame';
import { wholeObjects } from './gazette/SceneCrop';
import { gainsText } from './gazette/coming-home';
import { gazetteOf, homeNote, paperGains, awayGains, type AwayWorld } from './gazette/stories';
import { CREATURE_PX, castFor, type CastInput } from './place-cast';
import { WORLD_MAP_SPRITE_DATA } from '../sprites/data/world-map-sprites';
import { roamPlan, standBounds } from './place-plates';
import { PROPS, frontProps, propDepth } from './place-props';
import {
  BAND_ROWS,
  artSize,
  BOSS_ASIDE,
  bandArtBox,
  bandScale,
  placeScale,
  skyBackdrop,
  placeSceneDraw,
  treesAround,
} from './place-scene';
import { LIVE_WINDOW_MS, listOrder, raidTiming, type PlaceBubble } from './place-state';
import { sceneScale } from './scale';
import { sceneGeometry } from './SceneFrame';
import { EDGE_CHIP, fitValley, readingOrder, depthOf, VALLEY_SCALE } from './valley-logic';
import { OPEN_PLACES } from './valley-nav';
import { glowSprite, type MapName } from './valley-places';
import { TILE } from './valley-art';

let page: Page | null = null;
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );
});
afterEach(() => {
  page?.unmount();
  page = null;
  vi.unstubAllGlobals();
});

const base = homeInput('busy', true);
const ART = { width: 64, height: 54 };
const input = (extra: Partial<CastInput> = {}): CastInput => ({
  ...base,
  dungeonTeam: null,
  dungeonPhase: null,
  waiting: [],
  now: HOME_NOW,
  ...extra,
});

describe('props stand in the creatures’ depth order (row 2)', () => {
  it('each prop is cut from its place’s art, with its ground left out', () => {
    for (const [name, specs] of Object.entries(PROPS) as [MapName, (typeof PROPS)[MapName]][]) {
      const art = glowSprite(name);
      const props = frontProps(name);
      expect(props).toHaveLength(specs?.length ?? 0);
      for (const prop of props) {
        expect(prop.sprite.palette).toBe(art.palette);
        expect(prop.sprite.rows.length).toBeGreaterThan(0);
        expect(prop.bottom).toBe(prop.y + prop.sprite.rows.length);
        let solid = 0;
        prop.sprite.rows.forEach((row, dy) => {
          [...row].forEach((key, dx) => {
            if (key === '.') return;
            solid += 1;
            // A kept pixel is the art's own pixel at the same place.
            expect(art.rows[prop.y + dy]?.[prop.x + dx]).toBe(key);
          });
        });
        expect(solid).toBeGreaterThan(0);
      }
    }
  });

  it('the paddock’s feed box and front rails, the arena’s rim and the fairground’s posts are props', () => {
    expect(frontProps('paddock').length).toBeGreaterThanOrEqual(5);
    expect(frontProps('arena').length).toBeGreaterThan(0);
    expect(frontProps('fairground')).toHaveLength(2);
    expect(frontProps('cave')).toEqual([]);
  });

  it('a creature with its feet below a prop’s bottom edge is drawn over it; one behind is drawn under it', () => {
    const [hay] = frontProps('paddock').filter((p) => p.x === 13 && p.y === 15);
    if (hay === undefined) throw new Error('no hay');
    const artX = 40;
    const artY = 30;
    const z = propDepth(artX, artY, hay);
    const feetAt = (feetY: number, x = artX + hay.x): number => depthOf(x, feetY - CREATURE_PX);
    expect(feetAt(artY + hay.bottom + 1)).toBeGreaterThan(z);
    expect(feetAt(artY + hay.bottom - 1)).toBeLessThan(z);
    // Level feet to the right of the prop's left edge stand in front (ties by x, as for creatures).
    expect(feetAt(artY + hay.bottom, artX + hay.x + 1)).toBeGreaterThan(z);
  });

  it('the scene draws every prop of its place as a layer of its own', () => {
    const p = createPage();
    page = p;
    p.draw(
      <PopoverHost onOpenHowTo={() => undefined}>
        <PlaceScene cast={castFor('paddock', input(), ART, [])} onAct={() => undefined} />
      </PopoverHost>,
    );
    expect(byClass(p.root, 'vy-prop')).toHaveLength(frontProps('paddock').length);
    p.unmount();
    page = null;
    const house = createPage();
    page = house;
    house.draw(
      <PopoverHost onOpenHowTo={() => undefined}>
        <PlaceScene cast={castFor('house', input(), ART, [])} onAct={() => undefined} />
      </PopoverHost>,
    );
    expect(byClass(house.root, 'vy-prop')).toHaveLength(0);
  });
});

describe('every scene scales by a whole number (row 17 check)', () => {
  const widths = [280, 320, 360, 390, 412, 600, 699, 700, 768, 900, 1100, 1440, 1920];
  const heights = [500, 700, 844, 1000];

  it('the scene scales are whole numbers at every width and height', () => {
    for (const w of widths) {
      expect(Number.isInteger(sceneScale(w)), `scene ${String(w)}`).toBe(true);
      expect(Number.isInteger(bandScale(w)), `band ${String(w)}`).toBe(true);
      for (const h of heights) {
        for (const name of ['bonfire', 'school', 'visitor', 'market'] as const) {
          expect(
            Number.isInteger(placeScale(w, h, name)),
            `${name} ${String(w)}x${String(h)}`,
          ).toBe(true);
        }
        const g = sceneGeometry(w, h, sceneScale(w));
        expect(Number.isInteger(g.s) && Number.isInteger(g.W) && Number.isInteger(g.H)).toBe(true);
        expect(Number.isInteger(g.W * g.s)).toBe(true);
      }
    }
  });

  it('the valley map’s scale is a whole number, and a band’s height is a whole number of scene pixels', () => {
    expect(Number.isInteger(VALLEY_SCALE)).toBe(true);
    for (const w of widths) {
      expect(Number.isInteger(fitValley(w, 700).scale)).toBe(true);
      expect(Number.isInteger(BAND_ROWS * bandScale(w))).toBe(true);
    }
  });

  it('no placement of a scene sits on a fractional scene pixel', () => {
    for (const name of ['bonfire', 'school', 'visitor', 'market'] as const) {
      const g = sceneGeometry(390, 780, placeScale(390, 780, name));
      for (const p of [...placeSceneDraw(name)(g), ...skyBackdrop(g)]) {
        expect(Number.isInteger(p.x) && Number.isInteger(p.y), name).toBe(true);
      }
    }
    const art = artSize('arena');
    const box = bandArtBox(sceneGeometry(390, BAND_ROWS * 3, 3), 'arena');
    expect(Number.isInteger(box.x) && Number.isInteger(box.y)).toBe(true);
    expect(art.width).toBeGreaterThan(0);
  });

  it('every tree of a scene stands on the grass: its base is at or under the line where the hills end', () => {
    const art = { width: 60, height: 50 };
    for (const y of [20, 28, 8 + 6]) {
      const grass = y + 14;
      const trees = treesAround(100, y, art).filter(
        (p) =>
          p.sprite === WORLD_MAP_SPRITE_DATA.smallTree ||
          p.sprite === WORLD_MAP_SPRITE_DATA.smallPine,
      );
      expect(trees).toHaveLength(4);
      for (const t of trees) expect(t.y + t.sprite.rows.length).toBeGreaterThanOrEqual(grass);
    }
  });

  it('the arena’s boss and the art stand centred together in the band: equal room each side', () => {
    const g = sceneGeometry(390, BAND_ROWS * 3, 3);
    const box = bandArtBox(g, 'arena', BOSS_ASIDE);
    const left = box.x;
    const right = g.W - (box.x + box.width + BOSS_ASIDE);
    expect(Math.abs(left - right)).toBeLessThanOrEqual(2);
    expect(bandArtBox(g, 'arena').x).toBeGreaterThan(box.x);
  });
});

describe('the Places list and button (row 6)', () => {
  const waiting = (place: PlaceBubble['place']): PlaceBubble => ({
    place,
    glyph: 'unknown',
    count: null,
    spoken: 'waits',
  });

  it('puts what waits first, then the open places, then the four not open yet last', () => {
    const order = listOrder([waiting('forge'), waiting('cave')]);
    expect(order.slice(0, 2)).toEqual(['cave', 'forge']);
    expect(order).toHaveLength(readingOrder().length);
    expect(new Set(order).size).toBe(order.length);
    const open = order.slice(2, 2 + (OPEN_PLACES.length - 2));
    for (const id of open) expect((OPEN_PLACES as readonly string[]).includes(id)).toBe(true);
    expect(order.slice(-4).sort()).toEqual(['bonfire', 'market', 'school', 'visitor']);
  });

  it('with nothing waiting: the open places in the map’s order, then the new ones', () => {
    const order = listOrder([]);
    expect(order.slice(0, 7)).toEqual(
      readingOrder().filter((id) => OPEN_PLACES.includes(id as never)),
    );
    expect(order.slice(7).sort()).toEqual(['bonfire', 'market', 'school', 'visitor']);
  });

  it('the Places button says how many places wait', () => {
    expect(placesLabel(0)).toBe('Places');
    expect(placesLabel(3)).toBe('Places, 3 waiting');
  });
});

describe('edge chips are tap targets of at least 44 px (row 5)', () => {
  it('the chip’s target is 44 px tall and wide', () => {
    expect(EDGE_CHIP.height).toBeGreaterThanOrEqual(44);
    expect(EDGE_CHIP.width).toBeGreaterThanOrEqual(44);
  });
});

describe('the Arena band’s timing (row 12)', () => {
  const raid = (finale: number) =>
    ({ schedule: { weekStart: 0, weekStartAt: 0, phase1: 0, phase2: 0, finale } }) as never;
  // 2026-11-07 is a Saturday; the guild's timezone is Helsinki.
  const SAT = Date.UTC(2026, 10, 7, 17, 0);
  const TZ = 'Europe/Helsinki';

  it('names the weekday, "today" on the day, "live now" while it plays, nothing after', () => {
    expect(raidTiming(raid(SAT), SAT - 3 * 86_400_000, TZ)).toBe('Saturday');
    expect(raidTiming(raid(SAT), SAT - 3_600_000, TZ)).toBe('today');
    expect(raidTiming(raid(SAT), SAT + 60_000, TZ)).toBe('live now');
    expect(raidTiming(raid(SAT), SAT + LIVE_WINDOW_MS + 1, TZ)).toBeNull();
    expect(raidTiming(raid(SAT), SAT - 86_400_000 * 2, TZ)).toBe('Saturday');
  });

  it('says nothing before the raid view or the timezone is known', () => {
    expect(raidTiming(null, SAT, TZ)).toBeNull();
    expect(raidTiming(raid(SAT), SAT - 1000, null)).toBeNull();
  });

  it('the band shows it as a small label under the boss, with its spoken name; no HP', () => {
    const glance = {
      ...(base.raid ?? { schedule: {} as never }),
      schedule: { ...(base.raid?.schedule ?? ({} as never)), finale: HOME_NOW + 3 * 86_400_000 },
      scene: { boss: { id: 'old-bogback', name: 'Old Bogback' }, party: [] },
    };
    const cast = castFor('arena', input({ raid: glance }), ART, []);
    expect(cast.timing).not.toBeNull();
    const p = createPage();
    page = p;
    p.draw(
      <PopoverHost onOpenHowTo={() => undefined}>
        <PlaceScene cast={cast} onAct={() => undefined} />
      </PopoverHost>,
    );
    const label = find(
      p.root,
      (el) => el.getAttribute('aria-label')?.startsWith('Raid: ') === true,
    );
    expect(label).toHaveLength(1);
    expect(byClass(label[0] ?? p.root, 'nameplate')).toHaveLength(1);
    expect(label[0]?.textContent).not.toMatch(/HP|hp/);
  });
});

describe('the wide paddock uses the meadow’s whole height (row 13)', () => {
  it('at a scale of 4 the roam area reaches the foot of the scene; at 3 it keeps its own height', () => {
    const cast = castFor('paddock', input(), ART, []);
    const at = (s: number) => {
      const g = sceneGeometry(s === 4 ? 1100 : 390, BAND_ROWS * s, s);
      const art = bandArtBox(g, 'paddock');
      const scene = { W: g.W, H: g.H, s, top: g.top };
      return { plan: roamPlan(cast, art, scene), bounds: standBounds(scene) };
    };
    const wide = at(4);
    const narrow = at(3);
    if (wide.plan === null || narrow.plan === null) throw new Error('no roam plan');
    expect(wide.plan.area.y + wide.plan.area.height).toBe(wide.bounds.y + wide.bounds.height);
    expect(narrow.plan.area.height).toBeLessThanOrEqual(46);
  });
});

describe('the Gazette’s note, gains and picture crop (rows 7, 8, 15)', () => {
  const source = (kind: AwaySource['kind'], part: Partial<AwaySource> = {}): AwaySource => ({
    kind,
    bait: 0,
    essence: 0,
    items: 0,
    creatures: 0,
    medals: 0,
    xp: 0,
    ...part,
  });
  const world: AwayWorld = {
    creatures: [],
    items: [],
    blueprints: [],
    tray: { trips: [], jobs: [], now: 100 },
    games: null,
    raid: null,
  };

  it('says everything is home only when no trip or job waits; else what waits where', () => {
    expect(homeNote({ tripsWaiting: 0, jobsWaiting: 0 })).toBe(
      'Everything your creatures found is already home.',
    );
    expect(homeNote({ tripsWaiting: 2, jobsWaiting: 0 })).toBe(
      'Their trips wait to be claimed at the Signpost.',
    );
    expect(homeNote({ tripsWaiting: 0, jobsWaiting: 1 })).toBe(
      'Their jobs wait to be claimed at the Forge.',
    );
    expect(homeNote({ tripsWaiting: 1, jobsWaiting: 1 })).toBe(
      'Trips wait at the Signpost, jobs at the Forge.',
    );
  });

  it('what flies is what the paper shows, per currency', () => {
    const away: AwaySummary = {
      sources: [source('leet', { bait: 47 }), source('raid', { bait: 10, essence: 96, items: 1 })],
      since: 1,
      until: 2,
      tripsWaiting: 0,
      jobsWaiting: 0,
    };
    const plan = gazetteOf(away, world);
    const shown = (key: string): number =>
      plan.stories
        .flatMap((s) => s.badges)
        .filter((b) => b.key === key)
        .reduce((n, b) => n + (typeof b.amount === 'number' ? b.amount : 0), 0);
    expect(shown('essence')).toBe(96);
    expect(paperGains(plan.stories)).toEqual([
      { resource: 'bait', amount: shown('bait') },
      { resource: 'essence', amount: 96 },
    ]);
    // Everything shown: the flight is also the whole sum.
    expect(paperGains(plan.stories)).toEqual(awayGains(away));
  });

  it('a story the paper cuts brings no number to the flight (the paper never shows less than flies)', () => {
    const away: AwaySummary = {
      sources: [
        source('leet', { bait: 47 }),
        source('raid', { essence: 96, items: 1, creatures: 1 }),
        source('games', { medals: 2, xp: 180 }),
      ],
      since: 1,
      until: 2,
      tripsWaiting: 2,
      jobsWaiting: 1,
    };
    const plan = gazetteOf(away, world);
    const shownBait = plan.stories.some((s) => s.badges.some((b) => b.key === 'bait'));
    const flown = paperGains(plan.stories);
    expect(flown.some((g) => g.resource === 'bait')).toBe(shownBait);
    for (const g of flown) {
      const onPaper = plan.stories
        .flatMap((s) => s.badges)
        .filter((b) => b.key === g.resource)
        .reduce((n, b) => n + (typeof b.amount === 'number' ? b.amount : 0), 0);
      expect(g.amount).toBe(onPaper);
    }
  });

  it('the status words list the same amounts that fly', () => {
    expect(
      gainsText([
        { resource: 'bait', amount: 52 },
        { resource: 'essence', amount: 15 },
      ]),
    ).toBe('Home: +52 Bait, +15 Essence');
    expect(gainsText([])).toBe('');
  });

  it('a picture leaves out a neighbour its window would cut, and keeps whole ones and ground', () => {
    const sprite = (w: number, h: number) => ({
      palette: { a: '#fff' },
      rows: Array(h).fill('a'.repeat(w)),
    });
    const ground = { sprite: sprite(TILE, TILE), x: 0, y: 0 };
    const cutGround = { sprite: sprite(TILE, TILE), x: 96, y: 32 };
    const whole = { sprite: sprite(40, 30), x: 20, y: 20 };
    const cut = { sprite: sprite(40, 30), x: 30, y: 60 };
    const far = { sprite: sprite(40, 30), x: 300, y: 20 };
    const own = { sprite: sprite(64, 56), x: 90, y: 10 };
    const view = { x0: 0, y0: 0, x1: 100, y1: 80 };
    const kept = wholeObjects([ground, cutGround, whole, cut, far, own], view, { x: 100, y: 40 });
    expect(kept).toEqual([ground, cutGround, whole, far, own]);
    // Without the door in it, the same big object is cut away.
    expect(wholeObjects([own], view, { x: 5, y: 5 })).toEqual([]);
  });
});

describe('the HUD’s way back (row 1)', () => {
  const draw = (back: { label: string; onBack: () => void } | undefined): Page => {
    const p = createPage();
    page = p;
    p.draw(
      <PopoverHost onOpenHowTo={() => undefined}>
        <Hud
          title="Paddock"
          balances={{ bait: 1, essence: 2 }}
          helpRef={{ current: null }}
          onHelp={() => undefined}
          {...(back === undefined ? {} : { back })}
        />
      </PopoverHost>,
    );
    return p;
  };

  it('is a "‹" before the place’s name, spoken as its label, and the name stays the page’s one h1', () => {
    const onBack = vi.fn();
    const p = draw({ label: 'Back to the valley', onBack });
    const [button] = byName(p.root, 'button', 'Back to the valley');
    if (button === undefined) throw new Error('no back control');
    expect(button.textContent).toBe('‹');
    expect(button.getAttribute('class')).toContain('hud-back');
    p.click(button);
    expect(onBack).toHaveBeenCalledOnce();
    expect(byClass(p.root, 'hud-title').map((h) => h.textContent)).toEqual(['Paddock']);
    // It comes before the title in the bar.
    const bar = byClass(p.root, 'hud')[0];
    const order = (bar?.childNodes ?? []).map(
      (n) => (n as { getAttribute?: (k: string) => string | null }).getAttribute?.('class') ?? '',
    );
    expect(order.findIndex((c) => c.includes('hud-back'))).toBeLessThan(
      order.findIndex((c) => c.includes('hud-title')),
    );
  });

  it('Escape on it goes back too', () => {
    const onBack = vi.fn();
    const p = draw({ label: 'Back to the valley', onBack });
    const [button] = byName(p.root, 'button', 'Back to the valley');
    if (button === undefined) throw new Error('no back control');
    p.key(button, 'Escape');
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('is absent without `back` (the flag-off game and the map)', () => {
    expect(byClass(draw(undefined).root, 'hud-back')).toHaveLength(0);
  });
});

describe('the tray’s level wears the nameplate’s yellow level (row 11)', () => {
  it('"Lv N" is the shared nameplate level part', () => {
    const p = createPage();
    page = p;
    const creature = base.creatures[0];
    if (creature === undefined) throw new Error('no creature');
    p.draw(
      <TrayCreature
        creature={creature}
        input={{ trips: [], jobs: [], now: HOME_NOW }}
        index={0}
        onPick={() => undefined}
      />,
    );
    const level = byClass(p.root, 'nameplate-level');
    expect(level).toHaveLength(1);
    expect(level[0]?.textContent).toBe(`Lv ${String(creature.level)}`);
    expect(byClass(p.root, 'nameplate-name')).toHaveLength(0);
  });

  it('a plate with a level and no name is the level alone', () => {
    const p = createPage();
    page = p;
    p.draw(<Nameplate level={3} levelPrefix="Lv" />);
    expect(byClass(p.root, 'nameplate-level')[0]?.textContent).toBe('Lv 3');
    expect(byClass(p.root, 'nameplate-name')).toHaveLength(0);
  });
});

describe('every scene with creatures shows a nameplate for each (row 10)', () => {
  const ids = base.creatures.slice(0, 3).map((c) => c.id);
  const draws: [string, ReturnType<typeof castFor>][] = [
    [
      'cave',
      castFor(
        'cave',
        input({ dungeonTeam: ids, attention: { dungeon: true, raid: false, recheckAt: null } }),
        ART,
        [],
      ),
    ],
    [
      'arena',
      castFor(
        'arena',
        input({
          raid: {
            ...(base.raid ?? { schedule: {} as never }),
            scene: { boss: { id: 'old-bogback', name: 'Old Bogback' }, party: ids },
          },
        }),
        ART,
        [],
      ),
    ],
    ['fair', castFor('fair', input(), ART, [])],
    ['paddock', castFor('paddock', input(), ART, [])],
  ];

  it.each(draws)('%s', (place, cast) => {
    const p = createPage();
    page = p;
    p.draw(
      <PopoverHost onOpenHowTo={() => undefined}>
        <PlaceScene cast={cast} onAct={() => undefined} />
      </PopoverHost>,
    );
    const creatures = byClass(p.root, 'small-creature');
    expect(creatures.length, place).toBeGreaterThan(0);
    const plates = byClass(p.root, 'vy-feet-plate').filter(
      (el) => byClass(el, 'nameplate-level').length === 1,
    );
    expect(plates, place).toHaveLength(creatures.length);
  });
});

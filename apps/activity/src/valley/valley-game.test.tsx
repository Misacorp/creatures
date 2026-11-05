import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AwaySummary, GameState } from '../api';
import { SAMPLE_STATE } from '../creature-card-sample';
import { Game } from '../Game';
import { aloneParticipants } from '../participants';
import { PopoverHost } from '../PopoverHost';
import { FakeElement, byClass, byName, createPage, visibleText, type Page } from '../test-dom';

// The fake page has no root element for the look's setting.
vi.mock('../use-room-mode', () => ({ useRoomMode: () => 'every' }));
vi.mock('../use-bleed', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../use-bleed')>()),
  useBleed: () => null,
}));

// Every request the game makes goes through `apiFetch`: record its path and fail it (the session is not signed in
// here, so nothing reaches `fetch` itself).
const fetched = vi.hoisted((): string[] => []);
// Today's dismissal of the away notice (`POST /api/away/dismiss`): the `until` of each call.
const dismissed = vi.hoisted((): number[] => []);
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  dismissAway: (until: number) => {
    dismissed.push(until);
    return Promise.reject(new Error('offline'));
  },
  apiFetch: (path: string) => {
    fetched.push(path);
    return Promise.reject(new Error('offline'));
  },
}));

// The server is a stand-in: every request fails, which the screens answer with their retry states.
beforeEach(() => {
  fetched.length = 0;
  dismissed.length = 0;
  vi.stubGlobal('fetch', (url: unknown) => {
    fetched.push(String(url));
    return Promise.reject(new Error('offline'));
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );
});

/** Lets the calls the game starts when it opens reach the stand-in server. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));
let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
  vi.unstubAllGlobals();
});

function draw(valley: boolean, state: Partial<GameState> = {}): Page {
  const p = createPage();
  page = p;
  const none = { current: null };
  p.draw(
    <PopoverHost onOpenHowTo={() => undefined}>
      <main class="card">
        <Game
          initial={{
            ...SAMPLE_STATE,
            starterChosen: true,
            awayRewards: null,
            levelReset: null,
            ...state,
          }}
          user={{ id: '100000000000000001', displayName: 'You' }}
          participants={aloneParticipants('100000000000000001', 'test')}
          helpRef={none}
          onHelp={() => undefined}
          allowance={null}
          showPractice={false}
          devTools={false}
          valley={valley}
        />
      </main>
    </PopoverHost>,
  );
  return p;
}

describe('the valley flag in the game', () => {
  it('off: today’s shell, the dock and the Home page, and no valley', () => {
    const p = draw(false);
    expect(byClass(p.root, 'main-nav').length).toBeGreaterThan(0);
    expect(byClass(p.root, 'vy-frame')).toHaveLength(0);
    expect(byClass(p.root, 'home-page').length).toBeGreaterThan(0);
  });

  it.each([
    ['Cave', 'Dungeon'],
    ['Fairground', 'Valley Games'],
    ['House', 'House'],
    ['Paddock', 'Creatures'],
    ['Forge', 'Workshop'],
    ['Arena', 'Raid'],
    ['Signpost', 'Expeditions'],
  ])('on: %s opens its page and "‹ Valley" returns to the map', (place, title) => {
    const p = draw(true);
    expect(byClass(p.root, 'main-nav')).toHaveLength(0);
    expect(byClass(p.root, 'home-page')).toHaveLength(0);
    expect(byClass(p.root, 'vy-frame')).toHaveLength(1);
    const door = byName(p.root, 'button', new RegExp(`^${place},`))[0];
    expect(door).toBeDefined();
    if (door === undefined) return;
    p.click(door);
    expect(byClass(p.root, 'vy-valley')).toHaveLength(0);
    expect(byClass(p.root, 'drill-title')[0]?.textContent).toBe(title);
    const back = byClass(p.root, 'drill-back')[0];
    expect(back?.textContent).toContain('Valley');
    if (back === undefined) return;
    p.click(back);
    expect(byClass(p.root, 'vy-valley')).toHaveLength(1);
  });

  it.each([
    ['Bonfire', 'A fire will burn here, and your creatures will rest by it.'],
    ['School', 'A teacher will visit here.'],
    ['Visitor', 'A stranger will set up a stall here once a week.'],
    ['Market', 'A market will open here, for shards and trades.'],
  ])('on: %s says one line and opens no page', (place, line) => {
    const p = draw(true);
    const door = byName(p.root, 'button', new RegExp(`^${place},`))[0];
    if (door === undefined) throw new Error(`no ${place}`);
    p.click(door);
    expect(visibleText(p.root)).toContain(line);
    expect(byClass(p.root, 'vy-page')).toHaveLength(0);
    const back = byClass(p.root, 'drill-back')[0];
    if (back === undefined) throw new Error('no way back');
    p.click(back);
    expect(byClass(p.root, 'vy-valley')).toHaveLength(1);
  });

  it('on: "‹ Valley" only changes the view; the map loads nothing again (the raid week loads once, when the valley opens)', () => {
    const p = draw(true);
    const door = byName(p.root, 'button', /^Forge,/)[0];
    if (door === undefined) throw new Error('no Forge');
    p.click(door);
    fetched.length = 0;
    const back = byClass(p.root, 'drill-back')[0];
    if (back === undefined) throw new Error('no way back');
    p.click(back);
    expect(byClass(p.root, 'vy-valley')).toHaveLength(1);
    expect(fetched).toEqual([]);
  });

  it('on: a place with something waiting wears a bubble, and tapping the bubble opens the place', () => {
    const p = draw(true, { attention: { dungeon: true, raid: false, recheckAt: null } });
    const cave = byName(p.root, 'button', /^Cave,/)[0];
    if (cave === undefined) throw new Error('no Cave');
    expect(cave.getAttribute('aria-label')).toContain("today's run is open");
    expect(byClass(cave, 'vy-bubble')).toHaveLength(1);
    // Places with nothing waiting have none.
    const forge = byName(p.root, 'button', /^Forge,/)[0];
    if (forge === undefined) throw new Error('no Forge');
    expect(byClass(forge, 'vy-bubble')).toHaveLength(0);
    const bubble = byClass(cave, 'vy-bubble')[0];
    if (bubble === undefined) throw new Error('no bubble');
    p.click(bubble);
    expect(byClass(p.root, 'vy-valley')).toHaveLength(0);
    expect(byClass(p.root, 'drill-title')[0]?.textContent).toBe('Dungeon');
  });

  it('on: a waiting duplicate puts a counted bubble on the Paddock', () => {
    const pending = SAMPLE_STATE.pending;
    const [one] = pending;
    const p = draw(
      true,
      one === undefined ? {} : { pending: [one, { ...one, id: `${one.id}-b` }] },
    );
    if (one === undefined) return;
    const paddock = byName(p.root, 'button', /^Paddock,/)[0];
    if (paddock === undefined) throw new Error('no Paddock');
    expect(paddock.getAttribute('aria-label')).toContain('2 catches await your choice');
    expect(byClass(paddock, 'vy-time')[0]?.textContent).toBe('2');
  });

  it('on: the Places list says what happens next at each place', () => {
    const p = draw(true, { attention: { dungeon: true, raid: false, recheckAt: null } });
    const hatch = byName(p.root, 'button', 'Places')[0];
    if (hatch === undefined) throw new Error('no Places button');
    p.click(hatch);
    const cave = byName(p.root, 'button', /^Cave, .*a run waits$/)[0];
    expect(cave).toBeDefined();
    expect(visibleText(p.root)).toContain('Journal, Stats');
    expect(visibleText(p.root)).toContain('not open yet');
  });

  it('on: bubbles and lines ask for nothing the flag-off Home does not ask for', async () => {
    const off = draw(false);
    await settle();
    const asked = new Set(fetched);
    off.unmount();
    page = null;
    fetched.length = 0;
    draw(true, { attention: { dungeon: true, raid: false, recheckAt: null } });
    await settle();
    expect(fetched.length).toBeGreaterThan(0);
    for (const url of fetched) expect(asked.has(url)).toBe(true);
  });
});

// The five places with a scene (phase 4, step 3): [door, flag-off dock name, scene class].
const SCENE_PLACES = [
  ['Cave', /^Dungeon/],
  ['Fairground', /^Games/],
  ['House', /^Home/],
  ['Paddock', /^Creatures/],
  ['Arena', /^Raid/],
] as const;

describe('the places’ scenes above today’s page', () => {
  const open = (p: Page, place: string): void => {
    const door = byName(p.root, 'button', new RegExp(`^${place},`))[0];
    if (door === undefined) throw new Error(`no ${place}`);
    p.click(door);
  };
  const firstId = SAMPLE_STATE.creatures[0]?.id ?? null;

  it.each(SCENE_PLACES)('%s: a band with its scene above the page', (place) => {
    const p = draw(true);
    open(p, place);
    const bands = byClass(p.root, 'vy-band');
    expect(bands).toHaveLength(1);
    expect(byClass(bands[0] ?? p.root, 'vy-canvas')).toHaveLength(1);
    expect(byClass(p.root, 'vy-inside')).toHaveLength(1);
    // One pinned action or calm line under the scene.
    expect(byClass(p.root, 'vy-act')).toHaveLength(1);
  });

  it('the Forge and the Signpost have no scene (phase 5 posts): today’s page only', () => {
    for (const place of ['Forge', 'Signpost']) {
      const p = draw(true);
      open(p, place);
      expect(byClass(p.root, 'vy-band')).toHaveLength(0);
      p.unmount();
      page = null;
    }
  });

  it('House: no living room and no lounger, only Journal and Stats; the flag-off Home keeps its living room', () => {
    const p = draw(true, { loungerId: firstId });
    open(p, 'House');
    expect(byClass(p.root, 'vy-stand')).toHaveLength(0);
    expect(byClass(p.root, 'room-view')).toHaveLength(0);
    expect(visibleText(p.root)).not.toContain('Living room');
    expect(byName(p.root, 'button', /^Journal/)).toHaveLength(1);
    expect(byName(p.root, 'button', /^Stats/)).toHaveLength(1);
    const off = draw(false, { loungerId: firstId });
    expect(byClass(off.root, 'room-view').length).toBeGreaterThan(0);
  });

  it('Cave: a run waits, so the action says Start the run and goes to the page', () => {
    const p = draw(true, { attention: { dungeon: true, raid: false, recheckAt: null } });
    open(p, 'Cave');
    const act = byName(p.root, 'button', /^Start the run/)[0];
    if (act === undefined) throw new Error('no pinned action');
    p.click(act);
    expect(byClass(p.root, 'vy-inside')).toHaveLength(1);
  });

  it('Cave: nothing waiting is a calm line, never a disabled button', () => {
    const p = draw(true, { attention: { dungeon: false, raid: false, recheckAt: null } });
    open(p, 'Cave');
    expect(visibleText(p.root)).toContain('The cave is quiet');
    expect(byName(p.root, 'button', /^Start the run/)).toHaveLength(0);
  });

  it('Paddock: the creatures at home wander in the scene and waiting catches stand at the gate', () => {
    const p = draw(true);
    open(p, 'Paddock');
    const home = SAMPLE_STATE.creatures.filter((c) => !c.away && c.busy === null).length;
    const gate = Math.min(2, SAMPLE_STATE.pending.length);
    expect(byClass(p.root, 'vy-stand').length).toBe(Math.min(8, home) + gate);
  });

  it('Paddock: every creature has its nameplate, the level first, then the name', () => {
    const p = draw(true);
    open(p, 'Paddock');
    const creatures = byClass(p.root, 'small-creature');
    expect(creatures.length).toBeGreaterThan(0);
    const stands = byClass(p.root, 'vy-stand').filter(
      (el) => byClass(el, 'small-creature').length > 0,
    );
    expect(stands).toHaveLength(creatures.length);
    for (const stand of stands) {
      const plates = byClass(stand, 'nameplate');
      expect(plates).toHaveLength(1);
      const kids = (plates[0]?.childNodes ?? []).filter((n) => n instanceof FakeElement);
      expect(kids[0]?.getAttribute('class')).toBe('nameplate-level');
      expect(kids[1]?.getAttribute('class')).toBe('nameplate-name');
      expect(Number(kids[0]?.textContent)).toBeGreaterThan(0);
    }
  });

  it('Paddock: "View" in a creature popover opens its page', () => {
    vi.stubGlobal('window', {
      innerHeight: 800,
      innerWidth: 390,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      matchMedia: () => ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
      scrollTo: () => undefined,
      location: { hash: '' },
    });
    const p = draw(true);
    open(p, 'Paddock');
    const creature = byClass(p.root, 'vy-stand-btn')[0];
    if (creature === undefined) throw new Error('no creature');
    p.click(creature);
    const view = byName(p.root, 'button', 'View')[0];
    if (view === undefined) throw new Error('no View button');
    p.click(view);
    expect(byClass(p.root, 'creature-page').length).toBeGreaterThan(0);
  });

  it.each(SCENE_PLACES)(
    '%s: opening it asks for nothing the flag-off page does not',
    async (place, dock) => {
      const off = draw(false);
      await settle();
      const dockButton = byName(off.root, 'button', dock)[0];
      if (dockButton !== undefined) off.click(dockButton);
      await settle();
      const asked = new Set(fetched);
      off.unmount();
      page = null;
      fetched.length = 0;
      const on = draw(true);
      await settle();
      open(on, place);
      await settle();
      for (const url of fetched) expect(asked.has(url)).toBe(true);
    },
  );
});

describe('the welcome-back Gazette in the game', () => {
  const away: AwaySummary = {
    sources: [
      { kind: 'leet', bait: 47, essence: 0, items: 0, creatures: 0, medals: 0, xp: 0 },
      { kind: 'raid', bait: 0, essence: 96, items: 1, creatures: 0, medals: 0, xp: 240 },
    ],
    since: 1,
    until: 2,
    tripsWaiting: 1,
    jobsWaiting: 0,
  };

  it('on: opens over the valley when today’s notice would show, and the Home paper is not drawn', () => {
    const p = draw(true, { awayRewards: away });
    expect(byClass(p.root, 'gz-paper')).toHaveLength(1);
    expect(byClass(p.root, 'hb-away')).toHaveLength(0);
    expect(byClass(p.root, 'vy-frame')).toHaveLength(1);
  });

  it('on: no notice, no Gazette', () => {
    expect(byClass(draw(true).root, 'gz-paper')).toHaveLength(0);
  });

  it('on: closing it calls today’s dismiss once, and asks for nothing else', async () => {
    const p = draw(true, { awayRewards: away });
    await settle();
    fetched.length = 0;
    const close = byName(p.root, 'button', /more thing|Into the valley/)[0];
    if (close === undefined) throw new Error('no close button');
    p.click(close);
    await settle();
    expect(dismissed).toEqual([2]);
    expect(fetched).toEqual([]);
  });

  it('off: today’s away paper on Home, unchanged, and no Gazette', () => {
    const p = draw(false, { awayRewards: away });
    expect(byClass(p.root, 'gz-paper')).toHaveLength(0);
    expect(byClass(p.root, 'hb-away')).toHaveLength(1);
    expect(byName(p.root, 'button', 'Got it')).toHaveLength(1);
  });
});

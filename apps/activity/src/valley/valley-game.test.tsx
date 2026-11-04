import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameState } from '../api';
import { SAMPLE_STATE } from '../creature-card-sample';
import { Game } from '../Game';
import { aloneParticipants } from '../participants';
import { PopoverHost } from '../PopoverHost';
import { byClass, byName, createPage, visibleText, type Page } from '../test-dom';

// The fake page has no root element for the look's setting.
vi.mock('../use-room-mode', () => ({ useRoomMode: () => 'every' }));
vi.mock('../use-bleed', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../use-bleed')>()),
  useBleed: () => null,
}));

// Every request the game makes goes through `apiFetch`: record its path and fail it (the session is not signed in
// here, so nothing reaches `fetch` itself).
const fetched = vi.hoisted((): string[] => []);
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  apiFetch: (path: string) => {
    fetched.push(path);
    return Promise.reject(new Error('offline'));
  },
}));

// The server is a stand-in: every request fails, which the screens answer with their retry states.
beforeEach(() => {
  fetched.length = 0;
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
    ['House', 'Living room'],
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

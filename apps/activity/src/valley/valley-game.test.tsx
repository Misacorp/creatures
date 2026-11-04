import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

// The server is a stand-in: every request fails, which the screens answer with their retry states.
beforeEach(() => {
  vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );
});

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
  vi.unstubAllGlobals();
});

function draw(valley: boolean): Page {
  const p = createPage();
  page = p;
  const none = { current: null };
  p.draw(
    <PopoverHost onOpenHowTo={() => undefined}>
      <main class="card">
        <Game
          initial={{ ...SAMPLE_STATE, starterChosen: true, awayRewards: null, levelReset: null }}
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
});

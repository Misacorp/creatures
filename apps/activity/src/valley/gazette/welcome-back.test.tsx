import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AwaySummary } from '../../api';
import { PopoverHost } from '../../PopoverHost';
import { SAMPLE_STATE } from '../../creature-card-sample';
import { sampleGearItem } from '../../workbench/gear-sample';
import type { AwayWorld } from './stories';
import { byClass, byName, createPage, find, type FakeElement, type Page } from '../../test-dom';
import { WelcomeBack } from './WelcomeBack';

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const first = (list: FakeElement[]): FakeElement => {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
};

const BUSY: AwaySummary = {
  sources: [
    { kind: 'leet', bait: 47, essence: 0, items: 0, creatures: 0, medals: 0, xp: 0 },
    { kind: 'raid', bait: 10, essence: 96, items: 1, creatures: 1, medals: 0, xp: 240 },
    { kind: 'games', bait: 0, essence: 0, items: 0, creatures: 0, medals: 2, xp: 180 },
  ],
  since: 1,
  until: 99,
  tripsWaiting: 0,
  jobsWaiting: 0,
};
const MEDALS_ONLY: AwaySummary = {
  ...BUSY,
  sources: [{ kind: 'games', bait: 0, essence: 0, items: 0, creatures: 0, medals: 2, xp: 0 }],
};

// A bag with the raid's one piece, and the roster with the raid's one newcomer (caught inside the away window).
const WORLD: AwayWorld = {
  creatures: SAMPLE_STATE.creatures
    .slice(0, 3)
    .map((c, i) => ({ ...c, caughtAt: i === 0 ? 50 : 0 })),
  items: [{ ...sampleGearItem({ id: 'p1', baseId: 'kelp-cap', rarity: 'rare' }), createdAt: 60 }],
  blueprints: [],
  tray: { trips: [], jobs: [], now: 100 },
  games: null,
  raid: null,
};

function drawBack(away: AwaySummary | null, extra: { reduced?: boolean } = {}) {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );
  vi.stubGlobal('matchMedia', () => ({
    matches: extra.reduced === true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  const onDismiss = vi.fn();
  const onPurse = vi.fn();
  const view = (a: AwaySummary | null) => (
    <PopoverHost onOpenHowTo={() => undefined}>
      <WelcomeBack
        away={a}
        world={WORLD}
        now={Date.UTC(2026, 10, 4, 12)}
        timezone="Europe/Helsinki"
        balances={{ bait: 500, essence: 40 }}
        onDismiss={onDismiss}
        onPurse={onPurse}
      />
    </PopoverHost>
  );
  page = createPage();
  page.draw(view(away));
  return { p: page, onDismiss, onPurse, view };
}

describe('the welcome-back Gazette in the game', () => {
  it('opens when today’s notice would show, with the date, the reassurance and its stories', () => {
    const { p } = drawBack({ ...BUSY, tripsWaiting: 2, jobsWaiting: 1 });
    expect(byClass(p.root, 'gz-paper')).toHaveLength(1);
    expect(byClass(p.root, 'gz-dateline')[0]?.textContent).toBe('Wednesday 4 November');
    // Trips and jobs still wait to be claimed: the line says where, not that everything is home.
    expect(byClass(p.root, 'gz-home-note')[0]?.textContent).toBe(
      'Trips wait at the Signpost, jobs at the Forge.',
    );
    expect(byClass(p.root, 'gz-headline')[0]?.textContent).not.toContain('A NEWCOMER');
    expect(byClass(p.root, 'gz-headline')[0]?.textContent).toMatch(/^[A-Z ]+ CAME FROM THE RAID$/);
    // The raid's real piece and newcomer are small finds under its story, named in its headline.
    expect(byClass(p.root, 'find-row').length).toBeGreaterThanOrEqual(2);
    expect(byClass(p.root, 'gz-brief')).toHaveLength(2);
    expect(byName(p.root, 'button', /\.\.\.and 2 more things/)).toHaveLength(1);
  });

  it('does not open for no notice, or one with nothing in it', () => {
    expect(byClass(drawBack(null).p.root, 'gz-paper')).toHaveLength(0);
    page?.unmount();
    const none: AwaySummary = { ...BUSY, sources: [] };
    expect(byClass(drawBack(none).p.root, 'gz-paper')).toHaveLength(0);
  });

  const ways: [string, (p: Page) => void][] = [
    ['the button', (p) => p.click(first(byName(p.root, 'button', /more thing|Into the valley/)))],
    ['the X', (p) => p.click(first(byName(p.root, 'button', 'Close')))],
    [
      'a tap on the handle (a swipe down ends in it)',
      (p) => p.click(first(byClass(p.root, 'drawer-handle'))),
    ],
    ['the backdrop', (p) => p.click(first(byClass(p.root, 'drawer-backdrop')))],
    ['Escape', (p) => p.key(first(byName(p.root, 'button', 'Close')), 'Escape')],
  ];
  it.each(ways)(
    'closing by %s dismisses once and starts the coming-home moment',
    (_name, close) => {
      const { p, onDismiss, view } = drawBack(BUSY);
      close(p);
      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(onDismiss).toHaveBeenCalledWith(99);
      expect(byClass(p.root, 'gz-paper')).toHaveLength(0);
      expect(byClass(p.root, 'gz-fly')).toHaveLength(1);
      expect(byClass(p.root, 'gz-fly-gain').map((g) => g.getAttribute('data-resource'))).toEqual([
        'bait',
        'essence',
      ]);
      // The game's notice is gone after the dismissal: the moment goes on, and nothing opens or dismisses again.
      p.draw(view(null));
      expect(byClass(p.root, 'gz-fly')).toHaveLength(1);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    },
  );

  it('flies Bait and Essence as coins, and counts the purse up to the totals it already has', () => {
    vi.useFakeTimers();
    const { p, onPurse } = drawBack(BUSY);
    p.click(first(byName(p.root, 'button', /more thing|Into the valley/)));
    expect(byClass(p.root, 'gz-coin').length).toBeGreaterThan(0);
    // Right after closing the purse shows the totals less what has not landed yet.
    const lastShown = onPurse.mock.calls.at(-1)?.[0] as { bait: number; essence: number };
    expect(lastShown.bait).toBeLessThan(500);
    expect(lastShown.bait).toBeGreaterThanOrEqual(500 - 57);
    p.update(() => vi.advanceTimersByTime(3000));
    expect(onPurse.mock.calls.at(-1)?.[0]).toBeNull();
    expect(byClass(p.root, 'gz-fly')).toHaveLength(0);
  });

  it('under reduced motion nothing flies: "+N" stands beside the purse', () => {
    vi.useFakeTimers();
    const { p, onDismiss } = drawBack(BUSY, { reduced: true });
    p.click(first(byName(p.root, 'button', /more thing|Into the valley/)));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(byClass(p.root, 'gz-fly')[0]?.getAttribute('class')).toContain('still');
    expect(byClass(p.root, 'gz-coin')).toHaveLength(0);
    expect(byClass(p.root, 'part-amount').map((a) => a.textContent)).toEqual(['+57', '+96']);
  });

  it('under reduced motion the note stays at least 5 seconds, and a tap still ends it', () => {
    vi.useFakeTimers();
    const { p } = drawBack(BUSY, { reduced: true });
    p.click(first(byName(p.root, 'button', /more thing|Into the valley/)));
    p.update(() => vi.advanceTimersByTime(4900));
    expect(byClass(p.root, 'gz-fly')).toHaveLength(1);
    p.update(() => vi.advanceTimersByTime(200));
    expect(byClass(p.root, 'gz-fly')).toHaveLength(0);
    const again = drawBack({ ...BUSY, until: 120 }, { reduced: true });
    again.p.click(first(byName(again.p.root, 'button', /more thing|Into the valley/)));
    again.p.event(again.p.document.body, 'pointerdown', {});
    expect(byClass(again.p.root, 'gz-fly')).toHaveLength(0);
  });

  it.each([false, true])(
    'a polite status region says the gains in words (reduced motion %s)',
    (reduced) => {
      const { p } = drawBack(BUSY, { reduced });
      const region = find(p.root, (el) => el.getAttribute('role') === 'status')[0];
      expect(region?.getAttribute('aria-live')).toBe('polite');
      expect(region?.textContent).toBe('');
      p.click(first(byName(p.root, 'button', /more thing|Into the valley/)));
      expect(region?.textContent).toBe('Home: +57 Bait, +96 Essence');
      // The flying layer itself stays out of the reading order: the region is how the gains are told.
      expect(byClass(p.root, 'gz-fly')[0]?.getAttribute('aria-hidden')).toBe('true');
    },
  );

  it('the note under the date says everything is home only when no trip or job waits', () => {
    const { p } = drawBack(BUSY);
    expect(byClass(p.root, 'gz-home-note')[0]?.textContent).toBe(
      'Everything your creatures found is already home.',
    );
  });

  it('a tap anywhere finishes the moment', () => {
    const { p, onPurse } = drawBack(BUSY);
    p.click(first(byName(p.root, 'button', /more thing|Into the valley/)));
    expect(byClass(p.root, 'gz-fly')).toHaveLength(1);
    p.event(p.document.body, 'pointerdown', {});
    expect(byClass(p.root, 'gz-fly')).toHaveLength(0);
    expect(onPurse.mock.calls.at(-1)?.[0]).toBeNull();
  });

  it('flies nothing when the away counts hold no Bait or Essence, but still dismisses', () => {
    const { p, onDismiss } = drawBack(MEDALS_ONLY);
    p.click(first(byName(p.root, 'button', /more thing|Into the valley/)));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(byClass(p.root, 'gz-fly')).toHaveLength(0);
  });
});

describe('the welcome-back Gazette on the server’s paper (the valley’s systems on)', () => {
  const [one, two, three] = WORLD.creatures;
  if (one === undefined || two === undefined || three === undefined) throw new Error('creatures');
  const PAPER = {
    id: '1799760000000',
    at: Date.UTC(2026, 10, 4, 12),
    awayHours: 26,
    headlines: [
      {
        kind: 'new-species' as const,
        weight: 100,
        count: 1,
        creatureIds: [one.id],
        species: three.species,
        step: null,
        rarity: null,
        turn: null,
        items: [],
        blueprints: [],
        newcomers: [three.id],
      },
      {
        kind: 'found-gear' as const,
        weight: 80,
        count: 1,
        creatureIds: [one.id],
        species: null,
        step: null,
        rarity: 'rare' as const,
        turn: null,
        items: [{ id: 'p1', baseId: 'kelp-cap', rarity: 'rare' as const, level: 4 }],
        blueprints: [],
        newcomers: [],
      },
    ],
    more: 3,
    brought: { acorns: 150, scrap: 40, shards: 4 },
    decision: {
      kind: 'push-on' as const,
      seatId: 'seat-1',
      creatureId: one.id,
      destination: 'ember-caves',
    },
  };

  function drawPaper(
    paper: typeof PAPER | null,
    away: AwaySummary | null = null,
    onPushOn: (seatId: string) => Promise<boolean> = () => Promise.resolve(true),
  ) {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        disconnect(): void {}
      },
    );
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const onDismiss = vi.fn();
    const onClosePaper = vi.fn();
    const onPurse = vi.fn();
    const view = (next: typeof PAPER | null) => (
      <PopoverHost onOpenHowTo={() => undefined}>
        <WelcomeBack
          away={away}
          world={WORLD}
          now={Date.UTC(2026, 10, 4, 12)}
          timezone="Europe/Helsinki"
          balances={{ bait: 500, essence: 40 }}
          onDismiss={onDismiss}
          onPurse={onPurse}
          paper={next}
          onClosePaper={onClosePaper}
          onPushOn={onPushOn}
        />
      </PopoverHost>
    );
    page = createPage();
    page.draw(view(paper));
    return { p: page, onDismiss, onClosePaper, onPurse, view };
  }

  it('opens for the unread paper, with the paper’s own stories and its note, and not for today’s notice', () => {
    const { p } = drawPaper(PAPER, BUSY);
    expect(byClass(p.root, 'gz-paper')).toHaveLength(1);
    expect(byClass(p.root, 'gz-headline')[0]?.textContent).toMatch(/MOVES IN$/);
    expect(byClass(p.root, 'gz-brief')).toHaveLength(1);
    expect(byClass(p.root, 'gz-home-note')[0]?.textContent).toBe(
      'Everything your creatures found is already home.',
    );
    expect(byName(p.root, 'button', /\.\.\.and 3 more things/)).toHaveLength(1);
  });

  it('does not open with no paper, even when today’s notice is there', () => {
    expect(byClass(drawPaper(null, BUSY).p.root, 'gz-paper')).toHaveLength(0);
  });

  it('closing tells the server once, dismisses a waiting notice with it, and flies what the paper says came home', () => {
    const { p, onClosePaper, onDismiss, view } = drawPaper(PAPER, BUSY);
    p.click(first(byName(p.root, 'button', /more thing|Into the valley/)));
    expect(onClosePaper).toHaveBeenCalledTimes(1);
    expect(onClosePaper).toHaveBeenCalledWith(PAPER.id);
    expect(onDismiss).toHaveBeenCalledWith(99);
    expect(byClass(p.root, 'gz-paper')).toHaveLength(0);
    expect(byClass(p.root, 'gz-fly-gain').map((g) => g.getAttribute('data-resource'))).toEqual([
      'bait',
    ]);
    // The server's answer leaves no paper: nothing opens or closes again.
    p.draw(view(null));
    expect(onClosePaper).toHaveBeenCalledTimes(1);
    expect(byClass(p.root, 'gz-paper')).toHaveLength(0);
  });

  it('opens once for a paper: the same unread paper drawn again does not reopen it after it was closed', () => {
    const { p, onClosePaper, view } = drawPaper(PAPER);
    p.click(first(byName(p.root, 'button', /more thing|Into the valley/)));
    p.draw(view(PAPER));
    expect(byClass(p.root, 'gz-paper')).toHaveLength(0);
    expect(onClosePaper).toHaveBeenCalledTimes(1);
  });

  it('shows the decision as one choice at the end, and taking it sends the scout deeper', async () => {
    const onPushOn = vi.fn(() => Promise.resolve(true));
    const { p } = drawPaper(PAPER, null, onPushOn);
    expect(byClass(p.root, 'gz-choice')).toHaveLength(1);
    expect(byClass(p.root, 'gz-choice')[0]?.textContent).toContain('Ember Caves');
    p.click(first(byName(p.root, 'button', 'Push on')));
    expect(onPushOn).toHaveBeenCalledWith('seat-1');
    await Promise.resolve();
    await Promise.resolve();
    p.update(() => undefined);
    expect(byName(p.root, 'button', 'Push on')).toHaveLength(0);
    expect(byClass(p.root, 'gz-choice')[0]?.textContent).toContain('is deep in');
  });

  it('shows no choice when the paper has no decision', () => {
    const { p } = drawPaper({ ...PAPER, decision: null as never });
    expect(byClass(p.root, 'gz-choice')).toHaveLength(0);
  });
});

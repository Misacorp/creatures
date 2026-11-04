import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AwaySummary } from '../../api';
import { PopoverHost } from '../../PopoverHost';
import { byClass, byName, createPage, type FakeElement, type Page } from '../../test-dom';
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
        creatures={[]}
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
    expect(byClass(p.root, 'gz-home-note')[0]?.textContent).toBe(
      'Everything your creatures found is already home.',
    );
    expect(byClass(p.root, 'gz-headline')[0]?.textContent).toBe('A NEWCOMER CAME FROM THE RAID');
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

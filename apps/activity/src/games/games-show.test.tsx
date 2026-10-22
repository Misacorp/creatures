import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { byClass, byName, createPage, visibleText, type FakeElement, type Page } from '../test-dom';
import { SAMPLE_DAY, sampleShow } from '../workbench/games-show-sample';
import { GamesShow, clockText, standsTeams } from './GamesShow';
import { SHOW_INTRO_MS, buildShowTimeline, prepareEvent } from './show-timeline';
import { clockOffsetOf, liveShowMs } from './use-show-clock';

/**
 * The show player drawn for real on a sample day (the real engine, seeded): the stands, the scene,
 * the commentary, the board and the pips are there; a replay has its controls and skips to the next
 * event; a live show before its start is a countdown; the end calls `onDone`. No frames run (the
 * animation frame is stubbed): each draw is the moment it was given.
 */

let page: Page | null = null;
const SHOW = sampleShow(SAMPLE_DAY, 8, 0, 'render-test');
const TIMELINE = buildShowTimeline(SHOW.events);

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

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

function draw(props: Partial<Parameters<typeof GamesShow>[0]> = {}): Page {
  page = createPage();
  page.draw(
    <GamesShow
      events={SHOW.events}
      mode="replay"
      youId={SHOW.youId}
      names={SHOW.names}
      autoplay={false}
      {...props}
    />,
  );
  return page;
}

describe('GamesShow', () => {
  it('draws the intro of the first event: its name, your entrant and the pips', () => {
    const { root } = draw({ startMs: 1_000 });
    expect(visibleText(first(byClass(root, 'gs-title')))).toContain('Sauna Showdown');
    expect(visibleText(first(byClass(root, 'gs-title')))).toContain('1 / 4');
    expect(byClass(root, 'gs-stands')).toHaveLength(1);
    expect(byClass(root, 'gs-pip')).toHaveLength(4);
    const mine = byClass(root, 'is-entrant');
    expect(mine).toHaveLength(1);
    const yours = SHOW.events[0]?.actors.find((a) => a.playerId === SHOW.youId);
    expect(visibleText(first(mine))).toBe(yours?.name);
  });

  it('shows the board and the commentary during an event, with you on the board', () => {
    const span = TIMELINE.spans[0];
    if (span === undefined) throw new Error('no span');
    const { root } = draw({ startMs: span.eventStart + 1 });
    expect(byClass(root, 'gs-title')).toHaveLength(0);
    const slots = byClass(root, 'gs-slot');
    expect(slots.length).toBeGreaterThanOrEqual(3);
    expect(slots.length).toBeLessThanOrEqual(4);
    expect(slots.filter((s) => s.classList.contains('is-mine'))).toHaveLength(1);
    // The opening line of the sauna is said at the event's first tick.
    expect(visibleText(first(byClass(root, 'gs-say')))).toBe(
      'The doors close. Who can take the heat?',
    );
    // A screen reader heard the event start.
    expect(visibleText(first(byClass(root, 'visually-hidden')))).toBe(
      'Event 1 / 4: Sauna Showdown.',
    );
  });

  it('skips to the next event with the replay controls', () => {
    const { root } = draw({ startMs: 5_000 });
    const p = page as Page;
    p.click(first(byName(root, 'button', 'Next event')));
    expect(visibleText(first(byClass(root, 'gs-title')))).toContain('Melon Run');
    expect(first(byClass(root, 'is-now')).classList.contains('gs-pip')).toBe(true);
    expect(byClass(root, 'gs-pip').indexOf(first(byClass(root, 'is-now')))).toBe(1);
  });

  it('holds the last podium at the end and calls onDone once', () => {
    const done = vi.fn();
    const { root } = draw({ startMs: TIMELINE.total, onDone: done });
    expect(done).toHaveBeenCalledTimes(1);
    expect(byClass(root, 'gs-medal-name').length).toBeGreaterThan(0);
    expect(first(byName(root, 'button', 'Replay'))).toBeDefined();
    const next = byName(root, 'button', 'Next event');
    expect(first(next).hasAttribute('disabled')).toBe(true);
  });

  it('plays an event nobody entered as its intro card, in the lineup’s place', () => {
    const lineup = [SAMPLE_DAY[0] ?? '', 'berry-bonanza', ...SAMPLE_DAY.slice(1)];
    const tl = buildShowTimeline(SHOW.events, lineup);
    const { root } = draw({ lineup, startMs: (tl.spans[1]?.start ?? 0) + 500 });
    expect(visibleText(first(byClass(root, 'gs-title')))).toContain('Berry Bonanza');
    expect(visibleText(first(byClass(root, 'gs-title')))).toContain('2 / 5');
    expect(byClass(root, 'gs-slot')).toHaveLength(0);
    expect(byClass(root, 'gs-pip')).toHaveLength(5);
    expect(visibleText(first(byClass(root, 'visually-hidden')))).toBe(
      'Event 2 / 5: Berry Bonanza. Nobody entered.',
    );
  });

  it('counts down before a live show and lists the day’s events', () => {
    const now = Date.now();
    const { root } = draw({ mode: 'live', startsAt: now + 65_000, serverNow: now });
    expect(visibleText(first(byClass(root, 'gs-countdown')))).toBe('1:05');
    expect(byClass(root, 'gs-lineup-item')).toHaveLength(4);
    expect(byName(root, 'button', 'Play')).toHaveLength(0);
  });

  it('seeks a live show to the server’s now, with no controls', () => {
    const now = Date.now();
    // The server is 10 s ahead of this device; the show started 2 s ago on the server's clock.
    const { root } = draw({
      mode: 'live',
      startsAt: now + 10_000 - 2_000 - SHOW_INTRO_MS,
      serverNow: now + 10_000,
    });
    expect(byClass(root, 'gs-title')).toHaveLength(0);
    expect(visibleText(first(byClass(root, 'gs-live')))).toContain('Watching live');
    expect(byName(root, 'button', 'Next event')).toHaveLength(0);
  });
});

describe('the show clock and helpers', () => {
  it('corrects the local clock by the server’s', () => {
    expect(clockOffsetOf(undefined, 5)).toBe(0);
    expect(clockOffsetOf(1_000, 400)).toBe(600);
    expect(liveShowMs(10_000, 600, 9_900)).toBe(500);
  });

  it('writes the countdown as minutes and seconds', () => {
    expect(clockText(65_000)).toBe('1:05');
    expect(clockText(400)).toBe('0:01');
    expect(clockText(-3)).toBe('0:00');
  });

  it('keeps you in the stands, in the middle, even in a big field', () => {
    const big = sampleShow(['melon-run'], 16, 8, 'stands');
    const p = prepareEvent(big.events[0] as (typeof big.events)[number]);
    const you = 'dev-guest-8';
    const teams = standsTeams(p, you);
    expect(teams).toHaveLength(16);
    expect(teams.filter((t) => t.playerId === you)).toHaveLength(1);
    expect(teams.findIndex((t) => t.playerId === you)).toBe(7);
  });
});

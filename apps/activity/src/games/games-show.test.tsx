import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeElement, byClass, byName, createPage, visibleText, type Page } from '../test-dom';
import { SAMPLE_DAY, sampleShow } from '../workbench/games-show-sample';
import { GamesShow, clockText, standsTeams } from './GamesShow';
import {
  BOARD_TOP,
  SHOW_INTRO_MS,
  boardShown,
  buildShowTimeline,
  finalBoard,
  prepareEvent,
  sayParts,
  sayText,
  type BoardRow,
} from './show-timeline';
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
    // The board is a short list: the top five, and you when you are further down.
    const slots = byClass(root, 'gs-slot');
    expect(slots.length).toBeGreaterThanOrEqual(5);
    expect(slots.length).toBeLessThanOrEqual(6);
    expect(slots.filter((s) => s.classList.contains('is-mine'))).toHaveLength(1);
    // Each row names its creature and whose it is; yours says "(you)".
    const mine = first(slots.filter((s) => s.classList.contains('is-mine')));
    expect(visibleText(first(byClass(mine, 'gs-owner')))).toBe('(you)');
    // A wide screen (matchMedia matches here): the board is in the shared side panel beside the arena,
    // titled with the event, with no X; the arena's column holds no board.
    const panel = first(byClass(root, 'side-panel'));
    expect(panel.classList.contains('gs-panel')).toBe(true);
    expect(visibleText(first(byClass(panel, 'side-panel-title')))).toBe('Sauna Showdown');
    expect(byClass(panel, 'gs-board')).toHaveLength(1);
    expect(byClass(panel, 'side-panel-close')).toHaveLength(0);
    expect(byClass(first(byClass(root, 'gs-main')), 'gs-board')).toHaveLength(0);
    expect(first(byClass(root, 'side-layout')).classList.contains('with-panel')).toBe(true);
    // The opening line of the sauna is said at the event's first tick.
    expect(visibleText(first(byClass(root, 'gs-say')))).toBe(
      'The doors close. Who can take the heat?',
    );
    // A screen reader heard the event start.
    expect(visibleText(first(byClass(root, 'visually-hidden')))).toBe(
      'Event 1 / 4: Sauna Showdown.',
    );
  });

  it('puts the board under the arena on a narrower screen, with no side panel', () => {
    const span = TIMELINE.spans[0];
    if (span === undefined) throw new Error('no span');
    const { root } = draw({ startMs: span.eventStart + 1, wide: false });
    expect(byClass(root, 'side-panel')).toHaveLength(0);
    const main = first(byClass(root, 'gs-main'));
    expect(byClass(main, 'gs-board')).toHaveLength(1);
    expect(byClass(main, 'gs-slot').length).toBeGreaterThanOrEqual(5);
    expect(first(byClass(root, 'side-layout')).classList.contains('wide')).toBe(false);
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
    // No board before the show: one column, no side panel.
    expect(first(byClass(root, 'games-show')).classList.contains('is-before')).toBe(true);
    expect(byClass(root, 'side-panel')).toHaveLength(0);
    expect(byClass(root, 'side-layout')).toHaveLength(0);
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

describe('the board as a list', () => {
  const row = (place: number, playerId: string): BoardRow => ({
    teamId: `t-${playerId}`,
    playerId,
    actor: 0,
    place,
    text: `${String(10 - place)}m`,
    out: false,
  });
  const rows = Array.from({ length: 9 }, (_, i) => row(i + 1, `p${String(i + 1)}`));

  it('lists the top five, then your rows further down in place order, marking the gap', () => {
    expect(BOARD_TOP).toBe(5);
    const shown = boardShown(rows, 'p8');
    expect(shown.map((r) => r.row.playerId)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p8']);
    expect(shown.map((r) => r.gap)).toEqual([false, false, false, false, false, true]);
    // Right after the top five: no gap.
    expect(boardShown(rows, 'p6').map((r) => r.gap)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    // In the top five: just the five; a spectator: the five.
    expect(boardShown(rows, 'p2')).toHaveLength(5);
    expect(boardShown(rows, undefined)).toHaveLength(5);
    // Two rows of yours (a stored day with two entries of one player), both listed, in order.
    const two = [...rows.slice(0, 6), row(7, 'p9'), row(8, 'p9')];
    expect(boardShown(two, 'p9').map((r) => r.row.place)).toEqual([1, 2, 3, 4, 5, 7, 8]);
    expect(boardShown(two, 'p9').map((r) => r.gap)).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
      false,
    ]);
    // A short field lists everyone.
    expect(boardShown(rows.slice(0, 3), 'p3')).toHaveLength(3);
  });

  it('draws the final board of a big field: places in order, you in gold, nobody cut off', () => {
    const show = sampleShow(['melon-run'], 15, 0, 'board-list');
    const event = show.events[0];
    if (event === undefined) throw new Error('no event');
    const p = prepareEvent(event);
    const tl = buildShowTimeline(show.events);
    const span = tl.spans[0];
    if (span === undefined) throw new Error('no span');
    // Pick a viewer who finished outside the top five.
    const board = finalBoard(p);
    const low = board.find((_, i) => i >= BOARD_TOP);
    if (low === undefined) throw new Error('nobody low');
    page = createPage();
    page.draw(
      <GamesShow
        events={show.events}
        mode="replay"
        youId={low.playerId}
        names={show.names}
        autoplay={false}
        startMs={span.podiumStart + 500}
      />,
    );
    const slots = byClass(page.root, 'gs-slot');
    expect(slots).toHaveLength(BOARD_TOP + 1);
    const places = slots.map((s) => Number(visibleText(first(byClass(s, 'gs-place')))));
    expect(places).toEqual([...places].sort((a, b) => a - b));
    const last = slots.at(-1);
    expect(last?.classList.contains('is-mine')).toBe(true);
    expect(last?.classList.contains('is-gap')).toBe(low.place > BOARD_TOP + 1);
    // Every row has its score.
    for (const s of slots) expect(visibleText(first(byClass(s, 'gs-score')))).not.toBe('');
    // A creature of someone else is followed by its owner's name.
    const other = first(slots.filter((s) => !s.classList.contains('is-mine')));
    expect(visibleText(first(byClass(other, 'gs-owner')))).toMatch(/^\(.+\)$/u);
  });
});

describe('the commentary’s owners', () => {
  const show = sampleShow(['pepper-panic'], 8, 0, 'say-owners');
  const event = show.events[0];
  if (event === undefined) throw new Error('no event');
  const p = prepareEvent(event);
  const span = buildShowTimeline(show.events).spans[0];
  if (span === undefined) throw new Error('no span');
  // The first line that names a creature of someone else, and the first that names yours.
  const at = (pick: (playerId: string) => boolean) => {
    const say = p.says.find((s) => {
      const actor = s.a === undefined ? undefined : p.result.actors[s.a];
      return actor !== undefined && pick(actor.playerId);
    });
    if (say === undefined) throw new Error('no such line');
    return { say, ms: span.eventStart + say.t * p.tickMs + 1 };
  };
  const long = Object.fromEntries(Object.keys(show.names).map((id) => [id, 'Kristiina Marjatta']));

  function drawAt(ms: number, names: Record<string, string>): FakeElement {
    page = createPage();
    page.draw(
      <GamesShow
        events={show.events}
        mode="replay"
        youId={show.youId}
        names={names}
        autoplay={false}
        startMs={ms}
      />,
    );
    return first(byClass(page.root, 'gs-say'));
  }

  it('follows each name with its owner, and yours with "(you)"', () => {
    const theirs = at((id) => id !== show.youId);
    const line = drawAt(theirs.ms, show.names);
    const owners = { youId: show.youId, names: show.names };
    expect(visibleText(line)).toBe(sayText(sayParts(p, theirs.say, owners)));
    const owner = show.names[p.result.actors[theirs.say.a ?? -1]?.playerId ?? ''] ?? '';
    expect(visibleText(first(byClass(line, 'gs-owner')))).toBe(`(${owner})`);
    page?.unmount();
    const yours = at((id) => id === show.youId);
    const mine = drawAt(yours.ms, show.names);
    expect(visibleText(first(byClass(mine, 'gs-owner')))).toBe('(you)');
    expect(first(byClass(mine, 'gs-owner')).classList.contains('is-you')).toBe(true);
  });

  it('keeps full owners when the line fits, and shortens them when it would overflow', () => {
    const theirs = at((id) => id !== show.youId);
    expect(visibleText(first(byClass(drawAt(theirs.ms, long), 'gs-owner')))).toBe(
      '(Kristiina Marjatta)',
    );
    page?.unmount();
    // A line wider than its box: measured after the first draw, then drawn again, shortened.
    const proto = FakeElement.prototype as unknown as Record<string, unknown>;
    Object.defineProperty(proto, 'scrollWidth', {
      configurable: true,
      get(this: FakeElement) {
        const line = this.parentNode;
        return this.classList.contains('prose') && line?.classList.contains('is-short') !== true
          ? 500
          : 0;
      },
    });
    Object.defineProperty(proto, 'clientWidth', { configurable: true, get: () => 300 });
    try {
      const line = drawAt(theirs.ms, long);
      expect(line.classList.contains('is-short')).toBe(true);
      expect(line.classList.contains('is-tight')).toBe(false);
      expect(visibleText(first(byClass(line, 'gs-owner')))).toBe('(Kristiina)');
      page?.unmount();
      // Still too wide when shortened: the names drop to the line's size, then the line wraps.
      Object.defineProperty(proto, 'scrollWidth', {
        configurable: true,
        get(this: FakeElement) {
          return this.classList.contains('prose') ? 500 : 0;
        },
      });
      const wrapped = drawAt(theirs.ms, long);
      expect(wrapped.classList.contains('is-short')).toBe(true);
      expect(wrapped.classList.contains('is-tight')).toBe(true);
      expect(wrapped.classList.contains('is-wrap')).toBe(true);
      // Wrapping keeps the owners: nothing is dropped from the line.
      expect(visibleText(first(byClass(wrapped, 'gs-owner')))).toBe('(Kristiina)');
    } finally {
      delete proto.scrollWidth;
      delete proto.clientWidth;
    }
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

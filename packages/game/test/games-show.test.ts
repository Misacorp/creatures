import { describe, expect, it } from 'vitest';
import {
  GAMES_SHOW_TIMING,
  RULES,
  gamesStall,
  gamesStallOffer,
  loadGamesStall,
  medalPoints,
  showLengthMs,
  showTimeline,
} from '../src/index';
import stallJson from '../src/content/data/games-stall.json';

const { introMs, podiumMs } = GAMES_SHOW_TIMING;

describe('showTimeline', () => {
  it('lays out intro, play and podium back to back', () => {
    const t = showTimeline([
      { eventId: 'a', ticks: 10, tickMs: 400 },
      { eventId: 'b', ticks: 5, tickMs: 1000 },
    ]);
    expect(t).toEqual([
      {
        eventId: 'a',
        introMs: 0,
        startMs: introMs,
        endMs: introMs + 4_000,
        podiumEndMs: introMs + 4_000 + podiumMs,
        skipped: false,
      },
      {
        eventId: 'b',
        introMs: introMs + 4_000 + podiumMs,
        startMs: 2 * introMs + 4_000 + podiumMs,
        endMs: 2 * introMs + 9_000 + podiumMs,
        podiumEndMs: 2 * introMs + 9_000 + 2 * podiumMs,
        skipped: false,
      },
    ]);
    expect(showLengthMs([{ eventId: 'a', ticks: 10, tickMs: 400 }])).toBe(
      introMs + 4_000 + podiumMs,
    );
  });

  it('gives a skipped event its intro card only', () => {
    const t = showTimeline([
      { eventId: 'a', ticks: 0, tickMs: 400, skipped: true },
      { eventId: 'b', ticks: 1, tickMs: 400 },
    ]);
    expect(t[0]).toMatchObject({
      introMs: 0,
      startMs: introMs,
      endMs: introMs,
      podiumEndMs: introMs,
    });
    expect(t[1]?.introMs).toBe(introMs);
    expect(showLengthMs([])).toBe(0);
  });

  it('refuses a fractional or negative length', () => {
    expect(() => showTimeline([{ eventId: 'a', ticks: -1, tickMs: 400 }])).toThrow(RangeError);
    expect(() => showTimeline([{ eventId: 'a', ticks: 1.5, tickMs: 400 }])).toThrow(RangeError);
  });
});

describe('the Prize Stall content', () => {
  it('loads, with unique ids and prices a week of medals can reach', () => {
    expect(gamesStall.length).toBeGreaterThanOrEqual(4);
    expect(new Set(gamesStall.map((o) => o.id)).size).toBe(gamesStall.length);
    // A typical player earns a few points a day: a week of golds buys any offer.
    const week = medalPoints({ gold: 7, silver: 0, bronze: 0, pin: 0 });
    for (const o of gamesStall) expect(o.price).toBeLessThanOrEqual(week);
    expect(gamesStallOffer('mystery-gear')?.kind).toBe('gear');
    expect(gamesStallOffer('nope')).toBeUndefined();
    expect(RULES.games.medalPoints.gold).toBeGreaterThan(0);
  });

  it('refuses unknown keys, kinds and duplicate ids', () => {
    const copy = (): { offers: Record<string, unknown>[] } =>
      JSON.parse(JSON.stringify(stallJson)) as { offers: Record<string, unknown>[] };
    const extra = copy();
    (extra.offers[0] as Record<string, unknown>)['free'] = true;
    expect(() => loadGamesStall(extra)).toThrow(/games stall/);
    const kind = copy();
    (kind.offers[0] as Record<string, unknown>)['kind'] = 'creature';
    expect(() => loadGamesStall(kind)).toThrow(/games stall/);
    const dup = copy();
    dup.offers.push({ ...(dup.offers[0] as Record<string, unknown>) });
    expect(() => loadGamesStall(dup)).toThrow(/duplicate/);
  });
});

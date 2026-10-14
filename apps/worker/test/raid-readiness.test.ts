import { createSeededRng, readinessBand, type ReadinessBand, type Rng } from '@creatures/game';
import { forecastFinale, forecastWeek } from '@creatures/engine';
import { describe, expect, it } from 'vitest';
import { READINESS_MAX_AGE_MS, READINESS_MIN_INTERVAL_MS } from '../src/raid-readiness';
import { buildPhaseInput } from '../src/raid-resolve';
import { eventTimes } from '../src/raid-schedule';
import type { CoreContext } from './helpers';
import {
  HELSINKI,
  MINUTE,
  W02,
  forcePool,
  rows,
  runRaid,
  scriptedThenSeeded,
  seedPlayer,
  type Seeded,
} from './raid-helpers';

const BANDS: readonly ReadinessBand[] = ['long_shot', 'even', 'likely', 'strong'];

function countingRng(seed: string): Rng & { drawn: () => number } {
  const inner = createSeededRng(seed);
  let n = 0;
  return {
    nextU32() {
      n++;
      return inner.nextU32();
    },
    drawn: () => n,
  };
}

const SECOND = 1000;

/** Seeds `n` players and opens the week; the clock stays on Monday. */
function open(ctx: CoreContext, n = 4, level = 12): Seeded[] {
  const players = Array.from({ length: n }, (_, i) => seedPlayer(ctx, i + 1, { level }));
  ctx.core.raid.currentWeek(HELSINKI);
  return players;
}

const bandOf = (ctx: CoreContext, player: Seeded): ReadinessBand | null | undefined =>
  ctx.core.raid.view(player.id, HELSINKI).party?.readiness;

describe('the readiness band in the raid view', () => {
  it('is one of four plain words per party, and nothing else about the forecast', async () => {
    await runRaid(
      (ctx) => {
        const [a] = open(ctx) as [Seeded, ...Seeded[]];
        const view = ctx.core.raid.view(a.id, HELSINKI);
        expect(BANDS).toContain(view.party?.readiness);
        // The party block carries the band and no forecast number.
        const json = JSON.stringify(view.party);
        expect(json).not.toMatch(/margin|forecast|odds|chance|percent/i);
        expect(typeof view.party?.readiness).toBe('string');
        // A player who is not in a party has no party block, so no band.
        const outsider = seedPlayer(ctx, 90, { lastSeenAt: 0 });
        expect(ctx.core.raid.view(outsider.id, HELSINKI).party).toBeNull();
      },
      { start: W02.monday, core: { readinessRng: createSeededRng('r') } },
    );
  });

  it('covers the whole scale: a boss that cannot fall is a long shot and a tiny one is strong', async () => {
    await runRaid(
      (ctx) => {
        const [a] = open(ctx) as [Seeded, ...Seeded[]];
        // After Saturday the band is the finale forecast against the HP left.
        ctx.clock.t = W02.afterPhase2;
        ctx.core.raid.runDue(HELSINKI);
        forcePool(ctx.sql, 50_000_000, 50_000_000);
        ctx.core.raid.view(a.id, HELSINKI); // computed for the old pool
        ctx.clock.t += READINESS_MAX_AGE_MS + SECOND;
        expect(bandOf(ctx, a)).toBe('long_shot');
        forcePool(ctx.sql, 5_000, 5_000);
        ctx.clock.t += READINESS_MAX_AGE_MS + SECOND;
        expect(bandOf(ctx, a)).toBe('strong');
      },
      { start: W02.monday, core: { readinessRng: createSeededRng('r') } },
    );
  });

  it('is the week forecast until Saturday and the finale forecast after it, from the injected rng', async () => {
    // Before Saturday: the whole week from the full pool, no counter-move.
    await runRaid(
      (ctx) => {
        const [a] = open(ctx) as [Seeded, ...Seeded[]];
        const week = ctx.core.raid.week(W02.id) as NonNullable<
          ReturnType<typeof ctx.core.raid.week>
        >;
        const built = buildPhaseInput(ctx.sql, week, 1, 'finale', { practice: true });
        if (built === null) throw new Error('no party');
        const stage = (phase: 'phase1' | 'phase2') => ({
          ...built.input,
          phase,
          finaleAbilities: [],
        });
        const expected = readinessBand(
          forecastWeek(
            { phase1: stage('phase1'), phase2: stage('phase2'), finale: built.input },
            createSeededRng('r'),
          ),
        );
        expect(bandOf(ctx, a)).toBe(expected);
      },
      { start: W02.monday, core: { readinessRng: createSeededRng('r') } },
    );
    // After Saturday: the finale input the party would fight with now.
    await runRaid(
      (ctx) => {
        const [a] = open(ctx) as [Seeded, ...Seeded[]];
        ctx.clock.t = W02.afterPhase2;
        ctx.core.raid.runDue(HELSINKI);
        const week = ctx.core.raid.week(W02.id) as NonNullable<
          ReturnType<typeof ctx.core.raid.week>
        >;
        expect(week.status).toBe('phase2');
        const built = buildPhaseInput(ctx.sql, week, 1, 'finale');
        if (built === null) throw new Error('no party');
        expect(bandOf(ctx, a)).toBe(
          readinessBand(forecastFinale(built.input, createSeededRng('r'))),
        );
      },
      { start: W02.monday, core: { readinessRng: createSeededRng('r') } },
    );
  });

  it('draws fresh dice from its own rng: never the raid rng, and not the seeds of stored fights', async () => {
    const raidRng = scriptedThenSeeded([], 'raid-seeds-1');
    const readinessRng = countingRng('fresh');
    await runRaid(
      (ctx) => {
        const [a] = open(ctx) as [Seeded, ...Seeded[]];
        const before = raidRng.drawn();
        expect(readinessRng.drawn()).toBe(0);
        bandOf(ctx, a);
        expect(readinessRng.drawn()).toBeGreaterThan(0);
        expect(raidRng.drawn()).toBe(before);
        // After a phase resolved with seeds drawn from the raid rng, the forecast still uses its own.
        ctx.clock.t = W02.afterPhase1;
        ctx.core.raid.runDue(HELSINKI);
        const resolvedAt = raidRng.drawn();
        expect(resolvedAt).toBeGreaterThan(before);
        bandOf(ctx, a);
        expect(raidRng.drawn()).toBe(resolvedAt);
      },
      { start: W02.monday, core: { raidRng, readinessRng } },
    );

    // Same dice, different stored seeds: the same band and the same number of draws on Monday.
    const results: { band: unknown; drawn: number }[] = [];
    for (const raidSeed of ['one', 'two']) {
      const rng = countingRng('same-dice');
      await runRaid(
        (ctx) => {
          const [a] = open(ctx) as [Seeded, ...Seeded[]];
          results.push({ band: bandOf(ctx, a), drawn: rng.drawn() });
        },
        {
          start: W02.monday,
          core: { raidRng: scriptedThenSeeded([], raidSeed), readinessRng: rng },
        },
      );
    }
    expect(results[0]).toEqual(results[1]);
  });

  it('is cached: a forecast per party and state, recomputed lazily and at most every 30 seconds', async () => {
    const rng = countingRng('cache');
    await runRaid(
      (ctx) => {
        const [a, b] = open(ctx) as [Seeded, Seeded, ...Seeded[]];
        const t0 = ctx.clock.t;
        const first = bandOf(ctx, a);
        const drawn = rng.drawn();
        expect(drawn).toBeGreaterThan(0);

        // Reads (by anyone in the party) cost nothing more.
        expect(bandOf(ctx, a)).toBe(first);
        expect(bandOf(ctx, b)).toBe(first);
        expect(rng.drawn()).toBe(drawn);

        // A placement marks the band as stale, but it is not recomputed within 30 seconds.
        const team = ctx.core.raid.view(a.id, HELSINKI).you.team?.creatures ?? [];
        expect(ctx.core.raid.place(a.id, HELSINKI, a.creatureIds[0] as string, 0).ok).toBe(true);
        expect(team.length).toBe(3);
        ctx.clock.t = t0 + READINESS_MIN_INTERVAL_MS - SECOND;
        bandOf(ctx, a);
        expect(rng.drawn()).toBe(drawn);
        // After 30 seconds, the next read recomputes (once).
        ctx.clock.t = t0 + READINESS_MIN_INTERVAL_MS + SECOND;
        bandOf(ctx, a);
        const afterChange = rng.drawn();
        expect(afterChange).toBeGreaterThan(drawn);
        bandOf(ctx, b);
        expect(rng.drawn()).toBe(afterChange);

        // Without a change it is kept for minutes (training is picked up then).
        ctx.clock.t += 3 * MINUTE;
        bandOf(ctx, a);
        expect(rng.drawn()).toBe(afterChange);
        ctx.clock.t += READINESS_MAX_AGE_MS;
        bandOf(ctx, a);
        expect(rng.drawn()).toBeGreaterThan(afterChange);
      },
      { start: W02.monday, core: { readinessRng: rng } },
    );
  });

  it('is recomputed at once when Friday’s result arrives, and has an entry per party', async () => {
    const rng = countingRng('states');
    await runRaid(
      (ctx) => {
        const players = open(ctx, 16, 8);
        const parties = new Map(
          rows<{ user_id: string; party: number }>(
            ctx.sql,
            'SELECT user_id, party FROM raid_party_members',
          ).map((r) => [r.user_id, r.party]),
        );
        const inParty = (n: number) => players.find((p) => parties.get(p.id) === n) as Seeded;
        const p1 = inParty(1);
        const p2 = inParty(2);
        const base = rng.drawn();
        bandOf(ctx, p1);
        const afterOne = rng.drawn();
        expect(afterOne).toBeGreaterThan(base);
        // The other party has its own forecast.
        bandOf(ctx, p2);
        const afterTwo = rng.drawn();
        expect(afterTwo).toBeGreaterThan(afterOne);
        bandOf(ctx, p2);
        expect(rng.drawn()).toBe(afterTwo);

        // Phase 1 resolves a few seconds from now: the state changed, so it is computed again even
        // though the last forecast is only seconds old.
        const phase1 = eventTimes(W02.id, HELSINKI).phase1;
        ctx.clock.t = phase1 - 10 * SECOND;
        ctx.sql.exec('UPDATE players SET last_seen_at = ?', ctx.clock.t);
        bandOf(ctx, p1);
        const beforeFriday = rng.drawn();
        ctx.clock.t = phase1 + 5 * SECOND;
        expect(ctx.core.raid.view(p1.id, HELSINKI).status).toBe('phase1');
        expect(rng.drawn()).toBeGreaterThan(beforeFriday);
      },
      { start: W02.monday, core: { readinessRng: rng } },
    );
  });

  it('is gone once the finale has started, and after it has resolved', async () => {
    const rng = countingRng('finale');
    await runRaid(
      (ctx) => {
        const [a] = open(ctx) as [Seeded, ...Seeded[]];
        ctx.clock.t = W02.afterPhase2;
        ctx.core.raid.runDue(HELSINKI);
        expect(BANDS).toContain(bandOf(ctx, a));
        ctx.clock.t = Date.parse('2027-01-17T18:00:00Z');
        ctx.core.raid.runDue(HELSINKI);
        const drawn = rng.drawn();
        expect(bandOf(ctx, a)).toBeNull();
        ctx.clock.t = Date.parse('2027-01-17T19:30:00Z');
        ctx.core.raid.settleDueLive();
        expect(bandOf(ctx, a)).toBeNull();
        expect(rng.drawn()).toBe(drawn);
      },
      { start: W02.monday, core: { readinessRng: rng } },
    );
  });

  it('never breaks the view when the forecast fails', async () => {
    const broken: Rng = {
      nextU32() {
        throw new Error('no randomness');
      },
    };
    await runRaid(
      (ctx) => {
        const [a] = open(ctx) as [Seeded, ...Seeded[]];
        expect(bandOf(ctx, a)).toBeNull();
      },
      { start: W02.monday, core: { readinessRng: broken } },
    );
  });
});

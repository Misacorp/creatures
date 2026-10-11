import { RULES } from '@creatures/game';
import closeLoss from '../../activity/src/fixtures/raid-stats-close-loss.json';
import closeWin from '../../activity/src/fixtures/raid-stats-close-win.json';
import finaleFixture from '../../activity/src/fixtures/raid-stats-finale.json';
import wipedFixture from '../../activity/src/fixtures/raid-stats-wiped.json';
import { describe, expect, it } from 'vitest';
import { hpNeeded, isCloseCall, type AfterActionStats } from '../src/raid-stats';
import { type CoreContext } from './helpers';
import {
  HELSINKI,
  W02,
  forcePool,
  membersOf,
  runRaid,
  seedPlayer,
  storedRuns,
} from './raid-helpers';

type Ctx = CoreContext;
const SUNDAY = W02.afterFinale;

async function login(ctx: Ctx, id: string, name: string): Promise<string> {
  return ctx.core.createSession(ctx.guildId, { id, displayName: name });
}

async function getStats(
  ctx: Ctx,
  secret: string,
  path: string,
): Promise<{ status: number; body: AfterActionStats }> {
  const res = await ctx.request(secret, path);
  return { status: res.status, body: await res.json<AfterActionStats>() };
}

/** Seeds `n` players and resolves phase 1 only, on a pool of the given size. Returns the party. */
function phase1(ctx: Ctx, pool: number, atk = 30, n = 4) {
  const players = Array.from({ length: n }, (_, i) =>
    seedPlayer(ctx, i + 1, { level: 12, name: `Player ${String(i + 1)}` }),
  );
  ctx.core.raid.currentWeek(HELSINKI);
  forcePool(ctx.sql, pool, pool, atk);
  ctx.clock.t = W02.afterPhase1;
  ctx.core.raid.runDue(HELSINKI);
  const run = storedRuns(ctx.sql)[0];
  if (run === undefined) throw new Error('phase 1 did not resolve');
  const first = players[0];
  if (first === undefined) throw new Error('no players');
  return { players, run, first };
}

/** HP the party's players take off a huge pool in phase 1 (the same seeds every time). */
async function baselineDamage(): Promise<number> {
  return runRaid((ctx) => {
    const { run } = phase1(ctx, 1_000_000_000);
    return run.result.bossHpStart - run.result.bossHpEnd;
  });
}

describe('the close rule', () => {
  const base = { phase: 'phase1', hpMax: 1000, rounds: 10, maxRounds: 10 } as const;
  const needed = hpNeeded('phase1', 1000);

  it('reads its limits from RULES and needs the clear threshold of the stage', () => {
    expect(RULES.raid.closeCall).toEqual({ missBp: 1000, spareBp: 1000 });
    expect(needed).toBe(180);
    expect(hpNeeded('phase2', 1000)).toBe(540);
    expect(hpNeeded('finale', 1000)).toBe(1000);
    // Rounded up: 18% of 1001 is 180.18, so 181 HP must come off.
    expect(hpNeeded('phase1', 1001)).toBe(181);
  });

  it('phase: a miss by at most 10% of the threshold is close, an HP more is not', () => {
    const lostFor = (shortBy: number) => ({
      ...base,
      cleared: false,
      hpEnd: 1000 - (needed - shortBy),
    });
    expect(isCloseCall(lostFor(18))).toBe(true); // exactly 10% of 180
    expect(isCloseCall(lostFor(19))).toBe(false);
    expect(isCloseCall(lostFor(1))).toBe(true);
  });

  it('phase: a win with at most 10% of the threshold to spare is close, an HP more is not', () => {
    const wonBy = (spare: number) => ({ ...base, cleared: true, hpEnd: 1000 - (needed + spare) });
    expect(isCloseCall(wonBy(0))).toBe(true);
    expect(isCloseCall(wonBy(18))).toBe(true);
    expect(isCloseCall(wonBy(19))).toBe(false);
  });

  it('phase 2 uses its own, cumulative threshold', () => {
    const threshold = hpNeeded('phase2', 1000);
    const args = { phase: 'phase2', hpMax: 1000, rounds: 10, maxRounds: 10 } as const;
    expect(isCloseCall({ ...args, cleared: false, hpEnd: 1000 - (threshold - 54) })).toBe(true);
    expect(isCloseCall({ ...args, cleared: false, hpEnd: 1000 - (threshold - 55) })).toBe(false);
    expect(isCloseCall({ ...args, cleared: true, hpEnd: 1000 - (threshold + 54) })).toBe(true);
    expect(isCloseCall({ ...args, cleared: true, hpEnd: 1000 - (threshold + 55) })).toBe(false);
  });

  it('finale loss: close when the boss kept at most 10% of its maximum HP', () => {
    const args = {
      phase: 'finale',
      cleared: false,
      hpMax: 1000,
      rounds: 12,
      maxRounds: 12,
    } as const;
    expect(isCloseCall({ ...args, hpEnd: 100 })).toBe(true);
    expect(isCloseCall({ ...args, hpEnd: 101 })).toBe(false);
    expect(isCloseCall({ ...args, hpEnd: 1000 })).toBe(false);
  });

  it('finale win: close when it ended with at most 10% of the rounds left', () => {
    const args = { phase: 'finale', cleared: true, hpMax: 1000, hpEnd: 0, maxRounds: 12 } as const;
    expect(isCloseCall({ ...args, rounds: 12 })).toBe(true);
    expect(isCloseCall({ ...args, rounds: 11 })).toBe(true); // 1 of 12 rounds left, 8.3%
    expect(isCloseCall({ ...args, rounds: 10 })).toBe(false); // 2 of 12 left, 16.7%
    expect(isCloseCall({ ...args, rounds: 3 })).toBe(false);
  });
});

describe('after-action stats of real stored fights', () => {
  it('a close win: cleared with a little to spare', async () => {
    const damage = await baselineDamage();
    expect(damage).toBeGreaterThan(1000);
    // The threshold is 5% under what the party can do, whatever the pool.
    const pool = Math.ceil(((damage / 1.05) * 10_000) / RULES.raid.phases[0].clearAtLossBp);
    await runRaid(async (ctx) => {
      const { run, first } = phase1(ctx, pool);
      expect(run.result.cleared).toBe(true);
      const secret = await login(ctx, first.id, first.name);
      const res = await getStats(ctx, secret, '/api/raid/stats/2027-W02/1/phase1');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ phase: 'phase1', outcome: 'cleared', close: true });
      expect(res.body.boss).toMatchObject({
        hpMax: pool,
        hpStart: pool,
        hpEnd: run.result.bossHpEnd,
        lost: damage,
        needed: Math.ceil((pool * 1800) / 10_000),
        leftBp: Math.floor((run.result.bossHpEnd * 10_000) / pool),
      });
      expect(res.body.rounds).toBe(run.result.rounds);
      expect(res.body.maxRounds).toBe(10);
    });
  });

  it('a close loss: not cleared, but only just', async () => {
    const damage = await baselineDamage();
    const pool = Math.floor((damage * 1.05 * 10_000) / RULES.raid.phases[0].clearAtLossBp);
    await runRaid(async (ctx) => {
      const { run, first } = phase1(ctx, pool);
      expect(run.result.cleared).toBe(false);
      const secret = await login(ctx, first.id, first.name);
      const res = await getStats(ctx, secret, '/api/raid/stats/2027-W02/1/phase1');
      expect(res.body).toMatchObject({ outcome: 'missed', close: true });
      expect(res.body.boss.lost).toBeLessThan(res.body.boss.needed);
    });
  });

  it('a clear win and a clear miss are not close', async () => {
    const damage = await baselineDamage();
    await runRaid(async (ctx) => {
      const { run, first } = phase1(ctx, Math.floor(damage / 3));
      expect(run.result.cleared).toBe(true);
      const secret = await login(ctx, first.id, first.name);
      const res = await getStats(ctx, secret, '/api/raid/stats/2027-W02/1/phase1');
      expect(res.body).toMatchObject({ outcome: 'cleared', close: false });
    });
    await runRaid(async (ctx) => {
      const { first } = phase1(ctx, damage * 20);
      const secret = await login(ctx, first.id, first.name);
      const res = await getStats(ctx, secret, '/api/raid/stats/2027-W02/1/phase1');
      expect(res.body).toMatchObject({ outcome: 'missed', close: false });
    });
  });

  it('a wipe-out: everyone is down, and every knockout is listed once', async () => {
    await runRaid(async (ctx) => {
      const { run, first, players } = phase1(ctx, 1_000_000_000, 1_000_000);
      expect(run.result.cleared).toBe(false);
      const secret = await login(ctx, first.id, first.name);
      const res = await getStats(ctx, secret, '/api/raid/stats/2027-W02/1/phase1');
      expect(res.body.outcome).toBe('wiped');
      expect(res.body.close).toBe(false);
      expect(res.body.knockouts).toHaveLength(run.input.row.length);
      expect(res.body.knockouts.every((k) => k.round >= 1 && k.round <= res.body.rounds)).toBe(
        true,
      );
      expect(res.body.knockouts.filter((k) => k.you)).toHaveLength(first.creatureIds.length);
      const owners = new Set(res.body.knockouts.map((k) => k.owner));
      expect(owners).toEqual(new Set(players.map((p) => p.name)));
    });
  });

  it('has the per-player, per-creature, reaction and adaptation numbers of the stored fight', async () => {
    await runRaid(async (ctx) => {
      const players = Array.from({ length: 5 }, (_, i) =>
        seedPlayer(ctx, i + 1, { level: 15, name: `Player ${String(i + 1)}` }),
      );
      ctx.core.raid.currentWeek(HELSINKI);
      // A pool the party cannot empty, so the finale is fought to its last round.
      forcePool(ctx.sql, 1_000_000);
      ctx.clock.t = SUNDAY;
      ctx.core.raid.runDue(HELSINKI);
      const runs = storedRuns(ctx.sql);
      expect(runs.map((r) => r.phase)).toEqual(['phase1', 'phase2', 'finale']);
      const me = players[1];
      if (me === undefined) throw new Error('no player');
      const secret = await login(ctx, me.id, me.name);
      const [s1, s2, sf] = await Promise.all(
        ['phase1', 'phase2', 'finale'].map(async (phase) => {
          const res = await getStats(ctx, secret, `/api/raid/stats/2027-W02/1/${phase}`);
          expect(res.status).toBe(200);
          return res.body;
        }),
      );
      if (s1 === undefined || s2 === undefined || sf === undefined) throw new Error('stats');

      for (const [stats, run] of [
        [s1, runs[0]],
        [s2, runs[1]],
        [sf, runs[2]],
      ] as const) {
        if (run === undefined) throw new Error('run');
        expect(stats.phase).toBe(run.phase);
        expect(stats.outcome === 'cleared').toBe(run.result.cleared);
        expect(stats.rounds).toBe(run.result.rounds);
        expect(stats.reactionsTotal).toBe(run.result.reactions.total);
        expect(stats.reactions.reduce((t, r) => t + r.count, 0)).toBe(run.result.reactions.total);
        // Players: everyone in the party, best damage first, the caller flagged.
        expect(stats.players).toHaveLength(5);
        expect(stats.players.filter((p) => p.you).map((p) => p.displayName)).toEqual([me.name]);
        const damages = stats.players.map((p) => p.damage);
        expect(damages).toEqual([...damages].sort((a, b) => b - a));
        expect(stats.players.reduce((t, p) => t + p.damage, 0)).toBe(run.summary.damage);
        // Creatures: the top five, the caller's own always there, ranks from the whole fight.
        const ranks = stats.creatures.map((c) => c.rank);
        expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
        expect(stats.creatures.filter((c) => c.you).length).toBe(me.creatureIds.length);
        expect(stats.creatures.length).toBeLessThanOrEqual(5 + me.creatureIds.length);
        expect(stats.creatures.length).toBeGreaterThanOrEqual(5);
        expect(stats.creatures[0]?.rank).toBe(1);
        const best = Math.max(...Object.values(run.result.perCreature).map((c) => c.damage));
        expect(stats.creatures[0]?.damage).toBe(best);
        // Boss numbers are the stored ones.
        expect(stats.boss).toMatchObject({
          hpMax: run.summary.bossHpMax,
          hpStart: run.result.bossHpStart,
          hpEnd: run.result.bossHpEnd,
          lost: run.summary.bossHpMax - run.result.bossHpEnd,
        });
      }

      // The adaptation is the counter-move of phase 1, fought in phase 2 and the finale.
      expect(s1.adaptation).toBeNull();
      expect(s2.adaptation).not.toBeNull();
      expect(sf.adaptation).not.toBeNull();
      expect(s2.adaptation).toMatchObject({ purged: false, purgedRound: null });
      expect(s2.adaptation?.resistBp).toBeGreaterThan(0);
      expect(typeof s2.adaptation?.target).toBe('string');

      // Only the finale has abilities: every one fired by default (nobody pressed Fire), and the
      // basic ability and the unlocked creature abilities of level 15 creatures are both there.
      expect(s1.abilities).toEqual({ used: [], unused: 0 });
      expect(s2.abilities).toEqual({ used: [], unused: 0 });
      const finale = runs[2];
      const abilityEvents = finale?.result.events.filter((e) => e.t === 'ability') ?? [];
      expect(sf.abilities.used).toHaveLength(abilityEvents.length);
      expect(sf.abilities.used.length).toBeGreaterThan(0);
      expect(sf.abilities.used.every((a) => a.byDefault && a.round >= 1)).toBe(true);
      expect(sf.abilities.used.some((a) => a.creature === null)).toBe(true);
      expect(sf.abilities.used.some((a) => a.creature !== null)).toBe(true);
      expect(sf.abilities.used.filter((a) => a.you).length).toBeGreaterThan(0);
      expect(sf.abilities.used.length + sf.abilities.unused).toBe(
        finale?.input.finaleAbilities.length,
      );
    });
  });

  it('shows abilities pressed by hand as not by default, and counts those that never fired', async () => {
    await runRaid(async (ctx) => {
      phase1(ctx, 1_000_000_000);
      const run = storedRuns(ctx.sql)[0];
      if (run === undefined) throw new Error('run');
      const [alias] = run.summary.members;
      if (alias === undefined) throw new Error('no member');
      // The stored fight is the data: hand-press one ability in a copy of it and read the stats.
      const { buildStats } = await import('../src/raid-stats');
      const { simulateFight } = await import('@creatures/engine');
      const { createSeededRng } = await import('@creatures/game');
      const input = {
        ...run.input,
        phase: 'finale' as const,
        finaleAbilities: [
          {
            playerId: alias.alias,
            abilityId: 'rally',
            key: `${alias.alias}:basic`,
            fireAtRound: 3,
          },
          {
            playerId: alias.alias,
            abilityId: 'purge',
            key: `${alias.alias}:late`,
            fireAtRound: 99,
          },
        ],
      };
      const result = simulateFight(input, createSeededRng('hand'));
      const names = new Map(run.summary.members.map((m) => [m.userId, `N-${m.alias}`]));
      const stats = buildStats('finale', input, result, run.summary, alias.userId, names);
      expect(stats.abilities.used).toEqual([
        {
          player: `N-${alias.alias}`,
          you: true,
          ability: 'Rally',
          creature: null,
          round: 3,
          byDefault: false,
        },
      ]);
      expect(stats.abilities.unused).toBe(1);
    });
  });

  it('serves members of that fight only, and tells no more than a missing fight does', async () => {
    await runRaid(async (ctx) => {
      // 16 players make two parties; the outsider is in party 2.
      const players = Array.from({ length: 16 }, (_, i) => seedPlayer(ctx, i + 1));
      ctx.core.raid.currentWeek(HELSINKI);
      forcePool(ctx.sql, 20_000);
      ctx.clock.t = W02.afterPhase1;
      ctx.core.raid.runDue(HELSINKI);
      const inParty1 = membersOf(ctx.sql, 1);
      const inParty2 = membersOf(ctx.sql, 2);
      const insider = players.find((p) => p.id === inParty1[0]);
      const outsider = players.find((p) => p.id === inParty2[0]);
      if (insider === undefined || outsider === undefined) throw new Error('parties');
      const inSecret = await login(ctx, insider.id, insider.name);
      const outSecret = await login(ctx, outsider.id, outsider.name);
      const path = '/api/raid/stats/2027-W02/1/phase1';
      expect((await getStats(ctx, inSecret, path)).status).toBe(200);
      const refused = await ctx.request(outSecret, path);
      const missing = await ctx.request(outSecret, '/api/raid/stats/2027-W02/1/phase2');
      expect(refused.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(await refused.json()).toEqual(await missing.json());
      // Own party works, an unknown party and week do not, and the path is validated.
      expect((await getStats(ctx, outSecret, '/api/raid/stats/2027-W02/2/phase1')).status).toBe(
        200,
      );
      expect((await getStats(ctx, outSecret, '/api/raid/stats/2027-W02/9/phase1')).status).toBe(
        404,
      );
      for (const bad of [
        '/api/raid/stats/2027-W99/1/phase1',
        '/api/raid/stats/nope/1/phase1',
        '/api/raid/stats/2027-W02/0/phase1',
        '/api/raid/stats/2027-W02/1/phase3',
        '/api/raid/stats/2027-W02/1/__proto__',
      ]) {
        expect((await ctx.request(inSecret, bad)).status, bad).toBe(400);
      }
    });
  });

  it('leaks no user id, creature id, alias key or seed, and names others by display name', async () => {
    await runRaid(async (ctx) => {
      const players = Array.from({ length: 5 }, (_, i) =>
        seedPlayer(ctx, i + 1, { level: 15, name: `Name ${String(i + 1)}` }),
      );
      ctx.core.raid.currentWeek(HELSINKI);
      forcePool(ctx.sql, 20_000);
      ctx.clock.t = SUNDAY;
      ctx.core.raid.runDue(HELSINKI);
      const me = players[0];
      if (me === undefined) throw new Error('no player');
      const secret = await login(ctx, me.id, me.name);
      for (const phase of ['phase1', 'phase2', 'finale']) {
        const res = await ctx.request(secret, `/api/raid/stats/2027-W02/1/${phase}`);
        const text = await res.text();
        for (const p of players) {
          expect(text, `${phase}: user id`).not.toContain(p.id);
          for (const id of p.creatureIds) expect(text, `${phase}: creature id`).not.toContain(id);
        }
        for (const run of storedRuns(ctx.sql)) {
          expect(text, 'seed').not.toContain(run.seed);
        }
        expect(text).not.toMatch(/"m\d+(:|")/);
        const body = JSON.parse(text) as AfterActionStats;
        const others = new Set(
          [...body.players.filter((p) => !p.you).map((p) => p.displayName)].sort(),
        );
        expect(others).toEqual(new Set(players.slice(1).map((p) => p.name)));
        // Every key of the answer is one of the documented display fields.
        expect(Object.keys(body).sort()).toEqual(
          [
            'abilities',
            'adaptation',
            'boss',
            'close',
            'creatures',
            'knockouts',
            'maxRounds',
            'outcome',
            'phase',
            'players',
            'reactions',
            'reactionsTotal',
            'rounds',
          ].sort(),
        );
      }
    });
  });

  it('adds the party to the loot reveal, so the client can ask for the finale stats', async () => {
    await runRaid((ctx) => {
      const players = Array.from({ length: 3 }, (_, i) => seedPlayer(ctx, i + 1, { level: 12 }));
      ctx.core.raid.currentWeek(HELSINKI);
      forcePool(ctx.sql, 20_000);
      ctx.clock.t = SUNDAY;
      ctx.core.raid.runDue(HELSINKI);
      const me = players[0];
      if (me === undefined) throw new Error('no player');
      const view = ctx.core.raid.view(me.id, HELSINKI);
      expect(view.you.reveal).toMatchObject({ week: '2027-W02', party: 1 });
      expect(ctx.core.raid.stats(me.id, '2027-W02', 1, 'finale')?.phase).toBe('finale');
    });
  });
});

/**
 * The contract with the client: the fixtures in `apps/activity/src/fixtures` are real answers of
 * this route, and the client parses them (`raid-api.test.ts` there). If the shape changes, this
 * fails and points at them.
 */
describe('the stats contract with the client', () => {
  const UPDATE =
    'the server shape changed: update apps/activity/src/fixtures and the client parser (parseStats)';
  const keys = (value: unknown): string[] => Object.keys(value as object).sort();
  const TOP = [
    'abilities',
    'adaptation',
    'boss',
    'close',
    'creatures',
    'knockouts',
    'maxRounds',
    'outcome',
    'phase',
    'players',
    'reactions',
    'reactionsTotal',
    'rounds',
  ];
  const BOSS = ['hpEnd', 'hpMax', 'hpStart', 'leftBp', 'lost', 'needed'];
  const PLAYER = ['contribution', 'damage', 'displayName', 'you'];
  const CREATURE = ['contribution', 'damage', 'name', 'owner', 'rank', 'species', 'you'];
  const REACTION = ['count', 'name', 'reflected'];
  const USED = ['ability', 'byDefault', 'creature', 'player', 'round', 'you'];
  const KNOCKOUT = ['creature', 'owner', 'round', 'species', 'you'];
  const ADAPTATION = ['name', 'purged', 'purgedRound', 'resistBp', 'restoredRound', 'target'];

  function expectShape(value: AfterActionStats, label: string): void {
    expect(keys(value), `${label}: ${UPDATE}`).toEqual(TOP);
    expect(keys(value.boss), `${label}.boss`).toEqual(BOSS);
    expect(keys(value.abilities), `${label}.abilities`).toEqual(['unused', 'used']);
    for (const p of value.players) expect(keys(p), `${label}.players`).toEqual(PLAYER);
    for (const c of value.creatures) expect(keys(c), `${label}.creatures`).toEqual(CREATURE);
    for (const r of value.reactions) expect(keys(r), `${label}.reactions`).toEqual(REACTION);
    for (const u of value.abilities.used) expect(keys(u), `${label}.used`).toEqual(USED);
    for (const k of value.knockouts) expect(keys(k), `${label}.knockouts`).toEqual(KNOCKOUT);
    if (value.adaptation !== null) {
      expect(keys(value.adaptation), `${label}.adaptation`).toEqual(ADAPTATION);
    }
  }

  it('sends the same keys as the saved fixtures, with nulls where there is nothing', async () => {
    await runRaid(async (ctx) => {
      const players = Array.from({ length: 5 }, (_, i) => seedPlayer(ctx, i + 1, { level: 15 }));
      ctx.core.raid.currentWeek(HELSINKI);
      forcePool(ctx.sql, 1_000_000);
      ctx.clock.t = SUNDAY;
      ctx.core.raid.runDue(HELSINKI);
      const me = players[0];
      if (me === undefined) throw new Error('no player');
      const secret = await login(ctx, me.id, me.name);
      for (const phase of ['phase1', 'phase2', 'finale']) {
        const res = await getStats(ctx, secret, `/api/raid/stats/2027-W02/1/${phase}`);
        expectShape(res.body, phase);
        // A phase has no abilities; the finale and phase 2 have the adaptation, phase 1 has none.
        expect(res.body.adaptation === null).toBe(phase === 'phase1');
      }
    });
    for (const [name, fixture] of [
      ['close-win', closeWin],
      ['close-loss', closeLoss],
      ['wiped', wipedFixture],
      ['finale', finaleFixture],
    ] as const) {
      expectShape(fixture as unknown as AfterActionStats, `fixture ${name}`);
    }
    // The fixtures have the optional parts the client has to handle.
    expect(closeWin.adaptation).toBeNull();
    expect(finaleFixture.adaptation?.purged).toBe(true);
    expect(finaleFixture.abilities.used.some((u) => u.creature === null)).toBe(true);
    expect(finaleFixture.abilities.used.some((u) => u.creature !== null)).toBe(true);
    expect(wipedFixture.outcome).toBe('wiped');
  });
});

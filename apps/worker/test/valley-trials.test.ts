/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment --
   These tests read parts of response bodies (`Json.body` is `any` on purpose). */
/**
 * Phase 5 step 9c: trials as honours and the School's ceremony (migration 66, `valley-trials.ts`, the ticks in the settle pass, the dungeon
 * and the raid, the `trials-tick` and `trials-ceremony` dev tools). Boxes tick as things happen (only at or above the trial's level), a
 * creature whose boxes are all ticked graduates at the next daily ceremony whether or not its owner is there, and the return walk tells it.
 */
import { VALLEY_RULES, ValleyViewSchema, createSeededRng, type ValleyView } from '@creatures/game';
import * as v from 'valibot';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ON, type Json } from './dev-helpers';
import { easyFoes, dungeonPlayer } from './dungeon-helpers';
import { runCore, type CoreContext } from './helpers';
import { HOUR, newKey, sessionCaller, type SessionCaller } from './kit';
import { count, joinRaid, nextGuild, rows, seedPlayer, HELSINKI } from './raid-helpers';
import { V2_WEEK, setBossHp, v2Player } from './raid-v2-helpers';
import { runRaid } from './raid-helpers';

const SYSTEMS = { ...ON, valleySystems: true, combatV2: true, dailyAllowance: true } as const;
const FLAG_OFF = { ...ON, dailyAllowance: true } as const;
const DAY = 24 * HOUR;
// Friday 2027-01-15 08:00 UTC (10:00 in Helsinki). The ceremony is at `ceremonyHour` Helsinki: 15:00 UTC in winter.
const FRIDAY = 1_800_000_000_000;
const CEREMONY_UTC = (day: number): number =>
  Date.UTC(2027, 0, 15 + day, VALLEY_RULES.honours.ceremonyHour - 2, 0);

interface P {
  id: string;
  creatureIds: string[];
  api: SessionCaller<Json['body']>;
  state: () => Promise<Json>;
}

async function newPlayer(ctx: CoreContext, n: number, level = 12, creatures = 2): Promise<P> {
  // Species whose level cap is 30 (the trials run to level 30), set to the level asked for.
  const seeded = seedPlayer(ctx, n, { creatures, species: ['tidewing', 'pyrelynx', 'thornbuck'] });
  ctx.sql.exec('UPDATE creatures SET level = ? WHERE user_id = ?', level, seeded.id);
  const api = await sessionCaller<Json['body']>(ctx, { id: seeded.id, displayName: seeded.name });
  return {
    id: seeded.id,
    creatureIds: seeded.creatureIds,
    api,
    state: () => api.call('GET', '/api/state'),
  };
}

const view = (res: Json): ValleyView => v.parse(ValleyViewSchema, res.body.valley);
const trialOf = (res: Json, id: string) => view(res).creatures.find((c) => c.id === id)?.trial;
const row = (ctx: CoreContext, id: string) =>
  rows<Record<string, number | null>>(
    ctx.sql,
    'SELECT * FROM creature_trials WHERE creature_id = ?',
    id,
  )[0];
const trials = (ctx: CoreContext) => {
  const t = ctx.core.valleyTrials;
  if (t === null) throw new Error('trials are off');
  return t;
};

describe('migration 66: the trials table', () => {
  it('creates creature_trials with its index, empty', async () => {
    await runCore(
      nextGuild(),
      (ctx) => {
        expect(count(ctx.sql, "pragma_table_info('creature_trials')", "name = 'ready3'")).toBe(1);
        expect(count(ctx.sql, 'creature_trials')).toBe(0);
        expect(
          count(ctx.sql, 'sqlite_master', "type = 'index' AND name = 'creature_trials_user'"),
        ).toBe(1);
      },
      SYSTEMS,
    );
  });
});

describe('with VALLEY_SYSTEMS off nothing of it exists', () => {
  it('writes no row, shows no honours and the dev tools are gone', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        const state = await p.state();
        expect(state.body.valley).toBeUndefined();
        expect(ctx.core.valleyTrials).toBeNull();
        expect(count(ctx.sql, 'creature_trials')).toBe(0);
        const id = p.creatureIds[0] as string;
        expect((await p.api.call('POST', '/api/dev/trials-tick', { creatureId: id })).status).toBe(
          404,
        );
        expect((await p.api.call('POST', '/api/dev/trials-ceremony', {})).status).toBe(404);
      },
      FLAG_OFF,
    );
  });
});

describe('ticks (V-TRIAL-2)', () => {
  it('count only for a creature at or above the trial level', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = FRIDAY;
        const low = await newPlayer(ctx, 1, 9, 1);
        const high = await newPlayer(ctx, 2, 10, 1);
        await low.state();
        await high.state();
        trials(ctx).tickEvent(low.id, low.creatureIds, 'dungeon', ctx.clock.t);
        trials(ctx).tickEvent(high.id, high.creatureIds, 'dungeon', ctx.clock.t);
        expect(row(ctx, low.creatureIds[0] as string)).toBeUndefined();
        expect(row(ctx, high.creatureIds[0] as string)?.boxes1).toBe(1);
        // Another player's creature is never ticked by a caller.
        trials(ctx).tickEvent(low.id, high.creatureIds, 'fire', ctx.clock.t);
        expect(row(ctx, high.creatureIds[0] as string)?.boxes1).toBe(1);
      },
      SYSTEMS,
    );
  });

  it('a day at a post and a day of smithing tick from the creature own hours; Expert and a week at a seat later', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = FRIDAY;
        const p = await newPlayer(ctx, 1, 25, 1);
        const id = p.creatureIds[0] as string;
        await p.state();
        const first = trialOf(await p.state(), id);
        expect(first).toMatchObject({ honour: 0, tier: 1, boxes: [false, false, false, false] });
        ctx.sql.exec('UPDATE valley_creatures SET smith_hours = 30 WHERE creature_id = ?', id);
        ctx.clock.t += 2 * 60_000;
        const bronze = trialOf(await p.state(), id);
        // Dungeon, post, home, fire: the day at a post and the smithing day are ticked; the fight and the friend are not.
        expect(bronze?.boxes).toEqual([false, true, true, false]);
        // Silver's boxes tick too for a level 25 creature, once Expert; scouting hours alone count for "post" and "craft".
        ctx.sql.exec('UPDATE valley_creatures SET scout_hours = 170 WHERE creature_id = ?', id);
        ctx.clock.t += 2 * 60_000;
        await p.state();
        expect((row(ctx, id)?.boxes2 as number) & 0b010).toBe(0b010);
      },
      SYSTEMS,
    );
  });

  it('a find brought home by a scout ticks Bronze home box', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = FRIDAY;
        const p = await newPlayer(ctx, 1, 12, 2);
        await p.state();
        const bought = await p.api.call('POST', '/api/valley/seat/buy', {
          idempotencyKey: newKey('seat'),
        });
        expect(bought.status).toBe(200);
        const id = p.creatureIds[0] as string;
        const posted = await p.api.call('POST', '/api/valley/seat', {
          seatId: bought.body.seatId,
          creatureId: id,
          destination: 'tidepools',
        });
        expect(posted.status).toBe(200);
        ctx.clock.t += 2 * DAY;
        await p.state();
        // Two days at a post: the day box; the pack came home on arrival: the find box.
        expect((row(ctx, id)?.boxes1 as number) & 0b0110).toBe(0b0110);
      },
      SYSTEMS,
    );
  });

  it('keystone and way-deeper boxes are Silver, a communal week is Gold (never before the level)', async () => {
    await runCore(
      nextGuild(),
      (ctx) => {
        const t = trials(ctx);
        // A level 21 creature takes Silver ticks, a level 21 one holds no Gold ticks.
        ctx.clock.t = FRIDAY;
        const p = seedPlayer(ctx, 1, { creatures: 1, species: ['tidewing'] });
        ctx.sql.exec('UPDATE creatures SET level = 21 WHERE user_id = ?', p.id);
        const id = p.creatureIds[0] as string;
        t.tickEvent(p.id, [id], 'further', ctx.clock.t);
        t.tickEvent(p.id, [id], 'raid', ctx.clock.t);
        expect(row(ctx, id)?.boxes2).toBe(0b100);
        expect(row(ctx, id)?.boxes3).toBe(0);
      },
      SYSTEMS,
    );
  });
});

describe('graduation (V-TRIAL-4)', () => {
  /** A level 12 player with every Bronze box but the fire ticked, then the last one at `at`. */
  async function readyAt(ctx: CoreContext, n: number, at: number): Promise<P> {
    ctx.clock.t = FRIDAY;
    const p = await newPlayer(ctx, n, 12, 1);
    const id = p.creatureIds[0] as string;
    await p.state();
    ctx.sql.exec(
      'UPDATE valley_creatures SET scout_hours = 30, smith_hours = 30 WHERE creature_id = ?',
      id,
    );
    // A pass ticks the day at a post and the day of smithing (stamped at that pass).
    ctx.clock.t = FRIDAY + 2 * 60_000;
    await p.state();
    const t = trials(ctx);
    t.tickEvent(p.id, [id], 'dungeon', ctx.clock.t);
    ctx.clock.t = at;
    t.tickEvent(p.id, [id], 'fire', ctx.clock.t);
    return p;
  }

  it('is ready, then graduates at the first ceremony after the last tick, not before', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await readyAt(ctx, 1, FRIDAY + 60_000);
        const id = p.creatureIds[0] as string;
        ctx.clock.t = FRIDAY + 5 * 60_000;
        const waiting = await p.state();
        expect(trialOf(waiting, id)).toMatchObject({ honour: 0, tier: 1, ready: true });
        expect(view(waiting).graduation).toEqual({ ready: 1, nextAt: CEREMONY_UTC(0) });
        ctx.clock.t = CEREMONY_UTC(0) - 60_000;
        expect(trialOf(await p.state(), id)?.honour).toBe(0);
        ctx.clock.t = CEREMONY_UTC(0) + 60_000;
        const done = await p.state();
        expect(trialOf(done, id)).toMatchObject({ honour: 1, tier: 2, ready: false });
        expect(view(done).graduation).toEqual({ ready: 0, nextAt: CEREMONY_UTC(1) });
        expect(row(ctx, id)).toMatchObject({ honour: 1, honour_at: CEREMONY_UTC(0) });
      },
      SYSTEMS,
    );
  });

  it('a tick after the evening waits for the next day', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await readyAt(ctx, 1, CEREMONY_UTC(0) + HOUR);
        const id = p.creatureIds[0] as string;
        ctx.clock.t = CEREMONY_UTC(0) + 2 * HOUR;
        expect(trialOf(await p.state(), id)?.honour).toBe(0);
        ctx.clock.t = CEREMONY_UTC(1) + 60_000;
        expect(trialOf(await p.state(), id)?.honour).toBe(1);
      },
      SYSTEMS,
    );
  });

  it('is the same whether the owner looked in between or only once, and is told once in the return walk', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const often = await readyAt(ctx, 1, FRIDAY + 60_000);
        const once = await readyAt(ctx, 2, FRIDAY + 60_000);
        const a = often.creatureIds[0] as string;
        const b = once.creatureIds[0] as string;
        // One player looks every few hours and at the ceremony; the other does not look until the next Wednesday.
        for (const at of [
          FRIDAY + 3 * HOUR,
          CEREMONY_UTC(0) + 5 * 60_000,
          CEREMONY_UTC(1) + HOUR,
        ]) {
          ctx.clock.t = at;
          await often.state();
        }
        ctx.clock.t = CEREMONY_UTC(5);
        const seenOften = await often.state();
        const seenOnce = await once.state();
        for (const [res, id] of [
          [seenOften, a],
          [seenOnce, b],
        ] as const) {
          expect(trialOf(res, id)).toMatchObject({ honour: 1, tier: 2 });
        }
        expect(row(ctx, a)?.honour_at).toBe(CEREMONY_UTC(0));
        expect(row(ctx, b)?.honour_at).toBe(CEREMONY_UTC(0));
        // The one who stayed away is told in the paper: "graduated at the School", once.
        const paper = view(seenOnce).paper;
        const line = paper?.headlines.find((h) => h.kind === 'graduation');
        expect(line).toMatchObject({ count: 1, step: 1, creatureIds: [b] });
        expect(row(ctx, b)?.told).toBe(1);
        const close = await once.api.call('POST', '/api/valley/gazette/close', {
          paperId: paper?.id,
        });
        expect(close.status).toBe(200);
        ctx.clock.t = CEREMONY_UTC(7);
        const later = await once.state();
        expect(view(later).paper?.headlines.some((h) => h.kind === 'graduation') ?? false).toBe(
          false,
        );
      },
      SYSTEMS,
    );
  });

  it('several creatures graduating while away are one line', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = FRIDAY;
        const p = await newPlayer(ctx, 1, 12, 3);
        await p.state();
        for (const id of p.creatureIds) {
          ctx.sql.exec(
            'UPDATE valley_creatures SET scout_hours = 30, smith_hours = 30 WHERE creature_id = ?',
            id,
          );
        }
        ctx.clock.t = FRIDAY + 2 * 60_000;
        await p.state();
        for (const id of p.creatureIds) {
          trials(ctx).tickEvent(p.id, [id], 'dungeon', ctx.clock.t);
          trials(ctx).tickEvent(p.id, [id], 'fire', ctx.clock.t);
        }
        ctx.clock.t = CEREMONY_UTC(3);
        const res = await p.state();
        const line = view(res).paper?.headlines.find((h) => h.kind === 'graduation');
        expect(line?.count).toBe(3);
        expect(line?.creatureIds).toHaveLength(3);
      },
      SYSTEMS,
    );
  });

  it('gives no honour above the creature: no stat or slot changes, levels never stop', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await readyAt(ctx, 1, FRIDAY + 60_000);
        const id = p.creatureIds[0] as string;
        const before = ctx.sql
          .exec<{ level: number; ribbons: number }>(
            'SELECT level, ribbons FROM creatures WHERE id = ?',
            id,
          )
          .one();
        ctx.clock.t = CEREMONY_UTC(1);
        await p.state();
        expect(trialOf(await p.state(), id)?.honour).toBe(1);
        const after = ctx.sql
          .exec<{ level: number; ribbons: number }>(
            'SELECT level, ribbons FROM creatures WHERE id = ?',
            id,
          )
          .one();
        expect(after.level).toBeGreaterThanOrEqual(before.level);
        // With the valley on the old ribbon gates are open (step 1): the creature holds every ribbon without any honour.
        expect(after.ribbons).toBeGreaterThanOrEqual(before.ribbons);
      },
      SYSTEMS,
    );
  });
});

describe('the staging tools', () => {
  it('trials-tick ticks the next trial, trials-ceremony graduates now; valley-fresh clears the rows', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = FRIDAY;
        const p = await newPlayer(ctx, 1, 3, 1);
        const id = p.creatureIds[0] as string;
        await p.state();
        const ticked = await p.api.call('POST', '/api/dev/trials-tick', { creatureId: id });
        expect(ticked).toMatchObject({ status: 200, body: { result: { ticked: true } } });
        expect(trialOf(await p.state(), id)).toMatchObject({ tier: 1, ready: true });
        const held = await p.api.call('POST', '/api/dev/trials-ceremony', {});
        expect(held).toMatchObject({ status: 200, body: { result: { graduated: 1 } } });
        ctx.clock.t += 5 * 60_000;
        expect(trialOf(await p.state(), id)).toMatchObject({ honour: 1, tier: 2, ready: false });
        // Another player's creature cannot be ticked, and a bad body is refused.
        const other = await newPlayer(ctx, 2, 3, 1);
        expect(
          (await other.api.call('POST', '/api/dev/trials-tick', { creatureId: id })).status,
        ).toBeGreaterThanOrEqual(400);
        expect(
          (await p.api.call('POST', '/api/dev/trials-tick', { creatureId: id, extra: 1 })).status,
        ).toBe(400);
        expect(count(ctx.sql, 'creature_trials')).toBe(1);
        const fresh = await p.api.call('POST', '/api/dev/valley-fresh', {});
        expect(fresh.status).toBe(200);
        expect(count(ctx.sql, 'creature_trials')).toBe(0);
      },
      SYSTEMS,
    );
  });
});

describe('the dungeon and the raid tick the combat boxes', () => {
  let restore: () => void = () => undefined;
  beforeEach(() => {
    restore = easyFoes();
  });
  afterEach(() => {
    restore();
  });

  it('a dungeon clear ticks Bronze for the creatures that fought, once they are level 10', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = Date.parse('2027-01-15T12:00:00Z');
        const p = await dungeonPlayer(ctx, 1, {
          level: 30,
          species: ['tidewing', 'pyrelynx', 'thornbuck'],
        });
        const run = await p.run();
        expect(run.status, JSON.stringify(run.body).slice(0, 200)).toBe(200);
        expect(run.body.run?.cleared).toBe(true);
        const ticked = p.creatureIds.filter(
          (id) => ((row(ctx, id)?.boxes1 as number | undefined) ?? 0) & 1,
        );
        expect(ticked.length).toBeGreaterThan(0);
        expect(count(ctx.sql, 'creature_trials')).toBe(ticked.length);
      },
      {
        ...SYSTEMS,
        dungeonRng: createSeededRng('trials-dungeon'),
        gearRng: createSeededRng('trials-gear'),
      },
    );
  });

  it('a raid kill ticks Gold for the party creatures at level 30 and not below', async () => {
    await runRaid(
      (ctx) => {
        const players = [1, 2, 3, 4].map((n) => v2Player(ctx, n, { level: 22 }));
        ctx.sql.exec(
          'INSERT INTO raid_track (id, slot, best_share_bp, failed_weekends) VALUES (1, 6, 2500, 2)',
        );
        // One player's creatures are level 30.
        ctx.sql.exec('UPDATE creatures SET level = 30 WHERE user_id = ?', players[0]?.id);
        ctx.core.raid.currentWeek(HELSINKI);
        joinRaid(ctx, players);
        ctx.clock.t = V2_WEEK.stage1 + 30_000;
        ctx.core.raid.runDue(HELSINKI);
        setBossHp(ctx.sql, 5);
        ctx.clock.t = V2_WEEK.stage2 + 30_000;
        ctx.core.raid.runDue(HELSINKI);
        const gold = (userId: string): number =>
          rows<{ n: number }>(
            ctx.sql,
            'SELECT COUNT(*) AS n FROM creature_trials WHERE user_id = ? AND (boxes3 & 1) = 1',
            userId,
          )[0]?.n ?? 0;
        expect(gold(players[0]?.id ?? '')).toBeGreaterThan(0);
        for (const other of players.slice(1)) expect(gold(other.id)).toBe(0);
      },
      { core: { ...SYSTEMS, combatV2: true } },
    );
  });
});

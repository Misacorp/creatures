/* eslint-disable @typescript-eslint/no-unsafe-member-access --
   These tests read parts of response bodies (`Json.body` is `any` on purpose). */
/**
 * Phase 5 step 1: resting and the lazy pass on the server (migration 56, `valley-settle.ts`). With the flag on every creature earns
 * idle XP by the away steps, the allowance builds in a store that comes home on arrival, and lounge XP, treats and ribbon gates are
 * off; with it off the game is unchanged and no valley row exists.
 */
import { RULES, VALLEY_RULES, ValleyViewSchema, awayShare, expToReach } from '@creatures/game';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { ON, type Json } from './dev-helpers';
import { runCore, type CoreContext } from './helpers';
import { HOUR, MINUTE, newKey, sessionCaller, setCreature, type SessionCaller } from './kit';
import { count, nextGuild, seedPlayer } from './raid-helpers';
import { DESTINATION_IDS } from '../src/content-ids';
import { loungeDay } from '../src/lounge-company';
import { VISIT_GAP_MS, INTENT_MIN_MS, allowanceCap } from '../src/valley-settle';
import { speciesOf } from '../src/species';

const SYSTEMS = { ...ON, valleySystems: true, combatV2: true, dailyAllowance: true } as const;
const FLAG_OFF = { ...ON, dailyAllowance: true } as const;
const BASE = VALLEY_RULES.xp.idlePerHour;

interface P {
  id: string;
  creatureIds: string[];
  api: SessionCaller<Json['body']>;
  state: () => Promise<Json>;
}

async function newPlayer(ctx: CoreContext, n: number, creatures = 3, level = 3): Promise<P> {
  const seeded = seedPlayer(ctx, n, { creatures, level });
  const api = await sessionCaller<Json['body']>(ctx, { id: seeded.id, displayName: seeded.name });
  return {
    id: seeded.id,
    creatureIds: seeded.creatureIds,
    api,
    state: () => api.call('GET', '/api/state'),
  };
}

/** A creature's total XP from level 1, as the table holds it. */
function totalXp(sql: SqlStorage, id: string): number {
  const row = sql
    .exec<{ level: number; exp: number }>('SELECT level, exp FROM creatures WHERE id = ?', id)
    .one();
  return expToReach(row.level) + row.exp;
}

const bait = (sql: SqlStorage, userId: string): number =>
  sql
    .exec<{ amount: number }>(
      "SELECT amount FROM balances WHERE user_id = ? AND currency = 'bait'",
      userId,
    )
    .toArray()[0]?.amount ?? 0;

const valleyRow = (sql: SqlStorage, userId: string) =>
  sql.exec('SELECT * FROM valley_players WHERE user_id = ?', userId).toArray()[0];

/** What the valley rows hold, to compare before and after a repeat. */
const snapshot = (sql: SqlStorage): unknown => [
  sql.exec('SELECT * FROM valley_players ORDER BY user_id').toArray(),
  sql.exec('SELECT * FROM valley_creatures ORDER BY creature_id').toArray(),
  sql.exec('SELECT id, level, exp, ribbons FROM creatures ORDER BY id').toArray(),
  sql.exec('SELECT user_id, currency, amount FROM balances ORDER BY user_id, currency').toArray(),
  sql.exec('SELECT COUNT(*) AS n FROM ledger').one(),
];

describe('migration 56: the valley tables', () => {
  it('creates both tables with the per-player index, empty', async () => {
    await runCore(
      nextGuild(),
      (ctx) => {
        const columns = (table: string): string[] =>
          ctx.sql
            .exec<{ name: string }>(`SELECT name FROM pragma_table_info('${table}')`)
            .toArray()
            .map((r) => r.name);
        expect(columns('valley_players')).toEqual([
          'user_id',
          'settled_at',
          'last_visit_at',
          'hearth_at_visit_bp',
          'visit_started_at',
          'allowance_store',
          'allowance_carry',
          'visit_allowance',
          // Migration 57 (scouts): the starter's first scout has had its sure find.
          'first_scout_done',
          // Migration 58: tinkering scrap not yet whole.
          'forge_carry',
        ]);
        expect(columns('valley_creatures')).toEqual([
          'creature_id',
          'user_id',
          'seat_id',
          'catchup_bp',
          'xp_carry',
          'visit_xp',
          // Migration 57: the creature's scouting hours.
          'scout_hours',
          // Migration 58: the creature's smithing hours.
          'smith_hours',
        ]);
        expect(
          ctx.sql
            .exec<{ name: string }>("SELECT name FROM pragma_index_list('valley_creatures')")
            .toArray()
            .map((r) => r.name),
        ).toContain('valley_creatures_user');
        expect(count(ctx.sql, 'valley_players') + count(ctx.sql, 'valley_creatures')).toBe(0);
      },
      SYSTEMS,
    );
  });

  it('is cleared with the rest by valley-fresh (both tables carry user_id)', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        await p.state();
        expect(count(ctx.sql, 'valley_players')).toBe(1);
        expect(count(ctx.sql, 'valley_creatures')).toBe(3);
        const res = await p.api.call('POST', '/api/dev/valley-fresh', {});
        expect(res.status).toBe(200);
        expect(count(ctx.sql, 'valley_players')).toBe(0);
        expect(count(ctx.sql, 'valley_creatures')).toBe(0);
      },
      SYSTEMS,
    );
  });
});

describe('the valley pass in /api/state (flag on)', () => {
  it('opens the valley on the first look and answers the strict shape', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        const res = await p.state();
        expect(res.status).toBe(200);
        const valley = v.parse(ValleyViewSchema, res.body.valley);
        expect(valley.arrived).toBe(true);
        expect(valley.creatures.map((c) => c.id).sort()).toEqual([...p.creatureIds].sort());
        expect(valley.creatures.every((c) => c.state === 'resting' && c.gained === 0)).toBe(true);
        expect(valley.allowance).toEqual({ store: 0, cap: allowanceCap(), brought: 0 });
        expect(allowanceCap()).toBe(90);
        // The creature views keep their own shape; the valley view only adds.
        expect(res.body.creatures).toHaveLength(3);
      },
      SYSTEMS,
    );
  });

  it('pays a day away at the full rate, brings the allowance home and shows the +N', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        await p.state();
        const first = p.creatureIds[0] as string;
        const xp0 = totalXp(ctx.sql, first);
        const bait0 = bait(ctx.sql, p.id);
        ctx.clock.t += 24 * HOUR;
        const res = await p.state();
        const valley = v.parse(ValleyViewSchema, res.body.valley);
        expect(valley).toMatchObject({ arrived: true, awayHours: 24 });
        expect(totalXp(ctx.sql, first) - xp0).toBe(24 * BASE);
        expect(valley.creatures.find((c) => c.id === first)?.gained).toBe(24 * BASE);
        expect(valley.allowance).toEqual({
          store: 0,
          cap: 90,
          brought: VALLEY_RULES.acorns.allowancePerDay,
        });
        expect(bait(ctx.sql, p.id) - bait0).toBe(VALLEY_RULES.acorns.allowancePerDay);
        const entry = ctx.sql
          .exec<{ source: string; idempotency_key: string }>(
            "SELECT source, idempotency_key FROM ledger WHERE user_id = ? AND source = 'allowance'",
            p.id,
          )
          .one();
        expect(entry.idempotency_key).toMatch(/^valley-allowance:/);
        // The old daily claim never ran: its table is empty although the allowance is on.
        expect(count(ctx.sql, 'daily_allowance')).toBe(0);
      },
      SYSTEMS,
    );
  });

  it('follows the away steps and stops the allowance at the store size', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        await p.state();
        const first = p.creatureIds[0] as string;
        const xp0 = totalXp(ctx.sql, first);
        ctx.clock.t += 120 * HOUR;
        const res = await p.state();
        const hours = (from: number, to: number): number => to - from;
        const share = (h: number): number => awayShare(VALLEY_RULES, 'B', h);
        const expected =
          BASE * (hours(0, 48) * share(0) + hours(48, 96) * share(48) + hours(96, 120) * share(96));
        // Whole XP per creature, the fraction carried.
        expect(totalXp(ctx.sql, first) - xp0).toBe(Math.floor(expected + 1e-9));
        expect(res.body.valley.allowance.brought).toBe(allowanceCap());
        expect(bait(ctx.sql, p.id)).toBe(allowanceCap());
      },
      SYSTEMS,
    );
  });

  it('changes nothing when settled again at the same now, and counts a visit mid-session as one', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        await p.state();
        ctx.clock.t += 6 * HOUR;
        const a = await p.state();
        const afterFirst = snapshot(ctx.sql);
        const b = await p.state();
        expect(snapshot(ctx.sql)).toEqual(afterFirst);
        expect({ ...b.body.valley, arrived: 0, awayHours: 0 }).toEqual({
          ...a.body.valley,
          arrived: 0,
          awayHours: 0,
        });
        // Ten minutes on, in the same visit: the +N keeps counting from the arrival, no new arrival, no allowance trickle.
        const gained = a.body.valley.creatures[0].gained as number;
        expect(gained).toBe(6 * BASE);
        ctx.clock.t += 10 * MINUTE;
        const c = await p.state();
        expect(c.body.valley.arrived).toBe(false);
        expect(c.body.valley.awayHours).toBe(0);
        expect(c.body.valley.creatures[0].gained).toBeGreaterThanOrEqual(gained);
        expect(c.body.valley.allowance.brought).toBe(a.body.valley.allowance.brought);
        // A pause longer than the visit gap is a new visit: the +N starts again.
        ctx.clock.t += VISIT_GAP_MS + MINUTE;
        const d = await p.state();
        expect(d.body.valley.arrived).toBe(true);
        expect(d.body.valley.creatures[0].gained).toBeLessThan(gained);
      },
      SYSTEMS,
    );
  });

  it('keeps splitting invariant: many short looks pay what one long one would', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1, 1);
        const q = await newPlayer(ctx, 2, 1);
        await p.state();
        await q.state();
        const xpP = totalXp(ctx.sql, p.creatureIds[0] as string);
        const xpQ = totalXp(ctx.sql, q.creatureIds[0] as string);
        for (let i = 0; i < 6; i++) {
          ctx.clock.t += 20 * MINUTE;
          await p.state();
        }
        // One look at the end of the same two hours (q's first look was at the start).
        await q.state();
        const gainP = totalXp(ctx.sql, p.creatureIds[0] as string) - xpP;
        // 2 hours at 5 an hour, within the carry's fraction of whole XP.
        expect(gainP).toBe(2 * BASE);
        expect(totalXp(ctx.sql, q.creatureIds[0] as string) - xpQ).toBe(2 * BASE);
      },
      SYSTEMS,
    );
  });

  it('does not pay a creature for the time before it joined', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1, 1);
        await p.state();
        ctx.clock.t += 12 * HOUR;
        const late = seedPlayer(ctx, 1, { creatures: 1, level: 3, species: ['zipmouse'] });
        const lateId = late.creatureIds[0] as string;
        const old = totalXp(ctx.sql, p.creatureIds[0] as string);
        ctx.clock.t += 12 * HOUR;
        const res = await p.state();
        expect(totalXp(ctx.sql, p.creatureIds[0] as string) - old).toBe(24 * BASE);
        expect(totalXp(ctx.sql, lateId) - expToReach(3)).toBe(12 * BASE);
        const view = v
          .parse(ValleyViewSchema, res.body.valley)
          .creatures.find((c) => c.id === lateId);
        expect(view?.gained).toBe(12 * BASE);
      },
      SYSTEMS,
    );
  });

  it('opens the ribbon gates: a creature past the Bronze Ribbon level keeps growing', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1, 1);
        const id = p.creatureIds[0] as string;
        const gate = RULES.experience.ribbons[0]?.level ?? 10;
        setCreature(ctx, id, { level: gate, exp: 0, ribbons: 0 });
        await p.state();
        ctx.clock.t += 20 * 24 * HOUR;
        await p.state();
        const row = ctx.sql
          .exec<{ level: number; ribbons: number }>(
            'SELECT level, ribbons FROM creatures WHERE id = ?',
            id,
          )
          .one();
        expect(row.level).toBeGreaterThan(gate);
        expect(row.ribbons).toBeGreaterThan(0);
      },
      SYSTEMS,
    );
  });
  it('shows no +N for a creature waiting at its species cap with the next level already banked', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1, 1);
        const id = p.creatureIds[0] as string;
        const species = ctx.sql
          .exec<{ species: string }>('SELECT species FROM creatures WHERE id = ?', id)
          .one().species;
        const cap = speciesOf(species).levelCap;
        const need = expToReach(cap + 1) - expToReach(cap);
        setCreature(ctx, id, { level: cap, exp: need, ribbons: 0 });
        await p.state();
        ctx.clock.t += 24 * HOUR;
        const valley = v.parse(ValleyViewSchema, (await p.state()).body.valley);
        expect(valley.creatures.find((c) => c.id === id)?.gained).toBe(0);
        expect(totalXp(ctx.sql, id)).toBe(expToReach(cap) + need);
      },
      SYSTEMS,
    );
  });
});

describe('who settles, and when', () => {
  it("settles only the caller: looking at a room or another player's data touches nothing", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await newPlayer(ctx, 1);
        const b = await newPlayer(ctx, 2);
        await a.state();
        expect(valleyRow(ctx.sql, b.id)).toBeUndefined();
        const before = snapshot(ctx.sql);
        ctx.clock.t += 5 * HOUR;
        const room = await a.api.call('POST', '/api/room', { userIds: [a.id, b.id] });
        expect(room.status).toBe(200);
        expect(snapshot(ctx.sql)).toEqual(before);
        // B's own look opens B's valley and leaves A's alone.
        await b.state();
        expect(valleyRow(ctx.sql, b.id)).toBeDefined();
        expect(valleyRow(ctx.sql, a.id)?.['settled_at']).toBe(ctx.clock.t - 5 * HOUR);
      },
      SYSTEMS,
    );
  });

  it('settles before an intent, but not for a repeat within a minute, and never for a dev tool', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        await p.state();
        const first = p.creatureIds[0] as string;
        const xp0 = totalXp(ctx.sql, first);
        ctx.clock.t += 2 * HOUR;
        const intent = await p.api.call('POST', '/api/away/dismiss', { until: 1 });
        expect(intent.status).toBe(200);
        expect(valleyRow(ctx.sql, p.id)?.['settled_at']).toBe(ctx.clock.t);
        expect(totalXp(ctx.sql, first) - xp0).toBe(2 * BASE);
        ctx.clock.t += INTENT_MIN_MS - 1;
        await p.api.call('POST', '/api/away/dismiss', { until: 1 });
        expect(valleyRow(ctx.sql, p.id)?.['settled_at']).toBe(ctx.clock.t - (INTENT_MIN_MS - 1));
        ctx.clock.t += 1;
        await p.api.call('POST', '/api/away/dismiss', { until: 1 });
        expect(valleyRow(ctx.sql, p.id)?.['settled_at']).toBe(ctx.clock.t);
        // A read other than the state never settles.
        ctx.clock.t += 3 * HOUR;
        await p.api.call('GET', '/api/me');
        expect(valleyRow(ctx.sql, p.id)?.['settled_at']).toBe(ctx.clock.t - 3 * HOUR);
      },
      SYSTEMS,
    );
  });
});

describe('what the valley replaces (flag on) and what stays (flag off)', () => {
  it('turns off the daily claim, treats, the ribbon route and lounge XP with the flag on', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        ctx.sql.exec(
          'INSERT INTO lounge_rest (creature_id, user_id, day, paid) VALUES (?, ?, ?, 7)',
          p.creatureIds[0],
          p.id,
          loungeDay(ctx.clock.t, ctx.core.timezone()).day,
        );
        const state = await p.state();
        expect(state.body.loungeXp).toEqual({});
        expect(count(ctx.sql, 'daily_allowance')).toBe(0);
        const id = p.creatureIds[0] as string;
        expect(
          (
            await p.api.call('POST', `/api/creatures/${id}/ribbon`, {
              idempotencyKey: 'ribbon-0000000001',
            })
          ).status,
        ).toBe(404);
        const trip = await p.api.call('POST', '/api/expeditions', {
          creatureId: id,
          destination: DESTINATION_IDS[0],
          duration: 'short',
          idempotencyKey: newKey('trip-treat'),
          treat: true,
        });
        // Trips are gone with the valley on (scouts replace them): a 404 before the body is read.
        expect(trip.status).toBe(404);
        const run = await p.api.call('POST', '/api/dungeon/start', {
          team: p.creatureIds,
          treats: [id],
          idempotencyKey: newKey('dungeon-treat'),
        });
        expect(run.body).toEqual({ error: 'treats_off' });
        const job = await p.api.call('POST', '/api/workshop/jobs', {
          kind: 'convert',
          creatureId: id,
          recipeId: 'refine-lure-basic',
          treat: true,
          idempotencyKey: newKey('job-treat'),
        });
        // Workshop jobs are gone with the valley on (anvils replace them): a 404 before the body is read.
        expect(job.status).toBe(404);
      },
      SYSTEMS,
    );
  });

  it('leaves the game as it was with the flag off: no valley key, no valley rows, the daily claim pays', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        const res = await p.state();
        expect(res.status).toBe(200);
        expect(Object.hasOwn(res.body as object, 'valley')).toBe(false);
        ctx.sql.exec(
          'INSERT INTO lounge_rest (creature_id, user_id, day, paid) VALUES (?, ?, ?, 7)',
          p.creatureIds[0],
          p.id,
          loungeDay(ctx.clock.t, ctx.core.timezone()).day,
        );
        expect((await p.state()).body.loungeXp).toEqual({ [p.creatureIds[0] as string]: 7 });
        ctx.clock.t += 5 * HOUR;
        await p.api.call('POST', '/api/away/dismiss', { until: 1 });
        await p.state();
        expect(count(ctx.sql, 'valley_players') + count(ctx.sql, 'valley_creatures')).toBe(0);
        expect(count(ctx.sql, 'daily_allowance')).toBe(1);
        // The ribbon route exists (this creature needs none: a plain refusal, not a 404).
        const id = p.creatureIds[0] as string;
        const ribbon = await p.api.call('POST', `/api/creatures/${id}/ribbon`, {
          idempotencyKey: 'ribbon-0000000002',
        });
        expect(ribbon.status).not.toBe(404);
        // Idle XP does not exist: the creature earned nothing from the time that passed.
        expect(totalXp(ctx.sql, id)).toBe(expToReach(3));
      },
      FLAG_OFF,
    );
  });
});

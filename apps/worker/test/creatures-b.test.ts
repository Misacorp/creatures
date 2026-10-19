import { SCHEMA_VERSION } from '../src/migrations';
import {
  RULES,
  addExperience,
  createSeededRng,
  dungeonExperience,
  expToNext,
  raidExperience,
  ribbonsForLevel,
  treatCost,
  tripExperience,
  workshopExperience,
  type ExpState,
} from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { playThrough } from './dungeon-helpers';
import { apiPlayer, giveParts, learnBase, newKey, skipWelcome, type Api } from './gear-helpers';
import { T0, runCore, undoCreaturesBMigration, type CoreContext } from './helpers';
import {
  HELSINKI,
  W02,
  forcePool,
  membersOf,
  nextGuild,
  rows,
  runRaid,
  seedPlayer,
  storedRuns,
} from './raid-helpers';

const HOUR = 3_600_000;

const options = () => ({
  rng: createSeededRng('creatures-b'),
  gearRng: createSeededRng('creatures-b:gear'),
  tripRng: createSeededRng('creatures-b:trip'),
  dungeonRng: createSeededRng('creatures-b:dungeon'),
});

type Creature = {
  level: number;
  exp: number;
  ribbons: number;
  species: string;
  away_expedition_id: string | null;
};

const creatureRow = (ctx: CoreContext, id: string): Creature =>
  rows<Creature & Record<string, string | number | null>>(
    ctx.sql,
    'SELECT level, exp, ribbons, species, away_expedition_id FROM creatures WHERE id = ?',
    id,
  )[0] as Creature;

const baitOf = (ctx: CoreContext, userId: string): number =>
  rows<{ amount: number }>(
    ctx.sql,
    "SELECT amount FROM balances WHERE user_id = ? AND currency = 'bait'",
    userId,
  )[0]?.amount ?? 0;

const giveBait = (ctx: CoreContext, userId: string, amount: number): void => {
  ctx.core.credit({
    userId,
    currency: 'bait',
    amount,
    source: 'test',
    idempotencyKey: `seed:${userId}:${String(amount)}`,
  });
};

const events = (ctx: CoreContext, kind: string): Record<string, unknown>[] =>
  rows<{ props_json: string }>(
    ctx.sql,
    'SELECT props_json FROM analytics_events WHERE kind = ? ORDER BY id',
    kind,
  ).map((r) => JSON.parse(r.props_json) as Record<string, unknown>);

const count = (ctx: CoreContext, table: string, where = '1 = 1'): number =>
  rows<{ n: number }>(ctx.sql, `SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`)[0]?.n ?? 0;

/** What a creature at `level` with nothing banked has after `gained` experience (the game's own rule). */
const after = (
  level: number,
  gained: number,
  ribbons = ribbonsForLevel(level),
  levelCap = 30,
): { level: number; exp: number; ribbons: number } => {
  const g = addExperience({ level, exp: 0, ribbons, levelCap }, gained);
  return { level: g.level, exp: g.exp, ribbons: g.ribbons };
};

/**
 * Sends a creature to the Tidepools. A short trip by default: it ends at 10:00 UTC on the Friday the tests
 * start on, before Phase 1 of the week resolves at 12:00 (which would pay raid experience too).
 */
const send = (
  p: Api,
  creatureId: string,
  extra: Record<string, unknown> = {},
  duration: 'short' | 'medium' | 'long' | 'day' = 'short',
  key = newKey(),
) =>
  p.call('POST', '/api/expeditions', {
    creatureId,
    destination: 'tidepools',
    duration,
    supplies: [],
    idempotencyKey: key,
    ...extra,
  });

const claim = (p: Api, id: string) => p.call('POST', `/api/expeditions/${id}/claim`, {});

describe('migration 30', () => {
  it('gives existing creatures the ribbons they are past, keeps their levels, and can be replayed', async () => {
    await runCore(nextGuild(), (ctx) => {
      const levels = [1, 10, 11, 20, 21, 29, 30];
      const p = seedPlayer(ctx, 1, { creatures: levels.length, level: 1 });
      p.creatureIds.forEach((id, i) => {
        // The old rules had no ribbons: every creature has 0 until the migration gives them out.
        ctx.sql.exec(
          'UPDATE creatures SET level = ?, ribbons = 0 WHERE id = ?',
          levels[i] ?? 1,
          id,
        );
      });
      ctx.sql.exec(
        "UPDATE creatures SET fusion_count = 3, nickname = 'Keeper' WHERE id = ?",
        p.creatureIds[2],
      );
      undoCreaturesBMigration(ctx.sql);
      // Levels as the players had them, on a database from before the migration.
      p.creatureIds.forEach((id, i) => {
        ctx.sql.exec('UPDATE creatures SET level = ? WHERE id = ?', levels[i] ?? 1, id);
      });
      expect(
        rows<{ name: string }>(ctx.sql, "SELECT name FROM pragma_table_info('creatures')").map(
          (r) => r.name,
        ),
      ).not.toContain('ribbons');
      ctx.core.migrate();
      ctx.core.migrate();
      expect(
        rows<{ v: number }>(ctx.sql, 'SELECT MAX(version) AS v FROM schema_version')[0]?.v,
      ).toBe(SCHEMA_VERSION);
      const after = rows<{ id: string; level: number; ribbons: number; exp: number }>(
        ctx.sql,
        'SELECT id, level, ribbons, exp FROM creatures ORDER BY rowid',
      );
      expect(after.map((c) => [c.level, c.ribbons, c.exp])).toEqual([
        [1, 0, 0],
        [10, 0, 0], // at the gate, not past it: it waits for its ribbon
        [11, 1, 0],
        [20, 1, 0],
        [21, 2, 0],
        [29, 2, 0],
        [30, 3, 0],
      ]);
      // Fusions and nicknames stay.
      expect(
        rows<{ fusion_count: number; nickname: string | null }>(
          ctx.sql,
          'SELECT fusion_count, nickname FROM creatures WHERE id = ?',
          p.creatureIds[2] as string,
        )[0],
      ).toEqual({ fusion_count: 3, nickname: 'Keeper' });
      // The new columns exist on the other tables too, at zero.
      expect(count(ctx, 'expeditions', 'treat = 1')).toBe(0);
      return Promise.resolve();
    });
  });
});

describe('experience from trips', () => {
  it('pays the explorer by the trip length when a trip finishes, and never twice', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await apiPlayer(ctx, 1, { level: 5, creatures: 1 });
        const [id] = p.creatureIds as [string];
        const sent = await send(p, id);
        expect(sent.status).toBe(200);
        const trip = sent.body['expedition'] as { id: string; endsAt: number; treat: boolean };
        expect(trip.treat).toBe(false);
        ctx.clock.t = trip.endsAt;
        const claimed = await claim(p, trip.id);
        expect(claimed.status).toBe(200);
        const gained = tripExperience('short', false);
        const expected = after(5, gained);
        expect(creatureRow(ctx, id)).toMatchObject({ level: expected.level, exp: expected.exp });
        const result = claimed.body['result'] as { experience: Record<string, unknown> };
        expect(result.experience).toMatchObject({
          creatureId: id,
          gained,
          treat: false,
          levelBefore: 5,
          level: expected.level,
          exp: expected.exp,
          needed: expToNext(expected.level),
          waiting: false,
        });
        // A repeat claim returns the stored result and pays nothing more.
        const again = await claim(p, trip.id);
        expect(again.status).toBe(200);
        expect(creatureRow(ctx, id)).toMatchObject({ level: expected.level, exp: expected.exp });
        expect(events(ctx, 'creature_exp')).toHaveLength(1);
      },
      options(),
    );
  });

  it('pays nothing for a trip that is recalled early', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await apiPlayer(ctx, 1, { level: 5, creatures: 1 });
        const [id] = p.creatureIds as [string];
        const sent = await send(p, id);
        const trip = sent.body['expedition'] as { id: string; endsAt: number };
        ctx.clock.t = T0 + HOUR; // before the trip ends
        const recalled = await claim(p, trip.id);
        expect(recalled.status).toBe(200);
        expect((recalled.body['result'] as { recalled: boolean }).recalled).toBe(true);
        expect(creatureRow(ctx, id)).toMatchObject({ level: 5, exp: 0 });
        expect(recalled.body['result']).not.toHaveProperty('experience');
        expect(events(ctx, 'creature_exp')).toHaveLength(0);
      },
      options(),
    );
  });

  it('banks the experience at level 10 until the Bronze Ribbon is earned', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await apiPlayer(ctx, 1, { level: 10, creatures: 1 });
        const [id] = p.creatureIds as [string];
        const trip = (await send(p, id)).body['expedition'] as { id: string; endsAt: number };
        ctx.clock.t = trip.endsAt;
        const claimed = await claim(p, trip.id);
        expect(creatureRow(ctx, id)).toMatchObject({
          level: 10,
          exp: tripExperience('short', false),
        });
        expect(claimed.body['result']).toMatchObject({
          experience: { level: 10, waiting: false, exp: tripExperience('short', false) },
        });
      },
      options(),
    );
  });
});

describe('treats on trips', () => {
  it('charges 3 + half the level in Bait with the trip, once, and doubles the experience', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await apiPlayer(ctx, 1, { level: 9, creatures: 1 });
        const [id] = p.creatureIds as [string];
        giveBait(ctx, p.id, 50);
        const key = newKey();
        const sent = await send(p, id, { treat: true }, 'short', key);
        expect(sent.status).toBe(200);
        const cost = treatCost(9);
        expect(cost).toBe(8);
        expect(baitOf(ctx, p.id)).toBe(50 - cost);
        const trip = sent.body['expedition'] as { id: string; endsAt: number; treat: boolean };
        expect(trip.treat).toBe(true);
        // A retry of the send returns the stored trip and charges nothing again.
        const retry = await send(p, id, { treat: true }, 'short', key);
        expect(retry.status).toBe(200);
        expect((retry.body['expedition'] as { id: string }).id).toBe(trip.id);
        expect(baitOf(ctx, p.id)).toBe(50 - cost);
        expect(count(ctx, 'ledger', "source = 'treat'")).toBe(1);
        // The same key without the treat is another request.
        const other = await send(p, id, {}, 'short', key);
        expect(other.status).toBe(409);
        expect(other.body).toEqual({ error: 'key_conflict' });
        expect(events(ctx, 'treat')).toMatchObject([
          { source: 'trip', species: creatureRow(ctx, id).species, level: 9, cost },
        ]);

        ctx.clock.t = trip.endsAt;
        const claimed = await claim(p, trip.id);
        const gained = tripExperience('short', true);
        expect(gained).toBe(RULES.experience.trip.short * 2);
        const expected = after(9, gained);
        expect(creatureRow(ctx, id)).toMatchObject({ level: expected.level, exp: expected.exp });
        expect(claimed.body['result']).toMatchObject({ experience: { gained, treat: true } });
      },
      options(),
    );
  });

  it('refuses a treat without the Bait and sends nothing: no trip, no charge, the creature stays home', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await apiPlayer(ctx, 1, { level: 9, creatures: 1 });
        const [id] = p.creatureIds as [string];
        giveBait(ctx, p.id, treatCost(9) - 1);
        const refused = await send(p, id, { treat: true });
        expect(refused.status).toBe(409);
        expect(refused.body).toEqual({ error: 'insufficient_funds' });
        expect(baitOf(ctx, p.id)).toBe(treatCost(9) - 1);
        expect(count(ctx, 'expeditions')).toBe(0);
        expect(creatureRow(ctx, id).away_expedition_id).toBeNull();
        // The same trip without a treat still goes.
        expect((await send(p, id)).status).toBe(200);
      },
      options(),
    );
  });

  it('rejects a treat that is not a boolean', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await apiPlayer(ctx, 1, { level: 9, creatures: 1 });
        const [id] = p.creatureIds as [string];
        const res = await send(p, id, { treat: 'yes' });
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'invalid_body' });
      },
      options(),
    );
  });
});

describe('the daily dungeon pays experience', () => {
  const body = (team: string[], extra: Record<string, unknown> = {}) => ({
    team,
    idempotencyKey: newKey(),
    ...extra,
  });
  // A run is played out through the map (start, then acts): its answer is the last act's, with the summary as `run`.
  const run = (p: Api, payload: unknown) =>
    playThrough(p.call, payload) as Promise<{
      status: number;
      body: Record<string, unknown>;
    }>;

  it('pays every creature of the team per room cleared and for a full clear', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await apiPlayer(ctx, 1, { level: 8, creatures: 4 });
        const team = p.creatureIds.slice(0, 3);
        const res = await run(p, body(team));
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        const summary = res.body['run'] as {
          roomsCleared: number;
          cleared: boolean;
          rewards: { experience: { creatureId: string; gained: number; treat: boolean }[] };
        };
        const gained = dungeonExperience(summary.roomsCleared, summary.cleared, false);
        expect(summary.rewards.experience.map((e) => e.creatureId)).toEqual(team);
        for (const view of summary.rewards.experience) {
          expect(view).toMatchObject({ gained, treat: false });
          const expected = after(8, gained);
          expect(creatureRow(ctx, view.creatureId)).toMatchObject({
            level: expected.level,
            exp: expected.exp,
          });
        }
        // The creature that did not go gets nothing.
        expect(creatureRow(ctx, p.creatureIds[3] as string)).toMatchObject({ level: 8, exp: 0 });
      },
      options(),
    );
  });

  it('charges a treat per creature named, doubles theirs only, and charges once for a retried run', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await apiPlayer(ctx, 1, { level: 8, creatures: 3 });
        giveBait(ctx, p.id, 100);
        const [a, b, c] = p.creatureIds as [string, string, string];
        const request = body([a, b, c], { treats: [b] });
        const res = await run(p, request);
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect(baitOf(ctx, p.id)).toBe(100 - treatCost(8) + dungeonBait(res.body));
        const exp = (res.body['run'] as { rewards: { experience: Record<string, unknown>[] } })
          .rewards.experience;
        const summary = res.body['run'] as { roomsCleared: number; cleared: boolean };
        const plain = dungeonExperience(summary.roomsCleared, summary.cleared, false);
        expect(exp.map((e) => [e['creatureId'], e['gained'], e['treat']])).toEqual([
          [a, plain, false],
          [b, plain * 2, true],
          [c, plain, false],
        ]);
        expect(events(ctx, 'treat')).toHaveLength(1);
        // The same start again returns the stored run and charges nothing.
        const baitBefore = baitOf(ctx, p.id);
        const retry = await p.call('POST', '/api/dungeon/start', request);
        expect(retry.status).toBe(200);
        expect(baitOf(ctx, p.id)).toBe(baitBefore);
        expect(count(ctx, 'ledger', "source = 'treat'")).toBe(1);
        // The same key with other treats is another request.
        const changed = await p.call('POST', '/api/dungeon/start', { ...request, treats: [a] });
        expect(changed.status).toBe(409);
        expect(changed.body).toEqual({ error: 'key_conflict' });
      },
      options(),
    );
  });

  it('refuses a treat for a creature outside the team, a repeated one, and one that cannot be paid', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await apiPlayer(ctx, 1, { level: 8, creatures: 4 });
        const team = p.creatureIds.slice(0, 3);
        giveBait(ctx, p.id, treatCost(8));
        const outside = await run(p, body(team, { treats: [p.creatureIds[3]] }));
        expect(outside.status).toBe(400);
        expect(outside.body).toEqual({ error: 'invalid_treat' });
        const twice = await run(p, body(team, { treats: [team[0], team[0]] }));
        expect(twice.status).toBe(400);
        expect(twice.body).toEqual({ error: 'invalid_treat' });
        const tooMany = await run(p, body(team, { treats: [...team, team[0]] }));
        expect(tooMany.status).toBe(400);
        // Two treats cost more than the player holds: the whole run is refused and nothing is written.
        const broke = await run(p, body(team, { treats: [team[0], team[1]] }));
        expect(broke.status).toBe(409);
        expect(broke.body).toEqual({ error: 'insufficient_funds' });
        expect(baitOf(ctx, p.id)).toBe(treatCost(8));
        expect(count(ctx, 'dungeon_runs')).toBe(0);
        expect(creatureRow(ctx, team[0] as string)).toMatchObject({ level: 8, exp: 0 });
        // One treat can be paid.
        const fine = await run(p, body(team, { treats: [team[0]] }));
        expect(fine.status).toBe(200);
      },
      options(),
    );
  });
});

/** The Bait the rooms of a run paid, from the run's own summary (its rewards and the streak bonus). */
function dungeonBait(response: Record<string, unknown>): number {
  const rewards = (
    response['run'] as { rewards: { bait: number; streak: { bait: number } | null } }
  ).rewards;
  return rewards.bait + (rewards.streak?.bait ?? 0);
}

describe('experience from raid stages', () => {
  it('pays the creatures that fought, by stage and whether it was cleared, and nobody else', async () => {
    await runRaid((ctx) => {
      const players = Array.from({ length: 5 }, (_, i) => seedPlayer(ctx, i + 1, { level: 5 }));
      const bystander = seedPlayer(ctx, 90, {
        level: 5,
        lastSeenAt: ctx.clock.t - 30 * 86_400_000,
      });
      ctx.core.raid.currentWeek(HELSINKI);
      forcePool(ctx.sql, 20_000);
      ctx.clock.t = W02.afterFinale;
      ctx.core.raid.runDue(HELSINKI);
      const runs = storedRuns(ctx.sql);
      expect(runs.map((r) => r.phase)).toEqual(['phase1', 'phase2', 'finale']);
      // What every creature that stood in the row earned over the week, by the game's own rule.
      const fought = new Map<string, number>();
      for (const run of runs) {
        const gained = raidExperience(run.phase, run.result.cleared);
        for (const slot of run.input.row) {
          if (slot.ownerId === null) continue;
          fought.set(slot.id, (fought.get(slot.id) ?? 0) + gained);
        }
      }
      expect(fought.size).toBeGreaterThan(0);
      expect(membersOf(ctx.sql)).toHaveLength(5);
      for (const [id, total] of fought) {
        const row = creatureRow(ctx, id);
        // Stage by stage, as it was paid: the order matters only at a gate, and these creatures are far from one.
        let state: ExpState = { level: 5, exp: 0, ribbons: 0, levelCap: 15 };
        for (const run of runs) {
          if (!run.input.row.some((s) => s.id === id)) continue;
          const g = addExperience(state, raidExperience(run.phase, run.result.cleared));
          state = { level: g.level, exp: g.exp, ribbons: g.ribbons, levelCap: g.levelCap };
        }
        expect(row, String(total)).toMatchObject({ level: state.level, exp: state.exp });
      }
      // Creatures that did not fight, and a player who is not in the raid, are untouched.
      const idle = rows<{ id: string; level: number; exp: number }>(
        ctx.sql,
        'SELECT id, level, exp FROM creatures',
      ).filter((c) => !fought.has(c.id));
      expect(idle.every((c) => c.level === 5 && c.exp === 0)).toBe(true);
      expect(bystander.creatureIds.every((id) => !fought.has(id))).toBe(true);
      expect(players.length).toBe(5);
      // The experience is paid once: running the week again changes nothing.
      const snapshot = JSON.stringify(
        rows(ctx.sql, 'SELECT id, level, exp FROM creatures ORDER BY id'),
      );
      ctx.core.raid.runDue(HELSINKI);
      expect(
        JSON.stringify(rows(ctx.sql, 'SELECT id, level, exp FROM creatures ORDER BY id')),
      ).toBe(snapshot);
      expect(events(ctx, 'creature_exp').every((e) => e['source'] === 'raid')).toBe(true);
    });
  });
});

describe('experience from Workshop jobs', () => {
  const startCraft = (
    p: Api,
    creatureId: string,
    extra: Record<string, unknown> = {},
    key = newKey(),
  ) =>
    p.call('POST', '/api/workshop/jobs', {
      kind: 'craft',
      creatureId,
      blueprintId: 'trail-cap',
      idempotencyKey: key,
      ...extra,
    });

  it('pays the hourly rate for the job and doubles it with a treat paid at the start', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await apiPlayer(ctx, 1, { level: 6, creatures: 2 });
        skipWelcome(ctx, p.id);
        learnBase(ctx, p.id, 'trail-cap');
        giveParts(ctx, p.id, {
          scrap: 100,
          'tide-shard': 5,
          'ember-shard': 5,
          'grove-shard': 5,
          'spark-shard': 5,
        });
        giveBait(ctx, p.id, 20);
        const [plain, treated] = p.creatureIds as [string, string];

        const first = await startCraft(p, plain);
        expect(first.status, JSON.stringify(first.body)).toBe(200);
        const key = newKey();
        const second = await startCraft(p, treated, { treat: true }, key);
        expect(second.status, JSON.stringify(second.body)).toBe(200);
        expect(baitOf(ctx, p.id)).toBe(20 - treatCost(6));
        // A retry of the start does not charge again.
        expect((await startCraft(p, treated, { treat: true }, key)).status).toBe(200);
        expect(baitOf(ctx, p.id)).toBe(20 - treatCost(6));
        expect(count(ctx, 'ledger', "source = 'treat'")).toBe(1);
        expect(events(ctx, 'treat')).toMatchObject([
          { source: 'job', level: 6, cost: treatCost(6) },
        ]);

        // Three hours: the crafts are done and Phase 1 (12:00 UTC) has not resolved yet.
        ctx.clock.t += 3 * HOUR + 60_000;
        const jobs = [first, second].map((r) => (r.body['result'] as { jobId: string }).jobId);
        for (const jobId of jobs) {
          const done = await p.call('POST', `/api/workshop/jobs/${jobId}/claim`, {
            idempotencyKey: newKey(),
          });
          expect(done.status, JSON.stringify(done.body)).toBe(200);
        }
        const minutes = 180; // a plain craft is 3 hours of work
        const plainGain = workshopExperience(minutes, false);
        const treatedGain = workshopExperience(minutes, true);
        expect(plainGain).toBe(3 * RULES.experience.workshopPerHour);
        expect(treatedGain).toBe(2 * plainGain);
        expect(creatureRow(ctx, plain)).toMatchObject(after(6, plainGain));
        expect(creatureRow(ctx, treated)).toMatchObject(after(6, treatedGain));
        // Claiming again changes nothing.
        const jobId = jobs[1] as string;
        await p.call('POST', `/api/workshop/jobs/${jobId}/claim`, { idempotencyKey: newKey() });
        expect(creatureRow(ctx, treated)).toMatchObject(after(6, treatedGain));
        expect(events(ctx, 'creature_exp')).toHaveLength(2);
      },
      options(),
    );
  });

  it('refuses a treat the player cannot pay and starts nothing', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await apiPlayer(ctx, 1, { level: 6, creatures: 1 });
        skipWelcome(ctx, p.id);
        learnBase(ctx, p.id, 'trail-cap');
        giveParts(ctx, p.id, {
          scrap: 100,
          'tide-shard': 5,
          'ember-shard': 5,
          'grove-shard': 5,
          'spark-shard': 5,
        });
        const refused = await startCraft(p, p.creatureIds[0] as string, { treat: true });
        expect(refused.status).toBe(409);
        expect(refused.body).toEqual({ error: 'insufficient_funds' });
        expect(count(ctx, 'workshop_jobs')).toBe(0);
        // The parts of the refused start were not taken either.
        expect(
          rows<{ amount: number }>(
            ctx.sql,
            "SELECT amount FROM parts WHERE user_id = ? AND kind = 'scrap'",
            p.id,
          )[0]?.amount,
        ).toBe(100);
      },
      options(),
    );
  });
});

describe('ribbons', () => {
  const earn = (p: Api, id: string, key = newKey()) =>
    p.call('POST', `/api/creatures/${id}/ribbon`, { idempotencyKey: key });
  const stateOf = async (p: Api, id: string) => {
    const state = (await p.call('GET', '/api/state')).body as {
      creatures: {
        id: string;
        level: number;
        exp: number;
        expNeeded: number | null;
        waiting: boolean;
        ribbons: number;
        ribbon: {
          id: string;
          level: number;
          parts: Record<string, number>;
          trips: number;
          tripsDone: number;
          ready: boolean;
        } | null;
        nextUnlock: { level: number; name: string } | null;
      }[];
    };
    return state.creatures.find((c) => c.id === id);
  };

  it('shows the ribbon a creature at level 10 waits for, with its price and whether it can be paid', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await apiPlayer(ctx, 1, { level: 10, creatures: 1, species: ['cindle'] });
        const [id] = p.creatureIds as [string];
        ctx.sql.exec('UPDATE creatures SET exp = ? WHERE id = ?', expToNext(10), id);
        const view = await stateOf(p, id);
        expect(view).toMatchObject({
          level: 10,
          exp: expToNext(10),
          expNeeded: expToNext(10),
          waiting: true,
          ribbons: 0,
          // The ribbon it waits for is `ribbon`; the next unlock above level 10 is the Charm slot.
          nextUnlock: { level: 13, name: 'Charm' },
          ribbon: {
            id: 'bronze',
            level: 10,
            parts: { scrap: 6, 'ember-shard': 2 },
            trips: 0,
            tripsDone: 0,
            ready: false,
          },
        });
        giveParts(ctx, p.id, { scrap: 6, 'ember-shard': 2 });
        expect((await stateOf(p, id))?.ribbon?.ready).toBe(true);
        // A creature below the gate shows no ribbon.
        ctx.sql.exec('UPDATE creatures SET level = 9, exp = 0 WHERE id = ?', id);
        expect((await stateOf(p, id))?.ribbon).toBeNull();
      },
      options(),
    );
  });

  it('takes the materials, records the ribbon and spends the banked experience at once, idempotently', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await apiPlayer(ctx, 1, { level: 10, creatures: 1, species: ['cindle'] });
        const [id] = p.creatureIds as [string];
        // The creature stopped at 10 with the next level's experience banked, and a little more would have been lost.
        ctx.sql.exec('UPDATE creatures SET exp = ? WHERE id = ?', expToNext(10), id);
        giveParts(ctx, p.id, { scrap: 10, 'ember-shard': 3, 'tide-shard': 1 });
        const key = newKey();
        const res = await earn(p, id, key);
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect(res.body['result']).toMatchObject({ creatureId: id, ribbon: 'bronze' });
        expect(creatureRow(ctx, id)).toMatchObject({ level: 11, exp: 0, ribbons: 1 });
        const parts = Object.fromEntries(
          rows<{ kind: string; amount: number }>(
            ctx.sql,
            'SELECT kind, amount FROM parts WHERE user_id = ?',
            p.id,
          ).map((r) => [r.kind, r.amount]),
        );
        expect(parts).toMatchObject({ scrap: 4, 'ember-shard': 1, 'tide-shard': 1 });
        expect(events(ctx, 'ribbon')).toEqual([{ species: 'cindle', ribbon: 'bronze' }]);
        // A retry returns the stored result and takes nothing.
        const again = await earn(p, id, key);
        expect(again.status).toBe(200);
        expect(again.body['result']).toEqual(res.body['result']);
        expect(creatureRow(ctx, id)).toMatchObject({ level: 11, ribbons: 1 });
        expect(events(ctx, 'ribbon')).toHaveLength(1);
        // A creature that is not at a gate has nothing to earn, and a fresh key does not take parts either.
        const none = await earn(p, id);
        expect(none.status).toBe(409);
        expect(none.body).toEqual({ error: 'ribbon_not_needed' });
      },
      options(),
    );
  });

  it('refuses without the parts and writes nothing', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await apiPlayer(ctx, 1, { level: 10, creatures: 1, species: ['cindle'] });
        const [id] = p.creatureIds as [string];
        giveParts(ctx, p.id, { scrap: 6, 'ember-shard': 1 });
        const res = await earn(p, id);
        expect(res.status).toBe(409);
        expect(res.body).toEqual({ error: 'insufficient_parts' });
        expect(creatureRow(ctx, id)).toMatchObject({ level: 10, ribbons: 0 });
        expect(
          rows<{ amount: number }>(
            ctx.sql,
            "SELECT amount FROM parts WHERE user_id = ? AND kind = 'scrap'",
            p.id,
          )[0]?.amount,
        ).toBe(6);
      },
      options(),
    );
  });

  it('asks the Silver Ribbon for five finished trips of the creature itself', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await apiPlayer(ctx, 1, { level: 20, creatures: 1, species: ['thornbuck'] });
        const [id] = p.creatureIds as [string];
        ctx.sql.exec('UPDATE creatures SET ribbons = 1 WHERE id = ?', id);
        giveParts(ctx, p.id, { scrap: 15, 'grove-shard': 5, glimmer: 1 });
        const view = await stateOf(p, id);
        expect(view?.ribbon).toMatchObject({
          id: 'silver',
          parts: { scrap: 15, 'grove-shard': 5, glimmer: 1 },
          trips: 5,
          tripsDone: 0,
          ready: false,
        });
        const early = await earn(p, id);
        expect(early.status).toBe(409);
        expect(early.body).toEqual({ error: 'ribbon_needs_trips', reason: '5' });
        ctx.sql.exec(
          `INSERT INTO explorer_progress (user_id, creature_id, xp, trips) VALUES (?, ?, 0, 5)
           ON CONFLICT(user_id, creature_id) DO UPDATE SET trips = 5`,
          p.id,
          id,
        );
        expect((await stateOf(p, id))?.ribbon?.ready).toBe(true);
        const res = await earn(p, id);
        expect(res.status).toBe(200);
        expect(creatureRow(ctx, id)).toMatchObject({ level: 20, ribbons: 2 });
      },
      options(),
    );
  });

  it('gives the Gold Ribbon with level 30 and no cost', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await apiPlayer(ctx, 1, { level: 29, creatures: 1, species: ['pyrelynx'] });
        const [id] = p.creatureIds as [string];
        ctx.sql.exec('UPDATE creatures SET ribbons = 2 WHERE id = ?', id);
        ctx.sql.exec('UPDATE creatures SET exp = ? WHERE id = ?', expToNext(29) - 1, id);
        const sent = await send(p, id, {}, 'short');
        const short = sent.body['expedition'] as { id: string; endsAt: number };
        ctx.clock.t = short.endsAt;
        await claim(p, short.id);
        expect(creatureRow(ctx, id)).toMatchObject({ level: 30, exp: 0, ribbons: 3 });
        expect(events(ctx, 'ribbon')).toEqual([{ species: 'pyrelynx', ribbon: 'gold' }]);
        expect((await stateOf(p, id))?.nextUnlock).toBeNull();
      },
      options(),
    );
  });

  it('404s for another player’s creature and 400s for a bad body', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await apiPlayer(ctx, 1, { level: 10, creatures: 1 });
        const b = await apiPlayer(ctx, 2, { level: 10, creatures: 1 });
        const res = await earn(b, a.creatureIds[0] as string);
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'not_found' });
        expect(
          (await b.call('POST', `/api/creatures/${a.creatureIds[0] as string}/ribbon`, {})).status,
        ).toBe(400);
        const extra = await b.call('POST', `/api/creatures/${b.creatureIds[0] as string}/ribbon`, {
          idempotencyKey: newKey(),
          free: true,
        });
        expect(extra.status).toBe(400);
      },
      options(),
    );
  });
});

describe('evolution spends what a waiting creature banked', () => {
  it('lets a first stage at its cap level up once it evolves', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await apiPlayer(ctx, 1, { level: 15, creatures: 1, species: ['cindle'] });
        const [id] = p.creatureIds as [string];
        // It stopped at 15 holding the whole next level's experience.
        ctx.sql.exec('UPDATE creatures SET exp = ? WHERE id = ?', expToNext(15), id);
        giveEssenceTo(ctx, p.id, 40);
        const res = await p.call('POST', `/api/creatures/${id}/evolve`, {
          idempotencyKey: newKey(),
        });
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect(creatureRow(ctx, id)).toMatchObject({ species: 'pyrelynx', level: 16, exp: 0 });
      },
      options(),
    );
  });
});

function giveEssenceTo(ctx: CoreContext, userId: string, amount: number): void {
  ctx.core.credit({
    userId,
    currency: 'essence',
    amount,
    source: 'test',
    idempotencyKey: `essence:${userId}`,
  });
}

describe('the old training route', () => {
  it('answers that training is by activity, and takes nothing', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await apiPlayer(ctx, 1, { level: 3, creatures: 1 });
        giveBait(ctx, p.id, 100);
        const res = await p.call('POST', `/api/creatures/${p.creatureIds[0] as string}/train`, {
          idempotencyKey: newKey(),
        });
        expect(res.status).toBe(410);
        expect(res.body).toEqual({ error: 'training_is_by_activity' });
        expect(baitOf(ctx, p.id)).toBe(100);
        expect(creatureRow(ctx, p.creatureIds[0] as string)).toMatchObject({ level: 3 });
      },
      options(),
    );
  });
});

describe('the new-species pity', () => {
  const rule = RULES.catching.pity;
  const counters = (ctx: CoreContext, userId: string) =>
    rows<{ pity_new: number; pity_creature: number }>(
      ctx.sql,
      'SELECT pity_new, pity_creature FROM player_progress WHERE user_id = ?',
      userId,
    )[0];
  const setCounters = (ctx: CoreContext, userId: string, sinceNew: number, sinceCreature: number) =>
    ctx.sql.exec(
      `INSERT INTO player_progress (user_id, expeditions_claimed, pity_new, pity_creature) VALUES (?, 1, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET expeditions_claimed = 1, pity_new = excluded.pity_new,
         pity_creature = excluded.pity_creature`,
      userId,
      sinceNew,
      sinceCreature,
    );

  /** Sends one short trip (one catch roll), claims it and returns the claimed result. */
  async function oneRoll(ctx: CoreContext, p: Api, creatureId: string) {
    const sent = await send(p, creatureId, {}, 'short');
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    const trip = sent.body['expedition'] as { id: string; endsAt: number };
    ctx.clock.t = trip.endsAt;
    const claimed = await claim(p, trip.id);
    expect(claimed.status).toBe(200);
    return claimed.body['result'] as {
      catches: { species: string; outcome: string }[];
      noCatch?: number;
    };
  }

  it('counts dry rolls in the stored counters, with the claim', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await apiPlayer(ctx, 1, { level: 5, creatures: 1, species: ['splashet'] });
        setCounters(ctx, p.id, 0, 0);
        // The first draw of the roll misses (`dryRng`), so it brings nothing and both counters move.
        const result = await oneRoll(ctx, p, p.creatureIds[0] as string);
        expect(result.catches).toEqual([]);
        expect(result.noCatch).toBe(1);
        expect(counters(ctx, p.id)).toEqual({ pity_new: 1, pity_creature: 1 });
      },
      { ...options(), rng: dryRng() },
    );
  });

  it(`brings a species the player lacks on the roll after ${String(rule.newAfter)} without one, and resets`, async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await apiPlayer(ctx, 1, { level: 5, creatures: 1, species: ['splashet'] });
        setCounters(ctx, p.id, rule.newAfter, 0);
        const result = await oneRoll(ctx, p, p.creatureIds[0] as string);
        expect(result.catches).toHaveLength(1);
        expect(result.catches[0]?.outcome).toBe('new');
        expect(result.catches[0]?.species).not.toBe('splashet');
        expect(counters(ctx, p.id)).toEqual({ pity_new: 0, pity_creature: 0 });
        expect(events(ctx, 'catch_pity')).toMatchObject([{ pity: 'new' }]);
      },
      { ...options(), rng: dryRng() },
    );
  });

  it(`brings a creature on the ${String(rule.creatureEvery)}th roll without one`, async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await apiPlayer(ctx, 1, { level: 5, creatures: 1, species: ['splashet'] });
        setCounters(ctx, p.id, 0, rule.creatureEvery - 1);
        const result = await oneRoll(ctx, p, p.creatureIds[0] as string);
        expect(result.catches).toHaveLength(1);
        expect(counters(ctx, p.id)?.pity_creature).toBe(0);
        expect(events(ctx, 'catch_pity')).toMatchObject([{ pity: 'creature' }]);
      },
      { ...options(), rng: dryRng() },
    );
  });

  it('is decided once: a repeat claim changes nothing, and the pity cannot be asked for', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await apiPlayer(ctx, 1, { level: 5, creatures: 1, species: ['splashet'] });
        setCounters(ctx, p.id, rule.newAfter, 0);
        const sent = await send(p, p.creatureIds[0] as string, {}, 'short');
        const trip = sent.body['expedition'] as { id: string; endsAt: number };
        ctx.clock.t = trip.endsAt;
        const first = await claim(p, trip.id);
        const lines = count(ctx, 'creatures');
        const second = await claim(p, trip.id);
        expect(second.body['result']).toEqual(first.body['result']);
        expect(count(ctx, 'creatures')).toBe(lines);
        expect(counters(ctx, p.id)).toEqual({ pity_new: 0, pity_creature: 0 });
        // The counters are not part of any request: a body that names them is refused.
        const sneaky = await send(p, p.creatureIds[0] as string, { pity: 99 }, 'short');
        expect(sneaky.status).toBe(400);
      },
      { ...options(), rng: dryRng() },
    );
  });
});

/**
 * An rng that makes every plain chance roll miss (2^31 is above any chance the game ships) and
 * otherwise lets the pity decide: a creature that comes is drawn from a seeded stream.
 */
function dryRng() {
  const seeded = createSeededRng('creatures-b:dry');
  let first = true;
  return {
    nextU32() {
      // The first draw of a catch roll is whether it brings a creature at all: make it miss. The later
      // draws of a roll that the pity forces come from the seeded stream (the pity draws nothing itself).
      if (first) {
        first = false;
        return 0x80000000;
      }
      return seeded.nextU32();
    },
  };
}

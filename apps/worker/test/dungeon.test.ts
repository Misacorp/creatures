import {
  PART_KINDS,
  RULES,
  createSeededRng,
  dungeonContent,
  dungeonSupplyOddsBp,
  rollItem,
  supplyDef,
  type PartKind,
  type Rng,
} from '@creatures/game';
import {
  dungeonBossEnrage,
  liveFightRules,
  simulateDungeon,
  type DungeonRunInput,
  type DungeonRunResult,
} from '@creatures/engine';
import { describe, expect, it } from 'vitest';
import { grantDungeonRun } from '../src/gear-grants';
import { giveItem } from './gear-helpers';
import { drawSeed } from '../src/raid-resolve';
import { dungeonPlayer, newKey, type DungeonPlayer } from './dungeon-helpers';
import {
  LATEST_SCHEMA_VERSION,
  T0,
  runCore,
  undoExpeditionsMigration,
  undoGearMigration,
  type CoreContext,
} from './helpers';
import { count, nextGuild, rows } from './raid-helpers';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/**
 * 14:00 in Helsinki on 2027-01-15, 23 minutes after the daily reset (13:37), so the game day is the
 * 15th. `T0` (10:00 local) is before the reset and so still the game day of the 14th.
 */
const AFTER_RESET = Date.parse('2027-01-15T12:00:00Z');

const opts = (seed = 'dungeon-tests') => ({
  dungeonRng: createSeededRng(seed),
  gearRng: createSeededRng(`${seed}:gear`),
});

/** An rng that counts its draws. */
function counting(seed: string): Rng & { drawn: () => number } {
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

/** Writes a player's dungeon progress (anything not given keeps its default). */
function setProgress(
  ctx: CoreContext,
  userId: string,
  fields: { depth?: number; streak?: number; last_day?: string | null; first_day?: string | null },
): void {
  ctx.sql.exec(
    `INSERT INTO dungeon_progress (user_id, depth, streak, last_day, first_day) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET depth = excluded.depth, streak = excluded.streak,
       last_day = excluded.last_day, first_day = excluded.first_day`,
    userId,
    fields.depth ?? 1,
    fields.streak ?? 0,
    fields.last_day ?? null,
    fields.first_day ?? '2027-01-01',
  );
}

const progressOf = (ctx: CoreContext, userId: string) =>
  rows<{ depth: number; streak: number; last_day: string | null; runs: number; clears: number }>(
    ctx.sql,
    'SELECT depth, streak, last_day, runs, clears FROM dungeon_progress WHERE user_id = ?',
    userId,
  )[0];

const dungeonLedger = (ctx: CoreContext, userId: string) =>
  rows<{ currency: string; amount: number; idempotency_key: string }>(
    ctx.sql,
    "SELECT currency, amount, idempotency_key FROM ledger WHERE user_id = ? AND source = 'dungeon' ORDER BY id",
    userId,
  );

const partsOf = (ctx: CoreContext, userId: string): Record<PartKind, number> => {
  const out = Object.fromEntries(PART_KINDS.map((k) => [k, 0])) as Record<PartKind, number>;
  for (const row of rows<{ kind: PartKind; amount: number }>(
    ctx.sql,
    'SELECT kind, amount FROM parts WHERE user_id = ?',
    userId,
  )) {
    out[row.kind] = row.amount;
  }
  return out;
};

const events = (ctx: CoreContext, kind: string): Record<string, unknown>[] =>
  rows<{ props_json: string }>(
    ctx.sql,
    'SELECT props_json FROM analytics_events WHERE kind = ? ORDER BY id',
    kind,
  ).map((r) => JSON.parse(r.props_json) as Record<string, unknown>);

type StoredRun = {
  id: string;
  day: string;
  attempt: number;
  depth: number;
  seed: string;
  cleared: number;
  rooms_cleared: number;
  input_json: string | null;
  result_json: string | null;
  summary_json: string;
};
const storedRuns = (ctx: CoreContext, userId?: string): StoredRun[] =>
  rows<StoredRun>(
    ctx.sql,
    `SELECT id, day, attempt, depth, seed, cleared, rooms_cleared, input_json, result_json, summary_json
     FROM dungeon_runs ${userId === undefined ? '' : `WHERE user_id = '${userId}'`} ORDER BY rowid`,
  );

/** A team strong enough to clear the early depths. */
const STRONG = { level: 30, species: ['tidewing', 'pyrelynx', 'thornbuck'] };

describe('migration 18', () => {
  it('creates the dungeon tables, with the constraints', async () => {
    await runCore(nextGuild(), ({ sql }) => {
      const names = rows<{ name: string }>(
        sql,
        "SELECT name FROM sqlite_master WHERE type = 'table'",
      ).map((r) => r.name);
      for (const t of ['dungeon_runs', 'dungeon_progress', 'dungeon_days']) {
        expect(names).toContain(t);
      }
      // Version 18 is the dungeon's; later migrations come after it.
      expect(
        rows<{ version: number }>(sql, 'SELECT version FROM schema_version WHERE version = 18'),
      ).toHaveLength(1);
      // The depth, the attempt and the streak cannot be nonsense.
      expect(() =>
        sql.exec("INSERT INTO dungeon_progress (user_id, depth) VALUES ('u', 0)"),
      ).toThrow();
      expect(() =>
        sql.exec("INSERT INTO dungeon_progress (user_id, streak) VALUES ('u', -1)"),
      ).toThrow();
      const insertRun = (attempt: number, key: string, id: string) =>
        sql.exec(
          `INSERT INTO dungeon_runs (id, user_id, day, attempt, idempotency_key, fingerprint, depth, seed,
             cleared, rooms_cleared, summary_json, rewards_json, created_at)
           VALUES (?, 'u', '2027-01-15', ?, ?, 'f', 1, 's', 0, 0, '{}', '{}', 1)`,
          id,
          attempt,
          key,
        );
      expect(() => insertRun(3, 'k-3', 'a')).toThrow(); // at most two attempts
      insertRun(1, 'k-1', 'b');
      expect(() => insertRun(1, 'k-2', 'c')).toThrow(); // one run per (player, day, attempt)
      expect(() => insertRun(2, 'k-1', 'd')).toThrow(); // one run per (player, key)
      insertRun(2, 'k-2', 'e');
      return Promise.resolve();
    });
  });

  it('applies on a schema-17 database, keeping its data, and can be replayed', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await dungeonPlayer(ctx, 1);
      expect(count(ctx.sql, 'creatures')).toBe(3);
      undoGearMigration(ctx.sql); // also takes the dungeon tables away
      expect(
        rows<{ v: number }>(ctx.sql, 'SELECT MAX(version) AS v FROM schema_version')[0]?.v,
      ).toBe(16);
      ctx.core.migrate();
      ctx.core.migrate();
      expect(count(ctx.sql, 'schema_version')).toBe(LATEST_SCHEMA_VERSION);
      expect(count(ctx.sql, 'creatures')).toBe(3);
      expect(count(ctx.sql, 'dungeon_runs')).toBe(0);
      expect((await p.today()).depth).toBe(1);
    });
  });

  it('migrates 17 through 18 and 19 in order, and staging (at 18) cleanly to 19', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await dungeonPlayer(ctx, 1);
      undoGearMigration(ctx.sql);
      const versions = () =>
        rows<{ version: number }>(
          ctx.sql,
          'SELECT version FROM schema_version ORDER BY version',
        ).map((r) => r.version);
      expect(Math.max(...versions())).toBe(16);
      ctx.core.migrate();
      expect(versions()).toEqual(Array.from({ length: LATEST_SCHEMA_VERSION }, (_, i) => i + 1));

      // Staging already ran the daily dungeon's migration 18; only 19 is left to apply.
      ctx.sql.exec(
        `INSERT INTO dungeon_progress (user_id, depth, streak, last_day, first_day)
         VALUES ('staging-player', 4, 2, '2026-10-12', '2026-10-01')`,
      );
      undoExpeditionsMigration(ctx.sql);
      expect(versions().at(-1)).toBe(18);
      ctx.core.migrate();
      expect(versions().at(-1)).toBe(LATEST_SCHEMA_VERSION);
      expect(count(ctx.sql, 'dungeon_progress', "user_id = 'staging-player'")).toBe(1);
      expect(count(ctx.sql, 'creatures')).toBe(3);
      expect((await p.today()).depth).toBe(1);
    });
  });
});

describe('GET /api/dungeon/today', () => {
  it('shows the day, the depth, the streak and three modifiers, and no seed', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1);
        const today = await p.today();
        // T0 is 10:00 in Helsinki: before the 13:37 reset, so it is still the game day of the 14th.
        expect(today).toMatchObject({
          serverNow: T0,
          day: '2027-01-14',
          timezone: 'Europe/Helsinki',
          depth: 1,
          landmark: false,
          landmarkBoss: null,
          streak: 0,
          attemptsToday: 0,
          attemptsAllowed: 2,
          canRun: true,
          blocked: null,
          last: null,
        });
        expect(today.modifiers).toHaveLength(RULES.dungeon.rooms);
        expect(today.modifiers.map((m) => m.room)).toEqual([0, 1, 2]);
        expect(new Set(today.modifiers.map((m) => m.id)).size).toBe(RULES.dungeon.rooms);
        for (const m of today.modifiers) {
          const content = dungeonContent.modifiers.find((c) => c.id === m.id);
          expect(m.name).toBe(content?.name);
          expect(m.description).toBe(content?.description);
        }
        // The day ends at the next local reset: 2027-01-15 13:37 in Helsinki (UTC+2).
        expect(today.resetsAt).toBe(Date.parse('2027-01-15T11:37:00Z'));
        const seeds = rows<{ modifier_seed: string }>(
          ctx.sql,
          'SELECT modifier_seed FROM dungeon_days',
        );
        expect(seeds).toHaveLength(1);
        expect(JSON.stringify(today)).not.toContain(seeds[0]?.modifier_seed);
      },
      opts(),
    );
  });

  it('shows everyone on the server the same modifiers all day, and a new draw on a new day', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await dungeonPlayer(ctx, 1);
        const b = await dungeonPlayer(ctx, 2);
        ctx.clock.t = AFTER_RESET;
        const first = (await a.today()).modifiers;
        ctx.clock.t += 5 * HOUR; // 19:00 local, the same game day
        expect((await b.today()).modifiers).toEqual(first);
        expect((await a.today()).modifiers).toEqual(first);
        expect(count(ctx.sql, 'dungeon_days')).toBe(1);
        ctx.clock.t += DAY;
        await a.today();
        expect(count(ctx.sql, 'dungeon_days')).toBe(2);
        const seeds = rows<{ modifier_seed: string }>(
          ctx.sql,
          'SELECT modifier_seed FROM dungeon_days',
        );
        expect(new Set(seeds.map((s) => s.modifier_seed)).size).toBe(2);
      },
      opts(),
    );
  });

  it('draws nothing for a day that already has its modifiers', async () => {
    const rng = counting('today-draws');
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1);
        await p.today();
        const drawn = rng.drawn();
        expect(drawn).toBeGreaterThan(0);
        await p.today();
        await p.today();
        expect(rng.drawn()).toBe(drawn);
      },
      { dungeonRng: rng },
    );
  });

  it('says why a player cannot run: too few creatures, or already run today', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const solo = await dungeonPlayer(ctx, 1, { creatures: 2 });
        expect(await solo.today()).toMatchObject({ canRun: false, blocked: 'need_creatures' });
        const p = await dungeonPlayer(ctx, 2, STRONG);
        setProgress(ctx, p.id, {});
        expect((await p.run()).status).toBe(200);
        expect(await p.today()).toMatchObject({
          canRun: false,
          blocked: 'already_run',
          attemptsToday: 1,
          attemptsAllowed: 1,
        });
      },
      opts(),
    );
  });

  it('works for a player who has never been seen before (no progress row)', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1);
        expect(count(ctx.sql, 'dungeon_progress')).toBe(0);
        await p.today();
        expect(count(ctx.sql, 'dungeon_progress')).toBe(0); // reading creates no player rows
      },
      opts(),
    );
  });
});

describe('the last team in GET /api/dungeon/today', () => {
  it('is null before a player has run, and for a player who never appeared', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        expect((await p.today()).lastTeam).toBeNull();
      },
      opts(),
    );
  });

  it('is the ordered ids of the newest run, on any day, and the run response carries it too', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const [a, b, c] = p.creatureIds as [string, string, string];
        ctx.clock.t = AFTER_RESET;
        const first = await p.run({ team: [c, a, b] });
        expect(first.body.today.lastTeam).toEqual([c, a, b]);
        expect((await p.today()).lastTeam).toEqual([c, a, b]);
        // The next game day: nothing ran today, but the last team is still known, in the same order.
        ctx.clock.t = AFTER_RESET + DAY;
        const tomorrow = await p.today();
        expect(tomorrow.last).toBeNull();
        expect(tomorrow.lastTeam).toEqual([c, a, b]);
        // A newer run replaces it.
        expect((await p.run({ team: [b, c, a] })).status).toBe(200);
        expect((await p.today()).lastTeam).toEqual([b, c, a]);
      },
      opts(),
    );
  });

  it('is only the requesting player’s own team', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const other = await dungeonPlayer(ctx, 2, STRONG);
        const [a, b, c] = p.creatureIds as [string, string, string];
        ctx.clock.t = AFTER_RESET;
        expect((await p.run({ team: [b, c, a] })).status).toBe(200);
        expect((await other.today()).lastTeam).toBeNull();
        expect((await p.today()).lastTeam).toEqual([b, c, a]);
        expect(JSON.stringify(await other.today())).not.toContain(a);
      },
      opts(),
    );
  });

  it('stays after the run is past its retention, and a refused run does not change it', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const [a, b, c] = p.creatureIds as [string, string, string];
        ctx.clock.t = AFTER_RESET;
        expect((await p.run({ team: [c, b, a] })).status).toBe(200);
        // A second run the same day is refused and leaves the memory alone.
        expect((await p.run({ team: [a, b, c] })).status).toBe(409);
        expect((await p.today()).lastTeam).toEqual([c, b, a]);
        ctx.clock.t += 91 * DAY;
        ctx.core.dungeon.prune();
        expect(storedRuns(ctx, p.id)[0]?.input_json).toBeNull();
        expect((await p.today()).lastTeam).toEqual([c, b, a]);
      },
      opts(),
    );
  });

  it('is null, not an error, when a stored summary is damaged', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        ctx.clock.t = AFTER_RESET;
        expect((await p.run()).status).toBe(200);
        ctx.sql.exec(
          'UPDATE dungeon_runs SET summary_json = ? WHERE user_id = ?',
          JSON.stringify({ team: [{ id: 'x' }] }),
          p.id,
        );
        const today = await p.today();
        expect(today.lastTeam).toBeNull();
      },
      opts(),
    );
  });
});

describe('POST /api/dungeon/run', () => {
  it('plays a run, stores it and pays it in one go', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        ctx.clock.t = AFTER_RESET;
        const res = await p.run();
        expect(res.status).toBe(200);
        const run = res.body.run;
        expect(run).toMatchObject({
          day: '2027-01-15',
          attempt: 1,
          depth: 1,
          cleared: true,
          roomsCleared: 3,
          newDepth: 2,
          streak: 1,
          landmark: false,
        });
        expect(run.rooms.map((r) => r.kind)).toEqual(['foe', 'foe', 'boss']);
        expect(run.rooms.every((r) => r.played && r.cleared && r.foeHpEnd === 0)).toBe(true);
        // The row is the team in the order of the request: left to right.
        expect(run.team.map((t) => t.id)).toEqual(p.creatureIds);
        // The modifiers shown before the run are the rooms' modifiers.
        const today = await p.today();
        expect(run.rooms.map((r) => r.modifier.id)).toEqual(today.modifiers.map((m) => m.id));
        expect(today.last?.id).toBe(run.id);
        expect(res.body.today.last?.id).toBe(run.id);
        expect(res.body.today.depth).toBe(2);

        // Paid: Bait, Essence and scrap for all three rooms, through the ledger and the parts table.
        const per = RULES.dungeon.perRoom;
        const bait = per.reduce((n, r) => n + r.bait, 0);
        const essence = per.reduce((n, r) => n + r.essence, 0) + RULES.dungeon.fullClear.essence;
        expect(run.rewards).toMatchObject({ bait, essence, landmark: false, streak: null });
        const ledger = dungeonLedger(ctx, p.id);
        expect(ledger).toEqual([
          { currency: 'bait', amount: bait, idempotency_key: 'dungeon:2027-01-15:1:bait' },
          { currency: 'essence', amount: essence, idempotency_key: 'dungeon:2027-01-15:1:essence' },
        ]);
        expect(partsOf(ctx, p.id).scrap).toBeGreaterThanOrEqual(
          per.reduce((n, r) => n + r.scrap, 0),
        );
        expect(progressOf(ctx, p.id)).toMatchObject({
          depth: 2,
          streak: 1,
          last_day: '2027-01-15',
          runs: 1,
          clears: 1,
        });
        expect(storedRuns(ctx, p.id)).toHaveLength(1);
      },
      opts(),
    );
  });

  it('stands the team in one row, in the order of the request, whatever the order is', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const [a, b, c] = p.creatureIds as [string, string, string];
        ctx.clock.t = AFTER_RESET;
        const res = await p.run({ team: [c, a, b] });
        expect(res.status).toBe(200);
        expect(res.body.run.team.map((t) => t.id)).toEqual([c, a, b]);
        const stored = storedRuns(ctx, p.id)[0] as StoredRun;
        const input = JSON.parse(stored.input_json as string) as DungeonRunInput;
        // The fight's row is the team, position i = team[i], and nothing else was stored about it.
        expect(input.team.map((s) => s.id)).toEqual([c, a, b]);
        expect(Object.keys(input)).not.toContain('formation');
        // The combat rules, the boss room's enrage and the depth are stored for an exact replay.
        expect(input.rules).toEqual(liveFightRules());
        expect(input.enrage).toEqual(dungeonBossEnrage());
        expect(input.depth).toBe(stored.depth);
        const replay = await p.replay(res.body.run.id);
        expect(replay.body.row.map((r) => [r.position, r.id])).toEqual([
          [0, c],
          [1, a],
          [2, b],
        ]);
        // The creature ability keys follow the row, too.
        const keys = input.abilities.map((x) => x.key);
        expect(keys).toEqual(['p1:c0', 'p1:c1', 'p1:c2']);
        expect(input.abilities.map((x) => x.creatureId)).toEqual([c, a, b]);
      },
      opts(),
    );
  });

  it('keeps the depth after a lost run, and pays only the rooms that were cleared', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, { level: 1 });
        setProgress(ctx, p.id, { depth: 45 });
        const res = await p.run();
        expect(res.status).toBe(200);
        const run = res.body.run;
        expect(run.cleared).toBe(false);
        expect(run.roomsCleared).toBe(0);
        expect(run.newDepth).toBe(45);
        expect(run.rooms.filter((r) => r.played)).toHaveLength(1); // the run ends in the room it loses
        expect(run.rooms.slice(1).every((r) => !r.played && !r.cleared)).toBe(true);
        expect(run.rewards).toMatchObject({ bait: 0, essence: 0, gear: [] });
        expect(dungeonLedger(ctx, p.id)).toEqual([]);
        expect(progressOf(ctx, p.id)).toMatchObject({ depth: 45, runs: 1, clears: 0, streak: 1 });
      },
      opts(),
    );
  });

  it('pays only the rooms cleared when a run is lost in the second room', async () => {
    // Search depths until a player loses in room 2 (the numbers are fixed by the seed, so this is repeatable).
    await runCore(
      nextGuild(),
      async (ctx) => {
        let found = false;
        for (let depth = 2; depth < 40 && !found; depth++) {
          const p = await dungeonPlayer(ctx, depth + 10, { level: 12 });
          setProgress(ctx, p.id, { depth });
          const run = (await p.run()).body.run;
          if (run.roomsCleared !== 1) continue;
          found = true;
          const first = RULES.dungeon.perRoom[0];
          expect(run.rewards.bait).toBe(first?.bait);
          expect(run.rewards.essence).toBe(first?.essence);
          expect(run.cleared).toBe(false);
          expect(run.rooms.map((r) => r.played)).toEqual([true, true, false]);
        }
        expect(found).toBe(true);
      },
      opts(),
    );
  });

  it('refuses what it should, and changes nothing', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const other = await dungeonPlayer(ctx, 2, STRONG);
        const before = () => [count(ctx.sql, 'dungeon_runs'), count(ctx.sql, 'ledger')];
        const start = before();
        const refuse = async (
          overrides: Parameters<DungeonPlayer['run']>[0],
          status: number,
          error: string,
        ) => {
          const res = await p.run(overrides);
          expect({ status: res.status, error: res.body.error }).toEqual({ status, error });
          expect(before()).toEqual(start);
        };
        const [a, b, c] = p.creatureIds as [string, string, string];

        // Wrong count: two or four creatures, or none.
        await refuse({ team: [a, b] }, 400, 'invalid_body');
        await refuse({ team: [a, b, c, a] }, 400, 'invalid_body');
        await refuse({ team: [] }, 400, 'invalid_body');
        // The same creature twice.
        await refuse({ team: [a, a, b] }, 400, 'duplicate_creature');
        // The old zone formation is gone: any body that still has one is not the strict shape.
        for (const formation of [['front', 'middle', 'back'], ['front', 'front', 'back'], []]) {
          const old = await p.call('POST', '/api/dungeon/run', { ...p.body(), formation });
          expect({ status: old.status, error: old.body['error'] }).toEqual({
            status: 400,
            error: 'invalid_body',
          });
        }
        expect(before()).toEqual(start);
        // Not the caller's creature (somebody else's, or one that does not exist): the same answer.
        await refuse({ team: [a, b, other.creatureIds[0] as string] }, 404, 'not_found');
        await refuse({ team: [a, b, '00000000-0000-4000-8000-000000000000'] }, 404, 'not_found');
        // Not an id at all.
        await refuse({ team: [a, b, 'not-a-uuid'] }, 400, 'invalid_body');
        // The old ability choices are gone: a body that still carries `abilities` is not the strict shape.
        for (const abilities of [
          { basic: { abilityId: 'rally', fireAtRound: null }, creatures: [] },
          { basic: { abilityId: 'shield-wall', fireAtRound: 2, zone: 'front' }, creatures: [] },
          { creatures: [{ creatureId: a, fireAtRound: 2 }] },
          {},
        ]) {
          const old = await p.call('POST', '/api/dungeon/run', { ...p.body(), abilities });
          expect({ status: old.status, error: old.body['error'] }).toEqual({
            status: 400,
            error: 'invalid_body',
          });
        }
        // A key that is not a key.
        await refuse({ idempotencyKey: 'short' }, 400, 'invalid_body');

        // Unknown keys are rejected: a client can never send a user, a seed or stats.
        for (const extra of [
          { userId: other.id },
          { seed: 'abc' },
          { stats: { atk: 9999 } },
          { depth: 50 },
        ]) {
          const res = await p.call('POST', '/api/dungeon/run', { ...p.body(), ...extra });
          expect(res.status).toBe(400);
          expect(res.body).toEqual({ error: 'invalid_body' });
        }
        expect(before()).toEqual(start);
        // And what is allowed still works afterwards, with nothing used up.
        expect((await p.run()).status).toBe(200);
      },
      opts(),
    );
  });

  it('refuses a second run on the same day', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        setProgress(ctx, p.id, {});
        ctx.clock.t = AFTER_RESET;
        expect((await p.run()).status).toBe(200);
        const second = await p.run();
        expect(second.status).toBe(409);
        expect(second.body).toEqual({ error: 'already_run' });
        ctx.clock.t += 6 * HOUR; // still the same game day (20:00 local)
        expect((await p.run()).body).toEqual({ error: 'already_run' });
        expect(storedRuns(ctx, p.id)).toHaveLength(1);
        // Another player's day is their own.
        const other = await dungeonPlayer(ctx, 2, STRONG);
        expect((await other.run()).status).toBe(200);
        // The next day it works again.
        ctx.clock.t += DAY;
        expect((await p.run()).status).toBe(200);
        expect(storedRuns(ctx, p.id)).toHaveLength(2);
      },
      opts(),
    );
  });

  it('lets a creature that is away on an expedition run: the run is instant', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const sent = await p.call('POST', '/api/expeditions', {
          creatureId: p.creatureIds[0],
          destination: 'tidepools',
          duration: 'short',
          supplies: [],
          idempotencyKey: newKey(),
        });
        expect(sent.status).toBe(200);
        const away = rows<{ away_expedition_id: string | null }>(
          ctx.sql,
          'SELECT away_expedition_id FROM creatures WHERE id = ?',
          p.creatureIds[0] as string,
        )[0];
        expect(away?.away_expedition_id).not.toBeNull();
        expect((await p.run()).status).toBe(200);
      },
      opts(),
    );
  });
});

describe('idempotency', () => {
  it('returns the stored run for a retry with the same key, and charges and draws nothing', async () => {
    const rng = counting('retry');
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const body = p.body();
        const first = await p.call('POST', '/api/dungeon/run', body);
        expect(first.status).toBe(200);
        const drawn = rng.drawn();
        const ledger = dungeonLedger(ctx, p.id);
        const parts = partsOf(ctx, p.id);
        const eventCount = count(ctx.sql, 'analytics_events');
        for (let i = 0; i < 3; i++) {
          const again = await p.call('POST', '/api/dungeon/run', body);
          expect(again.status).toBe(200);
          expect((again.body['run'] as { id: string }).id).toBe(
            (first.body['run'] as { id: string }).id,
          );
          expect(again.body['run']).toEqual(first.body['run']);
        }
        expect(rng.drawn()).toBe(drawn);
        expect(storedRuns(ctx, p.id)).toHaveLength(1);
        expect(dungeonLedger(ctx, p.id)).toEqual(ledger);
        expect(partsOf(ctx, p.id)).toEqual(parts);
        expect(count(ctx.sql, 'analytics_events')).toBe(eventCount); // a replay logs nothing
      },
      { dungeonRng: rng, gearRng: createSeededRng('retry-gear') },
    );
  });

  it('returns the stored run on a retry the next day, too (the key is the player’s, not the day’s)', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const body = p.body();
        const first = await p.call('POST', '/api/dungeon/run', body);
        ctx.clock.t += DAY;
        const again = await p.call('POST', '/api/dungeon/run', body);
        expect(again.status).toBe(200);
        expect((again.body['run'] as { id: string }).id).toBe(
          (first.body['run'] as { id: string }).id,
        );
        expect(storedRuns(ctx, p.id)).toHaveLength(1);
      },
      opts(),
    );
  });

  it('refuses the same key for a different request, or one a ledger spend used', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const body = p.body();
        expect((await p.call('POST', '/api/dungeon/run', body)).status).toBe(200);
        const [a, b, c] = p.creatureIds as [string, string, string];
        const changed = await p.call('POST', '/api/dungeon/run', {
          ...body,
          team: [b, a, c],
        });
        expect(changed.status).toBe(409);
        expect(changed.body).toEqual({ error: 'key_conflict' });

        const q = await dungeonPlayer(ctx, 2, { level: 8 });
        ctx.core.credit({
          userId: q.id,
          currency: 'bait',
          amount: 50,
          source: 'test',
          idempotencyKey: 'bait-for-train',
        });
        const key = newKey();
        const trained = await q.call('POST', `/api/creatures/${q.creatureIds[0] as string}/train`, {
          idempotencyKey: key,
        });
        expect(trained.status, JSON.stringify(trained.body)).toBe(200);
        const reused = await q.run({ idempotencyKey: key });
        expect(reused.status).toBe(409);
        expect(reused.body).toEqual({ error: 'key_conflict' });
        expect(storedRuns(ctx, q.id)).toHaveLength(0);
      },
      opts(),
    );
  });

  it('stores one run and pays once when two requests race', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        setProgress(ctx, p.id, {});
        const results = await Promise.all([p.run(), p.run(), p.run()]);
        const statuses = results.map((r) => r.status).sort();
        expect(statuses).toEqual([200, 409, 409]);
        expect(
          results.filter((r) => r.status === 409).every((r) => r.body.error === 'already_run'),
        ).toBe(true);
        expect(storedRuns(ctx, p.id)).toHaveLength(1);
        expect(dungeonLedger(ctx, p.id)).toHaveLength(2); // Bait and Essence, once
        expect(progressOf(ctx, p.id)).toMatchObject({ runs: 1, clears: 1, depth: 2 });
      },
      opts(),
    );
  });

  it('stores one run when the same request is sent twice at once', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        setProgress(ctx, p.id, {});
        const body = p.body();
        const results = await Promise.all([
          p.call('POST', '/api/dungeon/run', body),
          p.call('POST', '/api/dungeon/run', body),
        ]);
        expect(results.map((r) => r.status)).toEqual([200, 200]);
        expect((results[0]?.body['run'] as { id: string }).id).toBe(
          (results[1]?.body['run'] as { id: string }).id,
        );
        expect(storedRuns(ctx, p.id)).toHaveLength(1);
        expect(dungeonLedger(ctx, p.id)).toHaveLength(2);
      },
      opts(),
    );
  });

  it('pays every part of a run exactly once, however often the grant is asked for', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        setProgress(ctx, p.id, { depth: 6, last_day: '2027-01-14', streak: 2 });
        ctx.clock.t = AFTER_RESET;
        const res = await p.run();
        const run = res.body.run;
        expect(run.cleared).toBe(true);
        // Day 3 of the streak: the bonus is in the ledger and the run's rewards.
        expect(run.rewards.streak?.day).toBe(3);
        const ledger = dungeonLedger(ctx, p.id);
        const keys = ledger.map((l) => l.idempotency_key).sort();
        const bonus = RULES.dungeon.streak.bonuses.find((b) => b.day === 3);
        const expected = ['dungeon:2027-01-15:1:bait', 'dungeon:2027-01-15:1:essence'];
        if ((bonus?.bait ?? 0) > 0) expected.push('dungeon:2027-01-15:streak:bait');
        if ((bonus?.essence ?? 0) > 0) expected.push('dungeon:2027-01-15:streak:essence');
        expect(keys).toEqual(expected.sort());
        const parts = partsOf(ctx, p.id);
        const items = count(ctx.sql, 'gear_items', `user_id = '${p.id}'`);
        // Asking the grants again (a retry that got past the run row, a replayed event) changes nothing.
        const deps = {
          storage: ctx.storage,
          now: () => ctx.clock.t,
          rng: createSeededRng('another-roll'),
        };
        const again = grantDungeonRun(deps, p.id, '2027-01-15', 1, () => ({
          parts: { scrap: 999 },
          gear: [
            {
              item: rollItem(createSeededRng('x'), {
                baseId: 'trail-cap',
                rarity: 'epic',
                itemLevel: 5,
              }),
              origin: { kind: 'dungeon' as const, depth: 3 },
            },
          ],
        }));
        expect(again.parts).toEqual(run.rewards.parts);
        expect(partsOf(ctx, p.id)).toEqual(parts);
        expect(count(ctx.sql, 'gear_items', `user_id = '${p.id}'`)).toBe(items);
        expect(
          rows(
            ctx.sql,
            `SELECT key FROM gear_grants WHERE user_id = '${p.id}' AND key LIKE 'dungeon:%'`,
          ).length,
        ).toBeGreaterThanOrEqual(1);
      },
      opts(),
    );
  });
});

const stockOf = (ctx: CoreContext, userId: string): Record<string, number> =>
  Object.fromEntries(
    rows<{ supply_id: string; amount: number }>(
      ctx.sql,
      'SELECT supply_id, amount FROM supplies WHERE user_id = ? AND amount > 0',
      userId,
    ).map((r) => [r.supply_id, r.amount]),
  );

const stockTotal = (ctx: CoreContext, userId: string): number =>
  Object.values(stockOf(ctx, userId)).reduce((n, x) => n + x, 0);

describe('the supply a run drops', () => {
  it('puts one supply in the stock for a run that clears the first room, and shows it in the rewards', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        ctx.clock.t = AFTER_RESET;
        const res = await p.run();
        const run = res.body.run;
        const dropped = RULES.dungeon.perRoom.reduce((n, r) => n + r.supply, 0);
        expect(dropped).toBeGreaterThan(0);
        expect(run.rewards.supplies).toHaveLength(dropped);
        // Depth 1 drops the basic tier of a kind of the content.
        for (const id of run.rewards.supplies ?? []) expect(supplyDef(id)?.tier).toBe('basic');
        // They are in the stock, and the state the client reloads shows them.
        const stock = stockOf(ctx, p.id);
        expect(stockTotal(ctx, p.id)).toBe(dropped);
        for (const id of run.rewards.supplies ?? []) expect(stock[id]).toBeGreaterThan(0);
        const state = (await p.call('GET', '/api/state')).body as {
          supplies: Record<string, number>;
        };
        expect(state.supplies).toEqual(stock);
        // The grant row records them (the ledger of dungeon loot), under the run's own key.
        const grant = rows<{ key: string; source: string; result_json: string }>(
          ctx.sql,
          `SELECT key, source, result_json FROM gear_grants WHERE user_id = '${p.id}' AND key = 'dungeon:2027-01-15:1'`,
        )[0];
        expect(grant?.source).toBe('dungeon');
        const stored = JSON.parse(grant?.result_json ?? '{}') as { supplies?: string[] };
        expect(stored.supplies).toEqual(run.rewards.supplies);
        // Analytics: the drop is a source of supplies, and the reward event counts it.
        const drop = events(ctx, 'gear_drop').find((e) => e['source'] === 'dungeon');
        expect(drop?.['supplies']).toBe(dropped);
        expect(events(ctx, 'dungeon_reward')[0]?.['supplies']).toBe(dropped);
      },
      opts(),
    );
  });

  it('drops nothing for a run lost in the first room, and keeps the first room drop of a run lost later', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const lost = await dungeonPlayer(ctx, 1, { level: 1 });
        setProgress(ctx, lost.id, { depth: 45 });
        const none = (await lost.run()).body.run;
        expect(none.roomsCleared).toBe(0);
        expect(none.rewards.supplies ?? []).toEqual([]);
        expect(stockOf(ctx, lost.id)).toEqual({});
        // A run lost in the second room still got past the first one (searched: the dice are fixed).
        let found = false;
        let n = 1;
        for (let depth = 2; depth < 60 && !found; depth++) {
          for (const level of [8, 10, 12, 15, 20]) {
            const p = await dungeonPlayer(ctx, ++n, { level });
            setProgress(ctx, p.id, { depth });
            const run = (await p.run()).body.run;
            if (run.roomsCleared !== 1) continue;
            found = true;
            expect(run.cleared).toBe(false);
            const first = RULES.dungeon.perRoom[0]?.supply ?? 0;
            expect(run.rewards.supplies).toHaveLength(first);
            expect(stockTotal(ctx, p.id)).toBe(first);
            break;
          }
        }
        expect(found).toBe(true);
      },
      opts(),
    );
  });

  it('draws the supply with the live gear rng once, and a retry or a second grant draws and grants nothing', async () => {
    const gear = counting('supply-gear');
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        ctx.clock.t = AFTER_RESET;
        const body = p.body();
        const first = await p.call('POST', '/api/dungeon/run', body);
        expect(first.status).toBe(200);
        const firstRun = first.body['run'] as { rewards: { supplies: string[] } };
        const drawn = gear.drawn();
        expect(drawn).toBeGreaterThan(0);
        const stock = stockOf(ctx, p.id);
        for (let i = 0; i < 3; i++) {
          const again = await p.call('POST', '/api/dungeon/run', body);
          expect(again.body['run']).toEqual(first.body['run']);
        }
        // The grant itself, asked for again with the run's key: nothing is drawn, nothing is added.
        const again = grantDungeonRun(
          { storage: ctx.storage, now: () => ctx.clock.t, rng: gear },
          p.id,
          '2027-01-15',
          1,
          () => ({ parts: {}, gear: [], supplies: ['lantern-great'] }),
        );
        expect(again.supplies).toEqual(firstRun.rewards.supplies);
        expect(gear.drawn()).toBe(drawn);
        expect(stockOf(ctx, p.id)).toEqual(stock);
        // A new day is a new key and a new supply.
        ctx.clock.t = AFTER_RESET + DAY;
        expect((await p.run()).status).toBe(200);
        expect(stockTotal(ctx, p.id)).toBe(2 * (RULES.dungeon.perRoom[0]?.supply ?? 0));
      },
      { dungeonRng: createSeededRng('supply-run'), gearRng: gear },
    );
  });

  it('drops better tiers deeper: basic only before the first open depth, some good and great ones far down', async () => {
    const tiers = RULES.dungeon.supplyTiers;
    expect(dungeonSupplyOddsBp(tiers.good.fromDepth - 1).good).toBe(0);
    await runCore(
      nextGuild(),
      async (ctx) => {
        const seen = { basic: 0, good: 0, great: 0 };
        for (let i = 0; i < 60; i++) {
          const p = await dungeonPlayer(ctx, i + 1, STRONG);
          setProgress(ctx, p.id, { depth: tiers.great.fromDepth + 2 });
          const run = (await p.run()).body.run;
          for (const id of run.rewards.supplies ?? []) {
            const tier = supplyDef(id)?.tier;
            if (tier !== undefined) seen[tier] += 1;
          }
        }
        expect(seen.basic + seen.good + seen.great).toBeGreaterThanOrEqual(30);
        expect(seen.basic).toBeGreaterThan(0);
        expect(seen.good).toBeGreaterThan(0);
        expect(seen.great).toBeGreaterThan(0);
      },
      opts('tiers'),
    );
  });

  it('no longer sells a supply: the send refuses the old buy shape and the ledger has no expedition spend', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const res = await p.call('POST', '/api/expeditions', {
          creatureId: p.creatureIds[0],
          destination: 'tidepools',
          duration: 'short',
          supplies: [{ id: 'lure-basic', source: 'buy' }],
          idempotencyKey: newKey(),
        });
        expect(res.status).toBe(400);
        expect(res.body['error']).toBe('supplies_not_for_sale');
        expect(rows(ctx.sql, "SELECT id FROM ledger WHERE source = 'expedition'")).toEqual([]);
      },
      opts(),
    );
  });
});

describe('the day is the guild-local game day, which turns at 13:37', () => {
  it('ends at 13:37 local across the spring DST change (a 23 hour day), in Europe/Helsinki', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        setProgress(ctx, p.id, {});
        // 2027-03-28: the clocks go forward at 03:00 (01:00Z), from UTC+2 to UTC+3.
        ctx.clock.t = Date.parse('2027-03-27T12:00:00Z'); // 14:00 on the 27th (UTC+2)
        expect((await p.run()).body.run.day).toBe('2027-03-27');
        // The 27th ends at 13:37 on the 28th, which is 10:37Z in UTC+3: only 23 hours after 13:37 on the 27th.
        expect((await p.today()).resetsAt).toBe(Date.parse('2027-03-28T10:37:00Z'));
        ctx.clock.t = Date.parse('2027-03-28T10:36:59Z'); // 13:36:59 on the 28th
        expect((await p.run()).body).toEqual({ error: 'already_run' });
        ctx.clock.t = Date.parse('2027-03-28T10:37:00Z'); // 13:37:00 on the 28th
        expect((await p.run()).body.run.day).toBe('2027-03-28');
        // The 28th ends at 13:37 on the 29th (10:37Z): 24 hours later, as the clocks do not move that day.
        expect((await p.today()).resetsAt).toBe(Date.parse('2027-03-29T10:37:00Z'));
        ctx.clock.t = Date.parse('2027-03-29T10:36:59Z');
        expect((await p.run()).body).toEqual({ error: 'already_run' });
        ctx.clock.t = Date.parse('2027-03-29T10:37:00Z');
        expect((await p.run()).body.run.day).toBe('2027-03-29');
        expect(storedRuns(ctx, p.id).map((r) => r.day)).toEqual([
          '2027-03-27',
          '2027-03-28',
          '2027-03-29',
        ]);
        // Three game days in a row, one run each. The first game day was 23 hours long.
        expect(progressOf(ctx, p.id)?.streak).toBe(3);
      },
      opts(),
    );
  });

  it('ends at 13:37 local across the autumn DST change (a 25 hour day), in Europe/Helsinki', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        setProgress(ctx, p.id, {});
        // 2027-10-31: the clocks go back at 04:00 to 03:00 (01:00Z). The 30th is on UTC+3 until then.
        ctx.clock.t = Date.parse('2027-10-30T11:00:00Z'); // 14:00 on the 30th (UTC+3)
        expect((await p.run()).body.run.day).toBe('2027-10-30');
        // The 30th ends at 13:37 on the 31st, which is 11:37Z in UTC+2: 25 hours after 13:37 on the 30th.
        expect((await p.today()).resetsAt).toBe(Date.parse('2027-10-31T11:37:00Z'));
        ctx.clock.t = Date.parse('2027-10-31T10:37:00Z'); // 12:37 on the 31st, though 24 hours have passed
        expect((await p.run()).body).toEqual({ error: 'already_run' });
        ctx.clock.t = Date.parse('2027-10-31T11:36:59Z'); // 13:36:59
        expect((await p.run()).body).toEqual({ error: 'already_run' });
        ctx.clock.t = Date.parse('2027-10-31T11:37:00Z'); // 13:37:00
        expect((await p.run()).body.run.day).toBe('2027-10-31');
        // The 31st ends at 13:37 on 1 November (UTC+2), 24 hours later.
        expect((await p.today()).resetsAt).toBe(Date.parse('2027-11-01T11:37:00Z'));
        ctx.clock.t = Date.parse('2027-11-01T11:37:00Z');
        expect((await p.run()).body.run.day).toBe('2027-11-01');
      },
      opts(),
    );
  });

  it('follows the guild timezone, not UTC', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        setProgress(ctx, p.id, {});
        expect(await ctx.core.setTimezone('America/Los_Angeles')).toBe(true);
        // 2027-01-15 21:30Z is 13:30 on the 15th in Los Angeles (UTC-8): before the reset, so the 14th.
        ctx.clock.t = Date.parse('2027-01-15T21:30:00Z');
        const today = await p.today();
        expect(today).toMatchObject({ day: '2027-01-14', timezone: 'America/Los_Angeles' });
        // 13:37 in Los Angeles is 21:37Z (not 13:37Z, which would be the reset in UTC).
        expect(today.resetsAt).toBe(Date.parse('2027-01-15T21:37:00Z'));
        expect((await p.run()).body.run.day).toBe('2027-01-14');
        ctx.clock.t = Date.parse('2027-01-15T21:36:59Z');
        expect((await p.run()).body).toEqual({ error: 'already_run' });
        ctx.clock.t = Date.parse('2027-01-15T21:37:00Z');
        expect((await p.run()).body.run.day).toBe('2027-01-15');
      },
      opts(),
    );
  });

  it('refuses a second run when the timezone moves west, and keeps the streak', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        setProgress(ctx, p.id, {
          depth: 3,
          streak: 4,
          last_day: '2027-01-14',
          first_day: '2027-01-01',
        });
        // 14:00 in Helsinki (UTC+2) on the 15th: after the reset, so the 15th.
        ctx.clock.t = Date.parse('2027-01-15T12:00:00Z');
        expect((await p.run()).body.run.day).toBe('2027-01-15');
        const before = progressOf(ctx, p.id);
        expect(before).toMatchObject({ streak: 5, last_day: '2027-01-15' });
        // The same instant is 04:00 on the 15th in Los Angeles: before the reset, so the 14th.
        expect(await ctx.core.setTimezone('America/Los_Angeles')).toBe(true);
        const today = await p.today();
        expect(today).toMatchObject({
          day: '2027-01-14',
          canRun: false,
          blocked: 'already_run',
          streak: 5,
        });
        expect((await p.run()).body).toEqual({ error: 'already_run' });
        expect(progressOf(ctx, p.id)).toEqual(before);
      },
      opts(),
    );
  });

  it('puts a run at 13:36 and a run at 13:38 of the same date on different game days', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        setProgress(ctx, p.id, {});
        // 2027-01-15 in Helsinki (UTC+2): 13:36 is 11:36Z and 13:38 is 11:38Z.
        ctx.clock.t = Date.parse('2027-01-15T11:36:00Z');
        const before = await p.run();
        expect(before.body.run.day).toBe('2027-01-14');
        ctx.clock.t = Date.parse('2027-01-15T11:38:00Z');
        const after = await p.run();
        expect(after.status).toBe(200);
        expect(after.body.run.day).toBe('2027-01-15');
        expect(storedRuns(ctx, p.id).map((r) => r.day)).toEqual(['2027-01-14', '2027-01-15']);
        // Two minutes apart, and the second run is not refused as a second run of the day.
        expect(after.body.run.createdAt - before.body.run.createdAt).toBe(2 * 60_000);
      },
      opts(),
    );
  });

  it('counts the streak in game days: 13:38 to 13:36 the next date is one day, not two', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        setProgress(ctx, p.id, {});
        // A game day runs from 13:37 to 13:37: a run just before the reset is still the old day's
        // (so it is refused), and one just after it is the next day's.
        ctx.clock.t = Date.parse('2027-01-15T11:38:00Z');
        expect((await p.run()).body.run.streak).toBe(1);
        ctx.clock.t = Date.parse('2027-01-16T11:36:00Z'); // 13:36 on the 16th: still the 15th's game day
        expect((await p.run()).body).toEqual({ error: 'already_run' });
        expect((await p.today()).streak).toBe(1);
        ctx.clock.t = Date.parse('2027-01-16T11:38:00Z'); // 13:38 on the 16th: the next game day
        expect((await p.run()).body.run.streak).toBe(2);
        // Midnight passed in between and started nothing: only the 13:37 reset does.
        ctx.clock.t = Date.parse('2027-01-17T11:36:00Z');
        expect((await p.run()).body).toEqual({ error: 'already_run' });
        ctx.clock.t = Date.parse('2027-01-17T11:38:00Z');
        expect((await p.run()).body.run.streak).toBe(3);
        // Skip a whole game day (the 18th): the streak is gone by the 19th.
        ctx.clock.t = Date.parse('2027-01-19T11:38:00Z');
        expect((await p.today()).streak).toBe(0);
        expect((await p.run()).body.run.streak).toBe(1);
        expect(storedRuns(ctx, p.id).map((r) => r.day)).toEqual([
          '2027-01-15',
          '2027-01-16',
          '2027-01-17',
          '2027-01-19',
        ]);
      },
      opts(),
    );
  });
});

describe('the free retry of the first day', () => {
  it('lets a player who lost their very first run try once more, and no more', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, { level: 1 });
        // Make the first run a loss: the depth is far beyond a level 1 team (the row has no first day yet).
        ctx.sql.exec(
          'INSERT INTO dungeon_progress (user_id, depth, first_day) VALUES (?, 45, NULL)',
          p.id,
        );
        let today = await p.today();
        expect(today.attemptsAllowed).toBe(2);
        const first = await p.run();
        expect(first.body.run).toMatchObject({ attempt: 1, cleared: false });
        today = await p.today();
        expect(today).toMatchObject({ canRun: true, attemptsToday: 1, attemptsAllowed: 2 });
        const second = await p.run();
        expect(second.status).toBe(200);
        expect(second.body.run).toMatchObject({ attempt: 2, day: first.body.run.day });
        expect(second.body.run.id).not.toBe(first.body.run.id);
        const third = await p.run();
        expect(third.status).toBe(409);
        expect(third.body).toEqual({ error: 'already_run' });
        expect(storedRuns(ctx, p.id).map((r) => r.attempt)).toEqual([1, 2]);
        // The streak counts the day once.
        expect(progressOf(ctx, p.id)).toMatchObject({ runs: 2, streak: 1 });
        // The next day there is one run, and a loss gets no retry.
        ctx.clock.t += DAY;
        expect((await p.today()).attemptsAllowed).toBe(1);
        expect((await p.run()).body.run.attempt).toBe(1);
        expect((await p.run()).body).toEqual({ error: 'already_run' });
      },
      opts(),
    );
  });

  it('gives no retry to a player who cleared their first run, or who is not on their first day', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const first = await p.run();
        expect(first.body.run.cleared).toBe(true);
        expect(await p.today()).toMatchObject({ canRun: false, blocked: 'already_run' });
        expect((await p.run()).body).toEqual({ error: 'already_run' });

        // A player whose first day was long ago: a loss does not give a retry.
        const old = await dungeonPlayer(ctx, 2, { level: 1 });
        setProgress(ctx, old.id, { depth: 45, first_day: '2027-01-01' });
        expect((await old.run()).body.run.cleared).toBe(false);
        expect((await old.run()).body).toEqual({ error: 'already_run' });
      },
      opts(),
    );
  });

  it('pays each attempt once, under its own keys', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, { level: 1 });
        // Depth 1 is cleared by almost anyone, so lose the first attempt by taking a very high depth,
        // then bring the depth back down for the retry.
        ctx.sql.exec(
          'INSERT INTO dungeon_progress (user_id, depth, first_day) VALUES (?, 45, NULL)',
          p.id,
        );
        ctx.clock.t = AFTER_RESET;
        expect((await p.run()).body.run.cleared).toBe(false);
        ctx.sql.exec('UPDATE dungeon_progress SET depth = 1 WHERE user_id = ?', p.id);
        const retry = await p.run();
        expect(retry.body.run.attempt).toBe(2);
        const keys = dungeonLedger(ctx, p.id).map((l) => l.idempotency_key);
        for (const k of keys) expect(k).toMatch(/^dungeon:2027-01-15:2:/);
        expect(new Set(keys).size).toBe(keys.length);
      },
      opts(),
    );
  });
});

describe('streaks and landmarks', () => {
  it('counts days in a row, pays the 3rd and 7th day, and starts again after a missed day', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        setProgress(ctx, p.id, {});
        const streaks: number[] = [];
        const bonusDays: (number | null)[] = [];
        const runIds: string[] = [];
        for (let day = 1; day <= 8; day++) {
          const res = await p.run();
          expect(res.status).toBe(200);
          streaks.push(res.body.run.streak);
          bonusDays.push(res.body.run.rewards.streak?.day ?? null);
          runIds.push(res.body.run.id);
          expect((await p.today()).streak).toBe(day);
          ctx.clock.t += DAY;
        }
        expect(streaks).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        expect(bonusDays).toEqual([null, null, 3, null, null, null, 7, null]);
        // The day-3 bonus is what the rules say, and what it pays in Bait and Essence is in the ledger once.
        const bonus3 = RULES.dungeon.streak.bonuses.find((b) => b.day === 3);
        const third = (await p.replay(runIds[2] as string)).body.summary.rewards.streak;
        expect(third).toMatchObject({
          day: 3,
          bait: bonus3?.bait,
          essence: bonus3?.essence,
          parts: bonus3 !== undefined && bonus3.scrap > 0 ? { scrap: bonus3.scrap } : {},
        });
        const streakRows = dungeonLedger(ctx, p.id).filter((l) =>
          l.idempotency_key.includes(':streak:'),
        );
        const paying = RULES.dungeon.streak.bonuses.reduce(
          (n, b) => n + (b.bait > 0 ? 1 : 0) + (b.essence > 0 ? 1 : 0),
          0,
        );
        // Day 3 and day 7 of the first cycle were paid; day 3 of the second (day 10) is not reached yet.
        expect(streakRows).toHaveLength(paying);

        // Miss two days: the streak shows 0, and the next run starts it again. The depth is kept.
        const depth = progressOf(ctx, p.id)?.depth ?? 0;
        ctx.clock.t += 2 * DAY;
        expect((await p.today()).streak).toBe(0);
        const back = await p.run();
        expect(back.body.run.streak).toBe(1);
        expect(back.body.run.depth).toBe(depth);
      },
      opts(),
    );
  });

  it('makes depth 7 a landmark: a full clear pays extra and the gear drop is certain', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        setProgress(ctx, p.id, { depth: 7 });
        expect((await p.today()).landmark).toBe(true);
        const res = await p.run();
        const run = res.body.run;
        expect(run).toMatchObject({ depth: 7, cleared: true, landmark: true, newDepth: 8 });
        expect(run.rewards.landmark).toBe(true);
        expect(run.rewards.gear.length + run.rewards.converted.length).toBe(1);
        expect(run.rewards.parts.glimmer).toBeGreaterThanOrEqual(RULES.dungeon.landmark.glimmer);
        const item = run.rewards.gear[0];
        expect(item).toBeDefined();
        expect(
          rows<{ source: string }>(
            ctx.sql,
            'SELECT source FROM gear_items WHERE id = ?',
            item?.id ?? '',
          )[0]?.source,
        ).toBe('dungeon');
        expect((await p.today()).landmark).toBe(false); // depth 8
      },
      opts(),
    );
  });

  it('names the fixed room boss of a landmark depth in today, in content order, and fights it', async () => {
    const bosses = dungeonContent.foes.filter((f) => f.kind === 'boss').map((f) => f.id);
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const every = RULES.dungeon.landmarkEvery;
        for (const [k, depth] of [
          [1, every],
          [2, 2 * every],
          [bosses.length + 1, (bosses.length + 1) * every],
        ] as const) {
          setProgress(ctx, p.id, { depth });
          const today = await p.today();
          expect(today.landmark).toBe(true);
          expect(today.landmarkBoss).toEqual({ depth, foeId: bosses[(k - 1) % bosses.length] });
        }
        for (const depth of [1, every - 1, every + 1]) {
          setProgress(ctx, p.id, { depth });
          expect((await p.today()).landmarkBoss).toBeNull();
        }
        // The run at the landmark fights that boss in the boss room, whatever the seed drew.
        setProgress(ctx, p.id, { depth: 2 * every });
        const run = (await p.run()).body.run;
        expect(run.depth).toBe(2 * every);
        expect(run.rooms.map((r) => r.kind)).toEqual(['foe', 'foe', 'boss']);
        expect(run.rooms[2]?.foe.id).toBe(bosses[1]);
        const stored = rows<{ input_json: string }>(
          ctx.sql,
          'SELECT input_json FROM dungeon_runs WHERE id = ?',
          run.id,
        )[0];
        const input = JSON.parse(stored?.input_json ?? '{}') as {
          rooms: { foe: { id: string } }[];
        };
        expect(input.rooms[2]?.foe.id).toBe(bosses[1]);
      },
      opts(),
    );
  });

  it('drops a gear item when the bag is full as its parts, never losing the drop', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        setProgress(ctx, p.id, { depth: 7 });
        for (let i = 0; i < RULES.gear.inventoryCap; i++) {
          giveItem(ctx.sql, p.id, 'trail-cap', { seed: `bag-${String(i)}`, now: ctx.clock.t });
        }
        const run = (await p.run()).body.run;
        expect(run.rewards.gear).toEqual([]);
        expect(run.rewards.converted).toHaveLength(1);
        expect(count(ctx.sql, 'gear_items', `user_id = '${p.id}'`)).toBe(RULES.gear.inventoryCap);
      },
      opts(),
    );
  });
});

describe('the seed', () => {
  it('is drawn from the live rng at the moment of the run, in the same transaction as the result', async () => {
    const rng = counting('the-seed');
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        await p.today(); // the day's modifier seed: 4 draws
        const before = rng.drawn();
        expect(before).toBe(4);
        await p.run();
        // The run seed is the next 4 draws: 128 bits, as hex, fresh from the stream.
        const replica = createSeededRng('the-seed');
        for (let i = 0; i < before; i++) replica.nextU32();
        const expected = drawSeed(replica);
        expect(storedRuns(ctx, p.id)[0]?.seed).toBe(expected);
        expect(expected).toMatch(/^[0-9a-f]{32}$/);
        expect(rng.drawn()).toBe(8);
      },
      { dungeonRng: rng, gearRng: createSeededRng('the-seed-gear') },
    );
  });

  it('is not derivable from anything a client sees before the run, and is never sent', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await dungeonPlayer(ctx, 1, STRONG);
        const b = await dungeonPlayer(ctx, 2, STRONG);
        // Everything the client can read before it runs: today (twice), the collection and the gear view.
        const seen = [
          JSON.stringify(await a.today()),
          JSON.stringify((await a.call('GET', '/api/state')).body),
          JSON.stringify((await a.call('GET', '/api/gear')).body),
          JSON.stringify(await b.today()),
        ].join('\n');
        const daySeeds = rows<{ modifier_seed: string }>(
          ctx.sql,
          'SELECT modifier_seed FROM dungeon_days',
        ).map((r) => r.modifier_seed);
        const ra = await a.run();
        const rb = await b.run();
        const seeds = storedRuns(ctx).map((r) => r.seed);
        expect(seeds).toHaveLength(2);
        // Two players on the same day get different seeds, and neither is the day's modifier seed.
        expect(new Set([...seeds, ...daySeeds]).size).toBe(3);
        for (const seed of seeds) {
          expect(seen).not.toContain(seed);
          // Not after the run either: no response carries a seed.
          for (const body of [
            JSON.stringify(ra.body),
            JSON.stringify(rb.body),
            JSON.stringify((await a.replay(ra.body.run.id)).body),
            JSON.stringify(await a.today()),
          ]) {
            expect(body).not.toContain(seed);
            expect(body).not.toContain('seed');
          }
        }
        for (const seed of daySeeds) expect(seen).not.toContain(`"${seed}"`);
        // The modifiers shown before are the day's, which come from the other seed only.
        expect(ra.body.run.rooms.map((r) => r.modifier.id)).toEqual(
          (await a.today()).modifiers.map((m) => m.id),
        );
      },
      opts(),
    );
  });

  it('gives different foes to different runs at the same depth', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const lineups = new Set<string>();
        for (let n = 1; n <= 8; n++) {
          const p = await dungeonPlayer(ctx, n, STRONG);
          const run = (await p.run()).body.run;
          lineups.add(run.rooms.map((r) => r.foe.id).join(','));
        }
        expect(lineups.size).toBeGreaterThan(3);
      },
      opts(),
    );
  });
});

describe('GET /api/dungeon/run/:id', () => {
  it('replays exactly: the stored run simulates to the same events', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const run = (await p.run()).body.run;
        const stored = storedRuns(ctx, p.id)[0] as StoredRun;
        const input = JSON.parse(stored.input_json as string) as DungeonRunInput;
        const result = JSON.parse(stored.result_json as string) as DungeonRunResult;
        // Re-simulating the stored input from the stored seed gives the stored result, bit for bit.
        expect(simulateDungeon(input, stored.seed)).toEqual(result);
        const replay = await p.replay(run.id);
        expect(replay.status).toBe(200);
        expect(replay.body.summary).toEqual(run);
        expect(replay.body.rooms.map((r) => r.events)).toEqual(
          result.rooms.map((r) => r.result.events),
        );
        expect(replay.body.rooms.map((r) => r.cleared)).toEqual(result.rooms.map((r) => r.cleared));
        expect(replay.body.rooms.map((r) => r.hpStart)).toEqual(result.rooms.map((r) => r.hpStart));
        // HP carries between rooms.
        for (let i = 1; i < result.rooms.length; i++) {
          expect(result.rooms[i]?.hpStart).toEqual(result.rooms[i - 1]?.result.hpEnd);
        }
        expect(replay.body.row.map((r) => r.position)).toEqual([0, 1, 2]);
        expect(replay.body.row.map((r) => r.id)).toEqual(p.creatureIds);
        expect(JSON.stringify(replay.body)).not.toContain('formation');
        // Names for describeEvent come with it.
        expect(replay.body.rooms[0]?.names.boss).toBe(replay.body.rooms[0]?.foe.name);
        expect(replay.body.rooms[0]?.names.players).toEqual({ p1: p.name });
        // Two reads are the same.
        expect((await p.replay(run.id)).body).toEqual(replay.body);
      },
      opts(),
    );
  });

  it('is for the owner only, with the same answer as for a run that does not exist', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const other = await dungeonPlayer(ctx, 2, STRONG);
        const run = (await p.run()).body.run;
        const theirs = await other.replay(run.id);
        const missing = await other.replay('00000000-0000-4000-8000-000000000000');
        expect(theirs.status).toBe(404);
        expect(theirs.body).toEqual({ error: 'not_found' });
        expect(missing).toEqual(theirs);
        expect((await p.call('GET', '/api/dungeon/run/not-a-uuid')).status).toBe(400);
      },
      opts(),
    );
  });

  it('keeps the summary but drops the events once a run is past its retention', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const run = (await p.run()).body.run;
        ctx.clock.t += 91 * DAY;
        ctx.core.dungeon.prune();
        const stored = storedRuns(ctx, p.id)[0];
        expect(stored?.input_json).toBeNull();
        expect(stored?.result_json).toBeNull();
        expect(JSON.parse(stored?.summary_json ?? '{}')).toEqual(run);
        expect((await p.replay(run.id)).status).toBe(404);
        expect(count(ctx.sql, 'dungeon_days')).toBe(0);
        // The key still replays the summary.
        expect(count(ctx.sql, 'dungeon_runs')).toBe(1);
      },
      opts(),
    );
  });
});

describe('gear in the dungeon', () => {
  const give = (
    ctx: CoreContext,
    userId: string,
    baseId: string,
    seed: string,
    lines?: [string, number][],
  ): string =>
    giveItem(ctx.sql, userId, baseId, {
      rarity: 'rare',
      level: 5,
      seed,
      now: ctx.clock.t,
      ...(lines === undefined ? {} : { lines }),
    });

  it('folds the worn item into the slot stats, as in a raid', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const geared = await dungeonPlayer(ctx, 1, { level: 10 });
        const item = give(ctx, geared.id, 'trail-cap', 'fold');
        const equip = await geared.call('POST', `/api/gear/${item}/equip`, {
          creatureId: geared.creatureIds[0],
        });
        expect(equip.status).toBe(200);
        // Read what the collection says the creature has with the gear: the run uses exactly that.
        const state = (await geared.call('GET', '/api/state')).body as {
          creatures: { id: string; stats: { atk: number }; statsWithGear: { atk: number } }[];
        };
        const first = state.creatures.find((c) => c.id === geared.creatureIds[0]);
        expect(first?.statsWithGear.atk).toBeGreaterThan(first?.stats.atk ?? 0);
        const run = (await geared.run()).body.run;
        const stored = storedRuns(ctx, geared.id)[0] as StoredRun;
        const input = JSON.parse(stored.input_json as string) as DungeonRunInput;
        const slot = input.team.find((s) => s.id === geared.creatureIds[0]);
        expect(slot?.stats?.atk).toBe(first?.statsWithGear.atk);
        expect(run.cleared).toBeDefined();
      },
      opts(),
    );
  });

  it('is not changed by what happens to the gear afterwards', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const item = give(ctx, p.id, 'trail-cap', 'later');
        await p.call('POST', `/api/gear/${item}/equip`, { creatureId: p.creatureIds[0] });
        const run = (await p.run()).body.run;
        const stored = storedRuns(ctx, p.id)[0] as StoredRun;
        const replay = (await p.replay(run.id)).body;
        const input = stored.input_json;
        const result = stored.result_json;
        // Take it off, put another on, then dismantle it.
        await p.call('POST', `/api/gear/${item}/equip`, { creatureId: null });
        const other = give(ctx, p.id, 'kelp-cap', 'other');
        await p.call('POST', `/api/gear/${other}/equip`, { creatureId: p.creatureIds[0] });
        expect(
          (await p.call('POST', `/api/gear/${item}/dismantle`, { idempotencyKey: newKey() }))
            .status,
        ).toBe(200);
        // The stored run, its replay and the summary are exactly what they were.
        const after = storedRuns(ctx, p.id)[0] as StoredRun;
        expect(after.input_json).toBe(input);
        expect(after.result_json).toBe(result);
        expect((await p.replay(run.id)).body).toEqual(replay);
        expect(
          simulateDungeon(JSON.parse(after.input_json as string) as DungeonRunInput, after.seed),
        ).toEqual(JSON.parse(result as string));
      },
      opts(),
    );
  });
});

describe('the modifier sheet and the rest of gear in the dungeon', () => {
  it('stores the sheet its gear fills on the slot and the Scarf rest in the run input', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, { level: 10 });
        const [a, b] = p.creatureIds as [string, string, string];
        const hat = giveItem(ctx.sql, p.id, 'trail-cap', {
          rarity: 'rare',
          level: 5,
          lines: [
            ['guards-shadow', 1],
            ['first-pounce', 1],
          ],
          now: ctx.clock.t,
        });
        const scarf = giveItem(ctx.sql, p.id, 'patch-scarf', {
          rarity: 'rare',
          level: 5,
          lines: [
            ['between-room-rest', 2],
            ['area-ward', 2],
          ],
          now: ctx.clock.t,
        });
        await p.call('POST', `/api/gear/${hat}/equip`, { creatureId: a });
        await p.call('POST', `/api/gear/${scarf}/equip`, { creatureId: b });
        await p.run();
        const input = JSON.parse(storedRuns(ctx, p.id)[0]?.input_json ?? '{}') as DungeonRunInput;
        const slotA = input.team.find((x) => x.id === a);
        const slotB = input.team.find((x) => x.id === b);
        expect(slotA?.mods).toEqual({ besideRoleBp: { guard: 700 }, firstHitBp: 1_400 });
        expect(slotB?.mods).toEqual({ areaBp: 700 });
        // Tier III between-room rest is +4% of max HP.
        expect(input.rest).toEqual({ [b]: 400 });
        // The third creature wears nothing: no sheet, no rest.
        const third = input.team.find((x) => x.id !== a && x.id !== b);
        expect(third?.mods).toBeUndefined();
      },
      opts(),
    );
  });

  it('a team without gear stores neither', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        await p.run();
        const input = JSON.parse(storedRuns(ctx, p.id)[0]?.input_json ?? '{}') as DungeonRunInput;
        expect('rest' in input).toBe(false);
        expect(input.team.every((x) => x.mods === undefined)).toBe(true);
      },
      opts(),
    );
  });
});

describe('abilities', () => {
  it('puts every unlocked creature ability into the run at its default round, with no basic ability', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const [a, b, c] = p.creatureIds as [string, string, string];
        // A deep run, so that the rooms last long enough for the default rounds to come.
        setProgress(ctx, p.id, { depth: 30 });
        const res = await p.run();
        expect(res.status).toBe(200);
        const input = JSON.parse(storedRuns(ctx, p.id)[0]?.input_json ?? '{}') as DungeonRunInput;
        // All three of the level 30 creatures have an unlocked ability, and none has a chosen round.
        expect(input.abilities.map((x) => x.creatureId)).toEqual([a, b, c]);
        expect(input.abilities.every((x) => x.fireAtRound === undefined)).toBe(true);
        expect(input.abilities.some((x) => x.key === 'p1:basic')).toBe(false);
        const replay = (await p.replay(res.body.run.id)).body;
        const fired = replay.rooms.flatMap((room) => room.events.filter((e) => e.t === 'ability'));
        expect(fired.length).toBeGreaterThan(0);
      },
      opts(),
    );
  });

  it('leaves a creature below the unlock level without an ability', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, { level: 5 });
        const ok = await p.run();
        expect(ok.status).toBe(200);
        const input = JSON.parse(storedRuns(ctx, p.id)[0]?.input_json ?? '{}') as DungeonRunInput;
        expect(input.abilities).toEqual([]);
      },
      opts(),
    );
  });
});

describe('analytics', () => {
  it('logs one dungeon_run and one dungeon_reward per run, with content ids and numbers only', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const body = p.body();
        const res = await p.call('POST', '/api/dungeon/run', body);
        expect(res.status).toBe(200);
        const runs = events(ctx, 'dungeon_run');
        expect(runs).toHaveLength(1);
        expect(runs[0]).toEqual({
          depth: 1,
          attempt: 1,
          roomsCleared: 3,
          cleared: true,
          landmark: false,
          modifiers: (res.body['run'] as { rooms: { modifier: { id: string } }[] }).rooms.map(
            (r) => r.modifier.id,
          ),
          team: [
            { species: 'tidewing', role: 'setter' },
            { species: 'pyrelynx', role: 'payoff' },
            { species: 'thornbuck', role: 'guard' },
          ],
          gear: 0,
        });
        const rewards = events(ctx, 'dungeon_reward');
        expect(rewards).toHaveLength(1);
        expect(rewards[0]).toMatchObject({
          depth: 1,
          landmark: false,
          streakBonusDay: 0,
          bait: RULES.dungeon.perRoom.reduce((n, r) => n + r.bait, 0),
        });
        // The run's actor is the hashed player, never the id.
        const actor = rows<{ actor_hash: string | null }>(
          ctx.sql,
          "SELECT actor_hash FROM analytics_events WHERE kind = 'dungeon_run'",
        )[0]?.actor_hash;
        expect(actor).toMatch(/^[0-9a-f]{32}$/);
        // A retry logs nothing more; a refused run logs nothing.
        await p.call('POST', '/api/dungeon/run', body);
        await p.run();
        expect(events(ctx, 'dungeon_run')).toHaveLength(1);
        expect(events(ctx, 'dungeon_reward')).toHaveLength(1);
      },
      opts(),
    );
  });

  it('counts how many of the team wear gear', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        for (const [i, id] of p.creatureIds.slice(0, 2).entries()) {
          const item = giveItem(ctx.sql, p.id, 'trail-cap', {
            seed: `w${String(i)}`,
            now: ctx.clock.t,
          });
          await p.call('POST', `/api/gear/${item}/equip`, { creatureId: id });
        }
        await p.run();
        expect(events(ctx, 'dungeon_run')[0]?.['gear']).toBe(2);
      },
      opts(),
    );
  });
});

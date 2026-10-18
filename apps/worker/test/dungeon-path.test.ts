import { dungeonPathMigration } from '../src/dungeon-path-migration';
import {
  RULES,
  createSeededRng,
  dungeonContent,
  dungeonEvent,
  dungeonExperience,
  dungeonKeepsakes,
  dungeonMapValid,
  generateDungeonMap,
  keptOnDefeat,
  landmarkBossId,
  nodeLoot,
  type DungeonMapView,
  type Rng,
} from '@creatures/game';
import {
  liveFightRules,
  simulateDungeon,
  type DungeonRoomResult,
  type DungeonRunInput,
} from '@creatures/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { giveItem } from './gear-helpers';
import { ACT_ANSWER_RETENTION_MS } from '../src/dungeon';
import type { RunState } from '../src/dungeon-state';
import type { DungeonRunState, DungeonStepLog } from '../src/dungeon-types';
import { drawSeed, slotFor } from '../src/raid-resolve';
import { loadCreatures } from '../src/raid-teams';
import {
  deadlyFoes,
  dungeonPlayer,
  easyFoes,
  followRoute,
  newKey,
  routeThrough,
  withDeadlyFoes,
  type CampAct,
  type DungeonPlayer,
  type Policy,
} from './dungeon-helpers';
import {
  LATEST_SCHEMA_VERSION,
  runCore,
  undoDungeonPathsMigration,
  type CoreContext,
} from './helpers';
import { count, nextGuild, rows } from './raid-helpers';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** 14:00 in Helsinki on 2027-01-15, after the daily reset: the game day is the 15th. */
const AFTER_RESET = Date.parse('2027-01-15T12:00:00Z');

/** Foes any team beats, unless a test asks for deadly ones (the tuned numbers move with the simulator). */
let restore: () => void = () => undefined;
beforeEach(() => {
  restore = easyFoes();
});
afterEach(() => {
  restore();
});

const opts = (seed = 'path-tests') => ({
  dungeonRng: createSeededRng(seed),
  gearRng: createSeededRng(`${seed}:gear`),
});

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

const STRONG = { level: 30, species: ['tidewing', 'pyrelynx', 'thornbuck'] };
const FOUR = { level: 30, creatures: 4, species: ['tidewing', 'pyrelynx', 'thornbuck', 'voltaro'] };

const events = (ctx: CoreContext, kind: string): Record<string, unknown>[] =>
  rows<{ props_json: string }>(
    ctx.sql,
    'SELECT props_json FROM analytics_events WHERE kind = ? ORDER BY id',
    kind,
  ).map((r) => JSON.parse(r.props_json) as Record<string, unknown>);

const dungeonLedger = (ctx: CoreContext, userId: string) =>
  rows<{ currency: string; amount: number; idempotency_key: string }>(
    ctx.sql,
    "SELECT currency, amount, idempotency_key FROM ledger WHERE user_id = ? AND source = 'dungeon' ORDER BY id",
    userId,
  );

const runRow = (ctx: CoreContext, runId: string) =>
  rows<{
    status: string;
    outcome: string | null;
    cleared: number;
    rooms_cleared: number;
    state_json: string;
    summary_json: string;
    seed: string;
  }>(
    ctx.sql,
    'SELECT status, outcome, cleared, rooms_cleared, state_json, summary_json, seed FROM dungeon_runs WHERE id = ?',
    runId,
  )[0];

/** The stored state of a run. */
const stored = (ctx: CoreContext, runId: string): RunState =>
  JSON.parse(runRow(ctx, runId)?.state_json ?? '{}') as RunState;

/** Changes the stored state of an open run (a test setting up a situation the dice would take long to make). */
function patchState(ctx: CoreContext, runId: string, change: (st: RunState) => void): void {
  const st = stored(ctx, runId);
  change(st);
  ctx.sql.exec('UPDATE dungeon_runs SET state_json = ? WHERE id = ?', JSON.stringify(st), runId);
}

const progressOf = (ctx: CoreContext, userId: string) =>
  rows<{ depth: number; streak: number; last_day: string | null; runs: number; clears: number }>(
    ctx.sql,
    'SELECT depth, streak, last_day, runs, clears FROM dungeon_progress WHERE user_id = ?',
    userId,
  )[0];

const fightSteps = (ctx: CoreContext, runId: string) =>
  rows<{ step: number; node: string; seed: string; input_json: string; result_json: string }>(
    ctx.sql,
    'SELECT step, node, seed, input_json, result_json FROM dungeon_steps WHERE run_id = ? AND node IS NOT NULL ORDER BY step',
    runId,
  );

const mapOf = (state: DungeonRunState): DungeonMapView => state.map;
/** Starts a run for `p` and returns its state. */
async function begin(p: DungeonPlayer, overrides: Parameters<DungeonPlayer['start']>[0] = {}) {
  const res = await p.start(overrides);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.state;
}

/** Plays a started run along `route` (then the first room there is) until `stop` says so, and returns the state it stands in. */
async function walk(
  p: DungeonPlayer,
  state: DungeonRunState,
  route: readonly string[],
  stop: (s: DungeonRunState) => boolean,
  extra: Policy = {},
): Promise<DungeonRunState> {
  const res = await p.play(state, { pick: followRoute(route), stopWhen: stop, ...extra });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.state as DungeonRunState;
}

/** Puts easy foes back after a test made them deadly mid-run. */
function easyAgain(): void {
  restore();
  restore = easyFoes();
}

// --- Migration 34 ---

describe('migration 34', () => {
  it('runs on a staging database that ran it as 32 or 33: nothing twice, and the skipped placed_by and lounge tables are added', async () => {
    await runCore(nextGuild(), ({ sql }) => {
      const columns = (table: string) =>
        rows<{ name: string }>(sql, `SELECT name FROM pragma_table_info('${table}')`).map(
          (r) => r.name,
        );
      // As staging was: the dungeon's columns and table are there, the raid's placed_by and the lounge's
      // tables are not.
      sql.exec('ALTER TABLE raid_placements DROP COLUMN placed_by');
      sql.exec('DROP TABLE lounge_instances');
      sql.exec('DROP TABLE lounge_message');
      expect(columns('raid_placements')).not.toContain('placed_by');
      expect(() => {
        dungeonPathMigration(sql);
      }).not.toThrow();
      expect(columns('raid_placements')).toContain('placed_by');
      expect(columns('lounge_message')).toContain('message_id');
      expect(columns('lounge_instances')).toContain('instance_id');
      expect(columns('dungeon_runs')).toEqual(
        expect.arrayContaining(['status', 'state_json', 'outcome']),
      );
      // Running it again changes nothing.
      expect(() => {
        dungeonPathMigration(sql);
      }).not.toThrow();
    });
  });

  it('adds the run status and state, the day’s map and the steps table, and can be replayed', async () => {
    await runCore(nextGuild(), ({ sql }) => {
      const columns = (table: string) =>
        rows<{ name: string }>(sql, `SELECT name FROM pragma_table_info('${table}')`).map(
          (r) => r.name,
        );
      expect(columns('dungeon_runs')).toEqual(
        expect.arrayContaining(['status', 'state_json', 'outcome']),
      );
      expect(columns('dungeon_days')).toContain('map_json');
      expect(columns('dungeon_steps')).toEqual([
        'run_id',
        'step',
        'idempotency_key',
        'act_json',
        'node',
        'seed',
        'input_json',
        'result_json',
        'created_at',
      ]);
      expect(
        rows<{ version: number }>(sql, 'SELECT version FROM schema_version WHERE version = 34'),
      ).toHaveLength(1);
      // A run is active or done, and ends cleared, home or lost; a step is stored once per run and key.
      const insert = (status: string, outcome: string | null, id: string) =>
        sql.exec(
          `INSERT INTO dungeon_runs (id, user_id, day, attempt, idempotency_key, fingerprint, depth, seed,
             cleared, rooms_cleared, summary_json, rewards_json, created_at, status, outcome)
           VALUES (?, 'u', '2027-01-15', 1, ?, 'f', 1, '', 0, 0, '{}', '{}', 1, ?, ?)`,
          id,
          `k-${id}`,
          status,
          outcome,
        );
      expect(() => insert('paused', null, 'a')).toThrow();
      expect(() => insert('done', 'won', 'b')).toThrow();
      sql.exec("DELETE FROM dungeon_runs WHERE user_id = 'u'");
      const step = (n: number, key: string) =>
        sql.exec(
          "INSERT INTO dungeon_steps (run_id, step, idempotency_key, act_json, created_at) VALUES ('r', ?, ?, '{}', 1)",
          n,
          key,
        );
      step(0, 'k0');
      expect(() => step(0, 'k1')).toThrow();
      expect(() => step(1, 'k0')).toThrow();
      return Promise.resolve();
    });
  });

  it('keeps the old three-room runs: their summary, their last team and their replay still work', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        ctx.clock.t = AFTER_RESET;
        // A database from before the migration, with a run the old way (three rooms, played at once).
        undoDungeonPathsMigration(ctx.sql);
        expect(
          rows<{ v: number }>(ctx.sql, 'SELECT MAX(version) AS v FROM schema_version')[0]?.v,
        ).toBe(33);
        const team = loadCreatures(ctx.sql, p.id).map((c) => slotFor(c, 'p1'));
        const foes = dungeonContent.foes.filter((f) => f.kind === 'foe').slice(0, 2);
        const boss = dungeonContent.foes.find((f) => f.kind === 'boss');
        const modifier = dungeonContent.modifiers[0];
        if (boss === undefined || modifier === undefined) throw new Error('no content');
        const input: DungeonRunInput = {
          team,
          player: 'p1',
          rooms: [...foes, boss].map((foe, index) => ({
            index,
            foe,
            modifier,
            hp: 20,
            atk: 5,
          })),
          abilities: [],
          luck: { ...RULES.combat.luck },
          rules: liveFightRules(),
          depth: 1,
        };
        const result = simulateDungeon(input, 'an-old-seed');
        expect(result.cleared).toBe(true);
        const summary = {
          id: crypto.randomUUID(),
          day: '2027-01-15',
          attempt: 1,
          depth: 1,
          newDepth: 2,
          cleared: true,
          roomsCleared: 3,
          landmark: false,
          streak: 1,
          createdAt: ctx.clock.t,
          team: team.map((s) => ({ id: s.id })),
          rooms: [],
          rewards: {
            bait: 3,
            essence: 1,
            parts: {},
            gear: [],
            converted: [],
            landmark: false,
            streak: null,
          },
        };
        ctx.sql.exec(
          `INSERT INTO dungeon_runs (id, user_id, day, attempt, idempotency_key, fingerprint, depth, seed,
             cleared, rooms_cleared, input_json, result_json, summary_json, rewards_json, created_at)
           VALUES (?, ?, '2027-01-15', 1, 'old-run-key', 'f', 1, 'an-old-seed', 1, 3, ?, ?, ?, '{}', ?)`,
          summary.id,
          p.id,
          JSON.stringify(input),
          JSON.stringify(result),
          JSON.stringify(summary),
          ctx.clock.t,
        );
        ctx.sql.exec(
          "INSERT INTO dungeon_progress (user_id, depth, streak, last_day, first_day, runs, clears) VALUES (?, 2, 1, '2027-01-15', '2027-01-15', 1, 1)",
          p.id,
        );
        ctx.core.migrate();
        expect(
          rows<{ v: number }>(ctx.sql, 'SELECT MAX(version) AS v FROM schema_version')[0]?.v,
        ).toBe(LATEST_SCHEMA_VERSION);
        // The old row is a finished run with no state and no outcome.
        expect(runRow(ctx, summary.id)).toMatchObject({ status: 'done', outcome: null });
        expect(runRow(ctx, summary.id)?.state_json).toBeNull();
        // Today shows it as the day's last run, the day is spent, and the team is remembered.
        const today = await p.today();
        expect(today.last).toEqual(summary);
        expect(today).toMatchObject({ canRun: false, blocked: 'already_run', active: null });
        expect(today.lastTeam).toEqual(team.map((s) => s.id));
        // Its replay is still the three rooms, with no map fields.
        const replay = await p.replay(summary.id);
        expect(replay.status).toBe(200);
        expect(replay.body.rooms.map((r) => r.kind)).toEqual(['foe', 'foe', 'boss']);
        expect(replay.body.rooms.every((r) => r.node === undefined && r.row === undefined)).toBe(
          true,
        );
        expect(replay.body.summary).toEqual(summary);
        // The key of an old run is not a start the new way.
        const reuse = await p.call('POST', '/api/dungeon/start', {
          team: p.creatureIds,
          idempotencyKey: 'old-run-key',
        });
        expect(reuse.status).toBe(409);
        // The next day a run starts the new way.
        ctx.clock.t += DAY;
        expect((await p.run()).status).toBe(200);
      },
      opts(),
    );
  });
});

// --- The day's map ---

describe('the day’s map in GET /api/dungeon/today', () => {
  it('is drawn from the day’s seed, stored, the same for everyone, and valid', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await dungeonPlayer(ctx, 1, STRONG);
        const b = await dungeonPlayer(ctx, 2, STRONG);
        const first = await a.today();
        expect(first.map.floors).toBe(RULES.dungeon.floors);
        expect(first.map.nodes.find((n) => n.floor === RULES.dungeon.campFloor)?.kind).toBe('camp');
        expect(first.map.nodes.find((n) => n.floor === RULES.dungeon.floors - 1)?.kind).toBe(
          'boss',
        );
        expect((await b.today()).map).toEqual(first.map);
        // The day's row holds the seed and the map, and the map is what that seed draws.
        const day = rows<{ modifier_seed: string; map_json: string }>(
          ctx.sql,
          'SELECT modifier_seed, map_json FROM dungeon_days',
        );
        expect(day).toHaveLength(1);
        const map: unknown = JSON.parse(day[0]?.map_json ?? 'null');
        expect(dungeonMapValid(map)).toBe(true);
        expect(map).toEqual(
          generateDungeonMap(createSeededRng(`${day[0]?.modifier_seed}:map`), undefined, {
            doors: true,
          }),
        );
        // The seed is never sent, and today carries no separate modifier list: the map's rooms do.
        expect(JSON.stringify(first)).not.toContain(day[0]?.modifier_seed ?? 'x');
        expect(first).not.toHaveProperty('modifiers');
        // A new day is a new map.
        ctx.clock.t += DAY;
        expect(rows(ctx.sql, 'SELECT day FROM dungeon_days')).toHaveLength(1);
        await a.today();
        expect(rows(ctx.sql, 'SELECT day FROM dungeon_days')).toHaveLength(2);
      },
      opts(),
    );
  });

  it('draws a stored map that does not hold up again from the same seed, and draws nothing else', async () => {
    const rng = counting('damaged-map');
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const first = await p.today();
        const drawn = rng.drawn();
        ctx.sql.exec('UPDATE dungeon_days SET map_json = \'{"floors":1,"nodes":[]}\'');
        expect((await p.today()).map).toEqual(first.map);
        ctx.sql.exec('UPDATE dungeon_days SET map_json = NULL');
        expect((await p.today()).map).toEqual(first.map);
        expect(rng.drawn()).toBe(drawn);
        expect(
          dungeonMapValid(
            JSON.parse(
              rows<{ m: string }>(ctx.sql, 'SELECT map_json AS m FROM dungeon_days')[0]?.m ?? '',
            ),
          ),
        ).toBe(true);
      },
      { dungeonRng: rng },
    );
  });

  it('shows the foes at the player’s depth, and the landmark boss at a landmark depth', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const shallow = await dungeonPlayer(ctx, 1, STRONG);
        const deep = await dungeonPlayer(ctx, 2, STRONG);
        const every = RULES.dungeon.landmarkEvery;
        ctx.sql.exec(
          'INSERT INTO dungeon_progress (user_id, depth, first_day) VALUES (?, ?, ?)',
          deep.id,
          every,
          '2027-01-01',
        );
        const a = await shallow.today();
        const b = await deep.today();
        const foe = (t: typeof a) => t.map.nodes.find((n) => n.kind === 'fight')?.foe;
        expect((foe(b)?.hpMax ?? 0) > (foe(a)?.hpMax ?? 0)).toBe(true);
        const bossOf = (t: typeof a) => t.map.nodes.find((n) => n.kind === 'boss')?.foe;
        expect(bossOf(b)?.id).toBe(landmarkBossId(every));
        expect(bossOf(a)?.kind).toBe('boss');
      },
      opts('depth-view'),
    );
  });
});

// --- Start ---

describe('POST /api/dungeon/start', () => {
  it('opens an active run before floor 0, with the row at full HP, and shows it in today', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        ctx.clock.t = AFTER_RESET;
        ctx.sql.exec(
          'INSERT INTO dungeon_drafts (user_id, team_json, updated_at) VALUES (?, ?, 1)',
          p.id,
          JSON.stringify(p.creatureIds),
        );
        const res = await p.start();
        expect(res.status).toBe(200);
        const state = res.body.state;
        expect(state).toMatchObject({
          day: '2027-01-15',
          attempt: 1,
          depth: 1,
          landmark: false,
          status: 'active',
          outcome: null,
          step: 0,
          at: null,
          path: [],
          pending: null,
          keepsakes: [],
          pack: { bait: 0, essence: 0, scrap: 0 },
          roomsCleared: 0,
          supply: false,
          lastEvent: null,
        });
        // It stands before floor 0: any room of floor 0 may be entered.
        expect(state.reachable).toEqual(
          state.map.nodes.filter((n) => n.floor === 0).map((n) => n.id),
        );
        expect(state.team.map((t) => t.id)).toEqual(p.creatureIds);
        for (const t of state.team) {
          expect(t.hp).toBe(t.hpMax);
          expect(t.hpMax).toBeGreaterThan(0);
          expect(t.treat).toBe(false);
        }
        // The map is today's, at the run's depth, and today shows the run as open.
        expect(state.map).toEqual(res.body.today.map);
        expect(res.body.today).toMatchObject({ canRun: false, attemptsToday: 1, active: state });
        const today = await p.today();
        expect(today.active).toEqual(state);
        expect(today.last).toBeNull(); // nothing has finished yet
        // The draft it came from is spent, and the run row is open with no seed of its own.
        expect(res.body.today.draftTeam).toBeNull();
        expect(runRow(ctx, state.id)).toMatchObject({ status: 'active', outcome: null, seed: '' });
        // No seed anywhere in what was sent.
        expect(JSON.stringify(res.body)).not.toContain('seed');
        // The progress is not touched until the run ends.
        expect(progressOf(ctx, p.id)).toBeUndefined();
      },
      opts(),
    );
  });

  it('refuses a second start while a run is open, whoever asks again and with whatever key', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const other = await dungeonPlayer(ctx, 2, STRONG);
        await begin(p);
        const again = await p.start();
        expect(again.status).toBe(409);
        expect(again.body).toEqual({ error: 'run_active' });
        expect(await p.today()).toMatchObject({ canRun: false, blocked: 'already_run' });
        expect(storedCount(ctx, p.id)).toBe(1);
        // Another player's run is their own.
        expect((await other.start()).status).toBe(200);
      },
      opts(),
    );
  });

  it('pays the treats with the start, marks them in the row, and refuses what cannot be paid', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const [a, b, c] = p.creatureIds as [string, string, string];
        // Nothing to pay with: the whole start is refused and nothing is stored.
        const broke = await p.start({ treats: [b] });
        expect(broke.status).toBe(409);
        expect(broke.body).toEqual({ error: 'insufficient_funds' });
        expect(storedCount(ctx, p.id)).toBe(0);
        ctx.core.credit({
          userId: p.id,
          currency: 'bait',
          amount: 500,
          source: 'test',
          idempotencyKey: 'bait-for-treats',
        });
        // A treat for a creature outside the team, or twice, is refused.
        expect((await p.start({ treats: ['00000000-0000-4000-8000-000000000000'] })).body).toEqual({
          error: 'invalid_treat',
        });
        expect((await p.start({ treats: [b, b] })).body).toEqual({ error: 'invalid_treat' });
        const res = await p.start({ treats: [b] });
        expect(res.status).toBe(200);
        const state = res.body.state;
        expect(state.team.map((t) => [t.id, t.treat])).toEqual([
          [a, false],
          [b, true],
          [c, false],
        ]);
        const spent = rows<{ idempotency_key: string; amount: number }>(
          ctx.sql,
          "SELECT idempotency_key, amount FROM ledger WHERE user_id = ? AND source = 'treat'",
          p.id,
        );
        expect(spent).toHaveLength(1);
        expect(spent[0]?.idempotency_key).toBe(`treat:dungeon:${state.id}`);
        expect(events(ctx, 'treat')).toHaveLength(1);
      },
      opts(),
    );
  });
});

function storedCount(ctx: CoreContext, userId: string): number {
  return count(ctx.sql, 'dungeon_runs', `user_id = '${userId}'`);
}

// --- Acts: what is refused ---

describe('POST /api/dungeon/act: what is refused', () => {
  it('refuses a body that is not the strict shape, and changes nothing', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const state = await begin(p);
        const good = {
          runId: state.id,
          step: 0,
          idempotencyKey: newKey(),
          act: { type: 'move', node: state.reachable[0] },
        };
        const bad: unknown[] = [
          { ...good, userId: p.id },
          { ...good, seed: 'abc' },
          { ...good, hp: 999 },
          { ...good, act: { ...good.act, seed: 'abc' } },
          { ...good, act: { type: 'move' } },
          { ...good, act: { type: 'move', node: '../etc' } },
          { ...good, act: { type: 'warp', node: 'f0l0' } },
          { ...good, act: { type: 'event', option: 2 } },
          { ...good, act: { type: 'event', option: '0' } },
          { ...good, act: { type: 'camp', choice: 'dance' } },
          { ...good, act: { type: 'camp', choice: 'rest', order: ['a', 'b', 'c'] } },
          { ...good, act: { type: 'camp', choice: 'rest', pack: { bait: 99 } } },
          { ...good, act: { type: 'home', now: true } },
          { ...good, step: -1 },
          { ...good, step: 1.5 },
          { ...good, runId: 'not-a-uuid' },
          { ...good, idempotencyKey: 'short' },
          { runId: good.runId, step: 0, idempotencyKey: good.idempotencyKey },
          [],
        ];
        for (const body of bad) {
          const res = await p.call('POST', '/api/dungeon/act', body);
          expect({ status: res.status, body: res.body }, JSON.stringify(body)).toEqual({
            status: 400,
            body: { error: 'invalid_body' },
          });
        }
        expect(count(ctx.sql, 'dungeon_steps')).toBe(0);
        expect(stored(ctx, state.id).step).toBe(0);
      },
      opts(),
    );
  });

  it('answers 404 for another player’s run and for one that does not exist, alike', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const other = await dungeonPlayer(ctx, 2, STRONG);
        const state = await begin(p);
        const move = { type: 'move', node: state.reachable[0] as string } as const;
        const theirs = await other.act(state, move);
        const missing = await other.act(
          { ...state, id: '00000000-0000-4000-8000-000000000000' },
          move,
        );
        expect(theirs.status).toBe(404);
        expect(theirs.body).toEqual({ error: 'not_found' });
        expect(missing).toEqual(theirs);
        expect(count(ctx.sql, 'dungeon_steps')).toBe(0);
        expect(stored(ctx, state.id).step).toBe(0);
      },
      opts(),
    );
  });

  it('refuses a step that is not the run’s step as stale_step, and a run that is over as the same', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const state = await begin(p);
        const move = { type: 'move', node: state.reachable[0] as string } as const;
        for (const step of [1, 7]) {
          const res = await p.act(state, move, undefined, step);
          expect({ status: res.status, error: res.body.error }).toEqual({
            status: 409,
            error: 'stale_step',
          });
        }
        expect(count(ctx.sql, 'dungeon_steps')).toBe(0);
        const done = await p.play(state);
        const run = done.body.run;
        expect(run).toBeDefined();
        // The run is over: any further act, even with the right step number, is stale.
        const late = await p.act({ ...state, step: 3 }, move);
        expect({ status: late.status, error: late.body.error }).toEqual({
          status: 409,
          error: 'stale_step',
        });
      },
      opts(),
    );
  });

  it('refuses an act that is not allowed now as invalid_act, and changes nothing', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const state = await begin(p);
        const invalid = async (s: DungeonRunState, a: Parameters<DungeonPlayer['act']>[1]) => {
          const res = await p.act(s, a);
          expect({ status: res.status, error: res.body.error }).toEqual({
            status: 400,
            error: 'invalid_act',
          });
          expect(count(ctx.sql, 'dungeon_steps')).toBe(steps);
          expect(stored(ctx, s.id).step).toBe(s.step);
        };
        const steps = 0;
        // A room that is not reachable from the entrance, or not on the map at all.
        const unreachable = state.map.nodes.find((n) => n.floor === 2)?.id as string;
        await invalid(state, { type: 'move', node: unreachable });
        await invalid(state, { type: 'move', node: 'f0l7' });
        await invalid(state, { type: 'move', node: 'f9l0' });
        // Nothing is waiting: no event, no camp choice, no heading home.
        await invalid(state, { type: 'event', option: 0 });
        await invalid(state, { type: 'camp', choice: 'rest' });
        await invalid(state, { type: 'home' });
      },
      opts(),
    );
  });
});

// --- Moves ---

describe('moving into a fight', () => {
  it('plays it whole on the server, stores the step with its seed, carries HP and fills the pack', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const state = await begin(p);
        const target = state.reachable[0] as string;
        const res = await p.act(state, { type: 'move', node: target });
        expect(res.status).toBe(200);
        const next = res.body.state;
        expect(next).toMatchObject({
          step: 1,
          at: target,
          path: [target],
          status: 'active',
          roomsCleared: 1,
        });
        // The room is the fight just played, in the replay shape.
        const room = res.body.room;
        expect(room).toMatchObject({ index: 0, node: target, cleared: true, kind: 'foe' });
        expect(room?.events.length).toBeGreaterThan(0);
        expect(room?.row?.map((r) => r.id)).toEqual(p.creatureIds);
        expect(room?.keepsakes).toBeUndefined();
        expect(room?.names.players).toEqual({ p1: p.name });
        // The pack holds the fight's loot (and no seed or stored detail is sent).
        expect(next.pack).toEqual(nodeLoot('fight'));
        expect(next.supply).toBe(true); // the first fight cleared earns the supply
        expect(JSON.stringify(res.body)).not.toContain('seed');
        // The HP the state shows is what the fight left, and it carries into the next fight.
        const st = stored(ctx, state.id);
        expect(st.hp).toEqual(Object.fromEntries(next.team.map((t) => [t.id, t.hp])));
        const [first] = fightSteps(ctx, state.id);
        expect(first?.node).toBe(target);
        expect(first?.seed).toMatch(/^[0-9a-f]{32}$/);
        // Reachable: the room's exits.
        expect(next.reachable).toEqual(state.map.nodes.find((n) => n.id === target)?.next);
        // The next fight starts where this one ended.
        const second = await p.act(next, { type: 'move', node: next.reachable[0] as string });
        expect(second.body.room?.hpStart).toEqual(
          Object.fromEntries(next.team.map((t) => [t.id, t.hp])),
        );
        expect(second.body.room?.index).toBe(1);
      },
      opts(),
    );
  });

  it('ends the run as a defeat when the fight is lost, keeping half the pack rounded up', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        ctx.clock.t = AFTER_RESET;
        const state = await begin(p);
        // Win two fights, then meet deadly foes.
        const mid = await walk(p, state, [], (s) => s.roomsCleared >= 2);
        expect(mid.status).toBe('active');
        const found = { ...mid.pack };
        expect(found.bait).toBeGreaterThan(0);
        deadlyFoes();
        const res = await p.act(mid, { type: 'move', node: mid.reachable[0] as string });
        easyAgain();
        expect(res.status).toBe(200);
        expect(res.body.state).toMatchObject({ status: 'done', outcome: 'defeat', reachable: [] });
        expect(res.body.room?.cleared).toBe(false);
        const summary = res.body.summary;
        expect(summary).toMatchObject({
          outcome: 'defeat',
          cleared: false,
          roomsCleared: 2,
          newDepth: 1,
        });
        const kept = keptOnDefeat(found);
        expect(summary?.pack).toEqual({ found, kept });
        expect(kept.bait).toBe(Math.ceil((found.bait * RULES.dungeon.defeatKeepBp) / 10_000));
        expect(summary?.rewards.bait).toBe(kept.bait);
        expect(summary?.rewards.essence).toBe(kept.essence);
        // A defeat on a player's first day offers the retry.
        expect(res.body.today).toMatchObject({ attemptsAllowed: 2, canRun: true });
        // Depth unchanged, the run counted, and the supply and experience are safe.
        expect(progressOf(ctx, p.id)).toMatchObject({ depth: 1, runs: 1, clears: 0, streak: 1 });
        expect(summary?.rewards.supplies).toHaveLength(1);
        expect(summary?.rewards.experience?.every((e) => e.gained > 0)).toBe(true);
        expect(dungeonLedger(ctx, p.id).find((l) => l.currency === 'bait')?.amount).toBe(kept.bait);
      },
      opts(),
    );
  });

  it('keeps nothing of the pack but the safe things when the first fight is lost', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const res = await withDeadlyFoes(() => p.run());
        expect(res.body.run).toMatchObject({ outcome: 'defeat', roomsCleared: 0 });
        expect(res.body.run.pack).toEqual({
          found: { bait: 0, essence: 0, scrap: 0 },
          kept: { bait: 0, essence: 0, scrap: 0 },
        });
        expect(res.body.run.rewards.supplies ?? []).toEqual([]);
        expect(dungeonLedger(ctx, p.id)).toEqual([]);
      },
      opts(),
    );
  });
});

describe('retrying an act', () => {
  it('returns what the first call answered, and draws and stores nothing more', async () => {
    const rng = counting('act-retry');
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const state = await begin(p);
        const key = newKey();
        const move = { type: 'move', node: state.reachable[0] as string } as const;
        const first = await p.act(state, move, key);
        expect(first.status).toBe(200);
        const drawn = rng.drawn();
        const stepsBefore = count(ctx.sql, 'dungeon_steps');
        for (let i = 0; i < 3; i++) {
          const again = await p.act(state, move, key);
          expect(again.status).toBe(200);
          expect(again.body).toEqual(first.body);
        }
        expect(rng.drawn()).toBe(drawn);
        expect(count(ctx.sql, 'dungeon_steps')).toBe(stepsBefore);
        // The run moved on in the meantime; the retry still answers the first call.
        const later = await p.act(first.body.state, {
          type: 'move',
          node: first.body.state.reachable[0] as string,
        });
        expect(later.status).toBe(200);
        expect((await p.act(state, move, key)).body).toEqual(first.body);
        // Another act, or another step, under the same key is a conflict.
        const other = state.reachable[1];
        if (other !== undefined) {
          const clash = await p.act(state, { type: 'move', node: other }, key);
          expect({ status: clash.status, error: clash.body.error }).toEqual({
            status: 409,
            error: 'key_conflict',
          });
        }
        const clash = await p.act(first.body.state, move, key);
        expect({ status: clash.status, error: clash.body.error }).toEqual({
          status: 409,
          error: 'key_conflict',
        });
        // A key the player used for something else is a conflict too.
        const spendKey = newKey();
        ctx.core.credit({
          userId: p.id,
          currency: 'bait',
          amount: 20,
          source: 'test',
          idempotencyKey: 'bait-act-key',
        });
        expect(
          ctx.core.spend({
            userId: p.id,
            currency: 'bait',
            amount: 1,
            purpose: 'treat',
            idempotencyKey: spendKey,
            apply: () => ({ ok: true }),
          }).status,
        ).toBe('ok');
        const used = await p.act(later.body.state, move, spendKey);
        expect(used.body).toEqual({ error: 'key_conflict' });
      },
      { dungeonRng: rng, gearRng: createSeededRng('act-retry-gear') },
    );
  });

  it("empties the run view in a step's stored answer after a short window: a late retry is stale, another request under the key still a conflict", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        ctx.clock.t = AFTER_RESET;
        const state = await begin(p);
        const key = newKey();
        const move = { type: 'move', node: state.reachable[0] as string } as const;
        const first = await p.act(state, move, key);
        expect(first.status).toBe(200);
        const stateOf = () =>
          rows<{ s: string | null }>(
            ctx.sql,
            "SELECT json_type(act_json, '$.state') AS s FROM dungeon_steps WHERE idempotency_key = ?",
            key,
          )[0]?.s;
        expect(stateOf()).toBe('object');
        // Within the window the prune keeps the answer, and a retry still gets it.
        ctx.clock.t += ACT_ANSWER_RETENTION_MS - 60_000;
        ctx.core.dungeon.prune();
        expect(stateOf()).toBe('object');
        const within = await p.act(state, move, key);
        expect(within.status).toBe(200);
        expect(within.body).toEqual(first.body);
        // Past it the state is gone, the act stays.
        ctx.clock.t += 3 * DAY;
        ctx.core.dungeon.prune();
        expect(stateOf()).toBeNull();
        expect(
          rows<{ a: string | null }>(
            ctx.sql,
            "SELECT json_extract(act_json, '$.act.node') AS a FROM dungeon_steps WHERE idempotency_key = ?",
            key,
          )[0]?.a,
        ).toBe(move.node);
        const late = await p.act(state, move, key);
        expect({ status: late.status, error: late.body.error }).toEqual({
          status: 409,
          error: 'stale_step',
        });
        const other = state.reachable[1];
        if (other !== undefined) {
          const clash = await p.act(state, { type: 'move', node: other }, key);
          expect({ status: clash.status, error: clash.body.error }).toEqual({
            status: 409,
            error: 'key_conflict',
          });
        }
      },
      opts(),
    );
  });

  it('pays the end of a run once, however often its last act is sent again', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const state = await begin(p);
        const done = await p.play(state);
        const last = done.body.steps?.at(-1);
        expect(last?.body.summary).toBeDefined();
        const ledger = dungeonLedger(ctx, p.id);
        const progress = progressOf(ctx, p.id);
        const lastStep = rows<{ step: number; idempotency_key: string; act_json: string }>(
          ctx.sql,
          'SELECT step, idempotency_key, act_json FROM dungeon_steps WHERE run_id = ? ORDER BY step DESC LIMIT 1',
          state.id,
        )[0];
        const act = (JSON.parse(lastStep?.act_json ?? '{}') as { act: unknown }).act;
        for (let i = 0; i < 3; i++) {
          const again = await p.call('POST', '/api/dungeon/act', {
            runId: state.id,
            step: lastStep?.step,
            idempotencyKey: lastStep?.idempotency_key,
            act,
          });
          expect(again.status).toBe(200);
          expect(again.body['summary']).toEqual(last?.body.summary);
          expect(again.body['state']).toEqual(last?.body.state);
        }
        expect(dungeonLedger(ctx, p.id)).toEqual(ledger);
        expect(progressOf(ctx, p.id)).toEqual(progress);
        expect(events(ctx, 'dungeon_run')).toHaveLength(1);
      },
      opts(),
    );
  });
});

// --- Elites, caches, mysteries ---

describe('an elite', () => {
  it('is a fiercer fight that gives a keepsake the next fights are fought with', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const state = await begin(p);
        const route = routeThrough(mapOf(state), (n) => n.kind === 'elite') as string[];
        expect(route).toBeDefined();
        const target = route.at(-1) as string;
        const after = await walk(p, state, route, (s) => s.at === target);
        expect(after.status).toBe('active');
        expect(after.at).toBe(target);
        // Its loot is the elite's, and one keepsake came with the clear.
        expect(after.keepsakes).toHaveLength(1);
        const fights = fightSteps(ctx, state.id);
        const eliteStep = fights.at(-1);
        expect(eliteStep?.node).toBe(target);
        const room = JSON.parse(eliteStep?.input_json ?? '{}') as { input: DungeonRunInput };
        expect(room.input.rooms[0]?.elite).toBe(true);
        const replay = (await p.replay(state.id)).body;
        const shown = replay.rooms.at(-1);
        expect(shown).toMatchObject({ elite: true, node: target });
        expect(shown?.foe.name).toBe(room.input.rooms[0]?.foe.name); // the client adds "Fierce"
        // The elite's foe is stronger than the same foe in a plain room: HP shown on the map has the boost.
        const node = state.map.nodes.find((n) => n.id === target);
        expect(node?.foe?.elite).toBe(true);
        // The keepsake folds into every later fight, and is named in its replay.
        const held = after.keepsakes[0]?.id as string;
        expect(dungeonKeepsakes.some((k) => k.id === held)).toBe(true);
        await walk(p, after, [], (s2) => s2.roomsCleared > after.roomsCleared);
        const later = (await p.replay(state.id)).body.rooms.at(-1);
        expect(later?.keepsakes?.map((k) => k.id)[0]).toBe(held);
      },
      opts(),
    );
  });

  it('gives nothing more when the run already holds every keepsake', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const state = await begin(p);
        patchState(ctx, state.id, (st) => {
          st.keepsakes = dungeonKeepsakes.map((k) => k.id);
        });
        const route = routeThrough(mapOf(state), (n) => n.kind === 'elite') as string[];
        const target = route.at(-1) as string;
        const after = await walk(p, state, route, (s) => s.at === target);
        expect(after.keepsakes).toHaveLength(dungeonKeepsakes.length);
        expect(new Set(after.keepsakes.map((k) => k.id)).size).toBe(dungeonKeepsakes.length);
      },
      opts(),
    );
  });
});

/** The rng seed of a test whose day map has a room of `kind` on a route that is not past the camp. */
function seedWithRoom(kind: string): string {
  for (let i = 0; i < 400; i++) {
    const seed = `find-${kind}-${String(i)}`;
    const day = drawSeed(createSeededRng(seed));
    const map = generateDungeonMap(createSeededRng(`${day}:map`), undefined, { doors: true });
    if (map.nodes.some((n) => n.kind === kind)) return seed;
  }
  throw new Error(`no map with a ${kind}`);
}

describe('a cache', () => {
  it('adds its loot to the pack, with no fight and no step of a fight', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const state = await begin(p);
        const route = routeThrough(mapOf(state), (n) => n.kind === 'cache') as string[];
        expect(route).toBeDefined();
        const target = route.at(-1) as string;
        const before = await walk(p, state, route, (s) => s.reachable.includes(target));
        const res = await p.act(before, { type: 'move', node: target });
        expect(res.status).toBe(200);
        expect(res.body.room).toBeUndefined();
        const loot = nodeLoot('cache');
        expect(res.body.state.pack).toEqual({
          bait: before.pack.bait + loot.bait,
          essence: before.pack.essence + loot.essence,
          scrap: before.pack.scrap + loot.scrap,
        });
        expect(res.body.state).toMatchObject({ at: target, pending: null });
        expect(res.body.state.roomsCleared).toBe(before.roomsCleared);
        // The step is stored with no node of a fight and no seed: nothing was rolled.
        const last = rows<{ node: string | null; seed: string | null; act_json: string }>(
          ctx.sql,
          'SELECT node, seed, act_json FROM dungeon_steps WHERE run_id = ? ORDER BY step DESC LIMIT 1',
          state.id,
        )[0];
        expect(last?.node).toBeNull();
        expect(last?.seed).toBeNull();
        expect(last?.act_json).toContain(target);
      },
      opts(seedWithRoom('cache')),
    );
  });
});

describe('a mystery room', () => {
  it('waits for an answer with the scene and two options, and does not let the run move on', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const state = await begin(p);
        const route = routeThrough(mapOf(state), (n) => n.kind === 'mystery') as string[];
        const target = route.at(-1) as string;
        const waiting = await walk(p, state, route, (s) => s.pending?.kind === 'event');
        expect(waiting.at).toBe(target);
        expect(waiting.reachable).toEqual([]);
        const pending = waiting.pending;
        expect(pending?.kind).toBe('event');
        if (pending?.kind !== 'event') throw new Error('no event');
        const def = dungeonEvent(pending.event.id);
        expect(pending.event).toMatchObject({ id: def?.id, name: def?.name, text: def?.text });
        expect(pending.event.options).toEqual(
          def?.options.map((o) => ({ label: o.label, description: o.description })),
        );
        expect(pending.event.options).toHaveLength(2);
        // The map only named the room: no scene before the player is in it.
        expect(JSON.stringify(state.map)).not.toContain(def?.text ?? 'x');
        // Nothing else can be done until it is answered.
        const move = await p.act(waiting, {
          type: 'move',
          node: state.map.nodes[0]?.next[0] ?? 'f1l0',
        });
        expect(move.body.error).toBe('invalid_act');
        const camp = await p.act(waiting, { type: 'camp', choice: 'rest' });
        expect(camp.body.error).toBe('invalid_act');
        // Reloading shows the same scene.
        expect((await p.today()).active?.pending).toEqual(pending);
      },
      opts(),
    );
  });

  it('applies the option picked, says what happened, and logs the event', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const results: { option: 0 | 1; line: string | null }[] = [];
        for (const [n, option] of ([0, 1] as const).entries()) {
          const p = await dungeonPlayer(ctx, n + 1, STRONG);
          const state = await begin(p);
          const route = routeThrough(mapOf(state), (m) => m.kind === 'mystery') as string[];
          const waiting = await walk(p, state, route, (s) => s.pending?.kind === 'event');
          const pending = waiting.pending;
          if (pending?.kind !== 'event') throw new Error('no event');
          const res = await p.act(waiting, { type: 'event', option });
          expect(res.status).toBe(200);
          const next = res.body.state;
          expect(next.pending).toBeNull();
          expect(next.step).toBe(waiting.step + 1);
          expect(next.lastEvent).toMatchObject({
            name: pending.event.name,
            option: pending.event.options[option]?.label,
          });
          expect(next.lastEvent?.outcome.length).toBeGreaterThan(0);
          // The room's exits are open again.
          expect(next.reachable).toEqual(state.map.nodes.find((x) => x.id === next.at)?.next);
          results.push({ option, line: next.lastEvent?.outcome ?? null });
          const logged = events(ctx, 'dungeon_event').at(-1);
          expect(logged).toMatchObject({ event: pending.event.id, option });
          // The event is not asked twice.
          expect((await p.act(next, { type: 'event', option })).body.error).toBe('invalid_act');
        }
        expect(results).toHaveLength(2);
      },
      opts(),
    );
  });

  it('rolls a gamble with live randomness: some win and some lose, and the odds are the content’s', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const won: boolean[] = [];
        for (let n = 1; n <= 14; n++) {
          // A new day is a new map, with other mystery rooms.
          ctx.clock.t += DAY;
          const p = await dungeonPlayer(ctx, n, STRONG);
          const state = await begin(p);
          const route = routeThrough(mapOf(state), (m) => m.kind === 'mystery') as string[];
          const waiting = await walk(p, state, route, (s) => s.pending?.kind === 'event');
          const pending = waiting.pending;
          if (pending?.kind !== 'event') throw new Error('no event');
          const def = dungeonEvent(pending.event.id);
          const gamble = def?.options.findIndex((o) => o.effects.some((e) => e.op === 'gamble'));
          if (gamble === undefined || gamble < 0) continue;
          const res = await p.act(waiting, { type: 'event', option: gamble as 0 | 1 });
          expect(res.status).toBe(200);
          const logged = events(ctx, 'dungeon_event').at(-1);
          expect(typeof logged?.['won']).toBe('boolean');
          won.push(logged?.['won'] as boolean);
          expect(res.body.state.lastEvent?.outcome).toMatch(/^(Lucky!|No luck\.)/);
        }
        expect(won.length).toBeGreaterThan(5);
        expect(won).toContain(true);
        expect(won).toContain(false);
      },
      opts('gambles'),
    );
  });

  it('never takes a creature below 1 HP and never above its max, whatever the option', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const state = await begin(p);
        const route = routeThrough(mapOf(state), (m) => m.kind === 'mystery') as string[];
        const waiting = await walk(p, state, route, (s) => s.pending?.kind === 'event');
        // One creature is down, one is hurt.
        patchState(ctx, state.id, (st) => {
          const [a, b] = st.input.team;
          st.hp = { ...Object.fromEntries(st.input.team.map((s) => [s.id, st.hpMax[s.id] ?? 1])) };
          if (a !== undefined) st.hp[a.id] = 0;
          if (b !== undefined) st.hp[b.id] = 1;
        });
        const res = await p.act({ ...waiting, step: waiting.step }, { type: 'event', option: 0 });
        expect(res.status).toBe(200);
        for (const t of res.body.state.team) {
          expect(t.hp).toBeGreaterThanOrEqual(0);
          expect(t.hp).toBeLessThanOrEqual(t.hpMax);
        }
        expect(res.body.state.team[0]?.hp).toBe(0); // a creature that is down stays down
      },
      opts(),
    );
  });
});

// --- The camp ---

/** Starts a run for `p` and walks it to the camp, which every path crosses. */
async function toCamp(p: DungeonPlayer): Promise<DungeonRunState> {
  const state = await begin(p);
  const route = routeThrough(mapOf(state), (n) => n.kind === 'camp') as string[];
  const waiting = await walk(p, state, route, (s) => s.pending?.kind === 'camp');
  expect(waiting.pending?.kind).toBe('camp');
  return waiting;
}

describe('the camp', () => {
  it('offers two keepsakes, drawn once and stored: reloading does not reroll them', async () => {
    const rng = counting('camp-offers');
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const waiting = await toCamp(p);
        const pending = waiting.pending;
        if (pending?.kind !== 'camp') throw new Error('no camp');
        expect(pending.offers).toHaveLength(RULES.dungeon.camp.offers);
        expect(new Set(pending.offers.map((o) => o.id)).size).toBe(pending.offers.length);
        expect(pending.restBp).toBe(RULES.dungeon.camp.restBp);
        expect(waiting.reachable).toEqual([]);
        const drawn = rng.drawn();
        for (let i = 0; i < 3; i++) {
          expect((await p.today()).active?.pending).toEqual(pending);
        }
        expect(rng.drawn()).toBe(drawn);
        expect(count(ctx.sql, 'dungeon_steps')).toBe(waiting.path.length);
      },
      { dungeonRng: rng, gearRng: createSeededRng('camp-offers-gear') },
    );
  });

  it('rests: standing creatures recover the share of their max HP, a creature that is down does not', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const waiting = await toCamp(p);
        patchState(ctx, waiting.id, (st) => {
          const [a, b, c] = st.input.team.map((s) => s.id) as [string, string, string];
          st.hp = { [a]: 1, [b]: 0, [c]: Math.floor((st.hpMax[c] ?? 0) / 2) };
        });
        const before = (await p.today()).active as DungeonRunState;
        const res = await p.act(before, { type: 'camp', choice: 'rest' });
        expect(res.status).toBe(200);
        const [a, b, c] = res.body.state.team;
        const bp = RULES.dungeon.camp.restBp;
        const heal = (max: number) => Math.floor((max * bp) / 10_000);
        expect(a?.hp).toBe(Math.min(a?.hpMax ?? 0, 1 + heal(a?.hpMax ?? 0)));
        expect(b?.hp).toBe(0);
        expect(c?.hp).toBe(
          Math.min(c?.hpMax ?? 0, (before.team[2]?.hp ?? 0) + heal(c?.hpMax ?? 0)),
        );
        // The camp is done: the exits of the camp are open, and the choice was logged.
        const camp = before.map.nodes.find((n) => n.id === before.at);
        expect(res.body.state).toMatchObject({ pending: null, reachable: camp?.next });
        expect(events(ctx, 'dungeon_camp')).toEqual([{ choice: 'rest' }]);
        // The choice is made once.
        expect((await p.act(res.body.state, { type: 'camp', choice: 'rest' })).body.error).toBe(
          'invalid_act',
        );
      },
      opts(),
    );
  });

  it('takes one of the two offered keepsakes, and no other', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const waiting = await toCamp(p);
        const pending = waiting.pending;
        if (pending?.kind !== 'camp') throw new Error('no camp');
        const offered = pending.offers.map((o) => o.id);
        const other = dungeonKeepsakes.find((k) => !offered.includes(k.id))?.id as string;
        for (const keepsake of [other, 'not-a-keepsake']) {
          const res = await p.act(waiting, { type: 'camp', choice: 'keepsake', keepsake });
          expect(res.body.error).toBe('invalid_act');
        }
        // A keepsake without a choice of one, and one with a swap's fields, are refused.
        expect((await p.act(waiting, { type: 'camp', choice: 'keepsake' })).body.error).toBe(
          'invalid_act',
        );
        expect(
          (await p.act(waiting, { type: 'camp', choice: 'rest', keepsake: offered[0] as string }))
            .body.error,
        ).toBe('invalid_act');
        const res = await p.act(waiting, {
          type: 'camp',
          choice: 'keepsake',
          keepsake: offered[1] as string,
        });
        expect(res.status).toBe(200);
        expect(res.body.state.keepsakes.map((k) => k.id)).toEqual([
          ...waiting.keepsakes.map((k) => k.id),
          offered[1],
        ]);
        expect(res.body.state.pending).toBeNull();
        expect(events(ctx, 'dungeon_camp')).toEqual([{ choice: 'keepsake' }]);
      },
      opts(),
    );
  });

  it('reorders the row first, for free, and the abilities follow the new order', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const waiting = await toCamp(p);
        const [a, b, c] = waiting.team.map((t) => t.id) as [string, string, string];
        for (const order of [
          [a, a, b],
          [a, b, 'x'],
          [a, b],
          [a, b, c, a],
        ]) {
          const res = await p.act(waiting, { type: 'camp', choice: 'rest', order });
          expect([400]).toContain(res.status);
          expect(stored(ctx, waiting.id).input.team.map((s) => s.id)).toEqual([a, b, c]);
        }
        const res = await p.act(waiting, { type: 'camp', choice: 'rest', order: [c, a, b] });
        expect(res.status).toBe(200);
        expect(res.body.state.team.map((t) => t.id)).toEqual([c, a, b]);
        const input = stored(ctx, waiting.id).input;
        expect(input.abilities.map((x) => x.creatureId)).toEqual([c, a, b]);
        expect(input.abilities.map((x) => x.key)).toEqual(['p1:c0', 'p1:c1', 'p1:c2']);
        // The next fight stands in the new order.
        const fight = await p.act(res.body.state, {
          type: 'move',
          node: res.body.state.reachable[0] as string,
        });
        expect(fight.body.room?.row?.map((r) => r.id)).toEqual([c, a, b]);
        expect(fight.body.room?.hpStart).toBeDefined();
      },
      opts(),
    );
  });

  it('refuses an order when the camp is not waiting, and a retry of a reorder changes nothing', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const state = await begin(p);
        const ids = state.team.map((t) => t.id) as [string, string, string];
        // Not at a camp: the row is the entry's and does not change.
        const early = await p.act(state, {
          type: 'camp',
          choice: 'rest',
          order: [ids[2], ids[0], ids[1]],
        });
        expect({ status: early.status, error: early.body.error }).toEqual({
          status: 400,
          error: 'invalid_act',
        });
        expect(stored(ctx, state.id).input.team.map((s) => s.id)).toEqual(ids);

        const route = routeThrough(mapOf(state), (n) => n.kind === 'camp') as string[];
        const waiting = await walk(p, state, route, (s) => s.pending?.kind === 'camp');
        const [a, b, c] = waiting.team.map((t) => t.id) as [string, string, string];
        const offer = (waiting.pending as { offers: { id: string }[] }).offers[0]?.id as string;
        const key = newKey();
        const act: CampAct = {
          type: 'camp',
          choice: 'keepsake',
          keepsake: offer,
          order: [b, c, a],
        };
        const first = await p.act(waiting, act, key);
        expect(first.status).toBe(200);
        const steps = count(ctx.sql, 'dungeon_steps');
        for (let i = 0; i < 2; i++) {
          const again = await p.act(waiting, act, key);
          expect(again.body).toEqual(first.body);
        }
        expect(count(ctx.sql, 'dungeon_steps')).toBe(steps);
        expect(first.body.state.team.map((t) => t.id)).toEqual([b, c, a]);
        // The same key with another order is a conflict, and the row stays as it was first set.
        const clash = await p.act(waiting, { ...act, order: [a, b, c] }, key);
        expect(clash.status).toBe(409);
        expect(stored(ctx, waiting.id).input.team.map((s) => s.id)).toEqual([b, c, a]);
      },
      opts(),
    );
  });

  it('moves a creature that is down anywhere, and heals nobody: HP follows the creature', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const waiting = await toCamp(p);
        const [a, b, c] = waiting.team.map((t) => t.id) as [string, string, string];
        patchState(ctx, waiting.id, (st) => {
          st.hp = { [a]: 0, [b]: 5, [c]: 7 };
        });
        const before = (await p.today()).active as DungeonRunState;
        const offer = (before.pending as { offers: { id: string }[] }).offers[0]?.id as string;
        const res = await p.act(before, {
          type: 'camp',
          choice: 'keepsake',
          keepsake: offer,
          order: [b, c, a],
        });
        expect(res.status).toBe(200);
        expect(res.body.state.team.map((t) => [t.id, t.hp])).toEqual([
          [b, 5],
          [c, 7],
          [a, 0], // the downed one is on the right and still down
        ]);
        expect(stored(ctx, waiting.id).input.team.map((s) => s.id)).toEqual([b, c, a]);
        expect(stored(ctx, waiting.id).hp).toEqual({ [a]: 0, [b]: 5, [c]: 7 });
      },
      opts(),
    );
  });

  it('puts the creature that comes in anywhere in the row, in the same act as the swap', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, FOUR);
        const [a, b, c, d] = p.creatureIds as [string, string, string, string];
        const state = await begin(p, { team: [a, b, c] });
        const route = routeThrough(mapOf(state), (n) => n.kind === 'camp') as string[];
        const waiting = await walk(p, state, route, (s) => s.pending?.kind === 'camp');
        const swap = { type: 'camp', choice: 'swap', out: c, in: d } as const;
        // The order is the row after the swap: the one that goes home (c) is not in it, the recruit (d) is.
        for (const order of [
          [a, b, c], // the old row: c has gone home
          [a, b, d, c],
          [d, d, a],
          [d, a, 'x'],
          [d, a],
          [d, a, c],
        ]) {
          const res = await p.act(waiting, { ...swap, order });
          expect([400]).toContain(res.status);
          expect(stored(ctx, waiting.id).step).toBe(waiting.step);
          expect(stored(ctx, waiting.id).input.team.map((s) => s.id)).toEqual([a, b, c]);
        }
        const res = await p.act(waiting, { ...swap, order: [d, a, b] });
        expect(res.status).toBe(200);
        expect(res.body.state.team.map((t) => t.id)).toEqual([d, a, b]);
        const newcomer = res.body.state.team[0];
        expect(newcomer?.hp).toBe(newcomer?.hpMax); // the recruit is fresh, wherever it stands
        const input = stored(ctx, waiting.id).input;
        expect(input.team.map((s) => s.id)).toEqual([d, a, b]);
        expect(input.abilities.map((x) => x.creatureId)).toEqual([d, a, b]);
        expect(input.abilities.map((x) => x.key)).toEqual(['p1:c0', 'p1:c1', 'p1:c2']);
        // The next fight stands in that order.
        const fight = await p.act(res.body.state, {
          type: 'move',
          node: res.body.state.reachable[0] as string,
        });
        expect(fight.body.room?.row?.map((r) => r.id)).toEqual([d, a, b]);
      },
      opts(),
    );
  });

  it('swaps in one of the player’s other creatures at full HP, loaded now, with no treat', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, FOUR);
        const stranger = await dungeonPlayer(ctx, 2, STRONG);
        const [a, b, c, d] = p.creatureIds as [string, string, string, string];
        ctx.core.credit({
          userId: p.id,
          currency: 'bait',
          amount: 200,
          source: 'test',
          idempotencyKey: 'bait-swap',
        });
        ctx.sql.exec('UPDATE creatures SET level = 20 WHERE id = ?', d); // room to grow
        const state = await begin(p, { team: [a, b, c], treats: [c] });
        expect(state.team.find((t) => t.id === c)?.treat).toBe(true);
        const route = routeThrough(mapOf(state), (n) => n.kind === 'camp') as string[];
        const waiting = await walk(p, state, route, (s) => s.pending?.kind === 'camp');
        // The creature that comes in is loaded at the camp: a level it gained since shows.
        const levelOfD = rows<{ level: number }>(
          ctx.sql,
          'SELECT level FROM creatures WHERE id = ?',
          d,
        )[0]?.level as number;
        ctx.sql.exec('UPDATE creatures SET level = level + 1 WHERE id = ?', d);
        patchState(ctx, waiting.id, (st) => {
          st.hp = Object.fromEntries(st.input.team.map((s) => [s.id, 1]));
        });
        const bad = async (a2: Record<string, unknown>, status: number, error: string) => {
          const res = await p.act(waiting, { type: 'camp', choice: 'swap', ...a2 } as never);
          expect({ status: res.status, error: res.body.error }).toEqual({ status, error });
        };
        await bad({}, 400, 'invalid_act'); // no out, no in
        await bad({ out: c }, 400, 'invalid_act');
        await bad({ in: d }, 400, 'invalid_act');
        await bad({ out: d, in: d }, 400, 'invalid_act'); // out is not in the row
        await bad({ out: c, in: b }, 400, 'invalid_act'); // in is already in the row
        await bad({ out: c, in: stranger.creatureIds[0] }, 404, 'not_found'); // somebody else's
        await bad({ out: c, in: '00000000-0000-4000-8000-000000000000' }, 404, 'not_found');
        expect(stored(ctx, waiting.id).step).toBe(waiting.step);
        const res = await p.act(waiting, { type: 'camp', choice: 'swap', out: c, in: d });
        expect(res.status).toBe(200);
        const next = res.body.state;
        expect(next.team.map((t) => t.id)).toEqual([a, b, d]); // the newcomer takes the place of the one that left
        const newcomer = next.team[2];
        expect(newcomer?.hp).toBe(newcomer?.hpMax);
        expect(newcomer?.hpMax).toBeGreaterThan(0);
        expect(newcomer?.treat).toBe(false);
        expect(newcomer?.level).toBe(levelOfD + 1);
        expect(next.team[0]?.hp).toBe(1); // the others keep their HP
        const st = stored(ctx, waiting.id);
        expect(st.hp?.[c]).toBeUndefined();
        expect(st.hp?.[d]).toBeUndefined(); // no entry: the engine starts it at full HP
        expect(st.everyone).toEqual([a, b, c, d]);
        expect(st.treats).toEqual([c]); // the treat stays with the creature that earned it
        expect(st.input.abilities.map((x) => x.creatureId)).toEqual([a, b, d]);
        expect(events(ctx, 'dungeon_camp')).toEqual([{ choice: 'swap' }]);
        // The newcomer fights at full HP in the next fight.
        const fight = await p.act(next, { type: 'move', node: next.reachable[0] as string });
        expect(fight.body.room?.hpStart[d]).toBe(newcomer?.hpMax);
        expect(fight.body.room?.row?.map((r) => r.id)).toEqual([a, b, d]);
      },
      opts(),
    );
  });
});

describe('gear and creatures that change during a run', () => {
  it('counts an item once: one taken off a creature of the row and put on a bench creature is left out when that one joins', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, FOUR);
        const [a, b, c, d] = p.creatureIds as [string, string, string, string];
        const hat = giveItem(ctx.sql, p.id, 'trail-cap', {
          rarity: 'rare',
          level: 5,
          seed: 'once-hat',
          now: ctx.clock.t,
        });
        const scarf = giveItem(ctx.sql, p.id, 'patch-scarf', {
          rarity: 'rare',
          level: 5,
          seed: 'once-scarf',
          now: ctx.clock.t,
        });
        const equip = async (item: string, creatureId: string | null) =>
          expect((await p.call('POST', `/api/gear/${item}/equip`, { creatureId })).status).toBe(
            200,
          );
        await equip(hat, a);
        await equip(scarf, d); // worn by a creature that is not in the run: it counts when it joins
        const state = await begin(p, { team: [a, b, c] });
        expect(stored(ctx, state.id).gear).toEqual([hat]);
        // The hat moves from a creature of the row to the bench creature.
        await equip(hat, null);
        await equip(hat, d);
        const plain = (
          (await p.call('GET', '/api/state')).body as {
            creatures: { id: string; stats: { atk: number }; statsWithGear: { atk: number } }[];
          }
        ).creatures.find((x) => x.id === d);
        expect(plain?.statsWithGear.atk).toBeGreaterThan(plain?.stats.atk ?? 0); // the hat gives Attack
        const route = routeThrough(mapOf(state), (n) => n.kind === 'camp') as string[];
        const waiting = await walk(p, state, route, (s) => s.pending?.kind === 'camp');
        const res = await p.act(waiting, { type: 'camp', choice: 'swap', out: c, in: d });
        expect(res.status).toBe(200);
        const st = stored(ctx, state.id);
        // The hat is still frozen into the row once (on a); the newcomer joins with the scarf only.
        expect(st.gear.sort()).toEqual([hat, scarf].sort());
        const slotA = st.input.team.find((x) => x.id === a);
        const slotD = st.input.team.find((x) => x.id === d);
        const atkWithHat = plain?.statsWithGear.atk ?? 0;
        expect(slotD?.stats?.atk).toBeLessThan(atkWithHat);
        expect(slotA?.stats?.atk).toBeGreaterThan(0);
        expect(slotD?.mods).toEqual(expect.anything()); // the scarf's sheet is there
      },
      opts(),
    );
  });

  it('cannot swap in a creature that was fused away or released, and never one that was in the row already', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, FOUR);
        const [a, b, c, d] = p.creatureIds as [string, string, string, string];
        const state = await begin(p, { team: [a, b, c] });
        const route = routeThrough(mapOf(state), (n) => n.kind === 'camp') as string[];
        const waiting = await walk(p, state, route, (s) => s.pending?.kind === 'camp');
        // The bench creature is gone (fused away or released): it cannot come in.
        ctx.sql.exec('DELETE FROM creatures WHERE id = ?', d);
        const gone = await p.act(waiting, { type: 'camp', choice: 'swap', out: c, in: d });
        expect({ status: gone.status, error: gone.body.error }).toEqual({
          status: 404,
          error: 'not_found',
        });
        // A creature of the row that is gone keeps fighting on its frozen stats: the run is a snapshot.
        ctx.sql.exec('DELETE FROM creatures WHERE id = ?', c);
        const rest = await p.act(waiting, { type: 'camp', choice: 'rest' });
        expect(rest.status).toBe(200);
        expect(rest.body.state.team.map((t) => t.id)).toEqual([a, b, c]);
        // A creature that stood in the row once does not come back.
        const q = await dungeonPlayer(ctx, 2, FOUR);
        const [qa, qb, qc, qd] = q.creatureIds as [string, string, string, string];
        const s2 = await begin(q, { team: [qa, qb, qc] });
        const w2 = await walk(
          q,
          s2,
          routeThrough(mapOf(s2), (n) => n.kind === 'camp') as string[],
          (s) => s.pending?.kind === 'camp',
        );
        patchState(ctx, s2.id, (st) => {
          st.everyone.push(qd);
        });
        const back = await q.act(w2, { type: 'camp', choice: 'swap', out: qc, in: qd });
        expect({ status: back.status, error: back.body.error }).toEqual({
          status: 400,
          error: 'invalid_act',
        });
      },
      opts(),
    );
  });
});

describe('heading home', () => {
  it('ends the run from the camp, keeps the whole pack, leaves the depth and gives no retry', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        ctx.clock.t = AFTER_RESET;
        const waiting = await toCamp(p);
        const found = { ...waiting.pack };
        expect(found.bait).toBeGreaterThan(0);
        const res = await p.act(waiting, { type: 'home' });
        expect(res.status).toBe(200);
        expect(res.body.state).toMatchObject({
          status: 'done',
          outcome: 'home',
          reachable: [],
          pending: null,
        });
        const summary = res.body.summary;
        expect(summary).toMatchObject({ outcome: 'home', cleared: false, newDepth: 1, depth: 1 });
        expect(summary?.pack).toEqual({ found, kept: found });
        expect(summary?.rewards.bait).toBe(found.bait);
        expect(summary?.rewards.essence).toBe(found.essence);
        expect(summary?.rewards.supplies).toHaveLength(1);
        expect(summary?.rewards.landmark).toBe(false);
        // No boss chest: no full-clear Essence and no gear for a run that went home.
        expect(summary?.rewards.gear).toEqual([]);
        expect(progressOf(ctx, p.id)).toMatchObject({
          depth: 1,
          runs: 1,
          clears: 0,
          streak: 1,
          last_day: '2027-01-15',
        });
        // A first day does not open the retry after going home, and the day is spent.
        expect(res.body.today).toMatchObject({
          canRun: false,
          blocked: 'already_run',
          active: null,
        });
        expect(res.body.today?.last?.id).toBe(waiting.id);
        expect((await p.start()).body).toEqual({ error: 'already_run' });
        expect(runRow(ctx, waiting.id)).toMatchObject({
          status: 'done',
          outcome: 'home',
          cleared: 0,
        });
        // Going home is not a way to head off a mystery room: only the camp lets a run go home.
      },
      opts(),
    );
  });

  it('is only possible at the camp', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const state = await begin(p);
        expect((await p.act(state, { type: 'home' })).body.error).toBe('invalid_act');
        const route = routeThrough(mapOf(state), (m) => m.kind === 'mystery') as string[];
        const waiting = await walk(p, state, route, (s) => s.pending?.kind === 'event');
        expect((await p.act(waiting, { type: 'home' })).body.error).toBe('invalid_act');
        expect(runRow(ctx, state.id)?.status).toBe('active');
      },
      opts(),
    );
  });
});

// --- A clear ---

describe('clearing the floor boss', () => {
  it('pays the chest, goes one depth deeper, counts the streak and pays each creature its own fights', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, FOUR);
        const [a, b, c, d] = p.creatureIds as [string, string, string, string];
        ctx.clock.t = AFTER_RESET;
        ctx.core.credit({
          userId: p.id,
          currency: 'bait',
          amount: 300,
          source: 'test',
          idempotencyKey: 'bait-clear',
        });
        const state = await begin(p, { team: [a, b, c], treats: [b] });
        // Swap the third creature for the fourth at the camp, then play the rest of the map.
        const done = await p.play(state, {
          camp: () => ({ type: 'camp', choice: 'swap', out: c, in: d }),
        });
        const run = done.body.run;
        expect(run).toMatchObject({ outcome: 'cleared', cleared: true, depth: 1, newDepth: 2 });
        expect(progressOf(ctx, p.id)).toMatchObject({ depth: 2, runs: 1, clears: 1, streak: 1 });
        expect(run?.team.map((t) => t.id)).toEqual([a, b, d]);
        // Its fights: the ones before the camp (floors 0 to 2), and the ones after (floors 4 to 6).
        const replay = (await p.replay(run?.id as string)).body;
        const floorOf = (node: string | undefined) => Number(/^f(\d+)l/.exec(node ?? '')?.[1]);
        const before = replay.rooms.filter((r) => floorOf(r.node) < RULES.dungeon.campFloor).length;
        const after = replay.rooms.length - before;
        expect(before).toBeGreaterThan(0);
        expect(after).toBeGreaterThan(0);
        const gained = Object.fromEntries(
          (run?.rewards.experience ?? []).map((e) => [e.creatureId, e]),
        );
        const exp = (fights: number, cleared: boolean, treat: boolean) =>
          dungeonExperience(fights, cleared, treat);
        // The full-clear bonus is for the row that beat the boss; the treat doubles a creature's own share.
        expect(gained[a]?.gained).toBe(exp(before + after, true, false));
        expect(gained[b]?.gained).toBe(exp(before + after, true, true));
        expect(gained[b]?.treat).toBe(true);
        // The creature that went home at the camp keeps what it fought for, and no more.
        expect(gained[c]?.gained).toBe(exp(before, false, false));
        // The newcomer is paid only for its fights, with no treat.
        expect(gained[d]?.gained).toBe(exp(after, true, false));
        expect(gained[d]?.treat).toBe(false);
        expect(Object.keys(gained)).toEqual([a, b, c, d]);
        // The whole pack is kept and the boss chest is added: the run's Essence is the pack's plus the full clear's.
        expect(run?.pack?.kept).toEqual(run?.pack?.found);
        expect(run?.rewards.essence).toBe(
          (run?.pack?.kept.essence ?? 0) + RULES.dungeon.fullClear.essence,
        );
        // The keys of the pay are the run's: `dungeon:<day>:<attempt>`.
        for (const row of dungeonLedger(ctx, p.id)) {
          expect(row.idempotency_key).toMatch(/^dungeon:2027-01-15:1:(bait|essence)$/);
        }
      },
      opts(),
    );
  });
});

// --- Runs left open ---

describe('a run left open', () => {
  /** Where the player left the app: in the first room, resting at the camp with its choice pending, or past the camp. */
  type Where = 'before' | 'camp' | 'after';
  async function leaveOpen(ctx: CoreContext, p: DungeonPlayer, where: Where) {
    ctx.clock.t = AFTER_RESET;
    const state = await begin(p);
    const floorOf = (s: DungeonRunState) => Number(/^f(\d+)l/.exec(s.at ?? '')?.[1] ?? -1);
    const stop: Record<Where, (s: DungeonRunState) => boolean> = {
      before: (s) => s.roomsCleared >= 1,
      camp: (s) => s.pending?.kind === 'camp',
      after: (s) => floorOf(s) > RULES.dungeon.campFloor && s.pending === null,
    };
    const open = await walk(p, state, [], stop[where]);
    expect(open.status).toBe('active');
    return open;
  }

  const summaryOf = (ctx: CoreContext, runId: string) =>
    JSON.parse(runRow(ctx, runId)?.summary_json ?? '{}') as {
      pack: { found: { bait: number; essence: number; scrap: number }; kept: unknown };
      rewards: {
        bait: number;
        essence: number;
        supplies?: string[];
        experience: { gained: number }[];
      };
      day: string;
    };

  it('is closed as a defeat before the camp: half the pack, rounded up, no depth, experience and supply paid', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        // Below the top level, so that experience shows.
        const p = await dungeonPlayer(ctx, 1, { ...STRONG, level: 10 });
        const growth = () =>
          rows<{ level: number; exp: number }>(
            ctx.sql,
            'SELECT level, exp FROM creatures WHERE id = ?',
            p.creatureIds[0] as string,
          )[0];
        const levelBefore = growth();
        const mid = await leaveOpen(ctx, p, 'before');
        // The same game day: still open.
        ctx.clock.t += 3 * HOUR;
        expect((await p.today()).active?.id).toBe(mid.id);
        // The next game day: closed as a defeat.
        ctx.clock.t = AFTER_RESET + DAY;
        const today = await p.today();
        expect(today).toMatchObject({ active: null, canRun: true, last: null, attemptsToday: 0 });
        const row = runRow(ctx, mid.id);
        expect(row).toMatchObject({
          status: 'done',
          outcome: 'defeat',
          cleared: 0,
          rooms_cleared: mid.roomsCleared,
        });
        const summary = summaryOf(ctx, mid.id);
        const kept = keptOnDefeat(mid.pack);
        expect(summary.day).toBe('2027-01-15');
        expect(summary.pack).toEqual({ found: mid.pack, kept });
        expect(kept.bait).toBeLessThan(mid.pack.bait + 1);
        expect(summary.rewards.bait).toBe(kept.bait);
        expect(dungeonLedger(ctx, p.id).find((l) => l.currency === 'bait')?.amount).toBe(kept.bait);
        expect(summary.rewards.supplies).toHaveLength(1);
        expect(
          summary.rewards.experience.every(
            (e) => e.gained === dungeonExperience(mid.roomsCleared, false, false),
          ),
        ).toBe(true);
        expect(growth()).not.toEqual(levelBefore);
        expect(progressOf(ctx, p.id)).toMatchObject({
          runs: 1,
          clears: 0,
          depth: 1,
          last_day: '2027-01-15',
        });
        // Closing again changes nothing, and today's run can start.
        const ledger = dungeonLedger(ctx, p.id);
        ctx.core.dungeon.closeStale();
        await p.today();
        expect(dungeonLedger(ctx, p.id)).toEqual(ledger);
        expect(events(ctx, 'dungeon_run')).toHaveLength(1);
        expect(events(ctx, 'dungeon_run')[0]).toMatchObject({ outcome: 'defeat' });
        expect((await p.run()).status).toBe(200);
        // The streak counted the old day and this one.
        expect(progressOf(ctx, p.id)?.streak).toBe(2);
      },
      opts(),
    );
  });

  it('is closed as home when it is resting at the camp with its choice pending: the whole pack', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const mid = await leaveOpen(ctx, p, 'camp');
        expect(mid.pending?.kind).toBe('camp');
        expect(mid.pack.bait).toBeGreaterThan(0);
        ctx.clock.t = AFTER_RESET + DAY;
        await p.today();
        expect(runRow(ctx, mid.id)).toMatchObject({ status: 'done', outcome: 'home', cleared: 0 });
        const summary = summaryOf(ctx, mid.id);
        expect(summary.pack).toEqual({ found: mid.pack, kept: mid.pack });
        expect(summary.rewards.bait).toBe(mid.pack.bait);
        expect(dungeonLedger(ctx, p.id).find((l) => l.currency === 'bait')?.amount).toBe(
          mid.pack.bait,
        );
        expect(summary.rewards.supplies).toHaveLength(1);
        expect(progressOf(ctx, p.id)).toMatchObject({ runs: 1, clears: 0, depth: 1 });
        expect(events(ctx, 'dungeon_run')[0]).toMatchObject({ outcome: 'home' });
      },
      opts(),
    );
  });

  it('is closed as a defeat after the camp, too: the camp’s choice is behind it', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const mid = await leaveOpen(ctx, p, 'after');
        expect(mid.pending).toBeNull();
        expect(mid.path.length).toBeGreaterThan(RULES.dungeon.campFloor);
        ctx.clock.t = AFTER_RESET + DAY;
        await p.today();
        expect(runRow(ctx, mid.id)).toMatchObject({ status: 'done', outcome: 'defeat' });
        const summary = summaryOf(ctx, mid.id);
        expect(summary.pack).toEqual({ found: mid.pack, kept: keptOnDefeat(mid.pack) });
        expect(progressOf(ctx, p.id)).toMatchObject({ depth: 1, clears: 0 });
      },
      opts(),
    );
  });

  it('is closed by the guild alarm without anyone looking, and by a start, an act or a replay', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const alarm = await dungeonPlayer(ctx, 1, STRONG);
        const starter = await dungeonPlayer(ctx, 2, STRONG);
        const actor = await dungeonPlayer(ctx, 3, STRONG);
        const reader = await dungeonPlayer(ctx, 4, STRONG);
        const states: DungeonRunState[] = [];
        states.push(await leaveOpen(ctx, alarm, 'camp'));
        states.push(await leaveOpen(ctx, starter, 'before'));
        states.push(await leaveOpen(ctx, actor, 'before'));
        states.push(await leaveOpen(ctx, reader, 'camp'));
        ctx.clock.t = AFTER_RESET + DAY;
        ctx.core.dungeon.closeStale();
        expect(runRow(ctx, (states[0] as DungeonRunState).id)?.outcome).toBe('home');
        // The others are closed when their player starts a new run, acts on the old one, or reads its replay.
        expect((await starter.start()).status).toBe(200);
        expect(runRow(ctx, (states[1] as DungeonRunState).id)?.outcome).toBe('defeat');
        const late = await actor.act(states[2] as DungeonRunState, {
          type: 'move',
          node: (states[2] as DungeonRunState).reachable[0] as string,
        });
        expect({ status: late.status, error: late.body.error }).toEqual({
          status: 409,
          error: 'stale_step',
        });
        expect(runRow(ctx, (states[2] as DungeonRunState).id)?.outcome).toBe('defeat');
        const replay = await reader.replay((states[3] as DungeonRunState).id);
        expect(replay.status).toBe(200);
        expect(replay.body.summary.outcome).toBe('home');
        expect(count(ctx.sql, 'dungeon_runs', "status = 'active'")).toBe(1); // the starter's new run
      },
      opts(),
    );
  });
});

describe('closing a late run and pruning', () => {
  it('refuses a start while an earlier day’s run cannot be closed, and starts once it is closed', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        ctx.clock.t = AFTER_RESET;
        const open = await begin(p);
        const good = runRow(ctx, open.id)?.state_json as string;
        // A state nobody can read: the close is skipped, and stays pending.
        ctx.sql.exec('UPDATE dungeon_runs SET state_json = \'{"v":2}\' WHERE id = ?', open.id);
        ctx.clock.t = AFTER_RESET + DAY;
        const refused = await p.start();
        expect({ status: refused.status, error: refused.body.error }).toEqual({
          status: 409,
          error: 'run_active',
        });
        expect(count(ctx.sql, 'dungeon_runs', "status = 'active'")).toBe(1);
        ctx.sql.exec('UPDATE dungeon_runs SET state_json = ? WHERE id = ?', good, open.id);
        expect((await p.start()).status).toBe(200);
        expect(runRow(ctx, open.id)?.status).toBe('done');
      },
      opts(),
    );
  });

  it('never rolls the progress back when an earlier day’s run closes after a later day’s', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        ctx.clock.t = AFTER_RESET;
        const open = await begin(p);
        // Meanwhile the player's progress moved on (as if a later day's run had finished).
        ctx.sql.exec(
          "INSERT INTO dungeon_progress (user_id, depth, streak, last_day, first_day, runs, clears) VALUES (?, 5, 7, '2027-01-17', '2027-01-01', 9, 4)",
          p.id,
        );
        ctx.clock.t = AFTER_RESET + 3 * DAY;
        await p.today();
        const row = runRow(ctx, open.id);
        expect(row?.status).toBe('done');
        expect(progressOf(ctx, p.id)).toEqual({
          depth: 5,
          streak: 7,
          last_day: '2027-01-17',
          runs: 10,
          clears: 4,
        });
        const summary = JSON.parse(row?.summary_json ?? '{}') as {
          newDepth: number;
          streak: number;
        };
        expect(summary).toMatchObject({ newDepth: 5, streak: 7 });
      },
      opts(),
    );
  });

  it('empties the stored answers of steps and the state of runs that ended once past retention, and keeps what is shown', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        ctx.clock.t = AFTER_RESET;
        const done = await p.run();
        const run = done.body.run;
        const first = rows<{ step: number; idempotency_key: string }>(
          ctx.sql,
          'SELECT step, idempotency_key FROM dungeon_steps WHERE run_id = ? ORDER BY step LIMIT 1',
          run.id,
        )[0];
        ctx.clock.t += 91 * DAY;
        // The next day's run is open (and not old enough to go).
        const open = await begin(p);
        ctx.clock.t += 0;
        ctx.core.dungeon.prune();
        expect(runRow(ctx, run.id)?.state_json).toBeNull();
        expect(runRow(ctx, open.id)?.state_json).not.toBeNull();
        expect(
          rows(
            ctx.sql,
            "SELECT step FROM dungeon_steps WHERE run_id = ? AND act_json != '{}'",
            run.id,
          ),
        ).toEqual([]);
        expect(
          rows(
            ctx.sql,
            "SELECT step FROM dungeon_steps WHERE run_id = ? AND act_json != '{}'",
            open.id,
          ),
        ).toEqual([]); // none acted yet
        // The summary stays, the team is remembered, and a retry of a pruned step is stale (never an error).
        expect(JSON.parse(runRow(ctx, run.id)?.summary_json ?? '{}')).toEqual(run);
        expect((await p.today()).active?.id).toBe(open.id);
        const retry = await p.call('POST', '/api/dungeon/act', {
          runId: run.id,
          step: first?.step,
          idempotencyKey: first?.idempotency_key,
          act: { type: 'move', node: 'f0l0' },
        });
        expect({ status: retry.status, error: retry.body['error'] }).toEqual({
          status: 409,
          error: 'stale_step',
        });
        expect((await p.replay(run.id)).status).toBe(404);
      },
      opts(),
    );
  });
});

// --- Replays of a run that is open ---

describe('GET /api/dungeon/run/:id for a map run', () => {
  it('replays the fights played so far while the run is open, with each room’s row, and keeps the starting row on top', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, FOUR);
        const [a, b, c, d] = p.creatureIds as [string, string, string, string];
        const state = await begin(p, { team: [a, b, c] });
        const route = routeThrough(mapOf(state), (n) => n.kind === 'camp') as string[];
        const waiting = await walk(p, state, route, (s) => s.pending?.kind === 'camp');
        const swapped = await p.act(waiting, { type: 'camp', choice: 'swap', out: c, in: d });
        expect(swapped.status).toBe(200);
        const open = await walk(
          p,
          swapped.body.state,
          [],
          (s) => s.roomsCleared >= waiting.roomsCleared + 1,
        );
        expect(open.status).toBe('active');
        const replay = await p.replay(state.id);
        expect(replay.status).toBe(200);
        // The top-level row is the starting one; later rooms carry the row that fought them.
        expect(replay.body.row.map((r) => r.id)).toEqual([a, b, c]);
        const first = replay.body.rooms[0];
        const last = replay.body.rooms.at(-1);
        expect(first?.row?.map((r) => r.id)).toEqual([a, b, c]);
        expect(last?.row?.map((r) => r.id)).toEqual([a, b, d]);
        expect(replay.body.rooms).toHaveLength(open.roomsCleared);
        // An open run has no outcome yet, and no pay.
        expect(replay.body.summary.outcome).toBeUndefined();
        expect(replay.body.summary.rewards.bait).toBe(0);
        expect(replay.body.rooms.map((r) => r.index)).toEqual(replay.body.rooms.map((_, i) => i));
        // Someone else cannot read it.
        const other = await dungeonPlayer(ctx, 2, STRONG);
        expect((await other.replay(state.id)).status).toBe(404);
      },
      opts(),
    );
  });
});

// --- The old route ---

describe('POST /api/dungeon/run', () => {
  it('is gone: 410, whatever is sent, and nothing is stored', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        for (const body of [p.body(), {}, { team: [] }]) {
          const res = await p.call('POST', '/api/dungeon/run', body);
          expect({ status: res.status, body: res.body }).toEqual({
            status: 410,
            body: { error: 'gone' },
          });
        }
        expect(count(ctx.sql, 'dungeon_runs')).toBe(0);
      },
      opts(),
    );
  });
});

// --- Weather inside a run ---

describe('the run’s state', () => {
  it('never holds or sends anything the client could use to pick a result', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const state = await begin(p);
        const keys = Object.keys(state).sort();
        expect(keys).toEqual(
          [
            'at',
            'attempt',
            'day',
            'depth',
            'history',
            'id',
            'keepsakes',
            'landmark',
            'lastEvent',
            'level',
            'map',
            'outcome',
            'pack',
            'path',
            'pending',
            'reachable',
            'roomsCleared',
            'status',
            'step',
            'supply',
            'team',
            'undercroft',
          ].sort(),
        );
        expect(Object.keys(state.team[0] ?? {}).sort()).toEqual(
          ['element', 'hp', 'hpMax', 'id', 'level', 'name', 'role', 'speciesId', 'treat'].sort(),
        );
        void ctx;
      },
      opts(),
    );
  });

  it('shows a row that went down in the first fight, and the fight with it', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const state = await begin(p);
        const res = await withDeadlyFoes(() =>
          p.act(state, { type: 'move', node: state.reachable[0] as string }),
        );
        expect(res.body.state.status).toBe('done');
        expect(res.body.state.team.every((t) => t.hp === 0)).toBe(true);
        const [fight] = fightSteps(ctx, state.id);
        const result = JSON.parse(fight?.result_json ?? '{}') as DungeonRoomResult;
        expect(result.cleared).toBe(false);
      },
      opts(),
    );
  });
});

// --- The room history and the route ---

describe('the room history', () => {
  const zero = { bait: 0, essence: 0, scrap: 0 };
  const lootOf = (before: DungeonRunState, after: DungeonRunState) => ({
    bait: after.pack.bait - before.pack.bait,
    essence: after.pack.essence - before.pack.essence,
    scrap: after.pack.scrap - before.pack.scrap,
  });
  const last = (state: DungeonRunState): DungeonStepLog => state.history.at(-1) as DungeonStepLog;

  it('starts empty and gets one entry per fight, with the loot it put in the pack and the supply flag on the first clear', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const state = await begin(p);
        expect(state.history).toEqual([]);
        const first = await p.act(state, { type: 'move', node: state.reachable[0] as string });
        const one = first.body.state;
        expect(one.history).toHaveLength(1);
        const entry = one.history[0];
        expect(entry).toEqual({
          node: one.at,
          kind: 'fight',
          result: 'fight',
          cleared: true,
          rounds: first.body.room?.rounds,
          foeHpEnd: 0,
          foeHpMax: first.body.room?.foe.hpMax,
          loot: lootOf(state, one),
          supply: true,
        });
        expect(lootOf(state, one).bait).toBe(nodeLoot('fight').bait);
        expect(first.body.room?.rounds).toBeGreaterThan(0);
        // The second fight earned no supply: the flag is only on the one that did.
        const second = await p.act(one, { type: 'move', node: one.reachable[0] as string });
        const two = second.body.state;
        expect(two.history).toHaveLength(2);
        expect(two.history[0]).toEqual(entry);
        expect(two.history[1]).toMatchObject({ node: two.at, kind: 'fight', cleared: true });
        expect(two.history[1]).not.toHaveProperty('supply');
        expect(two.history.map((h) => h.node)).toEqual(two.path);
        // The log holds no fight events, and today shows the same log for an open run.
        expect(JSON.stringify(two.history)).not.toContain('events');
        expect((await p.today()).active?.history).toEqual(two.history);
        // A retried act answers with the log it left.
        const key = newKey();
        const move = { type: 'move', node: two.reachable[0] as string } as const;
        const a = await p.act(two, move, key);
        const b = await p.act(two, move, key);
        expect(b.body.state.history).toEqual(a.body.state.history);
      },
      opts(),
    );
  });

  it('logs a lost fight as not cleared, with the foe HP left, no loot and no supply', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const state = await begin(p);
        const res = await withDeadlyFoes(() =>
          p.act(state, { type: 'move', node: state.reachable[0] as string }),
        );
        const entry = res.body.state.history[0];
        expect(res.body.state.history).toHaveLength(1);
        expect(entry).toEqual({
          node: res.body.state.at,
          kind: 'fight',
          result: 'fight',
          cleared: false,
          rounds: res.body.room?.rounds,
          foeHpEnd: expect.any(Number) as number,
          foeHpMax: res.body.room?.foe.hpMax,
          loot: zero,
        });
        expect((entry as { foeHpEnd: number }).foeHpEnd).toBeGreaterThan(0);
        expect(res.body.summary?.route?.history).toEqual(res.body.state.history);
      },
      opts(),
    );
  });

  it('logs an elite with the keepsake it gave, and a boss as a boss', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const state = await begin(p);
        const route = routeThrough(mapOf(state), (n) => n.kind === 'elite') as string[];
        const target = route.at(-1) as string;
        const after = await walk(p, state, route, (s) => s.at === target);
        expect(last(after)).toMatchObject({
          node: target,
          kind: 'elite',
          result: 'fight',
          cleared: true,
          loot: expect.objectContaining({ bait: nodeLoot('elite').bait }) as unknown,
          keepsake: after.keepsakes[0],
        });
        // Fights that are not elites carry no keepsake.
        for (const h of after.history.slice(0, -1)) expect(h).not.toHaveProperty('keepsake');
        const done = await p.play(after);
        const log = done.body.run?.route?.history as DungeonStepLog[];
        expect(log.at(-1)).toMatchObject({ kind: 'boss', result: 'fight', cleared: true });
        expect(
          log.filter((h) => h.result === 'fight' && 'supply' in h && h.supply === true),
        ).toHaveLength(1);
      },
      opts(),
    );
  });

  it('logs a cache with its loot', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const state = await begin(p);
        const route = routeThrough(mapOf(state), (n) => n.kind === 'cache') as string[];
        const target = route.at(-1) as string;
        const before = await walk(p, state, route, (s) => s.reachable.includes(target));
        const res = await p.act(before, { type: 'move', node: target });
        expect(last(res.body.state)).toEqual({
          node: target,
          kind: 'cache',
          result: 'cache',
          loot: nodeLoot('cache'),
        });
        expect(res.body.state.history).toHaveLength(before.history.length + 1);
      },
      opts(seedWithRoom('cache')),
    );
  });

  it('logs a mystery room as pending with the event name, then replaces it with what the option did', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        for (const [n, option] of ([0, 1] as const).entries()) {
          const p = await dungeonPlayer(ctx, n + 1, STRONG);
          const state = await begin(p);
          const route = routeThrough(mapOf(state), (m) => m.kind === 'mystery') as string[];
          const waiting = await walk(p, state, route, (s) => s.pending?.kind === 'event');
          const pending = waiting.pending;
          if (pending?.kind !== 'event') throw new Error('no event');
          expect(last(waiting)).toEqual({
            node: waiting.at,
            kind: 'mystery',
            result: 'pending',
            event: pending.event.name,
          });
          // Reloading shows the same waiting entry.
          expect((await p.today()).active?.history).toEqual(waiting.history);
          const res = await p.act(waiting, { type: 'event', option });
          const next = res.body.state;
          expect(next.history).toHaveLength(waiting.history.length); // replaced, not added
          expect(next.history.slice(0, -1)).toEqual(waiting.history.slice(0, -1));
          expect(last(next)).toMatchObject({
            node: waiting.at,
            kind: 'mystery',
            result: 'event',
            event: pending.event.name,
            option: pending.event.options[option]?.label,
            outcome: next.lastEvent?.outcome,
            loot: lootOf(waiting, next),
          });
          const gained = next.keepsakes.length - waiting.keepsakes.length;
          expect('keepsake' in last(next)).toBe(gained > 0);
        }
      },
      opts(),
    );
  });

  it('logs the camp as pending, then replaces it with each choice and its plain line', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        // Rest.
        const p1 = await dungeonPlayer(ctx, 1, STRONG);
        const w1 = await toCamp(p1);
        expect(last(w1)).toEqual({ node: w1.at, kind: 'camp', result: 'pending' });
        expect((await p1.today()).active?.history).toEqual(w1.history);
        const rest = await p1.act(w1, { type: 'camp', choice: 'rest' });
        expect(rest.body.state.history).toHaveLength(w1.history.length);
        expect(last(rest.body.state)).toEqual({
          node: w1.at,
          kind: 'camp',
          result: 'camp',
          choice: 'rest',
          detail: `Rested: standing creatures recovered ${String(RULES.dungeon.camp.restBp / 100)}% HP.`,
        });

        // Keepsake.
        const p2 = await dungeonPlayer(ctx, 2, STRONG);
        const w2 = await toCamp(p2);
        const offer =
          w2.pending?.kind === 'camp' ? (w2.pending.offers[1] as { name: string }) : null;
        const took = await p2.act(w2, {
          type: 'camp',
          choice: 'keepsake',
          keepsake: (offer as { id?: string } | null)?.id as string,
        });
        expect(last(took.body.state)).toEqual({
          node: w2.at,
          kind: 'camp',
          result: 'camp',
          choice: 'keepsake',
          detail: `Took the ${offer?.name ?? ''}.`,
          keepsake: took.body.state.keepsakes.at(-1),
        });

        // Swap, with the names of both creatures in the line (a nickname is plain text).
        const p3 = await dungeonPlayer(ctx, 3, FOUR);
        const [a, b, c, d] = p3.creatureIds as [string, string, string, string];
        ctx.sql.exec('UPDATE creatures SET nickname = ? WHERE id = ?', 'Cindle <b>&', c);
        ctx.sql.exec('UPDATE creatures SET nickname = ? WHERE id = ?', 'Zipmouse', d);
        const s3 = await begin(p3, { team: [a, b, c] });
        const route = routeThrough(mapOf(s3), (n) => n.kind === 'camp') as string[];
        const w3 = await walk(p3, s3, route, (s) => s.pending?.kind === 'camp');
        const swapped = await p3.act(w3, { type: 'camp', choice: 'swap', out: c, in: d });
        expect(last(swapped.body.state)).toEqual({
          node: w3.at,
          kind: 'camp',
          result: 'camp',
          choice: 'swap',
          detail: 'Swapped Cindle <b>& out for Zipmouse.',
        });

        // Home.
        const p4 = await dungeonPlayer(ctx, 4, STRONG);
        const w4 = await toCamp(p4);
        const home = await p4.act(w4, { type: 'home' });
        expect(home.body.state.history).toHaveLength(w4.history.length);
        expect(last(home.body.state)).toEqual({
          node: w4.at,
          kind: 'camp',
          result: 'camp',
          choice: 'home',
          detail: 'Headed home with the pack.',
        });
      },
      opts(),
    );
  });

  it('loads a run stored before the log with an empty history, and goes on from there', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const state = await begin(p);
        const one = (await p.act(state, { type: 'move', node: state.reachable[0] as string })).body
          .state;
        expect(one.history).toHaveLength(1);
        patchState(ctx, state.id, (st) => {
          delete (st as { history?: unknown }).history;
        });
        expect(JSON.parse(runRow(ctx, state.id)?.state_json ?? '{}')).not.toHaveProperty('history');
        const today = await p.today();
        expect(today.active?.history).toEqual([]);
        expect(today.active?.path).toEqual(one.path);
        const two = await p.act(one, { type: 'move', node: one.reachable[0] as string });
        expect(two.status).toBe(200);
        expect(two.body.state.history).toHaveLength(1);
        expect(two.body.state.history[0]).toMatchObject({ node: two.body.state.at });
        // An answer stored before the log reads as an empty log, too.
        const key = newKey();
        const three = await p.act(
          two.body.state,
          { type: 'move', node: two.body.state.reachable[0] as string },
          key,
        );
        const stepRow = rows<{ act_json: string }>(
          ctx.sql,
          'SELECT act_json FROM dungeon_steps WHERE run_id = ? AND idempotency_key = ?',
          state.id,
          key,
        )[0];
        const old = JSON.parse(stepRow?.act_json ?? '{}') as { state: Record<string, unknown> };
        delete old.state['history'];
        ctx.sql.exec(
          'UPDATE dungeon_steps SET act_json = ? WHERE run_id = ? AND idempotency_key = ?',
          JSON.stringify(old),
          state.id,
          key,
        );
        const again = await p.act(
          two.body.state,
          { type: 'move', node: two.body.state.reachable[0] as string },
          key,
        );
        expect(again.status).toBe(200);
        expect(again.body.state.history).toEqual([]);
        expect(three.status).toBe(200);
      },
      opts(),
    );
  });
});

describe('the route on the summary', () => {
  it('is on a cleared run: the map at its depth, the path and the log of every room', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const state = await begin(p);
        const done = await p.play(state);
        const run = done.body.run;
        expect(run?.outcome).toBe('cleared');
        const final = done.body.state as DungeonRunState;
        expect(run?.route).toEqual({ map: state.map, path: final.path, history: final.history });
        expect(run?.route?.history.map((h) => h.node)).toEqual(run?.route?.path);
        expect(run?.route?.history.every((h) => h.result !== 'pending')).toBe(true);
        // It is stored with the summary: today's last run and a later look show the same.
        expect(done.body.today?.last?.route).toEqual(run?.route);
        expect((await p.today()).last?.route).toEqual(run?.route);
        expect((await p.replay(run?.id as string)).body.summary.route).toEqual(run?.route);
      },
      opts(),
    );
  });

  it('is on a run that went home, with the camp’s home entry last', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const waiting = await toCamp(p);
        const res = await p.act(waiting, { type: 'home' });
        const route = res.body.summary?.route;
        expect(route?.map).toEqual(waiting.map);
        expect(route?.path).toEqual(waiting.path);
        expect(route?.history).toEqual(res.body.state.history);
        expect(route?.history.at(-1)).toMatchObject({ kind: 'camp', choice: 'home' });
      },
      opts(),
    );
  });

  it('is on a run that was lost', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const state = await begin(p);
        const mid = await walk(p, state, [], (s) => s.roomsCleared >= 2);
        deadlyFoes();
        const res = await p.act(mid, { type: 'move', node: mid.reachable[0] as string });
        easyAgain();
        const route = res.body.summary?.route;
        expect(res.body.summary?.outcome).toBe('defeat');
        // The foes' HP on the map moved with the deadly rules of this test; the rooms are the run's.
        const shape = (m?: DungeonMapView) => m?.nodes.map((n) => [n.id, n.kind, n.next]);
        expect(shape(route?.map)).toEqual(shape(state.map));
        expect(route?.path).toEqual([...mid.path, res.body.state.at]);
        expect(route?.history).toHaveLength(3);
        expect(route?.history.at(-1)).toMatchObject({ result: 'fight', cleared: false });
      },
      opts(),
    );
  });

  it('is on a run left open that closes on a later day, with the camp still pending when it stood there', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const first = await dungeonPlayer(ctx, 1, STRONG);
        ctx.clock.t = AFTER_RESET;
        const s1 = await begin(first);
        const mid = await walk(first, s1, [], (s) => s.roomsCleared >= 1);
        const second = await dungeonPlayer(ctx, 2, STRONG);
        const camp = await toCamp(second);
        ctx.clock.t = AFTER_RESET + DAY;
        await first.today();
        await second.today();
        const closed = (id: string) =>
          JSON.parse(runRow(ctx, id)?.summary_json ?? '{}') as {
            route?: { map: DungeonMapView; path: string[]; history: DungeonStepLog[] };
          };
        expect(closed(mid.id).route).toEqual({
          map: mid.map,
          path: mid.path,
          history: mid.history,
        });
        const atCamp = closed(camp.id).route;
        expect(atCamp?.history).toEqual(camp.history);
        expect(atCamp?.history.at(-1)).toMatchObject({ kind: 'camp', result: 'pending' });
      },
      opts(),
    );
  });
});

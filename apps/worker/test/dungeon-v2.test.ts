/**
 * The daily dungeon on combat v2 (docs/design/combat/integration.md, sections 5 and 6): a run that starts with the
 * flag on is version 2 to its end, its rooms are v2 fights against `foeAt`, only HP carries, a knocked-out creature
 * stays out until the camp swaps in a fresh one, the replay and the views say `rules: 2` and carry the board events,
 * and a v1 run that began before the flag turned on finishes on v1.
 */
import { combatV2, knownKnacks } from '@creatures/game/combat-v2';
import { createSeededRng, dungeonContent } from '@creatures/game';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunState } from '../src/dungeon-state';
import type {
  DungeonReplayRoomV1,
  DungeonReplayRoomV2,
  DungeonRunState,
} from '../src/dungeon-types';
import { isStoredV2, type RoomResultV2, type StoredFightV2 } from '../src/dungeon-v2';
import { grantFirstTalent } from '../src/talent-v2-store';
import { scaleV2Foes } from './dungeon-v2-reads';
import {
  dungeonPlayer,
  easyFoes,
  followRoute,
  routeThrough,
  type DungeonPlayer,
} from './dungeon-helpers';
import { runCore, type CoreContext } from './helpers';
import { nextGuild, rows } from './raid-helpers';

/** 14:00 in Helsinki on 2027-01-15, after the daily reset: the game day is the 15th. */
const AFTER_RESET = Date.parse('2027-01-15T12:00:00Z');
const STRONG = { level: 30, species: ['tidewing', 'pyrelynx', 'thornbuck'] };
const FOUR = { level: 30, creatures: 4, species: ['tidewing', 'pyrelynx', 'thornbuck', 'voltaro'] };

const opts = (seed: string) => ({
  dungeonRng: createSeededRng(seed),
  gearRng: createSeededRng(`${seed}:gear`),
});
const V2 = (seed: string) => ({ ...opts(seed), combatV2: true });

let restore: () => void = () => undefined;
let restoreV1: () => void = () => undefined;
beforeEach(() => {
  restore = scaleV2Foes(500, 500);
  restoreV1 = easyFoes();
});
afterEach(() => {
  restore();
  restoreV1();
});

/** Every creature learns a v2 talent in slot 1 and the first Knack its form knows (what the staging conversion does, with fixed dice). */
function giveV2(ctx: CoreContext, userId: string): void {
  const rng = createSeededRng('dungeon-v2-talents');
  for (const c of rows<{ id: string; line: string; species: string }>(
    ctx.sql,
    'SELECT id, line, species FROM creatures WHERE user_id = ? ORDER BY caught_at',
    userId,
  )) {
    grantFirstTalent(ctx.sql, rng, {
      creatureId: c.id,
      userId,
      line: c.line,
      now: ctx.clock.t,
    });
    ctx.sql.exec(
      'UPDATE creatures SET knack = ? WHERE id = ?',
      knownKnacks(c.species)[0] ?? null,
      c.id,
    );
  }
}

const runRow = (ctx: CoreContext, runId: string) =>
  rows<{ state_json: string; status: string; outcome: string | null; summary_json: string }>(
    ctx.sql,
    'SELECT state_json, status, outcome, summary_json FROM dungeon_runs WHERE id = ?',
    runId,
  )[0];

const stored = (ctx: CoreContext, runId: string): RunState =>
  JSON.parse(runRow(ctx, runId)?.state_json ?? '{}') as RunState;

function patchState(ctx: CoreContext, runId: string, change: (st: RunState) => void): void {
  const st = stored(ctx, runId);
  change(st);
  ctx.sql.exec('UPDATE dungeon_runs SET state_json = ? WHERE id = ?', JSON.stringify(st), runId);
}

/** The fights a run has stored, in order. */
const steps = (ctx: CoreContext, runId: string) =>
  rows<{ node: string; seed: string; input_json: string; result_json: string }>(
    ctx.sql,
    'SELECT node, seed, input_json, result_json FROM dungeon_steps WHERE run_id = ? AND node IS NOT NULL ORDER BY step',
    runId,
  );

async function begin(p: DungeonPlayer, overrides: Parameters<DungeonPlayer['start']>[0] = {}) {
  const res = await p.start(overrides);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.state;
}

async function walk(
  p: DungeonPlayer,
  state: DungeonRunState,
  route: readonly string[],
  stop: (s: DungeonRunState) => boolean,
): Promise<DungeonRunState> {
  const res = await p.play(state, { pick: followRoute(route), stopWhen: stop });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.state as DungeonRunState;
}

const toCamp = async (p: DungeonPlayer, state: DungeonRunState) => {
  const route = routeThrough(state.map, (n) => n.kind === 'camp') as string[];
  const waiting = await walk(p, state, route, (s) => s.pending?.kind === 'camp');
  expect(waiting.pending?.kind).toBe('camp');
  return waiting;
};

describe('a v2 run', () => {
  it('starts as version 2: its fighters frozen, its max HP the fighters’, the views saying rules 2', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        giveV2(ctx, p.id);
        ctx.clock.t = AFTER_RESET;
        const state = await begin(p);
        expect(state.rules).toBe(2);
        const st = stored(ctx, state.id);
        expect(st.v).toBe(2);
        expect(Object.keys(st.fighters ?? {}).sort()).toEqual([...p.creatureIds].sort());
        // The fighter is the v2 creature: the creature's id is its key, its talent and Knack are in it.
        const first = st.fighters?.[p.creatureIds[0] as string];
        expect(first?.key).toBe(p.creatureIds[0]);
        expect(first?.talents).toHaveLength(1);
        expect(first?.knack).toBe(knownKnacks('tidewing')[0]);
        // The row's max HP is what the fighters have, and nobody is hurt yet.
        for (const member of state.team) {
          expect(member.hpMax).toBe(st.fighters?.[member.id]?.maxHp);
          expect(member.hp).toBe(member.hpMax);
        }
        // The input is the v1 base only for the row: no weather, no rest, no sky.
        expect(JSON.stringify(st.input)).not.toContain('rainHealBp');
        const today = await p.today();
        expect(today.active?.rules).toBe(2);
      },
      V2('v2-start'),
    );
  });

  it('plays a room as a v2 fight against its foe at the run’s depth, stored with its input and its board events', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        giveV2(ctx, p.id);
        ctx.clock.t = AFTER_RESET;
        const state = await begin(p);
        const target = state.reachable[0] as string;
        const res = await p.act(state, { type: 'move', node: target });
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        const room = res.body.room as DungeonReplayRoomV2;
        expect(room.rules).toBe(2);
        expect(room).toMatchObject({ node: target, cleared: true, kind: 'foe' });
        // Board events beside the text, with the fight's own end event, and each creature's HP.
        expect(room.events.some((e) => e.board?.type === 'round')).toBe(true);
        expect(room.events.at(-1)?.board?.type).toBe('end');
        expect(Object.keys(room.hpStart).sort()).toEqual([...p.creatureIds].sort());
        expect(Object.keys(room.hpEnd).sort()).toEqual([...p.creatureIds].sort());
        expect(room.row?.map((r) => r.id)).toEqual(p.creatureIds);
        // The step holds a version 2 input (no carried-HP Map) and a version 2 result.
        const [step] = steps(ctx, state.id);
        const input = JSON.parse(step?.input_json ?? '{}') as StoredFightV2;
        expect(isStoredV2(input)).toBe(true);
        expect(input.input.version).toBe(2);
        expect(input.input.fighters.map((f) => f.key)).toEqual(p.creatureIds);
        expect(input.input.fighters.every((f) => f.row === 0)).toBe(true);
        expect(input.input.fighters.map((f) => f.col)).toEqual([0, 1, 2]);
        expect(input.input.boss.rows).toBe(1);
        expect(input.hpIn).toBeNull();
        const result = JSON.parse(step?.result_json ?? '{}') as RoomResultV2;
        expect(result.version).toBe(2);
        // The foe is the room's foe at the run's depth (the pack's numbers, scaled to the test's strength).
        const foe = dungeonContent.foes.find((f) => f.id === room.foe.id);
        expect(foe).toBeDefined();
        expect(input.input.boss.id).toBe(room.foe.id);
        // The run carries the HP the room left, and the views agree.
        const st = stored(ctx, state.id);
        expect(st.hp).toEqual(result.hpEnd);
        expect(res.body.state.rules).toBe(2);
        expect(res.body.state.team.map((m) => m.hp)).toEqual(
          p.creatureIds.map((id) => result.hpEnd[id]),
        );
      },
      V2('v2-room'),
    );
  });

  it('replays the same fight from the stored input and seed', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        giveV2(ctx, p.id);
        ctx.clock.t = AFTER_RESET;
        const state = await begin(p);
        const first = await p.act(state, { type: 'move', node: state.reachable[0] as string });
        expect(first.status).toBe(200);
        const replay = await p.replay(state.id);
        expect(replay.status).toBe(200);
        expect(replay.body.rules).toBe(2);
        expect(replay.body.rooms).toHaveLength(1);
        const room = replay.body.rooms[0] as DungeonReplayRoomV2;
        expect(room).toEqual(first.body.room);
        expect(room.rules).toBe(2);
        // Two reads are the same, and the summary of the open run says rules 2.
        expect((await p.replay(state.id)).body).toEqual(replay.body);
        expect(replay.body.summary.rules).toBe(2);
        // The stored result is exactly what the stored input and the stored seed give.
        const { fightV2 } = await import('@creatures/engine/v2');
        const [step] = steps(ctx, state.id);
        const input = (JSON.parse(step?.input_json ?? '{}') as StoredFightV2).input;
        const again = fightV2(input, createSeededRng(step?.seed ?? ''));
        const result = JSON.parse(step?.result_json ?? '{}') as RoomResultV2;
        expect(again.won).toBe(result.cleared);
        expect(JSON.parse(JSON.stringify(again.events))).toEqual(result.events);
      },
      V2('v2-replay'),
    );
  });

  it('keeps v1 payloads as they were: no rules key on a v1 run, its view, its rooms or its replay', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        ctx.clock.t = AFTER_RESET;
        const state = await begin(p);
        expect(Object.hasOwn(state, 'rules')).toBe(false);
        const res = await p.act(state, { type: 'move', node: state.reachable[0] as string });
        expect(Object.hasOwn(res.body.state, 'rules')).toBe(false);
        expect(Object.hasOwn(res.body.room ?? {}, 'rules')).toBe(false);
        expect((res.body.room as DungeonReplayRoomV1).names.players).toEqual({ p1: p.name });
        const replay = await p.replay(state.id);
        expect(Object.hasOwn(replay.body, 'rules')).toBe(false);
        expect(stored(ctx, state.id).v).toBe(1);
        expect(Object.hasOwn(stored(ctx, state.id), 'fighters')).toBe(false);
      },
      opts('v1-flag-off'),
    );
  });
});

describe('a v2 day: rooms, a knock-out, the camp swap, the floor boss', () => {
  it('carries only HP between rooms, and a knocked-out creature stays out of the next fight and of the camp’s rest', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, FOUR);
        giveV2(ctx, p.id);
        ctx.clock.t = AFTER_RESET;
        const [a, b, c] = p.creatureIds as [string, string, string, string];
        const state = await begin(p, { team: [a, b, c] });
        expect(state.rules).toBe(2);
        const route = routeThrough(state.map, (n) => n.kind === 'camp') as string[];
        const kindOf = (id: string) => state.map.nodes.find((n) => n.id === id)?.kind;
        // The route has two fights before the camp: the first leaves HP behind, the last one gets a fallen creature.
        const fights = route.filter((id) => kindOf(id) === 'fight');
        expect(fights.length).toBeGreaterThanOrEqual(2);
        const last = route.indexOf(fights.at(-1) as string);
        const before = await walk(
          p,
          state,
          route,
          (s) => s.path.length === last && s.pending === null,
        );
        expect(before.roomsCleared).toBe(1);
        const [firstStep] = steps(ctx, before.id);
        const firstResult = JSON.parse(firstStep?.result_json ?? '{}') as RoomResultV2;
        // What the first room left is what the run carries, and what the next room starts from.
        expect(stored(ctx, before.id).hp).toEqual(firstResult.hpEnd);
        patchState(ctx, before.id, (st) => {
          st.hp = { ...st.hp, [b]: 0 };
        });
        const moved = await p.act(before, { type: 'move', node: route[last] as string });
        expect(moved.status, JSON.stringify(moved.body)).toBe(200);
        const room = moved.body.room as DungeonReplayRoomV2;
        expect(room.hpStart[b]).toBe(0);
        expect(room.hpEnd[b]).toBe(0);
        expect(room.hpStart[a]).toBe(firstResult.hpEnd[a]);
        expect(room.hpStart[c]).toBe(firstResult.hpEnd[c]);
        expect(room.row?.map((r) => r.id)).toEqual([a, b, c]);
        const second = steps(ctx, before.id)[1];
        const input = (JSON.parse(second?.input_json ?? '{}') as StoredFightV2).input;
        // The fallen creature is not in the fight; the one to its right keeps its place in the row.
        expect(input.fighters.map((f) => f.key)).toEqual([a, c]);
        expect(input.fighters.map((f) => f.col)).toEqual([0, 2]);
        // On to the camp: still out, and the camp's rest does not raise it.
        const camp = await toCamp(p, moved.body.state);
        expect(camp.team.find((m) => m.id === b)?.hp).toBe(0);
        const rested = await p.act(camp, { type: 'camp', choice: 'rest' });
        expect(rested.status, JSON.stringify(rested.body)).toBe(200);
        expect(rested.body.state.team.find((m) => m.id === b)?.hp).toBe(0);
        expect(rested.body.state.team.find((m) => m.id === a)?.hp).toBeGreaterThan(0);
      },
      V2('v2-day-knockout'),
    );
  });

  it('swaps a fresh creature in at the camp as a v2 fighter at full HP and fights on to the floor boss', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, FOUR);
        giveV2(ctx, p.id);
        ctx.clock.t = AFTER_RESET;
        const [a, b, c, spare] = p.creatureIds as [string, string, string, string];
        const state = await begin(p, { team: [a, b, c] });
        const camp = await toCamp(p, state);
        // The middle creature is down at the camp; the swap sends it out and the spare in.
        patchState(ctx, camp.id, (st) => {
          st.hp = { ...st.hp, [b]: 0 };
        });
        const swapped = await p.act(camp, { type: 'camp', choice: 'swap', out: b, in: spare });
        expect(swapped.status, JSON.stringify(swapped.body)).toBe(200);
        const team = swapped.body.state.team;
        expect(team.map((m) => m.id)).toEqual([a, spare, c]);
        const incoming = team.find((m) => m.id === spare);
        expect(incoming?.hp).toBe(incoming?.hpMax);
        expect(incoming?.hpMax).toBeGreaterThan(0);
        const st = stored(ctx, camp.id);
        expect(Object.keys(st.fighters ?? {}).sort()).toEqual([a, spare, c].sort());
        expect(st.fighters?.[spare]?.key).toBe(spare);
        // On to the floor boss: it is the last room, and clearing it ends the day (the depth gets locked in).
        const res = await p.play(swapped.body.state, {});
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect(res.body.run).toBeDefined();
        expect(res.body.run?.rules).toBe(2);
        expect(res.body.run?.cleared).toBe(true);
        expect(res.body.run?.outcome).toBe('cleared');
        const all = steps(ctx, camp.id);
        const last = JSON.parse(all.at(-1)?.input_json ?? '{}') as StoredFightV2;
        expect(last.room.kind).toBe('boss');
        // The boss is a floor boss of the pack, the same foe the v1 map held there.
        expect(combatV2.foes[last.input.boss.id]).toBeDefined();
        // The summary lists the rooms played, and the replay shows every one as a v2 room.
        const replay = await p.replay(camp.id);
        expect(replay.body.rooms.every((r) => r.rules === 2)).toBe(true);
        expect(replay.body.summary.rooms.length).toBe(replay.body.rooms.length);
        // The run is over: its stored state keeps its version.
        expect(runRow(ctx, camp.id)?.status).toBe('done');
        expect(stored(ctx, camp.id).v).toBe(2);
      },
      V2('v2-day-swap'),
    );
  });

  it('ends the run lost when the whole team falls in a room', async () => {
    const hard = scaleV2Foes(3_000_000, 3_000_000);
    try {
      await runCore(
        nextGuild(),
        async (ctx) => {
          const p = await dungeonPlayer(ctx, 1, STRONG);
          giveV2(ctx, p.id);
          ctx.clock.t = AFTER_RESET;
          const state = await begin(p);
          const res = await p.act(state, { type: 'move', node: state.reachable[0] as string });
          expect(res.status, JSON.stringify(res.body)).toBe(200);
          expect(res.body.summary?.outcome).toBe('defeat');
          expect(res.body.summary?.rules).toBe(2);
          const room = res.body.room as DungeonReplayRoomV2;
          expect(room.cleared).toBe(false);
          expect(Object.values(room.hpEnd).every((hp) => hp === 0)).toBe(true);
        },
        V2('v2-lost'),
      );
    } finally {
      hard();
    }
  });
});

/** Turns the flag on or off in the running guild object, as a restart with the other value would. */
function setFlag(ctx: CoreContext, on: boolean): void {
  const dungeon = (ctx.core as unknown as { dungeon: { deps: { combatV2?: boolean } } }).dungeon;
  dungeon.deps.combatV2 = on;
}

describe('the rules version is kept to the end of a run', () => {
  it('lets a v1 run that began before the flag turned on finish on v1, and the next day start on v2', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        giveV2(ctx, p.id);
        ctx.clock.t = AFTER_RESET;
        const started = await begin(p);
        expect(Object.hasOwn(started, 'rules')).toBe(false);
        // The flag turns on while the run is open: it carries on as v1, camp and all.
        setFlag(ctx, true);
        const camp = await toCamp(p, started);
        expect(Object.hasOwn(camp, 'rules')).toBe(false);
        const rested = await p.act(camp, { type: 'camp', choice: 'rest' });
        expect(rested.status, JSON.stringify(rested.body)).toBe(200);
        const done = await p.play(rested.body.state, {});
        expect(done.status, JSON.stringify(done.body)).toBe(200);
        expect(done.body.run?.outcome).toBe('cleared');
        expect(Object.hasOwn(done.body.run ?? {}, 'rules')).toBe(false);
        for (const step of steps(ctx, started.id)) {
          const input = JSON.parse(step.input_json) as { input: { version?: number } };
          expect(input.input.version).toBeUndefined();
          expect(Object.hasOwn(JSON.parse(step.result_json) as object, 'version')).toBe(false);
        }
        const replay = await p.replay(started.id);
        expect(Object.hasOwn(replay.body, 'rules')).toBe(false);
        expect(replay.body.rooms.every((r) => r.rules === undefined)).toBe(true);
        expect(stored(ctx, started.id).v).toBe(1);
        // The next game day starts on v2.
        ctx.clock.t = AFTER_RESET + 24 * 60 * 60 * 1000;
        const next = await begin(p);
        expect(next.rules).toBe(2);
        expect(stored(ctx, next.id).v).toBe(2);
      },
      opts('v1-before-flag'),
    );
  });

  it('lets a v2 run finish on v2 after the flag turns off', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        giveV2(ctx, p.id);
        ctx.clock.t = AFTER_RESET;
        const started = await begin(p);
        expect(started.rules).toBe(2);
        setFlag(ctx, false);
        const camp = await toCamp(p, started);
        expect(camp.rules).toBe(2);
        const rested = await p.act(camp, { type: 'camp', choice: 'rest' });
        expect(rested.status, JSON.stringify(rested.body)).toBe(200);
        const done = await p.play(rested.body.state, {});
        expect(done.status, JSON.stringify(done.body)).toBe(200);
        expect(done.body.run?.outcome).toBe('cleared');
        expect(done.body.run?.rules).toBe(2);
        for (const step of steps(ctx, started.id)) {
          expect(isStoredV2(JSON.parse(step.input_json) as StoredFightV2)).toBe(true);
        }
        // The next game day starts on v1 again.
        ctx.clock.t = AFTER_RESET + 24 * 60 * 60 * 1000;
        const next = await begin(p);
        expect(Object.hasOwn(next, 'rules')).toBe(false);
      },
      V2('v2-before-off'),
    );
  });
});

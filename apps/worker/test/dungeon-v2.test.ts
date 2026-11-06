/**
 * The daily dungeon on combat v2 (docs/design/combat/integration.md, sections 5 and 6): a run that starts with the
 * flag on is version 2 to its end, its rooms are v2 fights against `foeAt`, only HP carries, a knocked-out creature
 * stays out between rooms until the camp swaps in a fresh one (the way down into the Undercroft gets it back up), the replay and the views say `rules: 2` and carry the board events,
 * and a v1 run that began before the flag turned on finishes on v1.
 */
import { combatV2, knownKnacks } from '@creatures/game/combat-v2';
import {
  RULES,
  createSeededRng,
  dungeonContent,
  dungeonResourceBp,
  dungeonRunXp,
  scaleBp,
  undercroftDepth,
} from '@creatures/game';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunState } from '../src/dungeon-state';
import type {
  DungeonReplayRoomV1,
  DungeonReplayRoomV2,
  DungeonRunState,
} from '../src/dungeon-types';
import { isStoredV2, type RoomResultV2, type StoredFightV2 } from '../src/dungeon-v2';
import { grantFirstTalent } from '../src/talent-v2-store';
import { giveItem } from './gear-helpers';
import { scaleV2Foes } from './dungeon-v2-reads';
import {
  dungeonPlayer,
  easyFoes,
  followRoute,
  routeThrough,
  type DungeonPlayer,
} from './dungeon-helpers';
import { runCore, type CoreContext } from './helpers';
import { gameDay } from '../src/time';
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
  it('reads no weather in its fights, even on a day with a Boon and an Omen (Misa, 2026-11-04)', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        giveV2(ctx, p.id);
        ctx.clock.t = AFTER_RESET;
        const state = await begin(p);
        const st = stored(ctx, state.id);
        // The valley has a day's weather, but the run stores none of it and its fight input carries none.
        expect(st.weather).toBeNull();
        expect(st.input.luck).toEqual(RULES.combat.luck);
        expect(st.input).not.toHaveProperty('bossAttacks');
        for (const key of ['rainHealBp', 'sky', 'fog', 'bramble']) {
          expect(JSON.stringify(st.input)).not.toContain(key);
        }
      },
      { ...V2('v2-weather'), weather: true },
    );
  });

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

describe('what the v2 screens read: the map’s foe cards, the room’s card, arena and Knacks, today’s rules', () => {
  it('gives each foe on a v2 run’s map its card (its move tiles), on the open run and on the day before it starts', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        giveV2(ctx, p.id);
        ctx.clock.t = AFTER_RESET;
        // Before a run starts with the flag on, today says which rules it will play, and its map has the cards.
        const before = await p.today();
        expect(before.rules).toBe(2);
        const foes = (before.map?.nodes ?? []).flatMap((n) => (n.foe === undefined ? [] : [n.foe]));
        expect(foes.length).toBeGreaterThan(3);
        for (const foe of foes) {
          expect(foe.card, foe.id).toBeDefined();
          expect(foe.card?.plain.label).not.toBe('');
          expect(foe.card?.moves.every((m) => m.name !== '' && m.label !== '')).toBe(true);
        }
        const state = await begin(p);
        expect(state.rules).toBe(2);
        const own = state.map.nodes.flatMap((n) => (n.foe === undefined ? [] : [n.foe]));
        expect(own.every((f) => f.card !== undefined)).toBe(true);
        // The run's own map is the same one, and today with the run open keeps the run's rules.
        expect((await p.today()).active?.map).toEqual(state.map);
        expect((await p.today()).rules).toBe(2);
      },
      V2('v2-map-cards'),
    );
  });

  it('keeps a v1 run’s map and today as they were: no card on a foe, no rules key', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        ctx.clock.t = AFTER_RESET;
        const before = await p.today();
        expect(Object.hasOwn(before, 'rules')).toBe(false);
        const state = await begin(p);
        const foes = state.map.nodes.flatMap((n) => (n.foe === undefined ? [] : [n.foe]));
        expect(foes.length).toBeGreaterThan(3);
        expect(foes.some((f) => Object.hasOwn(f, 'card'))).toBe(false);
      },
      opts('v1-map-no-cards'),
    );
  });

  it('sends a room with the foe’s card, one row of three columns, the foe’s round limit and the row’s Knack names', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        giveV2(ctx, p.id);
        ctx.clock.t = AFTER_RESET;
        const state = await begin(p);
        const res = await p.act(state, { type: 'move', node: state.reachable[0] as string });
        const room = res.body.room as DungeonReplayRoomV2;
        const [step] = steps(ctx, state.id);
        const input = (JSON.parse(step?.input_json ?? '{}') as StoredFightV2).input;
        expect(room.arena).toEqual({ rows: 1, cols: input.boss.cols, rounds: input.boss.rounds });
        expect(room.arena.rows).toBe(1);
        // The card is the foe's as the map shows it for the same node (the same builder).
        const node = state.map.nodes.find((n) => n.id === room.node);
        expect(room.card.moves.map((m) => m.id)).toEqual(
          (node?.foe?.card?.moves ?? []).map((m) => m.id),
        );
        expect(room.card.armour).toBe(node?.foe?.card?.armour);
        // The Knack of each creature, by id and by name, as the pack names it.
        expect(Object.keys(room.knacks).sort()).toEqual([...p.creatureIds].sort());
        for (const id of p.creatureIds) {
          const f = input.fighters.find((x) => x.key === id);
          expect(room.knacks[id]).toBe(combatV2.knacks[f?.knack ?? '']?.name);
        }
      },
      V2('v2-room-card'),
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

  it('a Between-room Rest scarf heals a standing creature before the next room, and a fallen one stays down', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, FOUR);
        giveV2(ctx, p.id);
        ctx.clock.t = AFTER_RESET;
        const [a, b, c] = p.creatureIds as [string, string, string, string];
        // A rest scarf (tier III: 4% of max HP) on the first creature and one on the fallen third; the second wears none.
        for (const id of [a, c]) {
          const scarf = giveItem(ctx.sql, p.id, 'patch-scarf', {
            rarity: 'rare',
            level: 20,
            lines: [['between-room-rest', 2]],
          });
          ctx.sql.exec('UPDATE gear_items SET equipped_on = ? WHERE id = ?', id, scarf);
        }
        const state = await begin(p, { team: [a, b, c] });
        const st = stored(ctx, state.id);
        expect(st.v).toBe(2);
        // The run keeps the rest the way the v1 run does: by creature id, in basis points.
        expect(st.input.rest).toEqual({ [a]: 400, [c]: 400 });
        const route = routeThrough(state.map, (n) => n.kind === 'camp') as string[];
        const kindOf = (id: string) => state.map.nodes.find((n) => n.id === id)?.kind;
        const fights = route.filter((id) => kindOf(id) === 'fight');
        const last = route.indexOf(fights.at(-1) as string);
        const before = await walk(
          p,
          state,
          route,
          (s) => s.path.length === last && s.pending === null,
        );
        const max = (id: string) => stored(ctx, before.id).hpMax[id] ?? 0;
        patchState(ctx, before.id, (s) => {
          s.hp = { [a]: Math.floor(max(a) / 2), [b]: Math.floor(max(b) / 2), [c]: 0 };
        });
        const moved = await p.act(before, { type: 'move', node: route[last] as string });
        expect(moved.status, JSON.stringify(moved.body)).toBe(200);
        const room = moved.body.room as DungeonReplayRoomV2;
        // The scarf's creature starts the room with its share more; the one without it as it was left; the fallen one at 0.
        expect(room.hpStart[a]).toBe(Math.floor(max(a) / 2) + Math.floor((max(a) * 400) / 10_000));
        expect(room.hpStart[b]).toBe(Math.floor(max(b) / 2));
        expect(room.hpStart[c]).toBe(0);
      },
      V2('v2-rest'),
    );
  });

  it('a Between-room Rest never carries a creature above its max HP', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, FOUR);
        giveV2(ctx, p.id);
        ctx.clock.t = AFTER_RESET;
        const [a, b, c] = p.creatureIds as [string, string, string, string];
        const scarf = giveItem(ctx.sql, p.id, 'patch-scarf', {
          rarity: 'rare',
          level: 20,
          lines: [['between-room-rest', 4]],
        });
        ctx.sql.exec('UPDATE gear_items SET equipped_on = ? WHERE id = ?', a, scarf);
        const state = await begin(p, { team: [a, b, c] });
        const route = routeThrough(state.map, (n) => n.kind === 'camp') as string[];
        const kindOf = (id: string) => state.map.nodes.find((n) => n.id === id)?.kind;
        const last = route.indexOf(route.filter((id) => kindOf(id) === 'fight').at(-1) as string);
        const before = await walk(
          p,
          state,
          route,
          (s) => s.path.length === last && s.pending === null,
        );
        const max = stored(ctx, before.id).hpMax[a] ?? 0;
        // One point short of full: the rest fills it and no more.
        patchState(ctx, before.id, (s) => {
          s.hp = { ...s.hp, [a]: max - 1 };
        });
        const moved = await p.act(before, { type: 'move', node: route[last] as string });
        expect((moved.body.room as DungeonReplayRoomV2).hpStart[a]).toBe(max);
      },
      V2('v2-rest-cap'),
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

  it('stores no weather and records no weather use, so its summary and experience never read the day', async () => {
    const hard = scaleV2Foes(3_000_000, 3_000_000);
    try {
      await runCore(
        nextGuild(),
        async (ctx) => {
          const p = await dungeonPlayer(ctx, 1, STRONG);
          giveV2(ctx, p.id);
          ctx.clock.t = AFTER_RESET;
          // A day with a Boon and an Omen that a v1 run would store, name in its summary and log.
          ctx.core.weather.force(
            gameDay(ctx.clock.t, 'Europe/Helsinki', RULES.daily.reset),
            'fair-winds',
            'heatwave',
          );
          const state = await begin(p);
          expect(stored(ctx, state.id).weather).toBeNull();
          const res = await p.act(state, { type: 'move', node: state.reachable[0] as string });
          expect(res.status, JSON.stringify(res.body)).toBe(200);
          expect(res.body.summary?.rules).toBe(2);
          expect(res.body.summary).not.toHaveProperty('weather');
          expect(JSON.parse(runRow(ctx, state.id)?.summary_json ?? '{}')).not.toHaveProperty(
            'weather',
          );
          expect(
            rows(ctx.sql, "SELECT 1 FROM analytics_events WHERE kind = 'weather_use'"),
          ).toHaveLength(0);
        },
        { ...V2('v2-no-weather'), weather: true },
      );
    } finally {
      hard();
    }
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

describe('the descent card and the descent on v2', () => {
  /** Puts a run at the descent card with the first creature down, and answers the run as the server now shows it. */
  async function atDescentWithFallen(ctx: CoreContext, p: DungeonPlayer) {
    ctx.clock.t = AFTER_RESET;
    const state = await begin(p);
    const [down, hurt] = p.creatureIds as [string, string, string];
    patchState(ctx, state.id, (st) => {
      st.pending = { kind: 'descend', level: 1 };
      st.hp = { [down]: 0, [hurt]: 5 };
    });
    const shown = (await p.today()).active as DungeonRunState;
    return { shown, down, hurt };
  }

  it('promises the revive on a v2 run, and the descent gets a knocked-out creature back up (decision 2026-11-04)', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        giveV2(ctx, p.id);
        const { shown, down, hurt } = await atDescentWithFallen(ctx, p);
        expect(shown.rules).toBe(2);
        expect(shown.pending).toMatchObject({
          kind: 'descend',
          reviveBp: RULES.dungeon.undercroft.reviveBp,
        });
        const res = await p.act(shown, { type: 'descend' });
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        const team = res.body.state.team;
        expect(team.find((m) => m.id === down)?.hp).toBeGreaterThan(0);
        // The standing creature still heals its own share.
        expect(team.find((m) => m.id === hurt)?.hp).toBeGreaterThan(5);
        expect(res.body.state.history.at(-1)).toMatchObject({ result: 'descend', revived: 1 });
      },
      V2('v2-descent-revive'),
    );
  });

  it('keeps the v1 promise on a v1 run: the card says the revive share and the descent gets the fallen up', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const { shown, down } = await atDescentWithFallen(ctx, p);
        expect(shown.rules).toBeUndefined();
        expect(shown.pending).toMatchObject({
          kind: 'descend',
          reviveBp: RULES.dungeon.undercroft.reviveBp,
        });
        const res = await p.act(shown, { type: 'descend' });
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect(res.body.state.team.find((m) => m.id === down)?.hp).toBeGreaterThan(0);
        expect(res.body.state.history.at(-1)).toMatchObject({ result: 'descend', revived: 1 });
      },
      opts('v1-descent-revive'),
    );
  });
});

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

describe('v2 rewards grow with depth, the Undercroft by its own depth (Misa, 2026-11-04)', () => {
  const DEEP = 40;
  const setDepth = (ctx: CoreContext, userId: string, depth: number): void => {
    ctx.sql.exec(
      `INSERT INTO dungeon_progress (user_id, depth, first_day) VALUES (?, ?, '2027-01-01')
       ON CONFLICT(user_id) DO UPDATE SET depth = excluded.depth`,
      userId,
      depth,
    );
  };
  const atDescent = (s: DungeonRunState): boolean => s.pending?.kind === 'descend';
  const summaryOf = (ctx: CoreContext, runId: string) =>
    JSON.parse(runRow(ctx, runId)?.summary_json ?? '{}') as {
      pack: {
        found: { bait: number; essence: number; scrap: number };
        kept: { bait: number; essence: number; scrap: number };
      };
      rewards: { experience: { creatureId: string; gained: number }[] };
    };

  it('pays the pack and the experience scaled by depth, and says nothing of it to the player', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        giveV2(ctx, p.id);
        ctx.clock.t = AFTER_RESET;
        setDepth(ctx, p.id, DEEP);
        const state = await begin(p);
        const waiting = (await p.play(state, { stopWhen: atDescent })).body
          .state as DungeonRunState;
        expect(waiting.pending?.kind).toBe('descend');
        const raw = stored(ctx, state.id);
        const res = await p.act(waiting, { type: 'home' });
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        const summary = summaryOf(ctx, state.id);
        const bp = dungeonResourceBp(DEEP);
        expect(bp).toBeGreaterThan(10_000);
        expect(summary.pack.found).toMatchObject({
          bait: scaleBp(raw.pack.bait, bp),
          essence: scaleBp(raw.pack.essence, bp),
          scrap: scaleBp(raw.pack.scrap, bp),
        });
        expect(summary.pack.found.scrap).toBeGreaterThan(raw.pack.scrap);
        expect(summary.pack.kept).toMatchObject(summary.pack.found);
        const topBase = Math.max(0, ...Object.values(raw.earned).map((x) => x.base));
        for (const e of summary.rewards.experience) {
          const earned = raw.earned[e.creatureId];
          expect(e.gained).toBe(dungeonRunXp(earned?.base ?? 0, DEEP, topBase));
        }
        expect(summary.rewards.experience.length).toBeGreaterThan(0);
        // Nothing in the payload names the rule.
        expect(JSON.stringify(res.body)).not.toMatch(/rollsMax|bestOf|best-of|depthRewards/i);
      },
      V2('v2-depth-pack'),
    );
  });

  it('pays a run that went down by the Undercroft depth', async () => {
    const u = RULES.dungeon.undercroft as { depthBonus: number };
    const before = u.depthBonus;
    u.depthBonus = 20;
    try {
      await runCore(
        nextGuild(),
        async (ctx) => {
          const p = await dungeonPlayer(ctx, 1, STRONG);
          giveV2(ctx, p.id);
          ctx.clock.t = AFTER_RESET;
          setDepth(ctx, p.id, DEEP);
          const state = await begin(p);
          const waiting = (await p.play(state, { stopWhen: atDescent })).body
            .state as DungeonRunState;
          const down = await p.act(waiting, { type: 'descend' });
          expect(down.status, JSON.stringify(down.body)).toBe(200);
          const raw = stored(ctx, state.id);
          expect(raw.level).toBe(1);
          ctx.clock.t = AFTER_RESET + 24 * 60 * 60 * 1000;
          ctx.core.dungeon.closeStale();
          const summary = summaryOf(ctx, state.id);
          const deepBp = dungeonResourceBp(undercroftDepth(DEEP, 1));
          expect(deepBp).toBeGreaterThan(dungeonResourceBp(DEEP));
          expect(summary.pack.found.scrap).toBe(scaleBp(raw.pack.scrap, deepBp));
          expect(summary.pack.found.essence).toBe(scaleBp(raw.pack.essence, deepBp));
        },
        V2('v2-depth-under'),
      );
    } finally {
      u.depthBonus = before;
    }
  });
});

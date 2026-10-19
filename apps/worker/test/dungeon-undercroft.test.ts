import {
  RULES,
  createSeededRng,
  dungeonContent,
  dungeonExperience,
  dungeonItemLevel,
  generateDungeonMap,
  keptOnDefeat,
  nodeLoot,
  scaledFoe,
  undercroftBaseFloors,
  type DungeonMapView,
} from '@creatures/game';
import type { DungeonRunInput } from '@creatures/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunState } from '../src/dungeon-state';
import type { DungeonRunState } from '../src/dungeon-types';
import {
  deadlyFoes,
  dungeonPlayer,
  easyFoes,
  routeThrough,
  type DungeonPlayer,
  type Policy,
} from './dungeon-helpers';
import { runCore, type CoreContext } from './helpers';
import { nextGuild, rows } from './raid-helpers';
import { DAY, newKey } from './kit';

/** 14:00 in Helsinki on 2027-01-15, after the daily reset: the game day is the 15th. */
const AFTER_RESET = Date.parse('2027-01-15T12:00:00Z');
const GAME_DAY = '2027-01-15';

const u = RULES.dungeon.undercroft;
/** The depth every test of this file starts at: the Undercroft is open and the boss is no landmark. */
const DEPTH = 8;
/** A landmark depth the Undercroft is open at: the boss chest's gear is certain. */
const LANDMARK = RULES.dungeon.landmarkEvery * 2;

let restore: () => void = () => undefined;
beforeEach(() => {
  restore = easyFoes();
});
afterEach(() => {
  restore();
});

const opts = (seed = 'undercroft-tests') => ({
  dungeonRng: createSeededRng(seed),
  gearRng: createSeededRng(`${seed}:gear`),
});

const STRONG = { level: 30, species: ['tidewing', 'pyrelynx', 'thornbuck'] };

const events = (ctx: CoreContext, kind: string): Record<string, unknown>[] =>
  rows<{ props_json: string }>(
    ctx.sql,
    'SELECT props_json FROM analytics_events WHERE kind = ? ORDER BY id',
    kind,
  ).map((r) => JSON.parse(r.props_json) as Record<string, unknown>);

const runRow = (ctx: CoreContext, runId: string) =>
  rows<{
    status: string;
    outcome: string | null;
    cleared: number;
    state_json: string;
    summary_json: string;
  }>(
    ctx.sql,
    'SELECT status, outcome, cleared, state_json, summary_json FROM dungeon_runs WHERE id = ?',
    runId,
  )[0];

const stored = (ctx: CoreContext, runId: string): RunState =>
  JSON.parse(runRow(ctx, runId)?.state_json ?? '{}') as RunState;

/** Changes the stored state of an open run (a test setting up what the dice would take long to make). */
function patchState(ctx: CoreContext, runId: string, change: (st: RunState) => void): void {
  const st = stored(ctx, runId);
  change(st);
  ctx.sql.exec('UPDATE dungeon_runs SET state_json = ? WHERE id = ?', JSON.stringify(st), runId);
}

const progressOf = (ctx: CoreContext, userId: string) =>
  rows<{ depth: number; runs: number; clears: number; streak: number }>(
    ctx.sql,
    'SELECT depth, runs, clears, streak FROM dungeon_progress WHERE user_id = ?',
    userId,
  )[0];

function setDepth(ctx: CoreContext, userId: string, depth: number): void {
  ctx.sql.exec(
    `INSERT INTO dungeon_progress (user_id, depth, first_day) VALUES (?, ?, '2027-01-01')
     ON CONFLICT(user_id) DO UPDATE SET depth = excluded.depth`,
    userId,
    depth,
  );
}

const grants = (ctx: CoreContext, userId: string) =>
  rows<{ key: string; source: string; result_json: string }>(
    ctx.sql,
    "SELECT key, source, result_json FROM gear_grants WHERE user_id = ? AND key LIKE 'dungeon:%' ORDER BY rowid",
    userId,
  );

const items = (ctx: CoreContext, userId: string) =>
  rows<{ id: string; base_id: string; rarity: string; item_level: number; source: string }>(
    ctx.sql,
    'SELECT id, base_id, rarity, item_level, source FROM gear_items WHERE user_id = ? ORDER BY created_at, id',
    userId,
  );

const ledger = (ctx: CoreContext, userId: string) =>
  rows<{ currency: string; amount: number; idempotency_key: string }>(
    ctx.sql,
    "SELECT currency, amount, idempotency_key FROM ledger WHERE user_id = ? AND source = 'dungeon' ORDER BY id",
    userId,
  );

const fightSteps = (ctx: CoreContext, runId: string) =>
  rows<{ node: string; input_json: string }>(
    ctx.sql,
    'SELECT node, input_json FROM dungeon_steps WHERE run_id = ? AND node IS NOT NULL ORDER BY step',
    runId,
  ).map((r) => ({
    node: r.node,
    input: (JSON.parse(r.input_json) as { input: DungeonRunInput }).input,
  }));

async function begin(p: DungeonPlayer): Promise<DungeonRunState> {
  const res = await p.start();
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.state;
}

/** Plays a run on with the policy until it stops (see `Policy`), and answers the state it stands in. */
async function play(
  p: DungeonPlayer,
  from: DungeonRunState,
  policy: Policy,
): Promise<DungeonRunState> {
  const res = await p.play(from, policy);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.state as DungeonRunState;
}

const atDescent = (s: DungeonRunState): boolean => s.pending?.kind === 'descend';

/** Starts a run at `depth` and plays the main map to the boss: the answer waits at the descent card. */
async function toDescent(
  ctx: CoreContext,
  p: DungeonPlayer,
  depth = DEPTH,
): Promise<DungeonRunState> {
  ctx.clock.t = AFTER_RESET;
  setDepth(ctx, p.id, depth);
  const state = await play(p, await begin(p), { stopWhen: atDescent });
  expect(state.pending?.kind).toBe('descend');
  return state;
}

/** Goes down and answers the state it stands in, before the first room. */
async function descend(p: DungeonPlayer, state: DungeonRunState): Promise<DungeonRunState> {
  const res = await p.act(state, { type: 'descend' });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.state;
}

/** Plays the level on to its keeper (or whatever ends it), and answers the state after the keeper. */
const throughLevel = (p: DungeonPlayer, state: DungeonRunState): Promise<DungeonRunState> =>
  play(p, state, { stopWhen: (s) => s.status === 'done' || atDescent(s) });

/** The map of the level the run stands in. */
const levelMap = (s: DungeonRunState): DungeonMapView =>
  s.undercroft?.maps.at(s.level - 1) ?? s.map;

const summaryOf = (ctx: CoreContext, runId: string) =>
  JSON.parse(runRow(ctx, runId)?.summary_json ?? '{}') as {
    outcome: string;
    cleared: boolean;
    newDepth: number;
    deepest: number;
    roomsCleared: number;
    pack: {
      found: { bait: number; essence: number; scrap: number };
      kept: { bait: number; essence: number; scrap: number };
    };
    rewards: {
      bait: number;
      essence: number;
      gear: { id: string; baseId: string; rarity: string }[];
      converted: unknown[];
      supplies: string[];
      parts: Record<string, number>;
      landmark: boolean;
      experience: { gained: number; creatureId: string }[];
    };
    route?: { map: DungeonMapView; path: string[]; undercroft?: DungeonMapView[] };
    path: string[];
  };

describe('the descent after the floor boss', () => {
  it('ends the run cleared as before below depth 8 (the Undercroft is closed)', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        ctx.clock.t = AFTER_RESET;
        setDepth(ctx, p.id, u.fromDepth - 1);
        const end = await p.run();
        expect(end.status).toBe(200);
        expect(end.body.state.outcome).toBe('cleared');
        expect(end.body.run).toMatchObject({ cleared: true, newDepth: u.fromDepth, deepest: 0 });
        expect(end.body.state.undercroft).toBeNull();
        // The chest is paid with the run (no early grant), as always.
        expect(grants(ctx, p.id).map((g) => g.key)).toEqual([`dungeon:${GAME_DAY}:1`]);
        expect(events(ctx, 'dungeon_descend')).toEqual([]);
      },
      opts(),
    );
  });

  it('offers the way down instead of ending: depth locked in at once, the pack and the chest banked', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const state = await toDescent(ctx, p, LANDMARK);
        expect(state.status).toBe('active');
        expect(state.outcome).toBeNull();
        expect(state.reachable).toEqual([]);
        // Depth + 1 is in the player's progress already; the run has not ended (no run is counted yet).
        expect(progressOf(ctx, p.id)).toMatchObject({ depth: LANDMARK + 1, runs: 0, clears: 0 });
        // What the pending card knows: the level, its floors, "fiercer", the breath, what is banked.
        const card = state.pending;
        expect(card?.kind).toBe('descend');
        if (card?.kind !== 'descend') return;
        expect(card).toMatchObject({
          level: 1,
          depthBonus: u.depthBonus,
          catchBreathBp: u.catchBreathBp,
          reviveBp: u.reviveBp,
          newDepth: LANDMARK + 1,
        });
        // 2 floors for the first landmark passed, plus one per landmark after it, plus the keeper.
        expect(card.floors).toBe(
          undercroftBaseFloors(LANDMARK, 1) + 1 + (state.undercroft?.marks ?? 0),
        );
        // The landmark chest: its gear is certain, banked at once in the player's stock, with the glimmer.
        expect(card.banked.gear).toHaveLength(1);
        expect(card.banked.supplies).toHaveLength(1);
        expect(items(ctx, p.id)).toHaveLength(1);
        expect(items(ctx, p.id)[0]).toMatchObject({ source: 'dungeon' });
        expect(grants(ctx, p.id).map((g) => g.key)).toEqual([`dungeon:${GAME_DAY}:1:chest`]);
        // Its Essence and scrap are in the pack, at risk, with the landmark's extras.
        const boss = nodeLoot('boss');
        expect(state.pack.essence).toBeGreaterThanOrEqual(
          boss.essence + RULES.dungeon.fullClear.essence + RULES.dungeon.landmark.essence,
        );
        expect(state.pack.scrap).toBeGreaterThanOrEqual(boss.scrap + RULES.dungeon.landmark.scrap);
        const chest = state.history.find((h) => h.kind === 'boss' && h.result === 'chest');
        expect(chest).toMatchObject({ level: 0, gear: [{}] });
        // The chest entry carries only what the chest adds, not the boss's own loot (the fight's entry has it).
        expect(chest).toMatchObject({
          loot: {
            bait: 0,
            essence: RULES.dungeon.fullClear.essence + RULES.dungeon.landmark.essence,
            scrap: RULES.dungeon.landmark.scrap,
          },
        });
        const bossFight = state.history.find((h) => h.kind === 'boss' && h.result === 'fight');
        expect(bossFight).toMatchObject({ loot: nodeLoot('boss') });
        expect(state.history.at(-1)).toMatchObject({
          kind: 'descend',
          result: 'pending',
          level: 1,
        });
        // Nothing of the pack is paid yet.
        expect(ledger(ctx, p.id)).toEqual([]);
        expect(runRow(ctx, state.id)?.status).toBe('active');
        // `today` shows the run's own depth while it is open (the progress holds depth + 1 already) ...
        const open = await p.today();
        expect(open).toMatchObject({ depth: LANDMARK, landmark: true, canRun: false });
        expect(open.landmarkBoss?.depth).toBe(LANDMARK);
        expect(open.active?.depth).toBe(LANDMARK);
        expect(open.map).toEqual(open.active?.map);
        // ... and the depth it won once it is over.
        const home = await p.act(state, { type: 'home' });
        expect(home.status).toBe(200);
        expect(await p.today()).toMatchObject({ depth: LANDMARK + 1, active: null });
      },
      opts(),
    );
  });

  it('heading home ends the run cleared with the whole pack, the chest once, and the depth won', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const state = await toDescent(ctx, p, LANDMARK);
        const res = await p.act(state, { type: 'home' });
        expect(res.status).toBe(200);
        expect(res.body.state).toMatchObject({ status: 'done', outcome: 'cleared' });
        const summary = res.body.summary;
        expect(summary).toMatchObject({
          outcome: 'cleared',
          cleared: true,
          deepest: 0,
          newDepth: LANDMARK + 1,
        });
        expect(summary?.pack).toEqual({ found: state.pack, kept: state.pack });
        // The chest's gear is in the rewards once (not paid twice), with the supply and the landmark flag.
        expect(summary?.rewards.gear).toHaveLength(1);
        expect(summary?.rewards.supplies).toHaveLength(1);
        expect(summary?.rewards.landmark).toBe(true);
        expect(items(ctx, p.id)).toHaveLength(1);
        expect(items(ctx, p.id)[0]?.id).toBe(summary?.rewards.gear[0]?.id);
        expect(grants(ctx, p.id).map((g) => g.key)).toEqual([
          `dungeon:${GAME_DAY}:1:chest`,
          `dungeon:${GAME_DAY}:1`,
        ]);
        // The pack is paid through the ledger, whole.
        const paid = ledger(ctx, p.id);
        expect(paid.find((l) => l.currency === 'bait')?.amount).toBe(state.pack.bait);
        expect(paid.find((l) => l.currency === 'essence')?.amount).toBe(state.pack.essence);
        expect(progressOf(ctx, p.id)).toMatchObject({ depth: LANDMARK + 1, runs: 1, clears: 1 });
        expect(events(ctx, 'dungeon_run')[0]).toMatchObject({
          outcome: 'cleared',
          deepest: 0,
          marks: [],
          cleared: true,
        });
        // A second home is refused (the run is over).
        const again = await p.act(state, { type: 'home' });
        expect(again.status).toBe(409);
      },
      opts(),
    );
  });

  it('pays the full-clear experience to the row that beat the boss, even if the Undercroft is lost', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, { ...STRONG, level: 12 });
        const state = await toDescent(ctx, p);
        const down = await descend(p, state);
        restore();
        restore = deadlyFoes();
        const res = await p.act(down, { type: 'move', node: down.reachable[0] as string });
        expect(res.body.state).toMatchObject({ status: 'done', outcome: 'defeat' });
        const exp = res.body.summary?.rewards.experience ?? [];
        expect(exp).toHaveLength(3);
        const fights = state.roomsCleared;
        for (const e of exp) expect(e.gained).toBe(dungeonExperience(fights, true, false));
      },
      opts(),
    );
  });
});

describe('going down', () => {
  it('draws the level with live dice, labels it, stands before its first floor and heals a little', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const state = await toDescent(ctx, p);
        // Hurt the row so the breath shows.
        patchState(ctx, state.id, (st) => {
          st.hp = Object.fromEntries(st.input.team.map((s) => [s.id, 10]));
        });
        const before = stored(ctx, state.id);
        const res = await p.act(state, { type: 'descend' });
        expect(res.status).toBe(200);
        const down = res.body.state;
        expect(down).toMatchObject({ level: 1, status: 'active', pending: null, at: null });
        const map = levelMap(down);
        expect(map).toMatchObject({
          level: 1,
          label: 'Undercroft 1',
        });
        expect(map.nodes.every((n) => /^u1f\d+l\d$/.test(n.id))).toBe(true);
        expect(down.undercroft?.maps).toHaveLength(1);
        // Reachable across levels: the new map's floor 0, and nothing of the main map.
        expect(down.reachable.sort()).toEqual(
          map.nodes
            .filter((n) => n.floor === 0)
            .map((n) => n.id)
            .sort(),
        );
        expect(down.map.nodes.some((n) => down.reachable.includes(n.id))).toBe(false);
        // The map's floors: the base, the marks, the keeper.
        expect(map.floors).toBe(2 + (down.undercroft?.marks ?? 0) + 1);
        // The breath: 20% of max HP for every standing creature.
        for (const t of down.team) {
          expect(t.hp).toBe(
            Math.min(t.hpMax, 10 + Math.floor((t.hpMax * u.catchBreathBp) / 10_000)),
          );
        }
        const healed = down.team.reduce((n, t) => n + t.hp - 10, 0);
        expect(down.history.at(-1)).toMatchObject({
          kind: 'descend',
          result: 'descend',
          level: 1,
          healed,
          revived: 0,
        });
        expect(down.history.filter((h) => h.kind === 'descend')).toHaveLength(1);
        expect(stored(ctx, state.id).under).toHaveLength(1);
        expect(before.under).toHaveLength(0);
        expect(events(ctx, 'dungeon_descend')).toEqual([{ level: 1 }]);
        // The depth stays what the boss won; the pack is as it was.
        expect(down.pack).toEqual(state.pack);
        expect(progressOf(ctx, p.id)?.depth).toBe(DEPTH + 1);
      },
      opts(),
    );
  });

  it('gets the fallen back up on the way, at the revive share of max HP, and says how many', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const state = await toDescent(ctx, p);
        const ids = state.team.map((t) => t.id);
        patchState(ctx, state.id, (st) => {
          st.hp = { [ids[0] as string]: 0, [ids[1] as string]: 5, [ids[2] as string]: 5 };
        });
        const down = await descend(p, state);
        const first = down.team.find((t) => t.id === ids[0]);
        expect(first?.hp).toBe(
          Math.max(1, Math.floor(((first?.hpMax ?? 0) * u.reviveBp) / 10_000)),
        );
        // A standing creature still heals its own share, not the revive's.
        const second = down.team.find((t) => t.id === ids[1]);
        expect(second?.hp).toBe(
          Math.min(
            second?.hpMax ?? 0,
            5 + Math.floor(((second?.hpMax ?? 0) * u.catchBreathBp) / 10_000),
          ),
        );
        expect(down.history.at(-1)).toMatchObject({ result: 'descend', revived: 1 });
      },
      opts(),
    );
  });

  it('fights its foes three depths harder, and puts twice the loot in the pack', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const state = await toDescent(ctx, p);
        const down = await descend(p, state);
        const room = levelMap(down).nodes.find((n) => n.id === down.reachable[0]);
        expect(room?.kind).toBe('fight');
        const res = await p.act(down, { type: 'move', node: down.reachable[0] as string });
        expect(res.status).toBe(200);
        const spec = fightSteps(ctx, state.id).at(-1)?.input.rooms[0];
        const foe = dungeonContent.foes.find((f) => f.id === room?.foe?.id);
        expect(spec?.hp).toBe(scaledFoe(foe as NonNullable<typeof foe>, DEPTH + u.depthBonus).hp);
        expect(spec?.atk).toBe(scaledFoe(foe as NonNullable<typeof foe>, DEPTH + u.depthBonus).atk);
        expect(room?.foe?.hpMax).toBe(spec?.hp);
        // Twice a main-map fight's loot.
        const gained = {
          bait: res.body.state.pack.bait - down.pack.bait,
          essence: res.body.state.pack.essence - down.pack.essence,
          scrap: res.body.state.pack.scrap - down.pack.scrap,
        };
        expect(gained).toEqual({
          bait: RULES.dungeon.loot.fight.bait * u.lootMultiplier,
          essence: 0,
          scrap: 0,
        });
        expect(res.body.room?.node).toBe(down.reachable[0]);
        // The replay shows the fights of every level in order, with the main map's first.
        const replay = await p.replay(state.id);
        expect(replay.status).toBe(200);
        expect(replay.body.rooms.at(-1)?.node).toBe(down.reachable[0]);
        expect(replay.body.rooms.length).toBe(state.roomsCleared + 1);
      },
      opts(),
    );
  });

  it('is refused when no descent is waiting, or while one is waiting for a move', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        ctx.clock.t = AFTER_RESET;
        const fresh = await begin(p);
        const none = await p.act(fresh, { type: 'descend' });
        expect(none.status).toBe(400);
        expect(none.body.error).toBe('invalid_act');
        setDepth(ctx, p.id, DEPTH);
        // (A run of depth 1 is open; walk a second one on another day.)
        const state = await toDescentOnNewDay(ctx, p, fresh);
        const move = await p.act(state, { type: 'move', node: 'f0l0' });
        expect(move.status).toBe(400);
        expect(move.body.error).toBe('invalid_act');
        const camp = await p.act(state, { type: 'camp', choice: 'rest' });
        expect(camp.status).toBe(400);
        const event = await p.act(state, { type: 'event', option: 0 });
        expect(event.status).toBe(400);
        // Unknown keys are refused by the strict schema.
        const extra = await p.call('POST', '/api/dungeon/act', {
          runId: state.id,
          step: state.step,
          idempotencyKey: newKey(),
          act: { type: 'descend', level: 3 },
        });
        expect(extra.status).toBe(400);
        // A stale step and another player's run.
        const stale = await p.act(state, { type: 'descend' }, newKey(), state.step + 1);
        expect(stale.status).toBe(409);
        expect(stale.body.error).toBe('stale_step');
        const other = await dungeonPlayer(ctx, 2, STRONG);
        const theirs = await other.act(state, { type: 'descend' });
        expect(theirs.status).toBe(404);
      },
      opts(),
    );
  });

  it('answers a retry of the same act with the same level, drawing and counting nothing twice', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const state = await toDescent(ctx, p);
        const key = newKey();
        const first = await p.act(state, { type: 'descend' }, key);
        const again = await p.act(state, { type: 'descend' }, key);
        expect(again.status).toBe(200);
        expect(again.body.state).toEqual(first.body.state);
        expect(stored(ctx, state.id).under).toHaveLength(1);
        expect(events(ctx, 'dungeon_descend')).toHaveLength(1);
        // The same key for another act is a conflict.
        const other = await p.act(first.body.state, { type: 'home' }, key);
        expect(other.status).toBe(409);
      },
      opts(),
    );
  });
});

/** The descent card of a new run on the next game day, for a player who still has the first run open. */
async function toDescentOnNewDay(
  ctx: CoreContext,
  p: DungeonPlayer,
  open: DungeonRunState,
): Promise<DungeonRunState> {
  void open;
  ctx.clock.t += DAY;
  const day = await p.today(); // closes the old run as a defeat
  void day;
  setDepth(ctx, p.id, DEPTH);
  const state = await play(p, await begin(p), { stopWhen: atDescent });
  return state;
}

// --- Rooms of the Undercroft ---

/** The stored level map's crack, set by a test that needs the keeper to open another level (or not). */
function setCrack(ctx: CoreContext, runId: string, level: number, value: boolean): void {
  patchState(ctx, runId, (st) => {
    (st.under[level - 1] as { crack?: boolean }).crack = value;
  });
}

/** The route from the level's entrance to the first room of `kind`. */
const routeTo = (state: DungeonRunState, kind: string): string[] =>
  routeThrough(levelMap(state), (n) => n.kind === kind) as string[];

/** A policy `pick` for a level: follow `route` (its nodes are the level's), then take the first room there is. */
const follow =
  (route: readonly string[], offset: number): NonNullable<Policy['pick']> =>
  (s) =>
    route[s.path.length - offset] ?? (s.reachable[0] as string);

/** Walks the level along `route` until the last node of it can be moved to. */
async function walkTo(
  p: DungeonPlayer,
  state: DungeonRunState,
  route: readonly string[],
): Promise<DungeonRunState> {
  const last = route.at(-1) as string;
  return play(p, state, {
    pick: follow(route, state.path.length),
    stopWhen: (s) => s.reachable.includes(last),
  });
}

/** Goes down with `marks` (what a carved door added) and answers the state before the first room. */
async function descendWith(
  ctx: CoreContext,
  p: DungeonPlayer,
  marks: ('fight' | 'elite' | 'mystery' | 'cache' | 'camp' | 'epic')[],
  depth = DEPTH,
): Promise<{ state: DungeonRunState; down: DungeonRunState }> {
  const state = await toDescent(ctx, p, depth);
  patchState(ctx, state.id, (st) => {
    st.marks = marks;
  });
  return { state, down: await descend(p, state) };
}

describe('the rooms of the Undercroft', () => {
  it('plays an epic fight at boss strength: its loot, a keepsake, shown as fierce', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const { down } = await descendWith(ctx, p, ['epic']);
        const level = levelMap(down);
        const epic = level.nodes.find((n) => n.kind === 'epic');
        expect(epic?.foe).toMatchObject({ elite: true, kind: 'foe' });
        const at = await walkTo(p, down, routeTo(down, 'epic'));
        const elitesBefore = stored(ctx, at.id).elites;
        const res = await p.act(at, { type: 'move', node: epic?.id as string });
        expect(res.status).toBe(200);
        expect(res.body.room).toMatchObject({ epic: true, elite: true, cleared: true });
        // Its own loot goes in the pack (not doubled), and a keepsake is a gift of the room.
        const gained = {
          bait: res.body.state.pack.bait - at.pack.bait,
          essence: res.body.state.pack.essence - at.pack.essence,
          scrap: res.body.state.pack.scrap - at.pack.scrap,
        };
        expect(gained).toEqual(u.epic.loot);
        expect(res.body.state.keepsakes.length).toBe(at.keepsakes.length + 1);
        expect(res.body.state.history.at(-1)).toMatchObject({
          kind: 'epic',
          result: 'fight',
          cleared: true,
        });
        expect(stored(ctx, at.id).elites).toBe(elitesBefore);
        const spec = fightSteps(ctx, down.id).at(-1)?.input.rooms[0];
        const foe = dungeonContent.foes.find((f) => f.id === epic?.foe?.id);
        const scaled = scaledFoe(foe as NonNullable<typeof foe>, DEPTH + u.depthBonus);
        expect(spec).toMatchObject({
          epic: true,
          elite: true,
          hp: Math.floor((scaled.hp * u.epic.hpBp) / 10_000),
          atk: Math.floor((scaled.atk * u.epic.atkBp) / 10_000),
        });
        expect(epic?.foe?.hpMax).toBe(spec?.hp);
        const replay = await p.replay(down.id);
        expect(replay.body.rooms.at(-1)).toMatchObject({ epic: true, elite: true });
      },
      opts(),
    );
  });

  it('has a camp only when the door added one, and heads home from it with the whole pack, cleared', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const { down } = await descendWith(ctx, p, ['camp']);
        const camp = levelMap(down).nodes.find((n) => n.kind === 'camp');
        expect(camp?.floor).toBe(2);
        const at = await walkTo(p, down, routeTo(down, 'camp'));
        const waiting = await p.act(at, { type: 'move', node: camp?.id as string });
        expect(waiting.body.state.pending?.kind).toBe('camp');
        // The keeper is still ahead: the camp is the only way home down here.
        const home = await p.act(waiting.body.state, { type: 'home' });
        expect(home.status).toBe(200);
        expect(home.body.state).toMatchObject({ status: 'done', outcome: 'cleared' });
        expect(home.body.summary?.pack?.kept).toEqual(home.body.summary?.pack?.found);
        expect(home.body.summary).toMatchObject({ deepest: 0, newDepth: DEPTH + 1 });
        expect(home.body.state.history.at(-1)).toMatchObject({ kind: 'camp', choice: 'home' });
      },
      opts(),
    );
    // No marks, no camp.
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const { down } = await descendWith(ctx, p, []);
        expect(levelMap(down).nodes.some((n) => n.kind === 'camp')).toBe(false);
      },
      opts(),
    );
  });

  it('refuses heading home anywhere else in the Undercroft', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const { down } = await descendWith(ctx, p, []);
        const res = await p.act(down, { type: 'home' });
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('invalid_act');
        const fought = await p.act(down, { type: 'move', node: down.reachable[0] as string });
        const again = await p.act(fought.body.state, { type: 'home' });
        expect(again.status).toBe(400);
      },
      opts(),
    );
  });

  it('plays a mystery room and a cache of a marked floor like the main map does (a cache pays twice)', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const { down } = await descendWith(ctx, p, ['cache', 'mystery']);
        const cache = levelMap(down).nodes.find((n) => n.kind === 'cache' && n.lane === 1);
        const at = await walkTo(p, down, routeTo(down, 'cache').slice(0, 1).concat([]));
        void at;
        const toCache = routeThroughSingle(down, 'cache');
        const there = await walkTo(p, down, toCache);
        const res = await p.act(there, { type: 'move', node: cache?.id as string });
        expect(res.body.state.pack.bait - there.pack.bait).toBe(
          RULES.dungeon.loot.cache.bait * u.lootMultiplier,
        );
        expect(res.body.state.pack.scrap - there.pack.scrap).toBe(
          RULES.dungeon.loot.cache.scrap * u.lootMultiplier,
        );
        const mystery = levelMap(res.body.state).nodes.find(
          (n) => n.kind === 'mystery' && n.lane === 1,
        );
        const next = await walkTo(p, res.body.state, [mystery?.id as string]);
        const room = await p.act(next, { type: 'move', node: mystery?.id as string });
        expect(room.body.state.pending?.kind).toBe('event');
      },
      opts(),
    );
  });
});

/** A route to the single-room floor of `kind` (the marked floor): any route to it. */
function routeThroughSingle(state: DungeonRunState, kind: string): string[] {
  return routeThrough(levelMap(state), (n) => n.kind === kind && n.lane === 1) as string[];
}

// --- The keeper, the chest and the cracked floor ---

describe('the keeper and its chest', () => {
  it('pays the Undercroft chest: Essence and scrap in the pack, gear paid at once, and the run ends cleared', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const chest = RULES.dungeon.undercroft.chest as { gearBp: number };
        const before = chest.gearBp;
        chest.gearBp = 10_000;
        try {
          const p = await dungeonPlayer(ctx, 1, STRONG);
          const { state, down } = await descendWith(ctx, p, []);
          setCrack(ctx, state.id, 1, false);
          const end = await throughLevel(p, down);
          expect(end).toMatchObject({ status: 'done', outcome: 'cleared', level: 1 });
          const row = runRow(ctx, state.id);
          expect(row).toMatchObject({ status: 'done', outcome: 'cleared', cleared: 1 });
          const summary = summaryOf(ctx, state.id);
          expect(summary).toMatchObject({
            outcome: 'cleared',
            cleared: true,
            deepest: 1,
            newDepth: DEPTH + 1,
          });
          // The keeper's chest: Essence and scrap in the pack (the keeper's own room), whole at the end.
          const keeperLoot = nodeLoot('boss', 1);
          expect(keeperLoot).toEqual({ bait: 0, essence: u.chest.essence, scrap: u.chest.scrap });
          const history = end.history.filter((h) => h.kind === 'boss' && h.result === 'chest');
          expect(history.map((h) => (h.result === 'chest' ? h.level : -1))).toEqual([0, 1]);
          // A chest entry is only what the chest adds: the keeper's chest adds no loot (its Essence and
          // scrap are on its fight entry), so the history's loot sums to the pack exactly.
          const keeperChest = history.find((h) => h.result === 'chest' && h.level === 1);
          expect(keeperChest).toMatchObject({ loot: { bait: 0, essence: 0, scrap: 0 } });
          const sum = { bait: 0, essence: 0, scrap: 0 };
          for (const h of end.history) {
            if ('loot' in h) {
              sum.bait += h.loot.bait;
              sum.essence += h.loot.essence;
              sum.scrap += h.loot.scrap;
            }
          }
          expect(sum).toEqual(end.pack);
          expect(summary.pack.kept).toEqual(summary.pack.found);
          expect(summary.pack.found.essence).toBeGreaterThanOrEqual(
            RULES.dungeon.loot.boss.essence + RULES.dungeon.fullClear.essence + u.chest.essence,
          );
          expect(summary.pack.found.scrap).toBeGreaterThanOrEqual(
            RULES.dungeon.loot.boss.scrap + u.chest.scrap,
          );
          // The gear: paid once under its own key, at the dungeon's item level plus the chest's bonus.
          const keys = grants(ctx, p.id).map((g) => g.key);
          expect(keys).toEqual([
            `dungeon:${GAME_DAY}:1:chest`,
            `dungeon:${GAME_DAY}:1:u1`,
            `dungeon:${GAME_DAY}:1`,
          ]);
          expect(new Set(keys).size).toBe(keys.length);
          const chestItem = items(ctx, p.id).find(
            (i) => i.item_level === dungeonItemLevel(DEPTH, false) + u.chest.itemLevelBonus,
          );
          expect(chestItem).toBeDefined();
          expect(summary.rewards.gear.map((g) => g.id)).toContain(chestItem?.id);
          expect(items(ctx, p.id).length).toBe(summary.rewards.gear.length);
          expect(summary.rewards.supplies).toHaveLength(1);
          expect(summary.route?.undercroft).toHaveLength(1);
          expect(summary.route?.path.length).toBe(end.path.length);
          expect(end.path.some((id) => id.startsWith('u1'))).toBe(true);
          // The ledger is paid once with the stable keys.
          const keysPaid = ledger(ctx, p.id).map((l) => l.idempotency_key);
          expect(new Set(keysPaid).size).toBe(keysPaid.length);
          expect(events(ctx, 'dungeon_run')[0]).toMatchObject({ outcome: 'cleared', deepest: 1 });
          expect(progressOf(ctx, p.id)).toMatchObject({ depth: DEPTH + 1, runs: 1, clears: 1 });
        } finally {
          chest.gearBp = before;
        }
      },
      opts(),
    );
  });

  it('opens another descent when the keeper had a cracked floor, down to the deepest level and no further', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const { state, down } = await descendWith(ctx, p, []);
        setCrack(ctx, state.id, 1, true);
        expect((await refresh(p, state.id)).undercroft?.maps[0]?.crack).toBe(true);
        // Level 1's keeper falls: another way down, into a level of two floors and its keeper.
        const second = await throughLevel(p, down);
        expect(second.status).toBe('active');
        expect(second.pending).toMatchObject({
          kind: 'descend',
          level: 2,
          floors: u.deeperFloors + 1,
          depthBonus: u.depthBonus,
          newDepth: DEPTH + 1,
        });
        // The chest of level 1 is banked, and its pack is at risk still.
        expect(grants(ctx, p.id).map((g) => g.key)).toContain(`dungeon:${GAME_DAY}:1:u1`);
        expect(ledger(ctx, p.id)).toEqual([]);
        expect(stored(ctx, state.id).deepest).toBe(1);
        // Down again: its foes are fiercer again (three more depths) and it is labelled.
        const level2 = await descend(p, second);
        expect(level2).toMatchObject({ level: 2 });
        expect(levelMap(level2)).toMatchObject({ level: 2, floors: u.deeperFloors + 1 });
        expect(levelMap(level2).label).toContain('Undercroft 2');
        expect(level2.undercroft?.maps).toHaveLength(2);
        expect(level2.reachable.every((id) => id.startsWith('u2'))).toBe(true);
        setCrack(ctx, state.id, 2, true);
        const room = levelMap(level2).nodes.find((n) => n.id === level2.reachable[0]);
        await p.act(level2, { type: 'move', node: level2.reachable[0] as string });
        const spec = fightSteps(ctx, state.id).at(-1)?.input.rooms[0];
        const foe = dungeonContent.foes.find((f) => f.id === room?.foe?.id);
        expect(spec?.hp).toBe(
          scaledFoe(foe as NonNullable<typeof foe>, DEPTH + 2 * u.depthBonus).hp,
        );
        // Level 2 had a crack too: the third level, which can never crack.
        const third = await throughLevel(p, await refresh(p, state.id));
        expect(third.pending).toMatchObject({ kind: 'descend', level: 3 });
        const level3 = await descend(p, third);
        expect(levelMap(level3).crack).toBeUndefined();
        expect(stored(ctx, state.id).under[2]?.crack).toBe(false);
        const end = await throughLevel(p, level3);
        expect(end).toMatchObject({ status: 'done', outcome: 'cleared' });
        expect(summaryOf(ctx, state.id)).toMatchObject({ deepest: 3, outcome: 'cleared' });
        expect(summaryOf(ctx, state.id).route?.undercroft).toHaveLength(3);
        expect(events(ctx, 'dungeon_descend')).toEqual([{ level: 1 }, { level: 2 }, { level: 3 }]);
        expect(grants(ctx, p.id).map((g) => g.key)).toEqual([
          `dungeon:${GAME_DAY}:1:chest`,
          `dungeon:${GAME_DAY}:1:u1`,
          `dungeon:${GAME_DAY}:1:u2`,
          `dungeon:${GAME_DAY}:1:u3`,
          `dungeon:${GAME_DAY}:1`,
        ]);
      },
      opts(),
    );
  });

  it('heads home from the second descent with the whole pack, having cleared one level', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const { state, down } = await descendWith(ctx, p, []);
        setCrack(ctx, state.id, 1, true);
        const second = await throughLevel(p, down);
        expect(second.pending?.kind).toBe('descend');
        const res = await p.act(second, { type: 'home' });
        expect(res.body.state).toMatchObject({ status: 'done', outcome: 'cleared' });
        expect(res.body.summary).toMatchObject({ deepest: 1, outcome: 'cleared' });
        expect(res.body.summary?.pack?.kept).toEqual(second.pack);
      },
      opts(),
    );
  });
});

/** The current state of a run, from today (the map and everything). */
async function refresh(p: DungeonPlayer, runId: string): Promise<DungeonRunState> {
  const today = await p.today();
  expect(today.active?.id).toBe(runId);
  return today.active as DungeonRunState;
}

// --- Defeat, depth and runs left open ---

describe('losing in the Undercroft', () => {
  it('keeps half the pack, the depth the boss won and the chest gear already banked', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const { state, down } = await descendWith(ctx, p, [], LANDMARK);
        const gearBefore = items(ctx, p.id);
        expect(gearBefore).toHaveLength(1);
        restore();
        restore = deadlyFoes();
        const res = await p.act(down, { type: 'move', node: down.reachable[0] as string });
        expect(res.body.state).toMatchObject({ status: 'done', outcome: 'defeat' });
        const summary = res.body.summary;
        expect(summary).toMatchObject({
          outcome: 'defeat',
          cleared: true,
          deepest: 0,
          newDepth: LANDMARK + 1,
        });
        expect(summary?.pack?.kept).toEqual(keptOnDefeat(down.pack));
        // The banked gear is not lost, and nothing of it is paid twice.
        expect(items(ctx, p.id)).toEqual(gearBefore);
        expect(summary?.rewards.gear).toHaveLength(1);
        expect(summary?.rewards.supplies).toHaveLength(1);
        expect(progressOf(ctx, p.id)).toMatchObject({ depth: LANDMARK + 1, runs: 1, clears: 1 });
        expect(runRow(ctx, state.id)).toMatchObject({ outcome: 'defeat', cleared: 1 });
        expect(events(ctx, 'dungeon_run')[0]).toMatchObject({
          outcome: 'defeat',
          deepest: 0,
          marks: [],
        });
        const paid = ledger(ctx, p.id);
        expect(paid.find((l) => l.currency === 'essence')?.amount).toBe(
          keptOnDefeat(down.pack).essence,
        );
      },
      opts(),
    );
  });
});

describe('a run left open in the Undercroft', () => {
  const nextDay = async (ctx: CoreContext, p: DungeonPlayer): Promise<void> => {
    ctx.clock.t = AFTER_RESET + DAY;
    await p.today();
  };

  it('closes as cleared with the whole pack when it waits at the descent card, and keeps the depth', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const state = await toDescent(ctx, p, LANDMARK);
        await nextDay(ctx, p);
        expect(runRow(ctx, state.id)).toMatchObject({
          status: 'done',
          outcome: 'cleared',
          cleared: 1,
        });
        const summary = summaryOf(ctx, state.id);
        expect(summary.pack).toEqual({ found: state.pack, kept: state.pack });
        expect(summary.rewards.gear).toHaveLength(1);
        expect(progressOf(ctx, p.id)?.depth).toBe(LANDMARK + 1);
        expect(items(ctx, p.id)).toHaveLength(1);
      },
      opts(),
    );
  });

  it('closes as cleared with the whole pack at an Undercroft camp', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const { state, down } = await descendWith(ctx, p, ['camp']);
        const camp = levelMap(down).nodes.find((n) => n.kind === 'camp');
        const at = await walkTo(p, down, routeTo(down, 'camp'));
        const waiting = await p.act(at, { type: 'move', node: camp?.id as string });
        await nextDay(ctx, p);
        expect(runRow(ctx, state.id)).toMatchObject({ status: 'done', outcome: 'cleared' });
        expect(summaryOf(ctx, state.id).pack).toEqual({
          found: waiting.body.state.pack,
          kept: waiting.body.state.pack,
        });
      },
      opts(),
    );
  });

  it('closes as a defeat (half the pack) anywhere else, and the alarm does the same', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const { state, down } = await descendWith(ctx, p, []);
        const fought = await p.act(down, { type: 'move', node: down.reachable[0] as string });
        ctx.clock.t = AFTER_RESET + DAY;
        ctx.core.dungeon.closeStale();
        expect(runRow(ctx, state.id)).toMatchObject({
          status: 'done',
          outcome: 'defeat',
          cleared: 1,
        });
        const summary = summaryOf(ctx, state.id);
        expect(summary.pack).toEqual({
          found: fought.body.state.pack,
          kept: keptOnDefeat(fought.body.state.pack),
        });
        expect(progressOf(ctx, p.id)?.depth).toBe(DEPTH + 1);
      },
      opts(),
    );
  });
});

// --- The carved door ---

describe('the carved door', () => {
  /** Turns a room of floor 4 or 5 into a carved door in a run's own copy of the map, and answers its id. */
  function carve(ctx: CoreContext, runId: string): string {
    let id = '';
    patchState(ctx, runId, (st) => {
      const node = st.map.nodes.find(
        (n) =>
          (n.floor === 4 || n.floor === 5) &&
          n.kind !== 'door' &&
          n.kind !== 'camp' &&
          n.kind !== 'boss',
      );
      if (node === undefined) throw new Error('no room on floor 4 or 5 to carve');
      node.kind = 'door';
      delete node.foeId;
      delete node.modifierId;
      delete node.eventId;
      id = node.id;
    });
    return id;
  }

  /** A fresh run at `depth` with a door carved on floor 4, played to the room before it. */
  async function atDoor(ctx: CoreContext, p: DungeonPlayer, depth: number) {
    ctx.clock.t = AFTER_RESET;
    setDepth(ctx, p.id, depth);
    const run = await begin(p);
    // Floor 4 rooms can be on any path past the camp: carve one that is not the only way (floor 4 has 2 or 3).
    const door = carve(ctx, run.id);
    const state = await refresh(p, run.id);
    const path = routeThrough(state.map, (n) => n.id === door) as string[];
    const there = await play(p, state, {
      pick: (s) => path[s.path.length] ?? (s.reachable[0] as string),
      stopWhen: (s) => s.reachable.includes(door),
    });
    return { door, there };
  }

  it('adds one room of a drawn kind when stepped through, and does not say which', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const { door, there } = await atDoor(ctx, p, DEPTH);
        expect(there.map.nodes.find((n) => n.id === door)?.kind).toBe('door');
        const res = await p.act(there, { type: 'move', node: door });
        expect(res.status).toBe(200);
        const state = res.body.state;
        // Nothing to answer: it resolves like a cache.
        expect(state.pending).toBeNull();
        expect(state.reachable.length).toBeGreaterThan(0);
        expect(state.history.at(-1)).toEqual({
          node: door,
          kind: 'door',
          result: 'door',
          added: true,
        });
        expect(state.undercroft).toEqual({ maps: [], marks: 1 });
        const marks = stored(ctx, state.id).marks;
        expect(marks).toHaveLength(1);
        expect(['fight', 'elite', 'mystery', 'cache', 'camp', 'epic']).toContain(marks[0]);
        // Told only what it could be: no mark anywhere in what is sent.
        expect(JSON.stringify(state.history.at(-1))).not.toContain(marks[0] as string);
        // Down below, the level has that room as a floor of its own.
        const end = await play(p, state, { stopWhen: atDescent });
        expect(end.pending).toMatchObject({ kind: 'descend', floors: 2 + 1 + 1 });
        const down = await descend(p, end);
        const map = levelMap(down);
        expect(map.floors).toBe(2 + 1 + 1);
        const marked = map.nodes.filter((n) => n.floor === 2);
        expect(marked).toHaveLength(1);
        expect(marked[0]?.kind).toBe(marks[0]);
        expect(down.undercroft?.marks).toBe(1);
      },
      opts(),
    );
  });

  it('adds nothing past the most a run can hold, and says so', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const { door, there } = await atDoor(ctx, p, DEPTH);
        patchState(ctx, there.id, (st) => {
          st.marks = Array.from({ length: u.maxMarks }, () => 'fight' as const);
        });
        const res = await p.act(there, { type: 'move', node: door });
        expect(res.status).toBe(200);
        expect(res.body.state.history.at(-1)).toEqual({
          node: door,
          kind: 'door',
          result: 'door',
          added: false,
        });
        expect(stored(ctx, there.id).marks).toHaveLength(u.maxMarks);
        expect(res.body.state.undercroft?.marks).toBe(u.maxMarks);
      },
      opts(),
    );
  });

  it('is a quiet room below depth 8: it looks like a mystery room, nothing waits and nothing is added', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const { door, there } = await atDoor(ctx, p, u.fromDepth - 1);
        const node = there.map.nodes.find((n) => n.id === door);
        expect(node?.kind).toBe('mystery');
        expect(node?.event).toEqual({ id: 'quiet-room', name: 'Quiet room' });
        const res = await p.act(there, { type: 'move', node: door });
        expect(res.status).toBe(200);
        expect(res.body.state.pending).toBeNull();
        // It is logged like a mystery room that was answered, so the path shows it.
        expect(res.body.state.history.some((h) => h.kind === 'door')).toBe(false);
        expect(res.body.state.history.at(-1)).toEqual({
          node: door,
          kind: 'mystery',
          result: 'event',
          event: 'Quiet room',
          option: '',
          outcome: 'A quiet room. Nothing happens here.',
          loot: { bait: 0, essence: 0, scrap: 0 },
        });
        expect(res.body.state.reachable.length).toBeGreaterThan(0);
        expect(stored(ctx, there.id).marks).toEqual([]);
        // The day's map as today shows the same.
        const today = await p.today();
        expect(today.map.nodes.some((n) => n.kind === 'door')).toBe(false);
        // The run ends: the summary's path says mystery for it, never door.
        const end = await play(p, res.body.state, {});
        expect(end.status).toBe('done');
        const summary = summaryOf(ctx, there.id);
        expect(summary.path).not.toContain('door');
        expect(summary.path.filter((k) => k === 'mystery').length).toBeGreaterThan(0);
        expect(summary.path).toHaveLength(end.path.length);
      },
      opts(),
    );
  });

  it('shows a door on today’s map only to a player the Undercroft is open to', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = AFTER_RESET;
        const low = await dungeonPlayer(ctx, 1, STRONG);
        const high = await dungeonPlayer(ctx, 2, STRONG);
        setDepth(ctx, high.id, DEPTH);
        // Put a door in the day's map (stored once for the guild).
        await low.today();
        const day = rows<{ map_json: string }>(
          ctx.sql,
          'SELECT map_json FROM dungeon_days WHERE day = ?',
          GAME_DAY,
        )[0];
        expect(day?.map_json).toBeDefined();
        // A valid map that has a carved door, drawn from the game's own rules.
        let map = generateDungeonMap(createSeededRng('door-0'), undefined, { doors: true });
        for (let i = 1; !map.nodes.some((n) => n.kind === 'door'); i++) {
          map = generateDungeonMap(createSeededRng(`door-${String(i)}`), undefined, {
            doors: true,
          });
        }
        const picked = map.nodes.find((n) => n.kind === 'door') as (typeof map.nodes)[number];
        ctx.sql.exec(
          'UPDATE dungeon_days SET map_json = ? WHERE day = ?',
          JSON.stringify(map),
          GAME_DAY,
        );
        const seenLow = (await low.today()).map.nodes.find((n) => n.id === picked.id);
        const seenHigh = (await high.today()).map.nodes.find((n) => n.id === picked.id);
        expect(seenLow?.kind).toBe('mystery');
        expect(seenHigh?.kind).toBe('door');
      },
      opts(),
    );
  });
});

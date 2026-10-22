import { RULES, createSeededRng, dungeonEvent, keptOnDefeat, type Rng } from '@creatures/game';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { itemView } from '../src/gear-access';
import type { GearRow } from '../src/gear-store';
import { parseState, type RunState } from '../src/dungeon-state';
import type { DungeonRunState } from '../src/dungeon-types';
import {
  deadlyFoes,
  dungeonPlayer,
  easyFoes,
  followRoute,
  routeThrough,
  type DungeonPlayer,
} from './dungeon-helpers';
import { runCore, type CoreContext } from './helpers';
import { DAY, newKey } from './kit';
import { nextGuild, rows } from './raid-helpers';

/**
 * The Blue Chasm (docs/design/dungeon-paths.md, "The Blue Chasm"): a rare mystery room that turns up as
 * the run steps in, shows its treasure before the choice, and either pays it at the run's end or ends the
 * run in a fall. The dice are scripted at the moments that matter: the room's rare draw and the gamble come
 * from the run's rng, the treasure kind from the gear rng.
 */

let restore: () => void = () => undefined;
beforeEach(() => {
  restore = easyFoes();
});
afterEach(() => {
  restore();
});

/** A seeded stream with a queue of values to hand out first: the next draws are the script's. */
function scripted(seed: string): Rng & { queue: number[] } {
  const inner = createSeededRng(seed);
  const queue: number[] = [];
  return {
    queue,
    nextU32() {
      return queue.length > 0 ? (queue.shift() as number) : inner.nextU32();
    },
  };
}

/** `int(rng, n)` is 0 for this, and a `chance` of any size wins. */
const LOW = 0;
/** 9999 of 10000: loses every gamble that is not certain. */
const HIGH = 4_294_959_999;

const STRONG = { level: 30, species: ['tidewing', 'pyrelynx', 'thornbuck'] };
const DEEP = 3;

/** The treasure kinds in the order `rollTreasure` draws them (`int(rng, 4)` picks the index). */
const KIND = { gear: 0, blueprint: 1, supplies: 2, shards: 3 } as const;

interface Setup {
  ctx: CoreContext;
  p: DungeonPlayer;
  dungeonRng: ReturnType<typeof scripted>;
  gearRng: ReturnType<typeof scripted>;
}

const setDepth = (ctx: CoreContext, userId: string, depth: number): void => {
  ctx.sql.exec(
    'INSERT INTO dungeon_progress (user_id, depth, first_day) VALUES (?, ?, ?)',
    userId,
    depth,
    '2027-01-01',
  );
};

const runRow = (ctx: CoreContext, runId: string) =>
  rows<{ state_json: string }>(
    ctx.sql,
    'SELECT state_json FROM dungeon_runs WHERE id = ?',
    runId,
  )[0];
const stored = (ctx: CoreContext, runId: string): RunState =>
  JSON.parse(runRow(ctx, runId)?.state_json ?? '{}') as RunState;

/**
 * Starts a run at `depth` and walks it to the room before the first mystery room (one before the camp when
 * `beforeCamp`, found by trying the maps of the following days). Returns the state and the mystery room.
 */
async function toDoor(
  { ctx, p }: Setup,
  depth = DEEP,
  beforeCamp = false,
): Promise<{ state: DungeonRunState; target: string }> {
  setDepth(ctx, p.id, depth);
  for (let day = 0; day < 60; day++) {
    const map = (await p.today()).map;
    const route = routeThrough(
      map,
      (n) =>
        n.kind === 'mystery' &&
        n.event?.id !== 'quiet-room' &&
        (!beforeCamp || n.floor < RULES.dungeon.campFloor),
    );
    if (route === undefined) {
      ctx.clock.t += DAY;
      continue;
    }
    const start = await p.start();
    expect(start.status, JSON.stringify(start.body)).toBe(200);
    const target = route.at(-1) as string;
    const before = route.at(-2) as string;
    const res = await p.play(start.body.state, {
      pick: followRoute(route),
      stopWhen: (s) => s.at === before,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    let state = res.body.state as DungeonRunState;
    // The room before the mystery room can be the camp: rest, and the way on opens.
    if (state.pending?.kind === 'camp') {
      const rested = await p.act(state, { type: 'camp', choice: 'rest' });
      expect(rested.status, JSON.stringify(rested.body)).toBe(200);
      state = rested.body.state;
    }
    expect(state.status).toBe('active');
    expect(state.pending).toBeNull();
    return { state, target };
  }
  throw new Error('no map with such a mystery room in 60 days');
}

/** Steps into the mystery room with the rare draw (and the treasure kind) scripted. */
async function openChasm(
  s: Setup,
  state: DungeonRunState,
  target: string,
  kind: keyof typeof KIND,
): Promise<DungeonRunState> {
  s.dungeonRng.queue.push(LOW); // the one rare roll: the room turns rare
  s.dungeonRng.queue.push(LOW); // the pick among the eligible rare rooms: the first in content order, the chasm
  s.gearRng.queue.push(KIND[kind]); // the treasure's kind
  const res = await s.p.act(state, { type: 'move', node: target });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.state;
}

async function withChasm(fn: (s: Setup) => Promise<void>, seed = 'chasm'): Promise<void> {
  const dungeonRng = scripted(seed);
  const gearRng = scripted(`${seed}:gear`);
  await runCore(
    nextGuild(),
    async (ctx) => {
      const p = await dungeonPlayer(ctx, 1, STRONG);
      await fn({ ctx, p, dungeonRng, gearRng });
    },
    { dungeonRng, gearRng },
  );
}

describe('the Blue Chasm room', () => {
  it('turns a mystery room into the chasm, with its treasure shown before the choice, and stores the treasure', async () => {
    await withChasm(async (s) => {
      const { state, target } = await toDoor(s);
      const waiting = await openChasm(s, state, target, 'supplies');
      expect(waiting.at).toBe(target);
      const pending = waiting.pending;
      if (pending?.kind !== 'event') throw new Error('no event waiting');
      const def = dungeonEvent('blue-chasm');
      expect(pending.event).toMatchObject({
        id: 'blue-chasm',
        name: 'Blue Chasm',
        text: def?.text,
      });
      expect(pending.event.options.map((o) => o.label)).toEqual([
        'Cross the plank',
        "Don't risk it",
      ]);
      expect(pending.event.options[0]?.description).toContain('50%');
      expect(pending.event.treasure).toEqual({
        kind: 'supplies',
        supplyId: expect.stringMatching(/-great$/) as string,
        count: 2,
      });
      // Stored in the run, so a reload shows the same prize and cannot reroll it.
      const st = stored(s.ctx, waiting.id);
      expect(st.rareSeen).toEqual(['blue-chasm']);
      expect(st.pending).toMatchObject({ kind: 'event', eventId: 'blue-chasm' });
      expect((await s.p.today()).active?.pending).toEqual(pending);
      // The log names the room while it waits.
      expect(waiting.history.at(-1)).toMatchObject({ result: 'pending', event: 'Blue Chasm' });
    });
  });

  it('sends the gear piece’s full card with the waiting room, and not on the end screen', async () => {
    await withChasm(async (s) => {
      const { state, target } = await toDoor(s);
      const waiting = await openChasm(s, state, target, 'gear');
      const pending = waiting.pending;
      if (pending?.kind !== 'event') throw new Error('expected an event');
      const shown = pending.event.treasure;
      if (shown?.kind !== 'gear') throw new Error('expected gear');
      expect(shown.card).toMatchObject({
        baseId: shown.baseId,
        rarity: 'epic',
        itemLevel: shown.itemLevel,
        equippedOn: null,
      });
      expect(shown.card?.stats.length).toBeGreaterThan(0);
      expect(shown.card?.lines.length).toBeGreaterThan(0);
    }, 'card');
  });

  it('does not come up before depth 3, whatever the dice say', async () => {
    await withChasm(async (s) => {
      const { state, target } = await toDoor(s, 1);
      // The Sealed Vault (also rare, from depth 1) is out of the way: met already.
      s.ctx.sql.exec(
        'UPDATE dungeon_runs SET state_json = ? WHERE id = ?',
        JSON.stringify({ ...stored(s.ctx, state.id), rareSeen: ['sealed-vault'] }),
        state.id,
      );
      const waiting = await openChasm(s, state, target, 'gear');
      const pending = waiting.pending;
      if (pending?.kind === 'event') {
        expect(pending.event.id).not.toBe('blue-chasm');
        expect(pending.event.treasure).toBeUndefined();
      }
      expect(stored(s.ctx, waiting.id).rareSeen).toEqual(['sealed-vault']);
    }, 'shallow');
  });

  it('comes up once a run: a second mystery room is the map’s own', async () => {
    await withChasm(async (s) => {
      const { state, target } = await toDoor(s);
      // The run has met it already (as if an earlier room had been the chasm).
      s.ctx.sql.exec(
        'UPDATE dungeon_runs SET state_json = ? WHERE id = ?',
        JSON.stringify({ ...stored(s.ctx, state.id), rareSeen: ['blue-chasm'] }),
        state.id,
      );
      const waiting = await openChasm(s, state, target, 'gear');
      const pending = waiting.pending;
      if (pending?.kind === 'event') expect(pending.event.id).not.toBe('blue-chasm');
    }, 'once');
  });

  it('is not on the day’s map: the room only names the mystery', async () => {
    await withChasm(async (s) => {
      setDepth(s.ctx, s.p.id, DEEP);
      const today = await s.p.today();
      expect(JSON.stringify(today.map)).not.toContain('Blue Chasm');
    }, 'on-map');
  });
});

describe('crossing the plank', () => {
  it('a win takes the treasure into the run: nothing is paid yet, the exits open, the outcome says so', async () => {
    await withChasm(async (s) => {
      const { state, target } = await toDoor(s);
      const waiting = await openChasm(s, state, target, 'shards');
      s.dungeonRng.queue.push(LOW); // the gamble: the team crosses
      const res = await s.p.act(waiting, { type: 'event', option: 0 });
      expect(res.status).toBe(200);
      const next = res.body.state;
      expect(next.status).toBe('active');
      expect(next.pending).toBeNull();
      expect(next.lastEvent?.outcome).toBe('Lucky! You cross the plank and take the treasure.');
      expect(next.reachable.length).toBeGreaterThan(0);
      const st = stored(s.ctx, next.id);
      expect(st.treasures).toHaveLength(1);
      expect(st.treasures[0]).toMatchObject({ kind: 'shards' });
      expect(next.history.at(-1)).toMatchObject({
        result: 'event',
        event: 'Blue Chasm',
        option: 'Cross the plank',
        treasure: { kind: 'shards' },
      });
      // Nothing has been paid: the treasure waits for the run's end.
      expect(rows<{ n: number }>(s.ctx.sql, 'SELECT COUNT(*) AS n FROM gear_grants')[0]?.n).toBe(0);
    });
  });

  it.each([
    ['shards', (r: RewardsLike) => Object.keys(r.parts).some((k) => k.endsWith('-shard'))],
    [
      'supplies',
      (r: RewardsLike) => (r.supplies ?? []).filter((x) => x.endsWith('-great')).length >= 2,
    ],
    ['gear', (r: RewardsLike) => r.gear.some((g) => g.rarity === 'epic')],
    ['blueprint', (r: RewardsLike) => (r.blueprints ?? []).length === 1],
  ] as const)(
    'a won %s treasure is paid at the end of a cleared run, as what the room showed',
    async (kind, shows) => {
      await withChasm(async (s) => {
        const { state, target } = await toDoor(s);
        const waiting = await openChasm(s, state, target, kind);
        const shown =
          waiting.pending?.kind === 'event' ? waiting.pending.event.treasure : undefined;
        expect(shown?.kind).toBe(kind);
        s.dungeonRng.queue.push(LOW);
        const crossed = (await s.p.act(waiting, { type: 'event', option: 0 })).body.state;
        const end = await s.p.play(crossed);
        expect(end.status, JSON.stringify(end.body)).toBe(200);
        const run = (end.body as { run: { rewards: RewardsLike; outcome: string } }).run;
        expect(run.outcome).toBe('cleared');
        expect(shows(run.rewards), JSON.stringify(run.rewards)).toBe(true);
        expect(run.rewards.treasureLost).toBeUndefined();
        if (shown?.kind === 'gear') {
          const mine = run.rewards.gear.find((g) => g.rarity === 'epic');
          expect(mine).toMatchObject({ baseId: shown.baseId, itemLevel: shown.itemLevel });
          const owned = rows<{ base_id: string; rarity: string }>(
            s.ctx.sql,
            'SELECT base_id, rarity FROM gear_items WHERE user_id = ?',
            s.p.id,
          );
          expect(owned.some((g) => g.base_id === shown.baseId && g.rarity === 'epic')).toBe(true);
          // The item granted is the very one the card showed: the same stats, lines and level.
          const card = shown.card;
          expect(card).toBeDefined();
          const row = rows<GearRow>(
            s.ctx.sql,
            'SELECT * FROM gear_items WHERE user_id = ? AND base_id = ? AND rarity = ?',
            s.p.id,
            shown.baseId,
            'epic',
          ).find((r) => r.source === 'dungeon' && r.item_level === shown.itemLevel);
          expect(row).toBeDefined();
          const granted = itemView(s.ctx.sql, row as GearRow);
          expect(granted.stats).toEqual(card?.stats);
          expect(granted.lines).toEqual(card?.lines);
          expect(granted.tag).toBe(card?.tag);
          expect(granted.itemLevel).toBe(card?.itemLevel);
        }
        if (shown?.kind === 'blueprint') {
          expect(run.rewards.blueprints?.[0]).toMatchObject({
            baseId: shown.baseId,
            duplicate: false,
          });
          const known = rows<{ base_id: string }>(
            s.ctx.sql,
            'SELECT base_id FROM blueprints WHERE user_id = ?',
            s.p.id,
          );
          expect(known.map((b) => b.base_id)).toContain(shown.baseId);
        }
        if (shown?.kind === 'supplies') {
          // The run's own supply and the two of the treasure.
          expect(run.rewards.supplies?.length).toBeGreaterThanOrEqual(3);
        }
      }, `pay-${kind}`);
    },
  );

  it('is also paid when the run heads home from the camp, once, however often the last act is sent', async () => {
    await withChasm(async (s) => {
      const { state, target } = await toDoor(s, DEEP, true);
      const waiting = await openChasm(s, state, target, 'gear');
      s.dungeonRng.queue.push(LOW);
      const crossed = (await s.p.act(waiting, { type: 'event', option: 0 })).body.state;
      const camp = (await s.p.play(crossed, { stopWhen: (x) => x.pending?.kind === 'camp' })).body
        .state as DungeonRunState;
      expect(camp.pending?.kind).toBe('camp');
      const key = newKey('dungeon', 'home');
      const first = await s.p.act(camp, { type: 'home' }, key);
      expect(first.status, JSON.stringify(first.body)).toBe(200);
      expect(first.body.summary).toMatchObject({ outcome: 'home' });
      const rewards = first.body.summary?.rewards as RewardsLike;
      expect(rewards.gear.some((g) => g.rarity === 'epic')).toBe(true);
      const count = (): number | undefined =>
        rows<{ n: number }>(
          s.ctx.sql,
          'SELECT COUNT(*) AS n FROM gear_items WHERE user_id = ?',
          s.p.id,
        )[0]?.n;
      const items = count();
      const again = await s.p.act(camp, { type: 'home' }, key);
      expect(again.status).toBe(200);
      expect(again.body.summary?.rewards).toEqual(first.body.summary?.rewards);
      expect(count()).toBe(items);
    }, 'pay-home');
  });
});

interface RewardsLike {
  parts: Record<string, number>;
  gear: { rarity: string; baseId: string; itemLevel?: number }[];
  supplies?: string[];
  blueprints?: { baseId: string; duplicate: boolean }[];
  treasureLost?: unknown;
}

describe('falling', () => {
  it('a lost crossing ends the run as a defeat, keeping half the pack, with no treasure', async () => {
    await withChasm(async (s) => {
      const { state, target } = await toDoor(s);
      const found = { ...state.pack };
      const waiting = await openChasm(s, state, target, 'gear');
      s.dungeonRng.queue.push(HIGH); // the gamble: the plank gives way
      const res = await s.p.act(waiting, { type: 'event', option: 0 });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.state).toMatchObject({ status: 'done', outcome: 'defeat', reachable: [] });
      expect(res.body.state.team.every((t) => t.hp === 0)).toBe(true);
      const summary = res.body.summary;
      expect(summary).toMatchObject({ outcome: 'defeat', cleared: false, newDepth: DEEP });
      expect(summary?.pack).toEqual({ found, kept: keptOnDefeat(found) });
      expect(summary?.rewards.bait).toBe(keptOnDefeat(found).bait);
      expect(summary?.rewards.gear).toEqual([]);
      expect(summary?.rewards.treasureLost).toBeUndefined();
      expect(summary?.rewards.blueprints).toBeUndefined();
      const log = summary?.route?.history.at(-1);
      expect(log).toMatchObject({ result: 'event', event: 'Blue Chasm', fell: true });
      expect(log && 'treasure' in log).toBe(false);
      expect(res.body.state.lastEvent?.outcome).toContain('No luck.');
      // The defeat counts like any other (the depth is unchanged, the run counted).
      const progress = rows<{ depth: number; runs: number; clears: number }>(
        s.ctx.sql,
        'SELECT depth, runs, clears FROM dungeon_progress WHERE user_id = ?',
        s.p.id,
      )[0];
      expect(progress).toMatchObject({ depth: DEEP, runs: 1, clears: 0 });
      // And the answer is stored: sending the same act again changes nothing.
      expect(
        rows<{ n: number }>(
          s.ctx.sql,
          'SELECT COUNT(*) AS n FROM gear_items WHERE user_id = ?',
          s.p.id,
        )[0]?.n,
      ).toBe(0);
    }, 'fall');
  });

  it('a fall still pays the experience earned in the rooms before it, and the recap lists them', async () => {
    await withChasm(async (s) => {
      const { state, target } = await toDoor(s);
      const waiting = await openChasm(s, state, target, 'gear');
      const before = stored(s.ctx, waiting.id).earned;
      const fought = Object.entries(before).filter(([, e]) => e.base > 0);
      expect(fought.length).toBeGreaterThan(0);
      s.dungeonRng.queue.push(HIGH);
      const res = await s.p.act(waiting, { type: 'event', option: 0 });
      expect(res.body.state).toMatchObject({ status: 'done', outcome: 'defeat' });
      const rewards = res.body.summary?.rewards;
      const recap = rewards?.recap ?? [];
      // Every creature that earned before the fall is in the recap, and was paid.
      for (const [id] of fought) {
        expect(recap.some((r) => r.creatureId === id)).toBe(true);
      }
      expect(rewards?.experience?.length).toBeGreaterThan(0);
      expect(rewards?.experience?.every((x) => x.gained > 0)).toBe(true);
    }, 'fall-xp');
  });

  it('a treasure taken and then lost to a defeat in a later fight is not won, and the end screen says so', async () => {
    await withChasm(async (s) => {
      const { state, target } = await toDoor(s);
      const waiting = await openChasm(s, state, target, 'gear');
      s.dungeonRng.queue.push(LOW);
      const crossRes = await s.p.act(waiting, { type: 'event', option: 0 });
      expect(crossRes.status, JSON.stringify(crossRes.body)).toBe(200);
      const crossed = crossRes.body.state;
      deadlyFoes();
      const res = await s.p.act(crossed, { type: 'move', node: crossed.reachable[0] as string });
      expect(res.status).toBe(200);
      expect(res.body.state).toMatchObject({ status: 'done', outcome: 'defeat' });
      const rewards = res.body.summary?.rewards as RewardsLike;
      expect(rewards.gear.some((g) => g.rarity === 'epic')).toBe(false);
      expect(rewards.treasureLost).toMatchObject({ kind: 'gear', rarity: 'epic' });
      expect(
        rows<{ n: number }>(
          s.ctx.sql,
          'SELECT COUNT(*) AS n FROM gear_items WHERE user_id = ?',
          s.p.id,
        )[0]?.n,
      ).toBe(0);
    }, 'late-defeat');
  });
});

describe("Don't risk it", () => {
  it('does nothing: the run goes on, no treasure is taken and none is paid', async () => {
    await withChasm(async (s) => {
      const { state, target } = await toDoor(s);
      const waiting = await openChasm(s, state, target, 'gear');
      s.dungeonRng.queue.push(HIGH); // the dice would have lost, but there is no gamble here
      const res = await s.p.act(waiting, { type: 'event', option: 1 });
      expect(res.status).toBe(200);
      const next = res.body.state;
      expect(next.status).toBe('active');
      expect(next.pending).toBeNull();
      expect(next.lastEvent?.outcome).toBe('Nothing happens.');
      expect(next.team.map((t) => t.hp)).toEqual(state.team.map((t) => t.hp));
      expect(stored(s.ctx, next.id).treasures).toEqual([]);
      const end = await s.p.play(next, { camp: () => ({ type: 'home' }) });
      const rewards = (end.body as { run: { rewards: RewardsLike } }).run.rewards;
      // At most the boss chest's piece: the treasure's would make two.
      expect(rewards.gear.length).toBeLessThanOrEqual(1);
      expect(rewards.treasureLost).toBeUndefined();
    }, 'safe');
  });
});

describe('a run saved before the chasm', () => {
  it('has no treasures and no rare rooms met, loads with none, and goes on', async () => {
    await withChasm(async (s) => {
      const { state, target } = await toDoor(s);
      const old = stored(s.ctx, state.id) as Partial<RunState>;
      delete old.treasures;
      delete old.rareSeen;
      s.ctx.sql.exec(
        'UPDATE dungeon_runs SET state_json = ? WHERE id = ?',
        JSON.stringify(old),
        state.id,
      );
      const loaded = parseState(runRow(s.ctx, state.id)?.state_json ?? null);
      expect(loaded?.treasures).toEqual([]);
      expect(loaded?.rareSeen).toEqual([]);
      // It plays on, and can still meet the chasm.
      const waiting = await openChasm(s, state, target, 'blueprint');
      expect(waiting.pending).toMatchObject({ kind: 'event', event: { id: 'blue-chasm' } });
      s.dungeonRng.queue.push(LOW);
      const crossed = (await s.p.act(waiting, { type: 'event', option: 0 })).body.state;
      expect(stored(s.ctx, crossed.id).treasures).toHaveLength(1);
    }, 'old-state');
  });

  it('an event waiting without a treasure (a room of before) still shows and answers', async () => {
    await withChasm(async (s) => {
      const { state, target } = await toDoor(s, 1);
      // The Sealed Vault (also rare, from depth 1) is out of the way: met already.
      s.ctx.sql.exec(
        'UPDATE dungeon_runs SET state_json = ? WHERE id = ?',
        JSON.stringify({ ...stored(s.ctx, state.id), rareSeen: ['sealed-vault'] }),
        state.id,
      );
      const waiting = await openChasm(s, state, target, 'gear');
      const pending = waiting.pending;
      if (pending?.kind !== 'event') return;
      expect(pending.event).not.toHaveProperty('treasure');
      const res = await s.p.act(waiting, { type: 'event', option: 0 });
      expect(res.status).toBe(200);
    }, 'old-room');
  });
});

describe('the numbers', () => {
  it('the defeat share is the run’s own rule, and the room is rare in the content', () => {
    expect(RULES.dungeon.defeatKeepBp).toBe(5_000);
    expect(dungeonEvent('blue-chasm')?.rare).toEqual({ fromDepth: 3 });
    expect(RULES.dungeon.rareRoomChanceBp).toBeLessThanOrEqual(5_000);
  });
});

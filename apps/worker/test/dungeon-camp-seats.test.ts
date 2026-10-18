import { createSeededRng, type GearRarity } from '@creatures/game';
import type { FightSlot } from '@creatures/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunState } from '../src/dungeon-state';
import type { DungeonRunState } from '../src/dungeon-types';
import { loadCreatures } from '../src/raid-teams';
import {
  dungeonPlayer,
  easyFoes,
  followRoute,
  routeThrough,
  type DungeonPlayer,
} from './dungeon-helpers';
import { giveItem } from './gear-helpers';
import { runCore, type CoreContext } from './helpers';
import { nextGuild, rows } from './raid-helpers';

/**
 * Seats: the camp places the row again after a swap or a reorder, so the position lines of the gear
 * (Edge-walker at the ends of the line, Heart of the row in the middle) follow where each creature
 * stands now. A run stored before seats keeps every slot as it was and only changes the order.
 */

const AFTER_RESET = Date.parse('2027-01-15T12:00:00Z');
const FOUR = { level: 30, creatures: 4, species: ['tidewing', 'pyrelynx', 'thornbuck', 'voltaro'] };

let restore: () => void = () => undefined;
beforeEach(() => {
  restore = easyFoes();
});
afterEach(() => {
  restore();
});

const opts = (seed: string) => ({
  dungeonRng: createSeededRng(seed),
  gearRng: createSeededRng(`${seed}:gear`),
});

/** Gives a creature an item with exact lines (item level 5) and puts it on. */
function wear(
  ctx: CoreContext,
  userId: string,
  creatureId: string,
  baseId: string,
  lines: [string, number][],
  rarity: GearRarity = 'epic',
): void {
  const id = giveItem(ctx.sql, userId, baseId, { rarity, level: 5, now: ctx.clock.t, lines });
  ctx.sql.exec('UPDATE gear_items SET equipped_on = ? WHERE id = ?', creatureId, id);
}

const stored = (ctx: CoreContext, runId: string): RunState =>
  JSON.parse(
    rows<{ state_json: string }>(
      ctx.sql,
      'SELECT state_json FROM dungeon_runs WHERE id = ?',
      runId,
    )[0]?.state_json ?? '{}',
  ) as RunState;

function patchState(ctx: CoreContext, runId: string, change: (st: RunState) => void): void {
  const st = stored(ctx, runId);
  change(st);
  ctx.sql.exec('UPDATE dungeon_runs SET state_json = ? WHERE id = ?', JSON.stringify(st), runId);
}

/** The stored slot of a creature in the run's row. */
function slotIn(st: RunState, id: string): FightSlot {
  const slot = st.input.team.find((s) => s.id === id);
  if (slot === undefined) throw new Error(`${id} is not in the row`);
  return slot;
}

/** The creature as loaded, with nothing placed (what a bare slot's numbers are). */
function bareStats(ctx: CoreContext, userId: string, id: string) {
  const found = loadCreatures(ctx.sql, userId).find((c) => c.id === id);
  if (found === undefined) throw new Error(`${id} not found`);
  return found.stats;
}

/** Starts a run with `team` and walks it to the camp, which every path crosses. */
async function toCamp(p: DungeonPlayer, team: string[]): Promise<DungeonRunState> {
  const started = await p.start({ team });
  expect(started.status, JSON.stringify(started.body)).toBe(200);
  const route = routeThrough(started.body.state.map, (n) => n.kind === 'camp') as string[];
  const res = await p.play(started.body.state, {
    pick: followRoute(route),
    stopWhen: (s) => s.pending?.kind === 'camp',
  });
  const waiting = res.body.state as DungeonRunState;
  expect(waiting.pending?.kind).toBe('camp');
  return waiting;
}

describe('seats at the start of a run', () => {
  it('folds Edge-walker at an end of the row and not in the middle, and stores a seat for each creature', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = AFTER_RESET;
        const p = await dungeonPlayer(ctx, 1, FOUR);
        const [a, b, c] = p.creatureIds as [string, string, string, string];
        wear(ctx, p.id, a, 'trail-cap', [['edge-walker', 4]]);
        const bare = bareStats(ctx, p.id, a);

        const end = await p.start({ team: [a, b, c] });
        expect(end.status).toBe(200);
        const atEnd = stored(ctx, end.body.state.id);
        expect(slotIn(atEnd, a).stats?.atk).toBeGreaterThan(bare.atk);
        expect(Object.keys(atEnd.seats ?? {}).sort()).toEqual([a, b, c].sort());
      },
      opts('seats-start-end'),
    );
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = AFTER_RESET;
        const p = await dungeonPlayer(ctx, 1, FOUR);
        const [a, b, c] = p.creatureIds as [string, string, string, string];
        wear(ctx, p.id, a, 'trail-cap', [['edge-walker', 4]]);
        const bare = bareStats(ctx, p.id, a);

        const middle = await p.start({ team: [b, a, c] });
        expect(middle.status).toBe(200);
        expect(slotIn(stored(ctx, middle.body.state.id), a).stats?.atk).toBe(bare.atk);
      },
      opts('seats-start-middle'),
    );
  });
});

describe('seats at the camp', () => {
  it('places the row again when it is reordered: Edge-walker and Heart of the row follow the creature, and carried HP never passes the new max', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = AFTER_RESET;
        const p = await dungeonPlayer(ctx, 1, FOUR);
        const [a, b, c] = p.creatureIds as [string, string, string, string];
        wear(ctx, p.id, a, 'trail-cap', [['edge-walker', 4]]);
        wear(ctx, p.id, b, 'patch-scarf', [['heart-of-the-row', 4]]);
        const bareA = bareStats(ctx, p.id, a);
        const bareB = bareStats(ctx, p.id, b);

        // a stands at the left end, b in the middle, c (no position gear) at the right end.
        const waiting = await toCamp(p, [a, b, c]);
        const before = stored(ctx, waiting.id);
        expect(slotIn(before, a).stats?.atk).toBeGreaterThan(bareA.atk);
        expect(slotIn(before, b).stats?.hp).toBeGreaterThan(bareB.hp);
        const plain = slotIn(before, c);
        const bigMax = before.hpMax[b] as number;
        // b is at full health, with the max its place in the middle gives it.
        patchState(ctx, waiting.id, (st) => {
          st.hp = { ...(st.hp ?? {}), [b]: bigMax };
        });

        // Reorder to [b, a, c]: a is in the middle (bare Attack), b is at an end (bare HP).
        const moved = await p.act(waiting, { type: 'camp', choice: 'rest', order: [b, a, c] });
        expect(moved.status, JSON.stringify(moved.body)).toBe(200);
        const away = stored(ctx, waiting.id);
        expect(away.input.team.map((s) => s.id)).toEqual([b, a, c]);
        expect(slotIn(away, a).stats?.atk).toBe(bareA.atk);
        expect(slotIn(away, b).stats?.hp).toBe(bareB.hp);
        expect(slotIn(away, c)).toEqual(plain);
        expect(away.hpMax[b]).toBeLessThan(bigMax);
        expect(away.hp?.[b]).toBeLessThanOrEqual(away.hpMax[b] as number);
        // Resting does not take the creature above its new max either.
        expect(moved.body.state.team.find((t) => t.id === b)?.hp).toBeLessThanOrEqual(
          moved.body.state.team.find((t) => t.id === b)?.hpMax as number,
        );
      },
      opts('seats-reorder'),
    );
  });

  it('raises the numbers again when the creature is moved back to where its gear works', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = AFTER_RESET;
        const p = await dungeonPlayer(ctx, 1, FOUR);
        const [a, b, c] = p.creatureIds as [string, string, string, string];
        wear(ctx, p.id, a, 'trail-cap', [['edge-walker', 4]]);
        wear(ctx, p.id, b, 'patch-scarf', [['heart-of-the-row', 4]]);
        const bareA = bareStats(ctx, p.id, a);
        const bareB = bareStats(ctx, p.id, b);

        // Start with both in the wrong place: a in the middle, b at the left end.
        const waiting = await toCamp(p, [b, a, c]);
        const before = stored(ctx, waiting.id);
        expect(slotIn(before, a).stats?.atk).toBe(bareA.atk);
        expect(slotIn(before, b).stats?.hp).toBe(bareB.hp);
        const smallMax = before.hpMax[b] as number;
        patchState(ctx, waiting.id, (st) => {
          st.hp = { ...(st.hp ?? {}), [b]: smallMax };
        });

        // Reorder to [a, b, c]: a at an end, b in the middle.
        const moved = await p.act(waiting, { type: 'camp', choice: 'rest', order: [a, b, c] });
        expect(moved.status, JSON.stringify(moved.body)).toBe(200);
        const after = stored(ctx, waiting.id);
        expect(after.input.team.map((s) => s.id)).toEqual([a, b, c]);
        expect(slotIn(after, a).stats?.atk).toBeGreaterThan(bareA.atk);
        expect(slotIn(after, b).stats?.hp).toBeGreaterThan(bareB.hp);
        expect(after.hpMax[b]).toBeGreaterThan(smallMax);
        expect(after.hp?.[b] as number).toBeLessThanOrEqual(after.hpMax[b] as number);
        expect(slotIn(after, c)).toEqual(slotIn(before, c));
      },
      opts('seats-back'),
    );
  });

  it('gives the creature that is swapped in a seat and places it: Edge-walker works at an end', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = AFTER_RESET;
        const p = await dungeonPlayer(ctx, 1, FOUR);
        const [a, b, c, d] = p.creatureIds as [string, string, string, string];
        wear(ctx, p.id, d, 'trail-cap', [['edge-walker', 4]]);
        const bareD = bareStats(ctx, p.id, d);

        const waiting = await toCamp(p, [a, b, c]);
        expect(stored(ctx, waiting.id).seats?.[d]).toBeUndefined();
        // d takes the place of c, at the right end of the row.
        const swapped = await p.act(waiting, { type: 'camp', choice: 'swap', out: c, in: d });
        expect(swapped.status, JSON.stringify(swapped.body)).toBe(200);
        const st = stored(ctx, waiting.id);
        expect(st.seats?.[d]).toBeDefined();
        expect(st.input.team.map((s) => s.id)).toEqual([a, b, d]);
        expect(slotIn(st, d).stats?.atk).toBeGreaterThan(bareD.atk);
        const newcomer = swapped.body.state.team.find((t) => t.id === d);
        expect(newcomer?.hp).toBe(newcomer?.hpMax);
      },
      opts('seats-swap-end'),
    );
  });

  it('does not fold Edge-walker for a creature swapped into the middle', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = AFTER_RESET;
        const p = await dungeonPlayer(ctx, 1, FOUR);
        const [a, b, c, d] = p.creatureIds as [string, string, string, string];
        wear(ctx, p.id, d, 'trail-cap', [['edge-walker', 4]]);
        const bareD = bareStats(ctx, p.id, d);

        const waiting = await toCamp(p, [a, b, c]);
        // The order is the row after the swap: d stands in the middle.
        const swapped = await p.act(waiting, {
          type: 'camp',
          choice: 'swap',
          out: c,
          in: d,
          order: [a, d, b],
        });
        expect(swapped.status, JSON.stringify(swapped.body)).toBe(200);
        const st = stored(ctx, waiting.id);
        expect(st.input.team.map((s) => s.id)).toEqual([a, d, b]);
        expect(slotIn(st, d).stats?.atk).toBe(bareD.atk);
      },
      opts('seats-swap-middle'),
    );
  });

  it('keeps every slot as it was when the stored run has no seats, and still accepts the reorder', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = AFTER_RESET;
        const p = await dungeonPlayer(ctx, 1, FOUR);
        const [a, b, c] = p.creatureIds as [string, string, string, string];
        wear(ctx, p.id, a, 'trail-cap', [['edge-walker', 4]]);
        const bareA = bareStats(ctx, p.id, a);

        const waiting = await toCamp(p, [a, b, c]);
        patchState(ctx, waiting.id, (st) => {
          delete st.seats;
        });
        const before = stored(ctx, waiting.id);
        expect(before.seats).toBeUndefined();
        expect(slotIn(before, a).stats?.atk).toBeGreaterThan(bareA.atk);

        // a moves to the middle, where Edge-walker would not work: without seats nothing is folded again.
        const moved = await p.act(waiting, { type: 'camp', choice: 'rest', order: [b, a, c] });
        expect(moved.status, JSON.stringify(moved.body)).toBe(200);
        const after = stored(ctx, waiting.id);
        expect(after.seats).toBeUndefined();
        expect(after.input.team.map((s) => s.id)).toEqual([b, a, c]);
        for (const id of [a, b, c]) expect(slotIn(after, id)).toEqual(slotIn(before, id));
        expect(after.hpMax).toEqual(before.hpMax);
      },
      opts('seats-none'),
    );
  });
});

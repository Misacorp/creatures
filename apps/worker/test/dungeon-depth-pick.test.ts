/**
 * The depth picker of the combat v2 dungeon (docs/design/decisions/dungeon.md, "Combat v2 dungeon depth picker built"):
 * a run may start at any depth the player has unlocked (1 up to their own), plays entirely at that depth, and only a
 * clear at the player's own depth unlocks the next one. A landmark's one-off bonus is not paid again by a replay of it.
 * A v1 server refuses the field.
 */
import { knownKnacks } from '@creatures/game/combat-v2';
import { createSeededRng, dungeonResourceBp, isLandmark, scaleBp } from '@creatures/game';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunState } from '../src/dungeon-state';
import type { DungeonRunState, DungeonRunSummary } from '../src/dungeon-types';
import { dungeonPlayer, easyFoes, type Policy } from './dungeon-helpers';
import { scaleV2Foes } from './dungeon-v2-reads';
import { runCore, type CoreContext } from './helpers';
import { grantFirstTalent } from '../src/talent-v2-store';
import { propsOf } from '../src/analytics-props';
import { nextGuild, rows } from './raid-helpers';

/** 14:00 in Helsinki on 2027-01-15, after the daily reset. */
const AFTER_RESET = Date.parse('2027-01-15T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const STRONG = { level: 30, species: ['tidewing', 'pyrelynx', 'thornbuck'] };

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

/** Every creature learns a v2 talent and its form's first Knack (what the staging conversion does, with fixed dice). */
function giveV2(ctx: CoreContext, userId: string): void {
  const rng = createSeededRng('depth-pick-talents');
  for (const c of rows<{ id: string; line: string; species: string }>(
    ctx.sql,
    'SELECT id, line, species FROM creatures WHERE user_id = ? ORDER BY caught_at',
    userId,
  )) {
    grantFirstTalent(ctx.sql, rng, { creatureId: c.id, userId, line: c.line, now: ctx.clock.t });
    ctx.sql.exec(
      'UPDATE creatures SET knack = ? WHERE id = ?',
      knownKnacks(c.species)[0] ?? null,
      c.id,
    );
  }
}

const setDepth = (ctx: CoreContext, userId: string, depth: number): void => {
  ctx.sql.exec(
    `INSERT INTO dungeon_progress (user_id, depth, first_day) VALUES (?, ?, '2027-01-01')
     ON CONFLICT(user_id) DO UPDATE SET depth = excluded.depth`,
    userId,
    depth,
  );
};
const depthOf = (ctx: CoreContext, userId: string): number =>
  rows<{ depth: number }>(
    ctx.sql,
    'SELECT depth FROM dungeon_progress WHERE user_id = ?',
    userId,
  )[0]?.depth ?? 0;
const runRow = (ctx: CoreContext, runId: string) =>
  rows<{ state_json: string; depth: number; summary_json: string }>(
    ctx.sql,
    'SELECT state_json, depth, summary_json FROM dungeon_runs WHERE id = ?',
    runId,
  )[0];
const stored = (ctx: CoreContext, runId: string): RunState =>
  JSON.parse(runRow(ctx, runId)?.state_json ?? '{}') as RunState;
/** Walks to the boss without stepping into a mystery room when there is another way (a rare event can lose a run). */
const SAFE: NonNullable<Policy['pick']> = (state) =>
  state.reachable.find((id) => state.map.nodes.find((n) => n.id === id)?.kind !== 'mystery') ??
  (state.reachable[0] as string);
const atDescent = (s: DungeonRunState): boolean => s.pending?.kind === 'descend';

describe('starting at a picked depth (combat v2)', () => {
  it('plays the whole run at the picked depth: its foes, its stored input and its pay', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        giveV2(ctx, p.id);
        ctx.clock.t = AFTER_RESET;
        setDepth(ctx, p.id, 40);
        const before = await p.today();
        expect(before.depth).toBe(40);
        const started = await p.start({ depth: 10 });
        expect(started.status, JSON.stringify(started.body)).toBe(200);
        const state = started.body.state;
        expect(state.depth).toBe(10);
        expect(state.lower).toBe(true);
        expect(runRow(ctx, state.id)?.depth).toBe(10);
        const raw = stored(ctx, state.id);
        expect(raw.input.depth).toBe(10);
        expect(raw.top).toBe(40);
        // The map's foes are the picked depth's, not the player's own.
        const boss = (map: { nodes: { kind: string; foe?: unknown }[] }) =>
          JSON.stringify(map.nodes.find((n) => n.kind === 'boss')?.foe);
        expect(boss(state.map)).not.toBe(boss(before.map));
        // While it is open, today shows the run's depth.
        expect((await p.today()).depth).toBe(10);
        // The pack is paid at the picked depth.
        const waiting = (await p.play(state, { stopWhen: atDescent, pick: SAFE })).body
          .state as DungeonRunState;
        const rawEnd = stored(ctx, state.id);
        if (waiting.pending?.kind === 'descend') {
          expect(waiting.pending.lower).toBe(true);
          const res = await p.act(waiting, { type: 'home' });
          expect(res.status, JSON.stringify(res.body)).toBe(200);
        }
        const summary = JSON.parse(
          runRow(ctx, state.id)?.summary_json ?? '{}',
        ) as DungeonRunSummary;
        expect(summary.depth).toBe(10);
        expect(summary.lower).toBe(true);
        expect(summary.pack?.found.scrap).toBe(scaleBp(rawEnd.pack.scrap, dungeonResourceBp(10)));
      },
      V2('pick-plays'),
    );
  });

  it('a clear below the player’s depth unlocks nothing; a clear at it unlocks the next', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        giveV2(ctx, p.id);
        ctx.clock.t = AFTER_RESET;
        setDepth(ctx, p.id, 20);
        const low = await p.run({ depth: 5 }, { pick: SAFE });
        expect(low.status, JSON.stringify(low.body)).toBe(200);
        expect(low.body.run?.cleared).toBe(true);
        expect(low.body.run?.depth).toBe(5);
        expect(low.body.run?.newDepth).toBe(20);
        expect(depthOf(ctx, p.id)).toBe(20);
        expect((await p.today()).depth).toBe(20);

        // The next day: a clear at the own depth advances.
        ctx.clock.t = AFTER_RESET + DAY;
        const own = await p.run({ depth: 20 }, { pick: SAFE });
        expect(own.body.run?.cleared).toBe(true);
        expect(own.body.run?.lower).toBeUndefined();
        expect(own.body.run?.newDepth).toBe(21);
        expect(depthOf(ctx, p.id)).toBe(21);
      },
      V2('pick-progress'),
    );
  });

  it('a start without a depth plays the player’s own depth', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        giveV2(ctx, p.id);
        ctx.clock.t = AFTER_RESET;
        setDepth(ctx, p.id, 9);
        const started = await p.start();
        expect(started.body.state.depth).toBe(9);
        expect(started.body.state.lower).toBeUndefined();
        expect(stored(ctx, started.body.state.id).top).toBe(9);
      },
      V2('pick-default'),
    );
  });

  it('refuses a depth that is not a whole number, is below 1, or is not unlocked yet; nothing starts', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        giveV2(ctx, p.id);
        ctx.clock.t = AFTER_RESET;
        setDepth(ctx, p.id, 6);
        for (const depth of [0, -1, 2.5, '3', null, 10_000] as unknown as number[]) {
          const res = await p.start({ depth });
          expect(res.status, String(depth)).toBe(400);
          expect(res.body.error).toBe('invalid_body');
        }
        const locked = await p.start({ depth: 7 });
        expect(locked.status).toBe(400);
        expect(locked.body.error).toBe('depth_locked');
        const extra = await p.call('POST', '/api/dungeon/start', {
          ...p.body(),
          userId: 'someone-else',
        });
        expect(extra.status).toBe(400);
        expect(rows(ctx.sql, 'SELECT id FROM dungeon_runs')).toHaveLength(0);
        // The highest unlocked depth starts.
        expect((await p.start({ depth: 6 })).status).toBe(200);
      },
      V2('pick-refused'),
    );
  });

  it('a retry of a start with the same key and depth returns the run; another depth under that key is a conflict', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        giveV2(ctx, p.id);
        ctx.clock.t = AFTER_RESET;
        setDepth(ctx, p.id, 12);
        const body = p.body({ depth: 3 });
        const a = await p.call('POST', '/api/dungeon/start', body);
        const b = await p.call('POST', '/api/dungeon/start', body);
        expect(a.status).toBe(200);
        expect(b.status).toBe(200);
        expect((b.body as { state: { id: string } }).state.id).toBe(
          (a.body as { state: { id: string } }).state.id,
        );
        const c = await p.call('POST', '/api/dungeon/start', { ...body, depth: 4 });
        expect(c.status).toBe(409);
      },
      V2('pick-retry'),
    );
  });

  it('combat v1 refuses the field and starts nothing', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        giveV2(ctx, p.id);
        ctx.clock.t = AFTER_RESET;
        setDepth(ctx, p.id, 9);
        const res = await p.start({ depth: 5 });
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('depth_not_allowed');
        expect(rows(ctx.sql, 'SELECT id FROM dungeon_runs')).toHaveLength(0);
        // Without it a v1 run starts as before: at the own depth, with no mark of the picker in its state.
        const started = await p.start();
        expect(started.status).toBe(200);
        expect(started.body.state.depth).toBe(9);
        expect(started.body.state.lower).toBeUndefined();
        expect(stored(ctx, started.body.state.id).top).toBeUndefined();
      },
      opts('pick-v1'),
    );
  });
});

describe('a landmark’s bonus is one-off (combat v2)', () => {
  const LANDMARK = 14;
  it('is paid by the clear at the player’s own depth and not by a replay of it below', async () => {
    expect(isLandmark(LANDMARK)).toBe(true);
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        giveV2(ctx, p.id);
        ctx.clock.t = AFTER_RESET;
        const paid = (id: string) =>
          (JSON.parse(runRow(ctx, id)?.summary_json ?? '{}') as { rewards: { landmark: boolean } })
            .rewards.landmark;
        // The landmark is below the player's own depth: a replay.
        setDepth(ctx, p.id, LANDMARK + 1);
        const replay = await p.run({ depth: LANDMARK }, { pick: SAFE });
        expect(replay.body.run?.cleared).toBe(true);
        expect(replay.body.run?.landmark).toBe(true); // the depth is a landmark: the floor boss is there
        expect(paid(replay.body.run?.id as string)).toBe(false);
        expect(depthOf(ctx, p.id)).toBe(LANDMARK + 1);

        // The same landmark at the player's own depth pays it.
        setDepth(ctx, p.id, LANDMARK);
        ctx.clock.t = AFTER_RESET + DAY;
        const first = await p.run({ depth: LANDMARK }, { pick: SAFE });
        expect(first.body.run?.cleared).toBe(true);
        expect(paid(first.body.run?.id as string)).toBe(true);
        expect(depthOf(ctx, p.id)).toBe(LANDMARK + 1);
      },
      V2('pick-landmark'),
    );
  });
});

describe('GET /api/dungeon/preview', () => {
  it('answers the map and floor boss at an unlocked depth, and refuses anything else', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        giveV2(ctx, p.id);
        ctx.clock.t = AFTER_RESET;
        setDepth(ctx, p.id, 20);
        const today = await p.today();
        const low = await p.call('GET', '/api/dungeon/preview?depth=14');
        expect(low.status, JSON.stringify(low.body)).toBe(200);
        const view = low.body as unknown as {
          depth: number;
          landmark: boolean;
          landmarkBoss: { depth: number } | null;
          map: { nodes: { id: string }[] };
        };
        expect(view.depth).toBe(14);
        expect(view.landmark).toBe(true);
        expect(view.landmarkBoss?.depth).toBe(14);
        // The same day's rooms as today's map (the map is the day's, whatever the depth).
        expect(view.map.nodes.map((n) => n.id)).toEqual(today.map.nodes.map((n) => n.id));
        for (const query of ['21', '0', '-1', '2.5', '1e1', 'x', '', '007']) {
          const res = await p.call('GET', `/api/dungeon/preview?depth=${query}`);
          expect(res.status, query).toBe(400);
        }
        expect((await p.call('GET', '/api/dungeon/preview')).status).toBe(400);
        expect(rows(ctx.sql, 'SELECT id FROM dungeon_runs')).toHaveLength(0);
      },
      V2('pick-preview'),
    );
  });

  it('is refused on combat v1', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        setDepth(ctx, p.id, 5);
        const res = await p.call('GET', '/api/dungeon/preview?depth=2');
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('depth_not_allowed');
      },
      opts('pick-preview-v1'),
    );
  });
});

describe('the analytics of a pick', () => {
  const base = {
    kind: 'dungeon_run',
    depth: 10,
    attempt: 1,
    roomsCleared: 3,
    cleared: true,
    landmark: false,
    modifiers: [],
    team: [],
    gear: 0,
  } as const;

  it('keeps the player’s own depth and whether the pick was below it, bounded', () => {
    expect(propsOf({ ...base, top: 40, belowOwn: true })).toMatchObject({
      depth: 10,
      top: 40,
      belowOwn: true,
    });
    expect(propsOf({ ...base, top: 99_999 })).toMatchObject({ top: 9_999 });
    const plain = propsOf(base);
    expect(plain).not.toHaveProperty('top');
    expect(plain).not.toHaveProperty('belowOwn');
  });

  it('records a finished run with the pick', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        giveV2(ctx, p.id);
        ctx.clock.t = AFTER_RESET;
        setDepth(ctx, p.id, 20);
        const low = await p.run({ depth: 5 }, { pick: SAFE });
        expect(low.body.run?.lower).toBe(true);
        const events = rows<{ props_json: string }>(
          ctx.sql,
          "SELECT props_json FROM analytics_events WHERE kind = 'dungeon_run'",
        );
        const props = JSON.parse(events[0]?.props_json ?? '{}') as Record<string, unknown>;
        expect(props).toMatchObject({ depth: 5, top: 20, belowOwn: true });
      },
      V2('pick-analytics'),
    );
  });
});

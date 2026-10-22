import {
  RULES,
  createSeededRng,
  dungeonEvent,
  dungeonScrapPerRoom,
  type Rng,
} from '@creatures/game';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseState, type RunState } from '../src/dungeon-state';
import type { DungeonMapNode } from '@creatures/game';
import type { DungeonRunState } from '../src/dungeon-types';
import {
  dungeonPlayer,
  type Act,
  easyFoes,
  followRoute,
  routeThrough,
  type DungeonPlayer,
} from './dungeon-helpers';
import { runCore, type CoreContext } from './helpers';
import { DAY, newKey } from './kit';
import { nextGuild, rows } from './raid-helpers';

/**
 * The Sealed Vault (docs/design/dungeon-paths.md, "The Sealed Vault"): a rare mystery room. Breaking the
 * seal marks the fights ahead; the first marked room the run enters is an epic fight with double rewards.
 * The dice are scripted where it matters: the rare draw comes from the run's rng, the shard rolls from the gear rng.
 */

let restore: () => void = () => undefined;
beforeEach(() => {
  restore = easyFoes();
});
afterEach(() => {
  restore();
});

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

/** Any `chance` wins, and `int(rng, n)` is 0. */
const LOW = 0;

const STRONG = { level: 30, species: ['tidewing', 'pyrelynx', 'thornbuck'] };
/** Depth 1: the Blue Chasm (from depth 3) is not in the way, so a LOW draw gives the vault. */
const DEPTH = 1;

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

const stored = (ctx: CoreContext, runId: string): RunState =>
  JSON.parse(
    rows<{ state_json: string }>(
      ctx.sql,
      'SELECT state_json FROM dungeon_runs WHERE id = ?',
      runId,
    )[0]?.state_json ?? '{}',
  ) as RunState;

const save = (ctx: CoreContext, runId: string, st: unknown): void => {
  ctx.sql.exec('UPDATE dungeon_runs SET state_json = ? WHERE id = ?', JSON.stringify(st), runId);
};

/** A mystery room (on the first floors, before the camp) with a fight or an elite among the rooms it leads to. */
const leadsToFight =
  (map: { nodes: DungeonMapNode[] }) =>
  (n: DungeonMapNode): boolean =>
    n.kind === 'mystery' &&
    n.floor < RULES.dungeon.campFloor &&
    n.next.some((id) => {
      const kind = map.nodes.find((x) => x.id === id)?.kind;
      return kind === 'fight' || kind === 'elite';
    });

/** Starts a run and walks it to the room before such a mystery room. */
async function toDoor({ ctx, p }: Setup): Promise<{ state: DungeonRunState; target: string }> {
  setDepth(ctx, p.id, DEPTH);
  for (let day = 0; day < 60; day++) {
    const map = (await p.today()).map;
    if (map === null || map === undefined) throw new Error('no map');
    const route = routeThrough(map, leadsToFight(map));
    if (route === undefined) {
      ctx.clock.t += DAY;
      continue;
    }
    const start = await p.start();
    expect(start.status, JSON.stringify(start.body)).toBe(200);
    const target = route.at(-1) as string;
    const before = route.at(-2);
    let state = start.body.state;
    if (before !== undefined) {
      const res = await p.play(state, {
        pick: followRoute(route),
        stopWhen: (s) => s.at === before,
      });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      state = res.body.state as DungeonRunState;
    }
    expect(state.status).toBe('active');
    expect(state.pending).toBeNull();
    return { state, target };
  }
  throw new Error('no map with such a mystery room in 60 days');
}

/** Steps into the mystery room with the rare draw scripted to come up. */
async function openVault(s: Setup, state: DungeonRunState, target: string) {
  s.dungeonRng.queue.push(LOW);
  const res = await s.p.act(state, { type: 'move', node: target });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.state;
}

async function withVault(fn: (s: Setup) => Promise<void>, seed = 'vault'): Promise<void> {
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

/** The ids of the rooms of the main map that wear a mark in a run view. */
const marked = (state: DungeonRunState): string[] =>
  state.map.nodes.filter((n) => n.marks !== undefined && n.marks.length > 0).map((n) => n.id);

describe('the Sealed Vault room', () => {
  it('turns a mystery room into the vault, once a run, with its two options', async () => {
    await withVault(async (s) => {
      const { state, target } = await toDoor(s);
      const waiting = await openVault(s, state, target);
      const def = dungeonEvent('sealed-vault');
      expect(waiting.pending).toMatchObject({
        kind: 'event',
        event: {
          id: 'sealed-vault',
          name: 'Sealed Vault',
          text: def?.text,
          options: def?.options.map((o) => ({ label: o.label, description: o.description })),
        },
      });
      expect(waiting.history.at(-1)).toMatchObject({ result: 'pending', event: 'Sealed Vault' });
      expect(stored(s.ctx, waiting.id).rareSeen).toEqual(['sealed-vault']);
      expect(marked(waiting)).toEqual([]);
    });
  });

  it('is not offered a second time in a run', async () => {
    await withVault(async (s) => {
      const { state, target } = await toDoor(s);
      save(s.ctx, state.id, { ...stored(s.ctx, state.id), rareSeen: ['sealed-vault'] });
      const waiting = await openVault(s, state, target);
      if (waiting.pending?.kind === 'event') {
        expect(waiting.pending.event.id).not.toBe('sealed-vault');
      }
    }, 'twice');
  });

  it('is not offered where no fight lies ahead on any path (it would do nothing)', async () => {
    await withVault(async (s) => {
      setDepth(s.ctx, s.p.id, DEPTH);
      for (let day = 0; day < 80; day++) {
        const map = (await s.p.today()).map;
        if (map === null || map === undefined) throw new Error('no map');
        // A mystery room whose next rooms are the floor boss alone.
        const route = routeThrough(
          map,
          (n) =>
            n.kind === 'mystery' &&
            n.next.length > 0 &&
            n.next.every((id) => map.nodes.find((x) => x.id === id)?.kind === 'boss'),
        );
        if (route === undefined) {
          s.ctx.clock.t += DAY;
          continue;
        }
        const start = await s.p.start();
        const target = route.at(-1) as string;
        const before = route.at(-2) as string;
        const res = await s.p.play(start.body.state, {
          pick: followRoute(route),
          stopWhen: (x) => x.at === before,
          camp: () => ({ type: 'camp', choice: 'rest' }),
        });
        const waiting = await openVault(s, res.body.state as DungeonRunState, target);
        if (waiting.pending?.kind === 'event') {
          expect(waiting.pending.event.id).not.toBe('sealed-vault');
        }
        expect(stored(s.ctx, waiting.id).rareSeen).toEqual([]);
        return;
      }
      throw new Error('no such map in 80 days');
    }, 'nofight');
  });
});

describe('breaking the seal', () => {
  it('marks the fights ahead on the map view with the badge data, and says what happened', async () => {
    await withVault(async (s) => {
      const { state, target } = await toDoor(s);
      const waiting = await openVault(s, state, target);
      const res = await s.p.act(waiting, { type: 'event', option: 0 });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const next = res.body.state;
      expect(next.pending).toBeNull();
      expect(next.lastEvent).toMatchObject({
        name: 'Sealed Vault',
        option: 'Break the seal',
        outcome: 'The seal breaks. The next fight you enter is epic, with double rewards.',
      });
      const targets = stored(s.ctx, next.id).sealed;
      expect(targets.length).toBeGreaterThan(0);
      expect(marked(next).sort()).toEqual([...targets].sort());
      // The marked rooms are the fights among the rooms the vault leads to.
      const from = next.map.nodes.find((n) => n.id === target) as DungeonMapNode;
      const fights = from.next.filter((id) => {
        const kind = next.map.nodes.find((n) => n.id === id)?.kind;
        return kind === 'fight' || kind === 'elite';
      });
      expect([...targets].sort()).toEqual([...fights].sort());
      for (const id of targets) {
        const node = next.map.nodes.find((n) => n.id === id) as DungeonMapNode;
        expect(node.marks).toEqual([
          { kind: 'sealed-vault', text: 'x2', label: 'Sealed Vault: epic fight, double rewards' },
        ]);
        expect(node.foe?.elite).toBe(true);
      }
      expect(next.history.at(-1)).toMatchObject({
        result: 'event',
        event: 'Sealed Vault',
        option: 'Break the seal',
      });
    });
  });

  it('leaving it sealed marks nothing', async () => {
    await withVault(async (s) => {
      const { state, target } = await toDoor(s);
      const waiting = await openVault(s, state, target);
      const res = await s.p.act(waiting, { type: 'event', option: 1 });
      expect(res.status).toBe(200);
      expect(marked(res.body.state)).toEqual([]);
      expect(stored(s.ctx, res.body.state.id).sealed).toEqual([]);
      expect(res.body.state.lastEvent?.outcome).toBe('Nothing happens.');
    }, 'leave');
  });

  it('a retry of the same answer returns the same result and marks no more', async () => {
    await withVault(async (s) => {
      const { state, target } = await toDoor(s);
      const waiting = await openVault(s, state, target);
      const key = newKey('dungeon', 'seal');
      const first = await s.p.act(waiting, { type: 'event', option: 0 }, key);
      const before = stored(s.ctx, waiting.id);
      const again = await s.p.act(waiting, { type: 'event', option: 0 }, key);
      expect(again.status).toBe(200);
      expect(again.body).toEqual(first.body);
      expect(stored(s.ctx, waiting.id)).toEqual(before);
    }, 'retry');
  });

  it('the first marked room entered is the epic fight; the mark is used up for every room', async () => {
    await withVault(async (s) => {
      const { state, target } = await toDoor(s);
      const waiting = await openVault(s, state, target);
      const broke = (await s.p.act(waiting, { type: 'event', option: 0 })).body.state;
      const targets = stored(s.ctx, broke.id).sealed;
      const room = targets[0] as string;
      const before = stored(s.ctx, broke.id);
      // Two shard rolls (the room's chance wins each: LOW) from the gear rng.
      s.gearRng.queue.push(LOW, LOW);
      const res = await s.p.act(broke, { type: 'move', node: room });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const next = res.body.state;
      const st = stored(s.ctx, next.id);
      expect(st.sealed).toEqual([]);
      expect(marked(next)).toEqual([]);
      const entry = next.history.at(-1);
      const kind = broke.map.nodes.find((n) => n.id === room)?.kind as 'fight' | 'elite';
      expect(entry).toMatchObject({
        node: room,
        kind,
        result: 'fight',
        cleared: true,
        sealed: true,
      });
      // Double the room's loot: the pack gained twice the Bait, and twice the scrap with the day's per-room scrap.
      const loot = RULES.dungeon.loot[kind];
      const perRoom = dungeonScrapPerRoom(st.weather);
      expect(entry && 'loot' in entry ? entry.loot : null).toMatchObject({
        bait: 2 * loot.bait,
        essence: 2 * loot.essence,
        scrap: 2 * (loot.scrap + perRoom),
      });
      // Two shard rolls, both won: two shards of the foe's element.
      const shards = Object.values(st.pack.shards ?? {}).reduce((a, b) => a + b, 0);
      const had = Object.values(before.pack.shards ?? {}).reduce((a, b) => a + b, 0);
      expect(shards - had).toBe(2);
      // Epic experience for every creature that stood in the row, not the fight's.
      for (const slot of st.input.team) {
        const gained = (st.earned[slot.id]?.base ?? 0) - (before.earned[slot.id]?.base ?? 0);
        expect(gained, slot.id).toBe(RULES.experience.dungeon.epic);
        expect(st.earned[slot.id]?.epics).toBe(1);
      }
    }, 'consume');
  });

  it('other marked rooms go back to normal: a different fight afterwards is plain', async () => {
    await withVault(async (s) => {
      const { state, target } = await toDoor(s);
      const waiting = await openVault(s, state, target);
      const broke = (await s.p.act(waiting, { type: 'event', option: 0 })).body.state;
      const room = stored(s.ctx, broke.id).sealed[0] as string;
      const res = await s.p.act(broke, { type: 'move', node: room });
      const next = res.body.state;
      // Walk on to the next fight (the camp may come first) and look at its entry.
      const more = await s.p.play(next, {
        stopWhen: (x) => x.history.filter((h) => h.result === 'fight').length >= 3,
      });
      const fights = (more.body.state as DungeonRunState).history.filter(
        (h) => h.result === 'fight',
      );
      const at = fights.findIndex((h) => h.node === room);
      expect(at).toBeGreaterThanOrEqual(0);
      expect('sealed' in (fights[at] ?? {})).toBe(true);
      const later = fights.slice(at + 1);
      expect(later.length).toBeGreaterThanOrEqual(1);
      for (const h of later) expect('sealed' in h).toBe(false);
    }, 'plain-after');
  });

  it('pays the doubled pack once at the end, however often the last act is sent', async () => {
    await withVault(async (s) => {
      const { state, target } = await toDoor(s);
      const waiting = await openVault(s, state, target);
      const broke = (await s.p.act(waiting, { type: 'event', option: 0 })).body.state;
      const room = stored(s.ctx, broke.id).sealed[0] as string;
      const entered = (await s.p.act(broke, { type: 'move', node: room })).body.state;
      const packBait = entered.pack.bait;
      expect(packBait).toBeGreaterThanOrEqual(2);
      // Play on to the end, keeping the last act's key to send it again.
      let key = newKey('dungeon', 'last');
      let cur = entered;
      let last: Awaited<ReturnType<DungeonPlayer['act']>> | undefined;
      let lastBefore = cur;
      let lastAct: Act = { type: 'home' };
      for (let i = 0; i < 40 && cur.status === 'active'; i++) {
        lastBefore = cur;
        key = newKey('dungeon', 'last');
        const act =
          cur.pending?.kind === 'event'
            ? ({ type: 'event', option: 1 } as const)
            : cur.pending?.kind === 'camp'
              ? ({ type: 'camp', choice: 'rest' } as const)
              : cur.pending?.kind === 'descend'
                ? ({ type: 'home' } as const)
                : ({ type: 'move', node: cur.reachable[0] as string } as const);
        lastAct = act;
        last = await s.p.act(cur, act, key);
        expect(last.status, JSON.stringify(last.body)).toBe(200);
        cur = last.body.state;
      }
      expect(cur.status).toBe('done');
      const summary = last?.body.summary;
      expect(summary?.pack?.found.bait).toBeGreaterThanOrEqual(packBait);
      const grants = (): number =>
        rows<{ n: number }>(s.ctx.sql, 'SELECT COUNT(*) AS n FROM gear_grants')[0]?.n ?? 0;
      const count = grants();
      const again = await s.p.act(lastBefore, lastAct, key);
      expect(again.status).toBe(200);
      expect(again.body.summary?.rewards).toEqual(summary?.rewards);
      expect(grants()).toBe(count);
    }, 'pay');
  });
});

describe('a run stored before the vault', () => {
  it('reads as having no marked rooms, and still plays', async () => {
    await withVault(async (s) => {
      const { state } = await toDoor(s);
      const old = { ...stored(s.ctx, state.id) } as Partial<RunState>;
      delete old.sealed;
      expect(parseState(JSON.stringify(old))?.sealed).toEqual([]);
      save(s.ctx, state.id, old);
      const res = await s.p.act(state, { type: 'move', node: state.reachable[0] as string });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(marked(res.body.state)).toEqual([]);
      expect(Array.isArray(stored(s.ctx, state.id).sealed)).toBe(true);
    }, 'old');
  });

  it('shows no marks on the day’s map before a run', async () => {
    await withVault(async (s) => {
      setDepth(s.ctx, s.p.id, DEPTH);
      const today = await s.p.today();
      expect(today.map?.nodes.every((n) => n.marks === undefined)).toBe(true);
    }, 'today');
  });
});

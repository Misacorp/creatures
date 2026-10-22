import { RULES, createSeededRng, type Rng } from '@creatures/game';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseState, type RunState } from '../src/dungeon-state';
import type { DungeonRunState } from '../src/dungeon-types';
import {
  dungeonPlayer,
  deadlyFoes,
  easyFoes,
  followRoute,
  routeThrough,
  type DungeonPlayer,
} from './dungeon-helpers';
import { runCore, type CoreContext } from './helpers';
import { DAY } from './kit';
import { nextGuild, rows } from './raid-helpers';

/**
 * The four rooms of the second mystery batch (docs/design/dungeon-paths.md): Training Post and Crystal
 * Hollow (plain map events), the Cursed Idol (a run-long curse) and the Hungry Door (a rare room that
 * sends the highest-level creature home for a treasure shown first). Dice are scripted where they matter.
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

const LOW = 0;
const HIGH = 4_294_959_999;
const STRONG = { level: 30, species: ['tidewing', 'pyrelynx', 'thornbuck'] };
/** The door treasure's kinds in the order `rollTreasure` draws them. */
const DOOR_KIND = { gear: 0, supplies: 1, shards: 2 } as const;

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
const save = (ctx: CoreContext, st: RunState): void => {
  ctx.sql.exec(
    'UPDATE dungeon_runs SET state_json = ? WHERE id = ?',
    JSON.stringify(st),
    runId(st),
  );
};
const runIds = new WeakMap<RunState, string>();
const runId = (st: RunState): string => runIds.get(st) as string;
const load = (ctx: CoreContext, id: string): RunState => {
  const st = stored(ctx, id);
  runIds.set(st, id);
  return st;
};

/** Starts a run and walks it to the room before the first mystery room that `want` accepts. */
async function toRoom(
  { ctx, p }: Setup,
  depth: number,
  want: (eventId: string | undefined) => boolean = () => true,
): Promise<{ state: DungeonRunState; target: string }> {
  setDepth(ctx, p.id, depth);
  for (let day = 0; day < 250; day++) {
    const map = (await p.today()).map;
    const route = routeThrough(
      map,
      (n) =>
        n.kind === 'mystery' &&
        n.event?.id !== 'quiet-room' &&
        n.floor < RULES.dungeon.campFloor &&
        want(n.event?.id),
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
    const state = res.body.state as DungeonRunState;
    expect(state.pending).toBeNull();
    return { state, target };
  }
  throw new Error('no such mystery room in 250 days');
}

async function withRooms(fn: (s: Setup) => Promise<void>, seed: string): Promise<void> {
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

const enter = async (
  s: Setup,
  state: DungeonRunState,
  target: string,
): Promise<DungeonRunState> => {
  const res = await s.p.act(state, { type: 'move', node: target });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.state;
};

/** Enters a rare room: depth 2, where only the door can come up (the chasm starts at 3). */
const enterDoor = async (
  s: Setup,
  state: DungeonRunState,
  target: string,
  kind: keyof typeof DOOR_KIND = 'supplies',
): Promise<DungeonRunState> => {
  s.dungeonRng.queue.push(LOW); // the door's draw
  s.gearRng.queue.push(DOOR_KIND[kind]); // the treasure kind
  return enter(s, state, target);
};

const hpOf = (st: DungeonRunState): number[] => st.team.map((c) => c.hp);

describe('Training Post', () => {
  it('Spar costs 10% of max HP and pays 40 experience to every standing creature; Watch pays 15 free', async () => {
    await withRooms(async (s) => {
      const { state, target } = await toRoom(s, 1, (id) => id === 'training-post');
      const waiting = await enter(s, state, target);
      expect(waiting.pending).toMatchObject({ kind: 'event', event: { id: 'training-post' } });
      const before = load(s.ctx, state.id);
      const res = await s.p.act(waiting, { type: 'event', option: 0 });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const after = load(s.ctx, state.id);
      for (const c of res.body.state.team) {
        expect(c.hp).toBeLessThan(c.hpMax);
        expect(c.hp).toBeGreaterThanOrEqual(1);
        const gained = (after.earned[c.id]?.base ?? 0) - (before.earned[c.id]?.base ?? 0);
        expect(gained).toBe(40);
      }
    }, 'post-spar');
    await withRooms(async (s) => {
      const { state, target } = await toRoom(s, 1, (id) => id === 'training-post');
      const waiting = await enter(s, state, target);
      const before = load(s.ctx, state.id);
      const res = await s.p.act(waiting, { type: 'event', option: 1 });
      expect(res.status).toBe(200);
      expect(hpOf(res.body.state)).toEqual(waiting.team.map((c) => c.hp));
      const after = load(s.ctx, state.id);
      for (const c of res.body.state.team) {
        expect((after.earned[c.id]?.base ?? 0) - (before.earned[c.id]?.base ?? 0)).toBe(15);
      }
    }, 'post-watch');
  });
});

describe('Crystal Hollow', () => {
  it('Chip a crystal puts 3 scrap and 1 Essence in the pack', async () => {
    await withRooms(async (s) => {
      const { state, target } = await toRoom(s, 1, (id) => id === 'crystal-hollow');
      const waiting = await enter(s, state, target);
      const res = await s.p.act(waiting, { type: 'event', option: 0 });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.state.pack.scrap - waiting.pack.scrap).toBe(3);
      expect(res.body.state.pack.essence - waiting.pack.essence).toBe(1);
    }, 'hollow-chip');
  });

  it('Sit in the glow heals 30% of max HP', async () => {
    await withRooms(async (s) => {
      const { state, target } = await toRoom(s, 1, (id) => id === 'crystal-hollow');
      const waiting = await enter(s, state, target);
      // Hurt everyone to half first.
      const st = load(s.ctx, state.id);
      st.hp = Object.fromEntries(waiting.team.map((c) => [c.id, Math.floor(c.hpMax / 2)]));
      save(s.ctx, st);
      const res = await s.p.act(waiting, { type: 'event', option: 1 });
      expect(res.status).toBe(200);
      for (const c of res.body.state.team) {
        const half = Math.floor(c.hpMax / 2);
        expect(c.hp).toBe(Math.min(c.hpMax, half + Math.floor((c.hpMax * 3000) / 10_000)));
      }
    }, 'hollow-glow');
  });
});

describe('Cursed Idol', () => {
  it('Take it: a keepsake and a curse shown on the run, folded into every later fight; it is gone with the run', async () => {
    await withRooms(async (s) => {
      const { state, target } = await toRoom(s, 1, (id) => id === 'cursed-idol');
      const waiting = await enter(s, state, target);
      expect(state.curses).toEqual([]);
      const res = await s.p.act(waiting, { type: 'event', option: 0 });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const next = res.body.state;
      expect(next.keepsakes).toHaveLength(1);
      expect(next.curses).toEqual([
        { id: 'idol-curse', name: "Idol's Curse", description: 'Foes deal 20% more damage.' },
      ]);
      expect(next.history.at(-1)).toMatchObject({
        result: 'event',
        option: 'Take it',
        curse: { id: 'idol-curse' },
      });
      expect(load(s.ctx, state.id).curses).toHaveLength(1);
      // The next fight carries the curse among its folds, after the keepsake.
      const fightNode = next.reachable.find(
        (id) => next.map.nodes.find((n) => n.id === id)?.foe !== undefined,
      );
      expect(fightNode).toBeDefined();
      if (fightNode === undefined) return;
      const fought = await s.p.act(next, { type: 'move', node: fightNode });
      expect(fought.status, JSON.stringify(fought.body)).toBe(200);
      const step = rows<{ input_json: string }>(
        s.ctx.sql,
        'SELECT input_json FROM dungeon_steps WHERE run_id = ? AND node = ?',
        state.id,
        fightNode,
      )[0];
      const stored = JSON.parse(step?.input_json ?? '{}') as {
        input: { rooms: { keepsakes?: { id: string }[] }[] };
      };
      expect(stored.input.rooms[0]?.keepsakes?.map((k) => k.id)).toContain('idol-curse');
    }, 'idol-take');
  });

  it('Leave it changes nothing', async () => {
    await withRooms(async (s) => {
      const { state, target } = await toRoom(s, 1, (id) => id === 'cursed-idol');
      const waiting = await enter(s, state, target);
      const res = await s.p.act(waiting, { type: 'event', option: 1 });
      expect(res.status).toBe(200);
      expect(res.body.state.curses).toEqual([]);
      expect(res.body.state.keepsakes).toEqual([]);
    }, 'idol-leave');
  });

  it('a run is cursed once: the curse is not added twice', async () => {
    await withRooms(async (s) => {
      const { state, target } = await toRoom(s, 1, (id) => id === 'cursed-idol');
      const waiting = await enter(s, state, target);
      // As if the run carried the curse already.
      const st = load(s.ctx, state.id);
      st.curses = [
        {
          id: 'idol-curse',
          name: "Idol's Curse",
          description: 'Foes deal 20% more damage.',
          effects: [{ op: 'foe_stat', stat: 'atk', bp: 2000 }],
        },
      ];
      save(s.ctx, st);
      const res = await s.p.act(waiting, { type: 'event', option: 0 });
      expect(res.body.state.curses).toHaveLength(1);
    }, 'idol-twice');
  });
});

describe('a run saved before curses', () => {
  it('loads with none and plays on', async () => {
    await withRooms(async (s) => {
      const { state } = await toRoom(s, 1);
      const old = stored(s.ctx, state.id) as Partial<RunState>;
      delete old.curses;
      s.ctx.sql.exec(
        'UPDATE dungeon_runs SET state_json = ? WHERE id = ?',
        JSON.stringify(old),
        state.id,
      );
      const loaded = parseState(
        rows<{ state_json: string }>(
          s.ctx.sql,
          'SELECT state_json FROM dungeon_runs WHERE id = ?',
          state.id,
        )[0]?.state_json ?? null,
      );
      expect(loaded?.curses).toEqual([]);
      const res = await s.p.act(state, { type: 'move', node: state.reachable[0] as string });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.state.curses).toEqual([]);
    }, 'old-curses');
  });
});

describe('Hungry Door', () => {
  it('is rare: it needs depth 2, and shows a rare-tier treasure (no blueprint) before the choice', async () => {
    await withRooms(async (s) => {
      const { state, target } = await toRoom(s, 2);
      const waiting = await enterDoor(s, state, target, 'gear');
      const pending = waiting.pending;
      if (pending?.kind !== 'event') throw new Error('no event waiting');
      expect(pending.event).toMatchObject({ id: 'hungry-door', name: 'Hungry Door' });
      expect(pending.event.options.map((o) => o.label)).toEqual(['Feed it', 'Pry it open']);
      const t = pending.event.treasure;
      expect(t?.kind).toBe('gear');
      if (t?.kind === 'gear') {
        expect(t.rarity).toBe('rare');
        expect(t.card).toBeDefined();
      }
      expect(load(s.ctx, state.id).rareSeen).toEqual(['hungry-door']);
    }, 'door-open');
    await withRooms(async (s) => {
      const { state, target } = await toRoom(s, 1);
      s.dungeonRng.queue.push(LOW);
      const waiting = await enter(s, state, target);
      const pending = waiting.pending;
      if (pending?.kind === 'event') expect(pending.event.id).not.toBe('hungry-door');
    }, 'door-shallow');
  });

  it('shows good supplies or a small shards stack for the other kinds', async () => {
    await withRooms(async (s) => {
      const { state, target } = await toRoom(s, 2);
      const waiting = await enterDoor(s, state, target, 'supplies');
      const t = waiting.pending?.kind === 'event' ? waiting.pending.event.treasure : undefined;
      expect(t).toMatchObject({ kind: 'supplies', count: 2 });
      expect(t?.kind === 'supplies' && t.supplyId.endsWith('-good')).toBe(true);
    }, 'door-supplies');
    await withRooms(async (s) => {
      const { state, target } = await toRoom(s, 2);
      const waiting = await enterDoor(s, state, target, 'shards');
      const t = waiting.pending?.kind === 'event' ? waiting.pending.event.treasure : undefined;
      expect(t?.kind).toBe('shards');
      if (t?.kind === 'shards') {
        const shards = Object.entries(t.parts).filter(([k]) => k.endsWith('-shard'));
        expect(shards.reduce((n, [, v]) => n + (v ?? 0), 0)).toBe(3);
        expect(t.parts.glimmer).toBe(2);
      }
    }, 'door-shards');
  });

  it('Feed it: the highest-level standing creature goes home keeping its XP; the treasure is taken', async () => {
    await withRooms(async (s) => {
      const { state, target } = await toRoom(s, 2);
      const waiting = await enterDoor(s, state, target, 'supplies');
      // Make one creature clearly the highest level, and give it some earned experience.
      const st = load(s.ctx, state.id);
      const top = st.input.team[1];
      if (top === undefined) throw new Error('no second creature');
      st.input = {
        ...st.input,
        team: st.input.team.map((slot) => (slot.id === top.id ? { ...slot, level: 99 } : slot)),
      };
      st.earned[top.id] = {
        base: 77,
        fights: 1,
        elites: 0,
        epics: 0,
        keepers: 0,
        bosses: 0,
        caches: 0,
        events: 0,
      };
      save(s.ctx, st);
      const res = await s.p.act({ ...waiting, step: waiting.step }, { type: 'event', option: 0 });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const next = res.body.state;
      expect(next.team.map((c) => c.id)).not.toContain(top.id);
      expect(next.team).toHaveLength(2);
      expect(next.history.at(-1)).toMatchObject({
        result: 'event',
        option: 'Feed it',
        treasure: { kind: 'supplies' },
        sentHome: top.name,
      });
      expect(next.lastEvent?.outcome).toBe(`${top.name} heads home. You take the treasure.`);
      const after = load(s.ctx, state.id);
      expect(after.treasures).toHaveLength(1);
      expect(after.earned[top.id]?.base).toBe(77);
      expect(after.everyone).toContain(top.id);
      expect(after.hpMax[top.id]).toBeUndefined();
      // The run plays on and ends with the creature paid and listed as the one that went home.
      const end = await s.p.play(next);
      expect(end.status, JSON.stringify(end.body)).toBe(200);
      const run = (
        end.body as {
          run: {
            team: { id: string }[];
            rewards: { recap?: { creatureId: string }[]; supplies?: string[] };
          };
        }
      ).run;
      expect(run.team.map((c) => c.id)).not.toContain(top.id);
      expect(run.rewards.recap?.map((r) => r.creatureId)).toContain(top.id);
      expect((run.rewards.supplies ?? []).filter((x) => x.endsWith('-good'))).toHaveLength(2);
    }, 'door-feed');
  });

  it('Feed it is refused with one creature standing: the view says why, and the run does not move', async () => {
    await withRooms(async (s) => {
      const { state, target } = await toRoom(s, 2);
      const waiting = await enterDoor(s, state, target);
      const st = load(s.ctx, state.id);
      const [keep, ...rest] = st.input.team;
      if (keep === undefined) throw new Error('empty row');
      st.hp = Object.fromEntries([
        [keep.id, 10],
        ...rest.map((slot): [string, number] => [slot.id, 0]),
      ]);
      save(s.ctx, st);
      const again = await s.p.call('GET', '/api/dungeon/today');
      expect(again.status).toBe(200);
      const view = (
        again.body as unknown as {
          active: { pending: { event: { options: { blocked?: string }[] } } };
        }
      ).active.pending.event;
      expect(view.options[0]?.blocked).toBe('Needs two creatures standing.');
      expect(view.options[1]?.blocked).toBeUndefined();
      const refused = await s.p.act(waiting, { type: 'event', option: 0 });
      expect(refused.status).toBe(400);
      expect(load(s.ctx, state.id).input.team).toHaveLength(3);
      // Prying it open still works.
      s.dungeonRng.queue.push(LOW);
      const pried = await s.p.act(waiting, { type: 'event', option: 1 });
      expect(pried.status, JSON.stringify(pried.body)).toBe(200);
      expect(load(s.ctx, state.id).treasures).toHaveLength(1);
    }, 'door-one');
  });

  it('Pry it open: 40% takes the treasure, otherwise every creature loses 40% HP and the door is spent', async () => {
    await withRooms(async (s) => {
      const { state, target } = await toRoom(s, 2);
      const waiting = await enterDoor(s, state, target);
      s.dungeonRng.queue.push(LOW);
      const res = await s.p.act(waiting, { type: 'event', option: 1 });
      expect(res.status).toBe(200);
      expect(load(s.ctx, state.id).treasures).toHaveLength(1);
      expect(res.body.state.team).toHaveLength(3);
      expect(hpOf(res.body.state)).toEqual(waiting.team.map((c) => c.hp));
    }, 'door-pry-win');
    await withRooms(async (s) => {
      const { state, target } = await toRoom(s, 2);
      const waiting = await enterDoor(s, state, target);
      s.dungeonRng.queue.push(HIGH);
      const res = await s.p.act(waiting, { type: 'event', option: 1 });
      expect(res.status).toBe(200);
      expect(load(s.ctx, state.id).treasures).toHaveLength(0);
      for (const c of res.body.state.team) {
        expect(c.hp).toBe(Math.max(1, c.hpMax - Math.floor((c.hpMax * 4000) / 10_000)));
      }
    }, 'door-pry-lose');
  });

  it('a treasure taken at the door is lost if the run ends in a defeat', async () => {
    await withRooms(async (s) => {
      const { state, target } = await toRoom(s, 2);
      const waiting = await enterDoor(s, state, target, 'gear');
      s.dungeonRng.queue.push(LOW);
      const crossed = (await s.p.act(waiting, { type: 'event', option: 1 })).body.state;
      expect(load(s.ctx, state.id).treasures).toHaveLength(1);
      restore();
      restore = deadlyFoes();
      const res = await s.p.act(crossed, { type: 'move', node: crossed.reachable[0] as string });
      expect(res.body.state).toMatchObject({ status: 'done', outcome: 'defeat' });
      const rewards = res.body.summary?.rewards as {
        gear: { rarity: string }[];
        treasureLost?: { kind: string; rarity?: string };
      };
      expect(rewards.treasureLost).toMatchObject({ kind: 'gear', rarity: 'rare' });
      expect(rewards.gear.some((g) => g.rarity === 'rare')).toBe(false);
    }, 'door-defeat');
  });
});

describe('the rare roll across rooms', () => {
  it('a run can meet both rare rooms, once each: the door is spent once met, the chasm can still come', async () => {
    await withRooms(async (s) => {
      const { state, target } = await toRoom(s, 3);
      // The run has met the door already: only the chasm is drawn for.
      const st = load(s.ctx, state.id);
      st.rareSeen = ['hungry-door'];
      save(s.ctx, st);
      s.dungeonRng.queue.push(LOW);
      const waiting = await enter(s, state, target);
      expect(waiting.pending).toMatchObject({ kind: 'event', event: { id: 'blue-chasm' } });
      expect(load(s.ctx, state.id).rareSeen).toEqual(['hungry-door', 'blue-chasm']);
    }, 'both-rare');
  });
});

import { RULES, type DungeonMapNode, type DungeonMapView } from '@creatures/game';
import type {
  DungeonActResponse,
  DungeonReplayView,
  DungeonRunSummary,
  DungeonStartResponse,
  DungeonToday,
} from '../src/dungeon';
import type { DungeonRunState } from '../src/dungeon-types';
import type { CoreContext } from './helpers';
import { newKey, sessionCaller, type Json } from './kit';
import { seedPlayer, type SeedOptions } from './raid-helpers';

type Call = (method: string, path: string, body?: unknown) => Promise<Json>;

/**
 * The modifier ids of the rooms the dev tool `dungeon-modifiers` picks: the first two entrance rooms
 * (left to right) and the floor boss, read from the map's nodes.
 */
export function pickedRoomModifierIds(map: DungeonMapView): string[] {
  const entrance = map.nodes
    .filter((n) => n.floor === 0)
    .sort((a, b) => a.lane - b.lane)
    .slice(0, 2);
  return [...entrance, ...map.nodes.filter((n) => n.kind === 'boss')].map(
    (n) => n.modifier?.id as string,
  );
}

export interface RunBodyInput {
  /** The row, left to right. */
  team: string[];
  treats?: string[];
  idempotencyKey: string;
}

export type CampAct = {
  type: 'camp';
  choice: 'rest' | 'swap' | 'keepsake';
  order?: string[];
  out?: string;
  in?: string;
  keepsake?: string;
};
export type Act =
  | { type: 'move'; node: string }
  | { type: 'event'; option: 0 | 1 }
  | CampAct
  | { type: 'home' }
  | { type: 'descend' };

/** How a scripted player walks the map. Everything is optional: the default takes the first room, rests at the camp and goes on. */
export interface Policy {
  /** The room to move to, from the rooms the run may reach. */
  pick?: (state: DungeonRunState) => string;
  event?: (state: DungeonRunState) => 0 | 1;
  /** What to do at the camp (default: rest). */
  camp?: (state: DungeonRunState) => Act;
  /** What to do at the descent card (default: head home, which ends the run cleared). */
  descend?: (state: DungeonRunState) => Act;
  /** Stop (without acting) when this is true: the open state is returned. */
  stopWhen?: (state: DungeonRunState) => boolean;
}

export type ActJson = Json<DungeonActResponse & { error?: string }>;
export type StartJson = Json<DungeonStartResponse & { error?: string }>;

/** What `run` answers: the way the old all-at-once run did, built from the last act of a played-out run. */
export interface RunResult {
  run: DungeonRunSummary;
  today: DungeonToday;
  /** Every response of the run, start first. */
  steps: ActJson[];
  state: DungeonRunState;
  error?: string;
}

const act = (
  call: Call,
  state: DungeonRunState,
  a: Act,
  key = newKey('dungeon', 'test'),
): Promise<Json> =>
  call('POST', '/api/dungeon/act', {
    runId: state.id,
    step: state.step,
    idempotencyKey: key,
    act: a,
  });

/**
 * Starts a run and plays it with `policy` until it ends (or `stopWhen` says stop). A refusal at any
 * point is returned as it came.
 */
export async function playThrough(
  call: Call,
  body: unknown,
  policy: Policy = {},
): Promise<Json<Partial<RunResult> & { error?: string }>> {
  const started = (await call('POST', '/api/dungeon/start', body)) as unknown as StartJson;
  if (started.status !== 200) return started;
  return playFrom(call, started.body.state, policy);
}

/** Plays a run that is already open (see `playThrough`). */
export async function playFrom(
  call: Call,
  from: DungeonRunState,
  policy: Policy = {},
): Promise<Json<Partial<RunResult> & { error?: string }>> {
  let state = from;
  const steps: ActJson[] = [];
  for (let n = 0; n < 40; n++) {
    if (state.status === 'done') break;
    if (policy.stopWhen?.(state) === true) break;
    let next: Act;
    if (state.pending?.kind === 'event') {
      next = { type: 'event', option: policy.event?.(state) ?? 0 };
    } else if (state.pending?.kind === 'camp') {
      next = policy.camp?.(state) ?? { type: 'camp', choice: 'rest' };
    } else if (state.pending?.kind === 'descend') {
      next = policy.descend?.(state) ?? { type: 'home' };
    } else {
      const to = policy.pick?.(state) ?? state.reachable[0] ?? '';
      next = { type: 'move', node: to };
    }
    const res = (await act(call, state, next)) as unknown as ActJson;
    if (res.status !== 200) return res;
    steps.push(res);
    state = res.body.state;
    if (res.body.summary !== undefined && res.body.today !== undefined) {
      return {
        status: 200,
        body: { run: res.body.summary, today: res.body.today, steps, state },
      };
    }
  }
  return { status: 200, body: { steps, state } };
}

export interface DungeonPlayer {
  id: string;
  name: string;
  creatureIds: string[];
  call: (method: string, path: string, body?: unknown) => Promise<Json>;
  today: () => Promise<DungeonToday>;
  /** A request body for the default team (the first three creatures), with overrides. */
  body: (overrides?: Partial<RunBodyInput>) => RunBodyInput;
  start: (overrides?: Partial<RunBodyInput>) => Promise<StartJson>;
  /** One act of a run, with the run's own step and a fresh key unless one is given. */
  act: (state: DungeonRunState, a: Act, key?: string, step?: number) => Promise<ActJson>;
  /** Plays a run that is open (see `playFrom`). */
  play: (
    state: DungeonRunState,
    policy?: Policy,
  ) => Promise<Json<Partial<RunResult> & { error?: string }>>;
  /** Starts a run and plays it out (see `playThrough`): `body.run` is the summary, `body.today` the fresh day. */
  run: (
    overrides?: Partial<RunBodyInput>,
    policy?: Policy,
  ) => Promise<Json<RunResult & { error?: string }>>;
  replay: (runId: string) => Promise<Json<DungeonReplayView & { error?: string }>>;
}

/** A seeded player (creatures straight into the tables) with a session and the dungeon calls. */
export async function dungeonPlayer(
  ctx: CoreContext,
  n: number,
  options: SeedOptions = {},
): Promise<DungeonPlayer> {
  const seeded = seedPlayer(ctx, n, { level: 8, creatures: 3, ...options });
  const { call } = await sessionCaller(ctx, { id: seeded.id, displayName: seeded.name });
  const body = (overrides: Partial<RunBodyInput> = {}): RunBodyInput => ({
    team: seeded.creatureIds.slice(0, 3),
    idempotencyKey: newKey('dungeon', 'test'),
    ...overrides,
  });
  return {
    id: seeded.id,
    name: seeded.name,
    creatureIds: seeded.creatureIds,
    call,
    today: async () => (await call('GET', '/api/dungeon/today')).body as unknown as DungeonToday,
    body,
    start: async (overrides = {}) =>
      (await call('POST', '/api/dungeon/start', body(overrides))) as unknown as StartJson,
    act: async (state, a, key, step) =>
      (await call('POST', '/api/dungeon/act', {
        runId: state.id,
        step: step ?? state.step,
        idempotencyKey: key ?? newKey('dungeon', 'test'),
        act: a,
      })) as unknown as ActJson,
    play: (state, policy = {}) => playFrom(call, state, policy),
    run: async (overrides = {}, policy = {}) =>
      (await playThrough(call, body(overrides), policy)) as unknown as Json<
        RunResult & { error?: string }
      >,
    replay: async (runId) =>
      (await call('GET', `/api/dungeon/run/${runId}`)) as unknown as Json<
        DungeonReplayView & { error?: string }
      >,
  };
}

export type { DungeonRunSummary, DungeonRunState };

// --- Making fights easy or deadly without hard-coding the tuned numbers ---

/**
 * Sets how strong foes are at depth 1 (`RULES.dungeon.baseHpBp` and `baseAtkBp`, basis points of their
 * content numbers) and returns what puts them back. The tuned numbers move with the simulator, so a test
 * that needs a sure win or a sure loss says so with this instead of relying on a depth or a level.
 */
export function scaleFoes(hpBp: number, atkBp: number): () => void {
  const rules = RULES.dungeon as { baseHpBp: number; baseAtkBp: number };
  const before = { hp: rules.baseHpBp, atk: rules.baseAtkBp };
  rules.baseHpBp = hpBp;
  rules.baseAtkBp = atkBp;
  return () => {
    rules.baseHpBp = before.hp;
    rules.baseAtkBp = before.atk;
  };
}

/** Foes that any team beats. */
export const easyFoes = (): (() => void) => scaleFoes(500, 500);
/** Foes that beat any team in the first fight. */
export const deadlyFoes = (): (() => void) => scaleFoes(3_000_000, 3_000_000);

/** Runs `fn` with deadly foes, whatever happens inside. */
export async function withDeadlyFoes<T>(fn: () => Promise<T>): Promise<T> {
  const restore = deadlyFoes();
  try {
    return await fn();
  } finally {
    restore();
  }
}

// --- Walking to a kind of room ---

/** The shortest route from the entrance to the first room that `wanted` accepts, as node ids (undefined: none). */
export function routeThrough(
  map: DungeonMapView,
  wanted: (node: DungeonMapNode) => boolean,
): string[] | undefined {
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  let frontier: string[][] = map.nodes.filter((n) => n.floor === 0).map((n) => [n.id]);
  while (frontier.length > 0) {
    const hit = frontier.find((route) =>
      wanted(byId.get(route.at(-1) as string) as DungeonMapNode),
    );
    if (hit !== undefined) return hit;
    frontier = frontier.flatMap((route) =>
      (byId.get(route.at(-1) as string)?.next ?? []).map((id) => [...route, id]),
    );
  }
  return undefined;
}

/** A policy `pick`: follow `route`, then take the first room there is. */
export const followRoute =
  (route: readonly string[]): NonNullable<Policy['pick']> =>
  (state) =>
    route[state.path.length] ?? (state.reachable[0] as string);

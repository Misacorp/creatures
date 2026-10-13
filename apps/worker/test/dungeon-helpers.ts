import type {
  DungeonReplayView,
  DungeonRunResponse,
  DungeonRunSummary,
  DungeonToday,
} from '../src/dungeon';
import type { CoreContext } from './helpers';
import { seedPlayer, type SeedOptions } from './raid-helpers';

export interface Json<T = Record<string, unknown>> {
  status: number;
  body: T;
}

let keyCounter = 0;
/** A valid client idempotency key, unique per call. */
export const newKey = (): string => `dungeon-${String(++keyCounter).padStart(8, '0')}-test`;

/** The zones in the order of the row. */
export const ZONE_ORDER = ['front', 'middle', 'back'] as const;

export interface RunBodyInput {
  team: string[];
  formation: string[];
  abilities: {
    basic: { abilityId: string; fireAtRound: number | null; zone?: string; element?: string };
    creatures: { creatureId: string; fireAtRound: number | null }[];
  };
  idempotencyKey: string;
}

export interface DungeonPlayer {
  id: string;
  name: string;
  creatureIds: string[];
  call: (method: string, path: string, body?: unknown) => Promise<Json>;
  today: () => Promise<DungeonToday>;
  /** A request body for the default team (the first three creatures), with overrides. */
  body: (overrides?: Partial<RunBodyInput>) => RunBodyInput;
  /** Posts a run with `body(overrides)`. */
  run: (
    overrides?: Partial<RunBodyInput>,
  ) => Promise<Json<DungeonRunResponse & { error?: string }>>;
  replay: (runId: string) => Promise<Json<DungeonReplayView & { error?: string }>>;
}

/** A seeded player (creatures straight into the tables) with a session and the dungeon calls. */
export async function dungeonPlayer(
  ctx: CoreContext,
  n: number,
  options: SeedOptions = {},
): Promise<DungeonPlayer> {
  const seeded = seedPlayer(ctx, n, { level: 8, creatures: 3, ...options });
  const user = { id: seeded.id, displayName: seeded.name };
  let secret = await ctx.core.createSession(ctx.guildId, user);
  let loggedInAt = ctx.clock.t;
  const call = async (method: string, path: string, body?: unknown): Promise<Json> => {
    // Tests jump the clock by hours; sessions idle out, so sign in again as needed.
    if (ctx.clock.t - loggedInAt >= 30 * 60_000 || ctx.clock.t < loggedInAt) {
      secret = await ctx.core.createSession(ctx.guildId, user);
      loggedInAt = ctx.clock.t;
    }
    const res = await ctx.request(secret, path, method, body);
    return { status: res.status, body: await res.json<Record<string, unknown>>() };
  };
  const body = (overrides: Partial<RunBodyInput> = {}): RunBodyInput => ({
    team: seeded.creatureIds.slice(0, 3),
    formation: [...ZONE_ORDER],
    abilities: { basic: { abilityId: 'rally', fireAtRound: null }, creatures: [] },
    idempotencyKey: newKey(),
    ...overrides,
  });
  return {
    id: seeded.id,
    name: seeded.name,
    creatureIds: seeded.creatureIds,
    call,
    today: async () => (await call('GET', '/api/dungeon/today')).body as unknown as DungeonToday,
    body,
    run: async (overrides = {}) =>
      (await call('POST', '/api/dungeon/run', body(overrides))) as unknown as Json<
        DungeonRunResponse & { error?: string }
      >,
    replay: async (runId) =>
      (await call('GET', `/api/dungeon/run/${runId}`)) as unknown as Json<
        DungeonReplayView & { error?: string }
      >,
  };
}

export type { DungeonRunSummary };

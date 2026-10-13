/**
 * The dev tools of a guild (staging only; plan in `docs/design/dev-tools.md`): a debug API that sets the
 * game into a state for testing. Safety first:
 *
 * - **Gate.** Everything lives under `/api/dev/*` and exists only when the `DEV_TOOLS` var is "on", which
 *   `wrangler.jsonc` sets for the staging environment only. With it off the Worker and the Durable Object
 *   both answer a plain 404 before anything else (not hidden: unknown routes answer 401 first), and `GuildCore` never builds
 *   a `DevTools`, so none of this code can run. A test pins production and the top level to "off".
 * - **Scope.** A tool acts on the caller's own guild (the Durable Object it runs in) and, for per-player
 *   tools, on the caller's own player data. Identity comes from the verified session, as for every route;
 *   no body carries a user id. Requests are rate-limited like any other.
 * - **Input.** Every body is a strict schema (`dev-schemas.ts`); each tool is one transaction.
 * - **Logging.** Every change is logged as an analytics event of kind `dev_action` (the tool's id only),
 *   which reports must exclude.
 * - **Randomness.** What a tool rolls (guest teams, gear, the dungeon day's seed) comes from the same live
 *   crypto sources as the game. Never `Math.random`.
 *
 * Routes (one template, `/api/dev/:tool`):
 * - `GET  /api/dev/state`  the clock, this week's raid, the caller's force flags and the tool list.
 * - `GET  /api/dev/events` the last 50 analytics events of this guild (kind, time and props; no actors).
 * - `POST /api/dev/<tool>` one of `DEV_ACTION_TOOLS`, answering `{ ok: true, tool, result }`.
 */
import { RULES } from '@creatures/game';
import * as v from 'valibot';
import type { Analytics } from './analytics';
import { DevError, purgeUser, type ToolCtx } from './dev-context';
import {
  ClockBodySchema,
  DEV_ACTION_TOOLS,
  DEV_READ_TOOLS,
  DungeonDepthBodySchema,
  DungeonModifiersBodySchema,
  DungeonStreakBodySchema,
  ForceGatesBodySchema,
  ForceOfferBodySchema,
  GrantBlueprintsBodySchema,
  GrantCreatureBodySchema,
  GrantGearBodySchema,
  GrantPartsBodySchema,
  GrantSuppliesBodySchema,
  JournalBodySchema,
  NoBodySchema,
  RaidBossBodySchema,
  RaidFestivalBodySchema,
  RaidLiveBodySchema,
  RaidPhaseBodySchema,
  RaidResolveBodySchema,
  RaidRosterBodySchema,
  RaidSimulateBodySchema,
  ResetAccountBodySchema,
  SetBalancesBodySchema,
  SetCraftingXpBodySchema,
  SetCreatureBodySchema,
  SetExplorerBodySchema,
  SetFamiliarityBodySchema,
  SetSlotsBodySchema,
  type DevActionTool,
} from './dev-schemas';
import { devKey, type DevState } from './dev-state';
import { clockState, clockTool } from './dev-tools-clock';
import {
  fillBag,
  finishJobs,
  grantBlueprints,
  grantCreature,
  grantGear,
  grantParts,
  grantSupplies,
  setBalances,
  setCraftingXp,
  setCreature,
  setExplorer,
  setFamiliarity,
} from './dev-tools-goods';
import {
  dungeonDepth,
  dungeonModifiers,
  dungeonReset,
  dungeonRetry,
  dungeonSeed,
  dungeonStreak,
  finishTrips,
  forceGates,
  forceOffer,
  journal,
  setSlots,
  slotWipeNotice,
} from './dev-tools-trips';
import {
  raidBoss,
  raidFestival,
  raidLive,
  raidPhase,
  raidResolve,
  raidRoster,
  raidSimulate,
} from './dev-tools-raid';
import {
  errorResponse,
  json,
  notFound,
  parseJsonObject,
  readLimitedText,
  type Routes,
} from './http';
import type { LedgerStorage } from './ledger';
import type { Raid } from './raid';
import { weekIdFor } from './raid-schedule';
import type { Rng } from '@creatures/game';

const MAX_BODY_BYTES = 4096;
/** Events the analytics tool lists. */
const EVENTS_LIMIT = 50;

/** True for `/api/dev` and everything below it. */
export function isDevPath(pathname: string): boolean {
  return pathname === '/api/dev' || pathname.startsWith('/api/dev/');
}

export interface DevToolsDeps {
  storage: LedgerStorage;
  state: DevState;
  /** The game clock (real time plus the dev clock offset). */
  now: () => number;
  /** The real clock. */
  realNow: () => number;
  timezone: () => string;
  analytics: Analytics;
  raid: Raid;
  /** Crypto randomness for what the tools roll. */
  rng: Rng;
  gearRng: Rng;
  quirkRng: Rng;
  offset: { get(): number; set(ms: number): void; invalidate(): void };
  /** Runs after a tool that moved the clock: catches the game up and re-arms the alarm. */
  afterClockChange: () => Promise<void>;
  /**
   * "Roll up now": rolls the guild's raw events into its daily rollups and answers what it did.
   * Without it the `analytics-rollup` tool answers 501.
   */
  rollupNow?: () => Promise<unknown>;
}

export type ToolOutcome =
  { ok: true; value: unknown } | { ok: false; status: 400 | 404 | 409 | 501; error: string };

type Tool =
  | {
      schema: v.GenericSchema;
      /** Runs inside the tool's one transaction. */
      run: (ctx: ToolCtx, body: never) => unknown;
      /** The tool moves the clock: the game catches up and the alarm is re-armed afterwards. */
      movesClock?: true;
    }
  | {
      schema: v.GenericSchema;
      /** Runs outside a transaction (it may await). */
      runAsync: (tools: DevTools, body: never) => Promise<unknown>;
    };

/** A tool whose body is checked by `schema`; the cast keeps the table typed per tool. */
function tool<S extends v.GenericSchema>(
  schema: S,
  run: (ctx: ToolCtx, body: v.InferOutput<S>) => unknown,
  options: { movesClock?: true } = {},
): Tool {
  return { schema, run, ...options };
}

/** What a tool does, by id. The type makes sure every id in `DEV_ACTION_TOOLS` has one. */
const TOOLS: Record<DevActionTool, Tool> = {
  clock: tool(ClockBodySchema, clockTool, { movesClock: true }),
  'set-balances': tool(SetBalancesBodySchema, setBalances),
  'grant-parts': tool(GrantPartsBodySchema, grantParts),
  'grant-supplies': tool(GrantSuppliesBodySchema, grantSupplies),
  'grant-blueprints': tool(GrantBlueprintsBodySchema, grantBlueprints),
  'grant-creature': tool(GrantCreatureBodySchema, grantCreature),
  'set-creature': tool(SetCreatureBodySchema, setCreature),
  'set-explorer': tool(SetExplorerBodySchema, setExplorer),
  'set-familiarity': tool(SetFamiliarityBodySchema, setFamiliarity),
  'set-crafting-xp': tool(SetCraftingXpBodySchema, setCraftingXp),
  'finish-jobs': tool(NoBodySchema, finishJobs),
  'grant-gear': tool(GrantGearBodySchema, grantGear),
  'fill-bag': tool(NoBodySchema, fillBag),
  'finish-trips': tool(NoBodySchema, finishTrips),
  'force-offer': tool(ForceOfferBodySchema, forceOffer),
  'force-gates': tool(ForceGatesBodySchema, forceGates),
  'set-slots': tool(SetSlotsBodySchema, setSlots),
  journal: tool(JournalBodySchema, journal),
  'slot-wipe-notice': tool(NoBodySchema, slotWipeNotice),
  'dungeon-depth': tool(DungeonDepthBodySchema, dungeonDepth),
  'dungeon-reset': tool(NoBodySchema, dungeonReset),
  'dungeon-streak': tool(DungeonStreakBodySchema, dungeonStreak),
  'dungeon-retry': tool(NoBodySchema, dungeonRetry),
  'dungeon-modifiers': tool(DungeonModifiersBodySchema, dungeonModifiers),
  'dungeon-seed': tool(NoBodySchema, dungeonSeed),
  'raid-phase': tool(RaidPhaseBodySchema, raidPhase, { movesClock: true }),
  'raid-resolve': tool(RaidResolveBodySchema, raidResolve),
  'raid-boss': tool(RaidBossBodySchema, raidBoss),
  'raid-festival': tool(RaidFestivalBodySchema, raidFestival),
  'raid-roster': tool(RaidRosterBodySchema, raidRoster),
  'raid-live': tool(RaidLiveBodySchema, raidLive),
  'raid-simulate': tool(RaidSimulateBodySchema, raidSimulate),
  'analytics-rollup': {
    schema: NoBodySchema,
    runAsync: async (tools) => {
      const rollup = tools.rollupNow;
      if (rollup === undefined) throw new DevError(501, 'not_implemented');
      return await rollup();
    },
  },
  'reset-account': tool(ResetAccountBodySchema, (ctx) => {
    purgeUser(ctx.sql, ctx.userId, true);
    ctx.state.clearUser(ctx.userId);
    ctx.raid.invalidateReadiness();
    return { reset: true };
  }),
};

const TOOL_IDS: ReadonlySet<string> = new Set(DEV_ACTION_TOOLS);
const READ_IDS: ReadonlySet<string> = new Set(DEV_READ_TOOLS);

export class DevTools {
  constructor(private readonly deps: DevToolsDeps) {}

  get rollupNow(): (() => Promise<unknown>) | undefined {
    return this.deps.rollupNow;
  }

  private ctx(userId: string): ToolCtx {
    const d = this.deps;
    return {
      userId,
      storage: d.storage,
      sql: d.storage.sql,
      now: d.now(),
      realNow: d.realNow(),
      tz: d.timezone(),
      state: d.state,
      raid: d.raid,
      rng: d.rng,
      gearRng: d.gearRng,
      quirkRng: d.quirkRng,
      offset: {
        get: () => d.offset.get(),
        set: (ms) => {
          d.offset.set(ms);
        },
      },
    };
  }

  /** Runs one tool for the caller: validates the body, runs it in one transaction, logs `dev_action`. */
  async run(toolId: string, userId: string, raw: unknown): Promise<ToolOutcome> {
    if (!TOOL_IDS.has(toolId)) return { ok: false, status: 404, error: 'not_found' };
    const id = toolId as DevActionTool;
    const def = TOOLS[id];
    const parsed = v.safeParse(def.schema, raw);
    if (!parsed.success) return { ok: false, status: 400, error: 'invalid_body' };
    const log = (): void => this.deps.analytics.record({ kind: 'dev_action', tool: id }, userId);
    try {
      let value: unknown;
      if ('runAsync' in def) {
        value = await def.runAsync(this, parsed.output as never);
        this.deps.storage.transactionSync(log);
      } else {
        value = this.deps.storage.transactionSync(() => {
          const out = def.run(this.ctx(userId), parsed.output as never);
          log();
          return out;
        });
      }
      if ('movesClock' in def && def.movesClock === true) await this.deps.afterClockChange();
      return { ok: true, value };
    } catch (err) {
      // A rolled-back transaction may have changed the cached offset: read it again from storage.
      this.deps.offset.invalidate();
      if (err instanceof DevError) return { ok: false, status: err.status, error: err.code };
      throw err;
    }
  }

  /** The clock, this week's raid, the caller's force flags and the tools: what the panel shows. */
  state(userId: string) {
    const ctx = this.ctx(userId);
    const week = ctx.raid.week(weekIdFor(ctx.now, ctx.tz));
    const flag = (key: string): string | null => ctx.state.get(key);
    const guests = ctx.sql
      .exec<{ n: number }>("SELECT COUNT(*) AS n FROM players WHERE user_id LIKE 'dev-guest-%'")
      .one().n;
    const today = clockState(ctx);
    const modifiers = flag(devKey.modifiers(today.gameDay));
    return {
      enabled: true,
      clock: today,
      raid:
        week === null ? null : { weekId: week.weekId, status: week.status, bossId: week.bossId },
      guests,
      flags: {
        night: flag(devKey.night(userId)) ?? 'auto',
        festival: flag(devKey.festival(userId)) ?? 'auto',
        pushOffer: flag(devKey.pushOffer(userId)),
        pushOutcome: flag(devKey.pushOutcome(userId)),
        dungeonModifiers: modifiers === null ? null : parseProps(modifiers),
      },
      limits: {
        maxAdvanceMs: 30 * 86_400_000,
        maxExplorerRank: RULES.expeditions.rank.xpForRank.length,
      },
      tools: DEV_ACTION_TOOLS,
    };
  }

  /** The last 50 analytics events of this guild: kind, time and props. Never an actor. */
  events() {
    const rows = this.deps.storage.sql
      .exec<{ at: number; kind: string; props_json: string }>(
        'SELECT at, kind, props_json FROM analytics_events ORDER BY id DESC LIMIT ?',
        EVENTS_LIMIT,
      )
      .toArray();
    return {
      events: rows.map((r) => ({ at: r.at, kind: r.kind, props: parseProps(r.props_json) })),
    };
  }
}

function parseProps(json: string): unknown {
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
}

// --- Routes ---

export interface DevRouteContext {
  user: { id: string };
  /** Path parameters of a template route, raw: matched against the tool lists before use. */
  params: Record<string, string>;
  core: { dev: DevTools | null };
}

/** A POST body: nothing (an empty object) or a small JSON object. `undefined`: refuse it. */
async function readToolBody(request: Request): Promise<unknown> {
  const text = await readLimitedText(request, MAX_BODY_BYTES);
  if (text === null) return undefined;
  if (text.trim() === '') return {};
  return parseJsonObject(text);
}

export const devRoutes: Routes<DevRouteContext> = {
  '/api/dev/:tool': {
    GET: (_request, { user, params, core }) => {
      const dev = core.dev;
      const toolId = params['tool'];
      if (dev === null || toolId === undefined || !READ_IDS.has(toolId)) return notFound();
      return json(toolId === 'state' ? dev.state(user.id) : dev.events());
    },
    POST: async (request, { user, params, core }) => {
      const dev = core.dev;
      const toolId = params['tool'];
      if (dev === null || toolId === undefined || !TOOL_IDS.has(toolId)) return notFound();
      const raw = await readToolBody(request);
      if (raw === undefined) return errorResponse('invalid_body', 400);
      const outcome = await dev.run(toolId, user.id, raw);
      if (!outcome.ok) return errorResponse(outcome.error, outcome.status);
      return json({ ok: true, tool: toolId, result: outcome.value });
    },
  },
};

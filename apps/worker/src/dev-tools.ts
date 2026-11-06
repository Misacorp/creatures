/**
 * The dev tools of a guild (staging only; plan in `docs/design/dev-tools.md`): a debug API that sets the
 * game into a state for testing. Safety first:
 *
 * - **Gate.** Everything lives under `/api/dev/*` and exists only when the `DEV_TOOLS` var is "on", which
 *   `wrangler.jsonc` sets for the staging environment only. With it off the Worker and the Durable Object
 *   both answer a plain 404 before anything else (not hidden: unknown routes answer 401 first), and `GuildCore` never builds
 *   a `DevTools`, so none of this code can run. A test pins production and the top level to "off".
 * - **Managers only.** On top of the var, only a player who can manage the Discord server (`mayUseDevTools`)
 *   reaches a dev route; anyone else gets the same plain 404, and `/api/me` does not say `devTools`.
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
  ApplyRosterPresetBodySchema,
  TrialsTickBodySchema,
  ValleySimDayBodySchema,
  ClockBodySchema,
  DEV_ACTION_TOOLS,
  DEV_READ_TOOLS,
  DungeonDepthBodySchema,
  DungeonModifiersBodySchema,
  DungeonStreakBodySchema,
  ForceGatesBodySchema,
  ForceOfferBodySchema,
  GamesBotsBodySchema,
  GamesRunNowBodySchema,
  GrantBlueprintsBodySchema,
  GrantCreatureBodySchema,
  GrantGearBodySchema,
  GrantPartsBodySchema,
  GrantSuppliesBodySchema,
  JournalBodySchema,
  NoBodySchema,
  RaidFillBodySchema,
  RaidPlayBodySchema,
  RaidRankBodySchema,
  RaidSeatsBodySchema,
  ResetAccountBodySchema,
  ResetRaidsDungeonsBodySchema,
  SchoolTeacherBodySchema,
  SetWeatherBodySchema,
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
import { combatV2Convert } from './dev-tools-combat-v2';
import { applyRosterPreset, playersView } from './dev-tools-presets';
import {
  schoolTeacher,
  trialsCeremony,
  trialsTick,
  valleyBotsTool,
  valleyFresh,
  valleyReportTool,
  valleySimDayTool,
  visitorArrive,
} from './dev-tools-valley';
import type { ValleyWorld } from './valley-bots';
import type { SchoolWeeks } from './valley-school';
import type { ValleyTrials } from './valley-trials';
import type { VisitorWeeks } from './valley-visitor';
import { setWeather } from './dev-tools-weather';
import { gamesBots, gamesReset, gamesRunNow } from './dev-tools-games';
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
import { raidClear, raidFill, raidPlay, raidRank, raidSeats } from './dev-tools-raid-bench';
import { resetRaidsDungeons } from './dev-tools-reset-raids';
import {
  errorResponse,
  json,
  notFound,
  parseJsonObject,
  readLimitedText,
  type Routes,
} from './http';
import { DiscordError } from './discord';
import type { LedgerStorage } from './ledger';
import type { Games } from './games';
import type { Raid } from './raid';
import type { Weather } from './weather';
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
  /** The Valley Games, for the `games-*` tools. */
  games: Games;
  /** The valley's weather, for the `set-weather` tool. */
  weather: Weather;
  /** The `COMBAT_V2` flag: the `combat-v2-convert` tool needs it, and new creatures roll their v2 talent. */
  combatV2: boolean;
  /** The valley's base systems are on (`VALLEY_SYSTEMS`): the `valley-fresh` tool needs it. */
  valleySystems: boolean;
  /** The weekly visitor's weeks (the `visitor-arrive` tool); null with the valley systems off. */
  visitor: VisitorWeeks | null;
  /** The School's teacher weeks (the `school-teacher` tool); null with the valley systems off. */
  school: SchoolWeeks | null;
  /** Trials and graduation (the `trials-tick` and `trials-ceremony` tools); null with the valley systems off. */
  trials: ValleyTrials | null;
  /** What the staging bots drive (the `valley-*` simulation tools); null with the valley systems off. */
  world: ValleyWorld | null;
  /** Crypto randomness for what the tools roll. */
  rng: Rng;
  gearRng: Rng;
  quirkRng: Rng;
  talentRng: Rng;
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
  'set-weather': tool(SetWeatherBodySchema, setWeather),
  // The raid test bench (staging with COMBAT_V2 on only: 404 otherwise). Clearing may move the dev clock back, so it re-arms the alarm.
  'raid-clear': tool(NoBodySchema, raidClear, { movesClock: true }),
  'raid-fill': tool(RaidFillBodySchema, raidFill),
  'raid-rank': tool(RaidRankBodySchema, raidRank),
  'raid-play': tool(RaidPlayBodySchema, raidPlay, { movesClock: true }),
  // Creatures per player (staging with COMBAT_V2 on only): kept in dev state, applies to this week and later ones.
  'raid-seats': tool(RaidSeatsBodySchema, raidSeats),
  // The Games' tools re-arm the alarm afterwards (as a clock move does): a new bot, a show that starts in
  // 15 s or a forgotten day changes what the alarm waits for.
  'games-bots': tool(GamesBotsBodySchema, gamesBots, { movesClock: true }),
  'games-run-now': tool(GamesRunNowBodySchema, gamesRunNow, { movesClock: true }),
  'games-reset': tool(NoBodySchema, gamesReset, { movesClock: true }),
  'analytics-rollup': {
    schema: NoBodySchema,
    runAsync: async (tools) => {
      const rollup = tools.rollupNow;
      if (rollup === undefined) throw new DevError(501, 'not_implemented');
      return await rollup();
    },
  },
  // Staging with COMBAT_V2 on only (it answers 404 otherwise): every creature rolls its v2 talent, Knacks and finale choices go.
  'combat-v2-convert': tool(NoBodySchema, combatV2Convert),
  // Wipes every raid and dungeon table of the guild (creatures, gear, balances and the clock stay); the alarm is re-armed.
  'reset-raids-dungeons': tool(ResetRaidsDungeonsBodySchema, resetRaidsDungeons, {
    movesClock: true,
  }),
  // Staging with the valley systems on only (404 otherwise): wipes every player's progress in the guild for a day-0 valley; re-arms the alarm (the dev clock goes back to real time).
  'valley-fresh': tool(NoBodySchema, valleyFresh, { movesClock: true }),
  // The simulated month (staging with the valley systems on only; 404 otherwise): the bots, one game day of them (the dev clock moves), the lab-shaped report.
  'valley-bots': tool(NoBodySchema, valleyBotsTool, { movesClock: true }),
  'valley-sim-day': tool(ValleySimDayBodySchema, valleySimDayTool, { movesClock: true }),
  'valley-report': tool(NoBodySchema, valleyReportTool),
  // Staging with the valley systems on only (404 otherwise): brings the weekly visitor now for the current week, whatever the weekday.
  'visitor-arrive': tool(NoBodySchema, visitorArrive),
  // Staging with the valley systems on only (404 otherwise): brings the School's teacher now (`arrive`) or announces next week's now (`announce`).
  'school-teacher': tool(SchoolTeacherBodySchema, schoolTeacher),
  // Staging with the valley systems on only (404 otherwise): ticks every box of a creature's next trial; and runs the School's ceremony now.
  'trials-tick': tool(TrialsTickBodySchema, trialsTick),
  'trials-ceremony': tool(NoBodySchema, trialsCeremony),
  // Staging with COMBAT_V2 on only: replaces one player's (or everyone's) creatures and gear bag with a preset (`dev-presets.ts`).
  'apply-roster-preset': tool(ApplyRosterPresetBodySchema, applyRosterPreset),
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
      games: d.games,
      weather: d.weather,
      combatV2: d.combatV2,
      valleySystems: d.valleySystems,
      visitor: d.visitor,
      school: d.school,
      trials: d.trials,
      world: d.world,
      rng: d.rng,
      gearRng: d.gearRng,
      quirkRng: d.quirkRng,
      talentRng: d.talentRng,
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
      raidSeats: ctx.state.readRaidSeats(),
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

  /** The guild's players and the roster presets: what the panel's preset picker lists. */
  players(userId: string) {
    return playersView(this.ctx(userId));
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
  core: DevAccessCore & { dev: DevTools | null };
}

/** What the manager gate needs from the guild core: the tools and the (cached) Discord permission check. */
export interface DevAccessCore {
  dev: DevTools | null;
  canManageServer(userId: string, options?: { fresh?: boolean }): Promise<boolean>;
}

/**
 * The manager gate (2026-11-06, on top of the `DEV_TOOLS` var): the dev tools are for the people who can
 * manage the Discord server (the owner, Administrator or Manage Server) and nobody else, so testers never
 * see them. It reuses `canManageServer` (the 60 s per-player cache of the raid channel check), so a player
 * costs three Discord reads a minute at most, and only on staging. Fails closed: when Discord cannot
 * answer, or anything else goes wrong, the answer is "no". No user id is written anywhere.
 */
export async function mayUseDevTools(core: DevAccessCore, userId: string): Promise<boolean> {
  if (core.dev === null) return false;
  try {
    return await core.canManageServer(userId);
  } catch (err) {
    // Only the error kind is logged.
    console.error(
      'dev tools permission check failed',
      err instanceof DiscordError ? err.kind : 'error',
    );
    return false;
  }
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
    GET: async (_request, { user, params, core }) => {
      const dev = core.dev;
      const toolId = params['tool'];
      if (dev === null || toolId === undefined || !READ_IDS.has(toolId)) return notFound();
      if (!(await mayUseDevTools(core, user.id))) return notFound();
      if (toolId === 'players') return json(dev.players(user.id));
      return json(toolId === 'state' ? dev.state(user.id) : dev.events());
    },
    POST: async (request, { user, params, core }) => {
      const dev = core.dev;
      const toolId = params['tool'];
      if (dev === null || toolId === undefined || !TOOL_IDS.has(toolId)) return notFound();
      if (!(await mayUseDevTools(core, user.id))) return notFound();
      const raw = await readToolBody(request);
      if (raw === undefined) return errorResponse('invalid_body', 400);
      const outcome = await dev.run(toolId, user.id, raw);
      if (!outcome.ok) return errorResponse(outcome.error, outcome.status);
      return json({ ok: true, tool: toolId, result: outcome.value });
    },
  },
};

/**
 * The daily dungeon of a guild (see `docs/design/dungeon-paths.md`, which replaced the three rooms of
 * `daily-dungeon.md`): a solo run with the player's own team of three, once per guild-local day (plus
 * one retry on the first day a player ever played, after a defeat). The day has one map for the whole
 * server; a run walks it step by step.
 *
 * Server-authoritative and atomic. `start` validates the request, loads the team (gear and the day's
 * weather frozen into the stored state), copies the day's map and creates an ACTIVE run. Each `act`
 * (a move, an event answer, a camp choice, heading home) is one transaction: the act is checked
 * against the stored state (never against anything the client says about HP, loot or position), the
 * dice are drawn from live randomness at that moment, and the new state, the step and the response
 * are stored together. A fight is played whole on the server and answered at once; the client shows it
 * at any pace. When the run ends (a boss cleared, a defeat, heading home, or being left open: home at the camp, a defeat elsewhere) one
 * transaction pays everything: the kept pack, the boss chest and the supply (`grantDungeonRun`), the
 * streak bonus, creature experience, the depth and the progress, the summary and the analytics.
 *
 * Idempotency: a retry of `start` with the same key returns the run's current state (a changed body
 * under the same key is a `key_conflict`). A retry of `act` with the same key returns what the first
 * call answered (`dungeon_steps.act_json`); another act under the key is a `key_conflict`. Every payout
 * is also idempotent on its own, per (player, day, attempt): ledger keys
 * `dungeon:<day>:<attempt>:bait|essence` (streak: `dungeon:<day>:streak:bait|essence`) and gear grants
 * `dungeon:<day>:<attempt>` and `dungeon:<day>:streak`.
 *
 * The day is the guild-local game day, which starts at the daily reset (13:37, `RULES.daily.reset`):
 * the timezone is resolved once per request and passed down.
 * No seed is ever sent. A fight's seed comes from the crypto RNG at the moment the player steps into
 * the room and is stored in `dungeon_steps` only. The map shown before a run comes from the day's seed
 * (`dungeon_days`), which decides what is where and never a fight's dice.
 */
import {
  RULES,
  addParts,
  createSeededRng,
  dungeonExperience,
  emptyPack,
  generateDungeonMap,
  dungeonMapValid,
  isLandmark,
  keptOnDefeat,
  landmarkBossId,
  mapView,
  nodeFoe,
  rollDungeonLoot,
  roomModifier,
  streakBonus,
  treatCost,
  undercroftOpen,
  weatherBossAttacks,
  weatherLuck,
  xpWeather,
  type DungeonMap,
  type DungeonMapView,
  type Element,
  type GearRarity,
  type PartsBundle,
  type Rng,
  type Role,
} from '@creatures/game';
import {
  buildNames,
  buildRoomInput,
  dungeonBossEnrage,
  liveFightRules,
  type DungeonRoomResult,
  type DungeonRunInput,
  type EventNames,
  type FightEvent,
  type FightSlot,
} from '@creatures/engine';
import * as v from 'valibot';
import type { Analytics } from './analytics';
import { devKey, type DevFlags } from './dev-state';
import { awardExperience, type ExperienceView } from './creature-exp';
import { keyTaken, settleSpend } from './keyed-action';
import { GameError, atomically, type Outcome } from './outcome';
import {
  grantDungeonChest,
  grantDungeonRun,
  grantDungeonStreak,
  type GrantDeps,
} from './gear-grants';
import { spend, type LedgerStorage } from './ledger';
import { drawSeed } from './raid-resolve';
import { loadCreatures, type TeamCreature } from './raid-teams';
import {
  DraftTeamSchema,
  LastTeamSchema,
  type ActBody,
  type RunBody,
  type StartBody,
} from './dungeon-schemas';
import {
  SUPPLIES_PER_RUN,
  applyCamp,
  applyDescend,
  applyEvent,
  applyHome,
  applyMove,
  homeOutcome,
  slotOf,
  type ActOutcome,
  type PathEnv,
  type PlayedFight,
} from './dungeon-path';
import {
  PLAYER,
  abilityChoices,
  currentHp,
  keepsakeViews,
  maxHpOfRow,
  parseState,
  runNode,
  runView,
  type RunMeta,
  type RunState,
} from './dungeon-state';
import type {
  DungeonKeepsakeView,
  DungeonOutcome,
  DungeonPack,
  DungeonRunState,
  DungeonStepLog,
} from './dungeon-types';
import { addDays, gameDay, gameDayEnd } from './time';
import type { Weather } from './weather';

export type {
  DungeonKeepsakeView,
  DungeonOutcome,
  DungeonPack,
  DungeonRunState,
  DungeonStepLog,
} from './dungeon-types';

/** Runs (their events and inputs) are kept this long; the summary and rewards stay. */
export const RUN_RETENTION_MS = 90 * 86_400_000;
export interface DungeonDeps {
  storage: LedgerStorage;
  now: () => number;
  /** Live randomness for the day's seed and every die of a run (fight seeds, events, camp offers). Crypto in production. */
  rng: Rng;
  /** Live randomness for the gear and shard rolls. Crypto in production. */
  gearRng: Rng;
  /** The guild's timezone (an IANA name). Read once per request and passed down. */
  timezone: () => string;
  analytics?: Analytics | undefined;
  /** The dev tools' force flags (staging only): the day's modifiers can be picked. Absent in production. */
  dev?: DevFlags | undefined;
  /** The valley's weather: every run is fought under the day's Boon and Omen. Absent: none. */
  weather?: Weather | undefined;
}

// --- Views ---

export interface DungeonModifierView {
  /** The room (0-based) the modifier belongs to. */
  room: number;
  id: string;
  name: string;
  description: string;
}

/** What a run paid. The streak bonus is listed apart from what the rooms paid. */
export interface DungeonRewards {
  bait: number;
  essence: number;
  /** All the parts the run's grant paid, including those of items that did not fit the bag. */
  parts: PartsBundle;
  gear: { id: string; baseId: string; rarity: GearRarity }[];
  /** Items that did not fit the bag and became parts (already counted in `parts`). */
  converted: { baseId: string; rarity: GearRarity }[];
  /** The supplies the run dropped, one content id each (absent in runs stored before supplies dropped here). */
  supplies?: string[];
  /**
   * The creature experience the run paid each creature that stood in the row (a treat doubles it) and
   * what it did to their levels. Absent in runs stored before training by activity.
   */
  experience?: ExperienceView[];
  /** A fully cleared landmark depth: its gear drop was certain. */
  landmark: boolean;
  streak: { day: number; bait: number; essence: number; parts: PartsBundle } | null;
}

export interface DungeonRoomSummary {
  index: number;
  kind: 'foe' | 'boss';
  /** A fiercer foe (map runs only; absent otherwise). An epic fight is one too. */
  elite?: boolean;
  /** An Undercroft epic fight (also `elite`, so it shows as "Fierce"). */
  epic?: boolean;
  foe: { id: string; name: string; element: Element; hpMax: number };
  modifier: { id: string; name: string; description: string };
  /** False for the rooms after the one that was lost (three-room runs only: a map run lists the fights it played). */
  played: boolean;
  cleared: boolean;
  rounds: number;
  /** The foe's HP when the room ended (0 when it was cleared). */
  foeHpEnd: number;
}

export interface DungeonTeamMember {
  id: string;
  name: string;
  speciesId: string;
  element: Element;
  role: Role;
  level: number;
  hpMax: number;
  /** HP when the run ended; 0 for a creature that was knocked out. */
  hpEnd: number;
}

export interface DungeonRunSummary {
  id: string;
  day: string;
  attempt: number;
  depth: number;
  /** The depth the player is at after this run (one deeper after a clear). */
  newDepth: number;
  /** The room boss was beaten. */
  cleared: boolean;
  /** Fights cleared. */
  roomsCleared: number;
  landmark: boolean;
  /** Days in a row after this run. */
  streak: number;
  createdAt: number;
  /** The row at the end, left to right. */
  team: DungeonTeamMember[];
  /** The fights played (a three-room run: all three rooms, played or not). */
  rooms: DungeonRoomSummary[];
  rewards: DungeonRewards;
  /** The Boon and Omen the run was fought under (absent: none, and in runs stored before the weather). */
  weather?: { boon: string; omen: string | null };
  /**
   * Undercroft levels the run cleared (keepers beaten): 0 for a run that never went down. Absent in
   * summaries stored before the Undercroft.
   */
  deepest?: number;
  /** Map runs only: how it ended (absent while it is open), the node kinds of the path, the pack and the keepsakes. */
  outcome?: DungeonOutcome;
  path?: string[];
  pack?: { found: DungeonPack; kept: DungeonPack };
  keepsakes?: DungeonKeepsakeView[];
  /** Map runs that ended: the run's map at its depth, the rooms visited in order and what each did. Absent in older summaries. */
  route?: {
    map: DungeonMapView;
    path: string[];
    history: DungeonStepLog[];
    /** The Undercroft levels the run went down into, in order (absent when it never did). */
    undercroft?: DungeonMapView[];
  };
}

export interface DungeonToday {
  serverNow: number;
  /** The guild-local calendar day ('YYYY-MM-DD'). */
  day: string;
  timezone: string;
  /** When the game day ends (the next 13:37 local reset), in epoch ms. */
  resetsAt: number;
  /** The depth the next run fights at. */
  depth: number;
  landmark: boolean;
  /**
   * Set when the next run is a landmark (`landmark` is true): the depth and the content id of the
   * room boss it will fight, which is fixed at landmark depths. Null on any other depth.
   */
  landmarkBoss: { depth: number; foeId: string } | null;
  /** Days in a row, as of now: 0 when yesterday was missed and nothing has run today. */
  streak: number;
  /** For old clients: the modifiers of the first two entrance rooms and of the room boss. The new client reads `map`. */
  modifiers: DungeonModifierView[];
  attemptsToday: number;
  attemptsAllowed: number;
  /** False while a run is open (`active`). */
  canRun: boolean;
  /** Why a run is not possible now, or null. */
  blocked: 'already_run' | 'need_creatures' | null;
  /** The newest finished run of today, or null. */
  last: DungeonRunSummary | null;
  /**
   * The creature ids of the player's most recent run on any day, in the order they stood in the
   * row (left to right), or null before their first run. Only the caller's own run is ever read.
   */
  lastTeam: string[] | null;
  /**
   * The row the player saved while setting up (`PUT /api/dungeon/team`), left to right, `teamSize`
   * entries: each a creature id, or null for an empty slot (and for a creature the player no longer
   * owns). Null when there is no draft; an explicitly empty draft is all nulls, not null. A run
   * clears it. Only the caller's own draft is ever read.
   */
  draftTeam: (string | null)[] | null;
  /** Today's map, the same for everyone on the server, with foe HP at this player's depth. */
  map: DungeonMapView;
  /** The player's run that is still open today, or null. */
  active: DungeonRunState | null;
}

/** The light read behind the Activity's notification pip (`Dungeon.attention`). */
export interface DungeonAttention {
  /** Exactly `DungeonToday.canRun`. */
  canRun: boolean;
  /** A run is open today: an open run is a reason to come back, so the pip stays on for it. */
  active: boolean;
  /** When the game day ends: the answer can change then on its own. */
  resetsAt: number;
}

export interface DungeonStartResponse {
  state: DungeonRunState;
  today: DungeonToday;
}

export interface DungeonActResponse {
  state: DungeonRunState;
  /** The fight the move just played: the client plays it at once. */
  room?: DungeonReplayRoom;
  /** Only when the run ended: the summary (with rewards) and the fresh day. */
  summary?: DungeonRunSummary;
  today?: DungeonToday;
}

export interface DungeonReplayRoom {
  index: number;
  kind: 'foe' | 'boss';
  /** A fiercer foe (map runs only; absent otherwise). An epic fight is one too. */
  elite?: boolean;
  /** An Undercroft epic fight (also `elite`, so it shows as "Fierce"). */
  epic?: boolean;
  /** The map node of the fight (map runs only). */
  node?: string;
  /** The run's keepsakes in that fight (map runs only; absent when it held none). */
  keepsakes?: DungeonKeepsakeView[];
  /** The row that fought this room (map runs only: a camp swap or reorder changes it; absent: `DungeonReplayView.row`). */
  row?: ReplayRowEntry[];
  foe: { id: string; name: string; element: Element; hpMax: number };
  modifier: { id: string; name: string; description: string };
  cleared: boolean;
  rounds: number;
  /** Every creature's HP when the room started, and at most, by creature id. */
  hpStart: Record<string, number>;
  hpMax: Record<string, number>;
  events: FightEvent[];
  /** For `describeEvent`. */
  names: EventNames;
}

export interface ReplayRowEntry {
  position: number;
  id: string;
  name: string;
  species: string;
  element: Element;
  role: Role;
  level: number;
}

/** A row of slots as the replay shows it, left to right. */
const rowOf = (
  team: readonly Pick<FightSlot, 'id' | 'name' | 'speciesId' | 'element' | 'role' | 'level'>[],
): ReplayRowEntry[] =>
  team.map((s, position) => ({
    position,
    id: s.id,
    name: s.name,
    species: s.speciesId,
    element: s.element,
    role: s.role,
    level: s.level,
  }));

export interface DungeonReplayView {
  summary: DungeonRunSummary;
  /** The fighting row, left to right (`position` 0 is the left creature). A map run: the starting row (see `DungeonReplayRoom.row`). */
  row: ReplayRowEntry[];
  rooms: DungeonReplayRoom[];
}

// --- Storage ---

type RunRow = {
  id: string;
  user_id: string;
  day: string;
  attempt: number;
  idempotency_key: string;
  fingerprint: string;
  depth: number;
  seed: string;
  cleared: number;
  rooms_cleared: number;
  input_json: string | null;
  result_json: string | null;
  summary_json: string;
  rewards_json: string;
  created_at: number;
  status: 'active' | 'done';
  state_json: string | null;
  outcome: DungeonOutcome | null;
};

type StepRow = {
  run_id: string;
  step: number;
  idempotency_key: string;
  act_json: string;
  node: string | null;
  seed: string | null;
  input_json: string | null;
  result_json: string | null;
};

/** What a fight's step stores in `input_json`: the run's input with the room, and the HP the row came in with. */
interface StoredFight {
  input: DungeonRunInput;
  hpIn: Record<string, number> | null;
}

/** What `act_json` keeps: the act (for telling a retry from another request), the state it left (without the map) and whether it ended the run. */
interface StoredAct {
  act: unknown;
  /** `history` is missing in answers stored before the room log. */
  state: Omit<DungeonRunState, 'map' | 'history'> & { history?: DungeonStepLog[] };
  ended: boolean;
}

type ProgressRow = {
  depth: number;
  streak: number;
  last_day: string | null;
  first_day: string | null;
  runs: number;
  clears: number;
};

const FRESH_PROGRESS: ProgressRow = {
  depth: 1,
  streak: 0,
  last_day: null,
  first_day: null,
  runs: 0,
  clears: 0,
};

/** The text of a request that decides a run, for telling a retry from a different request under one key. */
function fingerprintOf(body: RunBody): string {
  // The treats are part of what was asked, whatever order they came in. A request without any hashes
  // like one before treats existed.
  return JSON.stringify({
    team: body.team,
    ...(body.treats.length === 0 ? {} : { treats: [...body.treats].sort() }),
  });
}

/** The same text for the same act, whatever order a client wrote its keys in. */
function canonicalAct(act: object): string {
  return JSON.stringify(act, Object.keys(act).sort());
}

/**
 * The three modifiers old clients know (`DungeonToday.modifiers`): the first two entrance rooms (left
 * to right) and the room boss. Derived from the map, so there is one source of truth.
 */
export function legacyModifierIds(map: DungeonMap): string[] {
  const entrance = map.nodes
    .filter((n) => n.floor === 0)
    .sort((a, b) => a.lane - b.lane)
    .slice(0, 2);
  const boss = map.nodes.find((n) => n.kind === 'boss');
  return [...entrance, ...(boss === undefined ? [] : [boss])].flatMap((n) =>
    n.modifierId === undefined ? [] : [n.modifierId],
  );
}

const emptyRewards = (): DungeonRewards => ({
  bait: 0,
  essence: 0,
  parts: {},
  gear: [],
  converted: [],
  supplies: [],
  landmark: false,
  streak: null,
});

const totalOf = (pack: DungeonPack): number => pack.bait + pack.essence + pack.scrap;

/** The run waits where heading home is possible: a camp with its choice pending, or the descent card. */
const safePoint = (st: RunState): boolean =>
  st.pending?.kind === 'camp' || st.pending?.kind === 'descend';

export class Dungeon {
  constructor(private readonly deps: DungeonDeps) {}

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  private progress(userId: string): ProgressRow {
    return (
      this.sql
        .exec<ProgressRow>(
          'SELECT depth, streak, last_day, first_day, runs, clears FROM dungeon_progress WHERE user_id = ?',
          userId,
        )
        .toArray()[0] ?? { ...FRESH_PROGRESS }
    );
  }

  /**
   * The ordered creature ids of the player's newest run, read from the summary every run keeps for
   * good (the input is emptied after the retention period, the summary is not), or from the state of
   * a run that is still open (it has no summary yet). No separate table: the run record is the memory.
   * A damaged record gives null, never an error.
   */
  private lastTeam(userId: string): string[] | null {
    const row = this.sql
      .exec<{ status: string; summary_json: string; state_json: string | null }>(
        'SELECT status, summary_json, state_json FROM dungeon_runs WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
        userId,
      )
      .toArray()[0];
    if (row === undefined) return null;
    if (row.status === 'active') {
      const st = parseState(row.state_json);
      return st === null ? null : st.input.team.map((slot) => slot.id);
    }
    try {
      const parsed = v.safeParse(LastTeamSchema, JSON.parse(row.summary_json));
      return parsed.success ? parsed.output : null;
    } catch {
      return null;
    }
  }

  /** The ids of the player's creatures, for dropping draft entries they no longer own. */
  private ownedIds(userId: string): Set<string> {
    return new Set(
      this.sql
        .exec<{ id: string }>('SELECT id FROM creatures WHERE user_id = ?', userId)
        .toArray()
        .map((r) => r.id),
    );
  }

  /**
   * The player's saved draft with the creatures they no longer own (fused away, say) as null, or null
   * when there is no draft. A damaged row gives null, never an error. Only the caller's own row is read.
   */
  private draftTeam(userId: string): (string | null)[] | null {
    const row = this.sql
      .exec<{ team_json: string }>('SELECT team_json FROM dungeon_drafts WHERE user_id = ?', userId)
      .toArray()[0];
    if (row === undefined) return null;
    let stored: (string | null)[];
    try {
      const parsed = v.safeParse(DraftTeamSchema, JSON.parse(row.team_json));
      if (!parsed.success) return null;
      stored = parsed.output;
    } catch {
      return null;
    }
    const owned = this.ownedIds(userId);
    return stored.map((id) => (id !== null && owned.has(id) ? id : null));
  }

  /**
   * Saves the row the player is setting up (already validated: `teamSize` slots, ids all different).
   * Ids the caller does not own become null, with no error: a creature may have been fused away, and
   * nothing is revealed about whose it is. Not a spend, so there is no key; an upsert is idempotent.
   * Answers what was stored.
   */
  saveDraft(userId: string, team: readonly (string | null)[]): (string | null)[] {
    return this.deps.storage.transactionSync(() => {
      const owned = this.ownedIds(userId);
      const stored = team.map((id) => (id !== null && owned.has(id) ? id : null));
      this.sql.exec(
        `INSERT INTO dungeon_drafts (user_id, team_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET team_json = excluded.team_json, updated_at = excluded.updated_at`,
        userId,
        JSON.stringify(stored),
        this.deps.now(),
      );
      return stored;
    });
  }

  private runsOn(userId: string, day: string): RunRow[] {
    return this.sql
      .exec<RunRow>(
        'SELECT * FROM dungeon_runs WHERE user_id = ? AND day = ? ORDER BY attempt',
        userId,
        day,
      )
      .toArray();
  }

  // --- The day's map ---

  /**
   * The day's map: drawn from the day's seed (stream `<seed>:map`) and stored with it on the first
   * look, so everyone on the server sees the same map all day. The seed itself is drawn from live
   * randomness, is never sent out, and decides only what is where, never a fight's dice. A stored map
   * that does not hold up (`dungeonMapValid`, for example after a content change) is drawn again from
   * the same seed; runs that already started keep their own copy.
   *
   * Dev tools only: picked modifiers (`dungeon-modifiers`) are laid over the map when it is read (the
   * first two entrance rooms and the room boss, see `legacyModifierIds`); they are not stored.
   */
  private mapFor(day: string): DungeonMap {
    const stored = this.sql
      .exec<{
        modifier_seed: string;
        map_json: string | null;
      }>('SELECT modifier_seed, map_json FROM dungeon_days WHERE day = ?', day)
      .toArray()[0];
    let seed = stored?.modifier_seed;
    if (seed === undefined) {
      seed = drawSeed(this.deps.rng);
      this.sql.exec(
        'INSERT INTO dungeon_days (day, modifier_seed, created_at) VALUES (?, ?, ?)',
        day,
        seed,
        this.deps.now(),
      );
    }
    let map: DungeonMap | null = null;
    if (stored?.map_json !== undefined && stored.map_json !== null) {
      try {
        const parsed: unknown = JSON.parse(stored.map_json);
        if (dungeonMapValid(parsed)) map = parsed;
      } catch {
        // Fall through: a damaged map is drawn again.
      }
    }
    if (map === null) {
      map = generateDungeonMap(createSeededRng(`${seed}:map`), undefined, { doors: true });
      this.sql.exec('UPDATE dungeon_days SET map_json = ? WHERE day = ?', JSON.stringify(map), day);
    }
    const forced = this.forcedModifiers(day);
    return forced === null ? map : withForcedModifiers(map, forced);
  }

  /**
   * Dev tools only: the modifiers picked for a day, or null. A damaged or outdated pick (an id that is not
   * in the content, or the wrong count) is ignored, so a stored flag can never break a run.
   */
  private forcedModifiers(day: string): string[] | null {
    const raw = this.deps.dev?.get(devKey.modifiers(day)) ?? null;
    if (raw === null) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        Array.isArray(parsed) &&
        parsed.length === RULES.dungeon.rooms &&
        parsed.every((id): id is string => typeof id === 'string' && roomModifier(id) !== undefined)
      ) {
        return parsed;
      }
    } catch {
      // Fall through: a damaged value means the rolled modifiers.
    }
    return null;
  }

  private landmarkBoss(depth: number): DungeonToday['landmarkBoss'] {
    const foeId = landmarkBossId(depth);
    return foeId === null ? null : { depth, foeId };
  }

  private modifierViews(ids: readonly string[]): DungeonModifierView[] {
    return ids.map((id, room) => {
      const m = roomModifier(id);
      if (m === undefined) throw new Error('stored modifier is not in the content');
      return { room, id: m.id, name: m.name, description: m.description };
    });
  }

  /**
   * How many runs a player may make on `day`: one, plus a retry on the first day they ever played if
   * that run was lost (a defeat: a run that went home or cleared is no reason for another, and one
   * that is still open is not over). `allowed` is what the day gives them in total (2 on a first day).
   * An open run counts as the day's run.
   */
  private allowance(
    progress: ProgressRow,
    day: string,
    runs: readonly RunRow[],
  ): { allowed: number; canRun: boolean } {
    const firstDay = progress.first_day === null || progress.first_day === day;
    const only = runs[0];
    const retry =
      firstDay &&
      runs.length === 1 &&
      only?.status === 'done' &&
      only.cleared === 0 &&
      only.outcome !== 'home';
    // A timezone moved west can make `day` earlier than a day the player already ran on. That day
    // is spent, so the earlier-looking one must not give a second run.
    const behind = progress.last_day !== null && progress.last_day > day;
    return { allowed: firstDay ? 2 : 1, canRun: !behind && (runs.length === 0 || retry) };
  }

  // --- Reads ---

  /**
   * Today's state: the map, the player's depth and streak, the newest finished run and the open run if
   * there is one. A run left open on an earlier day is closed first (see `closeOpenRuns`).
   */
  today(userId: string): DungeonToday {
    const tz = this.deps.timezone();
    const now = this.deps.now();
    const day = gameDay(now, tz, RULES.daily.reset);
    return this.deps.storage.transactionSync(() => {
      this.closeOpenRuns(userId, day);
      return this.todayView(userId, day, tz, now);
    });
  }

  /**
   * The one place that decides whether a player can run now: the allowance of the day, then the
   * creature count. `today` and `attention` both read it, so they can never disagree.
   */
  private availability(
    userId: string,
    day: string,
  ): {
    progress: ProgressRow;
    runs: RunRow[];
    allowed: number;
    ruleAllows: boolean;
    needCreatures: boolean;
    canRun: boolean;
  } {
    const progress = this.progress(userId);
    const runs = this.runsOn(userId, day);
    const { allowed, canRun: ruleAllows } = this.allowance(progress, day, runs);
    const creatures = this.sql
      .exec<{ n: number }>('SELECT COUNT(*) AS n FROM creatures WHERE user_id = ?', userId)
      .one().n;
    const needCreatures = creatures < RULES.dungeon.teamSize;
    return {
      progress,
      runs,
      allowed,
      ruleAllows,
      needCreatures,
      canRun: ruleAllows && !needCreatures,
    };
  }

  /**
   * Whether the player can start a run now, whether one is open, and when that could change on its
   * own. Like `today` without the map (no day seed is drawn or stored) and without parsing any summary.
   */
  attention(userId: string): DungeonAttention {
    const tz = this.deps.timezone();
    const day = gameDay(this.deps.now(), tz, RULES.daily.reset);
    return this.deps.storage.transactionSync(() => {
      const { canRun, runs } = this.availability(userId, day);
      return {
        canRun,
        active: runs.some((r) => r.status === 'active'),
        resetsAt: gameDayEnd(day, tz, RULES.daily.reset),
      };
    });
  }

  private metaOf(row: RunRow): RunMeta {
    return {
      id: row.id,
      day: row.day,
      attempt: row.attempt,
      depth: row.depth,
      status: row.status,
      outcome: row.outcome,
    };
  }

  /** The client's view of an open or finished map run, or null for a run with no stored state. */
  private stateOf(row: RunRow): DungeonRunState | null {
    const st = parseState(row.state_json);
    return st === null ? null : runView(this.metaOf(row), st);
  }

  private todayView(userId: string, day: string, tz: string, now: number): DungeonToday {
    const { progress, runs, allowed, ruleAllows, needCreatures, canRun } = this.availability(
      userId,
      day,
    );
    const last = runs.filter((r) => r.status === 'done').at(-1);
    const open = runs.find((r) => r.status === 'active');
    const map = this.mapFor(day);
    // While a run is open, the depth shown is the run's own: a boss cleared at depth 8 or more has locked
    // depth + 1 into the progress already, but the run (its map, its landmark boss) is still at depth d.
    const depth = open?.depth ?? progress.depth;
    // A last day later than `day` (timezone moved west) keeps the streak, it does not break it.
    const alive =
      progress.last_day !== null &&
      (progress.last_day >= day || progress.last_day === addDays(day, -1));
    return {
      serverNow: now,
      day,
      timezone: tz,
      resetsAt: gameDayEnd(day, tz, RULES.daily.reset),
      depth,
      landmark: isLandmark(depth),
      landmarkBoss: this.landmarkBoss(depth),
      streak: alive ? progress.streak : 0,
      modifiers: this.modifierViews(legacyModifierIds(map)),
      attemptsToday: runs.length,
      attemptsAllowed: allowed,
      canRun,
      blocked: !ruleAllows ? 'already_run' : needCreatures ? 'need_creatures' : null,
      last: last === undefined ? null : (JSON.parse(last.summary_json) as DungeonRunSummary),
      lastTeam: this.lastTeam(userId),
      draftTeam: this.draftTeam(userId),
      map: mapView(map, depth),
      active: open === undefined ? null : this.stateOf(open),
    };
  }

  // --- Replays ---

  private playerName(userId: string): string {
    return (
      this.sql
        .exec<{ display_name: string }>(
          'SELECT display_name FROM players WHERE user_id = ?',
          userId,
        )
        .toArray()[0]?.display_name ?? 'You'
    );
  }

  /**
   * One fight in the replay shape. `buildRoomInput` of the stored input and the HP the row came in with
   * gives the foe's HP after its modifier and the names, exactly as the fight was built. The foe keeps
   * its plain name (the client adds "Fierce" for an elite). A map run's room carries the row that
   * fought it (`row`: the row changes at the camp).
   */
  private replayRoom(
    name: string,
    node: string | null,
    stored: StoredFight,
    result: DungeonRoomResult,
  ): DungeonReplayRoom {
    const { input, hpIn } = stored;
    const spec = input.rooms[0];
    if (spec === undefined) throw new Error('a stored fight has no room');
    const elite = spec.elite === true;
    const fight = buildRoomInput(input, spec, hpIn);
    const names = buildNames(fight, { [PLAYER]: name });
    return {
      index: result.index,
      kind: spec.foe.kind,
      ...(elite ? { elite: true } : {}),
      ...(spec.epic === true ? { epic: true } : {}),
      ...(node === null ? {} : { node, row: rowOf(input.team) }),
      ...(spec.keepsakes === undefined || spec.keepsakes.length === 0
        ? {}
        : { keepsakes: keepsakeViews(spec.keepsakes.map((k) => k.id)) }),
      foe: {
        id: spec.foe.id,
        name: spec.foe.name,
        element: spec.foe.element,
        hpMax: fight.bossHpPool.max,
      },
      modifier: {
        id: spec.modifier.id,
        name: spec.modifier.name,
        description: spec.modifier.description,
      },
      cleared: result.cleared,
      rounds: result.result.rounds,
      hpStart: result.hpStart,
      hpMax: result.hpMax,
      events: result.result.events,
      names,
    };
  }

  private fightRows(runId: string): StepRow[] {
    return this.sql
      .exec<StepRow>(
        'SELECT * FROM dungeon_steps WHERE run_id = ? AND node IS NOT NULL ORDER BY step',
        runId,
      )
      .toArray();
  }

  /**
   * The full replay of one of the caller's runs, or null (unknown, someone else's, or past retention).
   * A map run replays every fight played so far, in order, and works while the run is open; an old
   * three-room run replays as it was stored.
   */
  replay(userId: string, runId: string): DungeonReplayView | null {
    const tz = this.deps.timezone();
    const now = this.deps.now();
    const day = gameDay(now, tz, RULES.daily.reset);
    return this.deps.storage.transactionSync(() => {
      this.closeOpenRuns(userId, day);
      const row = this.sql
        .exec<RunRow>('SELECT * FROM dungeon_runs WHERE id = ? AND user_id = ?', runId, userId)
        .toArray()[0];
      // The same answer for "does not exist" and "belongs to someone else".
      if (row === undefined) return null;
      const name = this.playerName(userId);
      if (row.state_json !== null) return this.pathReplay(row, name);
      if (row.input_json === null || row.result_json === null) return null;
      const input = JSON.parse(row.input_json) as DungeonRunInput;
      const result = JSON.parse(row.result_json) as { rooms: DungeonRoomResult[] };
      const rooms = result.rooms.map((r) => {
        const spec = input.rooms[r.index];
        if (spec === undefined) throw new Error('a stored run has no such room');
        return this.replayRoom(
          name,
          null,
          { input: { ...input, rooms: [spec] }, hpIn: r.index === 0 ? null : r.hpStart },
          r,
        );
      });
      return {
        summary: JSON.parse(row.summary_json) as DungeonRunSummary,
        row: rowOf(input.team),
        rooms,
      };
    });
  }

  private pathReplay(row: RunRow, name: string): DungeonReplayView | null {
    const st = parseState(row.state_json);
    if (st === null) return null;
    const steps = this.fightRows(row.id);
    const rooms: DungeonReplayRoom[] = [];
    for (const step of steps) {
      if (step.input_json === null || step.result_json === null) continue;
      rooms.push(
        this.replayRoom(
          name,
          step.node,
          JSON.parse(step.input_json) as StoredFight,
          JSON.parse(step.result_json) as DungeonRoomResult,
        ),
      );
    }
    // Past the retention period the events are gone: the same answer as for a run that is not there.
    if (steps.length > 0 && rooms.length === 0) return null;
    const summary =
      row.status === 'done'
        ? (JSON.parse(row.summary_json) as DungeonRunSummary)
        : this.summarise({
            row,
            st,
            outcome: null,
            newDepth: row.depth,
            streak: this.progress(row.user_id).streak,
            rewards: emptyRewards(),
            found: st.pack,
            kept: st.pack,
          });
    return {
      summary,
      row: rowOf(st.start),
      rooms,
    };
  }

  // --- Start ---

  /** Validates a start, loads the team and opens the run, in one transaction. See the file comment. */
  start(userId: string, body: StartBody): Outcome<DungeonStartResponse> {
    const tz = this.deps.timezone();
    const now = this.deps.now();
    const day = gameDay(now, tz, RULES.daily.reset);
    return atomically(this.deps.storage, () => this.startIn(userId, body, day, tz, now));
  }

  private startIn(
    userId: string,
    body: StartBody,
    day: string,
    tz: string,
    now: number,
  ): DungeonStartResponse {
    // A run left open on an earlier day is closed first, so it never blocks today's.
    this.closeOpenRuns(userId, day);
    // --- A retry of a start that was stored returns the run as it stands now, and changes nothing ---
    const fingerprint = fingerprintOf(body);
    const prior = this.sql
      .exec<RunRow>(
        'SELECT * FROM dungeon_runs WHERE user_id = ? AND idempotency_key = ?',
        userId,
        body.idempotencyKey,
      )
      .toArray()[0];
    if (prior !== undefined) {
      const state = this.stateOf(prior);
      // A key of one of the old three-room runs (no stored state) is another kind of request.
      if (prior.fingerprint !== fingerprint || state === null) {
        throw new GameError(409, 'key_conflict');
      }
      return { state, today: this.todayView(userId, day, tz, now) };
    }
    // The same key used by another kind of action is a conflict too, whatever it was.
    if (keyTaken(this.sql, userId, body.idempotencyKey, ['ledger', 'gear_actions'])) {
      throw new GameError(409, 'key_conflict');
    }

    // --- One run a day (an open run is it), and the retry of a first day ---
    const progress = this.progress(userId);
    const runs = this.runsOn(userId, day);
    if (runs.some((r) => r.status === 'active')) throw new GameError(409, 'run_active');
    // A run of an earlier day that could not be closed (see `closeOpenRuns`) still has to be: until
    // then it could overwrite the progress of this one when it finally closes.
    const older = this.sql
      .exec(
        "SELECT 1 FROM dungeon_runs WHERE user_id = ? AND status = 'active' AND day < ?",
        userId,
        day,
      )
      .toArray();
    if (older.length > 0) throw new GameError(409, 'run_active');
    if (!this.allowance(progress, day, runs).canRun) throw new GameError(409, 'already_run');
    const attempt = runs.length + 1;

    // --- The team: the caller's own creatures, all different, in the order they stand in the row ---
    if (new Set(body.team).size !== body.team.length) {
      throw new GameError(400, 'duplicate_creature');
    }
    const owned = new Map(loadCreatures(this.sql, userId).map((c) => [c.id, c]));
    const team = body.team.map((id) => owned.get(id));
    // The same answer for "does not exist" and "belongs to someone else".
    if (!team.every((c): c is TeamCreature => c !== undefined)) {
      throw new GameError(404, 'not_found');
    }
    // The treats: each names a creature of the team, once. They are paid below, with the run.
    if (new Set(body.treats).size !== body.treats.length) throw new GameError(400, 'invalid_treat');
    if (!body.treats.every((id) => body.team.includes(id))) {
      throw new GameError(400, 'invalid_treat');
    }
    // `team[i]` is position i, left to right: the row is the order of the request.
    const standing = team;
    // The day's weather is fixed now and goes into the stored state: the sheet of every creature, the
    // luck and the foes' attacks. A replay never reads the weather.
    const wday = this.deps.weather?.at(now) ?? null;
    const row: FightSlot[] = standing.map((c) => slotOf(c, wday));

    // --- The treats cost Bait, paid when the run starts and with it: short Bait takes nothing ---
    const id = crypto.randomUUID();
    const treated = new Set(body.treats);
    const treatBait = standing.reduce(
      (n, c) => n + (treated.has(c.id) ? treatCost(c.level) : 0),
      0,
    );
    if (treatBait > 0) {
      settleSpend(
        spend(
          this.deps.storage,
          {
            userId,
            currency: 'bait',
            amount: treatBait,
            purpose: 'treat',
            idempotencyKey: `treat:dungeon:${id}`,
            apply: () => ({ runId: id }),
          },
          now,
        ),
      );
      for (const c of standing) {
        if (!treated.has(c.id)) continue;
        this.deps.analytics?.record(
          {
            kind: 'treat',
            source: 'dungeon',
            species: c.species.id,
            level: c.level,
            cost: treatCost(c.level),
          },
          userId,
        );
      }
    }

    // --- The run: the day's map copied in, and the base fight input frozen ---
    const depth = progress.depth;
    const map = this.mapFor(day);
    const enrage = dungeonBossEnrage();
    // Between-fight rest (a Scarf line): the share of max HP a standing creature recovers before each fight.
    const rest: Record<string, number> = {};
    for (const c of standing) if (c.gearRules.restBp > 0) rest[c.id] = c.gearRules.restBp;
    const input: DungeonRunInput = {
      team: row,
      player: PLAYER,
      rooms: [],
      abilities: abilityChoices(row),
      luck: { ...weatherLuck(wday, RULES.combat.luck) },
      ...(Object.keys(rest).length === 0 ? {} : { rest }),
      ...(weatherBossAttacks(wday, 1) > 1 ? { bossAttacks: weatherBossAttacks(wday, 1) } : {}),
      // The combat rules, the boss room's enrage and the depth (a landmark gives the room boss its
      // signature), stored with the input so a replay is exact.
      rules: liveFightRules(),
      depth,
      ...(enrage === undefined ? {} : { enrage }),
    };
    const worn = this.sql
      .exec<{ n: number }>(
        `SELECT COUNT(*) AS n FROM gear_items WHERE user_id = ? AND equipped_on IN (${row
          .map(() => '?')
          .join(', ')})`,
        userId,
        ...row.map((s) => s.id),
      )
      .one().n;
    const st: RunState = {
      v: 1,
      map,
      input,
      weather: wday,
      everyone: row.map((s) => s.id),
      treats: row.filter((s) => treated.has(s.id)).map((s) => s.id),
      gearWorn: worn,
      gear: standing.flatMap((c) => c.gearIds),
      start: row.map(({ id, name, speciesId, element, role, level }) => ({
        id,
        name,
        speciesId,
        element,
        role,
        level,
      })),
      step: 0,
      at: null,
      path: [],
      pending: null,
      hp: null,
      hpMax: maxHpOfRow(input, []),
      keepsakes: [],
      pack: emptyPack(),
      roomsCleared: 0,
      fights: 0,
      tally: {},
      supply: false,
      lastEvent: null,
      campChoice: null,
      elites: 0,
      history: [],
      level: 0,
      under: [],
      marks: [],
      bossCleared: false,
      deepest: 0,
      banked: null,
    };
    // A map run has no run-level seed (every fight draws its own when the player steps in, stored in
    // `dungeon_steps`): the NOT NULL column holds an empty string.
    this.sql.exec(
      `INSERT INTO dungeon_runs (id, user_id, day, attempt, idempotency_key, fingerprint, depth, seed,
         cleared, rooms_cleared, input_json, result_json, summary_json, rewards_json, created_at,
         status, state_json, outcome)
       VALUES (?, ?, ?, ?, ?, ?, ?, '', 0, 0, NULL, NULL, '{}', '{}', ?, 'active', ?, NULL)`,
      id,
      userId,
      day,
      attempt,
      body.idempotencyKey,
      fingerprint,
      depth,
      now,
      JSON.stringify(st),
    );
    // The row that was just chosen is now `lastTeam`; the draft it came from is spent.
    this.sql.exec('DELETE FROM dungeon_drafts WHERE user_id = ?', userId);
    const state = runView({ id, day, attempt, depth, status: 'active', outcome: null }, st);
    return { state, today: this.todayView(userId, day, tz, now) };
  }

  // --- Acts ---

  /** One act of an open run, in one transaction. See the file comment. */
  act(userId: string, body: ActBody): Outcome<DungeonActResponse> {
    const tz = this.deps.timezone();
    const now = this.deps.now();
    const day = gameDay(now, tz, RULES.daily.reset);
    return atomically(this.deps.storage, () => this.actIn(userId, body, day, tz, now));
  }

  private actIn(
    userId: string,
    body: ActBody,
    day: string,
    tz: string,
    now: number,
  ): DungeonActResponse {
    this.closeOpenRuns(userId, day);
    const row = this.sql
      .exec<RunRow>('SELECT * FROM dungeon_runs WHERE id = ? AND user_id = ?', body.runId, userId)
      .toArray()[0];
    // The same answer for "does not exist" and "belongs to someone else".
    if (row === undefined) throw new GameError(404, 'not_found');

    // --- A retry of an act that was stored answers what it answered, and changes nothing ---
    const stored = this.sql
      .exec<StepRow>(
        'SELECT * FROM dungeon_steps WHERE run_id = ? AND idempotency_key = ?',
        row.id,
        body.idempotencyKey,
      )
      .toArray()[0];
    if (stored !== undefined) {
      const first = JSON.parse(stored.act_json) as StoredAct;
      // The stored answer was pruned (past retention): the run has long moved on.
      if (first.act === undefined) throw new GameError(409, 'stale_step');
      if (
        stored.step !== body.step ||
        canonicalAct(first.act as object) !== canonicalAct(body.act)
      ) {
        throw new GameError(409, 'key_conflict');
      }
      return this.storedAnswer(userId, row, stored, first, day, tz, now);
    }
    // The key is the player's: another kind of action may not reuse it (the start of a run included).
    if (
      keyTaken(this.sql, userId, body.idempotencyKey, ['ledger', 'gear_actions']) ||
      this.sql
        .exec(
          'SELECT 1 FROM dungeon_runs WHERE user_id = ? AND idempotency_key = ?',
          userId,
          body.idempotencyKey,
        )
        .toArray().length > 0
    ) {
      throw new GameError(409, 'key_conflict');
    }

    // A run that is over (it ended, perhaps from another tab) has moved on: the client reloads `today`.
    const st = parseState(row.state_json);
    if (row.status !== 'active' || st === null) throw new GameError(409, 'stale_step');
    if (body.step !== st.step) throw new GameError(409, 'stale_step');

    // --- The act, on a private copy of the state: a refusal leaves nothing behind ---
    const work = structuredClone(st);
    const env: PathEnv = {
      sql: this.sql,
      userId,
      rng: this.deps.rng,
      analytics: this.deps.analytics,
      bank: (tag, draw) =>
        grantDungeonChest(this.gearDeps(), userId, row.day, row.attempt, tag, draw),
      lockDepth: (depth) => this.lockDepth(userId, depth),
    };
    const act = body.act;
    let outcome: ActOutcome;
    switch (act.type) {
      case 'move':
        outcome = applyMove(env, work, act.node, row.depth);
        break;
      case 'event':
        outcome = applyEvent(env, work, act.option);
        break;
      case 'camp':
        outcome = applyCamp(env, work, act);
        break;
      case 'home':
        outcome = applyHome(work);
        break;
      case 'descend':
        outcome = applyDescend(env, work, row.depth);
        break;
    }
    work.step = st.step + 1;

    // --- Store the step and the state first (the summary of an ended run reads the steps) ---
    const fight = outcome.fight;
    this.sql.exec(
      `INSERT INTO dungeon_steps (run_id, step, idempotency_key, act_json, node, seed, input_json, result_json, created_at)
       VALUES (?, ?, ?, '{}', ?, ?, ?, ?, ?)`,
      row.id,
      st.step,
      body.idempotencyKey,
      fight?.node ?? null,
      fight?.seed ?? null,
      fight === undefined
        ? null
        : JSON.stringify({ input: fight.input, hpIn: fight.hpIn } satisfies StoredFight),
      fight === undefined ? null : JSON.stringify(fight.result),
      now,
    );
    this.sql.exec(
      'UPDATE dungeon_runs SET state_json = ? WHERE id = ?',
      JSON.stringify(work),
      row.id,
    );

    // --- An ended run is paid in this same transaction ---
    let summary: DungeonRunSummary | undefined;
    if (outcome.end !== undefined) {
      summary = this.finish(userId, row, work, outcome.end).summary;
    }
    const state = runView(
      {
        ...this.metaOf(row),
        status: outcome.end === undefined ? 'active' : 'done',
        outcome: outcome.end ?? null,
      },
      work,
    );
    // The map never changes inside a run and is read again from the run's state, so the stored answer leaves it out.
    const lite: Partial<DungeonRunState> = { ...state };
    delete lite.map;
    this.sql.exec(
      'UPDATE dungeon_steps SET act_json = ? WHERE run_id = ? AND step = ?',
      JSON.stringify({
        act,
        state: lite as StoredAct['state'],
        ended: outcome.end !== undefined,
      } satisfies StoredAct),
      row.id,
      st.step,
    );
    return {
      state,
      ...(fight === undefined ? {} : { room: this.playedRoom(userId, fight) }),
      ...(summary === undefined ? {} : { summary, today: this.todayView(userId, day, tz, now) }),
    };
  }

  private playedRoom(userId: string, fight: PlayedFight): DungeonReplayRoom {
    return this.replayRoom(
      this.playerName(userId),
      fight.node,
      { input: fight.input, hpIn: fight.hpIn },
      fight.result,
    );
  }

  /** What a stored act answered, rebuilt: the state it left, the fight it played and, if it ended the run, the summary and today. */
  private storedAnswer(
    userId: string,
    row: RunRow,
    step: StepRow,
    first: StoredAct,
    day: string,
    tz: string,
    now: number,
  ): DungeonActResponse {
    const st = parseState(row.state_json);
    if (st === null) throw new Error('a run with stored steps has no state');
    // An answer stored before the room log has no history.
    const state: DungeonRunState = {
      ...first.state,
      history: first.state.history ?? [],
      map: mapView(st.map, row.depth),
    };
    const room =
      step.node !== null && step.input_json !== null && step.result_json !== null
        ? this.replayRoom(
            this.playerName(userId),
            step.node,
            JSON.parse(step.input_json) as StoredFight,
            JSON.parse(step.result_json) as DungeonRoomResult,
          )
        : undefined;
    return {
      state,
      ...(room === undefined ? {} : { room }),
      ...(first.ended
        ? {
            summary: JSON.parse(row.summary_json) as DungeonRunSummary,
            today: this.todayView(userId, day, tz, now),
          }
        : {}),
    };
  }

  // --- Ending a run ---

  /**
   * Runs left open on an earlier game day are closed, for one player: with the pack coming home whole
   * only when the run waits at a safe point, where the player could have pressed Head home (a camp with
   * its choice pending, or the descent card), as `home` before the main boss was beaten and as `cleared`
   * after it; as a `defeat` (half the pack, rounded up) anywhere else. Depth won by the main boss is kept
   * either way (it was locked in when the boss fell).
   * Otherwise quitting the app would be a free safe exit at every step and the camp's push-on choice
   * would mean nothing. The experience and the supply earned so far are paid either way, as for any
   * end. Idempotent: a closed run is no longer open. Call inside a transaction.
   */
  private closeOpenRuns(userId: string, day: string): void {
    const open = this.sql
      .exec<RunRow>(
        "SELECT * FROM dungeon_runs WHERE user_id = ? AND status = 'active' AND day < ? ORDER BY day, attempt",
        userId,
        day,
      )
      .toArray();
    for (const row of open) {
      const st = parseState(row.state_json);
      if (st === null) continue;
      try {
        // Its own savepoint: a run that cannot be closed leaves nothing half paid, and never stops the
        // player from looking at today or starting a run (it is of an earlier day).
        this.deps.storage.transactionSync(() =>
          this.finish(userId, row, st, safePoint(st) ? homeOutcome(st) : 'defeat'),
        );
      } catch (err) {
        // Only the error's name: a message could carry data. The next look tries again.
        console.error('dungeon close failed', err instanceof Error ? err.name : 'unknown');
      }
    }
  }

  /**
   * The guild alarm's sweep: closes every run left open on an earlier game day (see `closeOpenRuns`),
   * a player at a time, each in its own transaction so one that fails does not stop the rest.
   */
  closeStale(): void {
    const tz = this.deps.timezone();
    const now = this.deps.now();
    const day = gameDay(now, tz, RULES.daily.reset);
    const users = this.sql
      .exec<{ user_id: string }>(
        "SELECT DISTINCT user_id FROM dungeon_runs WHERE status = 'active' AND day < ?",
        day,
      )
      .toArray();
    for (const { user_id: userId } of users) {
      try {
        this.deps.storage.transactionSync(() => this.closeOpenRuns(userId, day));
      } catch (err) {
        // Only the error's name: a message could carry data. The next alarm tries again.
        console.error('dungeon close failed', err instanceof Error ? err.name : 'unknown');
      }
    }
  }

  /**
   * Ends a run, paying everything in the caller's transaction: the progress (depth only after a clear),
   * the kept pack with the boss chest and the supply, the streak bonus of the day's first finished run,
   * creature experience, the summary and rewards, and the analytics. Idempotent per (player, day,
   * attempt) through the ledger and grant keys.
   */
  private finish(
    userId: string,
    row: RunRow,
    st: RunState,
    outcome: DungeonOutcome,
  ): { summary: DungeonRunSummary; rewards: DungeonRewards } {
    // The main boss was beaten: the run is cleared even when the Undercroft below it was lost.
    const cleared = outcome === 'cleared' || st.bossCleared;
    const { day, depth } = row;

    // --- Progress: counted when the run ends. A run that went home or was lost counts for the streak too. ---
    const progress = this.progress(userId);
    // Progress only moves forward. A run that closes late (an earlier day's, after a later day's run
    // finished) must not roll the depth, the streak or the last day back: it leaves them alone.
    const forward = progress.last_day === null || day > progress.last_day;
    const newStreak =
      progress.last_day === day || !forward
        ? progress.streak
        : progress.last_day === addDays(day, -1)
          ? progress.streak + 1
          : 1;
    const newDepth = Math.max(progress.depth, cleared ? depth + 1 : depth);
    this.sql.exec(
      `INSERT INTO dungeon_progress (user_id, depth, streak, last_day, first_day, runs, clears)
       VALUES (?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         depth = MAX(depth, excluded.depth),
         streak = CASE WHEN last_day IS NULL OR excluded.last_day > last_day THEN excluded.streak ELSE streak END,
         last_day = CASE WHEN last_day IS NULL OR excluded.last_day > last_day THEN excluded.last_day ELSE last_day END,
         first_day = COALESCE(first_day, excluded.first_day),
         runs = runs + 1, clears = clears + excluded.clears`,
      userId,
      newDepth,
      newStreak,
      day,
      progress.first_day ?? day,
      cleared ? 1 : 0,
    );

    // --- Pay: the kept pack, the chest and the supply, and the streak bonus on the first run of a day ---
    const found = { ...st.pack };
    const kept = outcome === 'defeat' ? keptOnDefeat(found) : { ...found };
    const rewards = this.pay(userId, row, st, outcome, kept, newStreak, progress.last_day !== day);

    // --- Creature experience, from the fights each creature stood in the row for (a treat doubles it) ---
    const inRow = new Set(st.input.team.map((slot) => slot.id));
    const experience: ExperienceView[] = [];
    for (const id of st.everyone) {
      const treat = st.treats.includes(id);
      const gained = dungeonExperience(
        st.tally[id] ?? 0,
        // The full-clear bonus is for the row that beat the boss (a state stored before the Undercroft: the row at the end).
        st.fullClear !== undefined ? st.fullClear.includes(id) : cleared && inRow.has(id),
        treat,
        xpWeather(st.weather),
      );
      const view = awardExperience(
        this.sql,
        this.deps.analytics,
        userId,
        id,
        gained,
        'dungeon',
        treat,
      );
      if (view !== null) experience.push(view);
    }
    rewards.experience = experience;

    // --- Store ---
    const summary = this.summarise({
      row,
      st,
      outcome,
      newDepth,
      streak: newStreak,
      rewards,
      found,
      kept,
    });
    this.sql.exec(
      `UPDATE dungeon_runs SET status = 'done', outcome = ?, cleared = ?, rooms_cleared = ?,
         summary_json = ?, rewards_json = ? WHERE id = ?`,
      outcome,
      cleared ? 1 : 0,
      st.roomsCleared,
      JSON.stringify(summary),
      JSON.stringify(rewards),
      row.id,
    );
    this.log(userId, summary, st, rewards, outcome, found, kept);
    return { summary, rewards };
  }

  /** Pays a run and returns what it paid. Call inside the run's transaction. */
  private pay(
    userId: string,
    row: RunRow,
    st: RunState,
    outcome: DungeonOutcome,
    kept: DungeonPack,
    streak: number,
    firstOfDay: boolean,
  ): DungeonRewards {
    const { day, attempt, depth } = row;
    const cleared = outcome === 'cleared' || st.bossCleared;
    const landmark = cleared && isLandmark(depth);
    // A run that went down (or was offered the way down) opened the main boss's chest at that moment:
    // its gear, shard and supply are paid (`banked`) and its extras are in the pack, so nothing of the
    // chest is rolled or added again here.
    const chestPaid = st.banked !== null;
    // The boss chest of a clear: its Essence and scrap came into the pack with the boss's loot (and
    // are kept whole); on top come the full clear's Essence and the landmark's extras. The shard and
    // gear dice are rolled below, with the live gear rng.
    const bait = kept.bait;
    const essence =
      kept.essence +
      (cleared && !chestPaid ? RULES.dungeon.fullClear.essence : 0) +
      (landmark && !chestPaid ? RULES.dungeon.landmark.essence : 0);
    const scrap = kept.scrap + (landmark && !chestPaid ? RULES.dungeon.landmark.scrap : 0);
    const glimmer = landmark && !chestPaid ? RULES.dungeon.landmark.glimmer : 0;
    const bossNode = st.map.nodes.find((n) => n.kind === 'boss');
    const bossElement =
      (bossNode === undefined ? undefined : nodeFoe(bossNode, depth))?.element ?? 'tide';
    const gearDeps = this.gearDeps();
    const grant = grantDungeonRun(
      gearDeps,
      userId,
      day,
      attempt,
      (rng) => {
        if (chestPaid) return { parts: addParts({ scrap, glimmer }, {}), gear: [], supplies: [] };
        const loot = rollDungeonLoot(
          rng,
          depth,
          {
            landmark,
            fullClear: cleared,
            bossCleared: cleared,
            supplies: st.supply ? SUPPLIES_PER_RUN : 0,
          },
          bossElement,
        );
        return {
          parts: addParts({ scrap, glimmer }, loot.parts),
          gear: loot.gear.map((item) => ({ item, origin: { kind: 'dungeon' as const, depth } })),
          supplies: loot.supplies,
        };
      },
      { bait, essence, meta: { day, depth, attempt } },
    );
    let streakPaid: DungeonRewards['streak'] = null;
    const bonus = firstOfDay ? streakBonus(streak) : null;
    if (bonus !== null) {
      const parts = grantDungeonStreak(
        gearDeps,
        userId,
        day,
        {
          scrap: bonus.scrap,
          glimmer: bonus.glimmer,
        },
        { bait: bonus.bait, essence: bonus.essence, meta: { day, streak: bonus.day } },
      ).parts;
      streakPaid = { day: bonus.day, bait: bonus.bait, essence: bonus.essence, parts };
    }
    // What the boss chests paid on the way (see `chestPaid`) is part of what the run paid.
    const banked = st.banked;
    return {
      bait,
      essence,
      parts: addParts(banked?.parts ?? {}, grant.parts),
      gear: [...(banked?.gear ?? []), ...grant.gear],
      converted: [...(banked?.converted ?? []), ...grant.converted],
      supplies: [...(banked?.supplies ?? []), ...(grant.supplies ?? [])],
      landmark,
      streak: streakPaid,
    };
  }

  /** The deps of the gear grants: the live gear rng, and the same storage and clock. */
  private gearDeps(): GrantDeps {
    return {
      storage: this.deps.storage,
      now: this.deps.now,
      rng: this.deps.gearRng,
      analytics: this.deps.analytics,
    };
  }

  /**
   * Locks the player's depth in at `depth` the moment the main boss falls: it never goes down again, so
   * a defeat in the Undercroft or a run left open cannot undo it. Creates the progress row if there is
   * none yet (the run's end fills in the streak and the counts).
   */
  private lockDepth(userId: string, depth: number): void {
    this.sql.exec(
      `INSERT INTO dungeon_progress (user_id, depth) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET depth = MAX(depth, excluded.depth)`,
      userId,
      depth,
    );
  }

  /** The summary of a run: the fights it played, the row at the end, what it paid and how it ended (null while it is open). */
  private summarise(args: {
    row: RunRow;
    st: RunState;
    outcome: DungeonOutcome | null;
    newDepth: number;
    streak: number;
    rewards: DungeonRewards;
    found: DungeonPack;
    kept: DungeonPack;
  }): DungeonRunSummary {
    const { row, st, outcome } = args;
    const hp = currentHp(st);
    const rooms: DungeonRoomSummary[] = [];
    for (const step of this.fightRows(row.id)) {
      if (step.input_json === null || step.result_json === null) continue;
      const { input } = JSON.parse(step.input_json) as StoredFight;
      const result = JSON.parse(step.result_json) as DungeonRoomResult;
      const spec = input.rooms[0];
      if (spec === undefined) continue;
      const elite = spec.elite === true;
      rooms.push({
        index: spec.index,
        kind: spec.foe.kind,
        ...(elite ? { elite: true } : {}),
        ...(spec.epic === true ? { epic: true } : {}),
        foe: {
          id: spec.foe.id,
          name: spec.foe.name,
          element: spec.foe.element,
          hpMax: result.result.bossHpStart,
        },
        modifier: {
          id: spec.modifier.id,
          name: spec.modifier.name,
          description: spec.modifier.description,
        },
        played: true,
        cleared: result.cleared,
        rounds: result.result.rounds,
        foeHpEnd: result.result.bossHpEnd,
      });
    }
    return {
      id: row.id,
      day: row.day,
      attempt: row.attempt,
      depth: row.depth,
      newDepth: args.newDepth,
      cleared: outcome === 'cleared' || st.bossCleared,
      deepest: st.deepest,
      roomsCleared: st.roomsCleared,
      landmark: isLandmark(row.depth),
      streak: args.streak,
      createdAt: row.created_at,
      team: st.input.team.map((slot) => ({
        id: slot.id,
        name: slot.name,
        speciesId: slot.speciesId,
        element: slot.element,
        role: slot.role,
        level: slot.level,
        hpMax: st.hpMax[slot.id] ?? 0,
        hpEnd: hp[slot.id] ?? 0,
      })),
      rooms,
      rewards: args.rewards,
      ...(st.weather === null ? {} : { weather: { boon: st.weather.boon, omen: st.weather.omen } }),
      ...(outcome === null ? {} : { outcome }),
      // A carved door the player's depth does not open is a quiet room, shown as a mystery room everywhere.
      path: st.path.map((id) => {
        const kind = runNode(st, id)?.kind ?? 'fight';
        return kind === 'door' && !undercroftOpen(row.depth) ? 'mystery' : kind;
      }),
      pack: { found: { ...args.found }, kept: { ...args.kept } },
      keepsakes: keepsakeViews(st.keepsakes),
      ...(outcome === null
        ? {}
        : {
            route: {
              map: mapView(st.map, row.depth),
              path: [...st.path],
              history: structuredClone(st.history),
              ...(st.under.length === 0
                ? {}
                : { undercroft: st.under.map((m) => mapView(m, row.depth)) }),
            },
          }),
    };
  }

  /** The analytics events of a run: who went and how it ended, and what it paid. */
  private log(
    userId: string,
    summary: DungeonRunSummary,
    st: RunState,
    rewards: DungeonRewards,
    outcome: DungeonOutcome,
    found: DungeonPack,
    kept: DungeonPack,
  ): void {
    const analytics = this.deps.analytics;
    if (analytics === undefined) return;
    analytics.record(
      {
        kind: 'dungeon_run',
        depth: summary.depth,
        attempt: summary.attempt,
        roomsCleared: summary.roomsCleared,
        cleared: summary.cleared,
        landmark: summary.landmark,
        modifiers: summary.rooms.map((r) => r.modifier.id),
        team: st.input.team.map((s) => ({ species: s.speciesId, role: s.role })),
        gear: st.gearWorn,
        outcome,
        path: summary.path ?? [],
        keepsakes: st.keepsakes,
        campChoice: st.campChoice ?? 'none',
        elites: st.elites,
        packFound: totalOf(found),
        packKept: totalOf(kept),
        deepest: st.deepest,
        marks: st.marks,
      },
      userId,
    );
    if (summary.weather !== undefined) {
      analytics.record(
        {
          kind: 'weather_use',
          where: 'dungeon',
          boon: summary.weather.boon,
          omen: summary.weather.omen,
        },
        userId,
      );
    }
    const parts = addParts(rewards.parts, rewards.streak?.parts ?? {});
    const shards =
      (parts['tide-shard'] ?? 0) +
      (parts['ember-shard'] ?? 0) +
      (parts['grove-shard'] ?? 0) +
      (parts['spark-shard'] ?? 0);
    const bait = rewards.bait + (rewards.streak?.bait ?? 0);
    const essence = rewards.essence + (rewards.streak?.essence ?? 0);
    if (
      bait +
        essence +
        (parts.scrap ?? 0) +
        shards +
        (parts.glimmer ?? 0) +
        rewards.gear.length +
        (rewards.supplies?.length ?? 0) >
      0
    ) {
      analytics.record(
        {
          kind: 'dungeon_reward',
          depth: summary.depth,
          bait,
          essence,
          scrap: parts.scrap ?? 0,
          shards,
          glimmer: parts.glimmer ?? 0,
          gear: rewards.gear.length + rewards.converted.length,
          supplies: rewards.supplies?.length ?? 0,
          landmark: rewards.landmark,
          streakBonusDay: rewards.streak?.day ?? 0,
        },
        userId,
      );
    }
  }

  /**
   * Empties the inputs and events of old runs and their steps (the summary and rewards stay) and drops
   * old day seeds.
   */
  prune(): void {
    const cutoff = this.deps.now() - RUN_RETENTION_MS;
    this.sql.exec(
      'UPDATE dungeon_runs SET input_json = NULL, result_json = NULL WHERE created_at < ? AND input_json IS NOT NULL',
      cutoff,
    );
    this.sql.exec(
      'UPDATE dungeon_steps SET input_json = NULL, result_json = NULL WHERE created_at < ? AND (input_json IS NOT NULL OR result_json IS NOT NULL)',
      cutoff,
    );
    // Past retention the stored answer of a step and the state of a run that ended go too: the summary
    // and rewards say all that is shown of it. A retry of such a step is `stale_step`.
    this.sql.exec(
      "UPDATE dungeon_steps SET act_json = '{}' WHERE created_at < ? AND act_json != '{}'",
      cutoff,
    );
    this.sql.exec(
      "UPDATE dungeon_runs SET state_json = NULL WHERE created_at < ? AND status = 'done' AND state_json IS NOT NULL",
      cutoff,
    );
    this.sql.exec('DELETE FROM dungeon_days WHERE created_at < ?', cutoff);
    this.sql.exec('DELETE FROM dungeon_drafts WHERE updated_at < ?', cutoff);
  }
}

/**
 * Dev tools only: the picked modifiers laid over a copy of the map: the first two entrance rooms (left
 * to right, the third gets the first again) and the room boss, so `legacyModifierIds` reads them back.
 */
function withForcedModifiers(map: DungeonMap, ids: readonly string[]): DungeonMap {
  const entrance = map.nodes.filter((n) => n.floor === 0).sort((a, b) => a.lane - b.lane);
  const pick = new Map<string, string>();
  entrance.forEach((n, i) => pick.set(n.id, ids[i % 2] as string));
  const boss = map.nodes.find((n) => n.kind === 'boss');
  if (boss !== undefined) pick.set(boss.id, ids[2] as string);
  return {
    ...map,
    nodes: map.nodes.map((n) => {
      const modifierId = pick.get(n.id);
      return modifierId === undefined ? n : { ...n, modifierId };
    }),
  };
}

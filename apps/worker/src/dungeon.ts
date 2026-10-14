/**
 * The daily dungeon of a guild (see `docs/design/daily-dungeon.md`): a solo run with the player's own
 * team of three, once per guild-local day (plus one retry on the first day a player ever played).
 *
 * Server-authoritative and atomic. A run request is validated, its seed drawn from live randomness
 * at that moment, the rooms generated and every room simulated, and then the run is stored and paid
 * inside ONE `transactionSync`: the run row, the progress, the Bait and Essence, the parts and gear,
 * the streak bonus and the analytics events all commit together or not at all. The client only ever
 * sends intents (which creatures, and where they stand) and a key; the result is
 * final when the request returns, so the client can show it at any pace without the server.
 *
 * Idempotency: a retry with the same key returns the stored run (a changed body under the same key is
 * a `key_conflict`). Every payout is also idempotent on its own, per (player, day, attempt): ledger
 * keys `dungeon:<day>:<attempt>:bait|essence` (streak: `dungeon:<day>:streak:bait|essence`) and gear
 * grants `dungeon:<day>:<attempt>` and `dungeon:<day>:streak`.
 *
 * The day is the guild-local game day, which starts at the daily reset (13:37, `RULES.daily.reset`):
 * the timezone is resolved once per request and passed down.
 * The seed of a run is never derivable by a client: it comes from the crypto RNG at the moment of the
 * request and is not sent to anyone. What a client can see before a run, the day's room modifiers,
 * comes from a separate seed that only decides modifiers.
 */
import {
  RULES,
  abilitiesFor,
  addParts,
  createSeededRng,
  dungeonFoe,
  dungeonPayout,
  isLandmark,
  rollDungeonLoot,
  rollDayModifiers,
  rollRooms,
  roomModifier,
  scaledFoe,
  streakBonus,
  type Element,
  type GearRarity,
  type PartsBundle,
  type Rng,
  type Role,
} from '@creatures/game';
import {
  buildNames,
  buildRoomInput,
  simulateDungeon,
  type AbilityChoice,
  type DungeonRoomSpec,
  type DungeonRunInput,
  type DungeonRunResult,
  type EventNames,
  type FightEvent,
  type FightSlot,
} from '@creatures/engine';
import type { Analytics } from './analytics';
import { devKey, type DevFlags } from './dev-state';
import { keyTaken } from './keyed-action';
import { GameError, atomically, type Outcome } from './outcome';
import { grantDungeonRun, grantDungeonStreak, type GrantDeps } from './gear-grants';
import type { LedgerStorage } from './ledger';
import { drawSeed, slotFor } from './raid-resolve';
import { loadCreatures, type TeamCreature } from './raid-teams';
import type { RunBody } from './dungeon-schemas';
import { addDays, gameDay, gameDayEnd } from './time';

/** Runs (their events and inputs) are kept this long; the summary and rewards stay. */
export const RUN_RETENTION_MS = 90 * 86_400_000;
/** The engine's key for the one player of a solo run. Never shown to anyone. */
const PLAYER = 'p1';
export interface DungeonDeps {
  storage: LedgerStorage;
  now: () => number;
  /** Live randomness for the run seed and the day's modifier seed. Crypto in production. */
  rng: Rng;
  /** Live randomness for the gear and shard rolls. Crypto in production. */
  gearRng: Rng;
  /** The guild's timezone (an IANA name). Read once per request and passed down. */
  timezone: () => string;
  analytics?: Analytics | undefined;
  /** The dev tools' force flags (staging only): the day's modifiers can be picked. Absent in production. */
  dev?: DevFlags | undefined;
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
  /** A fully cleared landmark depth: its gear drop was certain. */
  landmark: boolean;
  streak: { day: number; bait: number; essence: number; parts: PartsBundle } | null;
}

export interface DungeonRoomSummary {
  index: number;
  kind: 'foe' | 'boss';
  foe: { id: string; name: string; element: Element; hpMax: number };
  modifier: { id: string; name: string; description: string };
  /** False for the rooms after the one that was lost. */
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
  /** The depth the player is at after this run (one deeper after a full clear). */
  newDepth: number;
  cleared: boolean;
  roomsCleared: number;
  landmark: boolean;
  /** Days in a row after this run. */
  streak: number;
  createdAt: number;
  team: DungeonTeamMember[];
  rooms: DungeonRoomSummary[];
  rewards: DungeonRewards;
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
  /** Days in a row, as of now: 0 when yesterday was missed and nothing has run today. */
  streak: number;
  /** The modifiers of the day, one per room. Safe to show: they come from their own seed. */
  modifiers: DungeonModifierView[];
  attemptsToday: number;
  attemptsAllowed: number;
  canRun: boolean;
  /** Why a run is not possible now, or null. */
  blocked: 'already_run' | 'need_creatures' | null;
  /** The newest run of today, or null. */
  last: DungeonRunSummary | null;
}

export interface DungeonRunResponse {
  run: DungeonRunSummary;
  today: DungeonToday;
}

export interface DungeonReplayRoom {
  index: number;
  kind: 'foe' | 'boss';
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

export interface DungeonReplayView {
  summary: DungeonRunSummary;
  /** The fighting row, left to right (`position` 0 is the left creature). */
  row: {
    position: number;
    id: string;
    name: string;
    species: string;
    element: Element;
    role: Role;
    level: number;
  }[];
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
};

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
  return JSON.stringify({ team: body.team });
}

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

  private runsOn(userId: string, day: string): RunRow[] {
    return this.sql
      .exec<RunRow>(
        'SELECT * FROM dungeon_runs WHERE user_id = ? AND day = ? ORDER BY attempt',
        userId,
        day,
      )
      .toArray();
  }

  /**
   * The modifier ids of a day: stored with their seed on the first look, so everyone on the server
   * sees the same ones all day. The seed is drawn from live randomness and is never sent out.
   */
  private modifierIds(day: string): string[] {
    const forced = this.forcedModifiers(day);
    if (forced !== null) return forced;
    const stored = this.sql
      .exec<{ modifier_seed: string }>('SELECT modifier_seed FROM dungeon_days WHERE day = ?', day)
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
    return rollDayModifiers(createSeededRng(`${seed}:modifiers`));
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

  private modifierViews(ids: readonly string[]): DungeonModifierView[] {
    return ids.map((id, room) => {
      const m = roomModifier(id);
      if (m === undefined) throw new Error('stored modifier is not in the content');
      return { room, id: m.id, name: m.name, description: m.description };
    });
  }

  /**
   * How many runs a player may make on `day`: one, plus a retry on the first day they ever played if
   * that run was not cleared. `allowed` is what the day gives them in total (2 on a first day).
   */
  private allowance(
    progress: ProgressRow,
    day: string,
    runs: readonly RunRow[],
  ): { allowed: number; canRun: boolean } {
    const firstDay = progress.first_day === null || progress.first_day === day;
    const retry = firstDay && runs.length === 1 && runs[0]?.cleared === 0;
    // A timezone moved west can make `day` earlier than a day the player already ran on. That day
    // is spent, so the earlier-looking one must not give a second run.
    const behind = progress.last_day !== null && progress.last_day > day;
    return { allowed: firstDay ? 2 : 1, canRun: !behind && (runs.length === 0 || retry) };
  }

  // --- Reads ---

  /** Today's state: the modifiers, the player's depth and streak, and the newest run if there is one. */
  today(userId: string): DungeonToday {
    const tz = this.deps.timezone();
    const now = this.deps.now();
    const day = gameDay(now, tz, RULES.daily.reset);
    return this.deps.storage.transactionSync(() => this.todayView(userId, day, tz, now));
  }

  private todayView(userId: string, day: string, tz: string, now: number): DungeonToday {
    const progress = this.progress(userId);
    const runs = this.runsOn(userId, day);
    const { allowed, canRun } = this.allowance(progress, day, runs);
    const creatures = this.sql
      .exec<{ n: number }>('SELECT COUNT(*) AS n FROM creatures WHERE user_id = ?', userId)
      .one().n;
    const needCreatures = creatures < RULES.dungeon.teamSize;
    const last = runs.at(-1);
    // A last day later than `day` (timezone moved west) keeps the streak, it does not break it.
    const alive =
      progress.last_day !== null &&
      (progress.last_day >= day || progress.last_day === addDays(day, -1));
    return {
      serverNow: now,
      day,
      timezone: tz,
      resetsAt: gameDayEnd(day, tz, RULES.daily.reset),
      depth: progress.depth,
      landmark: isLandmark(progress.depth),
      streak: alive ? progress.streak : 0,
      modifiers: this.modifierViews(this.modifierIds(day)),
      attemptsToday: runs.length,
      attemptsAllowed: allowed,
      canRun: canRun && !needCreatures,
      blocked: !canRun ? 'already_run' : needCreatures ? 'need_creatures' : null,
      last: last === undefined ? null : (JSON.parse(last.summary_json) as DungeonRunSummary),
    };
  }

  /** The full replay of one of the caller's runs, or null (unknown, someone else's, or past retention). */
  replay(userId: string, runId: string): DungeonReplayView | null {
    const row = this.sql
      .exec<RunRow>('SELECT * FROM dungeon_runs WHERE id = ? AND user_id = ?', runId, userId)
      .toArray()[0];
    // The same answer for "does not exist" and "belongs to someone else".
    if (row === undefined || row.input_json === null || row.result_json === null) return null;
    const input = JSON.parse(row.input_json) as DungeonRunInput;
    const result = JSON.parse(row.result_json) as DungeonRunResult;
    const summary = JSON.parse(row.summary_json) as DungeonRunSummary;
    const name = this.sql
      .exec<{ display_name: string }>('SELECT display_name FROM players WHERE user_id = ?', userId)
      .toArray()[0]?.display_name;
    const rooms: DungeonReplayRoom[] = result.rooms.map((r) => {
      const spec = input.rooms[r.index] as DungeonRoomSpec;
      const fight = buildRoomInput(input, spec, r.index === 0 ? null : r.hpStart);
      return {
        index: r.index,
        kind: spec.foe.kind,
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
        cleared: r.cleared,
        rounds: r.result.rounds,
        hpStart: r.hpStart,
        hpMax: r.hpMax,
        events: r.result.events,
        names: buildNames(fight, { [PLAYER]: name ?? 'You' }),
      };
    });
    return {
      summary,
      row: input.team.map((s, position) => ({
        position,
        id: s.id,
        name: s.name,
        species: s.speciesId,
        element: s.element,
        role: s.role,
        level: s.level,
      })),
      rooms,
    };
  }

  // --- The run ---

  /** Validates, plays and pays a run in one transaction. See the file comment. */
  run(userId: string, body: RunBody): Outcome<DungeonRunResponse> {
    const tz = this.deps.timezone();
    const now = this.deps.now();
    const day = gameDay(now, tz, RULES.daily.reset);
    return atomically(this.deps.storage, () => this.runIn(userId, body, day, tz, now));
  }

  private runIn(
    userId: string,
    body: RunBody,
    day: string,
    tz: string,
    now: number,
  ): DungeonRunResponse {
    // --- A retry of a run that was stored returns it, and changes nothing ---
    const fingerprint = fingerprintOf(body);
    const prior = this.sql
      .exec<RunRow>(
        'SELECT * FROM dungeon_runs WHERE user_id = ? AND idempotency_key = ?',
        userId,
        body.idempotencyKey,
      )
      .toArray()[0];
    if (prior !== undefined) {
      if (prior.fingerprint !== fingerprint) throw new GameError(409, 'key_conflict');
      return {
        run: JSON.parse(prior.summary_json) as DungeonRunSummary,
        today: this.todayView(userId, day, tz, now),
      };
    }
    // The same key used by another kind of action is a conflict too, whatever it was.
    if (keyTaken(this.sql, userId, body.idempotencyKey, ['ledger', 'gear_actions'])) {
      throw new GameError(409, 'key_conflict');
    }

    // --- One run a day, and the retry of a first day ---
    const progress = this.progress(userId);
    const runs = this.runsOn(userId, day);
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
    // `team[i]` is position i, left to right: the row is the order of the request.
    const standing = team;
    const row: FightSlot[] = standing.map((c) => slotFor(c, PLAYER));
    const abilities = this.abilityChoices(standing);

    // --- The seed is drawn now, and the rooms and the fights follow from it ---
    const seed = drawSeed(this.deps.rng);
    const depth = progress.depth;
    const plans = rollRooms(createSeededRng(`${seed}:rooms`), this.modifierIds(day));
    const rooms: DungeonRoomSpec[] = plans.map((plan) => {
      const foe = dungeonFoe(plan.foeId);
      const modifier = roomModifier(plan.modifierId);
      if (foe === undefined || modifier === undefined)
        throw new Error('rolled room not in content');
      const { hp, atk } = scaledFoe(foe, depth);
      return { index: plan.index, foe, modifier, hp, atk };
    });
    const input: DungeonRunInput = {
      team: row,
      player: PLAYER,
      rooms,
      abilities,
      luck: { ...RULES.combat.luck },
    };
    const result = simulateDungeon(input, seed);

    // --- Progress ---
    const newStreak =
      progress.last_day === day
        ? progress.streak
        : progress.last_day === addDays(day, -1)
          ? progress.streak + 1
          : 1;
    const newDepth = result.cleared ? depth + 1 : depth;
    this.sql.exec(
      `INSERT INTO dungeon_progress (user_id, depth, streak, last_day, first_day, runs, clears)
       VALUES (?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(user_id) DO UPDATE SET depth = excluded.depth, streak = excluded.streak,
         last_day = excluded.last_day, first_day = COALESCE(first_day, excluded.first_day),
         runs = runs + 1, clears = clears + excluded.clears`,
      userId,
      newDepth,
      newStreak,
      day,
      progress.first_day ?? day,
      result.cleared ? 1 : 0,
    );

    // --- Pay: rooms, loot, and the streak bonus on the first run of a day ---
    const rewards = this.pay(userId, day, attempt, depth, result, rooms, newStreak, {
      firstOfDay: progress.last_day !== day,
    });

    // --- Store ---
    const id = crypto.randomUUID();
    const summary = this.summarise({
      id,
      day,
      attempt,
      depth,
      newDepth,
      streak: newStreak,
      createdAt: now,
      standing,
      input,
      result,
      rewards,
    });
    this.sql.exec(
      `INSERT INTO dungeon_runs (id, user_id, day, attempt, idempotency_key, fingerprint, depth, seed,
         cleared, rooms_cleared, input_json, result_json, summary_json, rewards_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      userId,
      day,
      attempt,
      body.idempotencyKey,
      fingerprint,
      depth,
      seed,
      result.cleared ? 1 : 0,
      result.roomsCleared,
      JSON.stringify(input),
      JSON.stringify(result),
      JSON.stringify(summary),
      JSON.stringify(rewards),
      now,
    );
    this.log(userId, summary, input, rewards, row);
    return { run: summary, today: this.todayView(userId, day, tz, now) };
  }

  /**
   * The engine's ability choices of a run: every unlocked creature ability, each firing at its
   * default round. There is no basic ability and the player sets no rounds.
   */
  private abilityChoices(standing: readonly TeamCreature[]): AbilityChoice[] {
    const unlocked = abilitiesFor(
      standing.map((c) => ({ id: c.id, speciesId: c.species.id, level: c.level })),
      (c) => c.level,
    );
    return unlocked.map((source) => ({
      playerId: PLAYER,
      abilityId: source.abilityId,
      key: `${PLAYER}:c${String(standing.findIndex((c) => c.id === source.creatureId))}`,
      creatureId: source.creatureId,
    }));
  }

  /** Pays a run and returns what it paid. Call inside the run's transaction. */
  private pay(
    userId: string,
    day: string,
    attempt: number,
    depth: number,
    result: DungeonRunResult,
    rooms: readonly DungeonRoomSpec[],
    streak: number,
    options: { firstOfDay: boolean },
  ): DungeonRewards {
    const payout = dungeonPayout(depth, result.roomsCleared);
    const gearDeps: GrantDeps = {
      storage: this.deps.storage,
      now: this.deps.now,
      rng: this.deps.gearRng,
      analytics: this.deps.analytics,
    };
    const boss = rooms.at(-1);
    const grant = grantDungeonRun(
      gearDeps,
      userId,
      day,
      attempt,
      (rng) => {
        const loot = rollDungeonLoot(rng, depth, payout, boss?.foe.element ?? 'tide');
        return {
          parts: addParts({ scrap: payout.scrap, glimmer: payout.glimmer }, loot.parts),
          gear: loot.gear,
        };
      },
      { bait: payout.bait, essence: payout.essence, meta: { day, depth, attempt } },
    );
    let streakPaid: DungeonRewards['streak'] = null;
    const bonus = options.firstOfDay ? streakBonus(streak) : null;
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
    return {
      bait: payout.bait,
      essence: payout.essence,
      parts: grant.parts,
      gear: grant.gear,
      converted: grant.converted,
      landmark: payout.landmark,
      streak: streakPaid,
    };
  }

  private summarise(args: {
    id: string;
    day: string;
    attempt: number;
    depth: number;
    newDepth: number;
    streak: number;
    createdAt: number;
    standing: readonly TeamCreature[];
    input: DungeonRunInput;
    result: DungeonRunResult;
    rewards: DungeonRewards;
  }): DungeonRunSummary {
    const { input, result } = args;
    const last = result.rooms.at(-1);
    const firstRoom = result.rooms[0];
    const hpMax = firstRoom?.hpMax ?? {};
    return {
      id: args.id,
      day: args.day,
      attempt: args.attempt,
      depth: args.depth,
      newDepth: args.newDepth,
      cleared: result.cleared,
      roomsCleared: result.roomsCleared,
      landmark: isLandmark(args.depth),
      streak: args.streak,
      createdAt: args.createdAt,
      team: args.standing.map((c) => ({
        id: c.id,
        name: c.nickname ?? c.species.name,
        speciesId: c.species.id,
        element: c.species.element,
        role: c.species.role,
        level: c.level,
        hpMax: hpMax[c.id] ?? 0,
        hpEnd: last?.result.hpEnd[c.id] ?? hpMax[c.id] ?? 0,
      })),
      rooms: input.rooms.map((spec) => {
        const played = result.rooms.find((r) => r.index === spec.index);
        const hpPool = played === undefined ? spec.hp : played.result.bossHpStart;
        return {
          index: spec.index,
          kind: spec.foe.kind,
          foe: { id: spec.foe.id, name: spec.foe.name, element: spec.foe.element, hpMax: hpPool },
          modifier: {
            id: spec.modifier.id,
            name: spec.modifier.name,
            description: spec.modifier.description,
          },
          played: played !== undefined,
          cleared: played?.cleared ?? false,
          rounds: played?.result.rounds ?? 0,
          foeHpEnd: played?.result.bossHpEnd ?? hpPool,
        };
      }),
      rewards: args.rewards,
    };
  }

  /** The analytics events of a run: who went and how it ended, and what it paid. */
  private log(
    userId: string,
    summary: DungeonRunSummary,
    input: DungeonRunInput,
    rewards: DungeonRewards,
    row: readonly FightSlot[],
  ): void {
    const analytics = this.deps.analytics;
    if (analytics === undefined) return;
    const worn = this.sql
      .exec<{ n: number }>(
        `SELECT COUNT(*) AS n FROM gear_items WHERE user_id = ? AND equipped_on IN (${row
          .map(() => '?')
          .join(', ')})`,
        userId,
        ...row.map((s) => s.id),
      )
      .one().n;
    analytics.record(
      {
        kind: 'dungeon_run',
        depth: summary.depth,
        attempt: summary.attempt,
        roomsCleared: summary.roomsCleared,
        cleared: summary.cleared,
        landmark: summary.landmark,
        modifiers: input.rooms.map((r) => r.modifier.id),
        team: row.map((s) => ({ species: s.speciesId, role: s.role })),
        gear: worn,
      },
      userId,
    );
    const parts = addParts(rewards.parts, rewards.streak?.parts ?? {});
    const shards =
      (parts['tide-shard'] ?? 0) +
      (parts['ember-shard'] ?? 0) +
      (parts['grove-shard'] ?? 0) +
      (parts['spark-shard'] ?? 0);
    const bait = rewards.bait + (rewards.streak?.bait ?? 0);
    const essence = rewards.essence + (rewards.streak?.essence ?? 0);
    if (
      bait + essence + (parts.scrap ?? 0) + shards + (parts.glimmer ?? 0) + rewards.gear.length >
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
          landmark: rewards.landmark,
          streakBonusDay: rewards.streak?.day ?? 0,
        },
        userId,
      );
    }
  }

  /** Empties the inputs and events of old runs (the summary and rewards stay) and drops old day seeds. */
  prune(): void {
    const cutoff = this.deps.now() - RUN_RETENTION_MS;
    this.sql.exec(
      'UPDATE dungeon_runs SET input_json = NULL, result_json = NULL WHERE created_at < ? AND input_json IS NOT NULL',
      cutoff,
    );
    this.sql.exec('DELETE FROM dungeon_days WHERE created_at < ?', cutoff);
  }
}

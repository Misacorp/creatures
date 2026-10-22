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
  createSeededRng,
  emptyPack,
  generateDungeonMap,
  dungeonMapValid,
  isLandmark,
  landmarkBossId,
  mapView,
  roomModifier,
  treatCost,
  weatherBossAttacks,
  weatherLuck,
  weatherSky,
  type DungeonMap,
} from '@creatures/game';
import {
  dungeonBossEnrage,
  liveEffects,
  liveFightRules,
  skyRunFields,
  type DungeonRoomResult,
  type DungeonRunInput,
  type FightSlot,
} from '@creatures/engine';
import * as v from 'valibot';
import { devKey } from './dev-state';
import { keyTaken, settleSpend } from './keyed-action';
import { GameError, atomically, type Outcome } from './outcome';
import { grantDungeonChest } from './gear-grants';
import { hasRoom } from './gear-store';
import { spend } from './ledger';
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
  applyCamp,
  applyDescend,
  applyEvent,
  applyHome,
  applyMove,
  homeOutcome,
  seatedRow,
  seatsOf,
  type ActOutcome,
  type PathEnv,
  type PlayedFight,
} from './dungeon-path';
import {
  PLAYER,
  abilityChoices,
  maxHpOfRow,
  parseState,
  runMarks,
  runView,
  type RunMeta,
  type RunState,
} from './dungeon-state';
import type {
  DungeonAttention,
  DungeonReplayRoom,
  DungeonReplayView,
  DungeonRunState,
  DungeonRunSummary,
  DungeonToday,
  DungeonStartResponse,
  DungeonActResponse,
} from './dungeon-types';
import { gearDepsOf, finishRun, lockDepth } from './dungeon-finish';
import { replayRoom, playerName, replayRun } from './dungeon-replay';
import {
  progressOf,
  type DungeonDeps,
  type ProgressRow,
  type RunRow,
  type StepRow,
  type StoredAct,
  type StoredFight,
} from './dungeon-rows';
import { addDays, gameDay, gameDayEnd } from './time';

export type {
  DungeonActResponse,
  DungeonAttention,
  DungeonExperienceView,
  DungeonKeepsakeView,
  DungeonOutcome,
  DungeonPack,
  DungeonReplayRoom,
  DungeonReplayView,
  DungeonRewards,
  DungeonRoomSummary,
  DungeonRunState,
  DungeonRunSummary,
  DungeonStartResponse,
  DungeonStepLog,
  DungeonTeamMember,
  DungeonToday,
  ReplayRowEntry,
} from './dungeon-types';

/** Runs (their events and inputs) are kept this long; the summary and rewards stay. */
export const RUN_RETENTION_MS = 90 * 86_400_000;
/**
 * A step's stored answer (the whole run view it left) only serves a retry of the same request, which
 * comes within minutes. After this long the state in it is emptied (the act and `ended` stay, so a late
 * retry is still a `stale_step`, or a `key_conflict` when it is another request).
 */
export const ACT_ANSWER_RETENTION_MS = 2 * 86_400_000;
export type { DungeonDeps } from './dungeon-rows';

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

/** The run waits where heading home is possible: a camp with its choice pending, or the descent card. */
const safePoint = (st: RunState): boolean =>
  st.pending?.kind === 'camp' || st.pending?.kind === 'descend';

export class Dungeon {
  constructor(private readonly deps: DungeonDeps) {}

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
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
   * first two entrance rooms and the floor boss, see `withForcedModifiers`); they are not stored.
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
    const progress = progressOf(this.sql, userId);
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
      return replayRun(this.deps, row, userId);
    });
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
    const progress = progressOf(this.sql, userId);
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
    // One row, left to right: the position lines of the gear see the neighbours and the ends of that
    // line, then the day's weather goes on every sheet. The seats keep what it takes to place the row
    // again after a camp swap or reorder.
    const seats = seatsOf(standing);
    const row: FightSlot[] = seatedRow(
      standing.map((c) => c.id),
      seats,
      wday,
    );

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
      // Kind Rain, Morning Haze and Bramble Season (stored in the run input).
      ...skyRunFields(weatherSky(wday)),
      // The combat rules, the boss room's enrage and the depth (a landmark gives the floor boss its
      // signature), stored with the input so a replay is exact.
      rules: liveFightRules(),
      // The effect dice, while status effects are switched on (`RULES.combat.effects`).
      ...liveEffects(),
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
      seats,
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
      earned: {},
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
      bagFull: !hasRoom(this.sql, userId),
      treasures: [],
      rareSeen: [],
      sealed: [],
      curses: [],
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
      // The answer's state was emptied after its short window: the same request is now just late.
      if (first.state === undefined) throw new GameError(409, 'stale_step');
      return this.storedAnswer(userId, row, stored, { ...first, state: first.state }, day, tz, now);
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
      gearRng: this.deps.gearRng,
      analytics: this.deps.analytics,
      bank: (tag, draw) =>
        grantDungeonChest(
          gearDepsOf(this.deps),
          userId,
          row.day,
          row.attempt,
          tag,
          draw,
          st.bagFull === undefined ? undefined : !st.bagFull,
        ),
      lockDepth: (depth) => lockDepth(this.deps, userId, depth),
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
      summary = finishRun(this.deps, userId, row, work, outcome.end).summary;
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
        state: lite as NonNullable<StoredAct['state']>,
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
    return replayRoom(
      playerName(this.sql, userId),
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
    first: StoredAct & { state: NonNullable<StoredAct['state']> },
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
      map: mapView(st.map, row.depth, runMarks(st)),
    };
    const room =
      step.node !== null && step.input_json !== null && step.result_json !== null
        ? replayRoom(
            playerName(this.sql, userId),
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
          finishRun(this.deps, userId, row, st, safePoint(st) ? homeOutcome(st) : 'defeat'),
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
    // After a short window the big run view inside a step's stored answer goes (its act stays).
    this.sql.exec(
      "UPDATE dungeon_steps SET act_json = json_remove(act_json, '$.state') WHERE created_at < ? AND json_type(act_json, '$.state') IS NOT NULL",
      this.deps.now() - ACT_ANSWER_RETENTION_MS,
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
 * to right, the third gets the first again) and the floor boss.
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

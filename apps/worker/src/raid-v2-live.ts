/**
 * The live finale of a combat v2 weekend (stage 3; docs/design/combat/integration.md, sections 4 and 5). The state machine is v1's idea on
 * v2's fight: the fight is derived from the clock, so nothing ticks.
 *
 * - At the finale event each party with a boss still standing gets a `raid_live` row (`rules` 2): the stage's input with no actions, a
 *   seed drawn then and each member's one live input (their basic ability: Rally, Shield Wall with a row, or Purge; Re-mark and the creature
 *   abilities are not used under v2). The party's stage-2 carry stays in `raid_parties` until the fight settles.
 * - Round r starts `RULES.raid.v2.liveRoundMs` after round r - 1 (a fixed pace). A read replays the stored input with the inputs known so far
 *   (`replayFight`) and shows rounds 1 to the clock's round. That is consistent because an input changes nothing before its round and draws
 *   no dice (the prefix property), and Fire only ever sets a round after the current one.
 * - **The replay cost.** A read plays only as many rounds as have started, and the rounds replayed so far are kept in the row (`frames`):
 *   a read inside a round that no input changed is served from them without playing anything. A replay runs when a round starts or an
 *   input is pressed, never on a plain poll. The whole fight is played once more when it settles.
 * - Fire, Hold and Unhold are written in a transaction with the round taken from the clock. A fight ends after its last round, or after the
 *   round in which the boss falls or the party is wiped, and then settles once through `settleStageV2`.
 */
import { RULES, content } from '@creatures/game';
import type { FightEvent, FinaleAction, FinaleActionKind, StageOutput } from '@creatures/engine/v2';
import { createSeededRng } from '@creatures/game';
import { stageV2 } from '@creatures/engine/v2';
import { replayFight } from './fight-replay';
import { loadAutofire, BASIC_TARGET } from './raid-autofire';
import type { LiveDeps } from './raid-live';
import { drawSeed, type ResolveDeps } from './raid-resolve';
import {
  buildStageV2,
  logLineups,
  roundsPlayed,
  settleStageV2,
  type WeekV2,
} from './raid-v2-stage';
import { endWeekV2 } from './raid-v2-track';
import { readPartyCarry } from './raid-v2-core';
import { GameError } from './outcome';
import type { StageInputV2 } from '@creatures/engine/v2';

/** The basic abilities that exist under v2, in the order a player who picked none is dealt them. */
export const V2_ABILITY_IDS = ['rally', 'shield-wall', 'purge'] as const;

const KIND_OF: Record<string, FinaleActionKind> = {
  rally: 'rally',
  'shield-wall': 'shieldWall',
  purge: 'purge',
};

/** The row a Shield Wall covers when its owner chose none (the front). */
export const DEFAULT_WALL_ROW = 0;

export type AbilityModeV2 = 'default' | 'held' | 'fired';

/** A member's one live input and what they did with it. */
export interface LiveAbilityV2 {
  /** `<alias>:basic`. */
  key: string;
  alias: string;
  abilityId: string;
  mode: AbilityModeV2;
  /** Mode 'fired': the round it takes effect in (the round after the press). */
  fireAtRound: number | null;
  /** Mode 'fired': the row a Shield Wall covers. */
  params: { row?: number } | null;
}

/** The rounds replayed so far (`raid_live.frames`). */
export interface Frames {
  /** The rounds played. */
  upTo: number;
  /** The inputs up to that round, as the replay had them: the frames are good while this still matches. */
  key: string;
  events: FightEvent[];
  /** Set once the boss fell or the party was wiped: the round it happened in. */
  over: { round: number; won: boolean; wiped: boolean } | null;
}

/** A stored v2 live fight. Contains the seed and user ids: never send it to a client as is. */
export interface LiveRowV2 {
  weekId: string;
  party: number;
  seed: string;
  /** The stage's input without inputs (they live in `abilities`). */
  input: StageInputV2;
  members: { alias: string; userId: string }[];
  abilities: LiveAbilityV2[];
  startedAt: number;
  roundMs: number;
  rounds: number;
  frames: Frames | null;
}

type LiveDbRow = {
  week_id: string;
  party: number;
  seed: string;
  input: string;
  members: string;
  abilities: string;
  started_at: number;
  round_ms: number;
  rounds: number;
  frames: string | null;
};

const COLUMNS =
  'week_id, party, seed, input, members, abilities, started_at, round_ms, rounds, frames';

function toRow(r: LiveDbRow): LiveRowV2 {
  return {
    weekId: r.week_id,
    party: r.party,
    seed: r.seed,
    input: JSON.parse(r.input) as StageInputV2,
    members: JSON.parse(r.members) as LiveRowV2['members'],
    abilities: JSON.parse(r.abilities) as LiveAbilityV2[],
    startedAt: r.started_at,
    roundMs: r.round_ms,
    rounds: r.rounds,
    frames: r.frames === null ? null : (JSON.parse(r.frames) as Frames),
  };
}

/** The party's real v2 live fight, or null. */
export function loadLiveV2(sql: SqlStorage, weekId: string, party: number): LiveRowV2 | null {
  const row = sql
    .exec<LiveDbRow>(
      `SELECT ${COLUMNS} FROM raid_live WHERE week_id = ? AND party = ? AND practice = 0 AND rules = 2`,
      weekId,
      party,
    )
    .toArray()[0];
  return row === undefined ? null : toRow(row);
}

/** True once the party's finale has resolved (its result row exists). */
export function finaleResolvedV2(sql: SqlStorage, weekId: string, party: number): boolean {
  return (
    sql
      .exec(
        "SELECT 1 FROM raid_results WHERE week_id = ? AND party = ? AND phase = 'finale'",
        weekId,
        party,
      )
      .toArray().length > 0
  );
}

/** The ability a member brings: their pick if it exists under v2, else the next of the three by their place in the party. */
export function v2AbilityIds(
  sql: SqlStorage,
  weekId: string,
  memberIds: readonly string[],
): string[] {
  const picks = new Map(
    sql
      .exec<{ user_id: string; ability_id: string }>(
        'SELECT user_id, ability_id FROM raid_abilities WHERE week_id = ?',
        weekId,
      )
      .toArray()
      .map((r) => [r.user_id, r.ability_id]),
  );
  return memberIds.map((userId, i) => {
    const picked = picks.get(userId);
    return picked !== undefined && (V2_ABILITY_IDS as readonly string[]).includes(picked)
      ? picked
      : (V2_ABILITY_IDS[i % V2_ABILITY_IDS.length] as string);
  });
}

/** The round an ability fires in when nobody touches it. */
export function defaultRoundV2(abilityId: string): number {
  return content.finaleAbilities.find((a) => a.id === abilityId)?.defaultRound ?? 1;
}

/** The engine's inputs for what the members have done so far. */
export function engineActionsV2(row: Pick<LiveRowV2, 'abilities' | 'rounds'>): FinaleAction[] {
  return row.abilities.flatMap((a) => {
    const kind = KIND_OF[a.abilityId];
    if (kind === undefined) return [];
    const round = Math.min(
      row.rounds,
      a.mode === 'fired' && a.fireAtRound !== null
        ? a.fireAtRound
        : a.mode === 'held'
          ? row.rounds
          : defaultRoundV2(a.abilityId),
    );
    return [
      {
        round,
        kind,
        ...(kind === 'shieldWall' ? { row: a.params?.row ?? DEFAULT_WALL_ROW } : {}),
        by: a.alias,
      },
    ];
  });
}

/** The inputs that act in rounds 1..`upTo`, as a key. */
const keyOf = (actions: readonly FinaleAction[], upTo: number): string =>
  JSON.stringify(actions.filter((a) => a.round <= upTo));

/**
 * Starts the finale of one party: freezes the input, draws the seed and stores both with each member's ability at its default round.
 * Does nothing (false) if the party has no stage to play (nobody placed, or its boss already fell) or has already started or
 * resolved. Own transaction.
 */
export function startFinaleV2(
  deps: LiveDeps,
  week: WeekV2,
  party: number,
  startedAt: number,
): boolean {
  const { storage } = deps;
  const sql = storage.sql;
  return storage.transactionSync(() => {
    if (finaleResolvedV2(sql, week.weekId, party)) return false;
    if (
      sql
        .exec(
          'SELECT 1 FROM raid_live WHERE week_id = ? AND party = ? AND practice = 0',
          week.weekId,
          party,
        )
        .toArray().length > 0
    )
      return false;
    const built = buildStageV2(sql, week, party, 3);
    if (built === null) return false;
    logLineups(deps, 3, built);
    const prefs = loadAutofire(sql, week.weekId);
    const abilityIds = v2AbilityIds(sql, week.weekId, built.memberIds);
    const abilities: LiveAbilityV2[] = built.memberIds.map((userId, i) => ({
      key: `${built.aliases[i] as string}:basic`,
      alias: built.aliases[i] as string,
      abilityId: abilityIds[i] as string,
      // Auto fire off (a preference of the owner) starts the input held: it waits for its owner and still acts in the last round.
      mode: prefs.isOn(userId, BASIC_TARGET) ? 'default' : 'held',
      fireAtRound: null,
      params: null,
    }));
    sql.exec(
      `INSERT INTO raid_live (week_id, party, practice, seed, input, members, abilities, started_at, round_ms, rounds, pacing, rules, frames)
       VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, 0, 2, NULL)`,
      week.weekId,
      party,
      drawSeed(deps.rng),
      JSON.stringify(built.input),
      JSON.stringify(
        built.aliases.map((alias, i) => ({ alias, userId: built.memberIds[i] as string })),
      ),
      JSON.stringify(abilities),
      startedAt,
      RULES.raid.v2.liveRoundMs,
      built.input.boss.rounds,
    );
    return true;
  });
}

export interface LiveStateV2 {
  /** The round the clock is in (0 before the start), 1..rounds. */
  clockRound: number;
  timeUp: boolean;
  /** Over: the last round has played out, or the one the boss fell (or the party was wiped) in. */
  ended: boolean;
  /** When each round started, for rounds 1..`clockRound`. */
  roundStarts: number[];
  /** The next moment the state changes: the next round's start, or the end of the fight. Null once over. */
  nextRoundAt: number | null;
  endsAt: number;
  /** Every event of rounds 1..`clockRound`. */
  events: FightEvent[];
  over: Frames['over'];
  actions: FinaleAction[];
  /** The whole fight, when this read played all of it (the settle uses it instead of playing again). */
  output?: StageOutput;
}

/** Derives the state of a v2 fight at `now`: the round from the schedule, the rounds from the stored frames or one replay. */
export function evaluateV2(sql: SqlStorage, row: LiveRowV2, now: number): LiveStateV2 {
  const { startedAt, roundMs, rounds } = row;
  const clockRound =
    now < startedAt ? 0 : Math.min(rounds, Math.floor((now - startedAt) / roundMs) + 1);
  const timeUp = now >= startedAt + rounds * roundMs;
  const actions = engineActionsV2(row);
  let frames: Frames | null = null;
  let output: StageOutput | undefined;
  if (clockRound >= 1) {
    const stored = row.frames;
    if (
      stored !== null &&
      stored.upTo >= clockRound &&
      keyOf(actions, stored.upTo) === stored.key
    ) {
      frames = stored;
    } else {
      const carry = readPartyCarry(sql, row.weekId, row.party)?.carry;
      if (carry === undefined) throw new Error('a v2 finale without a stage carry');
      const played = replayFight(row.input, row.seed, {
        carry,
        actions,
        upToRound: clockRound,
      });
      const { result } = played.output;
      // The fight's own `end` event closes a fight that is over (the boss fell, the party fell, the last round played); in a replay that
      // stops at the round the clock is in it only marks where the replay stopped, so it is not shown.
      const finished = result.won || result.wiped || clockRound >= rounds;
      frames = {
        upTo: clockRound,
        key: keyOf(actions, clockRound),
        events: result.events.filter((e) => finished || e.board?.type !== 'end'),
        over:
          result.won || result.wiped
            ? { round: roundsPlayed(result.events), won: result.won, wiped: result.wiped }
            : null,
      };
      if (clockRound >= rounds) output = played.output;
      row.frames = frames;
      sql.exec(
        'UPDATE raid_live SET frames = ? WHERE week_id = ? AND party = ? AND practice = 0',
        JSON.stringify(frames),
        row.weekId,
        row.party,
      );
    }
  }
  const over = frames?.over ?? null;
  const lastRound = over === null ? rounds : Math.min(rounds, over.round);
  const endsAt = startedAt + lastRound * roundMs;
  const ended = timeUp || (over !== null && now >= endsAt);
  const starts = Array.from({ length: clockRound }, (_, k) => startedAt + k * roundMs);
  const events = (frames?.events ?? []).filter((e) => e.round <= clockRound);
  return {
    clockRound,
    timeUp,
    ended,
    roundStarts: starts,
    nextRoundAt: ended ? null : clockRound < lastRound ? startedAt + clockRound * roundMs : endsAt,
    endsAt,
    events,
    over,
    actions,
    ...(output === undefined ? {} : { output }),
  };
}

/**
 * Settles a v2 fight that is over: the whole fight is played once (`replayFight`, with every input), stored through `settleStageV2` with
 * the inputs in the stored input, and the weekend ends if this was the last party. Returns true if it resolved now.
 */
export function settleLiveV2(deps: LiveDeps, weekId: string, party: number, now: number): boolean {
  const { storage } = deps;
  const sql = storage.sql;
  return storage.transactionSync(() => {
    if (finaleResolvedV2(sql, weekId, party)) return false;
    const row = loadLiveV2(sql, weekId, party);
    if (row === null) return false;
    const state = evaluateV2(sql, row, now);
    if (!state.ended) return false;
    const week = sql
      .exec<{ track_slot: number }>('SELECT track_slot FROM raid_weeks WHERE week_id = ?', weekId)
      .toArray()[0];
    const prior = readPartyCarry(sql, weekId, party);
    if (week === undefined || prior === null) return false;
    const output =
      state.output ??
      replayFight(row.input, row.seed, { carry: prior.carry, actions: state.actions }).output;
    const input: StageInputV2 = { ...row.input, actions: state.actions };
    const ownerOf = new Map(row.input.fighters.map((f) => [f.key ?? f.uid, f.owner]));
    settleStageV2(
      deps,
      { weekId, trackSlot: week.track_slot },
      party,
      3,
      {
        memberIds: row.members.map((m) => m.userId),
        aliases: row.members.map((m) => m.alias),
        players: prior.players,
        slot: week.track_slot,
        carry: prior.carry,
        ownerOf,
      },
      row.seed,
      input,
      output,
    );
    endWeekV2(sql, weekId, now, deps.analytics);
    return true;
  });
}

/** Real v2 fights that have not resolved yet, with the time their last round ends (an upper bound: a kill ends one sooner). */
export function unresolvedRealV2(
  sql: SqlStorage,
): { weekId: string; party: number; endsAt: number }[] {
  return sql
    .exec<{ week_id: string; party: number; started_at: number; round_ms: number; rounds: number }>(
      `SELECT l.week_id, l.party, l.started_at, l.round_ms, l.rounds FROM raid_live l
       WHERE l.practice = 0 AND l.rules = 2
         AND NOT EXISTS (SELECT 1 FROM raid_results r
                         WHERE r.week_id = l.week_id AND r.party = l.party AND r.phase = 'finale')
       ORDER BY l.started_at, l.week_id, l.party`,
    )
    .toArray()
    .map((r) => ({
      weekId: r.week_id,
      party: r.party,
      endsAt: r.started_at + r.rounds * r.round_ms,
    }));
}

export interface ActionInputV2 {
  /** `<alias>:basic`: the caller's own input. */
  key: string;
  action: 'fire' | 'hold' | 'unhold';
  /** Shield Wall's row (0-based), with Fire only. */
  row?: number | undefined;
}

/** What an applied action did, for the analytics log. */
export interface AppliedActionV2 {
  action: ActionInputV2['action'];
  abilityId: string;
  round: number;
  defaultRound: number;
}

/**
 * Fire or Hold for the caller's input. The rules are v1's: Fire takes effect at the start of the next round (`too_late` in the last round,
 * `already_fired` once it has acted); Hold (Auto fire off) keeps it past its default round, still acting in the last round, and only before
 * that round (`hold_too_late`); Unhold puts it back (`not_held`). `row` goes with Fire of a Shield Wall only. Returns null when nothing
 * changed. Call it inside a transaction.
 */
export function applyActionV2(
  sql: SqlStorage,
  row: LiveRowV2,
  userId: string,
  body: ActionInputV2,
  now: number,
): AppliedActionV2 | null {
  const member = row.members.find((m) => m.userId === userId);
  if (member === undefined) throw new GameError(409, 'not_in_fight');
  if (now < row.startedAt) throw new GameError(409, 'not_started');
  const ability = row.abilities.find((a) => a.key === body.key);
  if (ability === undefined || ability.alias !== member.alias) {
    throw new GameError(409, 'not_your_ability');
  }
  const takesRow = KIND_OF[ability.abilityId] === 'shieldWall';
  if (body.row !== undefined && (body.action !== 'fire' || !takesRow)) {
    throw new GameError(400, 'invalid_body');
  }
  if (body.row !== undefined && body.row >= row.input.boss.rows) {
    throw new GameError(400, 'invalid_body');
  }
  const state = evaluateV2(sql, row, now);
  const defaultRound = defaultRoundV2(ability.abilityId);
  // The round it acts in with what is known now: it has acted when the clock has reached it.
  const actsAt =
    ability.mode === 'fired' && ability.fireAtRound !== null
      ? ability.fireAtRound
      : ability.mode === 'held'
        ? row.rounds
        : defaultRound;
  const actedNow = actsAt <= state.clockRound;
  // The last round is the final one, or the one the boss fell in: Fire is too late from its start on.
  const over =
    state.ended || state.clockRound >= Math.min(row.rounds, state.over?.round ?? row.rounds);
  if (body.action === 'fire') {
    if (over) throw new GameError(409, 'too_late');
    if (ability.mode === 'fired' || actedNow) throw new GameError(409, 'already_fired');
    ability.mode = 'fired';
    ability.fireAtRound = state.clockRound + 1;
    ability.params = body.row === undefined ? null : { row: body.row };
  } else if (body.action === 'unhold') {
    if (ability.mode === 'fired') throw new GameError(409, 'already_fired');
    if (ability.mode !== 'held') throw new GameError(409, 'not_held');
    if (actedNow) throw new GameError(409, 'already_fired');
    if (over || state.clockRound >= defaultRound) throw new GameError(409, 'hold_too_late');
    ability.mode = 'default';
  } else {
    if (ability.mode === 'fired') throw new GameError(409, 'already_fired');
    if (ability.mode === 'held') {
      if (actedNow) throw new GameError(409, 'already_fired');
      return null;
    }
    if (over || state.clockRound >= defaultRound) throw new GameError(409, 'hold_too_late');
    ability.mode = 'held';
  }
  sql.exec(
    'UPDATE raid_live SET abilities = ? WHERE week_id = ? AND party = ? AND practice = 0',
    JSON.stringify(row.abilities),
    row.weekId,
    row.party,
  );
  return {
    action: body.action,
    abilityId: ability.abilityId,
    round: body.action === 'fire' ? (ability.fireAtRound ?? state.clockRound) : state.clockRound,
    defaultRound,
  };
}

/**
 * A finale that was too late for anyone to watch (the object slept through it) resolves at once: every member's input acts at its default
 * round (or the last, when Auto fire is off), as an instant v1 finale does. Own transaction; false when there was nothing to play.
 */
export function resolveFinaleInstantV2(deps: ResolveDeps, week: WeekV2, party: number): boolean {
  const { storage } = deps;
  const sql = storage.sql;
  return storage.transactionSync(() => {
    if (finaleResolvedV2(sql, week.weekId, party)) return false;
    const built = buildStageV2(sql, week, party, 3);
    if (built === null) return false;
    logLineups(deps, 3, built);
    const prefs = loadAutofire(sql, week.weekId);
    const abilityIds = v2AbilityIds(sql, week.weekId, built.memberIds);
    const rounds = built.input.boss.rounds;
    const actions = built.memberIds.flatMap((userId, i) => {
      const alias = built.aliases[i] as string;
      return engineActionsV2({
        rounds,
        abilities: [
          {
            key: `${alias}:basic`,
            alias,
            abilityId: abilityIds[i] as string,
            mode: prefs.isOn(userId, BASIC_TARGET) ? 'default' : 'held',
            fireAtRound: null,
            params: null,
          },
        ],
      });
    });
    const input: StageInputV2 = { ...built.input, actions };
    const seed = drawSeed(deps.rng);
    const output = stageV2(input, built.carry, createSeededRng(seed));
    settleStageV2(deps, week, party, 3, built, seed, input, output);
    return true;
  });
}

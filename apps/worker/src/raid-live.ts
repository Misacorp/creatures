/**
 * The live Sunday finale: the state machine. The server is authoritative and the fight is derived
 * from the clock, so nothing ticks and nothing has to be broadcast:
 *
 * - At the finale event, each party gets a `raid_live` row: the frozen fight input, a seed drawn from
 *   live randomness (never sent to a client before the fight has resolved) and each member's
 *   ability state.
 * - Rounds are paced by their content: round 1 starts at `started_at` and round r+1 starts
 *   `roundPlaybackMs(events of round r)` after round r (the engine's pacing, shared with the client:
 *   6 to 22 seconds). A read re-runs the engine on the stored input with the abilities known so far and
 *   shows rounds 1..round. That is consistent because of the engine's prefix property: round r's events
 *   depend only on the abilities that fire in rounds 1..r, and Fire only ever sets a round after the
 *   current one, so the schedule up to the current round never changes. A fight stored before this
 *   pacing (`pacing` 0) keeps its fixed `round_ms` schedule.
 * - Fire, Hold and Unhold (the Auto fire toggle, off and on) are written in a transaction, with the round taken from the clock at that moment.
 * - The fight ends once its last round has played: round `rounds`, or the round the boss falls in, plus
 *   its playback. It then resolves once through `settleParty` (Essence, jackpot rolls with fresh live
 *   randomness, server firsts, the Discord post). The result row is the done marker.
 *
 * A practice fight (staging only) is the same fight with its own row, no payout and no result.
 */
import { content, createSeededRng, type Element, type Rng } from '@creatures/game';
import {
  MAX_ROUND_MS,
  defaultAbilityRound,
  roundPlaybackMs,
  simulateFight,
  type AbilityChoice,
  type FightEvent,
  type FightInput,
  type FightResult,
  type Zone,
} from '@creatures/engine';
import type { Analytics } from './analytics';
import type { LedgerStorage } from './ledger';
import { basicKey, buildPhaseInput, drawSeed, settleParty } from './raid-resolve';
import { RaidError } from './raid-teams';

/**
 * The longest a round of the live finale can take (the engine's `MAX_ROUND_MS`): 22 seconds, so 12
 * rounds are under 4 and a half minutes. New fights store it in `round_ms` as an upper bound; their
 * real rounds are as long as their content (see `roundStartsOf`).
 */
export const LIVE_ROUND_MS = MAX_ROUND_MS;
/** The pacing of a fight stored from now on: rounds last as long as their events (`roundPlaybackMs`). */
export const PACING_CONTENT = 1;
/** The lobby opens this long before the finale. */
export const LOBBY_MS = 5 * 60_000;
/** A finale event that runs this late or earlier starts live; later than that nobody can watch. */
export const LATE_START_LIMIT_MS = 10 * 60_000;
/** A live fight that starts this soon after its scheduled time counts from the scheduled time. */
export const START_GRACE_MS = 30_000;
/** Practice is refused from this long before the finale until the finale has resolved. */
export const PRACTICE_BLOCK_MS = 30 * 60_000;
/** One practice fight per party in this time. A practice fight stays visible for as long. */
export const PRACTICE_COOLDOWN_MS = 10 * 60_000;
/** A practice fight starts this long after it was asked for: a 30 second lobby with the countdown. */
export const PRACTICE_LOBBY_MS = 30_000;

/** When a practice fight's cooldown and visibility end: `PRACTICE_COOLDOWN_MS` after it was asked for. */
export const practiceOverAt = (row: Pick<LiveRow, 'startedAt'>): number =>
  row.startedAt - PRACTICE_LOBBY_MS + PRACTICE_COOLDOWN_MS;
/** Players who polled this recently count as watching. */
export const WATCH_WINDOW_MS = 10_000;

export type AbilityMode = 'default' | 'held' | 'fired';

/** One use of a finale ability (a member's basic ability or a creature's) and what they did with it. */
export interface LiveAbility {
  /** The engine key, unique in the fight: `<alias>:basic` or `<alias>:c<team slot>`. */
  key: string;
  alias: string;
  abilityId: string;
  /** The frozen row slot (creature id) a creature ability belongs to; null for the basic ability. */
  creatureId: string | null;
  mode: AbilityMode;
  /** Mode 'fired': the round it fires in (the round after the press). */
  fireAtRound: number | null;
  /** Mode 'fired': the zone (Shield Wall) or element (Re-mark) chosen at the press. */
  params: { zone?: Zone; element?: Element } | null;
}

/** A stored live fight. Contains the seed and user ids: never send it to a client as is. */
export interface LiveRow {
  weekId: string;
  party: number;
  practice: boolean;
  seed: string;
  /** The frozen input, without finale abilities (they live in `abilities`). */
  input: FightInput;
  members: { alias: string; userId: string }[];
  abilities: LiveAbility[];
  startedAt: number;
  /** The fixed round length of a fight with `pacing` 0; an upper bound for the others. */
  roundMs: number;
  rounds: number;
  /** 0: fixed rounds of `roundMs` (stored before content pacing). 1: rounds last as long as their content. */
  pacing: number;
}

export interface LiveDeps {
  storage: LedgerStorage;
  now: () => number;
  rng: Rng;
  /** Live randomness for the quirk of a Festival creature (passed on when the finale settles). */
  quirkRng?: Rng;
  /** The analytics event log (passed on when the finale settles). Optional. */
  analytics?: Analytics;
}

type LiveDbRow = {
  week_id: string;
  party: number;
  practice: number;
  seed: string;
  input: string;
  members: string;
  abilities: string;
  started_at: number;
  round_ms: number;
  rounds: number;
  pacing: number;
};

const COLUMNS =
  'week_id, party, practice, seed, input, members, abilities, started_at, round_ms, rounds, pacing';

/**
 * Reads stored abilities, tolerating rows written before creature abilities (no `key`, no
 * `creatureId`) and content that has changed since: a choice without a key is that member's basic
 * ability, and a choice whose ability no longer exists, whose key repeats, or whose creature is
 * not in the frozen row is dropped, so a stored fight can always be simulated.
 */
export function normalizeAbilities(raw: unknown, input: FightInput): LiveAbility[] {
  if (!Array.isArray(raw)) return [];
  const rowIds = new Set(input.row.map((s) => s.id));
  const keys = new Set<string>();
  const out: LiveAbility[] = [];
  for (const item of raw as Partial<LiveAbility>[]) {
    if (typeof item.alias !== 'string' || typeof item.abilityId !== 'string') continue;
    const def = content.finaleAbilities.find((a) => a.id === item.abilityId);
    if (def === undefined) continue;
    const creatureId = typeof item.creatureId === 'string' ? item.creatureId : null;
    if (creatureId !== null && !rowIds.has(creatureId)) continue;
    // A creature ability needs its creature (an old row cannot have one).
    if (def.kind === 'creature' && creatureId === null) continue;
    const key = typeof item.key === 'string' ? item.key : basicKey(item.alias);
    if (keys.has(key)) continue;
    keys.add(key);
    const mode: AbilityMode = item.mode === 'held' || item.mode === 'fired' ? item.mode : 'default';
    out.push({
      key,
      alias: item.alias,
      abilityId: item.abilityId,
      creatureId,
      mode,
      fireAtRound: typeof item.fireAtRound === 'number' ? item.fireAtRound : null,
      params: item.params === undefined || item.params === null ? null : item.params,
    });
  }
  return out;
}

function toRow(r: LiveDbRow): LiveRow {
  const input = JSON.parse(r.input) as FightInput;
  return {
    weekId: r.week_id,
    party: r.party,
    practice: r.practice === 1,
    seed: r.seed,
    input,
    members: JSON.parse(r.members) as LiveRow['members'],
    abilities: normalizeAbilities(JSON.parse(r.abilities), input),
    startedAt: r.started_at,
    roundMs: r.round_ms,
    rounds: r.rounds,
    pacing: r.pacing,
  };
}

export function loadLive(
  sql: SqlStorage,
  weekId: string,
  party: number,
  practice: boolean,
): LiveRow | null {
  const row = sql
    .exec<LiveDbRow>(
      `SELECT ${COLUMNS} FROM raid_live WHERE week_id = ? AND party = ? AND practice = ?`,
      weekId,
      party,
      practice ? 1 : 0,
    )
    .toArray()[0];
  return row === undefined ? null : toRow(row);
}

/** True once the party's real finale has resolved (its result row exists). */
export function finaleResolved(sql: SqlStorage, weekId: string, party: number): boolean {
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

/** The engine's ability list for what the members have done so far. */
export function engineAbilities(row: LiveRow): AbilityChoice[] {
  return row.abilities.map((a): AbilityChoice => {
    const base = {
      playerId: a.alias,
      abilityId: a.abilityId,
      key: a.key,
      ...(a.creatureId === null ? {} : { creatureId: a.creatureId }),
    };
    if (a.mode === 'fired' && a.fireAtRound !== null) {
      return {
        ...base,
        fireAtRound: a.fireAtRound,
        ...(a.params === null ? {} : { params: a.params }),
      };
    }
    // A held ability that is still unused fires at the start of the last round.
    if (a.mode === 'held') return { ...base, fireAtRound: row.rounds };
    return base;
  });
}

export interface LiveState {
  /** The round the clock is in, 1..rounds (rounds that have played are 1..round). */
  clockRound: number;
  /** The last round has played and its playback is over. */
  timeUp: boolean;
  /** Over: the last round (the 12th, or the one the boss fell in) has played out. */
  ended: boolean;
  /**
   * When each round started, for rounds 1..`clockRound` (UTC ms). The schedule is cumulative: round
   * r+1 starts `roundPlaybackMs` after round r.
   */
  roundStarts: number[];
  /** The next moment the state changes: the next round's start, or the end of the last round. Null once over. */
  nextRoundAt: number | null;
  /** When the fight ends with the abilities known so far (an upper bound while it can still change shape). */
  endsAt: number;
  /** The engine input including the abilities known so far. */
  input: FightInput;
  /** The whole fight with the abilities known so far (only rounds up to `clockRound` are certain). */
  result: FightResult;
}

interface Simulated {
  input: FightInput;
  result: FightResult;
}

/**
 * Re-simulations of stored fights, remembered for a few seconds' worth of reads: the same fight is
 * read by every watcher every 2 seconds and by the alarm. The key is everything the simulation depends
 * on: the seed, the frozen input and the abilities (the only part of a stored fight that changes).
 * Results are never mutated.
 */
const SIM_CACHE_MAX = 16;
const simCache = new Map<string, Simulated>();

function simulate(row: LiveRow): Simulated {
  const abilities = engineAbilities(row);
  const key = `${row.seed}|${JSON.stringify(row.input)}|${JSON.stringify(abilities)}`;
  const cached = simCache.get(key);
  if (cached !== undefined) return cached;
  let input: FightInput = { ...row.input, finaleAbilities: abilities };
  let result: FightResult;
  try {
    result = simulateFight(input, createSeededRng(row.seed));
  } catch (err) {
    // A stored fight that the current engine refuses (an old row whose content has changed) is
    // fought without the abilities rather than failing every read.
    if (row.abilities.length === 0) throw err;
    console.error('live fight rejected its abilities', err instanceof Error ? err.name : 'unknown');
    input = { ...row.input, finaleAbilities: [] };
    result = simulateFight(input, createSeededRng(row.seed));
  }
  const out = { input, result };
  if (simCache.size >= SIM_CACHE_MAX) {
    const oldest = simCache.keys().next();
    if (oldest.done !== true) simCache.delete(oldest.value);
  }
  simCache.set(key, out);
  return out;
}

/**
 * Where each round starts, and when the fight ends, with the abilities known so far. Content pacing
 * (`pacing` 1): round 1 starts at `startedAt` and round r+1 starts `roundPlaybackMs(events of round r)`
 * after round r; the end is the end of the last round played (the last round of the fight, or the
 * round the boss fell in). Only the starts of rounds up to the clock's round plus one are certain
 * (round r's events are fixed once r has started); later ones assume what is known now. Legacy rows
 * (`pacing` 0) have a fixed `roundMs` for every round.
 */
export function roundStartsOf(
  row: Pick<LiveRow, 'startedAt' | 'roundMs' | 'rounds' | 'pacing'>,
  result: FightResult,
): { starts: number[]; endsAt: number } {
  if (row.pacing < PACING_CONTENT) {
    return {
      starts: Array.from({ length: row.rounds }, (_, k) => row.startedAt + k * row.roundMs),
      endsAt: row.startedAt + row.rounds * row.roundMs,
    };
  }
  const byRound = new Map<number, FightEvent[]>();
  for (const e of result.events) {
    const list = byRound.get(e.round);
    if (list === undefined) byRound.set(e.round, [e]);
    else list.push(e);
  }
  const last = Math.max(1, Math.min(row.rounds, result.rounds));
  const starts: number[] = [];
  let at = row.startedAt;
  for (let r = 1; r <= last; r++) {
    starts.push(at);
    at += roundPlaybackMs(byRound.get(r) ?? []);
  }
  return { starts, endsAt: at };
}

/** Derives the state of a fight at `now`: the round from the schedule, the fight from the engine. */
export function evaluate(row: LiveRow, now: number): LiveState {
  const { input, result } = simulate(row);
  const { starts, endsAt } = roundStartsOf(row, result);
  let clockRound = 1;
  while (clockRound < starts.length && (starts[clockRound] as number) <= now) clockRound++;
  clockRound = Math.min(clockRound, row.rounds);
  let ended: boolean;
  if (row.pacing < PACING_CONTENT) {
    // The rule fights stored before content pacing were run by: over at the end of the last round,
    // or as soon as the rounds shown include the boss falling.
    const timeUp = now - row.startedAt >= row.rounds * row.roundMs;
    ended =
      timeUp ||
      (result.rounds <= clockRound && (result.bossHpEnd === 0 || result.rounds < row.rounds));
  } else {
    ended = now >= endsAt;
  }
  const next = ended ? null : (starts[clockRound] ?? endsAt);
  return {
    clockRound,
    timeUp: now >= endsAt,
    ended,
    roundStarts: starts.slice(0, clockRound),
    nextRoundAt: next,
    endsAt,
    input,
    result,
  };
}

/** The round the ability with this key fired in, from the events up to `upToRound`, or null. */
export function firedRound(result: FightResult, key: string, upToRound: number): number | null {
  for (const e of result.events) {
    if (e.t === 'ability' && e.key === key && e.round <= upToRound) return e.round;
  }
  return null;
}

/**
 * Starts the live finale of one party: freezes the input, draws the seed, stores both with each
 * member's ability at its default round. Does nothing (false) if the party has no members or has
 * already started or resolved. Own transaction.
 */
export function startFinaleParty(
  deps: LiveDeps,
  week: { weekId: string; bossId: string },
  party: number,
  startedAt: number,
): boolean {
  const { storage } = deps;
  const sql = storage.sql;
  return storage.transactionSync(() => {
    if (finaleResolved(sql, week.weekId, party)) return false;
    if (loadLive(sql, week.weekId, party, false) !== null) return false;
    const built = buildPhaseInput(sql, week, party, 'finale');
    if (built === null) return false;
    insertLive(sql, deps, week.weekId, party, false, built, startedAt);
    return true;
  });
}

function insertLive(
  sql: SqlStorage,
  deps: Pick<LiveDeps, 'rng'>,
  weekId: string,
  party: number,
  practice: boolean,
  built: NonNullable<ReturnType<typeof buildPhaseInput>>,
  startedAt: number,
): void {
  const { input, aliases, memberIds } = built;
  const abilities: LiveAbility[] = input.finaleAbilities.map((a) => ({
    key: a.key,
    alias: a.playerId,
    abilityId: a.abilityId,
    creatureId: a.creatureId ?? null,
    // Auto fire off (a preference of the owner) starts the ability held: it waits for its owner and
    // still fires in the last round. Everything else fires at its default round.
    mode: built.held.has(a.key) ? 'held' : 'default',
    fireAtRound: null,
    params: null,
  }));
  sql.exec(
    `INSERT OR REPLACE INTO raid_live (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    weekId,
    party,
    practice ? 1 : 0,
    drawSeed(deps.rng),
    JSON.stringify({ ...input, finaleAbilities: [] }),
    JSON.stringify(aliases.map((alias, i) => ({ alias, userId: memberIds[i] as string }))),
    JSON.stringify(abilities),
    startedAt,
    LIVE_ROUND_MS,
    input.boss.finaleRounds,
    PACING_CONTENT,
  );
}

/**
 * Starts a practice fight for a party, replacing its earlier one. `startedAt` is when its first round
 * begins (the caller passes now plus `PRACTICE_LOBBY_MS`); until then the party sees a lobby. Call
 * inside a transaction.
 */
export function startPracticeParty(
  deps: LiveDeps,
  week: { weekId: string; bossId: string },
  party: number,
  startedAt: number,
): boolean {
  const sql = deps.storage.sql;
  const built = buildPhaseInput(sql, week, party, 'finale', { practice: true });
  if (built === null) return false;
  insertLive(sql, deps, week.weekId, party, true, built, startedAt);
  return true;
}

/**
 * Resolves a real live fight if it is over (see `LiveState.ended`): the result, Essence, jackpot
 * rolls, firsts and the Discord post, all in one transaction through `settleParty`. The stored input
 * carries the final `fireAtRound` values. Returns true if it resolved now, false if it was already
 * resolved or is still going.
 */
export function settleLive(deps: LiveDeps, weekId: string, party: number, now: number): boolean {
  const { storage } = deps;
  const sql = storage.sql;
  return storage.transactionSync(() => {
    if (finaleResolved(sql, weekId, party)) return false;
    const row = loadLive(sql, weekId, party, false);
    if (row === null) return false;
    const state = evaluate(row, now);
    if (!state.ended) return false;
    settleParty(
      deps,
      { weekId },
      party,
      'finale',
      { memberIds: row.members.map((m) => m.userId), aliases: row.members.map((m) => m.alias) },
      row.seed,
      state.input,
      state.result,
    );
    return true;
  });
}

/** Real fights that have not resolved yet, with the time their last round ends (with the abilities known now). */
export function unresolvedReal(
  sql: SqlStorage,
): { weekId: string; party: number; endsAt: number }[] {
  return sql
    .exec<LiveDbRow>(
      `SELECT ${COLUMNS} FROM raid_live l
       WHERE l.practice = 0
         AND NOT EXISTS (SELECT 1 FROM raid_results r
                         WHERE r.week_id = l.week_id AND r.party = l.party AND r.phase = 'finale')
       ORDER BY l.started_at, l.week_id, l.party`,
    )
    .toArray()
    .map((r) => {
      const row = toRow(r);
      return {
        weekId: row.weekId,
        party: row.party,
        endsAt: roundStartsOf(row, simulate(row).result).endsAt,
      };
    })
    .sort((a, b) => a.endsAt - b.endsAt || a.weekId.localeCompare(b.weekId) || a.party - b.party);
}

export interface ActionInput {
  /** The engine key of one of the caller's own ability uses (see `LiveAbility.key`). */
  key: string;
  action: 'fire' | 'hold' | 'unhold';
  zone?: Zone | undefined;
  element?: Element | undefined;
}

/** What an applied action did, for the analytics log. */
export interface AppliedAction {
  action: ActionInput['action'];
  abilityId: string;
  /** Fire: the round it fires in. Hold and unhold: the round the clock was in. */
  round: number;
  /** The round the ability fires in when nobody presses anything. */
  defaultRound: number;
}

/**
 * Fire or Hold for one of the caller's abilities (`body.key`). Returns what changed, or null when
 * nothing did (a Hold on an ability that is already held). Throws a `RaidError` (rolling the transaction back) for
 * anything the rules refuse; call it inside a transaction.
 *
 * - Fire takes effect at the start of the next round. Refused with `too_late` in the last round or
 *   after the end, and with `already_fired` once the ability has fired or been fired.
 * - Hold (Auto fire off) keeps an ability past its default round. Only allowed before the default
 *   round (`hold_too_late` otherwise), and an unused held ability fires at the start of the last round.
 * - Unhold (Auto fire back on) returns a held ability to its default round. Only allowed while it is
 *   held and unused, and before its default round (`not_held`, `already_fired`, `hold_too_late`).
 * - `zone` (Shield Wall) and `element` (Re-mark) go with Fire only, and only for those abilities.
 */
export function applyAction(
  sql: SqlStorage,
  row: LiveRow,
  userId: string,
  body: ActionInput,
  now: number,
): AppliedAction | null {
  const member = row.members.find((m) => m.userId === userId);
  if (member === undefined) throw new RaidError(409, 'not_in_fight');
  // A practice fight is a lobby until its start: the Auto fire preference is changed there instead.
  if (now < row.startedAt) throw new RaidError(409, 'not_started');
  // A key that does not exist is treated like someone else's: the caller learns nothing about it.
  const ability = row.abilities.find((a) => a.key === body.key);
  if (ability === undefined || ability.alias !== member.alias) {
    throw new RaidError(409, 'not_your_ability');
  }
  const def = content.finaleAbilities.find((a) => a.id === ability.abilityId);
  if (def === undefined) throw new RaidError(409, 'not_your_ability');

  // Parameters belong to Fire, and only to the abilities that take them.
  const takesZone = def.effects.some((e) => e.op === 'shield_wall' && e.zone === 'choose');
  const takesElement = def.effects.some((e) => e.op === 're_mark' && e.element === 'choose');
  if (body.action !== 'fire' && (body.zone !== undefined || body.element !== undefined)) {
    throw new RaidError(400, 'invalid_body');
  }
  if ((body.zone !== undefined && !takesZone) || (body.element !== undefined && !takesElement)) {
    throw new RaidError(400, 'invalid_body');
  }

  const state = evaluate(row, now);
  const firedNow = firedRound(state.result, ability.key, state.clockRound) !== null;
  // The last round is the 12th, or the one the boss falls in: Fire is too late from its start on.
  const over = state.ended || state.clockRound >= Math.min(row.rounds, state.result.rounds);
  const defaultRound = defaultAbilityRound(row.input.boss, def, row.rounds);
  if (body.action === 'fire') {
    // The last round and the end are too late for anything, whatever the ability did before.
    if (over) throw new RaidError(409, 'too_late');
    if (ability.mode === 'fired' || firedNow) throw new RaidError(409, 'already_fired');
    ability.mode = 'fired';
    ability.fireAtRound = state.clockRound + 1;
    const params: { zone?: Zone; element?: Element } = {};
    if (body.zone !== undefined) params.zone = body.zone;
    if (body.element !== undefined) params.element = body.element;
    ability.params = Object.keys(params).length === 0 ? null : params;
  } else if (body.action === 'unhold') {
    if (ability.mode === 'fired') throw new RaidError(409, 'already_fired');
    if (ability.mode !== 'held') throw new RaidError(409, 'not_held');
    if (firedNow) throw new RaidError(409, 'already_fired');
    if (over || state.clockRound >= defaultRound) throw new RaidError(409, 'hold_too_late');
    ability.mode = 'default';
  } else {
    if (ability.mode === 'fired') throw new RaidError(409, 'already_fired');
    if (ability.mode === 'held') {
      if (firedNow) throw new RaidError(409, 'already_fired');
      return null; // already held: nothing to change
    }
    if (over || state.clockRound >= defaultRound) throw new RaidError(409, 'hold_too_late');
    ability.mode = 'held';
  }
  sql.exec(
    'UPDATE raid_live SET abilities = ? WHERE week_id = ? AND party = ? AND practice = ?',
    JSON.stringify(row.abilities),
    row.weekId,
    row.party,
    row.practice ? 1 : 0,
  );
  return {
    action: body.action,
    abilityId: ability.abilityId,
    round: body.action === 'fire' ? (ability.fireAtRound ?? state.clockRound) : state.clockRound,
    defaultRound,
  };
}

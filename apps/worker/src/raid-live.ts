/**
 * The live Sunday finale: the state machine. The server is authoritative and the fight is derived
 * from the clock, so nothing ticks and nothing has to be broadcast:
 *
 * - At the finale event, each party gets a `raid_live` row: the frozen fight input, a seed drawn from
 *   live randomness (never sent to a client before the fight has resolved) and each member's
 *   ability state.
 * - The current round is `min(rounds, floor((now - started_at) / round_ms) + 1)`. A read re-runs the
 *   engine on the stored input with the abilities known so far and shows rounds 1..round. That is
 *   consistent because of the engine's prefix property: rounds 1..r depend only on the abilities that
 *   fire in rounds 1..r, and Fire only ever sets a round after the current one.
 * - Fire and Hold are written in a transaction, with the round taken from the clock at that moment.
 * - The fight ends once its last round has played, or as soon as the rounds shown include the boss
 *   falling. It then resolves once through `settleParty` (Essence, jackpot rolls with fresh live
 *   randomness, server firsts, the Discord post). The result row is the done marker.
 *
 * A practice fight (staging only) is the same fight with its own row, no payout and no result.
 */
import { content, createSeededRng, type Element, type Rng } from '@creatures/game';
import {
  defaultAbilityRound,
  simulateFight,
  type AbilityChoice,
  type FightInput,
  type FightResult,
  type Zone,
} from '@creatures/engine';
import type { LedgerStorage } from './ledger';
import { basicKey, buildPhaseInput, drawSeed, settleParty } from './raid-resolve';
import { RaidError } from './raid-teams';

/** One round of the live finale. */
export const LIVE_ROUND_MS = 10_000;
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
  roundMs: number;
  rounds: number;
}

export interface LiveDeps {
  storage: LedgerStorage;
  now: () => number;
  rng: Rng;
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
};

const COLUMNS =
  'week_id, party, practice, seed, input, members, abilities, started_at, round_ms, rounds';

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
  /** The last round has played. */
  timeUp: boolean;
  /** Over: the time is up, or the rounds shown include the boss falling (or everyone knocked out). */
  ended: boolean;
  /** The engine input including the abilities known so far. */
  input: FightInput;
  /** The whole fight with the abilities known so far (only rounds up to `clockRound` are certain). */
  result: FightResult;
}

/** Derives the state of a fight at `now`: the round from the clock, the fight from the engine. */
export function evaluate(row: LiveRow, now: number): LiveState {
  const elapsed = Math.max(0, now - row.startedAt);
  const clockRound = Math.min(row.rounds, Math.floor(elapsed / row.roundMs) + 1);
  const timeUp = elapsed >= row.rounds * row.roundMs;
  let input: FightInput = { ...row.input, finaleAbilities: engineAbilities(row) };
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
  const ended =
    timeUp ||
    (result.rounds <= clockRound && (result.bossHpEnd === 0 || result.rounds < row.rounds));
  return { clockRound, timeUp, ended, input, result };
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
    mode: 'default',
    fireAtRound: null,
    params: null,
  }));
  sql.exec(
    `INSERT OR REPLACE INTO raid_live (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  );
}

/** Starts a practice fight for a party, replacing its earlier one. Call inside a transaction. */
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

/** Real fights that have not resolved yet, with the time their last round ends. */
export function unresolvedReal(
  sql: SqlStorage,
): { weekId: string; party: number; endsAt: number }[] {
  return sql
    .exec<{ week_id: string; party: number; ends_at: number }>(
      `SELECT l.week_id AS week_id, l.party AS party, l.started_at + l.rounds * l.round_ms AS ends_at
       FROM raid_live l
       WHERE l.practice = 0
         AND NOT EXISTS (SELECT 1 FROM raid_results r
                         WHERE r.week_id = l.week_id AND r.party = l.party AND r.phase = 'finale')
       ORDER BY ends_at, l.week_id, l.party`,
    )
    .toArray()
    .map((r) => ({ weekId: r.week_id, party: r.party, endsAt: r.ends_at }));
}

export interface ActionInput {
  /** The engine key of one of the caller's own ability uses (see `LiveAbility.key`). */
  key: string;
  action: 'fire' | 'hold';
  zone?: Zone | undefined;
  element?: Element | undefined;
}

/**
 * Fire or Hold for one of the caller's abilities (`body.key`). Throws a `RaidError` (rolling the transaction back) for
 * anything the rules refuse; call it inside a transaction.
 *
 * - Fire takes effect at the start of the next round. Refused with `too_late` in the last round or
 *   after the end, and with `already_fired` once the ability has fired or been fired.
 * - Hold keeps an ability past its default round. Only allowed before the default round
 *   (`hold_too_late` otherwise), and an unused held ability fires at the start of the last round.
 * - `zone` (Shield Wall) and `element` (Re-mark) go with Fire only, and only for those abilities.
 */
export function applyAction(
  sql: SqlStorage,
  row: LiveRow,
  userId: string,
  body: ActionInput,
  now: number,
): void {
  const member = row.members.find((m) => m.userId === userId);
  if (member === undefined) throw new RaidError(409, 'not_in_fight');
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
  if (body.action === 'hold' && (body.zone !== undefined || body.element !== undefined)) {
    throw new RaidError(400, 'invalid_body');
  }
  if ((body.zone !== undefined && !takesZone) || (body.element !== undefined && !takesElement)) {
    throw new RaidError(400, 'invalid_body');
  }

  const state = evaluate(row, now);
  const firedNow = firedRound(state.result, ability.key, state.clockRound) !== null;
  const over = state.ended || state.clockRound >= row.rounds;
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
  } else {
    if (ability.mode === 'fired') throw new RaidError(409, 'already_fired');
    if (ability.mode === 'held') {
      if (firedNow) throw new RaidError(409, 'already_fired');
      return; // already held: nothing to change
    }
    const defaultRound = defaultAbilityRound(row.input.boss, def, row.rounds);
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
}

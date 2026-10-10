/**
 * The read model of the live finale: one full snapshot per request, so a client that missed a poll
 * or reconnected just catches up. Only display data leaves here: players appear by display name and
 * the engine's opaque keys (`m1`, ...), never by user id, and the seed is never included.
 */
import { content } from '@creatures/game';
import {
  buildNames,
  defaultAbilityRound,
  type EventNames,
  type FightEvent,
} from '@creatures/engine';
import { bossFor, type StoredSummary } from './raid-resolve';
import { jackpotOf } from './raid-reveal';
import {
  LIVE_ROUND_MS,
  firedRound,
  type AbilityMode,
  type LiveRow,
  type LiveState,
} from './raid-live';
import type { ReplayView } from './raid-view';

export type LiveStatus = 'none' | 'lobby' | 'live' | 'done';

export interface LiveAbilityView {
  alias: string;
  abilityId: string;
  mode: AbilityMode;
  fired: boolean;
  firedAtRound: number | null;
  /** Mode 'fired' and not yet fired: the round it will fire in. */
  fireAtRound: number | null;
  /** The round it fires in if nobody touches it (the engine's own default). */
  defaultRound: number;
}

export interface LiveLoot {
  cleared: boolean;
  essence: number;
  jackpot: null | { essence: number; firstOnServer: boolean };
  /** Raids taken part in without a jackpot, after this one. Private. */
  pity: number;
}

export interface LiveSnapshot {
  status: LiveStatus;
  /** A practice fight: no payout, no result. */
  practice: boolean;
  week: string;
  /** The caller's party, or null if they are not in the roster. */
  party: number | null;
  /** The caller's opaque player key in this fight (see `names.players`), or null. */
  you: string | null;
  /** When the fight starts (lobby) or started (live, done). Null when there is no finale soon. */
  startsAt: number | null;
  roundMs: number;
  rounds: number;
  /** The round that is playing (0 before the start). */
  round: number;
  serverNow: number;
  boss: {
    id: string;
    name: string;
    element: string;
    hpMax: number | null;
    hpStart: number | null;
  };
  /** The frozen fighting row, left to right (empty before the start). */
  row: ReplayView['row'];
  names: EventNames | null;
  abilities: LiveAbilityView[];
  /** Every event of rounds 1..round. */
  events: FightEvent[];
  bossHp: number | null;
  /** Display names of the players who polled in the last 10 seconds. */
  watching: string[];
  /** The caller's own loot once the fight is done. */
  loot: LiveLoot | null;
}

export interface LiveContext {
  sql: SqlStorage;
  now: number;
  weekId: string;
  bossId: string;
  party: number | null;
  userId: string;
  names: ReadonlyMap<string, string>;
  watching: string[];
}

/** The snapshot of a week with no fight to show: nothing soon, or the lobby. */
export function emptySnapshot(
  ctx: LiveContext,
  status: 'none' | 'lobby',
  startsAt: number | null,
): LiveSnapshot {
  const boss = bossFor(ctx.bossId);
  const pool =
    ctx.party === null
      ? undefined
      : ctx.sql
          .exec<{ hp_max: number | null; hp_current: number | null }>(
            'SELECT hp_max, hp_current FROM raid_parties WHERE week_id = ? AND party = ?',
            ctx.weekId,
            ctx.party,
          )
          .toArray()[0];
  return {
    status,
    practice: false,
    week: ctx.weekId,
    party: ctx.party,
    you: null,
    startsAt,
    roundMs: LIVE_ROUND_MS,
    rounds: boss.finaleRounds,
    round: 0,
    serverNow: ctx.now,
    boss: {
      id: boss.id,
      name: boss.name,
      element: boss.element,
      hpMax: status === 'lobby' ? (pool?.hp_max ?? null) : null,
      hpStart: status === 'lobby' ? (pool?.hp_current ?? null) : null,
    },
    row: [],
    names: null,
    abilities: [],
    events: [],
    bossHp: null,
    watching: status === 'lobby' ? ctx.watching : [],
    loot: null,
  };
}

/** The caller's own loot from a resolved real finale, or null if they were not in it. */
function realLoot(ctx: LiveContext, row: LiveRow): LiveLoot | null {
  const stored = ctx.sql
    .exec<{ summary: string }>(
      "SELECT summary FROM raid_results WHERE week_id = ? AND party = ? AND phase = 'finale'",
      row.weekId,
      row.party,
    )
    .toArray()[0];
  if (stored === undefined) return null;
  const summary = JSON.parse(stored.summary) as StoredSummary;
  if (!summary.members.some((m) => m.userId === ctx.userId)) return null;
  return {
    cleared: summary.cleared,
    essence: summary.essence[ctx.userId] ?? 0,
    jackpot: jackpotOf(ctx.sql, ctx.userId, row.weekId, summary),
    pity: pityOf(ctx.sql, ctx.userId),
  };
}

export function pityOf(sql: SqlStorage, userId: string): number {
  return (
    sql
      .exec<{ counter: number }>('SELECT counter FROM jackpot_pity WHERE user_id = ?', userId)
      .toArray()[0]?.counter ?? 0
  );
}

/**
 * The snapshot of a stored fight. `resolved` is true once a real fight's result is stored (a
 * practice fight is done as soon as it is over). A fight that is over but not resolved yet (the
 * resolution failed) still shows as live, and is retried on the next read.
 */
export function liveSnapshot(
  ctx: LiveContext,
  row: LiveRow,
  state: LiveState,
  resolved: boolean,
): LiveSnapshot {
  const done = row.practice ? state.ended : resolved;
  const { result } = state;
  const round = done
    ? Math.min(state.clockRound, result.rounds)
    : Math.min(state.clockRound, row.rounds);
  const events = result.events.filter((e) => e.round <= state.clockRound);
  let bossHp: number = row.input.bossHpPool.current;
  for (const e of events) if (e.t === 'round_end') bossHp = e.bossHp;

  const me = row.members.find((m) => m.userId === ctx.userId);
  const aliasNames: Record<string, string> = {};
  for (const m of row.members) aliasNames[m.alias] = ctx.names.get(m.userId) ?? 'Unknown';
  const abilities: LiveAbilityView[] = row.abilities.map((a) => {
    const def = content.finaleAbilities.find((d) => d.id === a.abilityId);
    const firedAtRound = firedRound(result, a.alias, state.clockRound);
    return {
      alias: a.alias,
      abilityId: a.abilityId,
      mode: a.mode,
      fired: firedAtRound !== null,
      firedAtRound,
      fireAtRound: a.mode === 'fired' && firedAtRound === null ? a.fireAtRound : null,
      defaultRound: def === undefined ? 0 : defaultAbilityRound(row.input.boss, def, row.rounds),
    };
  });

  let loot: LiveLoot | null = null;
  if (done && me !== undefined) {
    loot = row.practice
      ? {
          cleared: result.cleared,
          essence: 0,
          jackpot: null,
          pity: pityOf(ctx.sql, ctx.userId),
        }
      : realLoot(ctx, row);
  }

  return {
    status: done ? 'done' : 'live',
    practice: row.practice,
    week: row.weekId,
    party: row.party,
    you: me?.alias ?? null,
    startsAt: row.startedAt,
    roundMs: row.roundMs,
    rounds: row.rounds,
    round,
    serverNow: ctx.now,
    boss: {
      id: row.input.boss.id,
      name: row.input.boss.name,
      element: row.input.boss.element,
      hpMax: row.input.bossHpPool.max,
      hpStart: row.input.bossHpPool.current,
    },
    row: row.input.row.map((s, position) => ({
      position,
      id: s.id,
      name: s.name,
      species: s.speciesId,
      element: s.element,
      role: s.role,
      level: s.level,
      owner: s.ownerId,
    })),
    names: buildNames(row.input, aliasNames, content),
    abilities,
    events,
    bossHp,
    watching: ctx.watching,
    loot,
  };
}

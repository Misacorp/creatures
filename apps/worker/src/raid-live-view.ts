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
  type FightInput,
} from '@creatures/engine';
import { readFestivalGrant, type FestivalGrantView } from './raid-festival';
import { fightRank, rankChangeOf, type RankChangeView } from './raid-ladder';
import { bossFor, guardRulesOf, type StoredSummary } from './raid-resolve';
import { totalEssenceOf } from './raid-reveal';
import {
  PACING_CONTENT,
  firedRound,
  scheduleRounds,
  type AbilityMode,
  type LiveRow,
  type LiveState,
} from './raid-live';
import type { ReplayView } from './raid-view';

export type LiveStatus = 'none' | 'lobby' | 'live' | 'done';

/** One use of an ability: a member's basic ability or one of their creatures' abilities. */
export interface LiveAbilityView {
  /** Unique in the fight; the caller sends it to Fire or Hold their own ability. */
  key: string;
  alias: string;
  abilityId: string;
  /** The row slot (creature id) of a creature ability; null for a basic ability. */
  creature: string | null;
  mode: AbilityMode;
  /**
   * Auto fire is on: true unless the owner turned it off (mode 'held'). In the lobby this is the
   * owner's preference for the start; once the fight is on it follows the toggle.
   */
  autoFire: boolean;
  fired: boolean;
  firedAtRound: number | null;
  /** Mode 'fired' and not yet fired: the round it will fire in. */
  fireAtRound: number | null;
  /** The round it fires in if nobody touches it (the engine's own default). */
  defaultRound: number;
}

export interface LiveLoot {
  cleared: boolean;
  /** All the Essence the finale paid the caller, jackpot included (the jackpot itself is hidden). */
  essence: number;
  /** What the finale did to the server's rank; null until the ladder has moved (and in practice). */
  rankChange: RankChangeView | null;
  /** The Festival creature the caller got, or null. */
  festivalGrant: FestivalGrantView | null;
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
  /**
   * The fixed round length of a fight stored before content pacing; null for every other state.
   * Rounds are as long as their content now: use `roundStarts` and `nextRoundAt`.
   */
  roundMs: number | null;
  /**
   * The finale's regular rounds. In an enrage (`enrage` events) `round` goes past it, by up to the
   * enrage's rounds; the fight then ends on a wipe or after the last enrage round.
   */
  rounds: number;
  /** The round that is playing (0 before the start). */
  round: number;
  /**
   * When each round started, for rounds 1..`round` (UTC ms). Rounds last as long as their events take
   * to play (`roundPlaybackMs`, 6 to 22 seconds), so round r+1 starts that long after round r.
   */
  roundStarts: number[];
  /**
   * When the state next changes, for the countdown and the client's next poll: the start of the next
   * round, or the end of the fight during its last round. In the lobby it is the start. Null when there
   * is nothing to wait for (no finale soon, or the fight is over).
   */
  nextRoundAt: number | null;
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
  /** The Guard numbers the fight is played with. Null: none known (no row yet, or an old fight). */
  rules: ReplayView['rules'];
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
  const boss = bossFor(ctx.bossId, fightRank(ctx.sql, ctx.weekId));
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
    roundMs: null,
    rounds: boss.finaleRounds,
    round: 0,
    roundStarts: [],
    nextRoundAt: status === 'lobby' ? startsAt : null,
    serverNow: ctx.now,
    boss: {
      id: boss.id,
      name: boss.name,
      element: boss.element,
      hpMax: status === 'lobby' ? (pool?.hp_max ?? null) : null,
      hpStart: status === 'lobby' ? (pool?.hp_current ?? null) : null,
    },
    row: [],
    rules: null,
    names: null,
    abilities: [],
    events: [],
    bossHp: null,
    watching: status === 'lobby' ? ctx.watching : [],
    loot: null,
  };
}

/** One ability of the caller as the lobby previews it: what they will bring and its Auto fire setting. */
export interface PreviewAbility {
  key: string;
  alias: string;
  abilityId: string;
  creatureId: string | null;
  /** Auto fire is off for this ability. */
  held: boolean;
}

/** What a lobby with a preview is made of: the row as it would fight now and the caller's abilities. */
export interface LobbyPreview {
  /** The fight input as it would be built now (or as it was built, for a practice fight). */
  input: FightInput;
  members: readonly { alias: string; userId: string }[];
  abilities: readonly PreviewAbility[];
}

/**
 * The lobby with a preview of the stage: the caller's party's row as it stands (from the teams and
 * placements now, or as frozen for a practice fight), the boss with the pool it would fight, and only
 * the caller's own abilities with their Auto fire setting. There are no events and no round yet. The
 * preview is not a promise: until the start, teams, placements and picks can still change.
 */
export function lobbySnapshot(
  ctx: LiveContext,
  startsAt: number,
  practice: boolean,
  preview: LobbyPreview,
): LiveSnapshot {
  const { input } = preview;
  const me = preview.members.find((m) => m.userId === ctx.userId);
  const aliasNames: Record<string, string> = {};
  for (const m of preview.members) aliasNames[m.alias] = ctx.names.get(m.userId) ?? 'Unknown';
  const mine: LiveAbilityView[] =
    me === undefined
      ? []
      : preview.abilities
          .filter((a) => a.alias === me.alias)
          .map((a) => {
            const def = content.finaleAbilities.find((d) => d.id === a.abilityId);
            return {
              key: a.key,
              alias: a.alias,
              abilityId: a.abilityId,
              creature: a.creatureId,
              mode: a.held ? 'held' : 'default',
              autoFire: !a.held,
              fired: false,
              firedAtRound: null,
              fireAtRound: null,
              defaultRound:
                def === undefined
                  ? 0
                  : defaultAbilityRound(input.boss, def, input.boss.finaleRounds),
            };
          });
  return {
    status: 'lobby',
    practice,
    week: ctx.weekId,
    party: ctx.party,
    you: me?.alias ?? null,
    startsAt,
    roundMs: null,
    rounds: input.boss.finaleRounds,
    round: 0,
    roundStarts: [],
    nextRoundAt: startsAt,
    serverNow: ctx.now,
    boss: {
      id: input.boss.id,
      name: input.boss.name,
      element: input.boss.element,
      hpMax: input.bossHpPool.max,
      hpStart: input.bossHpPool.current,
    },
    row: input.row.map((s, position) => ({
      position,
      id: s.id,
      name: s.name,
      species: s.speciesId,
      element: s.element,
      role: s.role,
      level: s.level,
      owner: s.ownerId,
    })),
    rules: guardRulesOf(input),
    names: buildNames(input, aliasNames, content),
    abilities: mine,
    events: [],
    bossHp: input.bossHpPool.current,
    watching: ctx.watching,
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
    essence: totalEssenceOf(ctx.sql, ctx.userId, row.weekId, summary),
    rankChange: rankChangeOf(ctx.sql, row.weekId),
    festivalGrant: readFestivalGrant(ctx.sql, row.weekId, ctx.userId),
  };
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
    : Math.min(state.clockRound, scheduleRounds(row));
  const events = result.events.filter((e) => e.round <= state.clockRound);
  let bossHp: number = row.input.bossHpPool.current;
  for (const e of events) if (e.t === 'round_end') bossHp = e.bossHp;

  const me = row.members.find((m) => m.userId === ctx.userId);
  const aliasNames: Record<string, string> = {};
  for (const m of row.members) aliasNames[m.alias] = ctx.names.get(m.userId) ?? 'Unknown';
  const abilities: LiveAbilityView[] = row.abilities.map((a) => {
    const def = content.finaleAbilities.find((d) => d.id === a.abilityId);
    const firedAtRound = firedRound(result, a.key, state.clockRound);
    return {
      key: a.key,
      alias: a.alias,
      abilityId: a.abilityId,
      creature: a.creatureId,
      mode: a.mode,
      autoFire: a.mode !== 'held',
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
          rankChange: null,
          festivalGrant: null,
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
    roundMs: row.pacing < PACING_CONTENT ? row.roundMs : null,
    rounds: row.rounds,
    round,
    roundStarts: state.roundStarts.slice(0, round),
    nextRoundAt: done ? null : state.nextRoundAt,
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
    rules: guardRulesOf(row.input),
    names: buildNames(row.input, aliasNames, content),
    abilities,
    events,
    bossHp,
    watching: ctx.watching,
    loot,
  };
}

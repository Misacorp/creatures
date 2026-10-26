/**
 * Read models of the raid for the API. Only display data leaves here: players appear by display
 * name and a `you` / `mine` flag, never by user id, and creature ids are only given for the
 * caller's own creatures.
 */
import {
  buildNames,
  guardReachOf,
  zoneOfIndex,
  type GuardReach,
  type EventNames,
  type FightEvent,
  type FightInput,
  type FightResult,
  type FightSlot,
  type Zone,
} from '@creatures/engine';
import { RULES, content, seasonOf, type ReadinessBand } from '@creatures/game';
import { BASIC_TARGET, loadAutofire } from './raid-autofire';
import { readFestivalGrant, type FestivalGrantView } from './raid-festival';
import {
  fightRank,
  rankChangeOf,
  readLadder,
  readWeekProgression,
  type RankChangeView,
} from './raid-ladder';
import type { Raid } from './raid';
import {
  abilityFor,
  aliasFor,
  basicKey,
  buildPartyBoard,
  bossFor,
  creatureKey,
  guardRulesOf,
  boardOf,
  outcomeFlags,
  type StoredSummary,
} from './raid-resolve';
import { latestReveal, totalEssenceOf, type RevealView } from './raid-reveal';
import { partyMembers, partyOf, partyToJoin } from './raid-roster';
import {
  RAID_PHASES,
  addWeeks,
  isWeekId,
  weekIndex,
  type RaidEvent,
  type RaidPhase,
} from './raid-schedule';
import type { RaidStatus, TeamCreature } from './raid-teams';

export interface RosterEntry {
  displayName: string;
  you: boolean;
  party: number;
}

/** One ability the caller will bring to the finale (or could, once the creature is trained). */
export interface AbilityPreview {
  /** The engine key it will have in the fight. Absent for a locked ability (it will not be there). */
  key?: string;
  abilityId: string;
  /** The team creature it belongs to (the caller's own); null for the basic ability. */
  creatureId: string | null;
  /** The creature's species; null for the basic ability. */
  species: string | null;
  unlocked: boolean;
  /** The creature level that unlocks it (1 for the basic ability: always there). */
  unlockLevel: number;
  /** The caller's Auto fire setting for the finale (on unless they turned it off). */
  autoFire: boolean;
}

/**
 * What the caller brings with their placed creatures: the basic ability, then one entry for
 * each placed creature whose species has an ability (locked ones too, so the client can show when
 * they unlock). Empty when the caller has not joined.
 */
function abilityPreview(
  basic: { abilityId: string } | null,
  alias: string | null,
  team: readonly TeamCreature[] | null,
  autoFire: (target: string) => boolean,
): AbilityPreview[] {
  if (basic === null || alias === null || team === null) return [];
  const out: AbilityPreview[] = [
    {
      key: basicKey(alias),
      abilityId: basic.abilityId,
      creatureId: null,
      species: null,
      unlocked: true,
      unlockLevel: 1,
      autoFire: autoFire(BASIC_TARGET),
    },
  ];
  team.forEach((c, index) => {
    const abilityId = c.species.ability?.id;
    if (abilityId === undefined) return;
    const unlocked = c.level >= RULES.abilities.unlockLevel;
    out.push({
      ...(unlocked ? { key: creatureKey(alias, index) } : {}),
      abilityId,
      creatureId: c.id,
      species: c.species.id,
      unlocked,
      unlockLevel: RULES.abilities.unlockLevel,
      autoFire: autoFire(c.id),
    });
  });
  return out;
}

export interface RowSlotView {
  slot: number;
  zone: Zone;
  creature: null | {
    ownerName: string;
    species: string;
    name: string;
    level: number;
    mine: boolean;
    /** Only for the caller's own creatures. */
    creatureId?: string;
    /** A Guard's reach (`guardReachOf`: how many creatures it protects on each side); Guards only. */
    reach?: GuardReach;
  };
}

/**
 * The creature of one board cell as the row shows it: the one place that decides what a cell says, used
 * by the view's whole row and by the live board's one-cell pushes (`raid-board-change.ts`). The creature
 * id is only for the viewer's own creatures.
 */
export function cellCreature(
  fight: FightSlot,
  ownerName: string,
  mine: boolean,
): NonNullable<RowSlotView['creature']> {
  return {
    ownerName,
    species: fight.speciesId,
    name: fight.name,
    level: fight.level,
    mine,
    ...(mine ? { creatureId: fight.id } : {}),
    ...reachField(fight.role, fight.mods),
  };
}

/** A Guard's reach for a view (absent for the other roles), from the modifier sheet its fight uses. */
function reachField(
  role: string,
  mods: Parameters<typeof guardReachOf>[0],
): { reach?: GuardReach } {
  return role === 'guard' ? { reach: guardReachOf(mods) } : {};
}

export interface PhaseResultView {
  phase: RaidPhase;
  at: number;
  cleared: boolean;
  /** The boss reached the phase floor and retreated (a cleared Phase 1 or 2). False for older results. */
  retreated: boolean;
  /** The finale went into enrage rounds. False for older results. */
  enraged: boolean;
  rounds: number;
  bossHpMax: number;
  bossHpStart: number;
  bossHpEnd: number;
  /** Total damage the party's players dealt in this phase. */
  damage: number;
  /** Reactions that happened in this phase. */
  reactions: number;
  /** The best contributors by display name (at most three). */
  top: { displayName: string; damage: number; contribution: number; you: boolean }[];
  /** Essence the caller earned in this phase (the finale's includes the hidden jackpot Essence). */
  essence: number;
  /** Finale only: what it did to the server's rank; null until the ladder has moved, and for phases. */
  rankChange: RankChangeView | null;
  /** Finale only: the Festival creature the caller got; null otherwise. */
  festivalGrant: FestivalGrantView | null;
}

export interface RaidView {
  weekId: string;
  status: RaidStatus;
  timezone: string;
  boss: {
    id: string;
    name: string;
    element: string;
    turnOrder: string;
    /** The moves in play at the week's rank. `fromRank`: the rank a rank-gated move starts at. */
    gimmicks: { id: string; name: string; fromRank?: number }[];
    finaleRounds: number;
    /**
     * The boss's own lines for the moment it retreats at a phase floor; null when it has none (the
     * client then uses its shared line). Plain text.
     */
    retreat: { phase1: string; phase2: string } | null;
  };
  /**
   * The server's Boss Rank this week (what rewards follow); null for a week that was already open
   * when ranks were introduced (it keeps its old rules) and while a new server has nobody in yet.
   */
  rank: number | null;
  /** The rank the boss fights at: the rank, or lower in a Festival week. Null with `rank`. */
  effectiveRank: number | null;
  /** A Festival week: an easier boss, bonus Essence, and a creature for every winner. */
  festival: boolean;
  /** The Festival creature's species id of a Festival week; null otherwise. */
  festivalCreature: string | null;
  /** Where the week sits in its 5-week season (`week` is 1 to 5, the 5th is the Festival); null for an old week. */
  season: { index: number; week: number } | null;
  /** The highest rank the server has cleared in a normal week; null until it has cleared one. */
  bestRank: number | null;
  schedule: Record<RaidEvent, number>;
  /** The next event that has not run yet. */
  next: { event: RaidEvent; at: number } | null;
  serverNow: number;
  roster: RosterEntry[];
  parties: { party: number; size: number }[];
  you: {
    /** The caller joined this week's raid (they placed a creature). */
    inRoster: boolean;
    party: number | null;
    /**
     * The caller may change their placement: they joined, or joining is still open (before Phase 1) and
     * their first placement will join them. False once the finale has started.
     */
    canEdit: boolean;
    /**
     * The caller's finale ability: their pick (`chosen`) or the default they get if they pick
     * nothing. It can be changed (`PUT /api/raid/ability`) until the finale starts. Null when the
     * caller has not joined or has no creature on the board.
     */
    ability: { abilityId: string; chosen: boolean } | null;
    /** Everything the caller brings to the finale with their current team (see `AbilityPreview`). */
    abilities: AbilityPreview[];
    /**
     * The loot reveal of the latest finale the caller took part in, until they mark it seen
     * (`POST /api/raid/reveal-seen`). Only the caller's own.
     */
    reveal: RevealView | null;
    /**
     * The creatures the caller brings: exactly the ones placed on the board (up to three). Null when
     * the caller has not joined.
     */
    team: {
      creatures: {
        creatureId: string;
        species: string;
        name: string;
        level: number;
        slot: number;
        /** A Guard's reach (how many creatures it protects on each side); Guards only. */
        reach?: GuardReach;
      }[];
    } | null;
  };
  /**
   * The caller's party, or, for a player who has not joined while joining is open, the party they
   * would join (its board, empty slots where nobody placed). Null once joining has closed for them.
   */
  party: null | {
    party: number;
    rowLength: number;
    /** Slots: only what players placed (guests are not drawn). */
    row: RowSlotView[];
    guests: boolean;
    bossHp: { max: number; current: number } | null;
    /** The boss's phase 2 counter-move, once phase 1 has resolved. */
    adaptation: { description: string; rule: string | null; target: string | null } | null;
    results: PhaseResultView[];
    /**
     * How ready the party's team looks: a vague band, never a number. Null when there is none (the
     * finale has started or resolved).
     */
    readiness: ReadinessBand | null;
  };
}

const PHASE_ORDER: readonly RaidStatus[] = ['open', 'phase1', 'phase2', 'finale'];

/** The first phase event a week in this status has not run yet (the view's `next`), or undefined. */
export function nextPendingEvent(status: RaidStatus): RaidPhase | undefined {
  return RAID_PHASES.find((p) => PHASE_ORDER.indexOf(p) > PHASE_ORDER.indexOf(status));
}

export function displayNames(sql: SqlStorage): Map<string, string> {
  return new Map(
    sql
      .exec<{ user_id: string; display_name: string }>('SELECT user_id, display_name FROM players')
      .toArray()
      .map((r) => [r.user_id, r.display_name]),
  );
}

/** The current week as the caller sees it. Creates the week if needed. */
export function buildRaidView(
  raid: Raid,
  sql: SqlStorage,
  userId: string,
  tz: string,
  now: number,
): RaidView {
  const week = raid.currentWeek(tz);
  const names = displayNames(sql);
  const boss = bossFor(week.bossId, fightRank(sql, week.weekId));
  const schedule = raid.schedule(week.weekId, tz);
  const pending = nextPendingEvent(week.status);

  const memberRows = sql
    .exec<{ user_id: string; party: number }>(
      'SELECT user_id, party FROM raid_party_members WHERE week_id = ? ORDER BY party, joined_at, rowid',
      week.weekId,
    )
    .toArray();
  const roster: RosterEntry[] = memberRows.map((m) => ({
    displayName: names.get(m.user_id) ?? 'Unknown',
    you: m.user_id === userId,
    party: m.party,
  }));
  const sizes = new Map<number, number>();
  for (const m of memberRows) sizes.set(m.party, (sizes.get(m.party) ?? 0) + 1);
  const parties = [...sizes].map(([party, size]) => ({ party, size }));

  const myParty = partyOf(sql, week.weekId, userId);
  // Joining is open until Phase 1 resolves: a player who has not joined sees the board they would join.
  const joiningOpen =
    week.status === 'open' &&
    sql.exec('SELECT 1 FROM raid_results WHERE week_id = ? LIMIT 1', week.weekId).toArray()
      .length === 0;
  // (Only for a player who has a creature to place.)
  const shownParty =
    myParty ??
    (joiningOpen &&
    sql.exec('SELECT 1 FROM creatures WHERE user_id = ? LIMIT 1', userId).toArray().length > 0
      ? partyToJoin(sql, week.weekId).party
      : null);
  // Exactly the creatures the caller placed (at most three), taken from the party's board below.
  let team: TeamCreature[] | null = null;
  const slotOf = new Map<string, number>();

  let partyView: RaidView['party'] = null;
  let myAbility: { abilityId: string; chosen: boolean } | null = null;
  let myAlias: string | null = null;
  if (shownParty !== null) {
    const members = partyMembers(sql, week.weekId, shownParty);
    // Everyone's team is their placed creatures, loaded by id from the party's placements (read once).
    const board = buildPartyBoard(sql, week.weekId, shownParty, members);
    const length = board.cells.length;
    if (myParty !== null) {
      team = board.teams[board.memberIds.indexOf(userId)] ?? [];
      for (const p of board.placements) if (p.user_id === userId) slotOf.set(p.creature_id, p.slot);
    }
    // The finale's ability and alias follow the members who fight (the same order the fight uses).
    myAbility = myParty === null ? null : abilityFor(sql, week.weekId, board.memberIds, userId);
    const myIndex = board.memberIds.indexOf(userId);
    myAlias = myIndex < 0 ? null : aliasFor(myIndex);
    const row: RowSlotView[] = board.cells.map((cell, slot) => {
      const fight = cell.slot;
      // Guests are not drawn: their slots show as empty, as before.
      if (fight === null || cell.origin === 'guest') {
        return { slot, zone: zoneOfIndex(slot, length), creature: null };
      }
      const ownerId = board.memberIds[board.aliases.indexOf(fight.ownerId as string)] as string;
      const mine = ownerId === userId;
      return {
        slot,
        zone: zoneOfIndex(slot, length),
        creature: cellCreature(fight, names.get(ownerId) ?? 'Unknown', mine),
      };
    });
    const pool = sql
      .exec<{
        hp_max: number | null;
        hp_current: number | null;
        adaptation_rule: string | null;
        adaptation_target: string | null;
        adaptation_description: string | null;
      }>(
        `SELECT hp_max, hp_current, adaptation_rule, adaptation_target, adaptation_description
         FROM raid_parties WHERE week_id = ? AND party = ?`,
        week.weekId,
        shownParty,
      )
      .toArray()[0];
    const results = sql
      .exec<{ phase: RaidPhase; summary: string; created_at: number }>(
        'SELECT phase, summary, created_at FROM raid_results WHERE week_id = ? AND party = ?',
        week.weekId,
        shownParty,
      )
      .toArray()
      .sort((a, b) => RAID_PHASES.indexOf(a.phase) - RAID_PHASES.indexOf(b.phase))
      .map((r) =>
        resultView(
          sql,
          week.weekId,
          r.phase,
          JSON.parse(r.summary) as StoredSummary,
          r.created_at,
          userId,
          names,
        ),
      );
    partyView = {
      party: shownParty,
      rowLength: length,
      row,
      guests: board.memberIds.length < RULES.combat.guestsBelowPlayers,
      bossHp:
        pool === undefined || pool.hp_max === null || pool.hp_current === null
          ? null
          : { max: pool.hp_max, current: pool.hp_current },
      adaptation:
        pool === undefined || pool.adaptation_description === null
          ? null
          : {
              description: pool.adaptation_description,
              rule: pool.adaptation_rule,
              target: pool.adaptation_target,
            },
      results,
      readiness: raid.readiness(week, shownParty),
    };
  }

  const progression = readWeekProgression(sql, week.weekId);
  const autofire = loadAutofire(sql, week.weekId);

  return {
    weekId: week.weekId,
    status: week.status,
    timezone: tz,
    boss: {
      id: boss.id,
      name: boss.name,
      element: boss.element,
      turnOrder: boss.turnOrder,
      gimmicks: boss.gimmicks.map((g) => ({
        id: g.id,
        name: g.name,
        ...(g.fromRank === undefined ? {} : { fromRank: g.fromRank }),
      })),
      finaleRounds: boss.finaleRounds,
      retreat: boss.retreat === undefined ? null : { ...boss.retreat },
    },
    rank: progression?.rank ?? null,
    effectiveRank: progression?.effectiveRank ?? null,
    festival: progression?.festival === true,
    festivalCreature: progression?.festivalSpecies ?? null,
    season:
      progression === null
        ? null
        : {
            index: progression.seasonIndex,
            week: seasonOf(weekIndex(week.weekId)).weekInSeason + 1,
          },
    bestRank: readLadder(sql).bestRank,
    schedule,
    next: pending === undefined ? null : { event: pending, at: schedule[pending] },
    serverNow: now,
    roster,
    parties,
    you: {
      inRoster: myParty !== null,
      party: myParty,
      canEdit: shownParty !== null && week.status !== 'finale',
      ability: myAbility,
      abilities: abilityPreview(myAbility, myAlias, team, (target) =>
        autofire.isOn(userId, target),
      ),
      reveal: latestReveal(sql, userId, addWeeks(week.weekId, -1)),
      team:
        team === null
          ? null
          : {
              creatures: team.map((c) => ({
                creatureId: c.id,
                species: c.species.id,
                name: c.nickname ?? c.species.name,
                level: c.level,
                slot: slotOf.get(c.id) as number,
                ...reachField(c.species.role, c.mods),
              })),
            },
    },
    party: partyView,
  };
}

function resultView(
  sql: SqlStorage,
  weekId: string,
  phase: RaidPhase,
  summary: StoredSummary,
  at: number,
  userId: string,
  names: ReadonlyMap<string, string>,
): PhaseResultView {
  return {
    phase,
    at,
    cleared: summary.cleared,
    retreated: summary.retreated === true,
    enraged: summary.enraged === true,
    rounds: summary.rounds,
    bossHpMax: summary.bossHpMax,
    bossHpStart: summary.bossHpStart,
    bossHpEnd: summary.bossHpEnd,
    damage: summary.damage,
    reactions: summary.reactions,
    top: summary.contributors.slice(0, 3).map((c) => ({
      displayName: names.get(c.userId) ?? 'Unknown',
      damage: c.damage,
      contribution: c.contribution,
      you: c.userId === userId,
    })),
    essence:
      phase === 'finale'
        ? totalEssenceOf(sql, userId, weekId, summary)
        : (summary.essence[userId] ?? 0),
    rankChange: phase === 'finale' ? rankChangeOf(sql, weekId) : null,
    festivalGrant: phase === 'finale' ? readFestivalGrant(sql, weekId, userId) : null,
  };
}

export interface ReplayView {
  weekId: string;
  party: number;
  phase: RaidPhase;
  seed: string;
  at: number;
  boss: { id: string; name: string; retreat: { phase1: string; phase2: string } | null };
  rounds: number;
  cleared: boolean;
  /** The boss reached the phase floor and retreated. False for a fight stored before phase floors. */
  retreated: boolean;
  /** Enrage rounds were played. False for a fight stored before enrage. */
  enraged: boolean;
  bossHpMax: number;
  bossHpStart: number;
  bossHpEnd: number;
  /** The Guard numbers the fight was played with. Null for a fight stored before the Guard rework. */
  rules: { guardHpBp: number; guardArmorBp: number } | null;
  /** Where the row stood on the board (the board's length and each creature's slot); absent for a fight stored before the input carried them. */
  board?: { length: number; slots: number[] };
  /** The caller's opaque owner key in this fight (see `row[].owner`), or null if they were not in it. */
  you: string | null;
  /** The fighting row, left to right (guests included). */
  row: {
    position: number;
    id: string;
    name: string;
    species: string;
    element: string;
    role: string;
    level: number;
    /** An opaque per-fight player key (see `names.players`), or null for a guest. */
    owner: string | null;
    /**
     * Its HP at the start of the fight and at most (the Guard's bonus in), for its small HP bar.
     * Null when no result is known yet (the lobby) or a stored result lacks them.
     */
    hp: { start: number; max: number } | null;
  }[];
  events: FightEvent[];
  /** For `describeEvent`; `players` maps the opaque owner keys to display names. */
  names: EventNames;
}

/**
 * The fighting row as the client draws it, left to right (guests included): each creature's names and
 * kind and, once the fight's result is known, its start and maximum HP (the result has both from the
 * engine, so nothing here reveals what happens in the fight).
 */
export function fightRow(
  input: FightInput,
  result?: Partial<Pick<FightResult, 'hpStart' | 'hpMax'>>,
): ReplayView['row'] {
  return input.row.map((s, position) => {
    const start = result?.hpStart?.[s.id];
    const max = result?.hpMax?.[s.id];
    return {
      position,
      id: s.id,
      name: s.name,
      species: s.speciesId,
      element: s.element,
      role: s.role,
      level: s.level,
      owner: s.ownerId,
      hp: start === undefined || max === undefined ? null : { start, max },
    };
  });
}

/**
 * The stored events of a resolved phase, with names. Null if that phase has not resolved (or the
 * party or week does not exist). Players are opaque keys (`m1`, `m2`, ...) in the events; their
 * display names are in `names.players`.
 */
export function buildReplayView(
  sql: SqlStorage,
  userId: string,
  weekId: string,
  party: number,
  phase: RaidPhase,
): ReplayView | null {
  if (!isWeekId(weekId)) return null;
  const row = sql
    .exec<{ seed: string; input: string; result: string; summary: string; created_at: number }>(
      'SELECT seed, input, result, summary, created_at FROM raid_results WHERE week_id = ? AND party = ? AND phase = ?',
      weekId,
      party,
      phase,
    )
    .toArray()[0];
  // The fight's inputs and events of a week older than last week are emptied (`old-data.ts`).
  if (row === undefined || row.input === '') return null;
  const input = JSON.parse(row.input) as FightInput;
  const result = JSON.parse(row.result) as FightResult;
  const summary = JSON.parse(row.summary) as StoredSummary;
  const players = displayNames(sql);
  const aliasNames: Record<string, string> = {};
  for (const m of summary.members) aliasNames[m.alias] = players.get(m.userId) ?? 'Unknown';
  return {
    weekId,
    party,
    phase,
    seed: row.seed,
    at: row.created_at,
    boss: {
      id: input.boss.id,
      name: input.boss.name,
      retreat: input.boss.retreat === undefined ? null : { ...input.boss.retreat },
    },
    rounds: result.rounds,
    cleared: result.cleared,
    ...outcomeFlags(result),
    bossHpMax: summary.bossHpMax,
    bossHpStart: result.bossHpStart,
    bossHpEnd: result.bossHpEnd,
    rules: guardRulesOf(input),
    ...boardOf(input),
    you: summary.members.find((m) => m.userId === userId)?.alias ?? null,
    row: fightRow(input, result),
    events: result.events,
    names: buildNames(input, aliasNames, content),
  };
}

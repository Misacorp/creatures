/**
 * Raid teams and rows: who fights and where they stand. Shared by the week lifecycle, the phase
 * resolver and the API views. Everything here is synchronous SQL on the guild's database.
 */
import {
  RULES,
  creaturePower,
  strongest,
  effectiveStats,
  type CreatureSpecies,
  type CritBonus,
  type FoldKit,
  type GearMods,
  type GearRules,
  type Stats,
} from '@creatures/game';
import { speciesOf } from './collection';
import { equippedByCreature, wearerOf, wornOnCreatures, type WornBySlot } from './gear-store';
import { foldCreature } from './gear-worn';
import { booksByCreature, booksOfCreatures, foldTalentsOf } from './talent-store';
import type { HeldTalent } from '@creatures/game';

export const RAID_PHASE_STATUSES = ['open', 'phase1', 'phase2', 'finale'] as const;
export type RaidStatus = (typeof RAID_PHASE_STATUSES)[number];

/**
 * A creature as a raid sees it: current stats at the moment of reading, with the items it wears folded
 * in (`applyGear`: Attack, HP, crit and the modifier sheet). Fight inputs are built from these at the moment a phase resolves or the
 * live finale starts and then stored, so later gear changes never touch a fight that was built.
 */
export interface TeamCreature {
  id: string;
  userId: string;
  species: CreatureSpecies;
  level: number;
  fusionCount: number;
  nickname: string | null;
  caughtAt: number;
  /** The stats a fight uses: level, fusion and gear. */
  stats: Stats;
  /** The crit bonus a fight uses (the species' plus gear's); absent when it has neither. */
  crit?: CritBonus;
  /** The modifier sheet its gear fills (`FightSlot.mods`); absent when the gear fills nothing. */
  mods?: GearMods;
  /** What its gear does outside the fight (the dungeon's between-room rest reads it). */
  gearRules: GearRules;
  /** The ids of the gear items folded into `stats`, `crit`, `mods` and `gearRules` (a dungeon run records them). */
  gearIds: string[];
  /** `creaturePower` of `stats` (fusion and gear included). */
  power: number;
  /**
   * What its gear fold needs, to run it again once its place in the row is known (the position lines and
   * gear sets of the row, `placeSlots`): the stats before gear, its crit bonus, who it is, what it wears.
   */
  kit: FoldKit;
}

type CreatureDbRow = {
  id: string;
  user_id: string;
  species: string;
  level: number;
  fusion_count: number;
  nickname: string | null;
  caught_at: number;
};

function toTeamCreature(
  row: CreatureDbRow,
  worn: WornBySlot | undefined,
  book: readonly HeldTalent[] | undefined,
): TeamCreature {
  const species = speciesOf(row.species);
  const talents = foldTalentsOf(row, book);
  const folded = foldCreature(row, worn, talents);
  return {
    id: row.id,
    userId: row.user_id,
    species,
    level: row.level,
    fusionCount: row.fusion_count,
    nickname: row.nickname,
    caughtAt: row.caught_at,
    stats: folded.stats,
    ...(folded.crit === undefined ? {} : { crit: folded.crit }),
    ...(folded.mods === undefined ? {} : { mods: folded.mods }),
    gearRules: folded.rules,
    gearIds: Object.values(worn ?? {}).map((item) => item.id),
    power: creaturePower(folded.stats, folded.mods?.dodgeBp ?? 0),
    kit: {
      stats: effectiveStats(species, row.level, row.fusion_count),
      crit: species.crit,
      wearer: wearerOf(species),
      items: folded.items,
      talents,
    },
  };
}

/**
 * All creatures of a player, oldest first, with their gear and talents folded in. `without` leaves
 * out the worn items with these ids, as if they were not worn: the dungeon loads a creature that joins
 * a run late without any item the run already carries, so one item is never counted twice.
 */
export function loadCreatures(
  sql: SqlStorage,
  userId: string,
  without: ReadonlySet<string> = new Set(),
): TeamCreature[] {
  const worn = equippedByCreature(sql, userId);
  if (without.size > 0) {
    for (const [creatureId, items] of worn) {
      const kept = Object.fromEntries(
        Object.entries(items).filter(([, item]) => !without.has(item.id)),
      ) as WornBySlot;
      worn.set(creatureId, kept);
    }
  }
  const books = booksByCreature(sql, userId);
  return sql
    .exec<CreatureDbRow>(
      'SELECT id, user_id, species, level, fusion_count, nickname, caught_at FROM creatures WHERE user_id = ? ORDER BY caught_at, rowid',
      userId,
    )
    .toArray()
    .map((row) => toTeamCreature(row, worn.get(row.id), books.get(row.id)));
}

/**
 * The automatic team: the player's strongest creatures by power (at most `teamSize`). Ties go to
 * the older creature, then the smaller id, so the pick never depends on storage order.
 *
 * Creatures away on an expedition are NOT excluded: they still fight (see
 * `docs/design/m4-raids.md`, "Away creatures"). Expeditions and raids do not block each other.
 */
export function autoTeam(creatures: readonly TeamCreature[]): TeamCreature[] {
  return strongest(creatures, RULES.raid.teamSize);
}

/** One placed creature as stored: `rowid` is the order they were placed in (a move places again). */
export type PlacementRow = {
  rowid: number;
  slot: number;
  user_id: string;
  creature_id: string;
};

/** A placement with who put it there: null is the owner, otherwise the teammate who moved it for them. */
export type PartyPlacementRow = PlacementRow & { placed_by: string | null };

/**
 * At most `teamSize` placements per player, chosen deterministically: creatures in `preferred`
 * first, then the earliest placed (`rowid`), then the lowest slot. Pure. No player has more than
 * three creatures on the board (a stale row used to make a fourth); this is the one rule that
 * decides which survive, used by the data repair and by every read and write of placements.
 */
export function capPlacements<T extends PlacementRow>(
  rows: readonly T[],
  preferred: ReadonlySet<string> = new Set(),
): T[] {
  const byUser = new Map<string, T[]>();
  for (const row of rows) {
    const list = byUser.get(row.user_id);
    if (list === undefined) byUser.set(row.user_id, [row]);
    else list.push(row);
  }
  const kept = new Set<T>();
  for (const list of byUser.values()) {
    list
      .sort(
        (a, b) =>
          Number(preferred.has(b.creature_id)) - Number(preferred.has(a.creature_id)) ||
          a.rowid - b.rowid ||
          a.slot - b.slot,
      )
      .slice(0, RULES.raid.teamSize)
      .forEach((row) => kept.add(row));
  }
  return rows.filter((row) => kept.has(row));
}

/**
 * The placements of one party this week, at most three per player (see `capPlacements`). Only
 * creatures their placing player still owns count.
 */
export function partyPlacements(
  sql: SqlStorage,
  weekId: string,
  party: number,
): PartyPlacementRow[] {
  return capPlacements(
    sql
      .exec<PartyPlacementRow>(
        `SELECT p.rowid AS rowid, p.slot AS slot, p.user_id AS user_id, p.creature_id AS creature_id,
                p.placed_by AS placed_by
         FROM raid_placements p JOIN creatures c ON c.id = p.creature_id AND c.user_id = p.user_id
         WHERE p.week_id = ? AND p.party = ? ORDER BY p.rowid`,
        weekId,
        party,
      )
      .toArray(),
  );
}

/** Sum of the power of a team. */
export function teamPower(team: readonly TeamCreature[]): number {
  return team.reduce((total, c) => total + c.power, 0);
}

/**
 * The creatures a player brings to this week's raid: the ones they placed on the board (at most
 * three, see `capPlacements`; a placement of a creature they no longer own does not count), then
 * their strongest unplaced creatures to make up three (`autoTeam` order). A player who placed
 * nothing gets the automatic team. Sorted strongest first, so the order never depends on where or
 * when a creature was placed.
 *
 * The fill is not stored: it is worked out again whenever a fight is built, so the three are
 * always the player's strongest at that moment. Placed creatures always fight, wherever they are.
 */
export function raidTeam(sql: SqlStorage, weekId: string, userId: string): TeamCreature[] {
  const owned = loadCreatures(sql, userId);
  const byId = new Map(owned.map((c) => [c.id, c]));
  const placedRows = capPlacements(
    sql
      .exec<PlacementRow>(
        `SELECT p.rowid AS rowid, p.slot AS slot, p.user_id AS user_id, p.creature_id AS creature_id
         FROM raid_placements p JOIN creatures c ON c.id = p.creature_id AND c.user_id = p.user_id
         WHERE p.week_id = ? AND p.user_id = ? ORDER BY p.rowid`,
        weekId,
        userId,
      )
      .toArray(),
  );
  const placed = placedRows.map((r) => byId.get(r.creature_id) as TeamCreature);
  const placedIds = new Set(placed.map((c) => c.id));
  const fill = autoTeam(owned.filter((c) => !placedIds.has(c.id))).slice(
    0,
    RULES.raid.teamSize - placed.length,
  );
  return autoTeam([...placed, ...fill]);
}

/** How long a teammate's stored team is shown before it is worked out again (see `shownRaidTeam`). */
export const SHOWN_TEAM_MAX_AGE_MS = 5 * 60_000;

/**
 * Migration 45 (with `raid_readiness`): the creature ids of each player's raid team as the raid view last
 * worked them out. Working a team out loads the player's whole collection (every creature, talent and
 * worn item) to find their strongest unplaced creatures, and the view did it for every member of the
 * party on every read.
 */
export function raidTeamCacheMigration(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE raid_team_cache (
    week_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    creature_ids TEXT NOT NULL,
    at INTEGER NOT NULL,
    stale INTEGER NOT NULL CHECK (stale IN (0, 1)),
    PRIMARY KEY (week_id, user_id)
  )`);
}

/** A placement, a team or the roster changed: every stored team is worked out again at its next read. */
export function markShownTeamsStale(sql: SqlStorage): void {
  sql.exec('UPDATE raid_team_cache SET stale = 1 WHERE stale = 0');
}

/** Some of a player's creatures by id, loaded like `loadCreatures` (gear and talents folded in). */
function loadCreaturesById(
  sql: SqlStorage,
  userId: string,
  ids: readonly string[],
): TeamCreature[] {
  if (ids.length === 0) return [];
  const worn = wornOnCreatures(sql, ids);
  const books = booksOfCreatures(sql, ids);
  // By id (the primary key), the owner checked here: `user_id = ?` in the query walked their whole list.
  return sql
    .exec<CreatureDbRow>(
      `SELECT id, user_id, species, level, fusion_count, nickname, caught_at FROM creatures
       WHERE id IN (${ids.map(() => '?').join(', ')})`,
      ...ids,
    )
    .toArray()
    .filter((row) => row.user_id === userId)
    .sort((a, b) => a.caught_at - b.caught_at)
    .map((row) => toTeamCreature(row, worn.get(row.id), books.get(row.id)));
}

/**
 * A teammate's raid team for the raid view only: `raidTeam`, but the ids it found are stored and reused
 * for `SHOWN_TEAM_MAX_AGE_MS`, or until a raid change marks them stale (`markShownTeamsStale`), so a
 * view loads only those few creatures. Their stats are always read fresh; only the choice of the
 * strongest unplaced ones can lag (a teammate who trained another creature shows it within minutes).
 * Fights never use this: `buildPhaseInput` works every team out from scratch.
 */
export function shownRaidTeam(
  sql: SqlStorage,
  weekId: string,
  userId: string,
  now: number,
): TeamCreature[] {
  const stored = sql
    .exec<{ creature_ids: string; at: number; stale: number }>(
      'SELECT creature_ids, at, stale FROM raid_team_cache WHERE week_id = ? AND user_id = ?',
      weekId,
      userId,
    )
    .toArray()[0];
  if (stored !== undefined && stored.stale === 0) {
    const age = now - stored.at;
    const ids = JSON.parse(stored.creature_ids) as string[];
    if (age >= 0 && age < SHOWN_TEAM_MAX_AGE_MS) {
      const team = loadCreaturesById(sql, userId, ids);
      // A creature released since: work the team out again.
      if (team.length === ids.length) return autoTeam(team);
    }
  }
  const team = raidTeam(sql, weekId, userId);
  sql.exec('DELETE FROM raid_team_cache WHERE week_id <> ?', weekId);
  sql.exec(
    `INSERT INTO raid_team_cache (week_id, user_id, creature_ids, at, stale) VALUES (?, ?, ?, ?, 0)
     ON CONFLICT(week_id, user_id) DO UPDATE SET creature_ids = excluded.creature_ids,
       at = excluded.at, stale = 0`,
    weekId,
    userId,
    JSON.stringify(team.map((c) => c.id)),
    now,
  );
  return team;
}

/**
 * Slots in a party's shared row: three per member, or `guestRowSize` when fewer than
 * `guestsBelowPlayers` members take part (guests fill the rest).
 */
export function rowLength(memberCount: number): number {
  return memberCount < RULES.combat.guestsBelowPlayers
    ? RULES.combat.guestRowSize
    : memberCount * RULES.raid.teamSize;
}

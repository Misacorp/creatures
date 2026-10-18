/**
 * Raid teams and rows: who fights and where they stand. Shared by the week lifecycle, the phase
 * resolver and the API views. Everything here is synchronous SQL on the guild's database.
 */
import {
  RULES,
  creaturePower,
  strongest,
  type CreatureSpecies,
  type CritBonus,
  type GearMods,
  type GearRules,
  type Stats,
} from '@creatures/game';
import { speciesOf } from './collection';
import { equippedByCreature, type WornBySlot } from './gear-store';
import { foldCreature } from './gear-worn';
import { booksByCreature, foldTalentsOf } from './talent-store';
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
  const folded = foldCreature(row, worn, foldTalentsOf(row, book));
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
    power: creaturePower(folded.stats),
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
export function partyPlacements(sql: SqlStorage, weekId: string, party: number): PlacementRow[] {
  return capPlacements(
    sql
      .exec<PlacementRow>(
        `SELECT p.rowid AS rowid, p.slot AS slot, p.user_id AS user_id, p.creature_id AS creature_id
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

/**
 * Slots in a party's shared row: three per member, or `guestRowSize` when fewer than
 * `guestsBelowPlayers` members take part (guests fill the rest).
 */
export function rowLength(memberCount: number): number {
  return memberCount < RULES.combat.guestsBelowPlayers
    ? RULES.combat.guestRowSize
    : memberCount * RULES.raid.teamSize;
}

import {
  RULES,
  content,
  effectiveStats,
  type ContentPack,
  type CreatureSpecies,
  type Role,
} from '@creatures/game';
import type { FightSlot } from './types';
import { zoneOfIndex, type ZoneSizes } from './zones';

/** A row under construction: empty slots are null. */
export type SparseRow = readonly (FightSlot | null)[];

type SpeciesForSlot = Pick<
  CreatureSpecies,
  'id' | 'name' | 'element' | 'role' | 'baseStats' | 'growth' | 'levelCap' | 'crit'
>;

/** Builds a fight slot with effective stats computed by @creatures/game. */
export function makeSlot(
  species: SpeciesForSlot,
  options: {
    id: string;
    ownerId: string | null;
    level: number;
    fusionCount: number;
    name?: string;
  },
): FightSlot {
  return {
    id: options.id,
    ownerId: options.ownerId,
    name: options.name ?? species.name,
    speciesId: species.id,
    element: species.element,
    role: species.role,
    level: options.level,
    fusionCount: options.fusionCount,
    stats: effectiveStats(species, options.level, options.fusionCount),
    ...(species.crit === undefined ? {} : { crit: { ...species.crit } }),
  };
}

/** A guest definition with its species resolved. */
export interface ResolvedGuest {
  id: string;
  name: string;
  species: SpeciesForSlot;
}

export function resolveGuests(pack: ContentPack = content): ResolvedGuest[] {
  return pack.guests.map((g) => {
    const species = pack.creatures.find((c) => c.id === g.species);
    if (species === undefined) throw new Error(`guest "${g.id}" uses unknown species`);
    return { id: g.id, name: g.name, species };
  });
}

/** Removes empty slots, giving the dense row the fight needs. */
export function compactRow(row: SparseRow): FightSlot[] {
  return row.filter((s): s is FightSlot => s !== null);
}

/**
 * How many creatures stand in each zone of a sparse row, with the zones cut on the sparse row's full
 * length (the board's rows). Pass the result as `FightInput.zones` after `compactRow`, so the dense
 * fight keeps the board's rows however many slots are empty.
 */
export function sparseZones(row: SparseRow): ZoneSizes {
  const out: ZoneSizes = { front: 0, middle: 0, back: 0 };
  row.forEach((s, i) => {
    if (s !== null) out[zoneOfIndex(i, row.length)] += 1;
  });
  return out;
}

/**
 * Places `unplaced` creatures into the free (null) slots by the default rule: guards at the front,
 * payoffs at the back, setters next to payoffs, supports toward the middle. Creatures already in
 * the row never move. Free slots that nobody needs stay null. Throws if there are more creatures
 * than free slots.
 */
function placeByRule(row: SparseRow, unplaced: readonly FightSlot[]): (FightSlot | null)[] {
  const out = [...row];
  const free: number[] = [];
  out.forEach((s, i) => {
    if (s === null) free.push(i);
  });
  if (unplaced.length > free.length) {
    throw new RangeError(
      `${unplaced.length} creatures to place but only ${free.length} free slots`,
    );
  }
  const ofRole = (role: Role) => unplaced.filter((c) => c.role === role);
  const take = (index: number, creature: FightSlot) => {
    out[index] = creature;
    free.splice(free.indexOf(index), 1);
  };

  for (const g of ofRole('guard')) {
    const i = free[0];
    if (i !== undefined) take(i, g);
  }
  for (const p of ofRole('payoff')) {
    const i = free[free.length - 1];
    if (i !== undefined) take(i, p);
  }
  for (const s of ofRole('setter')) {
    const nextToPayoff = free.find(
      (i) => out[i - 1]?.role === 'payoff' || out[i + 1]?.role === 'payoff',
    );
    const i = nextToPayoff ?? free[free.length - 1];
    if (i !== undefined) take(i, s);
  }
  const centre2 = out.length - 1; // twice the centre index, to stay in integers
  for (const s of ofRole('support')) {
    let best: number | undefined;
    for (const i of free) {
      if (best === undefined || Math.abs(2 * i - centre2) < Math.abs(2 * best - centre2)) best = i;
    }
    if (best !== undefined) take(best, s);
  }
  return out;
}

/**
 * Auto-places creatures of players who have not placed all of them (for example absent players).
 * `existingRow` has the creatures already placed (null = free slot); `creaturesByPlayer` the
 * unplaced ones, in the order players should be served. Creatures already placed never move.
 */
export function autoPlace(
  existingRow: SparseRow,
  creaturesByPlayer: ReadonlyMap<string, readonly FightSlot[]>,
): (FightSlot | null)[] {
  const placedIds = new Set<string>();
  for (const s of existingRow) if (s !== null) placedIds.add(s.id);
  const unplaced: FightSlot[] = [];
  for (const [playerId, creatures] of creaturesByPlayer) {
    for (const c of creatures) {
      if (placedIds.has(c.id)) continue;
      unplaced.push({ ...c, ownerId: playerId });
    }
  }
  return placeByRule(existingRow, unplaced);
}

/**
 * Fills a row with guests up to `targetSize` slots (default 9) when fewer than 3 players take
 * part. Guests (definitions are cycled if needed) are placed by the same default rule as
 * `autoPlace`, into free slots; the row is extended with free slots if it is shorter than the
 * target. Guest level is the players' average level, capped by the species' level cap. Existing
 * creatures never move. Guests have `ownerId: null` and earn no loot.
 */
export function fillWithGuests(
  row: SparseRow,
  guests: readonly ResolvedGuest[],
  avgLevel: number,
  targetSize: number = RULES.combat.guestRowSize,
): (FightSlot | null)[] {
  if (guests.length === 0) throw new RangeError('no guest definitions');
  const extended: (FightSlot | null)[] = [...row];
  while (extended.length < targetSize) extended.push(null);
  const occupied = extended.filter((s) => s !== null).length;
  const need = Math.max(0, targetSize - occupied);
  const level = Math.max(1, Math.floor(avgLevel));
  const added: FightSlot[] = [];
  for (let n = 0; n < need; n++) {
    const g = guests[n % guests.length] as ResolvedGuest;
    added.push(
      makeSlot(g.species, {
        id: `guest:${n + 1}`,
        ownerId: null,
        level: Math.min(level, g.species.levelCap),
        fusionCount: 0,
        name: g.name,
      }),
    );
  }
  return placeByRule(extended, added);
}

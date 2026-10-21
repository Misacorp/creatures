/**
 * What supplies add to the trip being sent, as brackets in words (2026-10-21): "Parts: at least double on
 * this trip". The exact numbers come from the game package (`tripBoost`, the economy study's own math),
 * shown only as a bracket, never a count. Recomputed whenever the length, place, explorer or kit changes;
 * the Workshop has no trip, so it shows only the supply's blurb.
 */
import {
  boostLevel,
  boostWords,
  destinationDef,
  expeditionContent,
  tripBoost,
  type BoostCategory,
  type BoostLevel,
  type ExpeditionLength,
  type Role,
  type SupplyDef,
} from '@creatures/game';
import { supplyDefs } from './trip-view';

/** The trip a boost is for: what the send screen knows. */
export interface TripContext {
  length: ExpeditionLength;
  /** The place's id; null when none is chosen. */
  place: string | null;
  /** The explorer's role and stars at the place; null role when nobody is chosen. */
  role: Role | null;
  stars: number;
  /** The id of the week's twist when it applies to this place (`special.twist`), else null. */
  twist: string | null;
}

/** One line of a supply card: the category and how much more of it the supply brings on this trip. */
export interface BoostLine {
  category: BoostCategory | 'everything';
  level: BoostLevel;
  /** "Parts: at least double on this trip". */
  text: string;
}

export const CATEGORY_LABEL: Readonly<Record<BoostCategory | 'everything', string>> = {
  creatures: 'Creatures',
  newSpecies: 'New species',
  deepCreatures: 'Deeper area',
  parts: 'Parts',
  gear: 'Gear',
  xp: 'XP',
  everything: 'Everything',
};

/** The categories a kind of supply is described by on its card (a map raises every table the same way). */
const CARD_CATEGORIES: Readonly<
  Record<SupplyDef['kind'], readonly (BoostCategory | 'everything')[]>
> = {
  lure: ['creatures', 'newSpecies'],
  'map-scrap': ['everything'],
  lantern: ['deepCreatures', 'creatures'],
  satchel: ['parts'],
};

function levelsFor(
  trip: TripContext,
  kit: readonly SupplyDef[],
): Record<BoostCategory, BoostLevel> | null {
  if (trip.place === null || trip.role === null || kit.length === 0) return null;
  const place = destinationDef(trip.place);
  if (place === undefined) return null;
  const twist =
    trip.twist === null
      ? null
      : (expeditionContent.specials.twists.find((t) => t.id === trip.twist)?.effect ?? null);
  const boost = tripBoost({
    length: trip.length,
    kit,
    place,
    role: trip.role,
    stars: trip.stars,
    twist,
  });
  const out = {} as Record<BoostCategory, BoostLevel>;
  for (const key of Object.keys(boost) as BoostCategory[]) out[key] = boostLevel(boost[key]);
  return out;
}

/** The brackets of the whole kit per category for the trip; null when there is nothing to compare. */
export function kitLevels(
  trip: TripContext,
  kitIds: readonly string[],
): Record<BoostCategory, BoostLevel> | null {
  return levelsFor(trip, supplyDefs(kitIds));
}

/** The one or two lines of a supply's card for this trip; empty when no trip is chosen or it adds nothing. */
export function supplyBoostLines(trip: TripContext, supplyId: string): BoostLine[] {
  const def = supplyDefs([supplyId])[0];
  if (def === undefined) return [];
  const levels = levelsFor(trip, [def]);
  if (levels === null) return [];
  const lines: BoostLine[] = [];
  for (const category of CARD_CATEGORIES[def.kind]) {
    const level = levels[category === 'everything' ? 'creatures' : category];
    if (level === 0) continue;
    lines.push({
      category,
      level,
      text: `${CATEGORY_LABEL[category]}: ${boostWords(level)} on this trip`,
    });
  }
  return lines;
}

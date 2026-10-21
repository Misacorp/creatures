/**
 * What the whole kit adds to the trip being sent, as a bracket per category (2026-10-21): the Expected haul
 * strip's "+" marks. The exact numbers come from the game package (`tripBoost`, the economy study's own
 * math), shown only as a bracket, never a count. A supply's own card shows just its blurb, anchored to a
 * reference trip (`REFERENCE_TRIP`).
 */
import {
  boostLevel,
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

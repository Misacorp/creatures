import { nextRankXp } from '@creatures/game';
import type { ClaimResult, Creature } from './api';
import {
  failureLine,
  foundSupplies,
  journalPages,
  nothingInLoot,
  pushOnLine,
  rankGiftViews,
  revealTone,
  slotLine,
  starsView,
  xpView,
  type RevealTone,
} from './claim-view';
import type { Trip } from './expedition-types';
import { autoSettledLines, noCatchLine, tripFinds, type Find } from './find-view';
import { creatureName } from './game';
import { partCountItems, supplyCounts } from './count-items';
import type { GrantLoot } from './gear-types';
import type { PendingCatch } from './talent-types';
import { destinationName, explorerXp, lengthHours } from './trip-view';
import type { CountItem } from './ui/CountBadge';
import type { IconRef } from './icon-ref';
import { experienceGain, explorerGain } from './xp-gain';
import type { XpChange } from './xp-change';

/** Everything the trip result shows, worked out from the server's claim result and the fresh state. */
export interface TripResultView {
  tone: RevealTone;
  explorer: { id: string; species: string; shiny: boolean; name: string } | null;
  place: { id: string; name: string } | null;
  /** The trip's length in hours (absent for an old claim without its trip). */
  hours: number | null;
  /** A risky push-on that did not work out: the whole trip came to nothing. */
  failure: string | null;
  /** What the push-on did, when there was one. */
  pushOn: string | null;
  finds: Find[];
  /** "No creature came this time, only a small find." and similar. */
  noCatch: string | null;
  /** Older waiting catches the server settled because ten waited. */
  autoSettled: string[];
  counts: CountItem[];
  loot: GrantLoot | null;
  /** The explorer XP the trip paid, as the shared row (`ui/XpGain`). */
  xp: XpChange | null;
  /** The explorer's creature experience as the shared row (`ExperienceGainRow`). */
  growth: XpChange | null;
  stars: { stars: number; gained: boolean; trips: number } | null;
  slot: string | null;
  gifts: { rank: number; title: string; lines: { key: string; icon: IconRef; text: string }[] }[];
  journal: { title: string; text: string; set: string | null; setComplete: boolean }[];
}

/** The trip result of a claim, from the claim and the state after it. */
export function tripResultView(input: {
  result: ClaimResult;
  trip: Trip | undefined;
  creature: Creature | undefined;
  pending: readonly PendingCatch[];
  creatures: readonly Creature[];
  settled: Readonly<Record<string, string>>;
}): TripResultView {
  const { result, trip, creature, pending, creatures, settled } = input;
  const xp = xpView(result);
  const bar =
    xp === null
      ? null
      : explorerXp(
          creature?.explorer ?? { rank: xp.rank, xp: xp.total, nextRankXp: nextRankXp(xp.rank) },
        );
  const stars = starsView(result);
  const loot = result.loot;
  const exp = result.experience;
  const name = creature === undefined ? 'The explorer' : creatureName(creature);
  return {
    tone: revealTone(result),
    explorer:
      creature === undefined
        ? null
        : {
            id: creature.id,
            species: creature.species,
            shiny: creature.shiny,
            name: creatureName(creature),
          },
    place:
      trip === undefined ? null : { id: trip.destination, name: destinationName(trip.destination) },
    hours: trip === undefined ? null : lengthHours(trip.duration),
    failure: failureLine(result),
    pushOn: pushOnLine(result),
    finds: tripFinds(result.catches, pending, creatures, settled),
    noCatch: noCatchLine(result),
    autoSettled: autoSettledLines(result.autoSettled, creatures),
    counts:
      loot === undefined || nothingInLoot(result)
        ? []
        : [...partCountItems(loot.parts), ...supplyCounts(foundSupplies(result))],
    loot: loot === undefined || nothingInLoot(result) ? null : loot,
    xp:
      xp === null || bar === null
        ? null
        : explorerGain({
            gained: xp.gained,
            rank: xp.rank,
            rankBefore: xp.rankBefore,
            value: bar.value,
            max: bar.text === undefined ? bar.max : null,
            boost: xp.boost,
            name,
          }),
    growth: exp === undefined ? null : experienceGain(exp, name),
    stars: stars === null ? null : { stars: stars.stars, gained: stars.gained, trips: stars.trips },
    slot: slotLine(result),
    gifts: rankGiftViews(result),
    journal: journalPages(result).map((page) => ({
      title: page.title,
      text: page.text,
      set: page.setName,
      setComplete: page.setComplete,
    })),
  };
}

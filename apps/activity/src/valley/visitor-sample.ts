/**
 * Sample visitor answers (the workbench and the tests): the bag of the captured gear fixture (real server output), the visitor's read as the
 * server sends it, and a reroll's picture (no dice here). The prices and odds are the real rules (`rerollPrice`, `rerollOdds`), so a sample cannot drift from what the server asks.
 */
import {
  VALLEY_RULES,
  gearBase,
  rerollOdds,
  rerollPrice as priceFor,
  type VisitorViewState,
} from '@creatures/game';
import gearState from '../fixtures/gear-state.json';
import { parseGearState } from '../gear-parse';
import type { GearItem } from '../gear-types';
import type { VisitorHere } from './visitor-view';

/** The captured bag: eight pieces, four of them worn, and the blueprints the fixture's player knows. */
export const SAMPLE_GEAR = parseGearState(gearState);

/** A blueprint the fixture's player does not know yet, and one it does. */
export const NEW_BLUEPRINT = 'thundercap';
export const KNOWN_BLUEPRINT = 'kelp-cap';

/** The visitor here with the week's blueprint (`baseId`), a number of rerolls made, and (when asked) one piece's price and odds. */
export function sampleVisitor(
  options: {
    baseId?: string | undefined;
    bought?: boolean | undefined;
    rerolls?: number | undefined;
    item?: GearItem | undefined;
  } = {},
): VisitorHere {
  const v = VALLEY_RULES.visitor;
  const rerolls = options.rerolls ?? 0;
  const base: VisitorHere = {
    here: true,
    blueprint: {
      baseId: options.baseId ?? NEW_BLUEPRINT,
      acorns: v.blueprintAcorns,
      shards: v.blueprintShards,
      bought: options.bought ?? false,
    },
    rerolls,
  };
  const { item } = options;
  const piece = item === undefined ? undefined : gearBase(item.baseId);
  if (item === undefined || piece === undefined) return base;
  const [acorns, scrap] = priceFor(VALLEY_RULES, item.itemLevel, rerolls);
  const odds = rerollOdds(piece, item.rarity, item.itemLevel);
  return {
    ...base,
    item: {
      id: item.id,
      itemLevel: item.itemLevel,
      rarity: item.rarity,
      price: { acorns, scrap },
      odds: { ...odds, tiers: odds.tiers.map((t) => ({ ...t })) },
    },
  };
}

/** The visitor away (his stock stays hidden). */
export const SAMPLE_AWAY: VisitorViewState = { here: false };

/**
 * A piece after a reroll, as a picture for the workbench and the tests: every rolled line moves one tier up (the best tier, back to the
 * first), so its card and the before-and-after diff show a change. The server sends the real new lines and their words.
 */
export function rerolled(item: GearItem): GearItem {
  const lines = item.lines.map((line) =>
    line.source === 'rolled' && line.tier !== null
      ? { ...line, tier: (line.tier % (line.bestTier ?? 5)) + 1 }
      : line,
  );
  return { ...item, lines };
}

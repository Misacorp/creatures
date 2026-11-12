/**
 * The Build panel as plain data (`BuildPanel.tsx` draws it): each buildable part with what is still owed on it
 * (have / need per line), how many lines are paid, and what "Pay in" would take: what the player holds of every
 * line, up to the price. The parts that cannot be built yet follow with their reason and their price. Pure.
 */
import {
  applyPayment,
  lineKey,
  type HousePay,
  type HouseView,
  type OwnHouseView,
  type PartDef,
  type PriceLine,
  type Taken,
} from '@creatures/game';
import { housing } from '@creatures/game/housing-content';
import type { CountItem } from '../count-types';
import { acornCount, resourceCount, scrapCount, shardCount, type ShortOf } from '../resource-count';
import type { RecipeInput } from '../ui/RecipeCard';
import { haveOf, holdingsOf, lineCount, partName, recipeInputs } from './house-names';

/** One buildable part as the panel shows it. */
export interface PartCard {
  id: string;
  name: string;
  line: string;
  /** What is still owed, each line with have / need. */
  inputs: RecipeInput[];
  /** Lines of the price, and how many have had something paid into them (the lit pips). */
  lines: { total: number; paid: number };
  /** Something has been paid into it already. */
  started: boolean;
  /** What "Pay in" takes: the smaller of what is held and what is owed on every line. */
  pay: HousePay;
  /** The same as items, for the spoken name of the button. */
  payItems: CountItem[];
  /** When nothing can be paid: what the player has against what the first line asks ("You have 0; this costs 40"); else null. */
  short: ShortOf | null;
}

/** A part that cannot be built yet, and why. */
export interface LockedPart {
  id: string;
  name: string;
  line: string;
  reason: string;
  /** The price as the recipe's inputs (have / need). */
  inputs: RecipeInput[];
  /** How many lines the price has (the pips, none lit). */
  lines: number;
}

/**
 * How many lines of a part's price have had something paid into them (`touched`, the lit pips: a first payment lights a pip even
 * when it does not cover its line) and how many are paid in full (`full`). `remaining` is what the player still owes, in the
 * price's own order; absent: nothing paid yet.
 */
export function linesPaid(
  price: readonly PriceLine[],
  remaining: readonly PriceLine[] | undefined,
): { total: number; touched: number; full: number } {
  const owed = new Map((remaining ?? price).map((line) => [lineKey(line), line.amount]));
  let touched = 0;
  let full = 0;
  for (const line of price) {
    const left = owed.get(lineKey(line)) ?? 0;
    if (left < line.amount) touched += 1;
    if (left === 0) full += 1;
  }
  return { total: price.length, touched, full };
}

/** What a payment took, as the request body (zero amounts left out). */
export function payOf(take: Taken): HousePay {
  const pay: HousePay = {};
  if (take.bait > 0) pay.bait = take.bait;
  if (take.scrap > 0) pay.scrap = take.scrap;
  const shards = Object.entries(take.shards).filter(([, n]) => n > 0);
  if (shards.length > 0) pay.shards = Object.fromEntries(shards);
  const materials = Object.entries(take.materials).filter(([, n]) => n > 0);
  if (materials.length > 0) pay.materials = Object.fromEntries(materials);
  return pay;
}

/** A payment as count items (what leaves the player's hands). */
export function payItems(take: Taken): CountItem[] {
  const items: CountItem[] = [];
  if (take.bait > 0) items.push(acornCount(take.bait));
  if (take.scrap > 0) items.push(scrapCount(take.scrap));
  for (const [element, n] of Object.entries(take.shards)) {
    if (n > 0) items.push(shardCount(element, n));
  }
  for (const [id, n] of Object.entries(take.materials)) {
    if (n > 0) items.push(resourceCount(id, n));
  }
  return items;
}

/** What paying `lines` takes when the player offers everything held: the most each line can take. */
export function takeFor(lines: readonly PriceLine[], own: OwnHouseView): Taken {
  const held = holdingsOf(own);
  const offer: HousePay = {
    bait: held.bait,
    scrap: held.scrap,
    shards: held.shards,
    materials: { ...held.materials },
  };
  return applyPayment({ price: [...lines] }, {}, offer, held, housing).take;
}

function cardOf(part: PartDef, own: OwnHouseView): PartCard {
  const progress = own.progress.find((p) => p.partId === part.id);
  const remaining = progress?.remaining ?? part.price;
  const take = takeFor(remaining, own);
  const pay = payOf(take);
  const first = remaining[0];
  return {
    id: part.id,
    name: part.name,
    line: part.line,
    inputs: recipeInputs(remaining, own),
    lines: { total: part.price.length, paid: linesPaid(part.price, progress?.remaining).touched },
    started: progress !== undefined && progress.paid.length > 0,
    pay,
    payItems: payItems(take),
    short:
      Object.keys(pay).length > 0 || first === undefined
        ? null
        : { have: [lineCount(first, haveOf(first, own))], cost: [lineCount(first)] },
  };
}

/** The parts the player can build now, in the build list's order. */
export function partCards(own: OwnHouseView): PartCard[] {
  return housing.parts
    .filter((part) => own.buildable.includes(part.id))
    .sort((a, b) => a.order - b.order)
    .map((part) => cardOf(part, own));
}

/** The parts not built and not yet buildable, with what they wait for ("Needs the House"). */
export function lockedParts(house: Pick<HouseView, 'built'>, own: OwnHouseView): LockedPart[] {
  return housing.parts
    .filter((part) => !house.built.includes(part.id) && !own.buildable.includes(part.id))
    .sort((a, b) => a.order - b.order)
    .map((part) => {
      const missing = part.requires.filter((id) => !house.built.includes(id)).map(partName);
      return {
        id: part.id,
        name: part.name,
        line: part.line,
        reason:
          missing.length === 0
            ? 'Waiting for another part'
            : `Needs the ${missing.join(' and the ')} first`,
        inputs: recipeInputs(part.price, own),
        lines: part.price.length,
      };
    });
}

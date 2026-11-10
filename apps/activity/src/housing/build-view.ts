/**
 * The Build panel as plain data (`BuildPanel.tsx` draws it): each buildable part with what is still owed on it
 * (have / need per line), how many lines are paid, and what "Pay in" would take with every line paid as far as
 * the player holds it (a line switched off is held back). The parts that cannot be built yet follow with their
 * reason. Pure.
 */
import {
  applyPayment,
  housing,
  lineKey,
  type HousePay,
  type HouseView,
  type OwnHouseView,
  type PartDef,
  type PriceLine,
  type Taken,
} from '@creatures/game';
import type { CountItem } from '../count-types';
import { acornCount, resourceCount, scrapCount, shardCount } from '../resource-count';
import type { RecipeInput } from '../ui/RecipeCard';
import { holdingsOf, lineCount, partName, recipeInputs } from './house-names';

/** One buildable part as the panel shows it. */
export interface PartCard {
  id: string;
  name: string;
  line: string;
  /** What is still owed, each line with have / need. */
  inputs: RecipeInput[];
  /** Lines of the price, and how many of them are paid in full. */
  lines: { total: number; paid: number };
  /** Something has been paid into it already. */
  started: boolean;
  /** Lines the "Pay in" button may leave out, as items (an icon and the amount still owed). */
  switches: { key: string; item: CountItem; on: boolean }[];
  /** What "Pay in" takes: the smaller of what is held and what is owed on every line that is on. */
  pay: HousePay;
  /** The same as items, for the spoken name of the button. */
  payItems: CountItem[];
  /** Why nothing can be paid, or null when something can. */
  reason: string | null;
}

/** A part that cannot be built yet, and why. */
export interface LockedPart {
  id: string;
  name: string;
  line: string;
  reason: string;
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

function cardOf(part: PartDef, own: OwnHouseView, off: ReadonlySet<string>): PartCard {
  const progress = own.progress.find((p) => p.partId === part.id);
  const remaining = progress?.remaining ?? part.price;
  const on = remaining.filter((line) => !off.has(lineKey(line)));
  const take = takeFor(on, own);
  const pay = payOf(take);
  const nothing = Object.keys(pay).length === 0;
  const reason = !nothing
    ? null
    : on.length === 0
      ? 'Switch a line on to pay it.'
      : 'Nothing to pay in yet.';
  return {
    id: part.id,
    name: part.name,
    line: part.line,
    inputs: recipeInputs(remaining, own),
    lines: { total: part.price.length, paid: part.price.length - remaining.length },
    started: progress !== undefined && progress.paid.length > 0,
    switches: remaining.map((line) => ({
      key: lineKey(line),
      item: lineCount(line),
      on: !off.has(lineKey(line)),
    })),
    pay,
    payItems: payItems(take),
    reason,
  };
}

/** The parts the player can build now, in the build list's order. `off` holds the line keys held back, per part. */
export function partCards(
  own: OwnHouseView,
  off: Readonly<Record<string, ReadonlySet<string>>> = {},
): PartCard[] {
  return housing.parts
    .filter((part) => own.buildable.includes(part.id))
    .sort((a, b) => a.order - b.order)
    .map((part) => cardOf(part, own, off[part.id] ?? new Set()));
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
        reason: missing.length === 0 ? 'Not yet' : `Needs the ${missing.join(' and the ')}`,
      };
    });
}

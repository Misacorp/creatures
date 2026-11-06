import {
  anvilKitFor,
  choosePurchase,
  defaultDestination as defaultDestinationFor,
  evolutionOrder,
  needsOf as needsFor,
  nextKit,
  retiltPlan,
} from '@creatures/game';
import { placeLevel } from './commons';
import { relevel } from './growth';
import { pickOccupant } from './honours';
import { evolveCost, refreshCeiling, debit } from './world';
import { ELEMENTS, type KitName } from './rules';
import type { Player, Server } from './types';
import { R } from './types';

/** What the player's next seat costs (V-POST-2): rising with the seats owned and the place's level; null if the place's level allows no more. */
export function nextSeat(
  p: Player,
  server: Server,
  kind: 'scout' | 'anvil',
): { acorns: number; scrap: number } | null {
  const rules = p.rules;
  const level = placeLevel(server, kind === 'scout' ? 'signpost' : 'forge');
  const owned = kind === 'scout' ? p.seats.length : p.anvils.length;
  const limit =
    (kind === 'scout' ? rules.seats.scoutByLevel : rules.seats.anvilByLevel)[level - 1] ?? 0;
  const base = (kind === 'scout' ? rules.seats.scoutPrices : rules.seats.anvilPrices)[owned];
  if (owned >= limit || base === undefined) return null;
  return {
    acorns: Math.ceil(base * (1 + rules.seats.levelSurcharge * (level - 1))),
    scrap: kind === 'anvil' ? (rules.seats.anvilScrap[owned] ?? 0) : 0,
  };
}

const nextKitOf = (p: Player): KitName | null =>
  nextKit(
    p.rules,
    p.rules.kit.buyOrder.filter((k) => p.kitOwned[k]),
    p.policy,
  );

/**
 * Where a new seat's scout starts: the place of the element of the player's best creatures, one element per seat in turn
 * (what "for my team" will need shards of), as a player looking at their roster would place it. A set-and-forget player keeps it.
 */
export function defaultDestination(p: Player): number {
  const ranked = [...p.creatures].sort((a, b) => b.level - a.level || b.xp - a.xp);
  return defaultDestinationFor(
    p.rules,
    ranked.map((c) => c.element),
    p.seats.length,
  );
}

export const newSeat = (p: Player): void => {
  p.seats.push({ dest: defaultDestination(p), store: 0, wasted: 0, mastery: 0 });
  p.scoutOcc.push(pickOccupant(p));
};
export const newAnvil = (p: Player): void => {
  p.anvils.push({ working: false, progress: 0, need: 0, element: 0, rarity: 0, mastery: 0 });
  p.anvilOcc.push(pickOccupant(p));
};

/** Evolutions (an Essence sink): a creature waiting at the evolve level takes the Essence when there is enough, best first. */
export function buyEvolutions(p: Player): void {
  const rules = p.rules;
  const waiting = evolutionOrder(
    p.creatures.filter((c) => c.canEvolve && !c.evolved && c.level >= rules.xp.evolveLevel),
  );
  for (const c of waiting) {
    const cost = evolveCost(rules, c.species);
    if ((p.stock[R.essence] ?? 0) < cost) continue;
    debit(p, R.essence, cost, 'evolution');
    c.evolved = true;
    refreshCeiling(rules, c);
    relevel(c);
  }
}

/** Seats and anvils first, kit with Acorns to spare (V-POST-2, V-POST-11): the cheapest thing the player can afford and is allowed. */
export function buySeatsAndKit(p: Player, server: Server): void {
  const rules = p.rules;
  for (let guard = 0; guard < 16; guard++) {
    const offers = (['scout', 'anvil'] as const).flatMap((kind) => {
      const cost = nextSeat(p, server, kind);
      return cost === null ? [] : [{ kind, ...cost }];
    });
    const buy = choosePurchase({
      acorns: p.stock[R.acorns] ?? 0,
      scrap: p.stock[R.scrap] ?? 0,
      offers,
      kit: nextKitOf(p),
      kitPrice: rules.kit.price,
    });
    if (buy === null) return;
    if (buy.kind === 'seat') {
      debit(p, R.acorns, buy.offer.acorns, 'seats');
      debit(p, R.scrap, buy.offer.scrap, 'anvil seats');
      if (buy.offer.kind === 'scout') newSeat(p);
      else newAnvil(p);
      continue;
    }
    debit(p, R.acorns, rules.kit.price, 'kit');
    p.kitOwned[buy.kit] = true;
    if (buy.kit === 'tongs' || buy.kit === 'loupe') p.anvilKit ??= buy.kit;
    else p.scoutKit ??= buy.kit;
  }
}

// ---------- the optimiser: re-tilting seats to what the player needs now (V-POST-11) ----------

/** An optimiser's visit: every scout seat to the place that serves the needs best, the kit that suits, the anvil kit that suits. */
export function retilt(p: Player): void {
  if (p.policy !== 'optimiser') return;
  const needs = needsFor({
    scrap: p.stock[R.scrap] ?? 0,
    shards: p.shards,
    elementCounts: ELEMENTS.map((_, e) => p.creatures.filter((c) => c.element === e).length),
    creatures: p.creatures.length,
    kindsOwned: p.speciesCount.filter((c) => c > 0).length,
    kindsAvailable: p.available,
  });
  const best = retiltPlan(
    p.rules,
    needs,
    p.seats.length,
    p.rules.kit.buyOrder.filter((k) => p.kitOwned[k]),
  );
  if (best) {
    p.scoutKit = best.kit;
    best.dests.forEach((d, i) => {
      const seat = p.seats[i];
      if (seat) seat.dest = d;
    });
  }
  p.anvilKit = anvilKitFor(p.kitOwned, p.stock[R.essence] ?? 0);
}

// ---------- looking at the shelf: choices at a visit and the next thing worth buying ----------

/** The meaningful things a player could do right now, counted under each resource they need (resources.md "choices per visit"). */
export function countOptions(p: Player, server: Server): number[] {
  const rules = p.rules;
  const out = [0, 0, 0, 0, 0];
  const have = p.stock;
  for (const kind of ['scout', 'anvil'] as const) {
    const cost = nextSeat(p, server, kind);
    if (cost && (have[R.acorns] ?? 0) >= cost.acorns && (have[R.scrap] ?? 0) >= cost.scrap) {
      out[R.acorns] = (out[R.acorns] ?? 0) + 1;
      if (cost.scrap > 0) out[R.scrap] = (out[R.scrap] ?? 0) + 1;
    }
  }
  if (nextKitOf(p) && (have[R.acorns] ?? 0) >= rules.kit.price)
    out[R.acorns] = (out[R.acorns] ?? 0) + 1;
  if (server.places.some((pl) => pl.open) && (have[R.acorns] ?? 0) >= 1)
    out[R.acorns] = (out[R.acorns] ?? 0) + 1;
  for (const c of p.creatures) {
    if (
      c.canEvolve &&
      !c.evolved &&
      c.level >= rules.xp.evolveLevel &&
      (have[R.essence] ?? 0) >= evolveCost(rules, c.species)
    )
      out[R.essence] = (out[R.essence] ?? 0) + 1;
  }
  if ((have[R.essence] ?? 0) >= rules.forge.reach.rare.essence)
    out[R.essence] = (out[R.essence] ?? 0) + 1;
  return out;
}

/** The price of the next thing worth buying with a resource (null: nothing to buy yet), for "days to the next thing". */
export function nextPrice(p: Player, r: number, server: Server): number | null {
  const rules = p.rules;
  const near = (gate: number, level: number): boolean => level >= gate - 3;
  const prices: number[] = [];
  if (r === R.acorns) {
    for (const kind of ['scout', 'anvil'] as const) {
      const cost = nextSeat(p, server, kind);
      if (cost) prices.push(cost.acorns);
    }
    if (nextKitOf(p)) prices.push(rules.kit.price);
  } else if (r === R.scrap) {
    const anvil = nextSeat(p, server, 'anvil');
    if (anvil && anvil.scrap > 0) prices.push(anvil.scrap);
  } else if (r === R.essence) {
    if (p.creatures.some((c) => c.canEvolve && !c.evolved && near(rules.xp.evolveLevel, c.level)))
      prices.push(rules.xp.evolveEssence);
    if (p.policy === 'optimiser') prices.push(rules.forge.reach.rare.essence);
  }
  return prices.length ? Math.min(...prices) : null;
}

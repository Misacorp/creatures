import { placeLevel } from './commons';
import { kitTilt } from './scouts';
import { relevel } from './growth';
import { pickOccupant } from './honours';
import { refreshCeiling, debit } from './world';
import { ELEMENTS, type Destination, type KitName, type Rules } from './rules';
import type { Player, Server } from './types';
import { R } from './types';
import { clamp, sum } from './util';

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

const nextKit = (p: Player): KitName | null => {
  const rules = p.rules;
  const owned = rules.kit.buyOrder.filter((k) => p.kitOwned[k]).length;
  const limit = p.policy === 'optimiser' ? rules.kit.buyOrder.length : rules.kit.setAndForgetBuys;
  if (owned >= limit) return null;
  return rules.kit.buyOrder.find((k) => !p.kitOwned[k]) ?? null;
};

/**
 * Where a new seat's scout starts: the place of the element of the player's best creatures, one element per seat in turn
 * (what "for my team" will need shards of), as a player looking at their roster would place it. A set-and-forget player keeps it.
 */
export function defaultDestination(p: Player): number {
  const { destinations } = p.rules.scouts;
  const ranked = [...p.creatures].sort((a, b) => b.level - a.level || b.xp - a.xp);
  const elements = [...new Set(ranked.map((c) => c.element))];
  const element = elements[p.seats.length % Math.max(1, elements.length)];
  const found = destinations.findIndex(
    (d) => d.element !== null && ELEMENTS.indexOf(d.element) === element,
  );
  return found >= 0 ? found : p.seats.length % destinations.length;
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
  const waiting = p.creatures
    .filter((c) => c.canEvolve && !c.evolved && c.level >= rules.xp.evolveLevel)
    .sort((a, b) => b.level - a.level);
  for (const c of waiting) {
    if ((p.stock[R.essence] ?? 0) < rules.xp.evolveEssence) return;
    debit(p, R.essence, rules.xp.evolveEssence, 'evolution');
    c.evolved = true;
    refreshCeiling(rules, c);
    relevel(c);
  }
}

/** Seats and anvils first, kit with Acorns to spare (V-POST-2, V-POST-11): the cheapest thing the player can afford and is allowed. */
export function buySeatsAndKit(p: Player, server: Server): void {
  const rules = p.rules;
  for (let guard = 0; guard < 16; guard++) {
    const offers = (['scout', 'anvil'] as const)
      .map((kind) => ({ kind, cost: nextSeat(p, server, kind) }))
      .filter(
        (o): o is { kind: 'scout' | 'anvil'; cost: { acorns: number; scrap: number } } =>
          o.cost !== null,
      )
      .sort((a, b) => a.cost.acorns - b.cost.acorns);
    const cheapest = offers[0];
    const acorns = p.stock[R.acorns] ?? 0;
    if (
      cheapest &&
      acorns >= cheapest.cost.acorns &&
      (p.stock[R.scrap] ?? 0) >= cheapest.cost.scrap
    ) {
      debit(p, R.acorns, cheapest.cost.acorns, 'seats');
      debit(p, R.scrap, cheapest.cost.scrap, 'anvil seats');
      if (cheapest.kind === 'scout') newSeat(p);
      else newAnvil(p);
      continue;
    }
    const kit = nextKit(p);
    if (!kit) return;
    const spare = acorns - rules.kit.price - (cheapest?.cost.acorns ?? 0);
    if (spare < 0) return;
    debit(p, R.acorns, rules.kit.price, 'kit');
    p.kitOwned[kit] = true;
    if (kit === 'tongs' || kit === 'loupe') p.anvilKit ??= kit;
    else p.scoutKit ??= kit;
  }
}

// ---------- the optimiser: re-tilting seats to what the player needs now (V-POST-11) ----------

const needFactor = (stock: number, target: number): number => clamp(1.6 - stock / target, 0.2, 1.6);

interface Needs {
  scrap: number;
  shard: number[];
  creature: number;
}

function needsOf(p: Player): Needs {
  const n = Math.max(1, p.creatures.length);
  const owned = p.speciesCount.filter((c) => c > 0).length;
  return {
    scrap: needFactor(p.stock[R.scrap] ?? 0, 150),
    shard: ELEMENTS.map((_, e) => {
      const share = p.creatures.filter((c) => c.element === e).length / n;
      return needFactor(p.shards[e] ?? 0, 8) * (0.4 + 2 * share);
    }),
    creature: owned < p.available * 0.9 ? 1.3 : 0.3,
  };
}

function seatScore(
  rules: Rules,
  d: Destination,
  second: boolean,
  needs: Needs,
  kit: KitName | null,
): number {
  const r = rules.scouts.perHour;
  const rich = (f: Destination['rich']): number => (d.rich === f ? rules.scouts.richMultiplier : 1);
  const tilt = kitTilt(rules, kit);
  const e = d.element === null ? -1 : ELEMENTS.indexOf(d.element);
  const shardNeed = e >= 0 ? (needs.shard[e] ?? 1) : sum(needs.shard.slice(0, 4)) / 4;
  const rare = rich('rare') * tilt.rare;
  return (
    r.scrap * rich('scrap') * tilt.scrap * needs.scrap +
    r.shards * rich('shards') * tilt.shards * shardNeed * 2 +
    r.creatures *
      rich('creatures') *
      tilt.creatures *
      (second ? rules.scouts.secondScoutCreatures : 1) *
      needs.creature *
      20 +
    rare * (r.gear * 6 + r.blueprints * 8 + r.rareFinds * 60 + r.pages * 2)
  );
}

/** An optimiser's visit: every scout seat to the place that serves the needs best, the kit that suits, the anvil kit that suits. */
export function retilt(p: Player): void {
  if (p.policy !== 'optimiser') return;
  const rules = p.rules;
  const needs = needsOf(p);
  const kits: (KitName | null)[] = [
    null,
    ...(['lure', 'lantern', 'satchel'] as const).filter((k) => p.kitOwned[k]),
  ];
  let best: { kit: KitName | null; dests: number[]; total: number } | null = null;
  for (const kit of kits) {
    const dests: number[] = [];
    let total = 0;
    for (let i = 0; i < p.seats.length; i++) {
      let pick = 0;
      let top = -Infinity;
      rules.scouts.destinations.forEach((d, di) => {
        const s = seatScore(rules, d, dests.includes(di), needs, kit);
        if (s > top) {
          top = s;
          pick = di;
        }
      });
      dests.push(pick);
      total += top;
    }
    if (!best || total > best.total) best = { kit, dests, total };
  }
  if (best) {
    p.scoutKit = best.kit;
    best.dests.forEach((d, i) => {
      const seat = p.seats[i];
      if (seat) seat.dest = d;
    });
  }
  if (p.kitOwned.loupe && (p.stock[R.essence] ?? 0) >= 130) p.anvilKit = 'loupe';
  else if (p.kitOwned.tongs) p.anvilKit = 'tongs';
  else p.anvilKit = p.kitOwned.loupe ? 'loupe' : null;
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
  if (nextKit(p) && (have[R.acorns] ?? 0) >= rules.kit.price)
    out[R.acorns] = (out[R.acorns] ?? 0) + 1;
  if (server.places.some((pl) => pl.open) && (have[R.acorns] ?? 0) >= 1)
    out[R.acorns] = (out[R.acorns] ?? 0) + 1;
  for (const c of p.creatures) {
    if (
      c.canEvolve &&
      !c.evolved &&
      c.level >= rules.xp.evolveLevel &&
      (have[R.essence] ?? 0) >= rules.xp.evolveEssence
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
    if (nextKit(p)) prices.push(rules.kit.price);
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

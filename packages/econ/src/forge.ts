import { masteryBonus } from './curves';
import type { Rules } from './rules';
import { ELEMENTS } from './rules';
import { rollLines } from './lines';
import type { Anvil, Creature, Piece, Player, Server } from './types';
import { R } from './types';
import { credit, creditShard, debit, debitShard } from './world';
import { uniform } from './util';

/** V-FORGE-7: whether one of the player's smiths is a Master (a little more scrap from their scouts). */
export const hasMasterSmith = (p: Player): boolean => {
  const top = p.rules.posts.mastery[p.rules.posts.mastery.length - 1];
  return !!top && p.anvils.some((a) => a.mastery >= top.hours);
};

/** The rarity of a piece (0 common, 1 rare, 2 epic) from odds [common, rare, epic]. */
export function rollRarity(p: Player, odds: readonly number[]): number {
  const roll = uniform(p.rng);
  if (roll < (odds[0] ?? 1)) return 0;
  return roll < (odds[0] ?? 0) + (odds[1] ?? 0) ? 1 : 2;
}

/** The odds the anvil's order uses: Reach's, or the plain ones; a loupe lifts the rare and epic share (V-FORGE-8). */
function orderOdds(rules: Rules, base: readonly number[], loupe: boolean): number[] {
  if (!loupe) return [...base];
  const lift = rules.kit.loupe.rarityOdds;
  const rare = (base[1] ?? 0) * lift;
  const epic = (base[2] ?? 0) * lift;
  return [Math.max(0, 1 - rare - epic), rare, epic];
}

/**
 * Which element the next piece "for my team" is for (V-FORGE-1): among the elements the team needs and the shelf has, a
 * set-and-forget order rotates and an optimiser takes the fullest shelf. If the shelf has none of what the team needs it waits.
 */
function chooseElement(p: Player): number {
  const need = (e: number): number => (p.weakByElement[e] ?? 0) - (p.pendingByElement[e] ?? 0);
  const wanted: number[] = [];
  for (let e = 0; e < ELEMENTS.length; e++) if (need(e) > 0) wanted.push(e);
  if (wanted.length === 0) return -1;
  const stocked = wanted.filter((e) => (p.shards[e] ?? 0) >= p.rules.forge.shard);
  const pool = stocked.length ? stocked : wanted;
  if (p.policy === 'optimiser') {
    return pool.reduce(
      (best, e) => ((p.shards[e] ?? 0) > (p.shards[best] ?? 0) ? e : best),
      pool[0]!,
    );
  }
  const next = pool.find((e) => e >= p.forgeCursor) ?? pool[0]!;
  p.forgeCursor = (next + 1) % ELEMENTS.length;
  return next;
}

/**
 * Q34 B: the Forge's shard exchange. Trades `rate` shards of another element (the biggest pile above `keep`) for 1 of `element`,
 * with a chance of a crit that gives more, until the player has `want` of it or no other pile can pay. Returns the shards gained.
 */
export function exchangeFor(
  p: Player,
  element: number,
  want: number,
  keep: number,
  terms: { rate: number; critChance: number } = p.rules.forge.exchange,
): number {
  const { rate, critChance } = terms;
  const { critYield } = p.rules.forge.exchange;
  let gained = 0;
  while ((p.shards[element] ?? 0) < want) {
    let donor = -1;
    let best = rate - 1e-9;
    for (let e = 0; e < ELEMENTS.length; e++) {
      const spare = (p.shards[e] ?? 0) - keep;
      if (e !== element && spare > best) {
        best = spare;
        donor = e;
      }
    }
    if (donor < 0) break;
    debitShard(p, donor, rate, 'exchange');
    const got = uniform(p.rng) < critChance ? critYield : 1;
    creditShard(p, element, got, 'exchange');
    p.wk.exchanges += 1;
    if (got > 1) p.wk.exchangeCrits += 1;
    gained += got;
  }
  return gained;
}

/**
 * A visit's exchanges (Q34 B). An optimiser exchanges at every visit for what its orders need; a
 * set-and-forget player only when an anvil is waiting on a shard at that visit (the one-tap fix, enough for one piece on each anvil).
 */
export function exchangeAtVisit(p: Player): void {
  const rules = p.rules;
  const keep = rules.forge.giveReserveShards;
  if (p.policy === 'setAndForget') {
    if (p.waitingShard >= 0)
      exchangeFor(p, p.waitingShard, Math.max(1, p.anvils.length) * rules.forge.shard, keep);
    p.waitingShard = -1;
    return;
  }
  const want = new Array<number>(ELEMENTS.length).fill(0);
  for (let e = 0; e < ELEMENTS.length; e++) {
    const orders = Math.min(
      (p.weakByElement[e] ?? 0) - (p.pendingByElement[e] ?? 0),
      p.anvils.length * 3,
    );
    if (orders > 0) want[e] = (want[e] ?? 0) + orders * rules.forge.shard;
  }
  const order = want.map((w, e) => ({ w, e })).sort((a, b) => b.w - a.w);
  for (const { w, e } of order) if (w > 0) exchangeFor(p, e, w, keep);
  p.waitingShard = -1;
}

/** The broker's rate and crit chance for the mastery it has reached (V-FORGE-11). */
export function brokerTerms(p: Player): { rate: number; critChance: number } {
  const steps = p.rules.posts.mastery;
  const tier = steps.filter((s) => p.brokerMastery >= s.hours).length;
  const tiers = p.rules.broker.tiers;
  return tiers[Math.min(tier, tiers.length - 1)] ?? p.rules.forge.exchange;
}

/**
 * One hour of the broker (V-FORGE-11): a creature at the exchange trades the surplus shards (what the player keeps for the Forge stays) for
 * the elements the orders are waiting on, at its rate. It works whenever a creature stands there, visits or not.
 */
export function brokerHour(p: Player, share: number): void {
  const rules = p.rules;
  p.brokerMastery += share;
  p.wk.brokerHours += share;
  const terms = brokerTerms(p);
  const keep = rules.forge.giveReserveShards;
  for (let e = 0; e < ELEMENTS.length; e++) {
    const orders = Math.min(
      (p.weakByElement[e] ?? 0) - (p.pendingByElement[e] ?? 0),
      Math.max(1, p.anvils.length) * 3,
    );
    if (orders <= 0) continue;
    const want = orders * rules.forge.shard;
    if ((p.shards[e] ?? 0) < want) exchangeFor(p, e, want, keep, terms);
  }
}

/** What an idle anvil does at the start of an hour: begin a piece if it has an order and the inputs, else say what is missing. */
function tryStart(p: Player, anvil: Anvil): 'started' | 'scrap' | 'shard' | 'nothing' {
  const rules = p.rules;
  const element = chooseElement(p);
  if (element < 0) return 'nothing';
  if ((p.stock[R.scrap] ?? 0) < rules.forge.scrap) return 'scrap';
  if ((p.shards[element] ?? 0) < rules.forge.shard) {
    p.waitingShard = element;
    return 'shard';
  }
  // Reach (V-FORGE-8): an optimiser reaches for better rarity with Essence it does not need elsewhere.
  let reach: 'rare' | 'epic' | null = null;
  if (p.policy === 'optimiser') {
    const spare = (p.stock[R.essence] ?? 0) - rules.forge.reachReserveEssence;
    const epic = rules.forge.reach.epic;
    if (spare >= epic.essence) reach = 'epic';
    else if (spare >= rules.forge.reach.rare.essence) reach = 'rare';
  }
  debit(p, R.scrap, rules.forge.scrap, 'pieces');
  debitShard(p, element, rules.forge.shard, 'pieces');
  let hours = rules.forge.pieceHours;
  let odds: readonly number[] = rules.forge.baseOdds;
  if (reach) {
    const r = rules.forge.reach[reach];
    debit(p, R.essence, r.essence, 'reach');
    hours = r.hours;
    odds = r.odds;
  }
  anvil.rarity = rollRarity(p, orderOdds(rules, odds, p.anvilKit === 'loupe'));
  anvil.need = hours;
  anvil.progress = 0;
  anvil.element = element;
  anvil.working = true;
  p.pendingByElement[element] = (p.pendingByElement[element] ?? 0) + 1;
  return 'started';
}

/** One hour of every active anvil (V-FORGE-1, V-FORGE-2): work on a piece, or tinker and say why (T-4). */
export function stepAnvils(p: Player, share: number, count: number, server: Server): void {
  const rules = p.rules;
  const cap = rules.forge.floorPiecesPerAnvil * count;
  const wk = p.wk.forge;
  for (let i = 0; i < count; i++) {
    const anvil = p.anvils[i]!;
    anvil.mastery += share;
    const smith = p.creatures[p.anvilOcc[i] ?? -1];
    if (smith) smith.smithHours += share;
    if (anvil.working && anvil.progress >= anvil.need) {
      if (p.floor.length >= cap) {
        wk[3] = (wk[3] ?? 0) + share;
        credit(p, R.scrap, share / rules.forge.tinkerScrapEveryHours, 'tinkering');
        continue;
      }
      deliver(p, anvil, server);
    }
    if (!anvil.working) {
      const result = tryStart(p, anvil);
      if (result !== 'started') {
        const bucket = result === 'scrap' ? 1 : result === 'shard' ? 2 : 4;
        wk[bucket] = (wk[bucket] ?? 0) + share;
        credit(p, R.scrap, share / rules.forge.tinkerScrapEveryHours, 'tinkering');
        continue;
      }
    }
    let speed = 1 + masteryBonus(rules, anvil.mastery);
    if (p.anvilKit === 'tongs' && anvil.rarity === 0) speed *= rules.kit.tongs.speed;
    if (p.anvilKit === 'loupe') speed *= rules.kit.loupe.speed;
    anvil.progress += share * speed;
    wk[0] = (wk[0] ?? 0) + share;
    if (anvil.progress >= anvil.need && p.floor.length < cap) deliver(p, anvil, server);
  }
}

function deliver(p: Player, anvil: Anvil, server: Server): void {
  p.floor.push({ ilvl: server.fire, rarity: anvil.rarity, element: anvil.element });
  anvil.working = false;
  anvil.progress = 0;
  p.wk.piecesMade += 1;
}

/** Recounts the slots that are "weaker" than the fire allows, by the element of their creature (the "for my team" need). */
export function recomputeWeak(p: Player, fire: number): void {
  p.weakByElement.fill(0);
  const limit = fire - p.rules.forge.weakMargin;
  for (const c of p.creatures)
    for (const g of c.gear)
      if (g < limit) p.weakByElement[c.element] = (p.weakByElement[c.element] ?? 0) + 1;
}

export const bagTotal = (p: Player): number => (p.bag[0] ?? 0) + (p.bag[1] ?? 0) + (p.bag[2] ?? 0);

/**
 * A piece comes home: it goes on the weakest slot of a creature of its element if that is better, else into the bag
 * (V-GEAR-6: worn gear does not count). Returns false when the bag is full and there was no slot (the piece stays where it was).
 */
export function equipOrBag(p: Player, piece: Piece, fire: number): boolean {
  const limit = fire - p.rules.forge.weakMargin;
  let target: { creature: Creature; slot: number } | null = null;
  let weakest = Infinity;
  for (const c of p.creatures) {
    if (c.element !== piece.element) continue;
    for (let s = 0; s < c.gear.length; s++) {
      const g = c.gear[s]!;
      if (g < limit && g < piece.ilvl && g < weakest) {
        weakest = g;
        target = { creature: c, slot: s };
      }
    }
  }
  if (target) {
    const old = target.creature.gear[target.slot]!;
    target.creature.gear[target.slot] = piece.ilvl;
    target.creature.gearRarity[target.slot] = piece.rarity;
    target.creature.gearLines[target.slot] = rollLines(
      p.lineRng,
      p.rules,
      piece.rarity,
      piece.ilvl,
    );
    p.wk.piecesWorn += 1;
    if (old > 0 && bagTotal(p) < p.rules.forge.bag) {
      p.bag[0] = (p.bag[0] ?? 0) + 1;
      p.bagNever += 1;
    }
    return true;
  }
  if (bagTotal(p) >= p.rules.forge.bag) return false;
  p.bag[piece.rarity] = (p.bag[piece.rarity] ?? 0) + 1;
  p.bagNever += 1;
  return true;
}

/** The visit: finished pieces come home from the Forge floor (V-FORGE-5). */
export function collectFloor(p: Player, server: Server): void {
  const kept: Piece[] = [];
  for (const piece of p.floor) {
    if (equipOrBag(p, piece, server.fire)) {
      p.pendingByElement[piece.element] = Math.max(0, (p.pendingByElement[piece.element] ?? 0) - 1);
    } else kept.push(piece);
  }
  p.floor = kept;
}

/** Bulk dismantle (V-GEAR-7): an optimiser every visit, a set-and-forget player when the bag nears full. Epics are kept. */
export function dismantleBag(p: Player): void {
  const rules = p.rules;
  const nearlyFull = bagTotal(p) >= rules.forge.tidyAt;
  if (p.policy === 'setAndForget' && !nearlyFull) return;
  const upTo = p.policy === 'optimiser' ? 1 : 2;
  for (let rarity = 0; rarity <= upTo; rarity++) {
    const n = p.bag[rarity] ?? 0;
    if (n === 0) continue;
    const y = rules.forge.dismantle[rarity]!;
    credit(p, R.scrap, n * y.scrap, 'dismantling');
    for (let e = 0; e < ELEMENTS.length; e++)
      creditShard(p, e, (n * y.shards) / ELEMENTS.length, 'dismantling');
    credit(p, R.essence, n * y.essence, 'dismantling');
    p.wk.piecesDismantled += n;
    p.bag[rarity] = 0;
  }
}

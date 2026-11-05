/**
 * The lab's gear model (docs/design/combat/gear-plan.md, section 5; slice 2): what a creature of a role and element wears at an
 * item level, as expected values, so a fight can play with gear and the report can price it before any gear number moves.
 *
 * **Nothing is copied from the game.** The lines, their pip values, their weights per slot, the bases and the roll rules are the
 * game's content (`gearContent`, `linePool`, `RULES.gear`); the pip thresholds and the lines per rarity are the valley's
 * (`VALLEY_RULES.gear`); the effect lines and the stat lines go through the game's own `gearFx` and `applyGear`, the functions
 * the worker calls, so the lab and the game cannot drift. What the lab owns is small and listed here: `RARITY_FACTOR` (the plan's
 * start, section 3), `POOL_LEVEL_DIVISOR` (the plan's "times five", OPEN 10) and `rarityMix` (which rarities a creature wears).
 *
 * **Expected, never rolled.** A piece of rarity R at item level L has `LINES_PER_RARITY[R]` lines drawn by the game's pool weights
 * (`linePool` for the base, the rarity and the level) and each rolls its pip counting down from the best pip L allows with the
 * game's tier weights (`RULES.gear.tierWeights`, renormalised when fewer pips exist). The loadout is the sum over every line of
 * (the chance the piece has it) x (the line's effect at each pip, weighted) x the rarity factor, plus the base (its stats and a
 * Charm's own line) once. Chances use the draw with replacement, 1 - (1 - w/W)^n (close for the pool's size; the one special line
 * per item and the draw without replacement are not modelled). A flag line (Unbothered, Refuse to Fall, Clinging) is worn when its
 * chance is at least one half. Set bonuses are not worn (a "typical" creature wears no full set). That is the *typical* creature:
 * a planner who keeps the best lines does better (and is `singleLineLoadout`'s question, one line at a time).
 * The numbers are deterministic: the same arguments give the same loadout.
 */
import {
  RULES,
  VALLEY_RULES,
  content,
  applyGear,
  basesFor,
  eligibleBases,
  gearContent,
  gearFx,
  itemOf,
  linePool,
  type GearBase,
  type GearFx,
  type GearItem,
  type GearRarity,
  type GearSlot,
  type GearTag,
} from '@creatures/game';
import type { Placement } from '@creatures/engine/v2';
import { formStats } from './species';
import type { Role } from './types';

/** The plain stat lines of a loadout, added to the resolved fighter (as the worker's `buildFighter` does). Armour is in `fx`. */
export interface GearStatAdds {
  readonly hp: number;
  readonly atk: number;
  readonly spd: number;
  readonly critChanceBp: number;
  readonly critDamageBp: number;
}

/** What a creature's worn gear gives in a fight: the effect sheet (`Placement.gear`) and the stat adds. */
export interface Loadout {
  readonly fx: GearFx;
  readonly stats: GearStatAdds;
}

/** A placement that wears gear: the engine's placement with its effect sheet, and the stat adds the lab's resolver applies. */
export type GearedPlacement = Placement & { readonly gearStats?: GearStatAdds };

const NO_STATS: GearStatAdds = { hp: 0, atk: 0, spd: 0, critChanceBp: 0, critDamageBp: 0 };
export const NO_LOADOUT: Loadout = { fx: {}, stats: NO_STATS };

// ---------- what the lab owns (the plan's starts; each is one edit) ----------

/** The value of every rolled line by rarity (gear-plan section 3, "a start for the lab"): 1 line x1.0, 3 x0.73, 5 x0.70. */
export const RARITY_FACTOR: Readonly<Record<GearRarity, number>> = {
  common: 1,
  rare: 0.73,
  epic: 0.7,
};

/** The lines a piece rolls by rarity: the valley's 1 / 3 / 5 (V-GEAR-12). */
export const LINES_PER_RARITY: Readonly<Record<GearRarity, number>> = {
  common: VALLEY_RULES.gear.lines[0] as number,
  rare: VALLEY_RULES.gear.lines[1] as number,
  epic: VALLEY_RULES.gear.lines[2] as number,
};

/**
 * The game's pool gates (a base's and a line's `minItemLevel`) are on its 1 to 20 scale; the valley's item level runs to about 100. The
 * plan's start for the remap (OPEN 10) is times five, so a pool gate of 10 opens at item level 50: the lab reads item level / 5.
 */
export const POOL_LEVEL_DIVISOR = 5;

/** The rarities of the three pieces (hat, scarf, charm) a creature wears at an item level: better gear, rarer pieces. */
export function rarityMix(itemLevel: number): readonly [GearRarity, GearRarity, GearRarity] {
  if (itemLevel < 20) return ['common', 'common', 'rare'];
  if (itemLevel < 40) return ['common', 'rare', 'rare'];
  return ['rare', 'rare', 'epic'];
}

// ---------- the ladder ----------

/** The game's pool level for a valley item level. */
export const poolLevel = (itemLevel: number): number =>
  Math.max(1, Math.min(RULES.gear.maxItemLevel, Math.ceil(itemLevel / POOL_LEVEL_DIVISOR)));

/** The best pip (0 is I, 4 is V) an item level allows: the valley's thresholds (`pipFrom`: 10, 25, 50, 80). */
export const bestPip = (itemLevel: number): number =>
  VALLEY_RULES.gear.pipFrom.filter((from) => itemLevel >= from).length;

/** The chance of each pip a line rolls at an item level: the game's tier weights counting down from the best pip, renormalised. */
export function pipChances(itemLevel: number): { readonly pip: number; readonly chance: number }[] {
  const best = bestPip(itemLevel);
  const rows = RULES.gear.tierWeights.flatMap((weight, i) =>
    best - i >= 0 ? [{ pip: best - i, weight }] : [],
  );
  const total = rows.reduce((s, r) => s + r.weight, 0);
  return rows.map((r) => ({ pip: r.pip, chance: r.weight / total }));
}

// ---------- one piece ----------

type Wearer = { role: Role; element: string };
type Stats = { hp: number; atk: number; spd: number };
type Effect = {
  readonly fx: Readonly<Record<string, number | boolean | Readonly<Record<string, number>>>>;
  readonly stats: GearStatAdds;
};

/** An item that carries only what the base gives, at a best pip (the item level that the game's band of a Charm's own line reads). */
const itemWith = (
  base: GearBase,
  rarity: GearRarity,
  pip: number,
  lines: readonly { id: string; tier: number }[],
): GearItem => itemOf(base.id, rarity, RULES.gear.tierFromItemLevel[pip] as number, lines);

/** What an item gives this wearer, through the game's `gearFx` and `applyGear`. */
function effectOf(item: GearItem, wearer: Wearer, stats: Stats): Effect {
  const w = { role: wearer.role, element: wearer.element as never };
  const folded = applyGear(stats, undefined, w, [item]);
  return {
    fx: gearFx(w, [item]) as Effect['fx'],
    stats: {
      hp: folded.stats.hp - stats.hp,
      atk: folded.stats.atk - stats.atk,
      spd: folded.stats.spd - stats.spd,
      critChanceBp: folded.crit?.chanceBp ?? 0,
      critDamageBp: folded.crit?.damageBp ?? 0,
    },
  };
}

/** The best base of a slot a creature would wear: its element's piece (Hat, Scarf), its role's Charm, else its element's. */
export function baseOf(slot: GearSlot, wearer: Wearer, itemLevel: number): GearBase {
  const level = poolLevel(itemLevel);
  if (slot === 'charm') {
    const role = basesFor('charm', wearer.role)[0];
    if (role !== undefined) return role;
  }
  const own = eligibleBases(slot, wearer.element as GearTag, level);
  const base = own[own.length - 1] ?? basesFor(slot, wearer.element as GearTag)[0];
  if (base === undefined) throw new Error(`no ${slot} base for ${wearer.element}`);
  return base;
}

/** Joins a table field and its key in the accumulator (`vsElementBp` and `ember`). */
const TABLE = '\u0000';

/** An accumulator of expected effect: numbers add; a flag adds its chance. */
class Sum {
  readonly numbers = new Map<string, number>();
  readonly flags = new Map<string, number>();
  readonly stats: Record<keyof GearStatAdds, number> = {
    hp: 0,
    atk: 0,
    spd: 0,
    critChanceBp: 0,
    critDamageBp: 0,
  };

  /** Adds `weight` times the difference between `e` and `from` (the base's own effect, which is not a line's). */
  add(e: Effect, from: Effect, weight: number): void {
    for (const [k, v] of Object.entries(e.fx)) {
      const before = from.fx[k];
      if (typeof v === 'object') {
        // A table by element or role (Hunter, Ward, Beside the mark-maker): each entry is a number of its own.
        const was = typeof before === 'object' ? before : {};
        for (const [key, n] of Object.entries(v)) {
          const name = `${k}${TABLE}${key}`;
          this.numbers.set(name, (this.numbers.get(name) ?? 0) + weight * (n - (was[key] ?? 0)));
        }
      } else if (typeof v === 'number') {
        this.numbers.set(
          k,
          (this.numbers.get(k) ?? 0) + weight * (v - (typeof before === 'number' ? before : 0)),
        );
      } else if (before !== true) this.flags.set(k, (this.flags.get(k) ?? 0) + weight);
    }
    for (const k of Object.keys(this.stats) as (keyof GearStatAdds)[])
      this.stats[k] += weight * (e.stats[k] - from.stats[k]);
  }

  /** Adds an effect whole (the base). */
  addWhole(e: Effect): void {
    this.add(e, { fx: {}, stats: NO_STATS }, 1);
  }
}

/** One piece's expected effect on the sum: its base once, its lines by their chance, their pip mix and the rarity factor. */
function addPiece(
  sum: Sum,
  slot: GearSlot,
  rarity: GearRarity,
  itemLevel: number,
  wearer: Wearer,
  stats: Stats,
): void {
  const base = baseOf(slot, wearer, itemLevel);
  const pips = pipChances(itemLevel);
  const best = bestPip(itemLevel);
  const plain = effectOf(itemWith(base, rarity, best, []), wearer, stats);
  sum.addWhole(plain);
  const pool = linePool(base, rarity, poolLevel(itemLevel));
  const total = pool.reduce((s, p) => s + p.weight, 0);
  const n = LINES_PER_RARITY[rarity];
  const factor = RARITY_FACTOR[rarity];
  const scaled = new Sum();
  for (const { line, weight } of pool) {
    const chance = 1 - Math.pow(1 - weight / total, n);
    for (const { pip, chance: q } of line.single === true ? [{ pip: 0, chance: 1 }] : pips) {
      const e = effectOf(itemWith(base, rarity, best, [{ id: line.id, tier: pip }]), wearer, stats);
      scaled.add(e, plain, chance * q);
    }
  }
  for (const [k, v] of scaled.numbers) sum.numbers.set(k, (sum.numbers.get(k) ?? 0) + v * factor);
  for (const [k, v] of scaled.flags) sum.flags.set(k, (sum.flags.get(k) ?? 0) + v);
  for (const k of Object.keys(sum.stats) as (keyof GearStatAdds)[])
    sum.stats[k] += scaled.stats[k] * factor;
}

const SLOTS: readonly GearSlot[] = ['hat', 'scarf', 'charm'];

function finish(sum: Sum): Loadout {
  const fx: Record<string, number | boolean | Record<string, number>> = {};
  for (const [k, v] of [...sum.numbers].sort(([a], [b]) => a.localeCompare(b))) {
    const r = Math.round(v);
    if (r === 0) continue;
    const [field, key] = k.split(TABLE);
    if (key === undefined) fx[k] = r;
    else {
      const table = (fx[field as string] ??= {}) as Record<string, number>;
      table[key] = r;
    }
  }
  for (const [k, p] of [...sum.flags].sort(([a], [b]) => a.localeCompare(b)))
    if (p >= 0.5) fx[k] = true;
  const s = sum.stats;
  return {
    fx,
    stats: {
      hp: Math.round(s.hp),
      atk: Math.round(s.atk),
      spd: Math.round(s.spd),
      critChanceBp: Math.round(s.critChanceBp),
      critDamageBp: Math.round(s.critDamageBp),
    },
  };
}

/** A reference creature's stats for a role and element (the first stage 1 form of that role and element, at level 25), for callers with no creature. */
export function referenceStats(role: Role, element: string): Stats {
  const form = content.creatures.find(
    (c) => c.role === role && c.element === element && c.stage === 1,
  );
  const s = formStats(form?.id ?? 'tidewing', 25);
  return { hp: s.hp, atk: s.atk, spd: s.spd };
}

const memo = new Map<string, Loadout>();

/**
 * What a creature of this role and element wears at an item level (a valley item level, 1 to about 100): three pieces (Hat and Scarf of
 * its element, the Charm of its role), their rarities by `rarityMix`, the expected lines (see the file comment). `stats` are the
 * creature's stats at its level (a percentage line reads them; default `referenceStats`). Deterministic.
 */
export function loadoutAt(
  itemLevel: number,
  role: Role,
  element: string,
  stats: Stats = referenceStats(role, element),
): Loadout {
  const level = Math.max(1, Math.round(itemLevel));
  const key = `${level}|${role}|${element}|${stats.hp},${stats.atk},${stats.spd}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const sum = new Sum();
  const mix = rarityMix(level);
  SLOTS.forEach((slot, i) =>
    addPiece(sum, slot, mix[i] as GearRarity, level, wearer(role, element), stats),
  );
  const out = finish(sum);
  memo.set(key, out);
  return out;
}
const wearer = (role: Role, element: string): Wearer => ({ role, element });

/**
 * One line alone, at its expected pip for an item level and a rarity, on a fitting wearer: the line's effect with no base and no other
 * line (the per-line power table's input). The line is worn at chance 1 (a planner's pick). Empty when it does nothing for them.
 */
export function singleLineLoadout(
  lineId: string,
  itemLevel: number,
  rarity: GearRarity,
  role: Role,
  element: string,
  stats: Stats = referenceStats(role, element),
): Loadout {
  const w = wearer(role, element);
  const slot: GearSlot = 'charm';
  const base = baseOf(slot, w, itemLevel);
  const best = bestPip(itemLevel);
  const plain = effectOf(itemWith(base, rarity, best, []), w, stats);
  const line = gearContent.lines.find((l) => l.id === lineId);
  if (line === undefined) throw new Error(`unknown gear line ${lineId}`);
  const sum = new Sum();
  for (const { pip, chance } of line.single === true
    ? [{ pip: 0, chance: 1 }]
    : pipChances(itemLevel))
    sum.add(
      effectOf(itemWith(base, rarity, best, [{ id: lineId, tier: pip }]), w, stats),
      plain,
      chance,
    );
  const factor = RARITY_FACTOR[rarity];
  const scaled = new Sum();
  for (const [k, v] of sum.numbers) scaled.numbers.set(k, v * factor);
  for (const [k, v] of sum.flags) scaled.flags.set(k, v);
  for (const k of Object.keys(sum.stats) as (keyof GearStatAdds)[])
    scaled.stats[k] = sum.stats[k] * factor;
  for (const [k, p] of scaled.flags) scaled.flags.set(k, p >= 0.5 ? 1 : 0);
  return finish(scaled);
}

/** Whether a loadout does anything. */
export const loadoutEmpty = (l: Loadout): boolean =>
  Object.keys(l.fx).length === 0 && Object.values(l.stats).every((v) => v === 0);

// ---------- into a fight ----------

/**
 * The placement wearing the gear of `itemLevel` (the effect sheet in `gear`, the stat adds in `gearStats`; the lab's resolver applies both).
 * Without an item level (or 0) the placement comes back as it was: a fight with gear off is identical.
 */
export function withGear<P extends Placement>(
  p: P,
  itemLevel: number | undefined,
): P | (P & GearedPlacement) {
  if (itemLevel === undefined || itemLevel <= 0) return p;
  const st = formStats(p.formId, p.level);
  const l = loadoutAt(itemLevel, st.role, st.element, { hp: st.hp, atk: st.atk, spd: st.spd });
  if (loadoutEmpty(l)) return p;
  return {
    ...p,
    ...(Object.keys(l.fx).length ? { gear: l.fx } : {}),
    gearStats: l.stats,
  };
}

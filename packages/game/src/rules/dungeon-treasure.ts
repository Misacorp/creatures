/**
 * The treasure of a rare mystery room (the Blue Chasm, `docs/design/dungeon-paths.md`): rolled once with
 * the room's reveal from the player's own progress, shown before they choose, kept in the run's state and
 * paid at the run's end if the run did not end in a defeat. Pure: the dice are the injected rng (the
 * worker's live gear rng), and what the player already has comes in as `TreasureContext`.
 *
 * One kind is drawn evenly among the kinds that can apply to this player: an Epic gear piece at the item
 * level of the run's depth, a blueprint they do not know yet one tier above their best, two great supplies
 * of one kind, or a stack of shards of the team's elements with some glimmer. (A creature of a species the
 * player lacks is a planned fifth kind: granting a creature from a run is its own change.)
 */
import { TREASURE_TABLES, type TreasureTableName } from '../content/dungeon-schema';
import { SUPPLY_KINDS } from '../content/expedition-schema';
import { baseMinLevel } from '../content/gear';
import type { GearBase } from '../content/gear-schema';
import type { Element } from '../content/schema';
import { int, type Rng } from '../rng';
import { RULES } from './config';
import {
  addParts,
  blueprintBases,
  pickBlueprintBase,
  rollDungeonItem,
  shardOf,
  type GearItem,
  type PartsBundle,
} from './gear';

/** A treasure table in `RULES.dungeon` (`treasure` for the Blue Chasm, `doorTreasure` for the Hungry Door). */
export interface TreasureTable {
  readonly gearRarity: 'common' | 'rare' | 'epic';
  readonly supplies: { readonly tier: string; readonly count: number };
  readonly shards: number;
  readonly glimmer: number;
  /** Whether a blueprint the player lacks can be drawn. */
  readonly blueprints: boolean;
}

/** The table a name stands for. */
export function treasureTable(name: TreasureTableName = TREASURE_TABLES[0]): TreasureTable {
  return name === 'door' ? RULES.dungeon.doorTreasure : RULES.dungeon.treasure;
}

export const TREASURE_KINDS = ['gear', 'blueprint', 'supplies', 'shards'] as const;
export type TreasureKind = (typeof TREASURE_KINDS)[number];

export type Treasure =
  | { kind: 'gear'; item: GearItem }
  | { kind: 'blueprint'; baseId: string }
  | { kind: 'supplies'; supplyId: string; count: number }
  /** Shards of the team's elements and glimmer, as parts. */
  | { kind: 'shards'; parts: PartsBundle };

/** What the player and the run are, for a treasure to fit them. */
export interface TreasureContext {
  /** The run's depth (the item level of the gear piece follows it). */
  depth: number;
  /** The elements of the team's creatures, one entry per creature (a repeat counts twice). */
  elements: readonly Element[];
  /** The base ids of every blueprint the player knows. */
  knownBlueprints: ReadonlySet<string>;
}

/** The supply kinds a treasure may hold: every kind but the lure (it is made from Bait in the Workshop). */
const SUPPLY_TREASURE_KINDS = SUPPLY_KINDS.filter((k) => k !== 'lure');

/**
 * The bases a treasure blueprint is drawn from: among the craftable bases the player does not know, those
 * of the nearest tier above their best (a base's tier is its `minItemLevel`: 1, 5, 10, then the gear
 * sets' 12); when nothing unknown is above their best, the highest unknown tier below it. Empty when they
 * know every blueprint.
 */
export function treasureBlueprintBases(known: ReadonlySet<string>): GearBase[] {
  const all = blueprintBases();
  const best = all.reduce((m, b) => (known.has(b.id) ? Math.max(m, baseMinLevel(b)) : m), 0);
  const unknown = all.filter((b) => !known.has(b.id));
  const above = unknown.filter((b) => baseMinLevel(b) > best);
  const pool = above.length > 0 ? above : unknown;
  if (pool.length === 0) return [];
  const levels = pool.map(baseMinLevel);
  const level = above.length > 0 ? Math.min(...levels) : Math.max(...levels);
  return pool.filter((b) => baseMinLevel(b) === level);
}

/** The kinds that can be drawn for this player: all of them, but a blueprint only when they lack one. */
export function treasureKinds(
  ctx: TreasureContext,
  table: TreasureTable = RULES.dungeon.treasure,
): TreasureKind[] {
  const blueprint = table.blueprints && treasureBlueprintBases(ctx.knownBlueprints).length > 0;
  return TREASURE_KINDS.filter((k) => k !== 'blueprint' || blueprint);
}

/**
 * Rolls a treasure. The draws run in a fixed order: the kind (evenly among `treasureKinds`), then the
 * kind's own dice (gear: the team element it is tagged with, then the piece's base and lines; blueprint:
 * the base; supplies: the kind). Shards need no dice: one for each creature, by its element.
 */
export function rollTreasure(
  rng: Rng,
  ctx: TreasureContext,
  t: TreasureTable = RULES.dungeon.treasure,
): Treasure {
  const kinds = treasureKinds(ctx, t);
  const kind = kinds[int(rng, kinds.length)] ?? 'shards';
  const elements: readonly Element[] = ctx.elements.length > 0 ? ctx.elements : ['tide'];
  switch (kind) {
    case 'gear': {
      const element = elements[int(rng, elements.length)] as Element;
      return { kind, item: rollDungeonItem(rng, t.gearRarity, ctx.depth, false, element) };
    }
    case 'blueprint': {
      const base = pickBlueprintBase(rng, treasureBlueprintBases(ctx.knownBlueprints));
      if (base === undefined) throw new Error('no blueprint to find');
      return { kind, baseId: base.id };
    }
    case 'supplies': {
      const supplyKind = SUPPLY_TREASURE_KINDS[int(rng, SUPPLY_TREASURE_KINDS.length)] as string;
      return { kind, supplyId: `${supplyKind}-${t.supplies.tier}`, count: t.supplies.count };
    }
    case 'shards': {
      let parts: PartsBundle = {};
      for (let i = 0; i < t.shards; i++) {
        const element = elements[i % elements.length] as Element;
        parts = addParts(parts, { [shardOf(element)]: 1 });
      }
      return { kind, parts: addParts(parts, { glimmer: t.glimmer }) };
    }
  }
}

/**
 * A realistic bag for the creature page's item pickers (workbench only): fifteen to twenty items a slot,
 * from the real gear bases, with item levels, rarities, stats and lines in the server's wording. Some are
 * too high a level for the creature (shown with the reason), one is worn by another creature. Built by a
 * pure formula from a short table, so every scene shows the same bag. Fixture data only.
 */
import {
  gearBase,
  gearLine,
  itemLines,
  itemOf,
  itemStats,
  statText,
  tierCap,
  type ItemLine,
} from '@creatures/game';
import type { WornGear } from '../gear-types';
import type { GearItem, GearLine, GearRarity, GearSlot, GearStat, GearTag } from '../gear-types';

/** One row of the table: the base, the rarity, the item level, who wears it. */
type Spec = readonly [baseId: string, rarity: GearRarity, itemLevel: number, wornBy?: string];

/** The creature that wears the item in the bag, other than the creature of the page. */
export const OTHER_WEARER = 'sample-other';

const HATS: readonly Spec[] = [
  ['emberkeepers-crown', 'epic', 15],
  ['coal-warm-cap', 'rare', 15],
  ['forge-hood', 'rare', 14],
  ['bark-hood', 'rare', 13, OTHER_WEARER],
  ['brine-hood', 'rare', 12],
  ['wayfarers-hood', 'rare', 11],
  ['acorn-cap', 'rare', 10],
  ['coal-warm-cap', 'common', 9],
  ['trail-cap', 'rare', 8],
  ['static-hood', 'common', 7],
  ['felt-hat', 'common', 6],
  ['forge-hood', 'common', 5],
  ['acorn-cap', 'common', 4],
  ['kelp-cap', 'common', 2],
  ['trail-cap', 'common', 1],
  ['thundercap', 'rare', 16],
  ['tidecallers-crown', 'epic', 17],
  ['greenwardens-crown', 'epic', 18],
  ['storm-cowl', 'epic', 20],
  // A piece of the Forge-Warm Kit (a gear set), for the set scenes.
  ['forge-warm-bonnet', 'rare', 12],
];

const SCARVES: readonly Spec[] = [
  ['bark-shawl', 'rare', 12],
  ['forge-scarf', 'rare', 14],
  ['woolen-wrap', 'rare', 11],
  ['festival-hearth-scarf', 'rare', 13],
  ['ember-muffler', 'common', 9],
  ['seafoam-scarf', 'common', 8],
  ['copper-wrap', 'rare', 10, OTHER_WEARER],
  ['patch-scarf', 'common', 7],
  ['leafknit-scarf', 'common', 7],
  ['static-wrap', 'common', 6],
  ['brine-shawl', 'rare', 15],
  ['patch-scarf', 'common', 3],
  ['travellers-mantle', 'epic', 16],
  ['emberkeepers-mantle', 'epic', 18],
  ['tidewardens-mantle', 'epic', 19],
  ['stormcallers-mantle', 'epic', 22],
  ['forge-warm-sash', 'rare', 12],
];

const CHARMS: readonly Spec[] = [
  ['crossroads-compass', 'rare', 10],
  ['cinder-charm', 'rare', 14],
  ['hearth-bell', 'rare', 13],
  ['pounce-charm', 'rare', 13],
  ['wardens-bell', 'rare', 13],
  ['footprint-charm', 'common', 12],
  ['trail-charm', 'common', 8],
  ['tidepool-charm', 'common', 6],
  ['mossy-charm', 'common', 15, OTHER_WEARER],
  ['static-charm', 'common', 3],
  ['festival-lantern-charm', 'rare', 15],
  ['cinder-charm', 'epic', 18],
  ['pounce-charm', 'epic', 20],
  ['forge-warm-token', 'rare', 12],
];

const TABLES: Readonly<Record<GearSlot, readonly Spec[]>> = {
  hat: HATS,
  scarf: SCARVES,
  charm: CHARMS,
};

/** The lines each tag's items roll in the sample (real line ids, so the card, the compare and the server agree). */
const LINE_POOL: Readonly<Record<string, readonly string[]>> = {
  ember: ['ember-reaction', 'first-pounce', 'ember-hunter'],
  tide: ['tide-attunement', 'aimed-ward', 'tide-hunter'],
  grove: ['aimed-ward', 'hp', 'grove-reaction'],
  spark: ['spark-reaction', 'crit-chance', 'spark-attunement'],
  mire: ['mire-reaction', 'armor', 'mire-ward'],
  neutral: ['crit-damage', 'trail-xp', 'attack'],
  explorer: ['trail-xp', 'quick-feet', 'lucky-find'],
  guard: ['armor', 'cover', 'all-damage-taken'],
  support: ['mend', 'cover', 'boost'],
  setter: ['marking-hit', 'armor', 'owners-mark'],
  payoff: ['payoffs-pounce', 'crit-damage', 'first-pounce'],
};

/** The item's local Attack line (real content: "+60% Attack (this item)" at tier III), on an epic Hat or Scarf. */
const LOCAL_LINE = { id: 'attack-local-pct', tier: 2 } as const;

/** The tier (0 to 4) of a rolled line by rarity; the first line is the better one. */
const RARITY_TIER: Readonly<Record<GearRarity, number>> = { common: 1, rare: 2, epic: 3 };

/**
 * An item as the server's gear view lists it, from the game's own rules: the stats (`itemStats`) and every line
 * with its text, tier and best tier (`itemLines`) for the rolled lines given. Worn by nobody. Fixture data only.
 */
export function sampleItem(
  id: string,
  baseId: string,
  rarity: GearRarity,
  itemLevel: number,
  rolled: readonly ItemLine[],
): GearItem {
  const base = gearBase(baseId);
  const tag: GearTag = base?.tag ?? 'neutral';
  const rules = itemOf(baseId, rarity, itemLevel, rolled);
  const stats: GearStat[] = itemStats(rules).map((s) => ({
    stat: s.stat,
    value: s.value,
    base: s.base,
    text: statText(s.stat, s.value),
  }));
  const lines: GearLine[] = itemLines(rules).map((l) => ({
    id: l.id,
    name: l.name,
    text: l.text,
    about: l.about,
    source: l.source,
    tier: l.tier,
    bestTier: l.bestTier,
    local: l.local,
    active: true,
  }));
  return {
    id,
    baseId,
    slot: rules.slot,
    tag,
    rarity,
    festival: base?.festival === true,
    itemLevel,
    stats,
    lines,
    needs: {
      level: Math.max(itemLevel, 1),
      role: ['guard', 'support', 'setter', 'payoff'].includes(tag) ? tag : null,
    },
    equippedOn: null,
    markedForDismantle: false,
    dismantle: {
      scrap: { min: 1, max: 3 },
      shards: { min: 0, max: 1, element: null },
      glimmer: { min: 0, max: 0 },
      essence: { min: 0, max: 0 },
    },
    source: 'craft',
    createdAt: 0,
    madeBy: null,
    origin: null,
  };
}

/** One bag item from a table row: stats and lines are the game's own (`itemStats`, `itemLines`). */
function build(
  slot: GearSlot,
  index: number,
  spec: Spec,
  creatureId: string,
  worn: boolean,
): GearItem {
  const [baseId, rarity, itemLevel, wornBy] = spec;
  const base = gearBase(baseId);
  const tag: GearTag = base?.tag ?? 'neutral';
  const local = rarity === 'epic' && slot !== 'charm';
  const pool = LINE_POOL[tag] ?? LINE_POOL['neutral'] ?? [];
  const count = rarity === 'common' ? 1 : rarity === 'rare' ? 2 : 3;
  const rolled = pool
    .filter((id) => gearLine(id) !== undefined)
    .slice(0, count)
    .map((id, i) => ({
      id,
      tier: Math.min(tierCap(itemLevel), Math.max(0, RARITY_TIER[rarity] - Math.min(i, 1))),
    }));
  return {
    ...sampleItem(
      `bag-${slot}-${String(index + 1).padStart(2, '0')}`,
      baseId,
      rarity,
      itemLevel,
      local ? [...rolled, LOCAL_LINE] : rolled,
    ),
    equippedOn: worn ? creatureId : (wornBy ?? null),
  };
}

/** Which table row of each slot the creature wears (an index into that slot's table), or none. */
export type WornRows = Readonly<Partial<Record<GearSlot, number>>>;

/** The whole bag (all three slots), as the server's gear view would list it for the creature `creatureId`. */
export function allBagItems(creatureId: string, wornRows: WornRows): GearItem[] {
  return (['hat', 'scarf', 'charm'] as const).flatMap((slot) =>
    TABLES[slot].map((spec, index) =>
      build(slot, index, spec, creatureId, wornRows[slot] === index),
    ),
  );
}

/** What a creature wears, taken from the bag: the items the creature `creatureId` is marked to wear. */
export function wornFromBag(items: readonly GearItem[], creatureId: string): WornGear[] {
  return (['hat', 'scarf', 'charm'] as const).flatMap((slot) => {
    const item = items.find((i) => i.slot === slot && i.equippedOn === creatureId);
    return item === undefined
      ? []
      : [
          {
            id: item.id,
            baseId: item.baseId,
            slot,
            rarity: item.rarity,
            itemLevel: item.itemLevel,
          },
        ];
  });
}

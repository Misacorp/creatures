/**
 * A realistic bag for the creature page's item pickers (workbench only): fifteen to twenty items a slot,
 * from the real gear bases, with item levels, rarities, stats and lines in the server's wording. Some are
 * too high a level for the creature (shown with the reason), one is worn by another creature. Built by a
 * pure formula from a short table, so every scene shows the same bag. Fixture data only.
 */
import { gearBase } from '@creatures/game';
import type { WornGear } from '../../gear-types';
import type { GearItem, GearLine, GearRarity, GearSlot, GearStat, GearTag } from '../../gear-types';

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
];

const TABLES: Readonly<Record<GearSlot, readonly Spec[]>> = {
  hat: HATS,
  scarf: SCARVES,
  charm: CHARMS,
};

const RARITY_FACTOR: Readonly<Record<GearRarity, number>> = { common: 1, rare: 1.5, epic: 2.2 };

/** The words of each line, by the base's tag; `{n}` is a number worked out from the item level. */
const LINE_POOL: Readonly<Record<string, readonly string[]>> = {
  ember: ['Wildfire bonus +{n}%', 'First pounce +{n}%'],
  tide: ['Tide Attunement +{n}%', 'Aimed ward −{n}%'],
  grove: ['Aimed ward −{n}%', 'Thorn guard +{n}%'],
  spark: ['Overload bonus +{n}%', 'Crit chance +{n} pt'],
  neutral: ['Crit damage +{n} pt', 'Trail XP +{n}%'],
  explorer: ['Trail XP +{n}%', 'Quick feet −{n}%', 'Lucky find +{n} pt'],
  guard: ['Armor +{n} pt', 'Cover +{n} pt'],
  support: ['Heal +{n}%', 'Cover +{n} pt'],
  setter: ['Mark +{n}%', 'Armor +{n} pt'],
  payoff: ['Pounce +{n}%', 'Crit damage +{n} pt'],
};

function lineOf(baseId: string, index: number, text: string, local: boolean): GearLine {
  return {
    id: `${baseId}-line-${String(index)}`,
    name: text,
    text,
    about: 'What this line does, in one sentence.',
    source: index === 0 ? 'base' : 'rolled',
    tier: local ? null : 2,
    bestTier: local ? null : 4,
    local,
    active: true,
  };
}

function statOf(stat: 'atk' | 'hp', value: number): GearStat {
  return { stat, value, base: value, text: `${stat === 'atk' ? 'Attack' : 'HP'} ${String(value)}` };
}

/** One bag item from a table row: stats by slot and rarity, lines by tag and rarity. */
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
  const factor = RARITY_FACTOR[rarity];
  const stats: GearStat[] =
    slot === 'charm'
      ? []
      : slot === 'hat'
        ? [statOf('atk', Math.round(itemLevel * factor * 1.2) + 1), statOf('hp', itemLevel * 2 + 2)]
        : [
            statOf('hp', Math.round(itemLevel * factor * 2.4) + 4),
            statOf('atk', Math.round(itemLevel * 0.3) + 1),
          ];
  const pool = LINE_POOL[tag] ?? LINE_POOL['neutral'] ?? [];
  const count = rarity === 'common' ? 1 : rarity === 'rare' ? 2 : 3;
  const texts = pool
    .slice(0, Math.min(count, pool.length))
    .map((t) => t.replace('{n}', String(2 + Math.floor((itemLevel * factor) / 3))));
  if (rarity === 'epic' && slot !== 'charm')
    texts.push(`+${String(40 + itemLevel)}% Attack (this item)`);
  const lines = texts.map((text, i) => lineOf(baseId, i, text, text.endsWith('(this item)')));
  const equippedOn = worn ? creatureId : (wornBy ?? null);
  return {
    id: `bag-${slot}-${String(index + 1).padStart(2, '0')}`,
    baseId,
    slot,
    tag,
    rarity,
    festival: base?.festival === true,
    itemLevel,
    stats,
    lines,
    needs: {
      level: itemLevel,
      role: ['guard', 'support', 'setter', 'payoff'].includes(tag) ? tag : null,
    },
    equippedOn,
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

/** Which table row of each slot the creature wears (an index into that slot's table), or none. */
export type WornRows = Readonly<Partial<Record<GearSlot, number>>>;

/** How many rows a slot's table has. */
export function bagSize(slot: GearSlot): number {
  return TABLES[slot].length;
}

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

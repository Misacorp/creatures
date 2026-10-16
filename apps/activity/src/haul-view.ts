/**
 * The "Expected haul" of a trip as plain data: what a trip of this length can bring, with the effects of
 * the chosen supplies folded in, as a row of icons that each have a short word and 0 to 4 pips. Pips
 * compare with the best any length does with the best supplies, so lengths and supplies can be compared
 * at a glance. Nothing here is a chance shown as a number (discovery is part of the fun): chances
 * come out as words ("rarely", "often"); only counts a player will really see (catch rolls, XP, scrap)
 * are numbers. Every figure is worked out from the shared rules and content, never copied.
 */
import {
  EXPEDITION_LENGTHS,
  expeditionContent,
  catchChanceBp,
  kitDeepBp,
  lengthRules,
  lureEffect,
  satchelBonus,
  shardOf,
  tripRolls,
  type Element,
  type ExpeditionLength,
  type SupplyDef,
} from '@creatures/game';
import type { PartKind } from './gear-types';
import type { IconRef } from './icon-ref';
import { lengthLabel, supplyDefs } from './trip-view';

const BP = 10_000;
/** How many pips a row can have. */
export const MAX_PIPS = 4;

/** The words for a chance, by pip level (0 to 4). */
export const CHANCE_WORDS: readonly string[] = [
  'not on this trip',
  'rarely',
  'sometimes',
  'often',
  'very often',
];

interface HaulRow {
  key: string;
  icon: IconRef;
  /** The short word under the icon: "Catches", "Scrap". */
  label: string;
  /** One line for the hover text and assistive technology: what it is and how much, in words. */
  detail: string;
  /** 0 to 4 pips against the best any length does with the best supplies. */
  level: number;
  /** A chosen supply raises it. */
  boosted: boolean;
}

interface Metrics {
  /** Creatures the rolls bring, in hundredths (rolls times the chance each brings one). */
  catch: number;
  /** The chance a creature it brings is of a species the player lacks (a lure's draw), in basis points. */
  fresh: number;
  xp: number;
  scrap: number;
  shard: number;
  glimmer: number;
  blueprint: number;
  supply: number;
  journal: number;
  rarity: number;
  deep: number;
}

const scale = (value: number, bp: number): number => Math.floor((value * (BP + bp)) / BP);

/** The numbers behind each row for a trip length and a kit. */
function metricsOf(length: ExpeditionLength, kit: readonly SupplyDef[]): Metrics {
  const rules = lengthRules(length);
  // Only the supplies' own part bonus: the explorer's role and stars are not known here.
  const partsBp = satchelBonus(kit).partsBp;
  const lure = lureEffect(kit);
  return {
    catch: Math.round((tripRolls(length, kit, null) * catchChanceBp(length, kit)) / 100),
    fresh: lure.newBp,
    xp: rules.xp,
    scrap: scale(rules.loot.scrap, partsBp),
    shard: scale(rules.loot.shardBp, partsBp),
    glimmer: rules.loot.glimmerBp,
    blueprint: rules.loot.blueprintBp,
    supply: Math.min(BP, rules.loot.supplyBp + satchelBonus(kit).supplyBp),
    journal: rules.journalBp,
    rarity: rules.rarityUpBp,
    deep: kitDeepBp(kit),
  };
}

/** One of the best tier of every kind of supply: the yardstick of the pips (never a real kit). */
function bestKit(): SupplyDef[] {
  const best = new Map<SupplyDef['kind'], SupplyDef>();
  for (const def of expeditionContent.supplies) {
    const have = best.get(def.kind);
    if (have === undefined || def.worth > have.worth) best.set(def.kind, def);
  }
  return [...best.values()];
}

/** The best any length does with the best supplies, per row. */
function yardstick(): Metrics {
  const kit = bestKit();
  const top: Metrics = metricsOf('short', kit);
  for (const length of EXPEDITION_LENGTHS) {
    const here = metricsOf(length, kit);
    for (const key of Object.keys(top) as (keyof Metrics)[]) {
      top[key] = Math.max(top[key], here[key]);
    }
  }
  return top;
}

const TOP = yardstick();

function pips(key: keyof Metrics, value: number): number {
  const top = TOP[key];
  if (value <= 0 || top <= 0) return 0;
  return Math.min(MAX_PIPS, Math.max(1, Math.round((MAX_PIPS * value) / top)));
}

/** How often one catch roll brings a creature, in words. */
function rollWord(bp: number): string {
  if (bp >= 7000) return 'very often';
  if (bp >= 4000) return 'often';
  if (bp >= 2500) return 'sometimes';
  return 'rarely';
}

const plural = (n: number, one: string, many: string): string =>
  `${String(n)} ${n === 1 ? one : many}`;

/**
 * The haul of a trip: the same rows for every length (so they can be compared), plus a "Deeper area" row
 * when a lantern is carried. `kit` is the chosen supplies' ids (unknown ids are left out); `element` is
 * the element of the place, whose shards drop there (null for a mixed place: Tide shards).
 */
export function expectedHaul(
  length: ExpeditionLength,
  element: string | null,
  kitIds: readonly string[],
): HaulRow[] {
  const kit = supplyDefs(kitIds);
  const here = metricsOf(length, kit);
  const plain = metricsOf(length, []);
  const shard: PartKind = shardOf((element ?? 'tide') as Element);
  const boosted = (key: keyof Metrics): boolean => here[key] > plain[key];
  const chance = (key: keyof Metrics, name: string): string =>
    `${name}: ${CHANCE_WORDS[pips(key, here[key])] ?? CHANCE_WORDS[0] ?? ''}`;
  const rolls = tripRolls(length, kit, null);
  const rows: HaulRow[] = [
    {
      key: 'catch',
      icon: { kind: 'glyph', id: 'paw' },
      label: 'Catches',
      detail: `${plural(rolls, 'catch roll', 'catch rolls')}, each ${rollWord(catchChanceBp(length, kit))} brings a creature`,
      level: pips('catch', here.catch),
      boosted: boosted('catch'),
    },
    {
      key: 'rarity',
      icon: { kind: 'glyph', id: 'sparkle' },
      label: 'Rare finds',
      detail: chance('rarity', 'Rarer creatures'),
      level: pips('rarity', here.rarity),
      boosted: boosted('rarity'),
    },
    {
      key: 'xp',
      icon: { kind: 'glyph', id: 'rank' },
      label: 'XP',
      detail: `${String(here.xp)} explorer XP`,
      level: pips('xp', here.xp),
      boosted: false,
    },
    {
      key: 'scrap',
      icon: { kind: 'part', part: 'scrap' },
      label: 'Scrap',
      detail: here.scrap === 0 ? 'No scrap' : `${String(here.scrap)} scrap`,
      level: pips('scrap', here.scrap),
      boosted: boosted('scrap'),
    },
    {
      key: shard,
      icon: { kind: 'part', part: shard },
      label: 'Shards',
      detail: chance('shard', 'Shards'),
      level: pips('shard', here.shard),
      boosted: boosted('shard'),
    },
    {
      key: 'glimmer',
      icon: { kind: 'part', part: 'glimmer' },
      label: 'Glimmer',
      detail: chance('glimmer', 'Glimmer'),
      level: pips('glimmer', here.glimmer),
      boosted: false,
    },
    {
      key: 'blueprint',
      icon: { kind: 'glyph', id: 'blueprint' },
      label: 'Blueprint',
      detail: chance('blueprint', 'A blueprint'),
      level: pips('blueprint', here.blueprint),
      boosted: false,
    },
    {
      key: 'supply',
      icon: { kind: 'glyph', id: 'satchel' },
      label: 'Supplies',
      detail: chance('supply', 'A found supply'),
      level: pips('supply', here.supply),
      boosted: boosted('supply'),
    },
    {
      key: 'journal',
      icon: { kind: 'glyph', id: 'journal' },
      label: 'Journal',
      detail: chance('journal', 'A journal page'),
      level: pips('journal', here.journal),
      boosted: false,
    },
  ];
  if (here.fresh > 0) {
    rows.splice(1, 0, {
      key: 'fresh',
      icon: { kind: 'glyph', id: 'reticle' },
      label: 'New faces',
      detail: 'A lure often draws species you do not have yet',
      level: pips('fresh', here.fresh),
      boosted: true,
    });
  }
  if (here.deep > 0) {
    rows.push({
      key: 'deep',
      icon: { kind: 'glyph', id: 'compass' },
      label: 'Deeper area',
      detail: 'Opens the deeper area, where the rarer creatures live',
      level: pips('deep', here.deep),
      boosted: true,
    });
  }
  return rows;
}

/** The line above the strip: which trip and what the haul includes. "A 12 h trip with Sweet Lure". */
export function haulTitle(length: ExpeditionLength, kitIds: readonly string[]): string {
  const names = supplyDefs(kitIds).map((s) => s.name);
  return names.length === 0
    ? `A ${lengthLabel(length)} trip`
    : `A ${lengthLabel(length)} trip with ${names.join(' and ')}`;
}

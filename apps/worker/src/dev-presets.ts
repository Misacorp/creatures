/**
 * Roster presets of the dev tools (`apply-roster-preset`, staging only; `docs/design/dev-tools.md`): what a player
 * owns at a point of a server's life, so a playtest of the raid starts with real rosters and full bags.
 *
 * **Source (copied, not imported: the worker never reads the lab).** `packages/lab/data/valley/roster-profile.json`, kind
 * `daily` (the median player who plays every day), weeks 2, 8, 16 and 24: the levels of the 1st, 3rd, 10th and 20th creature,
 * the roster size, the forms, and `gear` (the average worn item level on the valley's scale of 1 to about 100). The gear model is
 * `packages/lab/src/gear.ts` (`loadoutAt`: three pieces per creature, a Hat and a Scarf of its element and a Charm of its role,
 * `rarityMix` by item level, the base the best one the item level opens).
 *
 * **What the shipped game cannot hold, and the picks that follow.**
 * - A player owns at most two creatures per line (`line_slot` 1 and 2) and the shipped content has 14 catchable lines (the
 *   Festival prizes Lanternfin and Hearthshell are left out), so a roster is at most 28. The profile's sizes at weeks 16 and 24
 *   (34 and 49) are cut to 25 and 28; the profile's lines beyond the shipped ones are replaced by the shipped rare and epic forms
 *   and by the second branch of a line (the alt evolutions), which gives the roles and elements the later weeks have.
 * - Levels come from the profile's anchors (rank 1, 3, 10, 20) joined by straight lines and, past the last anchor, continued
 *   at the last slope; a stage 1 form never passes its cap of 15 (week 2 stays under it).
 * - The shipped item level runs 1 to 20, the valley's 1 to 100 (the lab reads it divided by five, `POOL_LEVEL_DIVISOR`): a
 *   preset's item level is `ceil(valley item level / 5)`.
 * - `rolledLines` are the shipped 1 / 2 / 3 (the valley's 1 / 3 / 5 are not shipped), rolled by the normal item path.
 * - Gear: one worn-ready set (Hat, Scarf, Charm) for each of the first `sets` creatures (the raid creatures: the arena pieces
 *   take 2 to 4 per player, a tester may raise it to 8) and `spares` more single pieces for the creatures after them.
 *
 * Each creature is `[species, level]`, best first: the first eight of a preset cover every role and a mix of elements, so a
 * boss's answers exist. The resolvers below are pure; the tool that writes them is `dev-tools-presets.ts`.
 */
import { basesFor, eligibleBases, type GearRarity } from '@creatures/game';
import { speciesOf } from './species';

export const PRESET_IDS = ['week-2', 'week-8', 'week-16', 'week-24'] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export type PresetCreature = readonly [species: string, level: number];

export interface RosterPreset {
  id: PresetId;
  name: string;
  /** Best first (the order of the profile's ranks). */
  creatures: readonly PresetCreature[];
  /** The valley item level of the profile's `gear` (average worn item level), kept for the record. */
  valleyItemLevel: number;
  /** Full sets (Hat, Scarf, Charm) for the first creatures. */
  sets: number;
  /** Single pieces after the sets, for the creatures that come next. */
  spares: number;
}

/** Week 2 (profile `daily`: size 7, first 14, third 14; gear 11): stage 1 commons, all four roles. */
const WEEK_2: readonly PresetCreature[] = [
  ['cindle', 14],
  ['sproutle', 14],
  ['ashmole', 14],
  ['splashet', 13],
  ['zipmouse', 12],
  ['mistnewt', 11],
  ['squelch', 10],
];

/** Week 8 (size 18, first 25, third 25, tenth 18.5; gear 33): the evolved commons, two rares, the second branches. */
const WEEK_8: readonly PresetCreature[] = [
  ['coralynx', 25],
  ['thornbuck', 25],
  ['magmole', 25],
  ['voltaro', 24],
  ['tempestray', 23],
  ['fogwyrm', 22],
  ['pyrelynx', 21],
  ['tidewing', 20],
  ['bogwarden', 19],
  ['croakmire', 18],
  ['geyserpup', 18],
  ['wickat', 17],
  ['sunfawn', 16],
  ['ohmouse', 15],
  ['drizzlewt', 14],
  ['kilnmole', 13],
  ['halcyray', 12],
  ['bloomback', 11],
];

/** Week 16 (size 34 cut to 25, first 30, third 30, tenth 28, twentieth 24; gear 46): the three epics join, rares are all in. */
const WEEK_16: readonly PresetCreature[] = [
  ['solmane', 30],
  ['thornbuck', 30],
  ['aurorix', 30],
  ['gaiadrake', 30],
  ['fogwyrm', 29],
  ['coralynx', 29],
  ['ancientshell', 29],
  ['magmole', 29],
  ['tempestray', 28],
  ['halcyray', 28],
  ['bloomback', 28],
  ['pyrelynx', 27],
  ['tidewing', 27],
  ['voltaro', 26],
  ['bogwarden', 26],
  ['croakmire', 26],
  ['geyserpup', 25],
  ['wickat', 25],
  ['sunfawn', 24],
  ['ohmouse', 24],
  ['drizzlewt', 24],
  ['kilnmole', 23],
  ['bogwarden', 23],
  ['croakmire', 22],
  ['coralynx', 22],
];

/** Week 24 (size 49 cut to 28, every level 30; gear 54): week 16's roster at the cap and the epics twice. */
const WEEK_24: readonly PresetCreature[] = [
  ...WEEK_16.map(([species]): PresetCreature => [species, 30]),
  ['solmane', 30],
  ['gaiadrake', 30],
  ['aurorix', 30],
];

export const ROSTER_PRESETS: Readonly<Record<PresetId, RosterPreset>> = {
  'week-2': {
    id: 'week-2',
    name: 'Week 2',
    creatures: WEEK_2,
    valleyItemLevel: 11,
    sets: 4,
    spares: 3,
  },
  'week-8': {
    id: 'week-8',
    name: 'Week 8',
    creatures: WEEK_8,
    valleyItemLevel: 33,
    sets: 6,
    spares: 4,
  },
  'week-16': {
    id: 'week-16',
    name: 'Week 16',
    creatures: WEEK_16,
    valleyItemLevel: 46,
    sets: 8,
    spares: 6,
  },
  'week-24': {
    id: 'week-24',
    name: 'Week 24',
    creatures: WEEK_24,
    valleyItemLevel: 54,
    sets: 8,
    spares: 6,
  },
};

/** A piece of gear the preset gives: its base, rarity and item level (the lines are rolled when it is made). */
export interface PresetItem {
  baseId: string;
  rarity: GearRarity;
  itemLevel: number;
}

const SLOTS = ['hat', 'scarf', 'charm'] as const;
type Slot = (typeof SLOTS)[number];

/** The shipped item level for a valley item level (the lab's `POOL_LEVEL_DIVISOR` of five), 1 to 20. */
export function gameItemLevel(valleyItemLevel: number): number {
  return Math.max(1, Math.min(20, Math.ceil(valleyItemLevel / 5)));
}

/** The rarities of the Hat, the Scarf and the Charm at a valley item level (the lab's `rarityMix`). */
export function rarityMix(valleyItemLevel: number): readonly [GearRarity, GearRarity, GearRarity] {
  if (valleyItemLevel < 20) return ['common', 'common', 'rare'];
  if (valleyItemLevel < 40) return ['common', 'rare', 'rare'];
  return ['rare', 'rare', 'epic'];
}

/** The best base of a slot a wearer would wear: its element's Hat or Scarf, its role's Charm (the lab's `baseOf`). */
function baseFor(slot: Slot, species: string, itemLevel: number): string {
  const s = speciesOf(species);
  if (slot === 'charm') {
    const byRole = basesFor('charm', s.role)[0];
    if (byRole !== undefined) return byRole.id;
  }
  const best = eligibleBases(slot, s.element, itemLevel).at(-1) ?? basesFor(slot, s.element)[0];
  if (best === undefined) throw new Error(`no ${slot} base for ${s.element}`);
  return best.id;
}

/** The items of a preset, in the order they are made: the sets (a Hat, a Scarf and a Charm per creature), then the spares. */
export function presetItems(preset: RosterPreset): PresetItem[] {
  const itemLevel = gameItemLevel(preset.valleyItemLevel);
  const mix = rarityMix(preset.valleyItemLevel);
  const piece = (creatureIndex: number, slotIndex: number): PresetItem => {
    const creature = preset.creatures[creatureIndex % preset.creatures.length];
    if (creature === undefined) throw new Error('a preset has no creatures');
    return {
      baseId: baseFor(SLOTS[slotIndex] ?? 'hat', creature[0], itemLevel),
      rarity: mix[slotIndex] ?? 'common',
      itemLevel,
    };
  };
  const items: PresetItem[] = [];
  for (let c = 0; c < preset.sets; c++) {
    for (let s = 0; s < SLOTS.length; s++) items.push(piece(c, s));
  }
  for (let i = 0; i < preset.spares; i++) items.push(piece(preset.sets + i, i % SLOTS.length));
  return items;
}

/** What a preset gives, counted: for the panel's list and the tests. */
export function presetSummary(preset: RosterPreset) {
  const species = preset.creatures.map(([id]) => speciesOf(id));
  const levels = preset.creatures.map(([, level]) => level);
  const count = (pick: (s: ReturnType<typeof speciesOf>) => string) => {
    const out: Record<string, number> = {};
    for (const s of species) out[pick(s)] = (out[pick(s)] ?? 0) + 1;
    return out;
  };
  return {
    id: preset.id,
    name: preset.name,
    creatures: preset.creatures.length,
    minLevel: Math.min(...levels),
    maxLevel: Math.max(...levels),
    rarities: count((s) => s.rarity),
    roles: count((s) => s.role),
    elements: count((s) => s.element),
    items: presetItems(preset).length,
  };
}

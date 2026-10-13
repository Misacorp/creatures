/** The lists the panel's dropdowns offer, all from the shared game content (the same data the server checks against). */
import { RULES, content, dungeonContent, expeditionContent, gearContent } from '@creatures/game';
import type { Option } from './forms';

function options<T extends { id: string }>(
  items: readonly T[],
  label: (item: T) => string,
): Option[] {
  return items.map((item) => ({ value: item.id, label: label(item) }));
}

export const SPECIES_OPTIONS = options(content.creatures, (c) =>
  c.festival === true ? `${c.name} (Festival)` : c.name,
);
export const DESTINATION_OPTIONS = options(expeditionContent.destinations, (d) => d.name);
export const SUPPLY_OPTIONS = options(expeditionContent.supplies, (s) => s.name);
export const GOAL_OPTIONS = options(expeditionContent.goals, (g) => g.name);
export const JOURNAL_OPTIONS = options(expeditionContent.journal.entries, (e) => e.title);
export const BASE_OPTIONS = options(gearContent.bases, (b) => b.name);
export const ENCHANT_OPTIONS = options(gearContent.enchants, (e) => e.name);
export const BOSS_OPTIONS = options(content.bosses, (b) => b.name);
export const MODIFIER_OPTIONS = options(dungeonContent.modifiers, (m) => m.name);

export const RARITY_OPTIONS: readonly Option[] = ['common', 'rare', 'epic', 'festival'].map(
  (r) => ({
    value: r,
    label: r,
  }),
);

export const GATE_OPTIONS: readonly Option[] = ['on', 'off', 'auto'].map((g) => ({
  value: g,
  label: g,
}));

export const PHASE_OPTIONS: readonly Option[] = [
  { value: 'preparation', label: 'Preparation' },
  { value: 'phase1', label: 'Phase 1' },
  { value: 'phase2', label: 'Phase 2' },
  { value: 'finale', label: 'Finale day' },
  { value: 'done', label: 'Week done' },
];

export const RESOLVE_OPTIONS: readonly Option[] = [
  { value: 'phase1', label: 'Phase 1' },
  { value: 'phase2', label: 'Phase 2' },
];

export const OUTCOME_OPTIONS: readonly Option[] = ['success', 'fail', 'random'].map((o) => ({
  value: o,
  label: o,
}));

/** The part kinds `grant-parts` takes, with a short label each. */
export const PART_FIELDS: readonly Option[] = [
  { value: 'scrap', label: 'Scrap' },
  { value: 'tide-shard', label: 'Tide shard' },
  { value: 'ember-shard', label: 'Ember shard' },
  { value: 'grove-shard', label: 'Grove shard' },
  { value: 'spark-shard', label: 'Spark shard' },
  { value: 'glimmer', label: 'Glimmer' },
];

/** Limits the schemas have, from the same rules the server reads. */
export const LIMITS = {
  rooms: RULES.dungeon.rooms,
  maxGearLevel: RULES.gear.maxLevel,
  maxExplorerRank: RULES.expeditions.rank.xpForRank.length,
  maxExplorerXp: (RULES.expeditions.rank.xpForRank.at(-1) ?? 0) * 2,
  maxSlots: 1 + 1 + RULES.expeditions.slots.thresholds.length,
  maxBossRank: RULES.raid.scaling.maxRank,
} as const;

/** The lists the panel's dropdowns offer, all from the shared game content (the same data the server checks against). */
import {
  RULES,
  content,
  dungeonContent,
  expeditionContent,
  gearContent,
  weatherContent,
} from '@creatures/game';
import { combatV2 } from '@creatures/game/combat-v2';
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
export const MODIFIER_OPTIONS = options(dungeonContent.modifiers, (m) => m.name);
const liveWeather = (kind: 'boon' | 'omen') =>
  weatherContent.filter((d) => d.kind === kind && d.status === 'live');
export const BOON_OPTIONS = options(liveWeather('boon'), (d) => d.name);
/** The Omens that can be set by hand, and "No Omen" first (the day has none). */
export const OMEN_OPTIONS: readonly Option[] = [
  { value: 'none', label: 'No Omen' },
  ...options(liveWeather('omen'), (d) => d.name),
];

export const RARITY_OPTIONS: readonly Option[] = ['common', 'rare', 'epic'].map((r) => ({
  value: r,
  label: r,
}));

export const GATE_OPTIONS: readonly Option[] = ['on', 'off', 'auto'].map((g) => ({
  value: g,
  label: g,
}));

/**
 * The Boss Ranks of the raid track, each with its boss ("Rank 8, Storm Sovereign"): one per slot of `raid-track.json`, and a rank
 * comes with its own boss (the track's order repeats, so the boss of a slot is `order[(slot - 1) % order.length]`).
 */
export const RANK_OPTIONS: readonly Option[] = combatV2.raidTrack.slots.map((slot) => {
  const { order } = combatV2.raidTrack;
  const bossId = order[(slot.slot - 1) % order.length];
  const name = content.bosses.find((b) => b.id === bossId)?.name ?? bossId ?? 'unknown boss';
  return { value: String(slot.slot), label: `Rank ${String(slot.slot)} \u00b7 ${name}` };
});

/** The most creatures per player the raid override offers (`MAX_RAID_SEATS` of the Worker). */
export const MAX_RAID_SEATS = 8;

/** The raid's "Creatures per player" list: the default (the boss's own piece decides) and 1 to 8. */
export const SEATS_OPTIONS: readonly Option[] = [
  { value: 'default', label: 'Default' },
  ...Array.from({ length: MAX_RAID_SEATS }, (_, i) => ({
    value: String(i + 1),
    label: String(i + 1),
  })),
];

/** The most simulated players one fill adds (a party holds 15 players, and the caller is one of them). */
export const MAX_FILL_PLAYERS = 14;

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
  { value: 'mire-shard', label: 'Mire shard' },
  { value: 'glimmer', label: 'Glimmer' },
];

/** Limits the schemas have, from the same rules the server reads. */
export const LIMITS = {
  rooms: RULES.dungeon.rooms,
  maxItemLevel: RULES.gear.maxItemLevel,
  maxExplorerRank: RULES.expeditions.rank.xpForRank.length,
  maxExplorerXp: (RULES.expeditions.rank.xpForRank.at(-1) ?? 0) * 2,
  maxSlots: 1 + 1 + RULES.expeditions.slots.thresholds.length,
} as const;

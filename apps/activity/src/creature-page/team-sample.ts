/**
 * A dungeon team of three for the workbench and the tests: the creature page's samples (real gear, talents
 * and stats) as Mossback, Sproutle and Cindle, one bag between them, Crafting levels of their own, and a few
 * more creatures of a real server answer. Fixture data only.
 */
import type { Creature, GameState } from '../api';
import collectionFixture from '../fixtures/collection-state.json';
import { parseGameState } from '../api';
import type { GearState } from '../gear-types';
import { allBagItems, wornFromBag } from './bag-sample';
import { pageScene } from './sample';

/** The demo team's own stats, without and with gear. */
const STATS_OF = [
  { hp: 312, atk: 64, spd: 38 },
  { hp: 228, atk: 49, spd: 35 },
  { hp: 254, atk: 92, spd: 51 },
] as const;
const STATS_WITH_GEAR_OF = [
  { hp: 371, atk: 70, spd: 38 },
  { hp: 251, atk: 55, spd: 35 },
  { hp: 269, atk: 116, spd: 57 },
] as const;

/** The team (left to right), everything the player owns, the bag and the state around them. */
export function teamSample(): {
  team: Creature[];
  creatures: Creature[];
  gear: GearState;
  state: GameState;
} {
  const ids = ['demo-moss', 'demo-sprout', 'demo-cindle'] as const;
  const kinds = ['set: two pieces', 'talents: golden and locked', 'rarities'] as const;
  const species = ['mossback', 'sproutle', 'cindle'] as const;
  // One bag: the first creature's rows, then the rows the other two wear marked as theirs.
  const rows = [
    { hat: 19, scarf: 16 },
    { hat: 4, scarf: 0 },
    { hat: 13, scarf: 1, charm: 11 },
  ] as const;
  let items = allBagItems(ids[0], rows[0]);
  rows.forEach((worn, i) => {
    if (i === 0) return;
    const theirs = allBagItems(ids[i] ?? '', worn).filter((it) => it.equippedOn === ids[i]);
    items = items.map((it) =>
      theirs.some((t) => t.id === it.id) ? { ...it, equippedOn: ids[i] ?? null } : it,
    );
  });
  const team: Creature[] = ids.map((id, i) => {
    const base = pageScene(kinds[i] ?? 'level 15').creature;
    return {
      ...base,
      id,
      species: species[i] ?? base.species,
      nickname: null,
      level: [20, 12, 20][i] ?? base.level,
      // Stats of their own (a Guard is sturdy, Cindle hits hard), so the cards differ.
      stats: STATS_OF[i] ?? base.stats,
      statsWithGear: STATS_WITH_GEAR_OF[i] ?? base.statsWithGear,
      caughtAt: 1_000 + i,
      gear: wornFromBag(items, id),
    };
  });
  const extra = parseGameState(collectionFixture).creatures.map((c, i) => ({
    ...c,
    id: `demo-extra-${String(i)}`,
  }));
  const sample = pageScene('level 15');
  const gear: GearState = {
    ...sample.gear,
    items,
    // Crafting levels of their own, for the configurator's Crafting row.
    skills: team.map((c, i) => ({
      creatureId: c.id,
      level: [4, 1, 7][i] ?? 1,
      // Total XP and the next threshold, as the server sends them (RULES.gear.skill.xpForLevel).
      xp: [520, 30, 1_900][i] ?? 0,
      nextLevelXp: [700, 100, 2_500][i] ?? null,
    })),
  };
  const creatures = [...team, ...extra];
  const state: GameState = { ...sample.state, creatures, loungerId: null };
  return { team, creatures, gear, state };
}

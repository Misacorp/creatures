import { describe, expect, it } from 'vitest';
import {
  RULES,
  createSeededRng,
  droppableBases,
  finaleDropOddsBp,
  finaleUpgradeLevel,
  gearBase,
  glossaryEntry,
  howToPlay,
  rollFinaleDrop,
  rollFinaleReward,
} from '../src/index';

/** Expeditions no longer drop rare gear on their own, so the finale must reach Epic gear at every rank. */
describe('the raid finale drop table', () => {
  it('allows an Epic drop at every Boss Rank, from rank 1', () => {
    for (let rank = 1; rank <= RULES.raid.scaling.maxRank; rank++) {
      const odds = finaleDropOddsBp(rank);
      expect(odds.epic, `rank ${String(rank)}`).toBeGreaterThan(0);
      expect(odds.common + odds.rare + odds.epic).toBe(10_000);
    }
    expect(finaleDropOddsBp(1).epic).toBe(RULES.gear.drops.finale.baseBp.epic);
  });

  it('rolls Epic gear at rank 1 now and then', () => {
    const rng = createSeededRng('finale-epic-rank-1');
    let epics = 0;
    for (let i = 0; i < 3_000; i++) if (rollFinaleDrop(rng, 1).rarity === 'epic') epics++;
    expect(epics).toBeGreaterThan(0);
  });
});

describe('the finale reward slot', () => {
  const droppable = droppableBases();

  it('arrives pre-upgraded by Boss Rank: +1 per 2 ranks above 1, capped at the max level', () => {
    const ranks = [1, 2, 3, 4, 5, 9, 11, 30];
    expect(ranks.map((rank) => finaleUpgradeLevel(rank))).toEqual([0, 0, 1, 1, 2, 4, 5, 5]);
    expect(finaleUpgradeLevel(0)).toBe(0);
    expect(finaleUpgradeLevel(1_000)).toBe(RULES.gear.maxLevel);
    for (const rank of [1, 2, 3, 9, 11, 30]) {
      const drop = rollFinaleDrop(createSeededRng(`level-${String(rank)}`), rank);
      expect(drop.level).toBe(finaleUpgradeLevel(rank));
    }
  });

  it('splits gear and blueprints at blueprintBp (seeded), always exactly one of them', () => {
    const rng = createSeededRng('finale-slot-split');
    const n = 20_000;
    let blueprints = 0;
    for (let i = 0; i < n; i++) {
      const reward = rollFinaleReward(rng, 5, new Set());
      if (reward.kind === 'blueprint') blueprints++;
      else expect(reward.level).toBe(finaleUpgradeLevel(5));
    }
    const target = RULES.gear.drops.finale.blueprintBp / 10_000;
    expect(blueprints / n).toBeGreaterThan(target - 0.02);
    expect(blueprints / n).toBeLessThan(target + 0.02);
  });

  it('gives a blueprint its rarity by the rank odds, and never a Festival base', () => {
    const rng = createSeededRng('finale-slot-rarity');
    const counts: Record<string, number> = { common: 0, rare: 0, epic: 0 };
    let n = 0;
    for (let i = 0; i < 30_000; i++) {
      const reward = rollFinaleReward(rng, 20, new Set());
      if (reward.kind !== 'blueprint') continue;
      n++;
      counts[reward.rarity] = (counts[reward.rarity] ?? 0) + 1;
      expect(gearBase(reward.baseId)?.blueprint).toBe(reward.rarity);
    }
    const odds = finaleDropOddsBp(20);
    expect((counts['epic'] ?? 0) / n).toBeGreaterThan(odds.epic / 10_000 - 0.03);
    expect((counts['epic'] ?? 0) / n).toBeLessThan(odds.epic / 10_000 + 0.03);
    expect((counts['rare'] ?? 0) / n).toBeGreaterThan(odds.rare / 10_000 - 0.03);
    expect((counts['rare'] ?? 0) / n).toBeLessThan(odds.rare / 10_000 + 0.03);
  });

  it('never repeats a known blueprint while unknown ones exist, even when its rarity is all known', () => {
    const rng = createSeededRng('finale-slot-owned');
    // They know every epic and rare blueprint and all but one common one.
    const keep = droppable.find((b) => b.blueprint === 'common');
    const owned = new Set(droppable.filter((b) => b !== keep).map((b) => b.id));
    let blueprints = 0;
    for (let i = 0; i < 3_000; i++) {
      const reward = rollFinaleReward(rng, 30, owned);
      if (reward.kind === 'blueprint') {
        blueprints++;
        expect(reward.baseId).toBe(keep?.id);
        expect(reward.rarity).toBe('common');
      }
    }
    expect(blueprints).toBeGreaterThan(500);
  });

  it('falls back to gear when the player knows every blueprint', () => {
    const rng = createSeededRng('finale-slot-all-known');
    const owned = new Set(droppable.map((b) => b.id));
    for (let i = 0; i < 2_000; i++) {
      expect(rollFinaleReward(rng, 3, owned).kind).toBe('gear');
    }
  });
});

describe('the finale reward in the help text', () => {
  const words = (lines: readonly string[] | undefined): string => (lines ?? []).join(' ');

  it('tells the player the slot, the rank scaling and the upgrade steps from the rules', () => {
    const rewards = howToPlay.sections.find((s) => s.id === 'rewards');
    expect(words(rewards?.lines)).toContain('gear piece or a blueprint');
    expect(words(rewards?.lines)).toContain('better gear');
    const gear = words(glossaryEntry('gear')?.lines);
    expect(gear).toContain(`+1 for every ${String(RULES.gear.drops.finale.ranksPerUpgrade)} Ranks`);
    expect(gear).toContain(`up to +${String(RULES.gear.maxLevel)}`);
    expect(words(glossaryEntry('blueprint')?.lines)).toContain('won finale');
  });
});

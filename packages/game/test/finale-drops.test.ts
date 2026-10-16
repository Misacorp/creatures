import { describe, expect, it } from 'vitest';
import {
  RULES,
  createSeededRng,
  finaleDropOddsBp,
  finaleItemLevel,
  glossaryEntry,
  howToPlay,
  rollFinaleItem,
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
    for (let i = 0; i < 3_000; i++) if (rollFinaleItem(rng, 1, 'tide').rarity === 'epic') epics++;
    expect(epics).toBeGreaterThan(0);
  });
});

describe('the finale reward slot', () => {
  it('arrives at item level 3 + Boss Rank, at most 20 (rank 2: 5, 7: 10, 12: 15, 17: 20)', () => {
    expect([2, 7, 12, 17, 30].map(finaleItemLevel)).toEqual([5, 10, 15, 20, 20]);
    for (const rank of [1, 2, 9, 30]) {
      const reward = rollFinaleReward(
        createSeededRng(`level-${String(rank)}`),
        rank,
        'ember',
        new Set(),
      );
      if (reward.kind === 'gear') expect(reward.item.itemLevel).toBe(finaleItemLevel(rank));
    }
  });

  it('splits gear and blueprints at blueprintBp (seeded), always exactly one of them', () => {
    const rng = createSeededRng('finale-slot-split');
    const n = 20_000;
    let blueprints = 0;
    for (let i = 0; i < n; i++) {
      if (rollFinaleReward(rng, 5, 'grove', new Set()).kind === 'blueprint') blueprints++;
    }
    const target = RULES.gear.drops.finale.blueprintBp / 10_000;
    expect(blueprints / n).toBeGreaterThan(target - 0.02);
    expect(blueprints / n).toBeLessThan(target + 0.02);
  });
});

describe('the finale reward in the help text', () => {
  const words = (lines: readonly string[] | undefined): string => (lines ?? []).join(' ');

  it('tells the player the slot and the item level rule', () => {
    const rewards = howToPlay.sections.find((s) => s.id === 'rewards');
    expect(words(rewards?.lines)).toContain('gear piece or a blueprint');
    expect(words(glossaryEntry('gear-item-level')?.lines)).toContain('own level');
    expect(words(glossaryEntry('blueprint')?.lines)).toContain('won finale');
  });
});

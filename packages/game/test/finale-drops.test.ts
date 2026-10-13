import { describe, expect, it } from 'vitest';
import { RULES, createSeededRng, finaleDropOddsBp, rollFinaleDrop } from '../src/index';

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

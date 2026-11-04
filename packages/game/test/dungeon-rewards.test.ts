import { describe, expect, it } from 'vitest';
import {
  RULES,
  SINGLE_ROLL,
  adjustSpec,
  compareGear,
  createSeededRng,
  dungeonGearSpec,
  dungeonRewardScalars,
  dungeonRewardSpec,
  dungeonResourceBp,
  dungeonXpBp,
  rollBestOf,
  rollDungeonItem,
  rollDungeonLoot,
  rollUndercroftChest,
  scaleBp,
  undercroftDepth,
  type BestOfStep,
  type GearItem,
} from '../src/index';

const one = (rng: ReturnType<typeof createSeededRng>): GearItem =>
  rollDungeonItem(rng, 'common', 5, false, 'tide');

describe('rollBestOf', () => {
  it('rolls 1 / keep 1 is a plain roll with the same dice', () => {
    for (const seed of ['a', 'b', 'c']) {
      const plain = rollDungeonItem(createSeededRng(seed), 'rare', 9, false, 'ember');
      const rng = createSeededRng(seed);
      const best = rollBestOf(rng, SINGLE_ROLL, (r) =>
        rollDungeonItem(r, 'rare', 9, false, 'ember'),
      );
      expect(best).toEqual([plain]);
      // And the stream is left where a plain roll leaves it.
      const after = createSeededRng(seed);
      rollDungeonItem(after, 'rare', 9, false, 'ember');
      expect(rng.nextU32()).toBe(after.nextU32());
    }
  });

  it('draws counts inside the ranges and is deterministic', () => {
    const spec = { rolls: { min: 2, max: 5 }, keep: { min: 1, max: 3 } };
    const seen = new Set<number>();
    for (let i = 0; i < 60; i++) {
      const out = rollBestOf(createSeededRng(`n${String(i)}`), spec, one);
      expect(out.length).toBeGreaterThanOrEqual(1);
      expect(out.length).toBeLessThanOrEqual(3);
      seen.add(out.length);
      expect(rollBestOf(createSeededRng(`n${String(i)}`), spec, one)).toEqual(out);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('never keeps more than it rolled and keeps the best, best first', () => {
    const rarities = ['common', 'epic', 'rare'] as const;
    let i = 0;
    const roll = (r: ReturnType<typeof createSeededRng>): GearItem =>
      rollDungeonItem(r, rarities[i++ % 3] as 'common', 5, false, 'tide');
    const out = rollBestOf(
      createSeededRng('best'),
      { rolls: { min: 2, max: 2 }, keep: { min: 5, max: 5 } },
      roll,
    );
    expect(out.map((x) => x.rarity)).toEqual(['epic', 'common']);
    i = 0;
    const three = rollBestOf(
      createSeededRng('best'),
      { rolls: { min: 3, max: 3 }, keep: { min: 2, max: 2 } },
      roll,
    );
    expect(three.map((x) => x.rarity)).toEqual(['epic', 'rare']);
  });

  it('ranks by rarity, then item level, then the lines tiers, ties in roll order', () => {
    const base = rollDungeonItem(createSeededRng('r'), 'rare', 5, false, 'tide');
    const hi = { ...base, itemLevel: base.itemLevel + 1 };
    const epic = { ...base, rarity: 'epic' as const, itemLevel: 1 };
    const tiers = { ...base, lines: base.lines.map((l) => ({ ...l, tier: l.tier + 1 })) };
    expect([base, hi, epic].sort(compareGear)[0]).toBe(epic);
    expect([base, hi].sort(compareGear)[0]).toBe(hi);
    expect([base, tiers].sort(compareGear)[0]).toBe(tiers);
    expect(compareGear(base, { ...base })).toBe(0);
    const a = { ...base };
    const b = { ...base };
    const queue = [a, b];
    const out = rollBestOf(
      createSeededRng('t'),
      { rolls: { min: 2, max: 2 }, keep: { min: 2, max: 2 } },
      () => queue.shift() as GearItem,
    );
    expect(out[0]).toBe(a);
    expect(out[1]).toBe(b);
  });
});

describe('adjustSpec', () => {
  const base = { rolls: { min: 1, max: 2 }, keep: { min: 1, max: 1 } };
  const steps: BestOfStep[] = [
    { field: 'rolls.max', by: 'depth', from: 1, every: 8, add: 1, cap: 4 },
    { field: 'keep.max', by: 'bossRank', from: 0, every: 2, add: 1, cap: 3 },
  ];
  it('steps by the context, with caps, and ignores a missing value', () => {
    expect(adjustSpec(base, steps, {})).toEqual(base);
    expect(adjustSpec(base, steps, { depth: 8 }).rolls.max).toBe(2);
    expect(adjustSpec(base, steps, { depth: 9 }).rolls.max).toBe(3);
    expect(adjustSpec(base, steps, { depth: 500 }).rolls.max).toBe(4);
    expect(adjustSpec(base, steps, { bossRank: 5 }).keep.max).toBe(3);
  });
  it('keeps min at or below max', () => {
    const odd = adjustSpec({ rolls: { min: 4, max: 2 }, keep: { min: 1, max: 1 } }, [], {});
    expect(odd.rolls.min).toBeLessThanOrEqual(odd.rolls.max);
  });
});

describe('the v2 dungeon spec by depth', () => {
  it('grows with depth and stays inside its caps', () => {
    let prev = dungeonRewardSpec({ depth: 1 });
    expect(prev).toEqual({ rolls: { min: 1, max: 2 }, keep: { min: 1, max: 1 } });
    for (let d = 2; d <= 120; d++) {
      const s = dungeonRewardSpec({ depth: d });
      expect(s.rolls.max).toBeGreaterThanOrEqual(prev.rolls.max);
      expect(s.keep.max).toBeGreaterThanOrEqual(prev.keep.max);
      expect(s.rolls.max).toBeLessThanOrEqual(6);
      expect(s.keep.max).toBeLessThanOrEqual(3);
      expect(s.keep.max).toBeLessThanOrEqual(s.rolls.max);
      prev = s;
    }
    expect(dungeonRewardSpec({ depth: 60 }).rolls.max).toBe(6);
    expect(dungeonRewardSpec({ depth: 60 }).keep.max).toBe(3);
  });

  it('the Undercroft is paid at its own depth', () => {
    const depth = 30;
    const level = 2;
    const under = undercroftDepth(depth, level);
    expect(under).toBeGreaterThan(depth);
    expect(dungeonGearSpec(under, level)).toEqual(
      dungeonRewardSpec({ depth: under, undercroftLevel: level }),
    );
    // Resources and XP follow the deeper depth too.
    expect(dungeonResourceBp(under)).toBeGreaterThan(dungeonResourceBp(depth));
    expect(dungeonXpBp(under)).toBeGreaterThan(dungeonXpBp(depth));
  });

  it('a v2 chest can keep more than one piece and v1 is one plain roll', () => {
    const payout = { landmark: false, fullClear: true, bossCleared: true, supplies: 0 };
    let most = 0;
    for (let i = 0; i < 20; i++) {
      const v2 = rollDungeonLoot(
        createSeededRng(`d${String(i)}`),
        60,
        payout,
        'tide',
        dungeonGearSpec(60),
      );
      most = Math.max(most, v2.gear.length);
      const v1 = rollDungeonLoot(createSeededRng(`d${String(i)}`), 60, payout, 'tide');
      expect(v1.gear).toHaveLength(1);
    }
    expect(most).toBeGreaterThan(1);
  });

  it('the keeper chest: default spec is a single piece, a deep spec can keep more', () => {
    const rng = createSeededRng('keeper');
    let most = 0;
    for (let i = 0; i < 30; i++) {
      most = Math.max(most, rollUndercroftChest(rng, 60, 'tide', dungeonGearSpec(60)).length);
      expect(rollUndercroftChest(rng, 60, 'tide').length).toBeLessThanOrEqual(1);
    }
    expect(most).toBeGreaterThan(1);
  });
});

describe('resources, XP and the picker scalars', () => {
  it('start at 1.0x, grow with depth and stop at their caps', () => {
    expect(dungeonResourceBp(1)).toBe(10_000);
    expect(dungeonXpBp(1)).toBe(10_000);
    expect(dungeonResourceBp(11)).toBe(
      10_000 + 10 * RULES.dungeon.depthRewards.resources.perDepthBp,
    );
    expect(dungeonXpBp(10_000)).toBe(10_000 + RULES.dungeon.depthRewards.xp.maxBp);
    expect(scaleBp(10, 11_500)).toBe(12);
    expect(scaleBp(1, 11_500)).toBe(1);
  });

  it('dungeonRewardScalars is 1 at depth 1 and rises with depth', () => {
    expect(dungeonRewardScalars(1)).toEqual({ xp: 1, loot: 1 });
    let prev = dungeonRewardScalars(1);
    for (const d of [8, 14, 21, 40, 60]) {
      const s = dungeonRewardScalars(d);
      expect(s.xp).toBeGreaterThan(prev.xp);
      expect(s.loot).toBeGreaterThan(prev.loot);
      prev = s;
    }
  });
});

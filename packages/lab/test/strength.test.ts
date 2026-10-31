/**
 * Strength (Misa, 2026-10-29): every rule card and boss gate has a strength from 0 to 10000 bp instead of on or off; a card asks for a
 * tool at low strength and requires it at high strength. Boss Rank sets the strengths. What the engine does with a strength (Reflective
 * Hide, Shake It Off, Build-up, silence, one-shots, Reaction and Element Resistance) is proved in the engine tests (`v2-boss`,
 * `v2-escalation`, `v2-weekend`); this file is the content: what a card builds at a strength, and what each rank is.
 */
import { createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  CARDS,
  LEVEL,
  RAID_RANKS,
  RAID_SPECS,
  card,
  labBoss,
  raidBench,
  raidBossOf,
  raidMode,
  toPlacements,
  weekend,
  type BossDef,
} from '../src';

const rng = (s: string) => createSeededRng(s);

describe('strength in the cards', () => {
  it('cards built at a strength change their numbers by that share', () => {
    const b = labBoss({ rows: 1, cols: 1 });
    expect(card('thick-hide').apply(b).armour).toBe(b.armour + 70);
    expect(card('thick-hide').apply(b, 5_000).armour).toBe(b.armour + 35);
    expect(card('thick-hide').apply(b, 0).armour).toBe(b.armour);
    expect(card('elusive').apply(b, 5_000).spd).toBe(b.spd + 150);
    expect(card('stone-skin').apply(b).mods.capPerHit).toBe(260);
    expect(card('stone-skin').apply(b, 5_000).mods.capPerHit).toBe(520);
    expect(card('stone-skin').apply(b, 0).mods.capPerHit).toBeUndefined();
    expect(card('wither').apply(b, 5_000).mods.healBp).toBe(7_500);
    expect(card('wither').apply(b, 0).mods.healBp).toBe(10_000);
    const slam = (st: number) =>
      card('payoff-hunter')
        .apply(b, st)
        .moves.find((m) => m.id === 'payoff-slam')?.powerBp;
    expect(slam(10_000)).toBe(15_000);
    expect(slam(5_000)).toBe(7_500);
    // A rule card remembers its strength on the boss for the engine to read.
    expect(card('adapts').apply(b, 4_000).strengthBp).toBe(4_000);
    // Every card builds at full strength by default and at any strength.
    for (const c of CARDS)
      for (const st of [0, 3_000, 10_000]) expect(() => c.apply(b, st)).not.toThrow();
  });
});

describe('Boss Rank in the lab', () => {
  it('a lower rank has softer cards and less armour; its HP and Attack follow the boss’s own ladder', () => {
    for (const spec of RAID_SPECS) {
      const high = raidBossOf(spec.id);
      const mid = raidBossOf(spec.id, { rank: 'mid' });
      const low = raidBossOf(spec.id, { rank: 'low' });
      expect(high.strengthBp).toBe(10_000);
      expect(mid.strengthBp).toBeGreaterThan(low.strengthBp ?? 0);
      expect(high.strengthBp).toBeGreaterThan(mid.strengthBp ?? 0);
      expect(high.hp).toBe(spec.hp);
      expect(high.atk).toBe(spec.atk);
      // The ladder rows are the spec's shares at each lower rank.
      for (const [b, row] of [
        [low, spec.ranks?.low],
        [mid, spec.ranks?.mid],
      ] as const) {
        expect(b.hp).toBe(Math.round((spec.hp * (row?.[0] ?? 10_000)) / 10_000));
        expect(b.atk).toBe(Math.round((spec.atk * (row?.[1] ?? 10_000)) / 10_000));
      }
      expect(low.armour).toBeLessThanOrEqual(mid.armour);
      expect(mid.armour).toBeLessThanOrEqual(high.armour);
      // Half of a boss's armour is its hide, so even the low rank keeps it.
      expect(low.armour).toBeGreaterThanOrEqual(Math.round(spec.armour / 2));
      if (high.escalation) expect(low.escalation?.strengthBp).toBe(low.strengthBp);
    }
    expect(RAID_RANKS.map((r) => r.id)).toEqual(['low', 'mid', 'high']);
    expect(RAID_RANKS.map((r) => r.rank)).toEqual(
      [...RAID_RANKS.map((r) => r.rank)].sort((a, b) => a - b),
    );
  });

  it('every step down the ladder is softer in every respect (Misa, 2026-10-29): HP, Attack, armour, card strength and roster', () => {
    for (const spec of RAID_SPECS) {
      const [low, mid, high] = (['low', 'mid', 'high'] as const).map((rank) =>
        raidBossOf(spec.id, { rank }),
      ) as [BossDef, BossDef, BossDef];
      expect(low.hp, spec.id).toBeLessThan(mid.hp);
      expect(mid.hp, spec.id).toBeLessThan(high.hp);
      expect(low.atk, spec.id).toBeLessThan(mid.atk);
      expect(mid.atk, spec.id).toBeLessThan(high.atk);
      // Clearly softer: the low rank is at least a tenth under the high rank in both, the mid rank under it by some.
      expect(low.hp, spec.id).toBeLessThanOrEqual(high.hp * 0.9);
      expect(low.atk, spec.id).toBeLessThanOrEqual(high.atk * 0.9);
      expect(mid.hp, spec.id).toBeLessThanOrEqual(high.hp * 0.95);
      expect(mid.atk, spec.id).toBeLessThanOrEqual(high.atk * 0.95);
      expect(low.strengthBp, spec.id).toBeLessThan(mid.strengthBp ?? 0);
      expect(low.rosterLevel, spec.id).toBeLessThan(mid.rosterLevel ?? 0);
      expect(mid.rosterLevel, spec.id).toBeLessThan(high.rosterLevel ?? 0);
    }
    expect(RAID_RANKS.at(-1)?.level).toBe(LEVEL);
  });

  it('Thornmother’s bark is thinner at the lower ranks than the card’s share alone would make it', () => {
    const spec = RAID_SPECS.find((s) => s.id === 'thornmother');
    const low = raidBossOf('thornmother', { rank: 'low' });
    expect(spec?.ranks?.low[2]).toBeDefined();
    expect(low.armour).toBe(
      Math.round(((spec?.armour ?? 0) * (spec?.ranks?.low[2] ?? 0)) / 10_000),
    );
    expect(low.armour).toBeLessThan(raidBossOf('thornmother', { rank: 'mid' }).armour);
    expect(raidBossOf('thornmother', { rank: 'mid' }).armour).toBeLessThan(
      raidBossOf('thornmother').armour,
    );
  });

  it('the rank’s roster level reaches every creature the weekend places: the line, the bench and a wide arena', () => {
    const low = raidBossOf('storm-sovereign', { rank: 'low' });
    const high = raidBossOf('storm-sovereign');
    expect(raidMode(low).level).toBe(RAID_RANKS[0]?.level);
    expect(raidMode(high).level).toBe(LEVEL);
    const line = [
      { formId: 'tidewing', knack: 'none' },
      { formId: 'tempestray', knack: 'none', level: 7 },
    ];
    // A pick that names a level keeps it; the others take the rank's.
    expect(toPlacements(line, raidMode(low)).map((p) => p.level)).toEqual([low.rosterLevel, 7]);
    expect(raidBench(4, low.rosterLevel).every((p) => p.level === low.rosterLevel)).toBe(true);
    expect(raidBench(4).every((p) => p.level === LEVEL)).toBe(true);
    // A weaker roster does less damage against the same boss.
    const same = { ...high, hp: 1_000_000 };
    const dmg = (b: BossDef) => {
      const w = weekend(
        b,
        toPlacements(line.slice(0, 1), { ...raidMode(b), cols: 1, rows: 1 }),
        [],
        {
          rng: rng('roster'),
          stages: 1,
        },
      );
      return 1_000_000 - (w.stages[0]?.bossHpLeft ?? 0);
    };
    expect(dmg({ ...same, rosterLevel: 12, rows: 1, cols: 1 })).toBeLessThan(
      dmg({ ...same, rosterLevel: LEVEL, rows: 1, cols: 1 }),
    );
  });

  it('an override replaces the rank’s HP and Attack', () => {
    const b = raidBossOf('old-bogback', { rank: 'low', hp: 1_000, atk: 7 });
    expect(b.hp).toBe(1_000);
    expect(b.atk).toBe(7);
  });
});

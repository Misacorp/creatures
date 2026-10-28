/** The talent measurement helpers of the lab report: score, boss calibration, boards, flags. */
import { createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { labBoss } from '../src/cards';
import { fight } from '../src/fight';
import { FORM_KNACKS } from '../src/knacks';
import {
  RAID_REACH,
  RAID_ROW,
  RAID_SCALE,
  RAID_SHAPED,
  RAID_SLOTS,
  SCORE_WEIGHTS,
  bestOnMostCards,
  boardsFor,
  calibrateBossHp,
  classicBossHp,
  fightScore,
  createRaidMeasurer,
  gainPercent,
  kinFor,
  knackForTalent,
  neighbourhoodScore,
  raidBossHp,
  raidPlacements,
  teamFor,
} from '../src/measure';
import { TALENTS } from '../src/talents';
import { formStats } from '../src/species';
import { CLASSIC_LINE, GAUNTLET, toPlacements } from '../src/search';

const won = (round: number, knockouts = 0) => ({
  damage: 1_000_000,
  won: true,
  knockouts,
  killingBlow: { round },
});

describe('fightScore', () => {
  it('weights add up to 100 and a perfect fight scores 100 less the rounds it used', () => {
    expect(Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    // Killed in round 1 of 10 with everyone standing: 50 + 20 + 15 * 9/10 + 15.
    expect(fightScore(won(1), 1000, 10, 3)).toBeCloseTo(98.5);
  });

  it('prefers a faster win and fewer knockouts', () => {
    expect(fightScore(won(5), 1000, 10, 3)).toBeGreaterThan(fightScore(won(8), 1000, 10, 3));
    expect(fightScore(won(8, 0), 1000, 10, 3)).toBeGreaterThan(fightScore(won(8, 1), 1000, 10, 3));
    // One knockout of three costs 5 points.
    expect(fightScore(won(8, 0), 1000, 10, 3) - fightScore(won(8, 1), 1000, 10, 3)).toBeCloseTo(5);
  });

  it('counts damage up to the boss HP, a win above a near miss, and a wipe as nothing standing', () => {
    const miss = { damage: 990, won: false, knockouts: 0, killingBlow: null };
    expect(fightScore(miss, 1000, 10, 3)).toBeCloseTo(49.5 + 15);
    expect(fightScore(won(10), 1000, 10, 3)).toBeGreaterThan(fightScore(miss, 1000, 10, 3));
    const wipe = { damage: 0, won: false, knockouts: 3, killingBlow: null };
    expect(fightScore(wipe, 1000, 10, 3)).toBe(0);
    // Damage past the boss's HP adds nothing.
    expect(fightScore({ ...won(10), damage: 5_000 }, 1000, 10, 3)).toBe(
      fightScore({ ...won(10), damage: 1_000 }, 1000, 10, 3),
    );
  });
});

describe('calibrateBossHp', () => {
  it('finds the HP where the mean kill round reaches the target', () => {
    // A boss dies in hp / 500 rounds.
    const hp = calibrateBossHp((h) => h / 500, 8, 1_000, 1_000_000);
    expect(Math.abs(hp - 4_000)).toBeLessThanOrEqual(1);
  });

  it('is deterministic and stays inside its bounds', () => {
    const f = (h: number) => Math.sqrt(h);
    expect(calibrateBossHp(f, 8, 100, 10_000)).toBe(calibrateBossHp(f, 8, 100, 10_000));
    expect(calibrateBossHp(f, 1_000, 100, 10_000)).toBeLessThanOrEqual(10_000);
  });
});

describe('classicBossHp', () => {
  it('makes the classic line kill a plain boss in about 8 rounds', () => {
    const hp = classicBossHp(8, 6);
    expect(hp).toBeGreaterThan(1_000);
    expect(hp).toBeLessThan(1_000_000);
    const boss = labBoss({ rows: 1, cols: 3, atk: 110, hp, rounds: 10 });
    let sum = 0;
    const n = 12;
    for (let i = 0; i < n; i++) {
      const r = fight(boss, toPlacements(CLASSIC_LINE, GAUNTLET), {
        rng: createSeededRng(`check:${i}`),
      });
      sum += r.won && r.killingBlow ? r.killingBlow.round : 11;
    }
    expect(sum / n).toBeGreaterThan(7);
    expect(sum / n).toBeLessThan(9);
  });
});

describe('gainPercent', () => {
  it('gives a percentage, and n/a (undefined) on a near-zero baseline', () => {
    expect(gainPercent(55, 50)).toBeCloseTo(10);
    expect(gainPercent(0.5, 0.05)).toBeUndefined();
    expect(gainPercent(15, 9, 10)).toBeUndefined();
    expect(gainPercent(10, 10, 10)).toBe(0);
  });
});

describe('bestOnMostCards', () => {
  const g = (o: Record<string, number>) => new Map(Object.entries(o));
  it('flags a talent that tops more than half the cards', () => {
    const gains = new Map([
      ['a', g({ c1: 5, c2: 4, c3: 1 })],
      ['b', g({ c1: 1, c2: 1, c3: 3 })],
    ]);
    expect(bestOnMostCards(gains, ['c1', 'c2', 'c3'])).toEqual(['a']);
  });

  it('flags nothing when the wins are spread out', () => {
    const gains = new Map([
      ['a', g({ c1: 5, c2: 0 })],
      ['b', g({ c1: 1, c2: 3 })],
    ]);
    expect(bestOnMostCards(gains, ['c1', 'c2'])).toEqual([]);
  });
});

describe('boards', () => {
  const forms = Object.keys(FORM_KNACKS);

  it('every board is legal: three distinct forms, the measured one in its slot', () => {
    for (const form of forms) {
      const boards = boardsFor(form);
      expect(boards.length).toBeGreaterThan(1);
      const keys = new Set<string>();
      for (const b of boards) {
        expect(b.team).toHaveLength(3);
        expect(b.team[b.slot]?.formId).toBe(form);
        expect(new Set(b.team.map((p) => p.formId)).size).toBe(3);
        keys.add(b.team.map((p) => `${p.formId}/${p.knack}`).join('|'));
      }
      expect(keys.size).toBe(boards.length);
    }
  });

  it('the first board is the natural one and the form appears in every slot', () => {
    for (const form of forms) {
      const boards = boardsFor(form);
      const nat = teamFor(form);
      expect(boards[0]?.slot).toBe(nat.slot);
      expect(boards[0]?.team.map((p) => p.formId)).toEqual(nat.team.map((p) => p.formId));
      expect(new Set(boards.map((b) => b.slot))).toEqual(new Set([0, 1, 2]));
    }
  });
});

describe('knackForTalent', () => {
  it("gives only the Mire talents a Knack, the line's Mire Knack", () => {
    expect(knackForTalent('sharp-claws', 'tidewing')).toBe('none');
    const guard = forms().find((f) => FORM_KNACKS[f]?.includes('mud-wall'));
    if (guard) expect(knackForTalent('heavy-hand', guard)).toBe('mud-wall');
    expect(knackForTalent('heavy-hand', 'tidewing')).toBe('none');
  });
});

describe('the raid row', () => {
  it('is 3 rows of 12 with the form in one slot and one slot in four kin of the form', () => {
    expect(RAID_ROW.rows * RAID_ROW.cols).toBe(36);
    const placed = raidPlacements(1, 5, { formId: 'tidewing', knack: 'none', talents: ['hardy'] });
    expect(placed).toHaveLength(36);
    const me = placed[1 * 12 + 5];
    expect(me).toMatchObject({ formId: 'tidewing', row: 1, col: 5, talents: ['hardy'] });
    // Everything else is the classic trio, or the kin: a creature of the form's own element that is not the form.
    const kin = kinFor('tidewing');
    expect(kin).not.toBe('tidewing');
    expect(formStats(kin, 25).element).toBe(formStats('tidewing', 25).element);
    const others = placed.filter((p) => p !== me);
    expect(
      others.every((p) => ['tidewing', 'tempestray', 'thornbuck', kin].includes(p.formId)),
    ).toBe(true);
    expect(placed.filter((_, k) => k % 4 === 3 && k !== 17).every((p) => p.formId === kin)).toBe(
      true,
    );
  });

  it('has kin for an element the classic trio lacks (ember, mire)', () => {
    for (const form of ['kilnmole', 'bogwarden', 'croakmire']) {
      const kin = kinFor(form);
      expect(kin).not.toBe(form);
      expect(formStats(kin, 25).element).toBe(formStats(form, 25).element);
    }
  });

  it('every raid-shaped talent exists, and the slots are inside the row', () => {
    for (const t of RAID_SHAPED) expect(TALENTS, t).toHaveProperty(t);
    for (const [r, c] of RAID_SLOTS) {
      expect(r).toBeLessThan(RAID_ROW.rows);
      expect(c).toBeLessThan(RAID_ROW.cols);
    }
    expect(RAID_SCALE).toBeCloseTo((2 * RAID_REACH + 1) / 3);
  });

  it('scores the five slots around a creature, shifted inside the row at an end', () => {
    // Slot k deals k damage; everyone stands.
    const result = {
      fighters: Array.from({ length: 36 }, (_, k) => ({ damageDealt: k, hp: 1 })),
    };
    const rowSum = (row: number, from: number) =>
      [0, 1, 2, 3, 4].reduce((a, i) => a + row * 12 + from + i, 0);
    expect(neighbourhoodScore(result, 1, 5)).toBe(rowSum(1, 3));
    // Column 0 and 11 use the nearest five: columns 0..4 and 7..11, never fewer.
    expect(neighbourhoodScore(result, 0, 0)).toBe(rowSum(0, 0));
    expect(neighbourhoodScore(result, 2, 11)).toBe(rowSum(2, 7));
    // Knocked-out neighbours cost up to half the damage.
    const hurt = {
      fighters: result.fighters.map((f, k) => (k >= 15 && k <= 16 ? { ...f, hp: 0 } : f)),
    };
    expect(neighbourhoodScore(hurt, 1, 5)).toBeCloseTo(rowSum(1, 3) * (0.5 + 0.5 * (3 / 5)));
  });

  it('the raid boss HP is what the classic row removes 90% of, and a talent that does nothing gains nothing', () => {
    const hp = raidBossHp(2);
    expect(hp).toBeGreaterThan(5_000);
    expect(raidBossHp(2)).toBe(hp);
    const m = createRaidMeasurer({ hp, seeds: 3 });
    // Opportunist is idle on a Setter, and the same seeds make the two runs identical.
    expect(m.measure('opportunist', 'tidewing')).toEqual({ bestPct: 0, randomPct: 0 });
    // Edge-walker gains at an end slot, and the best slot is at least as good as the random one.
    const edge = m.measure('edge-walker', 'tidewing');
    expect(edge.bestPct).toBeGreaterThan(0);
    expect(edge.bestPct).toBeGreaterThanOrEqual(edge.randomPct);
  });
});

function forms(): string[] {
  return Object.keys(FORM_KNACKS);
}

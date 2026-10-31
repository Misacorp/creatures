/**
 * Luck is a build (Misa, 2026-10-30): a crit doubles a hit, crit chance and crit damage stack from the species, the Knack and the
 * talents, Sure Crits tie crits to dodging and guarding, and bosses can crit and dodge more. What the engine does with the numbers (the
 * crit step, Sure Crits, boss crits, Cool Head, Slippery, Breakwater) is proved in the engine tests (`v2-hits`, `v2-cuts`, `v2-boss`,
 * `v2-silence`) on hand-built creatures; this file is the content: what the catalogue says, and that the resolver hands it on.
 */
import { createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  CARDS,
  KEYWORDS,
  KNACKS,
  LAB_RULES,
  TALENTS,
  card,
  fight,
  formStats,
  labBoss,
  placeFighters,
  type Placement,
} from '../src';

const rng = (s: string) => createSeededRng(s);
const at = (
  formId: string,
  row: number,
  col: number,
  knack?: string,
  talents?: readonly string[],
): Placement => ({
  owner: 'p1',
  formId,
  level: 25,
  row,
  col,
  ...(knack ? { knack } : {}),
  ...(talents ? { talents } : {}),
});
const bp = (id: string, key: string): number =>
  (TALENTS[id]?.fx as Record<string, number | undefined> | undefined)?.[key] ?? 0;

describe('the resolver hands the engine the luck stats', () => {
  it('the species crit stats, and the Knack and the talents merged, with only the talents plain lines kept for silence', () => {
    // Cindle is a crit machine (+10 points of chance, +50 points of damage); Wild Swing adds its own, Crit Damage a talent line.
    const st = formStats('cindle', 25);
    expect(st.critChanceBp).toBeGreaterThan(0);
    expect(st.critDamageBp).toBeGreaterThan(0);
    const swing = KNACKS['wild-swing']?.fx;
    expect(swing?.critChanceBp).toBeGreaterThan(0);
    expect(swing?.critDamageBp).toBeGreaterThan(0);
    const [cindle] = placeFighters([at('cindle', 0, 0, 'wild-swing', ['crit-damage'])]);
    expect(cindle?.critChanceBp).toBe(st.critChanceBp);
    expect(cindle?.critDamageBp).toBe(st.critDamageBp);
    expect(cindle?.fxAll.critChanceBp).toBe(swing?.critChanceBp);
    expect(cindle?.fxAll.critDamageBp).toBe(
      (swing?.critDamageBp ?? 0) + bp('crit-damage', 'critDamageBp'),
    );
    // Silence blanks the Knack and keeps the talent's stat line: the creature's own stat set is the talent line alone.
    expect(cindle?.fxStat).toMatchObject({ critDamageBp: bp('crit-damage', 'critDamageBp') });
    expect(cindle?.fxStat.critChanceBp).toBeUndefined();
    expect(cindle?.fxStat.plainBp).toBeUndefined();
  });

  it('Cool Head wards the whole extra damage of a boss crit, and Crit Chance and Crit Damage are the gear lines of the same names', () => {
    expect(KNACKS['cool-head']?.fx.critWardBp).toBe(10_000);
    expect(bp('crit-chance', 'critChanceBp')).toBeGreaterThan(0);
    expect(bp('crit-damage', 'critDamageBp')).toBeGreaterThan(0);
    // The effects the Sure Crit talents name.
    expect(bp('perfect-timing', 'dodgeCritBp')).toBeGreaterThan(0);
    expect(bp('hold-the-line', 'guardCritBp')).toBeGreaterThan(0);
    expect(TALENTS['steady-rhythm']?.fx.steadyRhythm).toBe(true);
  });
});

describe('the luck rule cards', () => {
  it('Lucky Strike gives the boss a crit chance and Slippery a flat dodge, both by strength', () => {
    const b = labBoss({ rows: 1, cols: 1 });
    expect(b.critChanceBp).toBeUndefined();
    expect(card('lucky-strike').apply(b).critChanceBp).toBe(2_000);
    expect(card('lucky-strike').apply(b, 5_000).critChanceBp).toBe(1_000);
    expect(card('lucky-strike').apply(b, 0).critChanceBp).toBe(0);
    expect(card('slippery').apply(b).dodgeBp).toBe(2_500);
    expect(card('slippery').apply(b, 4_000).dodgeBp).toBe(1_000);
    expect(card('slippery').apply(b, 0).dodgeBp).toBe(0);
    expect(CARDS.map((c) => c.id)).toEqual(expect.arrayContaining(['lucky-strike', 'slippery']));
  });

  it('Lucky Strike makes the boss crit in a fight', () => {
    const boss = labBoss({ rows: 1, cols: 2, rounds: 40, atk: 20, cards: ['lucky-strike'] });
    const team = [at('kilnmole', 0, 0), at('thornbuck', 0, 1)];
    const res = fight(boss, team, { rng: rng('lucky'), log: true });
    const count = (kind: string) => res.events.filter((e) => e.kind === kind).length;
    expect(count('boss-crit')).toBeGreaterThan(0);
    // 20% of the hits that land: far from none, far from all.
    expect(count('boss-crit')).toBeLessThan(count('target'));
  });
});

describe('the luck content', () => {
  it('Crit Chance and Crit Damage are the gear lines of the same names; the keyword Crit is defined', () => {
    expect(TALENTS['crit-chance']?.name).toBe('Crit Chance');
    expect(TALENTS['crit-damage']?.name).toBe('Crit Damage');
    expect(KEYWORDS).toHaveProperty('Crit');
    expect(KEYWORDS).toHaveProperty('Sure Crit');
  });
});

describe('the luck texts (panel 6)', () => {
  const texts = (): string[] =>
    [...Object.values(KNACKS), ...Object.values(TALENTS)].map((d) => d.text);

  it('say Sure Crit, not Crit Charge, and never use "charge" for it', () => {
    for (const text of texts()) expect(text).not.toMatch(/crit charge/i);
    expect(Object.keys(KEYWORDS)).toContain('Sure Crit');
    expect(Object.keys(KEYWORDS)).not.toContain('Crit Charge');
    expect(TALENTS['perfect-timing']?.text).toContain('{Sure Crit}');
    expect(TALENTS['hold-the-line']?.text).toContain('{Sure Crit}');
  });

  it('write crit damage as a multiplier and crit chance in points, with the numbers the effects have', () => {
    const x = (n: number) => `${n / 10_000}x`;
    const crit = (extra: number) => x(LAB_RULES.critBp + extra);
    expect(TALENTS['crit-damage']?.text).toContain(crit(bp('crit-damage', 'critDamageBp')));
    expect(TALENTS['steady-rhythm']?.text).toContain(
      `+${x(bp('steady-rhythm', 'critDamageBp'))} on crits`,
    );
    const swing = KNACKS['wild-swing']?.fx;
    expect(KNACKS['wild-swing']?.text).toContain(
      `+${(swing?.critChanceBp ?? 0) / 100} crit chance points`,
    );
    expect(KNACKS['wild-swing']?.text).toContain(`+${x(swing?.critDamageBp ?? 0)}`);
    expect(TALENTS['crit-chance']?.text).toContain(
      `+${bp('crit-chance', 'critChanceBp') / 100} crit chance points`,
    );
    // The Sure Crit talents name the crit they give: the double and the effect's extra.
    expect(TALENTS['perfect-timing']?.text).toContain(crit(bp('perfect-timing', 'dodgeCritBp')));
    expect(TALENTS['hold-the-line']?.text).toContain(crit(bp('hold-the-line', 'guardCritBp')));
    for (const text of texts())
      expect(text).not.toMatch(/crit[^.]*\+\d+% more|crits? deal \+?\d+%/i);
  });

  it('fit the two-line budget of the lab report (95 characters)', () => {
    for (const id of ['hold-the-line', 'perfect-timing', 'steady-rhythm', 'crit-damage'])
      expect((TALENTS[id]?.text ?? '').replace(/[{}]/g, '').length, id).toBeLessThanOrEqual(95);
    expect((KNACKS['wild-swing']?.text ?? '').replace(/[{}]/g, '').length).toBeLessThanOrEqual(95);
  });
});

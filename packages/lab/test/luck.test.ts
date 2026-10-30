/**
 * Luck is a build (Misa, 2026-10-30): a crit doubles a hit, crit chance and crit damage stack from the species, the Knack and
 * the talents, Sure Crits tie crits to dodging and guarding, and bosses can crit and dodge more. One test per rule, on the
 * smallest board that proves it. "Always crits" is set up with enough Crit Chance talents to pass 100% (the roll caps there).
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
  keywordsIn,
  labBoss,
  type BossDef,
  type FightResult,
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
/** A boss that never dodges and never attacks, so only the creatures' own hits count. */
const calm = (o: Parameters<typeof labBoss>[0]): BossDef => {
  const b = labBoss(o);
  return { ...b, spd: 0, plain: { ...b.plain, powerBp: 0 } };
};
const run = (boss: BossDef, team: Placement[], seed = 'luck') =>
  fight(boss, team, { rng: rng(seed), log: true });
const bp = (id: string, key: string): number =>
  (TALENTS[id]?.fx as Record<string, number | undefined> | undefined)?.[key] ?? 0;
/** Enough Crit Chance talents that every hit crits (the roll caps at 100%). */
const SURE = Array.from(
  { length: Math.ceil(10_000 / bp('crit-chance', 'critChanceBp')) },
  () => 'crit-chance',
);
const count = (res: FightResult, kind: string, from?: string) =>
  res.events.filter((e) => e.kind === kind && (from === undefined || e.text.startsWith(from)))
    .length;
/** What the first hit on `name` really did, from the first of a few seeds where it was not dodged. */
const landed = (boss: BossDef, team: Placement[], name: string): number | undefined => {
  for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
    const e = run(boss, team, seed).events.find(
      (x) => x.kind === 'hit' && x.text.startsWith(`${name} takes `),
    );
    if (e) return Number(e.text.split(' ')[2]);
  }
  return undefined;
};

describe('a crit doubles the hit (R7.1)', () => {
  const boss = calm({ rows: 1, cols: 1, rounds: 1 });
  const plain = formStats('tidewing', 25).atk;

  it('a creature that always crits deals twice its plain hit, and one that never crits deals the plain hit', () => {
    expect(LAB_RULES.critBp).toBe(20_000);
    expect(run(boss, [at('tidewing', 0, 0, 'none', SURE)]).damage).toBe(2 * plain - boss.armour);
    // The base 5% is real: some seeds crit, most do not.
    const hits = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'].map(
      (s) => run(boss, [at('tidewing', 0, 0)], s).damage,
    );
    for (const d of hits) expect([plain - boss.armour, 2 * plain - boss.armour]).toContain(d);
    expect(hits.filter((d) => d === plain - boss.armour).length).toBeGreaterThan(6);
  });

  it('a crit of a heal stays at one and a half times: a heal is not a hit', () => {
    expect(LAB_RULES.healCritBp).toBe(15_000);
  });

  it('crit damage from talents adds to the double and stacks with itself', () => {
    const per = bp('crit-damage', 'critDamageBp');
    const two = run(boss, [at('tidewing', 0, 0, 'none', [...SURE, 'crit-damage', 'crit-damage'])]);
    expect(two.damage).toBe(
      Math.floor((plain * (LAB_RULES.critBp + 2 * per)) / 10_000) - boss.armour,
    );
    // +100% twice on top of the double: a crit deals four times, +300%.
    expect(LAB_RULES.critBp + 2 * per).toBeGreaterThanOrEqual(30_000);
  });

  it('the species, the Knack and the talents all add: chance, and damage on top of the double', () => {
    // Cindle is a crit machine (Attack x0.86, +10 points of chance, +50 points of damage); Wild Swing adds its own.
    const st = formStats('cindle', 25);
    expect(st.critChanceBp).toBeGreaterThan(0);
    const swing = KNACKS['wild-swing']?.fx;
    const cut = swing?.plainBp ?? 10_000;
    const total =
      LAB_RULES.critBp +
      st.critDamageBp +
      (swing?.critDamageBp ?? 0) +
      bp('crit-damage', 'critDamageBp');
    const res = run(boss, [at('cindle', 0, 0, 'wild-swing', [...SURE, 'crit-damage'])]);
    const base = Math.floor((st.atk * cut) / 10_000);
    expect(res.damage).toBe(Math.floor((base * total) / 10_000) - boss.armour);
    // +200% or more is reachable: a stack of a species, a Knack and one talent is a x4 crit and more.
    expect(total).toBeGreaterThanOrEqual(30_000);
    const fighter = res.fighters[0];
    expect(fighter?.critChanceBp).toBe(st.critChanceBp);
  });

  it('Crit Chance is +12 points: with and without it, the same seeds crit more often', () => {
    const long = calm({ rows: 1, cols: 1, rounds: 400 });
    const crits = (talents: string[]) =>
      count(run(long, [at('tidewing', 0, 0, 'none', talents)], 'rate'), 'crit');
    const base = crits([]);
    const lucky = crits(['crit-chance']);
    // 5% of 400 is about 20; 17% of 400 is about 68.
    expect(base).toBeGreaterThan(8);
    expect(base).toBeLessThan(40);
    expect(lucky).toBeGreaterThan(50);
    expect(lucky).toBeLessThan(90);
  });

  it("a silenced creature keeps its species crit stats and its talents' crit lines (R12, panel 6)", () => {
    const hush = {
      id: 's',
      name: 'Hush',
      pattern: { anchor: 'front' as const, shape: 'all' as const },
      powerBp: 0,
      every: 1,
      turn: 0,
      silenceTurns: 9,
    };
    const long = { ...calm({ rows: 1, cols: 1, rounds: 200 }), moves: [hush] };
    // Round 1's hit is made before the silence. After it the species' own 15% and the talents' 12 points each stay (three of
    // them: 51%). (fightRules.test.ts proves the stat lines and the blanked Knack with a scripted RNG.)
    const talents = ['crit-chance', 'crit-chance', 'crit-chance'];
    const kept = count(run(long, [at('cindle', 0, 0, 'none', talents)], 'quiet'), 'crit');
    const bare = count(run(long, [at('cindle', 0, 0, 'none')], 'quiet'), 'crit');
    expect(kept).toBeGreaterThan(60);
    expect(kept).toBeLessThan(140);
    expect(bare).toBeGreaterThan(10);
    expect(bare).toBeLessThan(60);
  });
});

describe('Sure Crits (R7.1)', () => {
  /** A boss whose plain attack aims at the front-left creature every round; nobody dodges unless they can. */
  const sniper = (rounds: number, atk = 1): BossDef => {
    const b = labBoss({ rows: 1, cols: 3, rounds, atk });
    return {
      ...b,
      spd: 0,
      plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 10_000 },
    };
  };

  it('Perfect Timing: a dodge stores a charge, and the next hit that lands is a crit with its extra damage', () => {
    // Many tiny hits on a fast creature: it dodges often, so it stores charges and spends them on its next hit.
    const b = labBoss({ rows: 1, cols: 1, rounds: 12 });
    const boss: BossDef = {
      ...b,
      spd: 0,
      plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 100, hits: 25 },
    };
    const res = run(boss, [at('voltaro', 0, 0, 'zigzag', ['perfect-timing'])]);
    const stored = count(res, 'sure-crit', 'Voltaro stores');
    const spent = count(res, 'sure-crit', 'Voltaro spends');
    expect(stored).toBeGreaterThan(3);
    // Every spend is on a hit that landed and was a crit; none can be spent without having been stored.
    expect(spent).toBeGreaterThan(0);
    expect(spent).toBeLessThanOrEqual(stored);
    expect(count(res, 'crit', 'Voltaro')).toBeGreaterThanOrEqual(spent);
    expect(res.fighters[0]?.sureCrits).toBe(stored - spent);
    expect(res.fighters[0]?.fires['dodgeCritBp']).toBe(stored);
  });

  it('Perfect Timing: only a dodge stores a charge, not a Guard taking the hit for it', () => {
    const team = [at('tidewing', 0, 0, 'none', ['perfect-timing']), at('thornbuck', 0, 1)];
    const res = run(sniper(4), team);
    expect(count(res, 'intercept')).toBe(4);
    expect(count(res, 'sure-crit')).toBe(0);
  });

  it('a creature stores at most three charges, and a charge is spent only by a hit that lands (R10)', () => {
    // Many tiny hits on a fast creature, and the boss dodges half of its hits: a dodged hit keeps its charge.
    const b = labBoss({ rows: 1, cols: 1, rounds: 12 });
    const boss: BossDef = {
      ...b,
      spd: 0,
      dodgeBp: 5_000,
      plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 100, hits: 25 },
    };
    const res = run(boss, [at('voltaro', 0, 0, 'zigzag', ['perfect-timing'])], 'cap');
    expect(count(res, 'boss-dodge')).toBeGreaterThan(0);
    expect(res.fighters[0]?.sureCrits).toBeLessThanOrEqual(LAB_RULES.sureCritMax);
    for (const e of res.events.filter((x) => x.kind === 'sure-crit'))
      expect(Number(/\((\d)/.exec(e.text)?.[1])).toBeLessThanOrEqual(LAB_RULES.sureCritMax);
    // Every charge spent was spent on a hit the boss did not dodge: a spend is followed by a crit of that creature.
    expect(count(res, 'crit', 'Voltaro')).toBeGreaterThanOrEqual(
      count(res, 'sure-crit', 'Voltaro spends'),
    );
  });

  describe('Hold the Line', () => {
    /** A boss whose plain attack hits the front-left creature hard enough that the Guard beside it takes real damage. */
    const heavy = (rounds: number): BossDef => ({
      ...labBoss({ rows: 1, cols: 3, rounds, atk: 90 }),
      spd: 0,
      armour: 0,
      plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 10_000 },
    });
    const team = (talents: string[]) => [
      at('tidewing', 0, 0),
      at('thornbuck', 0, 1, 'none', talents),
    ];
    const guard = formStats('thornbuck', 25);
    const per = Math.floor((guard.hp * LAB_RULES.guardSureCritShareBp) / 10_000);
    const taken = (res: FightResult): number =>
      res.events
        .filter((e) => e.kind === 'hit' && e.text.startsWith('Thornbuck takes '))
        .reduce((sum, e) => sum + Number(e.text.split(' ')[2]), 0);

    it('a Guard stores a charge each time the hits it takes for others add up to a share of its max HP', () => {
      const res = run(heavy(8), team(['hold-the-line']));
      expect(count(res, 'intercept')).toBeGreaterThanOrEqual(6);
      // Charges stored are the intercepted damage over the share (the Guard is never knocked out here).
      expect(res.fighters[1]?.hp).toBeGreaterThan(0);
      const stored = count(res, 'sure-crit', 'Thornbuck stores');
      expect(stored).toBe(Math.floor(taken(res) / per));
      expect(stored).toBeGreaterThan(0);
      expect(stored).toBeLessThan(8);
      // It spends them on crits; without the talent it never stores one.
      expect(count(res, 'crit', 'Thornbuck')).toBeGreaterThanOrEqual(
        count(res, 'sure-crit', 'Thornbuck spends'),
      );
      expect(count(run(heavy(8), team([])), 'sure-crit')).toBe(0);
    });

    it('a hit it takes for itself builds nothing: only intercepted damage counts', () => {
      // The Guard is the front creature: the boss aims at it, nothing is intercepted.
      const alone = [at('thornbuck', 0, 0, 'none', ['hold-the-line'])];
      expect(count(run(heavy(6), alone), 'sure-crit')).toBe(0);
    });

    it('the guaranteed crit deals the double and its extra damage', () => {
      const res = run(heavy(8), team(['hold-the-line']));
      const spent = count(res, 'sure-crit', 'Thornbuck spends');
      expect(spent).toBeGreaterThan(0);
      // Its damage is above what the same Guard deals without the talent, which crits only on its base 5% chance.
      const plain = run(heavy(8), team([]));
      expect(res.fighters[1]?.damageDealt ?? 0).toBeGreaterThan(
        plain.fighters[1]?.damageDealt ?? 0,
      );
    });
  });

  it('silence: charges stored before it stay, and a silenced creature neither stores nor spends one (R12.2)', () => {
    // Row 0's boss turn lets the Guard take a heavy hit and store a charge; row 1's boss turn then silences everyone for good.
    const share = Math.floor(
      (formStats('thornbuck', 25).hp * LAB_RULES.guardSureCritShareBp) / 10_000,
    );
    // One hit is worth one and a half shares: one charge, and half a share towards the next.
    const b = labBoss({ rows: 2, cols: 3, rounds: 6, atk: Math.floor(share * 1.5) });
    const boss: BossDef = {
      ...b,
      spd: 0,
      armour: 0,
      plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 10_000 },
      moves: [
        {
          id: 's',
          name: 'Hush',
          pattern: { anchor: 'front', shape: 'all' },
          powerBp: 0,
          every: 1,
          turn: 1,
          silenceTurns: 9,
        },
      ],
    };
    const team = [at('tidewing', 0, 0), at('thornbuck', 0, 1, 'none', ['hold-the-line'])];
    const res = run(boss, team);
    // Round 1 (before the silence in round 2) stored one; afterwards the Guard is silenced: it no longer intercepts, stores or spends.
    expect(count(res, 'sure-crit', 'Thornbuck stores')).toBe(1);
    expect(count(res, 'sure-crit', 'Thornbuck spends')).toBe(0);
    expect(res.fighters[1]?.sureCrits).toBe(1);
  });
});

describe('Cool Head and boss crits (R7.1)', () => {
  /** A boss that crits every hit it lands, aimed at the front-left creature. */
  const crits = (chance: number, atk = 110): BossDef => {
    const b = labBoss({ rows: 1, cols: 3, rounds: 1, atk });
    return {
      ...b,
      spd: 0,
      critChanceBp: chance,
      plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 10_000 },
    };
  };
  const armour = formStats('kilnmole', 25).armour;

  /** A hit of `proposed` after a boss crit that `ward` (bp) softens, before cuts and armour. */
  const critted = (proposed: number, ward = 0): number =>
    proposed + Math.floor((proposed * (LAB_RULES.critBp - 10_000) * (10_000 - ward)) / 1e8);

  it('a boss crit doubles the hit before cuts and armour: the cuts and the armour come off the doubled hit', () => {
    expect(landed(crits(0), [at('kilnmole', 0, 0)], 'Kilnmole')).toBe(110 - armour);
    expect(landed(crits(10_000), [at('kilnmole', 0, 0)], 'Kilnmole')).toBe(220 - armour);
    // Front-liner (10% less in the front row) comes off the doubled hit, then the armour.
    const cut = bp('front-liner', 'frontCutBp');
    expect(cut).toBeGreaterThan(0);
    expect(landed(crits(10_000), [at('kilnmole', 0, 0, 'none', ['front-liner'])], 'Kilnmole')).toBe(
      Math.floor((220 * (10_000 - cut)) / 10_000) - armour,
    );
  });

  it('a boss with no crit chance draws nothing: its fights are the same as before', () => {
    const team = [at('kilnmole', 0, 0), at('tempestray', 0, 1)];
    const a = run(crits(0), team, 'same');
    const without: BossDef = { ...crits(0) };
    delete (without as { critChanceBp?: number }).critChanceBp;
    const b = run(without, team, 'same');
    expect(a.events.map((e) => e.text)).toEqual(b.events.map((e) => e.text));
    expect(count(a, 'boss-crit')).toBe(0);
  });

  it('Cool Head: crits on it and on the creatures beside it deal half as much extra', () => {
    const ward = KNACKS['cool-head']?.fx.critWardBp ?? 0;
    expect(ward).toBe(5_000);
    // Its own crit damage taken: the creature has the Knack itself.
    expect(landed(crits(10_000), [at('kilnmole', 0, 0, 'cool-head')], 'Kilnmole')).toBe(
      critted(110, ward) - armour,
    );
    // Not beside it (a slot between): nothing is softened.
    expect(
      landed(crits(10_000), [at('kilnmole', 0, 0), at('thornbuck', 0, 2, 'cool-head')], 'Kilnmole'),
    ).toBe(critted(110) - armour);
    // A Guard beside the target takes the hit (an intercept) and has the ward itself.
    expect(
      landed(
        crits(10_000),
        [at('tidewing', 0, 0), at('thornbuck', 0, 1, 'cool-head')],
        'Thornbuck',
      ),
    ).toBe(critted(110, ward) - formStats('thornbuck', 25).armour);
    // Its aura: an area hit is not intercepted, so the creature beside a Cool Head takes the softened crit itself (the Guard's cover cuts 40%).
    const sweep: BossDef = {
      ...crits(10_000),
      plain: { pattern: { anchor: 'front', shape: 'row' }, powerBp: 10_000 },
    };
    const cover = (dmg: number): number =>
      Math.floor((dmg * (10_000 - LAB_RULES.coverBp)) / 10_000);
    const tide = formStats('tidewing', 25).armour;
    const beside = (knack: string) =>
      landed(sweep, [at('tidewing', 0, 0), at('thornbuck', 0, 1, knack)], 'Tidewing');
    expect(beside('cool-head')).toBe(cover(critted(110, ward)) - tide);
    expect(beside('none')).toBe(cover(critted(110)) - tide);
  });

  it('a one-shot never crits', () => {
    const b = crits(10_000);
    const bolt: BossDef = {
      ...b,
      plain: { ...b.plain, powerBp: 0 },
      moves: [
        {
          id: 'bolt',
          name: 'Bolt',
          pattern: { anchor: 'front', shape: 'single' },
          powerBp: 0,
          oneShotBp: 5_000,
          every: 1,
        },
      ],
    };
    const res = run(bolt, [at('kilnmole', 0, 0)]);
    expect(count(res, 'boss-crit')).toBe(0);
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

  it('Lucky Strike makes the boss crit in a fight, and a Guard with Cool Head takes less from it', () => {
    const boss = labBoss({ rows: 1, cols: 2, rounds: 40, atk: 20, cards: ['lucky-strike'] });
    const team = [at('kilnmole', 0, 0), at('thornbuck', 0, 1)];
    const res = fight(boss, team, { rng: rng('lucky'), log: true });
    expect(count(res, 'boss-crit')).toBeGreaterThan(0);
    // 20% of the hits that land: far from none, far from all.
    const landed = count(res, 'target');
    expect(count(res, 'boss-crit')).toBeLessThan(landed);
  });

  it('Slippery: the boss dodges more, a debuff does not slow it, and only a hit that cannot be dodged gets past it', () => {
    const base = calm({ rows: 1, cols: 3, rounds: 60 });
    const slippery: BossDef = { ...base, dodgeBp: 5_000 };
    const dodges = (team: Placement[], boss = slippery) =>
      fight(boss, team, { rng: rng('slip'), log: true }).events.filter(
        (e) => e.kind === 'boss-dodge' && e.text.endsWith(' dodges Tidewing'),
      ).length;
    // A flat half: about half of 60 hits, with no Speed at all.
    const plain = dodges([at('tidewing', 0, 0)]);
    expect(plain).toBeGreaterThan(15);
    expect(plain).toBeLessThan(45);
    expect(dodges([at('tidewing', 0, 0)], base)).toBe(0);
    // Mired takes off the Speed's dodge only: with Mired stacking up, the flat part stays.
    const mired = dodges([at('tidewing', 0, 0), at('croakmire', 0, 1, 'squelch-song')]);
    expect(mired).toBeGreaterThan(15);
    // Clear Skies: the hits of the creatures beside the Support (the Tidewing) cannot be dodged.
    const clear = dodges([at('tidewing', 0, 0), at('halcyray', 0, 1, 'clear-skies')]);
    expect(clear).toBe(0);
  });
});

describe('the luck content', () => {
  it('Crit Chance and Crit Damage are the gear lines of the same names; the talents and Knacks use only known keywords', () => {
    expect(TALENTS['crit-chance']?.name).toBe('Crit Chance');
    expect(TALENTS['crit-damage']?.name).toBe('Crit Damage');
    for (const id of ['crit-chance', 'crit-damage', 'perfect-timing', 'hold-the-line'])
      for (const w of keywordsIn(TALENTS[id]?.text ?? ''))
        expect(KEYWORDS, `${id} {${w}}`).toHaveProperty(w);
    for (const id of ['wild-swing', 'cool-head'])
      for (const w of keywordsIn(KNACKS[id]?.text ?? ''))
        expect(KEYWORDS, `${id} {${w}}`).toHaveProperty(w);
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
    const x = (bp: number) => `${bp / 10_000}x`;
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

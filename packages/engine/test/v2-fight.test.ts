/**
 * The combat v2 engine (`@creatures/engine/v2`) on hand-built inputs: effects are named directly (no Knack or talent catalogue), the
 * rules numbers and the element chart are part of the input, and a stored input replays exactly after a JSON round trip. The rule tests
 * move down from the lab in a later slice (docs/design/combat/engine-port.md, section 3); this is the seam's smoke test.
 */
import { createSeededRng } from '@creatures/game';
import {
  fightV2,
  weekendV2,
  type BossDef,
  type FightInputV2,
  type FighterSpec,
  type KnackFx,
  type V2Rules,
  type WeekendFighterSpec,
  type WeekendInputV2,
} from '@creatures/engine/v2';
import { describe, expect, it } from 'vitest';

/** The lab's starting numbers, written out: an input carries its own rules. */
const RULES: V2Rules = {
  payoffMultBp: 20_000,
  extraStackBp: 5_000,
  maxBonusFactorBp: 30_000,
  maxStacks: 3,
  dodgePerSpdBp: 10,
  dodgeMaxBp: 5_000,
  areaDodgeShareBp: 5_000,
  critChanceBp: 500,
  critBp: 20_000,
  healCritBp: 15_000,
  sureCritMax: 3,
  guardSureCritShareBp: 2_500,
  coverBp: 4_000,
  cutMaxBp: 7_500,
  guardReach: 1,
  supportBoostBp: 1_500,
  supportBoostEmberBp: 2_500,
  supportHealBp: { tide: 400, grove: 600 },
  maxHitBonusBp: 15_000,
  flankGuardSlots: 2,
  opportunistFromStacks: 2,
  miredPerStackBp: 150,
  miredClingingStackBp: 225,
  miredMaxStacks: 5,
  miredFadeEvery: 2,
  miredClingingFadeEvery: 3,
  holdOnLeaveBp: 4_000,
  adaptElementBp: 7_500,
  miredSlowsEscalationBp: 2_500,
  finisherBelowBp: 3_333,
};

/** Tide hits Ember hard and cashes an Ember mark; Ember hits Tide softly. */
const CHART = [
  { attacker: 'tide', defender: 'ember', bp: 15_000 },
  { attacker: 'ember', defender: 'tide', bp: 5_000 },
];

const member = (
  role: FighterSpec['role'],
  element: string,
  col: number,
  fx: KnackFx = {},
  over: Partial<WeekendFighterSpec> = {},
): WeekendFighterSpec => ({
  owner: 'p1',
  formId: `${role}-form`,
  name: `${role} ${element}`,
  element,
  role,
  maxHp: 400,
  atk: 90,
  spd: 12,
  baseArmour: 2,
  critChanceBp: 0,
  critDamageBp: 0,
  talents: [],
  fxAll: fx,
  fxStat: {},
  triageIdle: false,
  row: 0,
  col,
  ...over,
});

const fighter = (
  uid: string,
  role: FighterSpec['role'],
  element: string,
  col: number,
  fx: KnackFx = {},
): FighterSpec => ({ uid, ...member(role, element, col, fx) });

const BOSS: BossDef = {
  id: 'test-golem',
  name: 'Test Golem',
  element: 'ember',
  hp: 3_000,
  atk: 70,
  armour: 6,
  spd: 5,
  rounds: 6,
  rows: 1,
  cols: 2,
  plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 10_000 },
  moves: [],
  cards: [],
  mods: {},
};

function input(over: Partial<FightInputV2> = {}): FightInputV2 {
  return {
    version: 2,
    rules: RULES,
    elements: ['ember', 'tide'],
    chart: CHART,
    boss: BOSS,
    // A Setter that leaves two counts of an Ember mark, and a Tide Payoff that cashes it with a bigger reaction.
    fighters: [
      fighter('setter', 'setter', 'ember', 0, { markStacks: 2 }),
      fighter('payoff', 'payoff', 'tide', 1, { reactionBonusBp: 2_500, critDamageBp: 5_000 }),
    ],
    options: { log: true },
    ...over,
  };
}

const play = (i: FightInputV2, seed = 'smoke') => fightV2(i, createSeededRng(seed));

describe('fightV2 on a hand-built input', () => {
  it('gives a stable result for a seed', () => {
    const r = play(input());
    expect({
      damage: r.damage,
      bossHpLeft: r.bossHpLeft,
      won: r.won,
      reactions: r.reactions,
      reactionsByMark: r.reactionsByMark,
      blocked: r.blocked,
      dodges: r.dodges,
      hpLeft: [...r.hpLeft],
      events: r.events.length,
    }).toMatchInlineSnapshot(`
      {
        "blocked": 0,
        "bossHpLeft": 714,
        "damage": 2286,
        "dodges": 0,
        "events": 24,
        "hpLeft": [
          [
            "setter",
            0,
          ],
          [
            "payoff",
            400,
          ],
        ],
        "reactions": 6,
        "reactionsByMark": {
          "ember": 6,
        },
        "won": false,
      }
    `);
    // The same input and the same dice give the same fight.
    expect(play(input())).toEqual(r);
  });

  it('replays exactly from the input after a JSON round trip', () => {
    const original = input();
    const stored = JSON.parse(JSON.stringify(original)) as FightInputV2;
    expect(stored).toEqual(original);
    for (const seed of ['a', 'b', 'c']) expect(play(stored, seed)).toEqual(play(original, seed));
  });

  it('reads the rules numbers from the input', () => {
    const base = play(input());
    const heavier = play(input({ rules: { ...RULES, payoffMultBp: 40_000 } }));
    expect(base.reactions).toBeGreaterThan(0);
    expect(heavier.damage).toBeGreaterThan(base.damage);
  });

  it('reads the element chart from the input: with no strong pair nothing is cashed', () => {
    const flat = play(input({ chart: [] }));
    expect(flat.reactions).toBe(0);
    expect(play(input()).reactions).toBeGreaterThan(0);
  });

  it('takes the first element, in the order the input gives, that a creature can cash (marks as cashable)', () => {
    const chart = [
      { attacker: 'tide', defender: 'ember', bp: 15_000 },
      { attacker: 'tide', defender: 'grove', bp: 15_000 },
    ];
    const guard = fighter('guard', 'guard', 'tide', 0, { marksAs: 'cashable' });
    const marked = (elements: string[]) =>
      play(input({ elements, chart, fighters: [guard] })).events.find((e) => e.kind === 'mark')
        ?.text;
    expect(marked(['ember', 'grove', 'tide'])).toBe('ember x1');
    expect(marked(['grove', 'ember', 'tide'])).toBe('grove x1');
  });

  it('refuses an input of another version', () => {
    expect(() =>
      fightV2({ ...input(), version: 3 } as unknown as FightInputV2, createSeededRng('x')),
    ).toThrow(/version 2/);
  });
});

describe('weekendV2 on a hand-built input', () => {
  /** A frail creature of `owner`, so a hard boss knocks it out. */
  const frail = (
    role: FighterSpec['role'],
    element: string,
    col: number,
    fx: KnackFx = {},
    owner = 'p1',
  ): WeekendFighterSpec => member(role, element, col, fx, { owner, maxHp: 120 });

  /** A boss that hits hard, so the first stage knocks creatures out and the bench steps in. */
  const hard: BossDef = { ...BOSS, hp: 20_000, atk: 160, rounds: 4 };

  function weekendInput(): WeekendInputV2 {
    return {
      version: 2,
      rules: RULES,
      elements: ['ember', 'tide'],
      chart: CHART,
      boss: hard,
      team: [frail('setter', 'ember', 0, { markStacks: 2 }), frail('payoff', 'tide', 1, {}, 'p2')],
      bench: [frail('guard', 'tide', 0, {}, 'p1'), frail('guard', 'tide', 0, {}, 'p2')],
      options: { stages: 3 },
    };
  }

  it('plays stages that share the boss HP, replaces the knocked out from the bench, and names creatures by slot', () => {
    const w = weekendV2(weekendInput(), createSeededRng('weekend'));
    expect({
      stages: w.stages.length,
      won: w.won,
      replacements: w.replacements,
      bossHp: w.stages.map((s) => s.bossHpLeft),
      uids: w.stages.map((s) => s.fighters.map((f) => f.uid)),
    }).toMatchInlineSnapshot(`
      {
        "bossHp": [
          19388,
          19001,
          19001,
        ],
        "replacements": 2,
        "stages": 3,
        "uids": [
          [
            "p1:setter-form:0",
            "p2:payoff-form:1",
          ],
          [
            "p1:guard-form:0",
            "p2:guard-form:1",
          ],
          [],
        ],
        "won": false,
      }
    `);
  });

  it('replays exactly after a JSON round trip', () => {
    const original = weekendInput();
    const stored = JSON.parse(JSON.stringify(original)) as WeekendInputV2;
    expect(weekendV2(stored, createSeededRng('w'))).toEqual(
      weekendV2(original, createSeededRng('w')),
    );
  });
});

/**
 * Measures of the written answers (panel 5): random and no talents, the answer's own tool, the gate check and the card
 * hint generated from measurement.
 */
import { createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  BOSS_ANSWERS,
  GATE_BOSSES,
  GATE_DROP,
  MECHANICS,
  answerLine,
  answerProblems,
  failingGates,
  familyDrops,
  familyGates,
  hintName,
  measuredHint,
  noTalents,
  ownFamilies,
  randomTalents,
  raidBossOf,
  robustnessOf,
  toolCost,
  type Call,
  type Measured,
} from '../src';

const mech = (id: string) => MECHANICS.find((m) => m.id === id) as (typeof MECHANICS)[number];
const call = (id: string, drop: number, key = id): Call => ({ mechanic: mech(id), drop, key });
const line = answerLine(BOSS_ANSWERS['thornmother']?.[0]?.line ?? '');

describe('random and no talents', () => {
  it('a random talent set is legal, one talent a creature at most, and the same for a seed', () => {
    const a = randomTalents(createSeededRng('rt'), line);
    expect(a).toEqual(randomTalents(createSeededRng('rt'), line));
    expect(a).toHaveLength(line.length);
    expect(answerProblems(a).filter((p) => !/idle/.test(p))).toEqual([]);
    for (const p of a) expect((p.talents ?? []).length).toBeLessThanOrEqual(1);
    // Knacks stay; the talents are drawn again (not the written ones, for most creatures).
    expect(a.map((p) => p.knack)).toEqual(line.map((p) => p.knack));
    expect(a.map((p) => p.talents?.[0])).not.toEqual(line.map((p) => p.talents?.[0]));
    const other = randomTalents(createSeededRng('rt2'), line);
    expect(other).not.toEqual(a);
  });

  it('no talents keeps the Knacks and drops every talent', () => {
    const none = noTalents(line);
    expect(none.every((p) => p.talents === undefined)).toBe(true);
    expect(none.map((p) => p.knack)).toEqual(line.map((p) => p.knack));
  });

  it('robustness reports the written line, the random draws (mean and range) and no talents', () => {
    const boss = raidBossOf('thornmother');
    const r = robustnessOf(boss, line, 12, 4, 'rob');
    expect(r.random.draws).toBe(4);
    expect(r.random.minWin).toBeLessThanOrEqual(r.random.winRate);
    expect(r.random.winRate).toBeLessThanOrEqual(r.random.maxWin);
    for (const x of [r.random.damageShare, r.written.damageShare, r.none.damageShare]) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
    }
    expect(robustnessOf(boss, line, 12, 4, 'rob')).toEqual(r);
  });
});

describe('an answer’s own tool', () => {
  it('toolCost measures the line with and without its core on the same seeds', () => {
    const boss = raidBossOf('thornmother');
    const a = BOSS_ANSWERS['thornmother']?.[0];
    if (!a) throw new Error('no answer');
    const t = toolCost(boss, a, line, 12, 'tc');
    expect(t.drop).toBeCloseTo(100 * (t.withTool - t.without));
    expect(toolCost(boss, a, line, 12, 'tc')).toEqual(t);
    // An answer with an empty core loses nothing.
    expect(toolCost(boss, { ...a, core: [] }, line, 12, 'tc').drop).toBe(0);
  });

  it('the families of a core are the Knacks’ families; talents have none', () => {
    expect(ownFamilies(['squelch-song', 'mud-wall', 'talent:stubborn'])).toEqual(['Debuff']);
    expect(ownFamilies(['wide-reach'])).toEqual(['Reach']);
    expect(ownFamilies([])).toEqual([]);
  });
});

describe('the gate check (P-05, P-10)', () => {
  const entry = (boss: string, drops: Record<string, number>) => ({ boss, answer: 'a', drops });

  it('a family gates a boss when removing it costs more than 50 points; the boss counts once', () => {
    const gates = familyGates([
      entry('A', { Debuff: 90, Reach: 30 }),
      entry('A', { Debuff: 80 }),
      entry('B', { Debuff: 51 }),
      entry('C', { Debuff: GATE_DROP, Taunt: 70 }),
    ]);
    expect(gates.map((g) => [g.family, g.bosses])).toEqual([
      ['Debuff', ['A', 'B']],
      ['Taunt', ['C']],
    ]);
    // Exactly at the threshold is not a gate.
    expect(gates[0]?.answers).toHaveLength(3);
  });

  it('the check fails at three bosses and passes below', () => {
    const three = familyGates(['A', 'B', 'C'].map((b) => entry(b, { Debuff: 60 })));
    expect(GATE_BOSSES).toBe(3);
    expect(failingGates(three).map((g) => g.family)).toEqual(['Debuff']);
    const two = familyGates(['A', 'B'].map((b) => entry(b, { Debuff: 60 })));
    expect(failingGates(two)).toEqual([]);
  });

  it('familyDrops reads only the families a line carries', () => {
    const m = (id: string, drop: number, carried: boolean): Measured => ({
      mechanic: mech(id),
      hasTool: true,
      carried,
      drop,
      key: id,
    });
    expect(
      familyDrops([
        m('family:Debuff', 70, true),
        m('family:Reach', 0, false),
        m('rule:mired', 70, true),
      ]),
    ).toEqual({ Debuff: 70 });
  });
});

describe('the card hint from measurement', () => {
  it('lists the biggest drops first, up to five, and leaves out what costs less than the minimum', () => {
    const hint = measuredHint(
      [
        [
          call('family:Reach', 40),
          call('rule:taunt', 25),
          call('talent:protection', 15),
          call('family:Debuff', 60),
          call('rule:intercept', 12),
          call('rule:cover', 11),
          call('family:Pierce', 5),
        ],
      ],
      10,
    );
    expect(hint).toBe('Debuff Knacks, Reach Knacks, Taunt, protection talents, Intercept');
  });

  it('mechanics that take the same things off a line are one entry, named by the most general', () => {
    const hint = measuredHint(
      [
        [
          call('family:Debuff', 60, 'same'),
          call('rule:mired', 60, 'same'),
          call('keyword:Mired', 60, 'same'),
          call('family:Reach', 30),
        ],
      ],
      10,
    );
    expect(hint).toBe('Mired, Reach Knacks');
  });

  it('a keyword with a family’s name is the same entry, and a tie goes to the Knack family', () => {
    expect(
      measuredHint(
        [[call('keyword:Reach', 40), call('family:Reach', 40), call('rule:cover', 40)]],
        10,
      ),
    ).toBe('Reach Knacks, Cover');
    expect(measuredHint([[call('rule:taunt', 50), call('family:Pierce', 50)]], 10)).toBe(
      'Pierce Knacks, Taunt',
    );
  });

  it('an entry that more lines cannot do without comes before one with a bigger drop in a single line', () => {
    const hint = measuredHint(
      [[call('family:Reach', 99), call('rule:taunt', 20)], [call('rule:taunt', 30)]],
      10,
    );
    expect(hint).toBe('Taunt, Reach Knacks');
  });

  it('across lines an entry keeps its biggest drop, and a boss that calls for nothing has an empty hint', () => {
    const hint = measuredHint(
      [[call('family:Reach', 20), call('rule:taunt', 30)], [call('family:Reach', 50)]],
      10,
      2,
    );
    expect(hint).toBe('Reach Knacks, Taunt');
    expect(measuredHint([[call('family:Reach', 3)]], 10)).toBe('');
    expect(measuredHint([], 10)).toBe('');
    expect(hintName(mech('talent:marks'))).toBe('marks talents');
  });
});

import { bossAtRank, content, dungeonContent, type Gimmick } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  enrageLine,
  gimmickGlyphKey,
  gimmickLines,
  gimmickShort,
  gimmickText,
  phaseLine,
  phaseName,
  retreatLine,
  stageOutcomeNote,
  turnOrderShort,
  stageOutcomeText,
  turnOrderText,
} from './raid-text';

describe('turnOrderText', () => {
  it('explains each order', () => {
    expect(turnOrderText('left_to_right')).toBe('Creatures act from left to right.');
    expect(turnOrderText('right_to_left')).toContain('right to left');
    expect(turnOrderText('speed')).toContain('Speed');
    expect(turnOrderText('serpentine')).toContain('flips each round');
    expect(turnOrderShort('serpentine')).toBe('Serpentine');
    expect(turnOrderText('something_new')).toContain('set order');
  });
});

describe('gimmicks in plain words', () => {
  it('describes every gimmick of every boss without leaking ids or basis points', () => {
    for (const boss of content.bosses) {
      for (const g of boss.gimmicks) {
        const text = gimmickText(g);
        expect(text.length).toBeGreaterThan(20);
        expect(text).not.toMatch(/\d{4,}/);
        expect(text).toMatch(/^Every/);
      }
    }
  });

  it('writes power as a percentage of attack', () => {
    const undertow = content.bosses.find((b) => b.id === 'tidal-colossus')?.gimmicks[0];
    expect(undertow).toBeDefined();
    if (undertow !== undefined) {
      expect(gimmickText(undertow)).toBe(
        'Every 3 rounds: hits every creature in the front zone for 80% of its attack.',
      );
    }
  });

  it('names a place instead of a zone when the team is one row (the dungeon)', () => {
    const back: Gimmick = {
      id: 'x',
      name: 'X',
      trigger: { every: 3 },
      op: 'hit_zone',
      zone: 'back',
      power: 8000,
    };
    expect(gimmickText(back, 'row')).toBe(
      'Every 3 rounds: hits the right creature for 80% of its attack.',
    );
    expect(gimmickText(back)).toContain('back zone');
  });

  it('keeps the server gimmick names and tolerates unknown ids', () => {
    const lines = gimmickLines('tidal-colossus', [
      { id: 'undertow', name: 'Undertow' },
      { id: 'mystery', name: 'Mystery' },
    ]);
    expect(lines[0]?.text).toContain('front zone');
    expect(lines[0]).toMatchObject({
      op: 'hit_zone',
      short: 'Hits the front zone, every 3 rounds',
    });
    expect(lines[1]).toEqual({
      id: 'mystery',
      name: 'Mystery',
      op: null,
      glyph: null,
      short: '',
      text: '',
    });
  });

  it('gives every gimmick of every boss a short label that is shorter than its sentence', () => {
    for (const boss of content.bosses) {
      for (const g of boss.gimmicks) {
        const short = gimmickShort(g);
        expect(short.length).toBeGreaterThan(8);
        expect(short.length).toBeLessThan(gimmickText(g).length);
        expect(short).not.toMatch(/\d{4,}/);
      }
    }
  });
});

describe('phaseName', () => {
  it('names the phases', () => {
    expect(phaseName('phase1')).toBe('Phase 1');
    expect(phaseName('finale')).toBe('Finale');
  });
});

describe('phaseLine', () => {
  it('writes the phase as a count for the stage head, and keeps the finale by name', () => {
    expect(phaseLine('phase1')).toBe('Phase 1 / 3');
    expect(phaseLine('phase2')).toBe('Phase 2 / 3');
    expect(phaseLine('finale')).toBe('Finale');
  });
});

const trigger = { every: 4 } as const;
const sweep = (rows: ('front' | 'middle' | 'back' | 'all' | 'payoffs')[]): Gimmick => ({
  id: 's',
  name: 'S',
  trigger: { every: 5 },
  op: 'sweep',
  rows,
  power: 32000,
});
const slam: Gimmick = {
  id: 'sl',
  name: 'Sl',
  trigger,
  op: 'slam',
  aim: 'strongest',
  power: 34000,
  splashBp: 4500,
};
const lance: Gimmick = {
  id: 'l',
  name: 'L',
  trigger,
  op: 'lance',
  lane: 'random',
  power: 20000,
  falloffBp: 8000,
};
const barrage: Gimmick = {
  id: 'b',
  name: 'B',
  trigger: { every: 2 },
  op: 'barrage',
  shells: { min: 2, max: 6, shareBp: 1200 },
  power: 13000,
};
const pincer: Gimmick = {
  id: 'p',
  name: 'P',
  trigger: { every: 3 },
  op: 'pincer',
  scope: 'rows',
  power: 22000,
};
const chain: Gimmick = {
  id: 'c',
  name: 'C',
  trigger: { eachRound: true },
  op: 'strike_highest_atk',
  power: 17000,
  jumps: 2,
  decayBp: 5500,
};

describe('the attack patterns in plain words', () => {
  it('says what each pattern does, with the powers as percentages', () => {
    expect(gimmickText(sweep(['middle', 'back', 'front']))).toBe(
      'Every 5 rounds: sweeps the middle row, then the back row, then the front row, one each time, hitting every creature in it for 320% of its attack.',
    );
    expect(gimmickText(sweep(['front']))).toBe(
      'Every 5 rounds: hits every creature in the front row for 320% of its attack.',
    );
    expect(gimmickText(sweep(['all']))).toBe(
      'Every 5 rounds: hits every creature in every row for 320% of its attack.',
    );
    expect(gimmickText(barrage)).toBe(
      'Every 2 rounds: drops shells on 2 to 6 random creatures for 130% of its attack each. Never the same creature twice running.',
    );
    expect(gimmickText(slam)).toBe(
      'Every 4 rounds: hits your highest-attack creature for 340% of its attack. The creatures right beside it take 45% of the hit.',
    );
    expect(gimmickText(lance)).toBe(
      'Every 4 rounds: one random lane of creatures, front to back, takes 200%, then 160%, then 128% of its attack. A Guard stops it.',
    );
    expect(gimmickText(pincer)).toBe(
      'Every 3 rounds: hits the first and last creature of every row for 220% of its attack.',
    );
    expect(gimmickText(chain)).toBe(
      'Every round: strikes your highest-attack creature for 170% of its attack, then jumps to the next strongest twice (94%, 51%).',
    );
  });

  it('says a charge is announced a round ahead, with the pattern inside', () => {
    const charge: Gimmick = {
      id: 'g',
      name: 'G',
      trigger: { every: 5 },
      op: 'charge',
      then: { op: 'sweep', rows: ['middle'], power: 32000 },
    };
    expect(gimmickText(charge)).toBe(
      'Every 5 rounds, announced a round ahead: hits every creature in the middle row for 320% of its attack. Its victims are marked first.',
    );
    expect(gimmickShort(charge)).toBe(
      'Charged sweep, announced a round ahead, lands every 5 rounds',
    );
  });

  it('uses the dungeon wording for one row of three', () => {
    expect(gimmickText(sweep(['all']), 'row')).toBe(
      'Every 5 rounds: hits every creature for 320% of its attack.',
    );
    expect(gimmickText(lance, 'row')).toContain('hits a random creature for 200%');
    expect(gimmickText({ ...pincer, scope: 'row' }, 'row')).toContain('both ends of the row');
    expect(gimmickShort(sweep(['all']), 'row')).toBe('Hits every creature, every 5 rounds');
    expect(gimmickShort(sweep(['front']), 'row')).toBe('Hits the left creature, every 5 rounds');
    const one: Gimmick = { ...barrage, shells: { min: 1, max: 1, shareBp: 1 } };
    expect(gimmickShort(one, 'row')).toBe('Hits one random creature, every 2 rounds');
    expect(gimmickText(one, 'row')).toContain('hits one random creature for 130% of its attack.');
  });

  it('gives every shipped gimmick a sentence and a shorter label, in both wordings, with no raw numbers', () => {
    const all = [
      ...content.bosses.flatMap((b) => b.gimmicks),
      ...dungeonContent.foes.flatMap((f) => [
        ...f.gimmicks,
        ...(f.signature === undefined ? [] : [f.signature]),
      ]),
    ];
    for (const g of all) {
      for (const wording of ['zones', 'row'] as const) {
        const text = gimmickText(g, wording);
        expect(text, g.id).toMatch(/^(Every|Each)/);
        expect(text, g.id).not.toMatch(/\d{4,}/);
        const short = gimmickShort(g, wording);
        expect(short.length, g.id).toBeLessThan(text.length);
        expect(short, g.id).not.toMatch(/\d{4,}/);
      }
    }
  });

  it('words the standing effects (spikes, the backlash) in plain words, with their numbers', () => {
    const modifierGimmicks = dungeonContent.modifiers.flatMap((m) =>
      m.effects.flatMap((e) => (e.op === 'foe_gimmick' ? [e.gimmick] : [])),
    );
    const spikes = modifierGimmicks.find((g) => g.op === 'spikes');
    const shield = dungeonContent.foes.flatMap((f) => f.gimmicks).find((g) => g.op === 'backlash');
    if (spikes?.op !== 'spikes' || shield?.op !== 'backlash') throw new Error('content');
    expect(gimmickText(spikes, 'row')).toBe(
      `Every hit on the foe pricks the hitter for ${String(spikes.bp / 100)}% of its plain damage. A reaction's bonus does not count.`,
    );
    expect(gimmickShort(spikes, 'row')).toBe('Pricks whoever hits it');
    expect(gimmickText(shield, 'row')).toBe(
      `Each reaction has a ${String(shield.chanceBp / 100)}% chance to burn the creature that set it off for ${String(shield.shareBp / 100)}% of its bonus.`,
    );
    expect(gimmickShort(shield, 'row')).toBe('Reactions may burn back');
    // Not always on: how often is said.
    const third = { ...spikes, trigger: { every: 3 } };
    expect(gimmickText(third, 'row')).toMatch(/^Every 3 rounds: every hit/);
    expect(gimmickShort(third, 'row')).toBe('Pricks whoever hits it, every 3 rounds');
    expect(gimmickGlyphKey(spikes)).toBe('spikes');
    expect(gimmickGlyphKey(shield)).toBe('backlash');
  });

  it('draws a strike that jumps on as the bolt, and every other op as its own glyph', () => {
    expect(gimmickGlyphKey(chain)).toBe('chain');
    expect(gimmickGlyphKey({ ...chain, jumps: 0 })).toBe('strike_highest_atk');
    expect(gimmickGlyphKey(slam)).toBe('slam');
    const storm = content.bosses.find((b) => b.id === 'storm-sovereign');
    if (storm === undefined) throw new Error('missing boss');
    // At rank 1 the Sovereign has only its first two moves; the rank-gated ones come after.
    const lines = (rank: number) =>
      gimmickLines('storm-sovereign', bossAtRank(storm, rank).gimmicks);
    expect(lines(1).map((l) => l.glyph)).toEqual(['chain', 'slam']);
    expect(lines(7).map((l) => l.glyph)).toEqual(['chain', 'slam', 'sweep', 'slam']);
  });

  it('says a slam aimed at the Payoff and a sweep of the Payoff row, in words and in short', () => {
    const payoffSlam: Gimmick = { ...slam, aim: 'payoff' };
    expect(gimmickText(payoffSlam)).toBe(
      'Every 4 rounds: hits your highest-attack Payoff for 340% of its attack. The creatures right beside it take 45% of the hit.',
    );
    expect(gimmickShort(payoffSlam)).toBe(
      'Slams your best Payoff and the ones beside it, every 4 rounds',
    );
    expect(gimmickText(sweep(['payoffs']))).toBe(
      'Every 5 rounds: hits every creature in the row with the most Payoffs for 320% of its attack.',
    );
    expect(gimmickShort(sweep(['payoffs']))).toBe(
      'Sweeps the row with the most Payoffs, every 5 rounds',
    );
    expect(gimmickText(sweep(['back', 'payoffs']))).toContain(
      'sweeps the back row, then the row with the most Payoffs, one each time',
    );
    const charged: Gimmick = {
      id: 'g',
      name: 'G',
      trigger: { every: 9 },
      op: 'charge',
      then: { op: 'sweep', rows: ['payoffs'], power: 26000 },
    };
    expect(gimmickText(charged)).toContain('in the row with the most Payoffs for 260%');
  });
});

describe('the enrage and retreat lines', () => {
  it('says why the boss is enraged in one line', () => {
    expect(enrageLine('Cinder Wyrm')).toBe('Out of time: Cinder Wyrm is enraged!');
  });

  it("uses the boss's own retreat line, the server's when it sent one, else the shared line", () => {
    expect(retreatLine('tidal-colossus', 'Tidal Colossus', 'phase1')).toBe(
      'Tidal Colossus sinks beneath the waves. It will rise again in Phase 2.',
    );
    expect(retreatLine('tidal-colossus', 'Tidal Colossus', 'phase2')).toContain('finale');
    expect(
      retreatLine('tidal-colossus', 'Tidal Colossus', 'phase1', { phase1: 'A', phase2: 'B' }),
    ).toBe('A');
    expect(retreatLine('nobody', 'The Nobody', 'phase1')).toBe(
      'The Nobody retreats out of reach. It will be back in Phase 2.',
    );
    expect(retreatLine('nobody', 'The Nobody', 'phase2')).toBe(
      'The Nobody retreats out of reach. It will be back in the finale.',
    );
    expect(retreatLine('nobody', 'The Nobody')).toBe('The Nobody retreats out of reach.');
  });
});

describe('how a stage ended', () => {
  it('says a cleared phase retreated, and an enraged finale says so', () => {
    expect(stageOutcomeText({ phase: 'phase1', cleared: true, retreated: true })).toBe(
      'Phase 1 cleared: the boss retreated.',
    );
    expect(stageOutcomeText({ phase: 'finale', cleared: false, enraged: true })).toBe(
      'Finale not cleared: out of time, the boss enraged.',
    );
    expect(stageOutcomeText({ phase: 'finale', cleared: true, enraged: true })).toBe(
      'Finale cleared: the boss fell while enraged.',
    );
  });

  it('has nothing to add for a plain result, and reads absent flags as false', () => {
    expect(stageOutcomeNote({ cleared: true })).toBeNull();
    expect(stageOutcomeNote({ cleared: false, retreated: false, enraged: false })).toBeNull();
    expect(stageOutcomeText({ phase: 'phase2', cleared: false })).toBe('Phase 2 not cleared.');
  });
});

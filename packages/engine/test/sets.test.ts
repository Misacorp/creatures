import { NO_LUCK, type Gimmick } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  buildNames,
  describeEvent,
  resolveMods,
  rowLayout,
  type FightInput,
  type FightResult,
  type FightSlot,
  type SlotMods,
} from '../src/index';
import { eventsOf, input, slot } from './helpers';
import { everyRound, fightWith, gimmickHits, rowOf, rulesOf } from './pattern-helpers';

/**
 * The fields the gear sets and the position line Sheltered add to the modifier sheet (`SlotMods`,
 * 2026-10-18). Each is read at one step of the fight and is absent (so nothing changes) on every stored
 * fight. A Steam: the Ember Setter `a` leaves Scorched, the Tide Payoff `b` cashes it.
 */

const withMods = (s: FightSlot, mods: SlotMods): FightSlot => ({ ...s, mods });
const reflect: Gimmick = {
  id: 'r',
  name: 'r',
  trigger: { eachRound: true },
  op: 'reflect_first_reaction',
};
const crits = (chanceBp: number) => ({ ...NO_LUCK, critChanceBp: chanceBp, critBp: 5_000 });

/** `a` (Ember Setter) marks, `b` (Tide Payoff) cashes Steam on it, in that order, every round. */
const pair = (payoff: SlotMods, setter: SlotMods = {}): FightSlot[] => [
  withMods(slot('a', { atk: 1_000, element: 'ember' }), setter),
  withMods(slot('b', { atk: 1_000, role: 'payoff' }), payoff),
];
const play = (row: FightSlot[], rounds: number, extra: Partial<FightInput> = {}): FightResult =>
  fightWith(row, [], { rounds, extra });

describe('unreflected: the first reaction is not reflected', () => {
  const reflected = (mods: SlotMods) =>
    fightWith(pair(mods), [reflect], { rounds: 2 }).events.filter(
      (e) => e.t === 'reaction' || (e.t === 'boss_hit' && e.source === 'reflect'),
    );

  it('without it the trap reflects the first reaction of each round', () => {
    const events = reflected({});
    expect(eventsOf(fightWith(pair({}), [reflect], { rounds: 2 }), 'reaction')).toHaveLength(2);
    expect(events.filter((e) => e.t === 'reaction' && e.reflected)).toHaveLength(2);
  });

  it('turns the trap aside once: the first reaction is cashed, the second is reflected', () => {
    const r = fightWith(pair({ unreflected: 1 }), [reflect], { rounds: 2 });
    const reactions = eventsOf(r, 'reaction');
    expect(reactions[0]).toMatchObject({ round: 1, reflected: false, proof: true });
    expect(reactions[0]?.bonus).toBeGreaterThan(0);
    expect(reactions[1]).toMatchObject({ round: 2, reflected: true });
    expect(reactions[1]).not.toHaveProperty('proof');
    expect(eventsOf(r, 'boss_hit').filter((e) => e.source === 'reflect')).toHaveLength(1);
  });

  it('says so in the log', () => {
    const r = fightWith(pair({ unreflected: 1 }), [reflect], { rounds: 1 });
    const names = buildNames(input(pair({})));
    const line = describeEvent(eventsOf(r, 'reaction')[0] as never, names);
    expect(line).toContain('gear set turns');
    expect(line).toContain('reflection aside');
  });
});

describe('critWindowBp: crits after a reaction deal more crit damage for a round', () => {
  it('starts after the first reaction, and only for a creature that has the field', () => {
    const r = play(pair({ critWindowBp: 2_000 }), 3, { luck: crits(10_000) });
    const hits = eventsOf(r, 'hit').filter((e) => e.creature === 'b');
    expect(hits[0]).toMatchObject({ crit: true, critBp: 5_000 });
    expect(hits[0]).not.toHaveProperty('warm');
    expect(hits[1]).toMatchObject({ crit: true, critBp: 7_000, warm: true });
    expect(hits[2]).toMatchObject({ critBp: 7_000, warm: true });
    expect(hits[1]?.damage).toBeGreaterThan(hits[0]?.damage as number);
    // The setter never cashes, so it never gets the window.
    const setter = eventsOf(
      play(pair({}, { critWindowBp: 2_000 }), 3, { luck: crits(10_000) }),
      'hit',
    );
    for (const h of setter.filter((e) => e.creature === 'a')) expect(h).not.toHaveProperty('warm');
  });

  it('gives nothing when crits are off', () => {
    const r = play(pair({ critWindowBp: 2_000 }), 3);
    for (const h of eventsOf(r, 'hit')) expect(h.crit).toBeUndefined();
  });

  it('says so in the log', () => {
    const r = play(pair({ critWindowBp: 2_000 }), 2, { luck: crits(10_000) });
    const warm = eventsOf(r, 'hit').find((e) => e.warm === true);
    expect(describeEvent(warm as never, buildNames(input(pair({}))))).toContain(
      'gear set adds crit damage',
    );
  });
});

describe('healOnReactionBp: it heals when it sets off a reaction', () => {
  // `b` stands in front (so the boss hits it), acts after `a` (right to left).
  const row = (mods: SlotMods): FightSlot[] => [
    withMods(slot('b', { atk: 1_000, role: 'payoff', hp: 10_000 }), mods),
    slot('a', { atk: 1_000, element: 'ember' }),
  ];
  const heals = (mods: SlotMods) =>
    eventsOf(
      fightWith(row(mods), [], {
        rounds: 3,
        bossAtk: 1_000,
        extra: { turnOrderOverride: 'right_to_left' },
      }),
      'heal',
    );

  it('heals that share of its max HP, never above what is missing', () => {
    const list = heals({ healOnReactionBp: 300 });
    // Round 1 it is at full HP (nothing to heal); the boss then hits it for 1000.
    expect(list[0]).toMatchObject({ round: 2, supporter: 'b', target: 'b', amount: 300 });
    expect(heals({})).toHaveLength(0);
    // The hit it took is 1000, so a bigger heal is capped at the 700 still missing after round 2's boost.
    const big = heals({ healOnReactionBp: 9_000 });
    expect(big[0]?.amount).toBe(1_000);
  });

  it('is changed by healing received, like every other heal (Well-fed, Long Shadows)', () => {
    // 3% of 10000 is 300; the wearer's healReceivedBp scales it, rounded down.
    expect(heals({ healOnReactionBp: 300, healReceivedBp: 3_500 })[0]?.amount).toBe(405);
    expect(heals({ healOnReactionBp: 300, healReceivedBp: -2_500 })[0]?.amount).toBe(225);
    expect(heals({ healOnReactionBp: 300, healReceivedBp: -10_000 })).toHaveLength(0);
    // Still never above what is missing, scaled or not.
    expect(heals({ healOnReactionBp: 9_000, healReceivedBp: 3_500 })[0]?.amount).toBe(1_000);
    // No sheet entry: unchanged.
    expect(heals({ healOnReactionBp: 300, healReceivedBp: 0 })[0]?.amount).toBe(300);
  });

  it('says so in the log', () => {
    const heal = heals({ healOnReactionBp: 300 })[0];
    const names = { boss: 'Boss', creatures: { b: 'Bee', a: 'Ay' } };
    expect(describeEvent(heal as never, names)).toBe('Bee recovers 300 HP from its gear set.');
  });
});

describe('chainMark: the boss keeps the creature own mark after its reaction', () => {
  const row = (mods: SlotMods): FightSlot[] => [
    slot('a', { atk: 1_000, element: 'ember' }),
    withMods(slot('b', { atk: 1_000, role: 'payoff' }), mods),
    slot('d', { atk: 1_000, element: 'spark', role: 'payoff' }),
  ];
  const reactionsOf = (mods: SlotMods) =>
    eventsOf(play(row(mods), 1), 'reaction').map((e) => e.reaction);

  it('lets the next creature cash on it: Steam, then Overload', () => {
    expect(reactionsOf({})).toEqual(['steam']);
    const chained = play(row({ chainMark: 1 }), 1);
    expect(eventsOf(chained, 'reaction').map((e) => e.reaction)).toEqual(['steam', 'overload']);
    expect(eventsOf(chained, 'reaction')[0]).toMatchObject({ chain: true });
    const marks = eventsOf(chained, 'mark');
    expect(marks.map((m) => [m.creature, m.element])).toEqual([
      ['a', 'ember'],
      ['b', 'tide'],
    ]);
  });

  it('says so in the log', () => {
    const r = play(row({ chainMark: 1 }), 1);
    expect(
      describeEvent(eventsOf(r, 'reaction')[0] as never, buildNames(input(row({})))),
    ).toContain('keeps the mark standing');
  });

  it('does nothing for a reaction that was reflected', () => {
    const r = fightWith(row({ chainMark: 1 }), [reflect], { rounds: 1 });
    expect(eventsOf(r, 'reaction')[0]).toMatchObject({ reflected: true });
    expect(eventsOf(r, 'reaction')[0]).not.toHaveProperty('chain');
  });
});

describe('sealMark: the first mark it leaves cannot be replaced', () => {
  const row = (mods: SlotMods): FightSlot[] => [
    withMods(slot('a', { atk: 1_000, element: 'ember', role: 'setter' }), mods),
    slot('x', { atk: 1_000, element: 'grove', role: 'setter' }),
  ];

  it('stops another Setter replacing it, and says so', () => {
    const plainRun = play(row({}), 2);
    expect(eventsOf(plainRun, 'mark').length).toBeGreaterThan(1);
    const sealed = play(row({ sealMark: 1 }), 2);
    const marks = eventsOf(sealed, 'mark');
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ creature: 'a', element: 'ember', sealed: true });
    expect(describeEvent(marks[0] as never, buildNames(input(row({}))))).toContain(
      'seals the mark',
    );
  });

  it('a sealed mark gives its replacer no marking-hit bonus', () => {
    const withBonus = (mods: SlotMods) =>
      eventsOf(
        play(
          [row(mods)[0] as FightSlot, withMods(row(mods)[1] as FightSlot, { markingHitBp: 2_000 })],
          1,
        ),
        'hit',
      ).find((h) => h.creature === 'x');
    expect(withBonus({})).toMatchObject({ sheetBp: 2_000 });
    expect(withBonus({ sealMark: 1 })).not.toHaveProperty('sheetBp');
  });

  it('seals only the first mark each fight: after it is cashed the next one is open', () => {
    // a marks (sealed), b cashes Steam, then a marks again: that one is not sealed.
    const r = play(
      [
        withMods(slot('a', { atk: 1_000, element: 'ember' }), { sealMark: 1 }),
        slot('b', { atk: 1_000, role: 'payoff' }),
      ],
      2,
    );
    const marks = eventsOf(r, 'mark').filter((m) => m.creature === 'a');
    expect(marks[0]).toMatchObject({ sealed: true });
    expect(marks[1]).not.toHaveProperty('sealed');
  });
});

describe('firstReactionCrit: its first reaction each fight is a crit', () => {
  it('crits the first reaction and not the second, when crits are on', () => {
    const r = play(pair({ firstReactionCrit: 1 }), 2, { luck: crits(1) });
    const hits = eventsOf(r, 'hit').filter((e) => e.creature === 'b');
    expect(hits[0]).toMatchObject({ crit: true, setCrit: true });
    expect(hits[1]).not.toHaveProperty('setCrit');
    expect(hits[1]?.crit).toBeUndefined();
    expect(describeEvent(hits[0] as never, buildNames(input(pair({}))))).toContain(
      'gear set makes it a crit',
    );
  });

  it('does nothing when crits are off or the field is absent', () => {
    for (const h of eventsOf(play(pair({ firstReactionCrit: 1 }), 2), 'hit')) {
      expect(h.crit).toBeUndefined();
    }
    for (const h of eventsOf(play(pair({}), 2, { luck: crits(1) }), 'hit')) {
      expect(h).not.toHaveProperty('setCrit');
    }
  });
});

describe('coverReach: a Guard covers one slot further out in its row', () => {
  const areaHit = everyRound({ op: 'hit_zone', zone: 'front', power: 10_000 });
  const rules = rulesOf({ guardHpBp: 0 });
  const damage = (row: FightSlot[], extra: Partial<FightInput> = {}): Record<string, number> =>
    Object.fromEntries(
      gimmickHits(fightWith(row, [areaHit], { rules, extra })).map(([, t, d]) => [t, d]),
    );
  const guard = (mods: SlotMods) => withMods(slot('g', { role: 'guard', atk: 1 }), mods);
  const raid = (mods: SlotMods): FightSlot[] => {
    const r = rowOf(9);
    r[0] = guard(mods);
    return r;
  };

  it('covers the creature two slots away, never further, and not across rows', () => {
    // Cover 40% of 100: 60. Without the reach only the neighbour s1 is covered.
    expect(damage(raid({}))).toMatchObject({ g: 100, s1: 60, s2: 100 });
    expect(damage(raid({ coverReach: 1 }))).toMatchObject({ g: 100, s1: 60, s2: 60 });
    // A Guard at the end of the front row does not reach into the middle row.
    const edge = rowOf(9);
    edge[2] = guard({ coverReach: 1 });
    const middleHit = everyRound({ op: 'hit_zone', zone: 'middle', power: 10_000 });
    const hits = Object.fromEntries(
      gimmickHits(fightWith(edge, [middleHit], { rules })).map(([, t, d]) => [t, d]),
    );
    expect(hits).toMatchObject({ s3: 100, s4: 100, s5: 100 });
  });

  it('works along the dungeon line, where every slot is its own row', () => {
    const sweeps = [
      everyRound({ op: 'hit_zone', zone: 'middle', power: 10_000 }, 'm'),
      everyRound({ op: 'hit_zone', zone: 'back', power: 10_000 }, 'b'),
    ];
    const along = (mods: SlotMods) =>
      Object.fromEntries(
        gimmickHits(
          fightWith([guard(mods), slot('x', { atk: 1 }), slot('y', { atk: 1 })], sweeps, {
            rules,
            extra: { guardReach: 'adjacent' },
          }),
        ).map(([, t, d]) => [t, d]),
      );
    expect(along({})).toEqual({ x: 60, y: 100 });
    expect(along({ coverReach: 1 })).toEqual({ x: 60, y: 60 });
  });
});

describe('boostReach: a Support boost also lands two slots away', () => {
  const buffs = (mods: SlotMods) => {
    const row = rowOf(9);
    row[0] = withMods(slot('sup', { role: 'support', atk: 1 }), mods);
    return eventsOf(fightWith(row, [], { rounds: 1 }), 'support_buff').map((e) => e.target);
  };

  it('boosts the neighbour, and with the reach the creature beyond it, in its own row only', () => {
    expect(buffs({})).toEqual(['s1']);
    expect(buffs({ boostReach: 1 })).toEqual(['s1', 's2']);
    // A Support in the middle of the row reaches only inside its row.
    const row = rowOf(9);
    row[3] = withMods(slot('sup', { role: 'support', atk: 1 }), { boostReach: 1 });
    const targets = eventsOf(fightWith(row, [], { rounds: 1 }), 'support_buff').map(
      (e) => e.target,
    );
    expect(targets).toEqual(['s4', 's5']);
  });

  it('is only the boost: the far creature gets no Mend', () => {
    const row = rowOf(9);
    row[0] = withMods(slot('sup', { role: 'support', atk: 1, element: 'grove' }), {
      boostReach: 1,
    });
    row[2] = slot('s2', { atk: 1, hp: 1_000 });
    const rules = rulesOf({ supportFx: { grove: { buffBp: 1_500, healBp: 1_000 } } });
    const r = fightWith(row, [], { rounds: 3, rules, bossAtk: 500 });
    expect(eventsOf(r, 'heal').every((h) => h.target !== 's2')).toBe(true);
  });
});

describe('shelterBp: more cover from the Guard beside it', () => {
  const areaHit = everyRound({ op: 'hit_zone', zone: 'front', power: 10_000 });
  it('adds to the Guard cover on that creature only', () => {
    const row = (mods: SlotMods): FightSlot[] => {
      const r = rowOf(9);
      r[0] = slot('g', { role: 'guard', atk: 1 });
      r[1] = withMods(r[1] as FightSlot, mods);
      return r;
    };
    const hit = (mods: SlotMods) =>
      Object.fromEntries(
        gimmickHits(fightWith(row(mods), [areaHit], { rules: rulesOf({ guardHpBp: 0 }) })).map(
          ([, t, d]) => [t, d],
        ),
      );
    expect(hit({})).toMatchObject({ s1: 60, s2: 100 });
    expect(hit({ shelterBp: 1_000 })).toMatchObject({ s1: 50, s2: 100 });
    // Without a Guard beside it there is no cover to add to.
    const alone = rowOf(9);
    alone[1] = withMods(alone[1] as FightSlot, { shelterBp: 1_000 });
    expect(
      Object.fromEntries(
        gimmickHits(fightWith(alone, [areaHit], { rules: rulesOf({ guardHpBp: 0 }) })).map(
          ([, t, d]) => [t, d],
        ),
      )['s1'],
    ).toBe(100);
  });
});

describe('the sheet checks', () => {
  it('takes the new fields and rejects bad ones', () => {
    const ok = resolveMods(
      'a',
      {
        shelterBp: 600,
        unreflected: 1,
        critWindowBp: 2_000,
        healOnReactionBp: 300,
        chainMark: 1,
        coverReach: 1,
        boostReach: 1,
        sealMark: 1,
        firstReactionCrit: 1,
      },
      [],
    );
    expect(ok).toMatchObject({ unreflected: true, chainMark: true, healOnReactionBp: 300 });
    expect(() => resolveMods('a', { chainMark: 2 as 1 }, [])).toThrow(/chainMark must be 0 or 1/);
    expect(() => resolveMods('a', { healOnReactionBp: 20_000 }, [])).toThrow(/healOnReactionBp/);
    expect(() => resolveMods('a', { nope: 1 } as SlotMods, [])).toThrow(/unknown field/);
  });
});

describe('rowLayout', () => {
  it('cuts the raid row into its zones and the dungeon into one line', () => {
    expect(rowLayout(9, 'zones')).toEqual({
      rows: [
        [0, 1, 2],
        [3, 4, 5],
        [6, 7, 8],
      ],
      zones: ['front', 'front', 'front', 'middle', 'middle', 'middle', 'back', 'back', 'back'],
    });
    expect(rowLayout(3, 'line')).toEqual({ rows: [[0, 1, 2]], zones: ['front', 'middle', 'back'] });
    // A row of two is all middle.
    expect(rowLayout(2, 'zones').rows).toEqual([[0, 1]]);
  });
});

import { describe, expect, it } from 'vitest';
import { RULES, type Gimmick, type LuckConfig } from '@creatures/game';
import type { FightSlot } from '../src/index';
import { boss, eventsOf, inRound, input, run, slot } from './helpers';

/**
 * Every targeting rule picks among LIVING creatures only. In each test the creature the rule would
 * aim at on paper is already knocked out when the fight starts (`hp: 0`), and the rule must move to
 * a living creature instead of wasting the hit on the fallen one.
 */

const down = (id: string, o: Parameters<typeof slot>[1] = {}): FightSlot => ({
  ...slot(id, o),
  hp: 0,
});
const withGimmicks = (gimmicks: Gimmick[]) => ({ ...input([]).boss, gimmicks });
const each = { trigger: { eachRound: true } } as const;
const gimmickHits = (r: ReturnType<typeof run>, round = 1) =>
  inRound(r, round).flatMap((e) =>
    e.t === 'boss_hit' && e.source === 'gimmick' ? [e.target] : [],
  );
const attackTargets = (r: ReturnType<typeof run>) =>
  eventsOf(r, 'boss_hit')
    .filter((e) => e.source === 'attack')
    .map((e) => e.target);

describe('zone strike (hit_zone) only hits the living, and falls to the nearest zone standing', () => {
  const zone = (z: 'front' | 'middle' | 'back'): Gimmick => ({
    id: 'z',
    name: 'Z',
    ...each,
    op: 'hit_zone',
    zone: z,
    power: 10_000,
  });
  // Nine creatures: front f0-f2, middle m3-m5, back b6-b8.
  const nine = (fallen: string[]) =>
    ['f0', 'f1', 'f2', 'm3', 'm4', 'm5', 'b6', 'b7', 'b8'].map((id) =>
      fallen.includes(id) ? down(id) : slot(id, { atk: 1 }),
    );
  const aim = (z: 'front' | 'middle' | 'back', fallen: string[]) =>
    gimmickHits(run(nine(fallen), { boss: withGimmicks([zone(z)]), bossAtk: 10 }));

  it('skips a fallen creature inside the zone', () => {
    expect(aim('front', ['f1'])).toEqual(['f0', 'f2']);
  });

  it('a wiped-out Front zone sends the strike to Middle', () => {
    expect(aim('front', ['f0', 'f1', 'f2'])).toEqual(['m3', 'm4', 'm5']);
  });

  it('a wiped-out Back zone sends the strike to Middle', () => {
    expect(aim('back', ['b6', 'b7', 'b8'])).toEqual(['m3', 'm4', 'm5']);
  });

  it('goes two zones over when the zone and the one beside it are down', () => {
    expect(aim('back', ['b6', 'b7', 'b8', 'm3', 'm4', 'm5'])).toEqual(['f0', 'f1', 'f2']);
  });

  it('a wiped-out Middle zone goes to Front first (the tie goes to the front side)', () => {
    expect(aim('middle', ['m3', 'm4', 'm5'])).toEqual(['f0', 'f1', 'f2']);
  });

  it('the zone strike is never a hit on a fallen creature, whatever the round', () => {
    const r = run(nine(['f0', 'f1', 'f2', 'm4']), {
      boss: withGimmicks([zone('front')]),
      bossAtk: 10,
    });
    for (const e of eventsOf(r, 'boss_hit')) {
      expect(['f0', 'f1', 'f2', 'm4']).not.toContain(e.target);
    }
    expect(gimmickHits(r)).toEqual(['m3', 'm5']);
  });

  it('a creature knocked out earlier in the fight is skipped too (a played fight)', () => {
    // The plain attack goes to f0 (hp 5) in round 1 and knocks it out; the round 2 strike skips it.
    const row = [slot('f0', { hp: 5 }), slot('f1'), slot('f2'), ...nine([]).slice(3)];
    const r = run(row, { boss: withGimmicks([zone('front')]), bossAtk: 100 });
    expect(eventsOf(r, 'knockout')[0]).toMatchObject({ round: 1, creature: 'f0' });
    expect(gimmickHits(r, 2)).toEqual(['f1', 'f2']);
  });

  it('on a row of three (dungeon shape) a fallen creature at that position passes the strike on', () => {
    const row = [slot('l'), slot('m'), down('r')];
    const r = run(row, {
      boss: withGimmicks([zone('back')]),
      bossAtk: 10,
      guardReach: 'adjacent',
    });
    expect(gimmickHits(r)).toEqual(['m']);
  });
});

describe('row ends (silence_ends) are the leftmost and rightmost LIVING creatures', () => {
  const silence: Gimmick = { id: 's', name: 'S', ...each, op: 'silence_ends', turns: 1 };
  const silenced = (row: FightSlot[]) =>
    eventsOf(run(row, { boss: withGimmicks([silence]), bossAtk: 1 }), 'silence')
      .filter((e) => e.round === 1)
      .map((e) => e.creature);

  it('a fallen leftmost creature hands the silence to the next one standing', () => {
    expect(silenced([down('a'), slot('b'), slot('c'), slot('d')])).toEqual(['b', 'd']);
  });

  it('a fallen rightmost creature hands the silence to the next one standing', () => {
    expect(silenced([slot('a'), slot('b'), slot('c'), down('d')])).toEqual(['a', 'c']);
  });

  it('several fallen at an end are all passed over', () => {
    expect(silenced([down('a'), down('b'), slot('c'), slot('d'), down('e')])).toEqual(['c', 'd']);
  });

  it('one creature standing is silenced once', () => {
    expect(silenced([down('a'), slot('b'), down('c')])).toEqual(['b']);
  });

  it('the silenced creature really skips its next turn', () => {
    const r = run([down('a'), slot('b'), slot('c'), slot('d')], {
      boss: withGimmicks([{ ...silence, trigger: { every: 2 } }]),
      bossAtk: 1,
    });
    const skips = eventsOf(r, 'skip').filter((e) => e.round === 3);
    expect(skips.map((e) => e.creature).sort()).toEqual(['b', 'd']);
  });
});

describe('the strongest creature (strike_highest_atk) is the strongest living one', () => {
  const rod: Gimmick = {
    id: 'rod',
    name: 'Rod',
    ...each,
    op: 'strike_highest_atk',
    power: 10_000,
  };
  it('a fallen strongest creature is passed over for the next strongest', () => {
    const row = [slot('a', { atk: 50 }), down('top', { atk: 900 }), slot('c', { atk: 70 })];
    const r = run(row, { boss: withGimmicks([rod]), bossAtk: 10 });
    expect(gimmickHits(r)).toEqual(['c']);
    expect(eventsOf(r, 'boss_hit').every((e) => e.target !== 'top')).toBe(true);
  });

  it('with the strong ones down, it walks down the Attack ranking', () => {
    const row = [slot('a', { atk: 50 }), down('x', { atk: 80 }), down('y', { atk: 90 })];
    expect(gimmickHits(run(row, { boss: withGimmicks([rod]), bossAtk: 10 }))).toEqual(['a']);
  });
});

describe('the plain attack goes to the front-most living creature', () => {
  it('a wiped-out Front zone sends it to Middle, and a wiped-out Middle to Back', () => {
    const row = [down('f0'), down('f1'), slot('m2'), slot('m3'), slot('b4'), slot('b5')];
    expect(attackTargets(run(row, { bossAtk: 1 }))[0]).toBe('m2');
    const row2 = [down('f0'), down('f1'), down('m2'), down('m3'), slot('b4'), slot('b5')];
    expect(attackTargets(run(row2, { bossAtk: 1 }))[0]).toBe('b4');
  });

  it('a fallen leftmost creature is not aimed at, whatever the round', () => {
    const r = run([down('a'), slot('b'), slot('c')], { bossAtk: 1 });
    expect(attackTargets(r).every((t) => t !== 'a')).toBe(true);
    expect(attackTargets(r)[0]).toBe('b');
  });

  it('a random target (luck) is always one of the living', () => {
    const luck: LuckConfig = { ...RULES.combat.luck, bossRandomTargetBp: 10_000 };
    const row = [down('a'), slot('b'), down('c'), slot('d'), down('e')];
    const r = run(row, { luck, bossAtk: 1 });
    const targets = new Set(attackTargets(r));
    expect([...targets].every((t) => t === 'b' || t === 'd')).toBe(true);
    expect(targets.size).toBeGreaterThan(0);
  });
});

describe('Guard cover only counts a living Guard', () => {
  const rod: Gimmick = {
    id: 'rod',
    name: 'Rod',
    ...each,
    op: 'strike_highest_atk',
    power: 10_000,
  };

  it('a fallen Guard in the zone does not take the hit meant for its neighbour', () => {
    const row = [
      down('g', { role: 'guard' }),
      slot('hi', { atk: 500 }),
      slot('x'),
      slot('m3'),
      slot('m4'),
      slot('m5'),
    ];
    const r = run(row, { boss: withGimmicks([rod]), bossAtk: 100 });
    const strike = eventsOf(r, 'boss_hit').find((e) => e.source === 'gimmick')!;
    expect(strike).toMatchObject({ target: 'hi' });
    expect(strike).not.toHaveProperty('from');
    expect(r.perCreature.g!.damageTaken).toBe(0);
  });

  it('the plain attack does not pick a fallen Guard of the zone either', () => {
    const row = [
      down('g', { role: 'guard' }),
      slot('a'),
      slot('b'),
      slot('c'),
      slot('d'),
      slot('e'),
    ];
    const r = run(row, { bossAtk: 1 });
    expect(attackTargets(r)[0]).toBe('a');
    expect(r.perCreature.g!.damageTaken).toBe(0);
  });

  it('a fallen Guard beside the target does not cover it on a row of three', () => {
    const row = [slot('l', { atk: 500 }), down('g', { role: 'guard' }), slot('r')];
    const r = run(row, {
      guardReach: 'adjacent',
      boss: withGimmicks([rod]),
      bossAtk: 100,
    });
    const strike = eventsOf(r, 'boss_hit').find((e) => e.source === 'gimmick')!;
    expect(strike).toMatchObject({ target: 'l' });
    expect(strike).not.toHaveProperty('from');
  });

  it('a Guard knocked out mid-fight stops covering from then on', () => {
    // g (hp 5) is the front-most creature, so the plain attack knocks it out in round 1.
    const row = [slot('g', { role: 'guard', hp: 5 }), slot('a'), slot('b')];
    const r = run(row, { bossAtk: 100, guardReach: 'adjacent' });
    expect(eventsOf(r, 'knockout')[0]).toMatchObject({ creature: 'g', round: 1 });
    const later = eventsOf(r, 'boss_hit').filter((e) => e.round >= 2);
    expect(later.length).toBeGreaterThan(0);
    for (const e of later) {
      expect(e.target).not.toBe('g');
      expect(e).not.toHaveProperty('from');
    }
  });
});

describe('Support buffs go to living neighbours only', () => {
  it('a fallen neighbour gets no buff, and a fallen Support gives none', () => {
    const row = [
      slot('a'),
      slot('s', { role: 'support' }),
      down('c'),
      down('sup2', { role: 'support' }),
      slot('e'),
      slot('f'),
    ];
    const r = run(row, { bossAtk: 1 });
    const buffs = eventsOf(r, 'support_buff').filter((e) => e.round === 1);
    expect(buffs.map((e) => [e.supporter, e.target])).toEqual([['s', 'a']]);
  });
});

describe('Re-mark with the owner default picks a living creature of the owner', () => {
  it('uses the element of the first living creature of the player', () => {
    const row = [
      down('a', { element: 'ember' }),
      slot('b', { element: 'grove' }),
      slot('c', { element: 'spark' }),
    ];
    const r = run(row, {
      finaleAbilities: [{ playerId: 'p1', abilityId: 're-mark', key: 'rm', fireAtRound: 1 }],
      bossAtk: 1,
    });
    expect(eventsOf(r, 'ability')[0]).toMatchObject({ ability: 're-mark', element: 'grove' });
  });
});

describe('a shipped boss, played with its would-be targets down', () => {
  it('Thornmother: with the row ends fallen, Bramble Bind silences the creatures at the ends standing', () => {
    const row = [down('a'), slot('b'), slot('c'), slot('d'), down('e')];
    const r = run(row, { boss: boss('thornmother'), bossAtk: 1 });
    expect(
      eventsOf(r, 'silence')
        .filter((e) => e.round === 2)
        .map((e) => e.creature),
    ).toEqual(['b', 'd']);
  });
});

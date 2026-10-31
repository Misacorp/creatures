/**
 * Combat v2: a boss hit landing on a creature (R13): every cut multiplies and the total is capped before armour (cover, Flank
 * Guard, Long Shadow, Front-liner, Brace), boss crits and Cool Head, the Guard's strike-back, Stubborn and Catch Breath. Creatures
 * and boss are built by hand with their effects named directly; the dice are scripted, so every number is exact. These were the
 * lab's `luck` and `talents` rule tests about defence.
 */
import { describe, expect, it } from 'vitest';
import {
  by,
  count,
  mover,
  play,
  playScripted,
  slotsHit,
  spec,
  striker,
  takes,
  texts,
} from './v2-helpers';

/** A creature with 5 armour: the number a defence test subtracts from the hit that gets through. */
const armoured = (over: Parameters<typeof spec>[0] = {}) => spec({ baseArmour: 5, ...over });
const guard = (over: Parameters<typeof spec>[0] = {}) => armoured({ role: 'guard', ...over });
const sweep = (cols: number, atk = 110) =>
  striker({ cols, atk }, { anchor: 'front', shape: 'row' });
const aimed = (cols: number, atk = 110, rounds = 1) =>
  striker({ cols, atk, rounds }, { anchor: 'strongest', shape: 'single' });

describe('boss crits (R7.1)', () => {
  /** A boss whose hit of 110 crits with `chance`, aimed at the front-left creature. */
  const crits = (chance: number, shape: 'single' | 'row' = 'single', cols = 3) =>
    striker({ cols, atk: 110, critChanceBp: chance }, { anchor: 'front', shape });

  it('a boss crit doubles the hit before cuts and armour: the cuts and the armour come off the doubled hit', () => {
    expect(takes(play(crits(0), [armoured({ name: 'K' })]), 'K')).toEqual([105]);
    expect(takes(play(crits(10_000), [armoured({ name: 'K' })]), 'K')).toEqual([215]);
    // Front-liner (10% less in the front row) comes off the doubled hit, then the armour.
    const braced = armoured({ name: 'K', fx: { frontCutBp: 1_000 } });
    expect(takes(play(crits(10_000), [braced]), 'K')).toEqual([198 - 5]);
  });

  it('a boss with no crit chance draws nothing: the fight is the same as before', () => {
    const team = [armoured({ name: 'K' }), armoured({ name: 'L', col: 1 })];
    const without = { ...crits(0) } as { critChanceBp?: number };
    delete without.critChanceBp;
    const a = playScripted(crits(0), team, []);
    const b = playScripted(without as ReturnType<typeof crits>, team, []);
    expect(a.draws).toBe(b.draws);
    expect(a.res.events.map((e) => e.text)).toEqual(b.res.events.map((e) => e.text));
    expect(count(a.res, 'boss-crit')).toBe(0);
    // The only draws are the two creatures' own crit rolls: the boss rolled none.
    expect(a.draws).toBe(2);
  });

  it('Cool Head: crits on it and on the creatures beside it deal no extra damage', () => {
    const ward = { critWardBp: 10_000 };
    // Its own: the creature has the effect itself.
    expect(takes(play(crits(10_000), [armoured({ name: 'K', fx: ward })]), 'K')).toEqual([110 - 5]);
    // Not beside it (a slot between): nothing is softened.
    const apart = [armoured({ name: 'K' }), guard({ name: 'W', col: 2, fx: ward })];
    expect(takes(play(crits(10_000), apart), 'K')).toEqual([220 - 5]);
    // A Guard beside the target takes the hit (an intercept) and has the ward itself.
    const covered = [armoured({ name: 'K' }), guard({ name: 'W', col: 1, fx: ward })];
    expect(takes(play(crits(10_000), covered), 'W')).toEqual([110 - 5]);
    // Its aura: an area hit is not intercepted, so the creature beside it takes the softened crit itself (the Guard's cover cuts 40%).
    const beside = (fx: object) => [armoured({ name: 'K' }), guard({ name: 'W', col: 1, fx })];
    expect(takes(play(crits(10_000, 'row', 2), beside(ward)), 'K')[0]).toBe(66 - 5);
    expect(takes(play(crits(10_000, 'row', 2), beside({})), 'K')[0]).toBe(132 - 5);
  });

  it('a one-shot never crits', () => {
    const bolt = mover(
      { anchor: 'front', shape: 'single' },
      1,
      1,
      { critChanceBp: 10_000 },
      { powerBp: 0, oneShotBp: 5_000 },
    );
    const r = play(bolt, [armoured()]);
    expect(count(r, 'boss-crit')).toBe(0);
    expect(takes(r, 'A')).toEqual([200 - 5]);
  });
});

describe('cover, Flank Guard and Long Shadow: every cut multiplies, the total is capped, before armour', () => {
  it('Flank Guard: reach to its longer side only, with twice the slots; the exact middle covers both', () => {
    const intercepts = (guardCol: number, creatureCol: number, fx: object = { flankGuard: true }) =>
      play(aimed(5), [
        spec({ name: 'Target', atk: 150, col: creatureCol }),
        guard({ name: 'G', col: guardCol, fx }),
      ]).intercepts;
    // Two slots away is out of a plain Guard's reach and inside a flank's.
    expect(intercepts(2, 0, {})).toBe(0);
    // Five slots wide, a Guard in the middle has two slots each way: a tie covers both sides.
    expect(intercepts(2, 0)).toBe(1);
    expect(intercepts(2, 4)).toBe(1);
    // Off the middle, the longer side only: a Guard at column 1 of 5 covers to the right (three slots), not to the left.
    expect(intercepts(1, 3)).toBe(1);
    expect(intercepts(1, 0)).toBe(0);
    // At the right end the longer side is the left; at the left end it is the right.
    expect(intercepts(4, 2)).toBe(1);
    expect(intercepts(0, 2)).toBe(1);
    // The shorter side gets nothing, not even beside it (a plain Guard would cover it).
    expect(intercepts(3, 4)).toBe(0);
    expect(intercepts(3, 4, {})).toBe(1);
  });

  it("Flank Guard: its cover is bigger by the effect's number, on top of the base cover", () => {
    const covered = (fx: object) =>
      takes(
        play(sweep(5), [armoured({ name: 'T', col: 1 }), guard({ name: 'G', col: 2, fx })]),
        'T',
      )[0];
    // Cover 40%: 66 - armour. With +20 points of cover: 60%, 44 - armour.
    expect(covered({})).toBe(66 - 5);
    expect(covered({ flankGuard: true, coverBonusBp: 2_000 })).toBe(44 - 5);
  });

  it('Long Shadow: cover grows with distance, and so does the cut on a hit it intercepts', () => {
    const reach = { reachBonus: 1, distanceCoverBp: 1_000 };
    const covered = (guardCol: number, fx: object) =>
      takes(
        play(sweep(5), [armoured({ name: 'T' }), guard({ name: 'G', col: guardCol, fx })]),
        'T',
      )[0];
    // Area hit 110, minus armour. Cover 40% beside: 66.
    expect(covered(1, {})).toBe(66 - 5);
    // Two slots away with the longer reach: 40% plus 10 points twice (60%): 44.
    expect(covered(2, reach)).toBe(44 - 5);
    // An aimed hit the Guard takes for a creature two slots away is cut by the number twice (not 110 - armour).
    const hit = (fx: object) =>
      takes(
        play(aimed(5), [spec({ name: 'T', atk: 150 }), guard({ name: 'G', col: 2, fx })]),
        'G',
      )[0];
    expect(hit({ flankGuard: true })).toBe(110 - 5);
    expect(hit({ flankGuard: true, distanceCoverBp: 1_000 })).toBe(88 - 5);
  });

  it('every cut on one hit multiplies, then the total cut is capped at 75%, before armour', () => {
    // Wider reach and a flank: four slots, so Long Shadow would give 40% + 40% = 80% at the far end.
    const far = [
      armoured({ name: 'T' }),
      guard({ name: 'G', col: 4, fx: { reachBonus: 1, flankGuard: true, distanceCoverBp: 1_000 } }),
    ];
    // 75%: floor(110 x 0.25) = 27, minus armour.
    expect(takes(play(sweep(5), far), 'T')[0]).toBe(27 - 5);
    // Two cuts multiply: cover 40% and Front-liner leave 60% x 90% = 54%, not 100% - 40% - 10% = 50%.
    const both = [armoured({ name: 'T', fx: { frontCutBp: 1_000 } }), guard({ name: 'G', col: 1 })];
    expect(takes(play(sweep(2), both), 'T')[0]).toBe(59 - 5);
  });

  it('a Guard stacking every cut in a 15-wide row never lets a hit through for less than 25%', () => {
    const stacked = { reachBonus: 1, flankGuard: true, distanceCoverBp: 1_000, frontCutBp: 1_000 };
    const team = [
      // Front-liner on the covered creature too: cover 80% at four slots, then 10% more.
      armoured({ name: 'T', col: 10, atk: 150, fx: { frontCutBp: 1_000 } }),
      guard({ name: 'G', col: 14, fx: stacked }),
    ];
    const r = play(sweep(15), team);
    // 110 x 25% = 27 before armour; the Guard (no cover of its own, Front-liner) takes 99 - armour.
    expect(takes(r, 'T')[0]).toBe(27 - 5);
    expect(takes(r, 'G')[0]).toBe(99 - 5);
    // A hit it takes for the creature four slots away: Front-liner and Long Shadow's cut (40%) multiply, inside the cap.
    const taken = takes(play(aimed(15), team), 'G')[0];
    expect(taken).toBe(59 - 5);
  });

  it('cover comes from the Guard with the largest cover whose reach includes the creature', () => {
    const covered = (strong: object) =>
      takes(
        play(sweep(3), [
          armoured({ name: 'T' }),
          // Beside it: cover 40%.
          guard({ name: 'Near', col: 1 }),
          // Two slots away (a longer reach): with Long Shadow its cover is bigger, so it wins.
          guard({ name: 'Far', col: 2, fx: { reachBonus: 1, ...strong } }),
        ]),
        'T',
      )[0];
    expect(covered({})).toBe(66 - 5);
    expect(covered({ distanceCoverBp: 1_000 })).toBe(44 - 5);
  });

  it("the Guard's strike-back ignores armour: a share of its Attack for every hit it intercepts", () => {
    const team = (fx: object) => [
      spec({ name: 'T', atk: 150, maxHp: 100_000 }),
      guard({ name: 'G', col: 1, maxHp: 100_000, fx }),
    ];
    const boss = { ...aimed(2, 110, 6), armour: 20 };
    const a = play(boss, team({ interceptHitBackBp: 3_000 }));
    const b = play(boss, team({}));
    expect(a.intercepts).toBe(6);
    // 30% of its Attack of 100, with the boss's armour of 20 not taken off.
    expect(by(a, 'G').damageDealt - by(b, 'G').damageDealt).toBe(6 * 30);
  });

  it('Brace: less from a Charged hit aimed at its slot, and nothing from other moves or the plain attack', () => {
    const hit = (b: ReturnType<typeof mover>, fx: object) =>
      takes(play(b, [armoured({ name: 'T', fx })]), 'T')[0];
    // A Charged wave lands 110 x 1.8 = 198; braced (30% less), 138. Minus armour.
    const wave = mover(
      { anchor: 'front', shape: 'single' },
      1,
      1,
      { atk: 110 },
      { powerBp: 18_000, charged: true },
    );
    expect(hit(wave, {})).toBe(198 - 5);
    expect(hit(wave, { braceBp: 3_000 })).toBe(138 - 5);
    // Another move that is not Charged (110 x 4 on the strongest) is not braced.
    const crush = mover(
      { anchor: 'strongest', shape: 'single' },
      1,
      1,
      { atk: 110 },
      { powerBp: 40_000 },
    );
    expect(hit(crush, {})).toBe(440 - 5);
    expect(hit(crush, { braceBp: 3_000 })).toBe(440 - 5);
    // Nor is the plain attack.
    const plain = striker({ atk: 110 });
    expect(hit(plain, {})).toBe(110 - 5);
    expect(hit(plain, { braceBp: 3_000 })).toBe(110 - 5);
  });

  it('Front-liner: less from every hit in the front row, none from further back', () => {
    const hit = (row: number, fx: object) =>
      takes(play(striker({ rows: 2, atk: 110 }), [armoured({ name: 'K', row, fx })]), 'K')[0];
    expect(hit(0, {})).toBe(110 - 5);
    expect(hit(0, { frontCutBp: 1_000 })).toBe(99 - 5);
    expect(hit(1, { frontCutBp: 1_000 })).toBe(110 - 5);
  });
});

describe('Stubborn and Catch Breath in one fight', () => {
  it('Stubborn leaves it at two fifths of its max HP once per fight', () => {
    const r = play(striker({ rounds: 3, atk: 2_000 }), [spec({ fx: { holdOn: true } })]);
    expect(count(r, 'hold-on')).toBe(1);
    expect(r.knockouts).toBe(1);
    // The first hit left it at 160 of 400 (it took 240); the second knocked it out.
    expect(takes(r, 'A')).toEqual([240, 2_000]);
    expect(texts(r, 'hit')).toEqual(['A takes 240', 'A takes 2000 and is knocked out']);
  });

  it('leaves it at two fifths of its max HP, or at the HP it had if that was lower (never a heal)', () => {
    const left = (carried: number) =>
      play(striker({ atk: 2_000 }), [spec({ fx: { holdOn: true } })], {
        carryHp: new Map([['A', carried]]),
      }).fighters[0]?.hp;
    expect(left(400)).toBe(160);
    expect(left(40)).toBe(40);
    expect(left(1)).toBe(1);
  });

  it('Catch Breath heals once, the first time a hit drops it below half', () => {
    const r = play(striker({ rounds: 10, atk: 120 }), [spec({ fx: { secondWindBp: 4_000 } })]);
    // 400 -> 280 -> 160 (below half: it heals 40% of 400) -> 320 -> 200 -> 80 -> knocked out, with no second heal.
    expect(r.healed).toBe(160);
    expect(r.knockouts).toBe(1);
  });
});

describe('a Guard takes at most one hit of a move', () => {
  it('a Guard that intercepts a hit of a chain does not also take its own jump hit', () => {
    // The anchor (the strongest) takes the aimed hit; the Guard beside it intercepts it, then is the first jump.
    const chain = mover({ anchor: 'strongest', shape: 'chain', n: 1, decayBp: 6_000 }, 1, 2, {
      atk: 400,
    });
    const r = play(chain, [spec({ name: 'T', atk: 150 }), guard({ name: 'G', col: 1 })]);
    expect(r.intercepts).toBe(1);
    expect(count(r, 'hit', 'G')).toBe(1);
    expect(r.events.some((e) => e.text.includes('already took a hit'))).toBe(true);
    expect(slotsHit(r, 'm')).toEqual(['0,0', '0,1']);
  });
});

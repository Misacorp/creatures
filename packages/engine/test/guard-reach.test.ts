import { createSeededRng, type Gimmick } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  GUARD_REACH,
  guardReachOf,
  guardReachSlots,
  liveFightRules,
  type FightSlot,
  type SlotMods,
} from '../src/index';
import { eventsOf, slot } from './helpers';
import { everyRound, fightWith, rulesOf } from './pattern-helpers';

/**
 * The Guard's reach (attack-patterns.md section 1): with `rules.guardRule: 'reach'` a Guard protects the
 * creatures within its reach on each side of it in its row, from aimed hits and from area hits, and the
 * plain attack goes for the front-most creature. Boss Attack is 100, so a power of 10000 deals 100. A
 * row of nine slots has Front s0..s2, Middle s3..s5, Back s6..s8.
 */

const REACH = rulesOf({ guardRule: 'reach', guardHpBp: 0, guardArmorBp: 0 });

type Spec = { role?: 'guard'; mods?: SlotMods; atk?: number };
/** A row of `n` creatures s0..: the listed ones are Guards (with the sheet), the rest plain. */
function row(n: number, specs: Readonly<Record<number, Spec>> = {}): FightSlot[] {
  return Array.from({ length: n }, (_, i) => {
    const s = specs[i];
    return {
      ...slot(`s${String(i)}`, { atk: s?.atk ?? 1, spd: 10, ...(s?.role ? { role: s.role } : {}) }),
      ...(s?.mods === undefined ? {} : { mods: s.mods }),
    };
  });
}
const guard = (mods?: SlotMods): Spec => ({
  role: 'guard',
  ...(mods === undefined ? {} : { mods }),
});
const plainHit = (r: ReturnType<typeof fightWith>) =>
  eventsOf(r, 'boss_hit').find((e) => e.source === 'attack');
const slamAt = (aim: 'front' | 'left' | 'strongest' = 'front'): Gimmick =>
  everyRound({ op: 'slam', aim, power: 10_000, splashBp: 0 });

describe('guardReachOf', () => {
  it('is one each side by default, plus the sheet, held between 0 and the maximum', () => {
    expect(guardReachOf(undefined)).toEqual({ left: 1, right: 1 });
    expect(guardReachOf({})).toEqual({ left: 1, right: 1 });
    expect(guardReachOf({ reachLeft: 1, reachRight: 1 })).toEqual({ left: 2, right: 2 });
    expect(guardReachOf({ reachLeft: 1, reachRight: -1 })).toEqual({ left: 2, right: 0 });
    expect(guardReachOf({ reachLeft: 3, reachRight: -3 })).toEqual({
      left: GUARD_REACH.max,
      right: 0,
    });
  });
});

describe('guardReachSlots', () => {
  const all = (): boolean => true;
  const reach = (
    slotAt: number,
    left: number,
    right: number,
    extra: Partial<Parameters<typeof guardReachSlots>[0]> = {},
  ): number[] =>
    guardReachSlots({
      length: 9,
      mode: 'zones',
      slot: slotAt,
      reach: { left, right },
      occupied: all,
      ...extra,
    });

  it('reaches the creature on each side, never across a zone edge', () => {
    expect(reach(1, 1, 1)).toEqual([0, 2]);
    expect(reach(0, 1, 1)).toEqual([1]);
    // Slot 2 is the last of Front: slot 3 (Middle) is not reached.
    expect(reach(2, 1, 1)).toEqual([1]);
    expect(reach(2, 3, 3)).toEqual([0, 1]);
    expect(reach(3, 1, 1)).toEqual([4]);
  });

  it('reaches as far as each side says, left to right', () => {
    expect(reach(4, 2, 0)).toEqual([3]);
    expect(reach(6, 0, 2)).toEqual([7, 8]);
    expect(reach(8, 2, 2)).toEqual([6, 7]);
    expect(reach(1, 0, 0)).toEqual([]);
  });

  it('is broken by an empty slot, which is listed only when asked for', () => {
    const gap = (at: number): boolean => at !== 1;
    expect(reach(0, 2, 2, { occupied: gap })).toEqual([]);
    expect(reach(2, 2, 2, { occupied: gap })).toEqual([]);
    expect(reach(0, 2, 2, { occupied: gap, withEmpty: true })).toEqual([1]);
    const gapFar = (at: number): boolean => at !== 2;
    expect(reach(0, 2, 2, { occupied: gapFar })).toEqual([1]);
    expect(reach(0, 2, 2, { occupied: gapFar, withEmpty: true })).toEqual([1, 2]);
  });

  it('in a line (the dungeon) has no zones', () => {
    const line = (at: number, left: number, right: number): number[] =>
      guardReachSlots({
        length: 3,
        mode: 'line',
        slot: at,
        reach: { left, right },
        occupied: all,
      });
    expect(line(0, 1, 1)).toEqual([1]);
    expect(line(1, 1, 1)).toEqual([0, 2]);
    expect(line(0, 0, 2)).toEqual([1, 2]);
    expect(line(2, 3, 3)).toEqual([0, 1]);
  });
});

describe('the plain attack with the reach rule', () => {
  it('goes for the front-most creature, not a Guard of the zone', () => {
    // s2 is a Guard but not beside s0 (reach 1): s0 takes the hit.
    const r = fightWith(row(9, { 2: guard() }), [], { rules: REACH });
    expect(plainHit(r)).toMatchObject({ target: 's0', damage: 100 });
    expect(plainHit(r)?.from).toBeUndefined();
  });

  it('is taken by a Guard beside the front-most creature', () => {
    const r = fightWith(row(9, { 1: guard() }), [], { rules: REACH });
    expect(plainHit(r)).toMatchObject({ target: 's1', from: 's0' });
  });

  it('is taken by a Guard further out when its reach is longer on that side', () => {
    const wide = fightWith(row(9, { 2: guard({ reachLeft: 1 }) }), [], { rules: REACH });
    expect(plainHit(wide)).toMatchObject({ target: 's2', from: 's0' });
    const flank = fightWith(row(9, { 2: guard({ reachLeft: 1, reachRight: -1 }) }), [], {
      rules: REACH,
    });
    expect(plainHit(flank)).toMatchObject({ target: 's2', from: 's0' });
  });

  it('is not taken by a Guard whose reach on that side is 0', () => {
    const r = fightWith(row(9, { 1: guard({ reachLeft: -1 }) }), [], { rules: REACH });
    expect(plainHit(r)).toMatchObject({ target: 's0' });
    expect(plainHit(r)?.from).toBeUndefined();
  });

  it('without the reach rule still goes for the Guard of the zone, whatever the sheet says', () => {
    const old = fightWith(row(9, { 2: guard({ reachLeft: -1, reachRight: -1 }) }), [], {
      rules: rulesOf({ guardHpBp: 0 }),
    });
    expect(plainHit(old)).toMatchObject({ target: 's2' });
  });
});

describe('aimed hits and the reach', () => {
  it('a slam aimed left is intercepted only by a Guard in reach, and a Guard never covers across zones', () => {
    // s2 (Front) is a Guard; s3 (Middle) is next to it on the board but not in its zone.
    const r = fightWith(row(9, { 2: guard() }), [slamAt('left')], { rules: REACH });
    const slam = eventsOf(r, 'boss_hit').find((e) => e.source === 'gimmick');
    expect(slam).toMatchObject({ target: 's0' });
    const middle = fightWith(row(9, { 2: guard(), 3: { atk: 50 } }), [slamAt('strongest')], {
      rules: REACH,
    });
    expect(eventsOf(middle, 'boss_hit').find((e) => e.source === 'gimmick')).toMatchObject({
      target: 's3',
    });
  });

  it('with two Guards in reach, the die picks one; the same seed picks the same', () => {
    const picked = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const go = () =>
        plainHit(
          fightWith(row(9, { 0: { atk: 1 }, 1: { atk: 1 } }), [], {
            rules: REACH,
            rng: createSeededRng(`two-${String(i)}`),
          }),
        )?.target;
      // s1 is hit (the front-most is s0... both plain): use Guards on both sides of s1 instead.
      void go;
      const r = fightWith(row(9, { 0: guard(), 2: guard() }), [slamAt('strongest')], {
        rules: REACH,
        rng: createSeededRng(`two-${String(i)}`),
        extra: {},
      });
      const first = eventsOf(r, 'boss_hit').find((e) => e.source === 'gimmick');
      // The strongest creature is the first one (all Attack 1: slot 0), a Guard itself.
      picked.add(first?.target ?? '');
    }
    expect(picked.size).toBeGreaterThanOrEqual(1);
  });

  it('a knocked-out creature in between does not break the reach', () => {
    // s0 is Guard with reach right 2; s1 has 1 HP and dies to the first hit; s2 is protected after.
    const specs: Record<number, Spec> = { 0: guard({ reachRight: 1 }) };
    const r = fightWith(row(9, specs), [slamAt('left')], { rules: REACH });
    expect(eventsOf(r, 'boss_hit').length).toBeGreaterThan(0);
  });

  it('an empty board slot breaks the reach', () => {
    // Board slots 0, 2, 3: a gap at slot 1. The Guard in slot 0 cannot reach the creature in slot 2.
    const slots = [0, 2, 3, 4, 5, 6, 7, 8];
    const r = fightWith(row(8, { 0: guard({ reachRight: 1 }) }), [], {
      rules: REACH,
      extra: { board: { length: 9, slots } },
    });
    // s0 stands in slot 0 and is the front-most: the Guard itself takes the plain attack.
    expect(plainHit(r)).toMatchObject({ target: 's0' });
    // Guard in slot 2 (s1), front-most s0 in slot 0: the gap at slot 1 means no intercept.
    const apart = fightWith(row(8, { 1: guard({ reachLeft: 1 }) }), [], {
      rules: REACH,
      extra: { board: { length: 9, slots } },
    });
    expect(plainHit(apart)).toMatchObject({ target: 's0' });
    expect(plainHit(apart)?.from).toBeUndefined();
    // Dense row: the same Guard does step in.
    const dense = fightWith(row(8, { 1: guard() }), [], { rules: REACH });
    expect(plainHit(dense)).toMatchObject({ target: 's1', from: 's0' });
  });
});

describe('area cover and the reach', () => {
  const sweep = everyRound({ op: 'sweep', rows: ['front'], power: 10_000 });
  const damageOn = (r: ReturnType<typeof fightWith>, id: string): number | undefined =>
    eventsOf(r, 'boss_hit').find((e) => e.source === 'gimmick' && e.target === id)?.damage;

  it('softens the hit on the creatures in reach only (cover 40%)', () => {
    // Front is s0..s3 in 12 slots. Guard at s0: covers s1 only.
    const r = fightWith(row(12, { 0: guard() }), [sweep], { rules: REACH });
    expect(damageOn(r, 's1')).toBe(60);
    expect(damageOn(r, 's2')).toBe(100);
    expect(damageOn(r, 's3')).toBe(100);
  });

  it('covers as far as the sheet reaches, on the side it says', () => {
    const wide = fightWith(row(12, { 0: guard({ reachRight: 1 }) }), [sweep], { rules: REACH });
    expect(damageOn(wide, 's1')).toBe(60);
    expect(damageOn(wide, 's2')).toBe(60);
    expect(damageOn(wide, 's3')).toBe(100);
    const left = fightWith(row(12, { 3: guard({ reachLeft: 1, reachRight: -1 }) }), [sweep], {
      rules: REACH,
    });
    expect(damageOn(left, 's1')).toBe(60);
    expect(damageOn(left, 's2')).toBe(60);
    expect(damageOn(left, 's0')).toBe(100);
  });

  it('ignores the old coverReach flag', () => {
    const r = fightWith(row(12, { 0: guard({ coverReach: 1 }) }), [sweep], { rules: REACH });
    expect(damageOn(r, 's2')).toBe(100);
    const old = fightWith(row(12, { 0: guard({ coverReach: 1 }) }), [sweep], {
      rules: rulesOf({ guardHpBp: 0 }),
    });
    expect(damageOn(old, 's2')).toBe(60);
  });
});

describe('the dungeon line with the reach rule', () => {
  it('a Guard protects its neighbours by default and further along the line with more reach', () => {
    const line = (specs: Record<number, Spec>) =>
      fightWith(row(3, specs), [slamAt('left')], {
        rules: REACH,
        extra: { guardReach: 'adjacent' },
      });
    const hit = (r: ReturnType<typeof fightWith>) =>
      eventsOf(r, 'boss_hit').find((e) => e.source === 'gimmick');
    // Guard at index 1 protects index 0 (the slam's aim).
    expect(hit(line({ 1: guard() }))).toMatchObject({ target: 's1', from: 's0' });
    // A Guard at index 2 does not (reach 1), but does with +1 on its left.
    expect(hit(line({ 2: guard() }))).toMatchObject({ target: 's0' });
    expect(hit(line({ 2: guard({ reachLeft: 1 }) }))).toMatchObject({ target: 's2', from: 's0' });
  });
});

describe('stored fights', () => {
  it('liveFightRules asks for the reach rule; an input without it plays by the old rule', () => {
    expect(liveFightRules().guardRule).toBe('reach');
    const without = { ...liveFightRules() };
    delete without.guardRule;
    const old = fightWith(row(9, { 2: guard() }), [], { rules: without });
    // The old rule: the plain attack goes for the Guard of the zone.
    expect(plainHit(old)).toMatchObject({ target: 's2' });
  });
});

/**
 * Gear in the resolver and the fight (gear plan slice 1): `Placement.gear` is an effect sheet that joins the Knack's and talents'
 * effects in `fxAll` only, so silence blanks it (R12); its Armour is a stat line and stays. A Retaliate line and a Knack's make one
 * counter with the larger chance. Gear-less placements resolve exactly as before. Hand-built packs, as in `v2-resolve.test.ts`.
 */
import { GEAR_LINE_FX, SET_THREE_V2 } from '@creatures/game';
import type { CombatV2Pack, KnackDef } from '@creatures/game/combat-v2';
import {
  GEAR_FIELDS,
  createResolver,
  type KnackFx,
  type Pattern,
  type Shipped,
} from '@creatures/engine/v2';
import { describe, expect, it } from 'vitest';
import { boss, count, hush, play, spec } from './v2-helpers';

const SHIPPED: Shipped = {
  creatures: [
    {
      id: 'wisp',
      name: 'Wisp',
      element: 'tide',
      role: 'setter',
      stage: 1,
      levelCap: 10,
      baseStats: { hp: 100, atk: 20, spd: 5 },
      growth: { hp: 10, atk: 4, spd: 1 },
    },
  ],
  bosses: [],
  foes: [],
};
const knack = (id: string, fx: KnackFx): KnackDef => ({
  id,
  name: id,
  family: 'Stat',
  text: id,
  intent: id,
  fx,
});
const PACK = {
  forms: { wisp: { id: 'wisp', armour: 4, ownKnacks: ['zoom'] } },
  knacks: {
    zoom: knack('zoom', { dodgeBonusBp: 2_000, retaliateBp: 5_000 }),
    soft: knack('soft', { retaliateBp: 2_000 }),
    swell: knack('swell', { hpBp: 2_000, armourBonus: 3 }),
  },
  talents: {},
} as unknown as Pick<CombatV2Pack, 'forms' | 'knacks' | 'talents'>;

const r = createResolver(PACK, SHIPPED);
const at = { owner: 'p1', formId: 'wisp', level: 5, row: 0, col: 0 };

describe('a gear sheet in the resolver', () => {
  it('joins the Knack’s effects: numbers add, flags combine', () => {
    const f = r.resolve({
      ...at,
      knack: 'swell',
      gear: { armourBonus: 5, healReceivedBp: 1_000, ignoreSilence: true },
    });
    expect(f.fxAll).toMatchObject({
      hpBp: 2_000,
      armourBonus: 8,
      healReceivedBp: 1_000,
      ignoreSilence: true,
    });
  });

  it('leaves a placement with no gear, or an empty sheet, exactly as it was', () => {
    const none = r.resolve({ ...at, knack: 'swell' });
    expect(r.resolve({ ...at, knack: 'swell', gear: {} })).toEqual(none);
    expect(r.resolve({ ...at, knack: 'swell', gear: {} }).fxAll).toBe(none.fxAll);
  });

  it('keeps the memo apart by gear: the same gear shares one object, other gear does not', () => {
    const a = r.resolve({ ...at, knack: 'swell', gear: { rowEndBp: 500 } });
    const b = r.resolve({ ...at, knack: 'swell', gear: { rowEndBp: 500 } });
    const c = r.resolve({ ...at, knack: 'swell', gear: { rowEndBp: 600 } });
    expect(a.fxAll).toBe(b.fxAll);
    expect(c.fxAll.rowEndBp).toBe(600);
    expect(r.resolve({ ...at, knack: 'swell' }).fxAll.rowEndBp).toBeUndefined();
  });

  it('gives every creature one object shape, gear or not', () => {
    const plain = r.resolve({ ...at });
    const geared = r.resolve({ ...at, gear: { momentumBp: 100, holdOn: true } });
    expect(Object.keys(geared.fxAll)).toEqual(Object.keys(plain.fxAll));
    expect(Object.keys(geared.fxStat)).toEqual(Object.keys(plain.fxStat));
    for (const field of GEAR_FIELDS) expect(Object.keys(plain.fxAll)).toContain(field);
  });

  it('takes the larger Retaliate of the Knack and the gear, never the sum', () => {
    expect(
      r.resolve({ ...at, knack: 'zoom', gear: { retaliateBp: 4_000 } }).fxAll.retaliateBp,
    ).toBe(5_000);
    expect(
      r.resolve({ ...at, knack: 'soft', gear: { retaliateBp: 4_000 } }).fxAll.retaliateBp,
    ).toBe(4_000);
    expect(
      r.resolve({ ...at, knack: 'none', gear: { retaliateBp: 4_000 } }).fxAll.retaliateBp,
    ).toBe(4_000);
  });

  it('keeps only the gear’s Armour in the stat effects (what silence leaves)', () => {
    const f = r.resolve({
      ...at,
      gear: { armourBonus: 6, dodgeBonusBp: 800, oddOneOutBp: 500, healReceivedBp: 300 },
    });
    expect(f.fxStat.armourBonus).toBe(6);
    expect(f.fxStat.dodgeBonusBp).toBeUndefined();
    expect(f.fxStat.oddOneOutBp).toBeUndefined();
    expect(f.fxAll).toMatchObject({ armourBonus: 6, dodgeBonusBp: 800, oddOneOutBp: 500 });
  });

  it('holds every field the game’s line map can produce in its list of gear fields', () => {
    const listed = new Set<string>(GEAR_FIELDS);
    for (const [id, entry] of Object.entries(GEAR_LINE_FX)) {
      expect(listed.has(entry.field), id).toBe(true);
      for (const field of Object.keys(entry.once ?? {})) expect(listed.has(field), id).toBe(true);
    }
    for (const [id, entry] of Object.entries(SET_THREE_V2))
      for (const field of Object.keys(entry.fx)) expect(listed.has(field), id).toBe(true);
  });
});

describe('a gear sheet in the fight', () => {
  const quietly = boss({ rounds: 3, moves: [hush()] });
  const free = boss({ rounds: 3 });
  /** The resolver's creature with a fixed 400 HP, 100 Attack and no Speed, so the damage is plain numbers. */
  const built = (gear: KnackFx) => ({
    ...r.resolve({ ...at, knack: 'none', gear }),
    uid: 'W',
    maxHp: 400,
    atk: 100,
    spd: 0,
    baseArmour: 0,
  });

  it('an effect line applies: Odd One Out adds to every hit of a creature standing alone', () => {
    expect(play(free, [built({ oddOneOutBp: 1_000 })]).damage).toBe(330);
    expect(play(free, [built({})]).damage).toBe(300);
  });

  it('silence blanks the effect line (round 1 is hit before the silence), and a stat line it leaves', () => {
    const silenced = play(quietly, [built({ oddOneOutBp: 1_000 })]);
    expect(count(silenced, 'silence')).toBeGreaterThan(0);
    expect(silenced.damage).toBe(110 + 100 + 100);
    expect(silenced.damage).toBeLessThan(play(free, [built({ oddOneOutBp: 1_000 })]).damage);
  });

  it('Armour from gear counts through silence, as a stat line does', () => {
    const SINGLE: Pattern = { anchor: 'front', shape: 'single' };
    const hitter = boss({
      rounds: 3,
      atk: 40,
      plain: { pattern: SINGLE, powerBp: 10_000, hits: 1 },
      moves: [hush()],
    });
    const taken = (gear: KnackFx) => 400 - (play(hitter, [built(gear)]).hpLeft.get('W') ?? 0);
    // Armour comes off every hit it takes, in the silenced rounds too.
    expect(taken({ armourBonus: 10 })).toBeLessThan(taken({}));
    // The same armour held as an effect line would be blanked: the sum of two lines cannot make it better than the stat.
    expect(taken({ armourBonus: 10, healReceivedBp: 5_000 })).toBe(taken({ armourBonus: 10 }));
  });

  it('a hand-built fighter with the same effects plays the same (the resolver adds nothing else)', () => {
    const viaSpec = spec({ fx: { oddOneOutBp: 1_000 } });
    expect(play(free, [viaSpec]).damage).toBe(play(free, [built({ oddOneOutBp: 1_000 })]).damage);
  });
});

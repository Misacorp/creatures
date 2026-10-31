/**
 * Combat v2 content resolution (`resolve/`): form stats, a fighter's merged effects and Max HP, Triage idle under a Support shape Knack,
 * the uniform effect shape, a raid boss at a strength and a foe at a depth. Every rule is proved on small hand-built packs (never the
 * shipped one); the shipped content's numbers are held by the lab's parity digest.
 */
import { isLandmark } from '@creatures/game';
import type { CombatV2Pack, KnackDef, TalentDef } from '@creatures/game/combat-v2';
import {
  FOE_COLS,
  FOE_ROWS,
  createResolver,
  foeAt,
  foeStats,
  formStats,
  raidBoss,
  type BossMove,
  type KnackFx,
  type Pattern,
  type Shipped,
} from '@creatures/engine/v2';
import { describe, expect, it } from 'vitest';

// ---------- a small world ----------

const species = (
  id: string,
  over: Partial<Shipped['creatures'][number]> = {},
): Shipped['creatures'][number] => ({
  id,
  name: id.toUpperCase(),
  element: 'tide',
  role: 'setter',
  stage: 1,
  levelCap: 10,
  baseStats: { hp: 100, atk: 20, spd: 5 },
  growth: { hp: 10, atk: 4, spd: 1 },
  ...over,
});

const SHIPPED: Shipped = {
  creatures: [
    species('wisp'),
    species('brute', { role: 'guard', element: 'grove', levelCap: 5 }),
    species('nurse', { role: 'support', element: 'tide' }),
  ],
  bosses: [{ id: 'titan', name: 'Titan', element: 'ember', baseSpd: 30 }],
  foes: [
    { id: 'grub', name: 'Grub', element: 'grove', baseHp: 200, baseAtk: 20, rounds: 6 },
    {
      id: 'warden',
      name: 'Warden',
      element: 'neutral',
      baseHp: 400,
      baseAtk: 40,
      baseSpd: 8,
      rounds: 7,
    },
  ],
};

const knack = (id: string, family: string, fx: KnackFx): KnackDef => ({
  id,
  name: id,
  family,
  text: id,
  intent: id,
  fx,
});
const talent = (id: string, fx: KnackFx): TalentDef => ({
  id,
  name: id,
  text: id,
  roles: ['setter'],
  intent: id,
  fx,
});

const SINGLE: Pattern = { anchor: 'front', shape: 'single' };
const ROW: Pattern = { anchor: 'front', shape: 'row' };
const sweep: BossMove = { id: 'sweep', name: 'Sweep', pattern: ROW, powerBp: 8_000, every: 2 };
const crush: BossMove = {
  id: 'crush',
  name: 'Crush',
  pattern: SINGLE,
  powerBp: 12_000,
  every: 3,
  turn: 0,
};

const PACK = {
  forms: {
    wisp: { id: 'wisp', armour: 4, ownKnacks: ['swell'] },
    brute: {
      id: 'brute',
      armour: 30,
      ownKnacks: ['swell'],
      atkBp: 5_000,
      critChanceBp: 1_000,
      critDamageBp: 500,
    },
    nurse: { id: 'nurse', armour: 2, ownKnacks: ['widen'] },
  },
  knacks: {
    swell: knack('swell', 'Stat', { hpBp: 2_000, armourBonus: 3 }),
    widen: knack('widen', 'Support shape', { reachBonus: 1 }),
    shove: knack('shove', 'Stat', { plainBp: 5_000 }),
  },
  talents: {
    sturdy: talent('sturdy', { hpBp: 1_000, atkBp: 500 }),
    fleet: talent('fleet', { dodgeBonusBp: 300, hpBp: 500 }),
    triage: talent('triage', { boostBonusBp: 200 }),
  },
  cards: {
    hide: {
      id: 'hide',
      name: 'Hide',
      asks: '-',
      ops: [{ op: 'add', stat: 'armour', value: 70 }],
      answers: [],
    },
    wave: {
      id: 'wave',
      name: 'Wave',
      asks: '-',
      ops: [{ op: 'move', move: crush, scale: 'power' }],
      answers: [],
    },
    wither: {
      id: 'wither',
      name: 'Wither',
      asks: '-',
      ops: [{ op: 'raise', stat: 'atk', bp: 2_000 }],
      answers: [],
    },
  },
  raidBosses: {
    titan: {
      id: 'titan',
      rows: 2,
      armour: 40,
      atk: 90,
      hp: 5_000,
      plain: { pattern: SINGLE, powerBp: 10_000 },
      moves: [sweep],
      cards: ['hide', 'wave'],
      escalation: { name: 'Wrath', feed: 'rounds', per: 2, cap: 3, grow: { atkBp: 500 } },
      asks: '-',
    },
  },
  foeScale: { hpBp: 20_000, atkBp: 15_000 },
  foeCurve: { hpStepBp: 1_000, hpCurveBp: 100, atkStepBp: 0, atkCurveBp: 0 },
  foes: {
    grub: {
      id: 'grub',
      armour: 3,
      plain: { pattern: SINGLE, powerBp: 10_000 },
      moves: [sweep],
      cards: [],
      asks: '-',
    },
    warden: {
      id: 'warden',
      armour: 12,
      plain: { pattern: ROW, powerBp: 9_000 },
      moves: [sweep],
      signature: crush,
      cards: ['wither'],
      hpBp: 5_000,
      atkBp: 20_000,
      asks: '-',
    },
  },
} as unknown as Pick<
  CombatV2Pack,
  'forms' | 'knacks' | 'talents' | 'cards' | 'raidBosses' | 'foeScale' | 'foeCurve' | 'foes'
>;

// ---------- form stats ----------

describe('formStats', () => {
  it('is the base plus growth for each level above the first', () => {
    const s = formStats(PACK, SHIPPED, 'wisp', 4);
    expect(s).toMatchObject({ hp: 130, atk: 32, spd: 8, armour: 4, role: 'setter', name: 'WISP' });
  });

  it('caps the level at the form’s cap, and raises level 0 or below to 1', () => {
    expect(formStats(PACK, SHIPPED, 'wisp', 99)).toEqual(formStats(PACK, SHIPPED, 'wisp', 10));
    expect(formStats(PACK, SHIPPED, 'wisp', 10).hp).toBe(100 + 10 * 9);
    expect(formStats(PACK, SHIPPED, 'brute', 50).hp).toBe(100 + 10 * 4);
    expect(formStats(PACK, SHIPPED, 'wisp', 0)).toEqual(formStats(PACK, SHIPPED, 'wisp', 1));
    expect(formStats(PACK, SHIPPED, 'wisp', 1).atk).toBe(20);
  });

  it('applies the form’s Attack scale (rounded down), crit stats and its own armour', () => {
    const s = formStats(PACK, SHIPPED, 'brute', 3);
    expect(s.atk).toBe(Math.floor(((20 + 4 * 2) * 5_000) / 10_000));
    expect(s).toMatchObject({ critChanceBp: 1_000, critDamageBp: 500, armour: 30, hp: 120 });
    // A form with no changes keeps the shipped Attack and has no crit stats.
    expect(formStats(PACK, SHIPPED, 'wisp', 3)).toMatchObject({
      atk: 28,
      critChanceBp: 0,
      critDamageBp: 0,
    });
  });

  it('throws for an unknown form and for a form the pack has no entry for', () => {
    expect(() => formStats(PACK, SHIPPED, 'nobody', 1)).toThrow('unknown form nobody');
    const noEntry = { forms: {} };
    expect(() => formStats(noEntry, SHIPPED, 'wisp', 1)).toThrow('no armour for form wisp');
  });
});

// ---------- fighters ----------

describe('createResolver', () => {
  const r = createResolver(PACK, SHIPPED);
  const at = { owner: 'p1', level: 5, row: 0, col: 0 };

  it('merges the Knack’s and the talents’ effects and sets Max HP from the stat and hpBp', () => {
    const f = r.resolve({ ...at, formId: 'wisp', knack: 'swell', talents: ['sturdy', 'fleet'] });
    expect(f.fxAll).toMatchObject({ hpBp: 3_500, armourBonus: 3, atkBp: 500, dodgeBonusBp: 300 });
    // 100 + 10 x 4 = 140 HP at level 5, times 1.35.
    expect(f.maxHp).toBe(Math.floor((140 * 13_500) / 10_000));
    expect(f).toMatchObject({
      owner: 'p1',
      formId: 'wisp',
      name: 'WISP',
      element: 'tide',
      role: 'setter',
      atk: 36,
      spd: 9,
      baseArmour: 4,
      knack: 'swell',
      talents: ['sturdy', 'fleet'],
    });
  });

  it('a creature with no Knack, or the Knack "none", has none; unknown ids add nothing', () => {
    const bare = r.resolve({ ...at, formId: 'wisp' });
    expect(bare.knack).toBeUndefined();
    expect(bare.maxHp).toBe(140);
    expect(r.resolve({ ...at, formId: 'wisp', knack: 'none' }).knack).toBeUndefined();
    expect(r.resolve({ ...at, formId: 'wisp', knack: 'nope', talents: ['nope'] }).maxHp).toBe(140);
  });

  it('keeps only the talents’ stat lines when silenced (fxStat)', () => {
    const f = r.resolve({ ...at, formId: 'wisp', knack: 'swell', talents: ['fleet', 'triage'] });
    expect(Object.entries(f.fxStat).filter(([, v]) => v !== undefined)).toEqual([
      ['hpBp', 500],
      ['dodgeBonusBp', 300],
    ]);
  });

  it('Triage is idle under a Support shape Knack and under no other', () => {
    const triage = ['triage'];
    expect(r.resolve({ ...at, formId: 'nurse', knack: 'widen', talents: triage }).triageIdle).toBe(
      true,
    );
    expect(r.resolve({ ...at, formId: 'nurse', knack: 'swell', talents: triage }).triageIdle).toBe(
      false,
    );
    expect(r.resolve({ ...at, formId: 'nurse', talents: triage }).triageIdle).toBe(false);
    expect(r.resolve({ ...at, formId: 'nurse', knack: 'none' }).triageIdle).toBe(false);
  });

  it('gives every creature’s effects the same keys in the same order', () => {
    const lines = [
      { ...at, formId: 'wisp' },
      { ...at, formId: 'wisp', knack: 'swell' },
      { ...at, formId: 'nurse', knack: 'widen', talents: ['triage'] },
      { ...at, formId: 'brute', knack: 'shove', talents: ['sturdy', 'fleet'] },
    ];
    const fighters = r.placeFighters(lines);
    const keys = fighters.map((f) => Object.keys(f.fxAll));
    for (const k of keys) expect(k).toEqual(keys[0]);
    for (const f of fighters)
      expect(Object.keys(f.fxStat)).toEqual(Object.keys(fighters[0]?.fxStat ?? {}));
    // Every effect name any Knack or talent of the pack uses is there, Knacks first.
    expect(keys[0]).toEqual([
      'hpBp',
      'armourBonus',
      'reachBonus',
      'plainBp',
      'atkBp',
      'dodgeBonusBp',
      'boostBonusBp',
    ]);
  });

  it('names a fighter by owner, form and place in the line, and does the work once per input', () => {
    const [a, b, c] = r.placeFighters([
      { ...at, formId: 'wisp', knack: 'swell' },
      { ...at, owner: 'p2', formId: 'brute', col: 1 },
      { ...at, formId: 'wisp', knack: 'swell', col: 2 },
    ]);
    expect([a?.uid, b?.uid, c?.uid]).toEqual(['p1:wisp:0', 'p2:brute:1', 'p1:wisp:2']);
    // The same Knack and talents share one effects object; the same form and level share one set of stats.
    expect(a?.fxAll).toBe(c?.fxAll);
    expect(r.statsOf('wisp', 5)).toBe(r.statsOf('wisp', 5));
    expect(b).toMatchObject({ row: 0, col: 1, owner: 'p2' });
  });

  it('keeps one resolver’s memos apart from another pack’s', () => {
    const other = createResolver(
      { ...PACK, knacks: { swell: knack('swell', 'Stat', { hpBp: 9_000 }) } },
      SHIPPED,
    );
    const mine = r.resolve({ ...at, formId: 'wisp', knack: 'swell' });
    expect(other.resolve({ ...at, formId: 'wisp', knack: 'swell' }).maxHp).toBe(
      Math.floor((140 * 19_000) / 10_000),
    );
    expect(mine.maxHp).toBe(Math.floor((140 * 12_000) / 10_000));
  });
});

// ---------- raid bosses ----------

describe('raidBoss', () => {
  const shape = { cols: 4, rounds: 8 };

  it('is the spec at full strength by default: shipped name, element and Speed, the pack’s arena and numbers', () => {
    const b = raidBoss(PACK, SHIPPED, 'titan', shape);
    expect(b).toMatchObject({
      id: 'titan',
      name: 'Titan',
      element: 'ember',
      spd: 30,
      hp: 5_000,
      atk: 90,
      rows: 2,
      cols: 4,
      rounds: 8,
      strengthBp: 10_000,
      cards: ['hide', 'wave'],
      plain: { pattern: SINGLE, powerBp: 10_000 },
    });
    expect(b.escalation).toEqual({ ...PACK.raidBosses['titan']?.escalation, strengthBp: 10_000 });
    // Thick Hide adds 70 armour, the Wave card adds its move at full power.
    expect(b.armour).toBe(40 + 70);
    expect(b.moves).toEqual([sweep, crush]);
    expect(b.rosterLevel).toBeUndefined();
    expect('rosterLevel' in b).toBe(false);
  });

  it('builds the cards, the armour and the Build-up at the strength', () => {
    const b = raidBoss(PACK, SHIPPED, 'titan', { ...shape, strengthBp: 4_000 });
    expect(b.strengthBp).toBe(4_000);
    // Armour is the spec's at the strength: half the hide plus 40% of the other half, then the card's 40% of 70.
    expect(b.armour).toBe(
      Math.round((40 * (5_000 + 2_000)) / 10_000) + Math.floor((70 * 4_000) / 10_000),
    );
    // The added move's power is scaled by the strength.
    expect(b.moves[1]).toEqual({ ...crush, powerBp: 4_800 });
    expect(b.escalation?.strengthBp).toBe(4_000);
  });

  it('takes the HP, Attack, armour and roster level it is given, instead of the spec’s', () => {
    const b = raidBoss(PACK, SHIPPED, 'titan', {
      ...shape,
      hp: 777,
      atk: 66,
      armour: 5,
      rosterLevel: 12,
    });
    expect(b).toMatchObject({ hp: 777, atk: 66, rosterLevel: 12 });
    expect(b.armour).toBe(5 + 70);
  });

  it('has the first n cards, none for 0, and a Build-up only when asked for', () => {
    expect(raidBoss(PACK, SHIPPED, 'titan', { ...shape, cards: 1 }).cards).toEqual(['hide']);
    const none = raidBoss(PACK, SHIPPED, 'titan', { ...shape, cards: 0, buildUp: false });
    expect(none.cards).toEqual([]);
    expect(none.armour).toBe(40);
    expect(none.moves).toEqual([sweep]);
    expect(none.escalation).toBeUndefined();
    expect('escalation' in none).toBe(false);
  });

  it('carries extra cards on top of the spec’s, built at the same strength', () => {
    const b = raidBoss(PACK, SHIPPED, 'titan', {
      ...shape,
      strengthBp: 5_000,
      atk: 100,
      extraCards: ['wither'],
    });
    expect(b.cards).toEqual(['hide', 'wave', 'wither']);
    expect(b.atk).toBe(Math.floor((100 * (10_000 + 1_000)) / 10_000));
    const fewer = raidBoss(PACK, SHIPPED, 'titan', { ...shape, cards: 1, extraCards: ['wither'] });
    expect(fewer.cards).toEqual(['hide', 'wither']);
  });

  it('throws for an unknown boss and an unknown card', () => {
    expect(() => raidBoss(PACK, SHIPPED, 'nobody', shape)).toThrow('unknown raid boss nobody');
    expect(() => raidBoss(PACK, SHIPPED, 'titan', { ...shape, extraCards: ['nope'] })).toThrow(
      'unknown card nope',
    );
  });
});

// ---------- foes ----------

describe('foeAt', () => {
  const landmark = Array.from({ length: 60 }, (_, i) => i + 1).find(isLandmark) ?? 0;

  it('scales the content’s HP and Attack by the pack’s scale, then the depth curve', () => {
    // Depth 1 is 10000; depth 3 is 10000 + 1000 x 2 + 100 x 4 = 12400.
    expect(foeStats(PACK, SHIPPED, 'grub', 1)).toEqual({ hp: 400, atk: 30 });
    expect(foeStats(PACK, SHIPPED, 'grub', 3)).toEqual({
      hp: Math.floor((400 * 12_400) / 10_000),
      atk: 30,
    });
  });

  it('applies the foe’s own HP and Attack shares, and never goes below 1', () => {
    expect(foeStats(PACK, SHIPPED, 'warden', 1)).toEqual({ hp: 400, atk: 120 });
    const tiny = { ...PACK, foeScale: { hpBp: 1, atkBp: 1 } };
    expect(foeStats(tiny, SHIPPED, 'grub', 1)).toEqual({ hp: 1, atk: 1 });
  });

  it('is a one-row arena of the shipped foe with its own armour, plain attack and moves', () => {
    const b = foeAt(PACK, SHIPPED, 'grub', 3);
    expect(b).toMatchObject({
      id: 'grub',
      name: 'Grub',
      element: 'grove',
      armour: 3,
      spd: 0,
      rounds: 6,
      rows: FOE_ROWS,
      cols: FOE_COLS,
      cards: [],
      mods: {},
    });
    expect(b.hp).toBe(foeStats(PACK, SHIPPED, 'grub', 3).hp);
    expect(b.moves).toEqual([sweep]);
    expect('escalation' in b).toBe(false);
    expect(b.strengthBp).toBeUndefined();
  });

  it('builds its cards at full strength', () => {
    const b = foeAt(PACK, SHIPPED, 'warden', 1, { signature: false });
    expect(b).toMatchObject({ spd: 8, strengthBp: 10_000, cards: ['wither'] });
    expect(b.atk).toBe(Math.floor((120 * 12_000) / 10_000));
  });

  it('gains its signature at a landmark depth, and `signature` decides it instead', () => {
    expect(landmark).toBeGreaterThan(1);
    expect(foeAt(PACK, SHIPPED, 'warden', 1).moves).toEqual([sweep]);
    expect(foeAt(PACK, SHIPPED, 'warden', landmark).moves).toEqual([sweep, crush]);
    expect(foeAt(PACK, SHIPPED, 'warden', 1, { signature: true }).moves).toEqual([sweep, crush]);
    expect(foeAt(PACK, SHIPPED, 'warden', landmark, { signature: false }).moves).toEqual([sweep]);
    // A foe with no signature never gets one.
    expect(foeAt(PACK, SHIPPED, 'grub', landmark, { signature: true }).moves).toEqual([sweep]);
  });

  it('throws for an unknown foe', () => {
    expect(() => foeAt(PACK, SHIPPED, 'nobody', 1)).toThrow('unknown dungeon foe nobody');
    expect(() => foeStats(PACK, SHIPPED, 'nobody', 1)).toThrow('unknown dungeon foe nobody');
  });
});

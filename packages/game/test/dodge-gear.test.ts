import { afterEach, describe, expect, it } from 'vitest';
import {
  CHANCE_BONUS_BP,
  RULES,
  applyGear,
  creaturePower,
  createSeededRng,
  dodgeChanceBp,
  foldTalent,
  gearContent,
  gearLine,
  itemLines,
  itemOf,
  linePool,
  lineScore,
  rollLines,
  talentDef,
  talentScore,
  wornEffects,
  type GearRarity,
  type Wearer,
} from '../src/index';

/**
 * The lines and talents that feed dodge and debuffs (slice 6 of `docs/design/speed-and-dodge.md`): Fleet,
 * Light-footed, Sidestep as dodge, Riposte, Momentum, Slipstream, the three debuff lines on items, the
 * talents, and the power score counting dodge.
 */

const wearer: Wearer = { role: 'payoff', element: 'tide' };
const charm = (rarity: GearRarity, lines: [string, number][], level = 20) =>
  itemOf(
    'trail-charm',
    rarity,
    level,
    lines.map(([id, tier]) => ({ id, tier })),
  );
const scarf = (rarity: GearRarity, lines: [string, number][], level = 20) =>
  itemOf(
    'patch-scarf',
    rarity,
    level,
    lines.map(([id, tier]) => ({ id, tier })),
  );

const dodgeRule = RULES.combat.dodge as { enabled: boolean };
const effectsRule = RULES.combat.effects as { enabled: boolean };
afterEach(() => {
  dodgeRule.enabled = false;
  effectsRule.enabled = false;
});

describe('the new lines in the content', () => {
  it('has the numbers of the design', () => {
    expect(gearLine('fleet')?.values).toEqual([500, 800, 1100, 1400, 1700]);
    expect(gearLine('light-footed')?.values).toEqual([400, 600, 800, 1000, 1200]);
    expect(gearLine('riposte')?.values).toEqual([2000, 2500, 3000, 3500, 4000]);
    expect(gearLine('momentum')?.values).toEqual([800, 1200, 1600, 2000, 2500]);
    expect(gearLine('slipstream')?.values).toEqual([600, 900, 1200, 1500, 1800]);
    // Sidestep keeps its numbers.
    expect(gearLine('sidestep')?.values).toEqual([400, 600, 800, 1000, 1200]);
  });

  it('makes Light-footed a chance line and the three on-dodge lines trigger lines, all special and Rare and up', () => {
    expect(gearLine('light-footed')?.group).toBe('chance');
    for (const id of ['light-footed', 'riposte', 'momentum', 'slipstream']) {
      const line = gearLine(id);
      expect(line?.special, id).toBe(true);
      expect(line?.minRarity, id).toBe('rare');
    }
    for (const id of ['riposte', 'momentum', 'slipstream']) {
      expect(gearLine(id)?.group, id).toBe('trigger');
    }
    expect(gearLine('fleet')?.special).toBe(false);
    expect(gearLine('fleet')?.minRarity).toBe('common');
  });

  it('leans Fleet to Scarves and Charms and Light-footed to Scarves, never Hats', () => {
    const w = gearLine('fleet')?.weights;
    expect(w?.scarf).toBeGreaterThan(w?.hat ?? 0);
    expect(w?.charm).toBeGreaterThan(w?.hat ?? 0);
    expect(gearLine('light-footed')?.weights.hat).toBe(0);
  });
});

describe('Fleet', () => {
  it('folds a share of Speed into the creature, so dodge follows', () => {
    dodgeRule.enabled = true;
    const item = scarf('common', [['fleet', 4]]); // tier V: +17%
    const stats = { hp: 100, atk: 10, spd: 200 };
    const folded = applyGear(stats, undefined, wearer, [item]);
    expect(folded.stats.spd).toBe(234);
    expect(dodgeChanceBp(folded.stats.spd)).toBe(2_340);
    expect(dodgeChanceBp(stats.spd)).toBe(2_000);
    // It adds to a talent's share (Zoomies), not multiplies it.
    const zoomies = foldTalent(talentDef('zoomies') as never, false); // +12%
    expect(applyGear(stats, undefined, wearer, [item], [zoomies]).stats.spd).toBe(258);
  });

  it('rolls on a Common item and is not a sheet field', () => {
    const fx = wornEffects(wearer, [scarf('common', [['fleet', 0]])]);
    expect(fx.spdBp).toBe(500);
    expect(fx.mods).toEqual({});
  });
});

describe('Light-footed', () => {
  it('adds flat dodge points to the sheet, two more on an Epic', () => {
    const rare = wornEffects(wearer, [charm('rare', [['light-footed', 4]])]);
    expect(rare.mods.dodgeBp).toBe(1_200);
    const epic = wornEffects(wearer, [charm('epic', [['light-footed', 4]])]);
    expect(epic.mods.dodgeBp).toBe(1_200 + CHANCE_BONUS_BP);
    expect(itemLines(charm('rare', [['light-footed', 2]])).at(-1)?.text).toBe('Light-footed 8%');
  });

  it('caps at the whole when two items carry it', () => {
    const items = [charm('epic', [['light-footed', 4]]), scarf('epic', [['light-footed', 4]])];
    expect(wornEffects(wearer, items).mods.dodgeBp).toBe(2_800);
  });
});

describe('Sidestep becomes dodge', () => {
  const item = () => charm('rare', [['sidestep', 2]]); // 8%

  it('keeps its own chance while dodge is off', () => {
    const fx = wornEffects(wearer, [item()]);
    expect(fx.mods.sidestepBp).toBe(800);
    expect(fx.mods.areaDodgeBp).toBeUndefined();
  });

  it('gives flat points of dodge against area hits when dodge is on, the same numbers, Epic bonus too', () => {
    dodgeRule.enabled = true;
    const fx = wornEffects(wearer, [item()]);
    expect(fx.mods.areaDodgeBp).toBe(800);
    expect(fx.mods.sidestepBp).toBeUndefined();
    const epic = wornEffects(wearer, [charm('epic', [['sidestep', 2]])]);
    expect(epic.mods.areaDodgeBp).toBe(800 + CHANCE_BONUS_BP);
  });
});

describe('the on-dodge lines', () => {
  it('fill their own sheet fields', () => {
    const r = wornEffects(wearer, [charm('rare', [['riposte', 4]])]);
    expect(r.mods.riposteBp).toBe(4_000);
    const m = wornEffects(wearer, [charm('rare', [['momentum', 0]])]);
    expect(m.mods.momentumBp).toBe(800);
    const s = wornEffects(wearer, [charm('rare', [['slipstream', 2]])]);
    expect(s.mods.slipstreamBp).toBe(1_200);
  });
});

describe('the debuff lines roll on items', () => {
  it('are in the pools, Rare and up, leaning to the slots the design names', () => {
    const base = { slot: 'scarf', tag: 'neutral' } as const;
    const weight = (slot: 'scarf' | 'charm', rarity: GearRarity, id: string) =>
      linePool({ ...base, slot }, rarity, 20).find((p) => p.line.id === id)?.weight ?? 0;
    for (const id of ['clean-coat', 'heavy-hand', 'clinging']) {
      expect(weight('scarf', 'common', id), id).toBe(0);
      expect(weight('scarf', 'rare', id) + weight('charm', 'rare', id), id).toBeGreaterThan(0);
      expect(gearLine(id)?.fixedOnly, id).toBe(false);
    }
    expect(weight('scarf', 'rare', 'clean-coat')).toBeGreaterThan(
      weight('charm', 'rare', 'clean-coat'),
    );
    expect(weight('charm', 'rare', 'heavy-hand')).toBeGreaterThan(
      weight('scarf', 'rare', 'heavy-hand'),
    );
    expect(weight('charm', 'rare', 'clinging')).toBeGreaterThan(
      weight('scarf', 'rare', 'clinging'),
    );
  });

  it('turn up when items are rolled with a seeded RNG, and fold into the sheet', () => {
    const rng = createSeededRng('debuff-lines-roll');
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      for (const l of rollLines(rng, { slot: 'charm', tag: 'neutral' }, 'epic', 20)) seen.add(l.id);
    }
    for (const id of ['clean-coat', 'heavy-hand', 'clinging', 'fleet', 'light-footed', 'riposte']) {
      expect(seen.has(id), id).toBe(true);
    }
    const fx = wornEffects({ role: 'support', element: 'tide' }, [
      charm('epic', [['heavy-hand', 4]]),
      scarf('epic', [['clinging', 4]]),
    ]);
    expect(fx.mods.debuffPowerBp).toBe(3_000);
    expect(fx.mods.debuffDurationTurns).toBe(2);
  });
});

describe('the talents', () => {
  it('adds a dodge, a Speed and a debuff power talent, golden at 1.5 times, and keeps Zoomies', () => {
    expect(talentDef('slips-away')?.effect).toEqual({ line: 'light-footed' });
    expect(talentDef('long-strides')?.effect).toEqual({ line: 'fleet' });
    expect(talentDef('soot-on-its-paws')?.effect).toEqual({ line: 'heavy-hand' });
    expect(foldTalent(talentDef('slips-away') as never, true).value).toBe(450);
    expect(foldTalent(talentDef('long-strides') as never, true).value).toBe(1_500);
    expect(talentDef('zoomies')?.effect).toEqual({ rule: 'speed' });
    const slips = wornEffects(wearer, [], [foldTalent(talentDef('slips-away') as never, false)]);
    expect(slips.mods.dodgeBp).toBe(300);
  });
});

describe('the power score counts dodge', () => {
  it('is Attack + HP / 10 while dodge is off, whatever the Speed', () => {
    expect(creaturePower({ atk: 100, hp: 1_000, spd: 400 }, 3_000)).toBe(200);
    expect(creaturePower({ atk: 100, hp: 1_000 })).toBe(200);
    expect(dodgeChanceBp(400, 3_000)).toBe(0);
  });

  it('counts HP as HP / (1 - dodge) with dodge on, from Speed and flat dodge, capped', () => {
    dodgeRule.enabled = true;
    // 100 Speed is 10% dodge: 1000 HP counts as 1111.
    expect(creaturePower({ atk: 100, hp: 1_000, spd: 100 })).toBe(100 + 111);
    // Plus 20 points of flat dodge: 30%, 1428 HP.
    expect(creaturePower({ atk: 100, hp: 1_000, spd: 100 }, 2_000)).toBe(100 + 142);
    // The cap (50%) doubles it at most.
    expect(creaturePower({ atk: 100, hp: 1_000, spd: 10_000 }, 9_000)).toBe(100 + 200);
    // So a faster creature of the same Attack and HP outranks a slower one.
    expect(creaturePower({ atk: 100, hp: 1_000, spd: 150 })).toBeGreaterThan(
      creaturePower({ atk: 100, hp: 1_000, spd: 50 }),
    );
  });

  it('counts the new lines in the score only while their switch is on', () => {
    const power = 100 * 100 + 1_000 * 10;
    const score = (id: string, value: number) => {
      const line = gearLine(id);
      if (line === undefined) throw new Error(id);
      return lineScore(line, value, wearer, power);
    };
    for (const id of ['fleet', 'light-footed', 'riposte', 'momentum', 'slipstream']) {
      expect(score(id, gearLine(id)?.values[4] as number), `${id} off`).toBe(0);
    }
    for (const id of ['clean-coat', 'heavy-hand', 'clinging']) {
      expect(score(id, gearLine(id)?.values[4] as number), `${id} off`).toBe(0);
    }
    dodgeRule.enabled = true;
    effectsRule.enabled = true;
    for (const id of [
      'fleet',
      'light-footed',
      'riposte',
      'momentum',
      'slipstream',
      'clean-coat',
      'heavy-hand',
      'clinging',
    ]) {
      expect(score(id, gearLine(id)?.values[4] as number), `${id} on`).toBeGreaterThan(0);
    }
    // Light-footed at tier V is worth more than Fleet at tier V: six points of dodge against 17% of Speed.
    expect(score('light-footed', 600)).toBeGreaterThan(score('fleet', 1_700));
  });

  it('scores the dodge talents for the creature that would learn them', () => {
    dodgeRule.enabled = true;
    const stats = { atk: 100, hp: 1_000 };
    const slips = talentScore(foldTalent(talentDef('slips-away') as never, false), {
      ...wearer,
      stats,
    });
    const strides = talentScore(foldTalent(talentDef('long-strides') as never, false), {
      ...wearer,
      stats,
    });
    expect(slips).toBeGreaterThan(0);
    expect(strides).toBeGreaterThan(0);
    dodgeRule.enabled = false;
    expect(
      talentScore(foldTalent(talentDef('slips-away') as never, false), { ...wearer, stats }),
    ).toBe(0);
  });

  it('keeps every new line in a content pool that can roll', () => {
    for (const id of ['fleet', 'light-footed', 'riposte', 'momentum', 'slipstream']) {
      expect(
        gearContent.lines.some((l) => l.id === id && !l.fixedOnly),
        id,
      ).toBe(true);
    }
  });
});

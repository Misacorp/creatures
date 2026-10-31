/**
 * Combat v2: the effect vocabulary the engine exports (`KnackFx`, `mergeFx`, `STAT_FIELDS`, `ADDITIVE_FIELDS`): how a Knack's and
 * its talents' effects merge into the one object a creature carries, and which lines are stats that survive silence. Which Knack or
 * talent has which effect is content, and stays with the catalogue (the lab now, the game's data in phase 3).
 */
import { ADDITIVE_FIELDS, STAT_FIELDS, mergeFx, type KnackFx } from '@creatures/engine/v2';
import { describe, expect, it } from 'vitest';

describe('mergeFx', () => {
  it('adds numbers and combines flags', () => {
    expect(mergeFx([{ atkBp: 800, seal: true }, { atkBp: 500 }, { ignoreSilence: true }])).toEqual({
      atkBp: 1_300,
      seal: true,
      ignoreSilence: true,
    });
  });

  it('a flag stays one flag however many parts have it, and false does not remove it', () => {
    expect(mergeFx([{ flankGuard: true }, { flankGuard: true }])).toEqual({ flankGuard: true });
    expect(mergeFx([{ holdOn: true }, { holdOn: false }])).toEqual({ holdOn: true });
  });

  it('a Support shape or an anchor choice comes from the first part that has one (the Knack)', () => {
    expect(mergeFx([{ support: 'rowRain' }, { support: 'sunbeam' }])).toEqual({
      support: 'rowRain',
    });
    expect(mergeFx([{ marksAs: 'cashable' }, { marksAs: 'own' }])).toEqual({ marksAs: 'cashable' });
  });

  it('merging nothing gives nothing, and the inputs are not changed', () => {
    expect(mergeFx([])).toEqual({});
    const a: KnackFx = { atkBp: 100 };
    mergeFx([a, { atkBp: 50 }]);
    expect(a).toEqual({ atkBp: 100 });
  });
});

describe('the stat lines and the additive lines', () => {
  it('the stat lines of a talent (what survives silence) are Attack, Max HP, Armour, Speed, crit chance and crit damage', () => {
    expect([...STAT_FIELDS].sort()).toEqual(
      ['armourBonus', 'atkBp', 'critChanceBp', 'critDamageBp', 'dodgeBonusBp', 'hpBp'].sort(),
    );
  });

  it('every stat line is an additive line, so a talent may carry it', () => {
    for (const field of STAT_FIELDS) expect(ADDITIVE_FIELDS.has(field), field).toBe(true);
  });
});

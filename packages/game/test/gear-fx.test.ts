import { describe, expect, it } from 'vitest';
import {
  GEAR_LINE_FX,
  gearContent,
  gearFx,
  gearLineHasV2Hook,
  itemOf,
  setPieces,
  type GearItem,
  type Role,
} from '../src/index';

/**
 * Gear on combat v2 (`rules/gear-fx.ts`, gear plan slice 1): each gear line with a v2 hook maps to the engine's effect
 * field at its scaled value; conditions are settled before the fight; lines with no hook add nothing.
 */

const wearer = (role: Role, element: 'tide' | 'ember' | 'grove' | 'spark' = 'tide') => ({
  role,
  element,
});
/** One hat with a single rolled line at a tier (0 to 4), at the highest item level and a rare's chance lines. */
const hatWith = (line: string, tier = 4): GearItem =>
  itemOf('felt-hat', 'rare', 100, [{ id: line, tier }]);

describe('gearFx: the line to effect map', () => {
  // [line, role, expected at tier V (index 4), the field and its number]
  const cases: [string, Role, Record<string, number | boolean>][] = [
    ['well-fed', 'guard', { healReceivedBp: 3500 }],
    ['cover', 'guard', { coverBonusBp: 1200 }],
    ['boost', 'support', { boostBonusBp: 800 }],
    ['mend', 'support', { mendBonusBp: 400 }],
    ['area-ward', 'guard', { areaCutBp: 1200 }],
    ['light-footed', 'setter', { dodgeBonusBp: 1200 }],
    ['sidestep', 'setter', { areaDodgeBp: 1200 }],
    ['odd-one-out', 'setter', { oddOneOutBp: 1000 }],
    ['edge-walker', 'setter', { rowEndBp: 1000 }],
    ['unbothered', 'setter', { ignoreSilence: true }],
    // Scaled to the twin talent's pip: x0.8 (Brace).
    ['brace', 'guard', { braceBp: 2000 }],
    ['clinging', 'support', { clinging: true }],
    // x0.3 and the Knack's price.
    ['guards-shadow', 'setter', { besideGuardBp: 510, armourBonus: -10 }],
    ['heavy-hand', 'support', { miredExtraBp: 4000 }],
    ['first-pounce', 'setter', { firstHitBp: 8500 }],
    ['owners-mark', 'setter', { ownMarkBp: 750 }],
    ['shoulder-to-shoulder', 'setter', { perKindredBesideBp: 1150 }],
    ['front-liner', 'guard', { frontCutBp: 500 }],
    ['rally-cry', 'setter', { vengefulBp: 2000 }],
    ['momentum', 'setter', { momentumBp: 1875 }],
    // Scale x2 (the reaction family).
    ['payoffs-pounce', 'payoff', { reactionBonusBp: 2600 }],
    ['tide-reaction', 'payoff', { reactionBonusBp: 4800 }],
    // Armour points, for every role.
    ['armor', 'guard', { armourBonus: 9 }],
    ['wide-stance', 'guard', { reachBonus: 1 }],
    ['stubborn', 'setter', { holdOn: true }],
    ['riposte', 'setter', { retaliateBp: 4000 }],
  ];

  it.each(cases)('%s for a %s gives its field', (line, role, expected) => {
    expect(gearFx(wearer(role), [hatWith(line)])).toEqual(expected);
  });

  it('covers every line of the shipped data that has an entry, and only real lines', () => {
    const ids = new Set(
      gearContent.lines.map((l) => (l.element === null ? l.id : l.id.slice(l.element.length + 1))),
    );
    for (const id of Object.keys(GEAR_LINE_FX)) expect(ids.has(id), id).toBe(true);
  });

  it('uses the tier asked for: a lower pip is a smaller number', () => {
    expect(gearFx(wearer('setter'), [hatWith('first-pounce', 0)])).toEqual({ firstHitBp: 1942 });
  });

  it('sums two copies of a line, but the Guard Shadow armour price is paid once', () => {
    const fx = gearFx(wearer('setter'), [hatWith('well-fed'), hatWith('well-fed', 1)]);
    expect(fx.healReceivedBp).toBe(3500 + 1400);
    const shadow = gearFx(wearer('setter'), [hatWith('guards-shadow'), hatWith('guards-shadow')]);
    expect(shadow).toEqual({ besideGuardBp: 1020, armourBonus: -10 });
  });

  it('settles the conditions before the fight', () => {
    // A role-restricted line does nothing for another role.
    expect(gearFx(wearer('setter'), [hatWith('cover')])).toEqual({});
    expect(gearFx(wearer('guard'), [hatWith('boost')])).toEqual({});
    // Payoff's Pounce is for a Payoff.
    expect(gearFx(wearer('setter'), [hatWith('payoffs-pounce')])).toEqual({});
    // A Reaction line helps a wearer of its own element only.
    expect(gearFx(wearer('payoff', 'ember'), [hatWith('tide-reaction')])).toEqual({});
    expect(gearFx(wearer('payoff', 'tide'), [hatWith('tide-reaction')])).toEqual({
      reactionBonusBp: 4800,
    });
    // Armour is for every role although the data names the Guard.
    expect(gearFx(wearer('support'), [hatWith('armor', 0)])).toEqual({ armourBonus: 2 });
  });

  it('gives a Retaliate line as a value to take the larger of, not a sum', () => {
    // Two Riposte lines make one counter with the larger chance (the engine merges it with a Knack's the same way).
    const fx = gearFx(wearer('setter'), [hatWith('riposte', 4), hatWith('riposte', 0)]);
    expect(fx.retaliateBp).toBe(4000);
  });

  it('adds nothing for lines with no v2 hook, stat lines and an empty set of items', () => {
    expect(gearFx(wearer('guard'), [])).toEqual({});
    for (const line of [
      'attack',
      'hp',
      'crit-chance',
      'all-damage-taken',
      'payback',
      'ember-hunter',
    ]) {
      expect(gearFx(wearer('guard'), [hatWith(line)]), line).toEqual({});
    }
    expect(gearLineHasV2Hook('first-pounce')).toBe(true);
    expect(gearLineHasV2Hook('tide-reaction')).toBe(true);
    expect(gearLineHasV2Hook('payback')).toBe(false);
    expect(gearLineHasV2Hook('attack')).toBe(false);
    expect(gearLineHasV2Hook('no-such-line')).toBe(false);
  });

  it('counts the two-piece bonuses that have a hook, for two pieces of a set only', () => {
    const piece = (setId: string, slot: 'hat' | 'scarf' | 'charm'): GearItem => {
      const base = setPieces(setId).find((b) => b.slot === slot);
      if (base === undefined) throw new Error(`no ${slot} in ${setId}`);
      return itemOf(base.id, 'common', 100, []);
    };
    const two = (setId: string): GearItem[] => [piece(setId, 'hat'), piece(setId, 'scarf')];
    // Tidepool: Reaction Bonus +8% x2, for a Tide wearer.
    expect(gearFx(wearer('payoff', 'tide'), two('tidepool-finery'))).toEqual({
      reactionBonusBp: 1600,
    });
    expect(gearFx(wearer('payoff', 'ember'), two('tidepool-finery'))).toEqual({});
    // Forge-Warm: the same for an Ember wearer.
    expect(gearFx(wearer('payoff', 'ember'), two('forge-warm-kit'))).toEqual({
      reactionBonusBp: 1600,
    });
    // Pounce Set: Payoff's Pounce +5% x2.
    expect(gearFx(wearer('payoff'), two('pounce-set'))).toEqual({ reactionBonusBp: 1000 });
    // Warden's Watch: +4 armour; Hearth Helpers: Boost +3 (a Support's).
    expect(gearFx(wearer('guard'), two('wardens-watch'))).toEqual({ armourBonus: 4 });
    expect(gearFx(wearer('support'), two('hearth-helpers'))).toEqual({ boostBonusBp: 300 });
    // One piece is no bonus.
    expect(gearFx(wearer('guard'), [piece('wardens-watch', 'hat')])).toEqual({});
  });

  it('counts a charm base line (the Warden bell is Armour)', () => {
    const bell = itemOf('wardens-bell', 'common', 100, []);
    expect(gearFx(wearer('guard'), [bell])).toEqual({ armourBonus: 4 });
  });
});

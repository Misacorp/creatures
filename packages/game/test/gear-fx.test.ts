import { describe, expect, it } from 'vitest';
import {
  GEAR_LINE_FX,
  SET_THREE_V2,
  gearContent,
  gearFx,
  gearLineHasV2Hook,
  itemOf,
  setPieces,
  setThreeText,
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
  const cases: [string, Role, Record<string, number | boolean | Record<string, number>>][] = [
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
    // x0.6, no armour price (2026-11-06).
    ['guards-shadow', 'setter', { besideGuardBp: 1020 }],
    ['heavy-hand', 'support', { boggedDownExtraBp: 4000 }],
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
    // Slice 3, batch A: the cuts and conditions.
    ['all-damage-taken', 'guard', { takenCutBp: 800 }],
    ['aimed-ward', 'guard', { aimedCutBp: 1200 }],
    ['backdraft-ward', 'guard', { reflectedCutBp: 3500 }],
    ['last-stand', 'guard', { lastStandCutBp: 2000 }],
    // The piece's element decides, whoever wears it: Tide beats Ember, Ember is beaten by Tide and Mire.
    ['tide-hunter', 'guard', { vsElementBp: { ember: 1700 } }],
    ['ember-ward', 'setter', { fromElementCutBp: { tide: 1700, mire: 1700 } }],
    ['marking-hit', 'setter', { markingHitBp: 2400 }],
    ['marked-foe', 'guard', { markedFoeBp: 1500 }],
    ['beside-the-mark-maker', 'guard', { besideRoleBp: { setter: 1000 } }],
    ['long-arm-left', 'guard', { reachLeftBonus: 2 }],
    ['long-arm-right', 'guard', { reachRightBonus: 2 }],
    ['flank-guard-left', 'guard', { reachLeftBonus: 1, reachRightBonus: -1 }],
    ['flank-guard-right', 'guard', { reachRightBonus: 1, reachLeftBonus: -1 }],
    ['sheltered', 'guard', { shelterBp: 600 }],
    // x1.25: the crit chance lines' scale.
    ['keen-reaction', 'payoff', { keenReactionBp: 1000 }],
    ['back-row-patience', 'setter', { backRowCritBp: 500 }],
    ['heart-of-the-row', 'setter', { heartHpBp: 1200 }],
    // Scale x2 (the reaction family).
    ['four-winds', 'payoff', { fourWindsBp: 2000 }],
    ['adaptation-pierce', 'setter', { adaptPierceBp: 3500 }],
    // Slice 4, batch B: the triggers and auras. Payback x6, Overflow x8, Slipstream x6, Echo x4 and Shared warmth x8 since 2026-11-06.
    ['payback', 'guard', { paybackBp: 18000 }],
    ['ember-tail', 'payoff', { emberTailBp: 2000 }],
    ['overflow', 'payoff', { overflowBp: 12000 }],
    ['slipstream', 'setter', { slipstreamBp: 10800 }],
    ['echo', 'payoff', { echoChanceBp: 4800 }],
    // The gear line's own field; Catch Breath is `secondWindBp`.
    ['second-wind', 'setter', { windChanceBp: 1200 }],
    // x0.5: round 1 only.
    ['kindling', 'support', { kindlingBp: 2000 }],
    ['shared-warmth', 'guard', { sharedWarmthBp: 2400 }],
    // Scale x2 (the reaction family).
    ['spark-share', 'support', { sparkShareBp: 3000 }],
    ['lantern-bearer', 'setter', { lanternBp: 600 }],
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

  it('sums two copies of a line (Guard Shadow has no armour price since 2026-11-06)', () => {
    const fx = gearFx(wearer('setter'), [hatWith('well-fed'), hatWith('well-fed', 1)]);
    expect(fx.healReceivedBp).toBe(3500 + 1400);
    const shadow = gearFx(wearer('setter'), [hatWith('guards-shadow'), hatWith('guards-shadow')]);
    expect(shadow).toEqual({ besideGuardBp: 2040 });
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

  it('settles a row of Hunter and Ward lines into one table by element, copies adding', () => {
    // Ember beats Grove and Mire; Hunter by the piece's element works for any wearer.
    const two = gearFx(wearer('setter', 'spark'), [
      hatWith('ember-hunter', 4),
      hatWith('ember-hunter', 0),
    ]);
    const one = gearFx(wearer('setter', 'spark'), [hatWith('ember-hunter', 4)]);
    expect(Object.keys(one.vsElementBp ?? {}).length).toBeGreaterThan(0);
    for (const [foe, bp] of Object.entries(one.vsElementBp ?? {}))
      expect(two.vsElementBp?.[foe], foe).toBe(bp + 400);
  });

  it('keeps a Flank Guard line from costing its price twice, and a role line to its role', () => {
    const both = gearFx(wearer('guard'), [
      hatWith('flank-guard-left'),
      hatWith('flank-guard-left'),
    ]);
    expect(both).toEqual({ reachLeftBonus: 2, reachRightBonus: -1 });
    expect(gearFx(wearer('setter'), [hatWith('long-arm-left')])).toEqual({});
  });

  it('gives a Retaliate line as a value to take the larger of, not a sum', () => {
    // Two Riposte lines make one counter with the larger chance (the engine merges it with a Knack's the same way).
    const fx = gearFx(wearer('setter'), [hatWith('riposte', 4), hatWith('riposte', 0)]);
    expect(fx.retaliateBp).toBe(4000);
  });

  it('adds nothing for lines with no v2 hook, stat lines and an empty set of items', () => {
    expect(gearFx(wearer('guard'), [])).toEqual({});
    for (const line of ['attack', 'hp', 'crit-chance']) {
      expect(gearFx(wearer('guard'), [hatWith(line)]), line).toEqual({});
    }
    expect(gearLineHasV2Hook('first-pounce')).toBe(true);
    expect(gearLineHasV2Hook('tide-reaction')).toBe(true);
    // Warm Heart, Second Breath and Opening Mark are gone from the data (Misa 2026-11-06): no line, no hook.
    for (const line of ['warm-heart', 'second-breath', 'opening-mark'])
      expect(gearLineHasV2Hook(line), line).toBe(false);
    for (const line of [
      'payback',
      'ember-tail',
      'overflow',
      'slipstream',
      'echo',
      'second-wind',
      'kindling',
      'shared-warmth',
      'spark-share',
      'lantern-bearer',
    ])
      expect(gearLineHasV2Hook(line), line).toBe(true);
    for (const line of ['all-damage-taken', 'ember-hunter', 'tide-ward', 'long-arm-left'])
      expect(gearLineHasV2Hook(line), line).toBe(true);
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

  it('counts the three-piece effects that have a hook, for three pieces and a wearer of the set element', () => {
    const three = (setId: string): GearItem[] =>
      (['hat', 'scarf', 'charm'] as const).map((slot) => {
        const base = setPieces(setId).find((b) => b.slot === slot);
        if (base === undefined) throw new Error(`no ${slot} in ${setId}`);
        return itemOf(base.id, 'common', 100, []);
      });
    expect(gearFx(wearer('payoff', 'tide'), three('tidepool-finery'))).toEqual({
      reactionBonusBp: 1600,
      unreflectedFirst: true,
    });
    // The effect names the wearer's element: a Tide set on an Ember wearer gives neither the bonus nor the effect.
    expect(gearFx(wearer('payoff', 'ember'), three('tidepool-finery'))).toEqual({});
    // Crit damage for a round: +20 points today, +30 here.
    expect(gearFx(wearer('payoff', 'ember'), three('forge-warm-kit'))).toEqual({
      reactionBonusBp: 1600,
      critWindowBp: 3000,
    });
    // The set's Charm is Payoff's Pounce itself (+10%, x2), on top of the two-piece +5% x2.
    expect(gearFx(wearer('payoff'), three('pounce-set'))).toEqual({
      reactionBonusBp: 2000,
      firstReactionCrit: true,
    });
    // Warden's Watch: the two-piece armour and the bell's, and one more slot of reach.
    expect(gearFx(wearer('guard'), three('wardens-watch'))).toEqual({
      armourBonus: 8,
      reachBonus: 1,
    });
  });

  it('gives the five combat v2 three-piece effects of their own, for three pieces only', () => {
    const worn = (setId: string, n = 3): GearItem[] =>
      (['hat', 'scarf', 'charm'] as const).slice(0, n).map((slot) => {
        const base = setPieces(setId).find((b) => b.slot === slot);
        if (base === undefined) throw new Error(`no ${slot} in ${setId}`);
        return itemOf(base.id, 'common', 100, []);
      });
    // Hollow Weave: a Grove wearer's heal when it cashes. Ridge Copper: a Spark wearer's trail. Neither works for another element.
    expect(gearFx(wearer('payoff', 'grove'), worn('hollow-weave'))).toMatchObject({
      healOnCashBp: 300,
    });
    expect(gearFx(wearer('payoff', 'tide'), worn('hollow-weave'))).toEqual({});
    expect(gearFx(wearer('payoff', 'spark'), worn('ridge-copper'))).toMatchObject({
      trailSet: true,
    });
    expect(gearFx(wearer('payoff', 'tide'), worn('ridge-copper'))).toEqual({});
    expect(gearFx(wearer('support'), worn('hearth-helpers'))).toMatchObject({
      boostReachSet: true,
    });
    expect(gearFx(wearer('setter'), worn('first-footprints'))).toMatchObject({
      deepTracks: true,
    });
    // Two pieces give none of them, and the v1 id of the set (`sealMark`) gives nothing in combat v2.
    expect(gearFx(wearer('setter'), worn('first-footprints', 2))).not.toHaveProperty('deepTracks');
    expect(gearFx(wearer('setter'), worn('first-footprints'))).not.toHaveProperty('sealMark');
  });

  it('keeps the v1 set data as it is: the five v2 texts live apart from the set data', () => {
    for (const [id, effect] of [
      ['hollow-weave', 'healOnReaction'],
      ['ridge-copper', 'chainMark'],
      ['wardens-watch', 'guardReach'],
      ['hearth-helpers', 'boostReach'],
      ['first-footprints', 'sealMark'],
    ] as const) {
      const set = gearContent.sets.find((s) => s.id === id);
      expect(set?.three?.effect, id).toBe(effect);
      expect(Object.hasOwn(SET_THREE_V2, id), id).toBe(true);
    }
    expect(setThreeText({ id: 'first-footprints' })).toMatch(/^Deep Tracks:/);
    // A set with no v2 effect of its own reads the set's text.
    expect(setThreeText({ id: 'pounce-set', three: { text: 'x' } })).toBe('x');
  });

  it('counts a charm base line (the Warden bell is Armour)', () => {
    const bell = itemOf('wardens-bell', 'common', 100, []);
    expect(gearFx(wearer('guard'), [bell])).toEqual({ armourBonus: 4 });
  });
});

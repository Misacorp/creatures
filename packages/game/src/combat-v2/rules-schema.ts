/**
 * The numbers of the combat v2 rules (`data/rules.json`). The same fields as the engine's `V2Rules`
 * (`packages/engine/src/v2/types.ts`, where each is described): a type test in the engine fails the typecheck when the two
 * drift. Every value is a knob for the simulator to move, not a balanced number (docs/design/combat/). Basis points (bp):
 * 10000 is 100%. Every field is required: a rules change adds a field here, in the engine and in the data, with no default.
 */
import * as v from 'valibot';

const Int = v.pipe(v.number(), v.integer(), v.minValue(0));

export const RulesSchema = v.pipe(
  v.strictObject({
    /** A Payoff's reaction hit deals plain x this (R7). The pair Setter + Payoff should clearly beat two plain hitters, not double them. */
    payoffMultBp: Int,
    /** All reaction-bonus factors together (Knack factor, extra counts, Boiling Point) never pass this (R7). */
    maxBonusFactorBp: Int,
    /** A mark holds at most this many counts (R3). */
    maxStacks: Int,
    overstackCapPerStackBp: Int,
    /** Dodge chance per point of Speed, the cap, and the share against area hits (R1). */
    dodgePerSpdBp: Int,
    dodgeMaxBp: Int,
    areaDodgeShareBp: Int,
    /** Crits on creature hits and on a boss's hits (R7.1): a crit doubles the hit (Misa, 2026-10-30: luck is a build). Crit damage from talents, Knacks, species and gear adds to the +100%. */
    critChanceBp: Int,
    critBp: Int,
    /** A heal that crits is 1.5 times: a heal is not a hit, so the doubling rule does not apply, and no crit talent raises it. */
    healCritBp: Int,
    /** A creature stores at most this many Sure Crits (the Store limit, R10); each is spent on one hit. */
    sureCritMax: Int,
    /** Easily Provoked: a Guard stores a Sure Crit each time the hits it takes for other creatures add up to this share of its Max HP. */
    guardSureCritShareBp: Int,
    /** A Guard covers area hits on creatures in its reach (4.3, kept). Cover with every bonus is one cut among the others (`cutMaxBp`). */
    coverBp: Int,
    /** Every cut one hit gets (auras, cover, Long Shadow's intercept cut, Front-liner, Brace, ...) multiplies together; the total cut never passes this, and it comes off before armour (panel 3). */
    cutMaxBp: Int,
    guardReach: Int,
    /** Support round-start verbs (4.5, kept): boost on the next hit, and the elements that heal. */
    supportBoostBp: Int,
    supportBoostEmberBp: Int,
    supportHealBp: v.pipe(v.record(v.string(), Int), v.readonly()),
    /** Buffs and debuffs: all hit bonuses from buffs together never pass this (R15). */
    maxHitBonusBp: Int,
    /** A Flank Guard's one side covers this many times the slots of its Reach. */
    flankGuardSlots: Int,
    /** Opportunist: a mark with at least this many counts. */
    opportunistFromStacks: Int,
    /** Bogged Down, the Mire debuff: per stack, the boss deals less damage and dodges less. */
    boggedDownPerStackBp: Int,
    /** With Clinging on a living creature each stack counts for this much instead (reworked 2026-10-28). */
    boggedDownClingingStackBp: Int,
    boggedDownMaxStacks: Int,
    /** Bogged Down fades: one stack at the end of every this many rounds (1: every round, 2026-11-01); with Clinging on a living creature, every `boggedDownClingingFadeEvery` instead. */
    boggedDownFadeEvery: Int,
    /** While a living creature has Clinging, Bogged Down fades only every this many rounds. */
    boggedDownClingingFadeEvery: Int,
    /** Refuse to Fall (Hold On): once per fight (a raid: once per weekend), a hit that would knock it out leaves it at the lower of this share of its Max HP and its HP before the hit (never a heal). */
    holdOnLeaveBp: Int,
    /** Element Resistance: the resisted element's creatures' hits start from this share of their base damage (a quarter less; counters are not cut). */
    adaptElementBp: Int,
    /** Bogged Down slows the boss's escalation (R22): each stack raises the units the next step needs by this share of a step's units. */
    boggedDownSlowsEscalationBp: Int,
    /** "The boss is low" for Finisher: its HP is below this share of its full HP. */
    finisherBelowBp: Int,
    /** The live finale's Rally (R18): every creature's hits deal this much more that round, counted in the hit-boost cap (`maxHitBonusBp`, R15). */
    rallyBp: Int,
    /** The live finale's Shield Wall (R18): the chosen row's creatures take this much less from every hit that round, one cut among the others (`cutMaxBp`, R15). */
    shieldWallBp: Int,
    /** The live finale's Purge (R18): the boss has no Element or Reaction Resistance for this many rounds, the round it is used and the ones after. */
    purgeRounds: Int,
  }),
  v.readonly(),
);
export type CombatRules = v.InferOutput<typeof RulesSchema>;

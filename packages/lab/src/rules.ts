/**
 * Starting numbers of the combat v2 draft (docs/design/combat-v2.md). Every value is a lab knob
 * for the simulator to move, not a balanced number. Basis points (bp): 10000 is 100%.
 */
export const LAB_RULES = {
  /** A Payoff's reaction hit deals plain x this (R7). The pair Setter + Payoff should clearly beat two plain hitters, not double them. */
  payoffMultBp: 20_000,
  /** Each stack beyond the first that an effect spends adds this share of the bonus (R7). */
  extraStackBp: 5_000,
  /** All reaction-bonus factors together (Knack factor, extra counts, Baked Shell) never pass this (R7). */
  maxBonusFactorBp: 30_000,
  /** A mark holds at most this many counts (R3). */
  maxStacks: 3,
  /** Dodge chance per point of Speed, the cap, and the share against area hits (R1). */
  dodgePerSpdBp: 10,
  dodgeMaxBp: 5_000,
  areaDodgeShareBp: 5_000,
  /** Crits on creature hits and heals. */
  critChanceBp: 500,
  critBp: 15_000,
  /** A Guard covers area hits on creatures in its reach (4.3, kept). Cover with every bonus is one cut among the others (`cutMaxBp`). */
  coverBp: 4_000,
  /** Every cut one hit gets (auras, cover, Long Shadow's intercept cut, Front-liner, Brace, ...) multiplies together; the total cut never passes this, and it comes off before armour (panel 3). */
  cutMaxBp: 7_500,
  guardReach: 1,
  /** Support round-start verbs (4.5, kept): boost on the next hit, and the elements that heal. */
  supportBoostBp: 1_500,
  supportBoostEmberBp: 2_500,
  supportHealBp: { tide: 400, grove: 600 } as Record<string, number>,
  /** Buffs and debuffs: all hit bonuses from buffs together never pass this (R15). */
  maxHitBonusBp: 15_000,
  /** A Flank Guard's one side covers this many times the slots of its Reach. */
  flankGuardSlots: 2,
  /** Opportunist: a mark with at least this many counts. */
  opportunistFromStacks: 2,
  /** Mired, the Mire debuff: per stack, the boss deals less damage and dodges less. */
  miredPerStackBp: 150,
  /** With Clinging on a living creature each stack counts for this much instead (reworked 2026-10-28). */
  miredClingingStackBp: 225,
  miredMaxStacks: 5,
  /** Mired fades: one stack at the end of every second round; with Clinging on a living creature, never (panel 3, reworked 2026-10-28). */
  miredFadeEvery: 2,
  /** While a living creature has Clinging, Mired fades only every this many rounds. */
  miredClingingFadeEvery: 3,
  /** Stubborn (Hold On): once per fight (a raid: once per weekend), a hit that would knock it out leaves it at the lower of this share of its Max HP and its HP before the hit (never a heal). */
  holdOnLeaveBp: 4_000,
  /** Element Resistance: the resisted element's creatures' hits start from this share of their base damage (a quarter less; counters are not cut). */
  adaptElementBp: 7_500,
  /** Mired slows the boss's escalation (R22): each stack raises the units the next step needs by this share of a step's units. */
  miredSlowsEscalationBp: 2_500,
  /** "The boss is low" for Finisher: its HP is below this share of its full HP. */
  finisherBelowBp: 3_333,
} as const;

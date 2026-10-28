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
  /** Base armour (flat, per hit) by role, and the boss's. A hit at or below armour is Blocked (R13). */
  armourByRole: { setter: 8, payoff: 8, guard: 30, support: 6 } as Record<string, number>,
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
  /** Mired, the Mire debuff: per stack, the boss deals less damage and dodges less. */
  miredPerStackBp: 300,
  miredMaxStacks: 5,
  /** Mired fades: one stack at the end of every second round; with Clinging on a living creature, of every third (panel 3). */
  miredFadeEvery: 2,
  miredClingingFadeEvery: 3,
  /** "The boss is low" for Finisher: its HP is below this share of its full HP. */
  finisherBelowBp: 3_333,
} as const;

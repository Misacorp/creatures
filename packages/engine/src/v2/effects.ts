/**
 * The effect vocabulary of combat v2: what a creature's Knack and talents are, as data (`KnackFx`), and how effects merge. A
 * fighter carries its effects already merged (`FighterSpec.fxAll`, and `fxStat` for what silence leaves); the engine never looks a
 * Knack or talent up by name, so the content that builds them (the lab's catalogue now, the game's data in phase 3) stays outside.
 *
 * Naming rule (principle 8): the same effect keeps the same name wherever it appears (another species, a gear piece). A different
 * effect gets a different name.
 */

export interface KnackFx {
  /** Guard reach +n slots on each side. */
  readonly reachBonus?: number;
  /** The boss's plain attack aims at this creature (R9). */
  readonly taunt?: boolean;
  readonly armourBonus?: number;
  readonly dodgeBonusBp?: number;
  /** Its own hit deals no damage (it still marks). */
  readonly noDamage?: boolean;
  /** Its own plain hit is scaled by this (bp). */
  readonly plainBp?: number;
  /** Hits twice, each at this share; each hit can set off a reaction. */
  readonly twinStrikeBp?: number;
  /** When it marks, it leaves this many stacks (default 1). */
  readonly markStacks?: number;
  /** When it marks, every other mark on the boss also gains a stack. */
  readonly markOthers?: boolean;
  /** A non-Setter that marks: its own element, or the element its hits can cash. */
  readonly marksAs?: 'own' | 'cashable';
  /** Its marks are not shed by the boss (Seal). */
  readonly seal?: boolean;
  /** After it marks, the next creature to act in its row gets this boost (bp). */
  readonly leadBoostBp?: number;
  /**
   * After it leaves a mark, the boss cannot dodge the next creature to act in its row this round (Pin Down). A flag cleared at
   * every round start, so several copies do not stack.
   */
  readonly leadUndodge?: boolean;
  /** Payoff: spend every stack of the mark; each extra stack adds this share of the bonus. */
  readonly spendAllBp?: number;
  /**
   * Payoff: a hit cap holds its plain hit and its reaction bonus apart (each is held to the cap on its own), and the bonus is its own
   * number on the board (Aftershock).
   */
  readonly splitBonus?: boolean;
  /**
   * The first time the boss sheds a mark in a round, it strikes back for this share of its Attack: a counter (ignores armour, dodge
   * and the hit cap), once a round per creature whatever the number of marks or boss turns (Backlash).
   */
  readonly backlashBp?: number;
  /** Payoff: its reaction bonus is scaled by this (bp) before stacks count. */
  readonly bonusBp?: number;
  /** Payoff: sets off a reaction only when the mark has at least this many stacks. */
  readonly minStacks?: number;
  /** After it sets off a reaction, it leaves one stack of its own element's mark (allowed by an effect, R4). */
  readonly trail?: boolean;
  /** A reaction on a mark of its element heals the creature that set it off (share of max HP). */
  readonly healOnReactionBp?: number;
  /**
   * Gear (Hollow Weave, three pieces): it heals itself by this share of its max HP whenever it sets off a reaction. A heal of its own,
   * so it adds to Returning Tide's (`healOnReactionBp`) instead of replacing it.
   */
  readonly healOnCashBp?: number;
  /**
   * Gear (Ridge Copper, three pieces): after its reaction it leaves one stack of its own element's mark, like Leave a Trail. A wearer
   * whose Knack is Leave a Trail (`trail`) leaves two. Its own field, so the engine can tell the set's trail from the Knack's.
   */
  readonly trailSet?: boolean;
  /**
   * Gear (Hearth Helpers, three pieces): its boost also lands on the creatures two slots away. A wearer whose Knack is Wide Embrace
   * (`support: 'wideWarmth'`) reaches three slots out. Nobody is boosted twice.
   */
  readonly boostReachSet?: boolean;
  /**
   * Gear (First Footprints, three pieces), Deep Tracks: the marks it leaves can stack past the cap, one more for each living creature
   * on the team that has this effect (silence blanks it). A reaction that spends more than the cap's stacks raises the bonus cap too
   * (`RulesV2.overstackCapPerStackBp`).
   */
  readonly deepTracks?: boolean;
  /** When it dodges, it hits back for this share of its Attack (Retaliate). */
  readonly retaliateBp?: number;
  /** Store: +1 per dodge; at 3, its next mark gains this many extra stacks and spends all. */
  readonly storeDodgeStacks?: number;
  /** A Guard that does not intercept (the price of marking like a Setter, P-02). */
  readonly noIntercept?: boolean;
  /** Intercepts area hits too, after the target's failed dodge, and takes them with its own cover's cut (Take It All). */
  readonly interceptArea?: boolean;
  /** Night Watch: the hit it takes is cut by this much (bp), when that is more than its cover's cut. */
  readonly watchCutBp?: number;
  /** Night Watch: takes the first Charged hit each boss turn aimed at a creature in its row, with its own cover's cut. */
  readonly interceptCharged?: boolean;
  /** When it intercepts a hit, it leaves two stacks of its own element's mark (at most once a round). */
  readonly primeOnIntercept?: boolean;
  /** While it stands, its row takes this much less from area hits and charged landings. */
  readonly rowAreaCutBp?: number;
  /** Store: +1 when it or a creature in its reach takes damage; at 3, the next reaction beside it deals double bonus. */
  readonly bakedShell?: boolean;
  /** Hits by creatures beside it ignore this share of the boss's armour. */
  readonly pierceBesideBp?: number;
  /** Its own hits ignore this share of the boss's armour. */
  readonly pierceOwnBp?: number;
  /** Support verbs replaced or reshaped at round start. */
  readonly support?:
    | 'wideWarmth'
    | 'sunbeam'
    | 'curlUp'
    | 'readyMark'
    | 'clearSkies'
    | 'clearAir'
    | 'gatherCalm'
    | 'rowRain'
    | 'rowBoost';
  /** Creatures beside it get this much dodge (an aura). */
  readonly besideDodgeBp?: number;
  /** Every creature in its row gets this much dodge (an aura). */
  readonly rowDodgeBp?: number;
  /** Its hits deal this much more while a living Guard stands beside it. */
  readonly besideGuardBp?: number;
  /** Its hits deal this much more while no other living Payoff stands beside it. */
  readonly alonePayoffBp?: number;
  /** Creatures beside it take this much less from area hits. */
  readonly besideAreaCutBp?: number;
  /** A non-Guard that intercepts aimed hits for the creatures beside it, when no Guard can (R1.3). */
  readonly interceptLikeGuard?: boolean;
  /** Creatures beside it cannot be silenced. */
  readonly besideNoSilence?: boolean;
  /** At round start it heals the creatures in its reach by this share of their max HP. */
  readonly guardMendBp?: number;
  // Talent lines (talents use the same grammar; numbers add, flags combine).
  /** Its Attack is this much higher. */
  readonly atkBp?: number;
  /** Added to its crit chance. */
  readonly critChanceBp?: number;
  /** A crit on a hit that sets off a reaction deals this much more. */
  readonly reactionCritBp?: number;
  /** Its first hit that lands each fight (each raid stage) deals this much more. */
  readonly firstHitBp?: number;
  /** Once per fight, when a hit drops it below half its max HP, it heals this share of its max HP. */
  readonly secondWindBp?: number;
  /** Max HP this much higher (set when the fight starts). */
  readonly hpBp?: number;
  /** A crit deals this much more on top of the base crit. */
  readonly critDamageBp?: number;
  /** After it dodges: +1 Sure Crit. A Sure Crit is spent on its next hit that lands, a guaranteed crit that deals this much more (Perfect Timing). */
  readonly dodgeCritBp?: number;
  /** Each time the hits it intercepts add up to `guardSureCritShareBp` of its Max HP: +1 Sure Crit, spent like Perfect Timing's; the guaranteed crit deals this much more (Easily Provoked). */
  readonly guardCritBp?: number;
  /** Crits on it, and on the creatures beside it, deal this much less extra damage (an aura: the largest applies). */
  readonly critWardBp?: number;
  /** Each crit its ward spares stores a Sure Crit on the creature the crit was aimed at (Cool Head). */
  readonly critWardSure?: boolean;
  /** Its hits deal this much more while it is below half its max HP. */
  readonly lowHpAtkBp?: number;
  /** It takes this much less from area hits and charged landings (its own; adds to an aura). */
  readonly areaCutBp?: number;
  /** Once per fight (a raid: per weekend), a hit that would knock it out leaves it at the lower of two fifths of its max HP and its HP before the hit. */
  readonly holdOn?: boolean;
  /** Its reaction bonus factor is this much higher (inside the cap, R7). */
  readonly reactionBonusBp?: number;
  /** Added to its dodge against area hits (after the half chance). */
  readonly areaDodgeBp?: number;
  /** It cannot be silenced. */
  readonly ignoreSilence?: boolean;
  /** A Guard's cover is this much stronger. */
  readonly coverBonusBp?: number;
  /** A Support's boost is this much stronger. */
  readonly boostBonusBp?: number;
  /** A Support's heal is this much stronger (a Support of any element heals with it). */
  readonly mendBonusBp?: number;
  /** Healing it receives is this much stronger. */
  readonly healReceivedBp?: number;
  /** Mire: each hit it takes puts a Mired stack on the boss. */
  readonly miresOnHit?: boolean;
  /** Mire: at round start the boss gains a Mired stack. */
  readonly miresAtStart?: boolean;
  // Talent library, first batch (docs/design/combat/modifiers.md). Numbers add, flags combine.
  /** Its hits deal this much more for each neighbour of its own element, at most two. */
  readonly perKindredBesideBp?: number;
  /** Its hits deal this much more while no creature beside it shares its element (also with nobody beside it). */
  readonly oddOneOutBp?: number;
  /** Its hits deal this much more while it stands in a row end slot (column 0 or the last column of the arena's row). */
  readonly rowEndBp?: number;
  /** It takes this much less from every hit while it stands in the front row. */
  readonly frontCutBp?: number;
  /** Its hits deal this much more for each round from round 2, up to `slowBurnCapBp`. */
  readonly slowBurnBp?: number;
  readonly slowBurnCapBp?: number;
  /** Its hits deal this much more while the boss is below a third of its HP. */
  readonly finisherBp?: number;
  /** Every third hit it makes is a crit. */
  readonly steadyRhythm?: boolean;
  /** Its reaction bonus factor is this much higher when it cashes a mark with `opportunistFromStacks` counts or more. */
  readonly cashHighBp?: number;
  /** Its reaction bonus factor is this much higher on a mark set this boss turn. */
  readonly freshMarkBp?: number;
  /** A reaction on a mark this creature helped leave has its bonus factor this much higher. */
  readonly ownMarkBp?: number;
  /** Its first mark each fight leaves this many extra counts. */
  readonly firstMarkExtra?: number;
  /** After a creature beside it is knocked out, its hits deal this much more for the rest of the fight. */
  readonly vengefulBp?: number;
  /** After it dodges, its next hit deals this much more. */
  readonly momentumBp?: number;
  /** A Guard's reach covers only its longer side (more slots to the row end; ties go left), with twice the slots. */
  readonly flankGuard?: boolean;
  /** A Guard's cover, and the cut on hits it intercepts, grow by this much per slot of distance. */
  readonly distanceCoverBp?: number;
  /** When it intercepts, it hits back for this share of its Attack, ignoring armour. */
  readonly interceptHitBackBp?: number;
  /** It takes this much less from a Charged landing aimed at its slot. */
  readonly braceBp?: number;
  /** Its Mired has this chance (bp) to add 1 extra stack each time. */
  readonly miredExtraBp?: number;
  /** While it stands, the boss's Mired fades only every `miredClingingFadeEvery` rounds and each stack counts for half as much again. */
  readonly clinging?: boolean;
  /** Every second time its Support verb runs, its boost is doubled. */
  readonly brightBoost?: boolean;
  /** Its boost is this much bigger on creatures of its own element. */
  readonly kindredBoostBp?: number;
  /** Its base heal goes to the most hurt creature beside it, this much bigger (idle under a Support shape Knack). */
  readonly triageBp?: number;
  /** Healing of its that goes past full HP passes to the most hurt creature beside the one it healed. */
  readonly spillOver?: boolean;
  /** A hit that leaves a foe below this share of its full HP defeats it outright (the HP left is the killing blow, not damage). */
  readonly cullBp?: number;
  // Gear lines, batch A (docs/design/combat/gear-plan.md, slice 3): cuts and conditions. Gear only; numbers add.
  /** It takes this much less from every hit (inside the 75% cut cap). */
  readonly takenCutBp?: number;
  /** It takes this much less from aimed hits (the plain attack and aimed moves; not area or charged landings). */
  readonly aimedCutBp?: number;
  /** It takes this much less from a hit the boss's reflected reaction bounces back at it. */
  readonly reflectedCutBp?: number;
  /** While it is at a quarter of its max HP or less, it takes this much less from every hit. */
  readonly lastStandCutBp?: number;
  /** Its hits deal this much more to a boss of the element (by element id; the elements the line's own element beats). */
  readonly vsElementBp?: Record<string, number>;
  /** It takes this much less from a boss of the element (by element id; the elements that beat the line's own element). */
  readonly fromElementCutBp?: Record<string, number>;
  /** Its hit that leaves a mark (no reaction fires, and it marks) deals this much more. */
  readonly markingHitBp?: number;
  /** Its hit on a boss that carries a mark deals this much more when it sets off no reaction. */
  readonly markedFoeBp?: number;
  /** Its hits deal this much more while a living creature of the role stands beside it (by role id). */
  readonly besideRoleBp?: Record<string, number>;
  /** A Guard's reach is this many slots longer on its left (negative: shorter); the reach never goes below 0. */
  readonly reachLeftBonus?: number;
  /** A Guard's reach is this many slots longer on its right (negative: shorter). */
  readonly reachRightBonus?: number;
  /** A Guard's cover on it is this much stronger (added to the cover's cut). */
  readonly shelterBp?: number;
  /** Added to its crit chance on a hit that sets off a reaction. */
  readonly keenReactionBp?: number;
  /** Added to its crit chance while it stands in the back row of an arena with more than one row. */
  readonly backRowCritBp?: number;
  /** Its max HP is this much higher while it stands in the middle of its row (not a row end; set when the fight starts). */
  readonly heartHpBp?: number;
  /** Its reaction bonus factor is this much higher while its row holds creatures of four elements or more. */
  readonly fourWindsBp?: number;
  /** The boss's Element Resistance and Reaction Resistance weigh this much less on its hits. */
  readonly adaptPierceBp?: number;
  // Gear lines, batch B (slice 4): triggers, auras and three-piece set effects. Gear only; numbers add, flags combine.
  /** After it takes a hit for a neighbour, its next hit deals this much more (once a boss turn). */
  readonly paybackBp?: number;
  /** After a crit that lands, its next hit deals this much more. */
  readonly emberTailBp?: number;
  /** After it sets off a reaction, the next creature to act has its hit boosted by this much (once a turn). */
  readonly overflowBp?: number;
  /** When it dodges, the strongest creature beside it has its next hit boosted by this much (once a boss turn). */
  readonly slipstreamBp?: number;
  /** The chance (bp) that a hit of its that lands hits again for `GEAR_SHARES.echoBp` of the plain hit; the echo sets off no reaction. */
  readonly echoChanceBp?: number;
  /** The chance (bp) at each round start that it heals `GEAR_SHARES.windHealBp` of its max HP (Second Wind, the gear line; not Catch Breath). */
  readonly windChanceBp?: number;
  /** Round 1: the creatures beside it have their first hit boosted by this much. */
  readonly kindlingBp?: number;
  /** When a Support heals it, that Support's next boost is this much bigger (once a round). */
  readonly sharedWarmthBp?: number;
  /** The creatures beside it have their reaction bonus factor this much higher (an aura: the largest applies; inside the cap). */
  readonly sparkShareBp?: number;
  /** The creatures beside it have this much more max HP (an aura: the largest applies; set when the fight starts). */
  readonly lanternBp?: number;
  /** Tidepool Finery, three pieces: the first reaction it sets off cannot be reflected. */
  readonly unreflectedFirst?: boolean;
  /** Forge-Warm Kit, three pieces: after it sets off a reaction, its crits deal this much more crit damage for a round (this one and the next). */
  readonly critWindowBp?: number;
  /** Pounce Set, three pieces: the first reaction it sets off is a crit. */
  readonly firstReactionCrit?: boolean;
}

/** The fixed shares of the gear lines whose number is a chance (the line's own number is the chance). One place, so a change is one edit. */
export const GEAR_SHARES = {
  /** Echo: the second hit's share of the plain hit (bp). */
  echoBp: 3_000,
  /** Second Wind (gear): the heal's share of max HP (bp). */
  windHealBp: 500,
} as const;

/**
 * The plain stat lines of a talent or gear line (R12, amended in panel 6): Attack, Max HP, Armour, Speed (as the dodge it gives),
 * crit chance and crit damage. They survive silence; every other effect and the whole Knack (its stat bonuses too) is blanked.
 */
export const STAT_FIELDS: ReadonlySet<keyof KnackFx> = new Set<keyof KnackFx>([
  'atkBp',
  'hpBp',
  'armourBonus',
  'dodgeBonusBp',
  'critChanceBp',
  'critDamageBp',
]);

/**
 * The effect fields worn gear can give (`Placement.gear`; the game's `gearFx` makes them from the lines that have a v2 hook). The
 * resolver gives every creature's effects all of them, so adding gear never changes the shape of the effect object (`uniformFx`).
 * A field a gear line starts to use is added here (a test in the engine checks the game's map against this list).
 */
export const GEAR_FIELDS: readonly (keyof KnackFx)[] = [
  'armourBonus',
  'reachBonus',
  'dodgeBonusBp',
  'areaDodgeBp',
  'retaliateBp',
  'besideGuardBp',
  'areaCutBp',
  'coverBonusBp',
  'boostBonusBp',
  'mendBonusBp',
  'healReceivedBp',
  'reactionBonusBp',
  'firstHitBp',
  'perKindredBesideBp',
  'oddOneOutBp',
  'rowEndBp',
  'frontCutBp',
  'vengefulBp',
  'momentumBp',
  'ownMarkBp',
  'braceBp',
  'miredExtraBp',
  'ignoreSilence',
  'holdOn',
  'clinging',
  'takenCutBp',
  'aimedCutBp',
  'reflectedCutBp',
  'lastStandCutBp',
  'vsElementBp',
  'fromElementCutBp',
  'markingHitBp',
  'markedFoeBp',
  'besideRoleBp',
  'reachLeftBonus',
  'reachRightBonus',
  'shelterBp',
  'keenReactionBp',
  'backRowCritBp',
  'heartHpBp',
  'fourWindsBp',
  'adaptPierceBp',
  'paybackBp',
  'emberTailBp',
  'overflowBp',
  'slipstreamBp',
  'echoChanceBp',
  'windChanceBp',
  'kindlingBp',
  'sharedWarmthBp',
  'sparkShareBp',
  'lanternBp',
  'unreflectedFirst',
  'critWindowBp',
  'firstReactionCrit',
  'healOnCashBp',
  'trailSet',
  'boostReachSet',
  'deepTracks',
];

/**
 * Effect fields whose values add when a Knack and talents combine (a talent may use only these).
 * Numbers add, flags combine (`mergeFx`); a field whose merge is neither is never listed here.
 */
export const ADDITIVE_FIELDS: ReadonlySet<keyof KnackFx> = new Set<keyof KnackFx>([
  'atkBp',
  'dodgeBonusBp',
  'critChanceBp',
  'dodgeCritBp',
  'guardCritBp',
  'reactionCritBp',
  'firstHitBp',
  'ignoreSilence',
  'armourBonus',
  'coverBonusBp',
  'secondWindBp',
  'boostBonusBp',
  'mendBonusBp',
  'hpBp',
  'critDamageBp',
  'lowHpAtkBp',
  'areaCutBp',
  'holdOn',
  'reactionBonusBp',
  'areaDodgeBp',
  // The first batch of the talent library (docs/design/combat/modifiers.md).
  'perKindredBesideBp',
  'oddOneOutBp',
  'rowEndBp',
  'frontCutBp',
  'slowBurnBp',
  'slowBurnCapBp',
  'finisherBp',
  'steadyRhythm',
  'cashHighBp',
  'freshMarkBp',
  'ownMarkBp',
  'firstMarkExtra',
  'vengefulBp',
  'momentumBp',
  'flankGuard',
  'distanceCoverBp',
  'interceptHitBackBp',
  'braceBp',
  'miredExtraBp',
  'clinging',
  'brightBoost',
  'kindredBoostBp',
  'triageBp',
  'spillOver',
  'cullBp',
]);

/** Knack and talent effects together: numbers add, flags combine, a Support shape comes from the Knack. */
export function mergeFx(parts: readonly KnackFx[]): KnackFx {
  const out: Record<string, unknown> = {};
  for (const p of parts) {
    for (const [key, value] of Object.entries(p)) {
      const prev = out[key];
      if (typeof value === 'number') out[key] = (typeof prev === 'number' ? prev : 0) + value;
      else if (typeof value === 'boolean') out[key] = prev === true || value;
      else if (prev === undefined) out[key] = value;
    }
  }
  return out;
}

/**
 * Knacks of the combat v2 draft, as data: a small grammar of effects (`KnackFx`) plus the text a
 * player reads and the design intent for contributors (docs/design/combat-v2.md, "Knacks").
 *
 * Naming rule (principle 8): the same effect keeps the same name wherever it appears (another
 * species, a gear piece). A different effect gets a different name.
 */
import { content } from '@creatures/game';

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
  /** Payoff: spend every stack of the mark; each extra stack adds this share of the bonus. */
  readonly spendAllBp?: number;
  /** Payoff: its reaction bonus is scaled by this (bp) before stacks count. */
  readonly bonusBp?: number;
  /** Payoff: sets off a reaction only when the mark has at least this many stacks. */
  readonly minStacks?: number;
  /** After it sets off a reaction, it leaves one stack of its own element's mark (allowed by an effect, R4). */
  readonly trail?: boolean;
  /** A reaction on a mark of its element heals the creature that set it off (share of max HP). */
  readonly healOnReactionBp?: number;
  /** When it dodges, it hits back for this share of its Attack (Retaliate). */
  readonly retaliateBp?: number;
  /** Store: +1 per dodge; at 3, its next mark gains this many extra stacks and spends all. */
  readonly storeDodgeStacks?: number;
  /** A Guard that does not intercept (the price of marking like a Setter, P-02). */
  readonly noIntercept?: boolean;
  /** Intercepts area hits too, after the target's failed dodge. */
  readonly interceptArea?: boolean;
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
  /** While it stands, the boss's Mired does not fade and each stack counts for half as much again. */
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
}

/** Knack families: one rule with different numbers or elements (grammar.md). A new family needs a reason (P-09). */
export const FAMILIES: Readonly<Record<string, string>> = {
  Seal: 'Its marks are not shed.',
  Lead: 'Boosts the next creature after it marks.',
  'Heavy Prime': 'Gives up its damage for more mark counts (Setters only).',
  'Self Prime': 'A non-Setter that marks what it can cash.',
  'Guard Prime': 'A Guard that marks, at a cost to its Guard role (P-02).',
  'Support Prime': 'A Support that marks instead of its boost and heal.',
  Detonator: 'A Payoff that spends several counts.',
  Chain: 'After a reaction, leaves a mark of its own element.',
  Flurry: 'Several smaller hits.',
  Reach: 'Changes how far a Guard covers.',
  Intercept: 'Changes which hits it takes for others (a non-Guard only when no Guard can).',
  Taunt: 'Draws the plain attack.',
  Evasion: 'Its own dodge, with Retaliate or a Store.',
  'Evasion aura': 'Dodge for the creatures beside it or in its row (the largest aura applies).',
  'Row Ward': 'Cuts area damage for its row or the creatures beside it (the largest applies).',
  Ward: 'Keeps the creatures beside it from being silenced.',
  Pierce: 'Ignores some boss armour.',
  Partner: 'A bonus on its hits while a given role is, or is not, beside it.',
  'Support shape': "Changes where a Support's boost and heal land, or replaces them.",
  Sustain: 'Heals, on a reaction or at round start.',
  Store: 'Fills over the fight, spends at 3.',
  Debuff: 'Puts a debuff on the boss.',
  Signature: "An epic's own twist on a family, on one species only.",
};

export interface KnackDef {
  readonly id: string;
  readonly name: string;
  readonly family: string;
  /** What the player reads (keywords in braces). */
  readonly text: string;
  /** Design intent for contributors and agents: the situation it is for. Never shown to players. */
  readonly intent: string;
  readonly fx: KnackFx;
}

const K = (def: KnackDef): KnackDef => def;

export const KNACKS: Readonly<Record<string, KnackDef>> = Object.fromEntries(
  [
    // Splashet line (Tide Setter)
    K({
      id: 'steady-mark',
      name: 'Steady Mark',
      family: 'Seal',
      text: '{Seal}: its marks are not shed by the boss.',
      intent:
        'Answers bosses that shed marks on their turns (Clean Scales), which matter now that the boss acts after every row.',
      fx: { seal: true },
    }),
    K({
      id: 'lead-the-way',
      name: 'Lead the Way',
      family: 'Lead',
      text: 'After it leaves a mark, the next creature to act in its row gets +20% on that hit.',
      intent: 'Rewards placing the Payoff right after the Setter in a row.',
      fx: { leadBoostBp: 2_000 },
    }),
    K({
      id: 'feed-the-marks',
      name: 'Feed the Marks',
      family: 'Heavy Prime',
      text: 'Its hit deals no damage. It leaves its {Mark} and adds 1 to the count of every other mark on the boss.',
      intent: 'For multi-mark teams and Payoffs that spend several stacks.',
      fx: { noDamage: true, markOthers: true },
    }),
    K({
      id: 'circle-round',
      name: 'Circle Round',
      family: 'Sustain',
      text: 'Each reaction on a Tide mark heals the creature that set it off by 14% of its max HP.',
      intent: 'Keeps Payoffs alive when reactions hurt them (Reflective Hide, Thorns).',
      fx: { healOnReactionBp: 1_400 },
    }),
    // Geyserpup (Tide Payoff, second branch)
    K({
      id: 'puddle-maker',
      name: 'Puddle Maker',
      family: 'Self Prime',
      text: 'When it sets off no {Reaction}, it leaves the mark it can cash, like a Setter.',
      intent: 'A Payoff that works without a Setter, at half the pace.',
      fx: { marksAs: 'cashable' },
    }),
    K({
      id: 'all-at-once',
      name: 'All at Once',
      family: 'Detonator',
      text: 'Cashes only a mark at x3, and {Spend}s all of its count.',
      intent: "Misa's mark-mark-mark-big-payoff choice: a slow, huge hit that breaks armour.",
      fx: { minStacks: 3, spendAllBp: 10_000, bonusBp: 12_500 },
    }),
    K({
      id: 'leave-a-trail',
      name: 'Leave a Trail',
      family: 'Chain',
      text: "After its {Reaction}, it leaves x1 of its own element's mark. A reaction on that mark leaves no further trail.",
      intent: 'Cross-element chains: a reaction primes the next one for another Payoff.',
      fx: { trail: true },
    }),
    // Stormray line (Spark Payoff)
    K({
      id: 'detonate',
      name: 'Detonate',
      family: 'Detonator',
      text: '{Spend}s the whole count of the mark it cashes. Weak on x1, strong on x2 and x3.',
      intent:
        'Pays off two Setters, or a Setter with Heavy Prime; worse than no Knack on a single stack.',
      fx: { spendAllBp: 7_500, bonusBp: 7_500 },
    }),
    K({
      id: 'twin-strike',
      name: 'Twin Strike',
      family: 'Flurry',
      text: 'Hits twice, each for 55%. Each hit can set off a reaction.',
      intent:
        'Weaker in a plain fight; answers bosses that cap single hits or dodge a lot. Poor against armour.',
      fx: { twinStrikeBp: 5_500 },
    }),
    // Halcyray (Spark Support, second branch)
    K({
      id: 'clear-skies',
      name: 'Clear Skies',
      family: 'Support shape',
      text: 'Instead of its boost and heal: the boss cannot dodge the hits of creatures {Beside} it this round.',
      intent: 'Answers Elusive bosses.',
      fx: { support: 'clearSkies' },
    }),
    K({
      id: 'clear-the-air',
      name: 'Clear the Air',
      family: 'Sustain',
      text: 'Creatures beside it that set off a reaction heal 10% and lose their silence.',
      intent: 'Answers Reflective Hide, Thorns and silence on the Payoff.',
      fx: { support: 'clearAir' },
    }),
    K({
      id: 'gather-calm',
      name: 'Gather Calm',
      family: 'Store',
      text: '{Store} Calm: +1 for each reaction anywhere. At round start with 3 Calm, the creatures beside it get +45% and it spends all.',
      intent: 'A reaction-heavy line gets a burst every few rounds.',
      fx: { support: 'gatherCalm' },
    }),
    // Sproutle line (Grove Guard)
    K({
      id: 'wide-reach',
      name: 'Wide Reach',
      family: 'Reach',
      text: 'Its reach is +1 slot on each side.',
      intent: 'Protects fragile creatures two slots away; strong in wide raid rows.',
      fx: { reachBonus: 1 },
    }),
    K({
      id: 'primed-by-pain',
      name: 'Primed by Pain',
      family: 'Guard Prime',
      text: "Each time it {Intercept}s, it leaves x2 of its own element's mark. Once a round.",
      intent:
        'A Guard that marks by taking hits (panel 5: once a fight, and one count, was too little to build a team on): an Ember Payoff gets its reaction while the Setter slot becomes another hitter.',
      fx: { primeOnIntercept: true },
    }),
    K({
      id: 'night-watch',
      name: 'Night Watch',
      family: 'Intercept',
      text: "Each boss turn it {Intercept}s the first {Wind-up} hit on a creature in its row, and takes it with its cover's cut.",
      intent:
        'Answers telegraphed big hits (Great Wave, Judgement Bolt). One hit a boss turn, and the hit it takes is cut by its own cover, so it is no longer a liability (panel 4).',
      fx: { interceptCharged: true },
    }),
    // Sunfawn (Grove Support, second branch)
    K({
      id: 'sunbeam',
      name: 'Sunbeam',
      family: 'Support shape',
      text: 'Instead of the creatures beside it, it heals and boosts every creature in front of it in its column.',
      intent:
        'Uses the whole board: healers belong at the back. Bosses that hit the back row punish it.',
      fx: { support: 'sunbeam' },
    }),
    K({
      id: 'curl-up',
      name: 'Curl Up',
      family: 'Support shape',
      text: 'Its heal on a creature below half HP is tripled.',
      intent: 'For steady damage on a Guard.',
      fx: { support: 'curlUp' },
    }),
    K({
      id: 'ready-the-mark',
      name: 'Ready the Mark',
      family: 'Support Prime',
      text: "Instead of its boost and heal: it adds 1 to its own element's {Mark}.",
      intent: 'Lets a team without a Setter react; needs a Payoff of the right element.',
      fx: { support: 'readyMark' },
    }),
    // Ashmole line (Ember Support)
    K({
      id: 'wide-warmth',
      name: 'Wide Warmth',
      family: 'Support shape',
      text: 'Its boost also reaches one slot further on each side, 10% weaker.',
      intent: 'Wide raid rows with several hitters.',
      fx: { support: 'wideWarmth' },
    }),
    K({
      id: 'tunnel-through',
      name: 'Tunnel Through',
      family: 'Pierce',
      text: "Hits by creatures beside it ignore half the boss's armour.",
      intent: 'Answers armoured bosses for plain hitters.',
      fx: { pierceBesideBp: 5_000 },
    }),
    // Kilnmole (Ember Guard, second branch)
    K({
      id: 'draw-fire',
      name: 'Draw Fire',
      family: 'Taunt',
      text: '{Taunt}. Armour +15.',
      intent: 'Takes the plain attacks off fragile creatures wherever they stand.',
      fx: { taunt: true, armourBonus: 15 },
    }),
    K({
      id: 'keep-the-heat-in',
      name: 'Keep the Heat In',
      family: 'Row Ward',
      text: 'While it stands, its row takes 15% less from area and {Wind-up} hits.',
      intent: "Protects other players' creatures in its row in the raid.",
      fx: { rowAreaCutBp: 1_500 },
    }),
    K({
      id: 'baked-shell',
      name: 'Baked Shell',
      family: 'Store',
      text: '{Store} Heat: +1 at round start and each time it or a creature in its reach takes damage. At 3, the next {Reaction} by a creature beside it deals double bonus.',
      intent: 'A Guard beside a Payoff in a hard fight.',
      fx: { bakedShell: true },
    }),
    // Zipmouse line (Spark Setter)
    K({
      id: 'zoom',
      name: 'Zoom',
      family: 'Evasion',
      text: '+20 dodge. When it dodges, it hits back for 50% of its Attack ({Retaliate}).',
      intent: 'A Setter that survives and adds damage when the boss hits often.',
      fx: { dodgeBonusBp: 2_000, retaliateBp: 5_000 },
    }),
    K({
      id: 'double-mark',
      name: 'Double Mark',
      family: 'Heavy Prime',
      text: 'Its hit deals no damage. It leaves its {Mark} at x2.',
      intent: 'Feeds Detonators and two Payoffs of the trigger element.',
      fx: { noDamage: true, markStacks: 2, marksAs: 'own' },
    }),
    K({
      id: 'zigzag',
      name: 'Zigzag',
      family: 'Evasion',
      text: '{Taunt}, +12 dodge. {Store} Static: +1 per dodge; at 3, its next mark gets +1 to its count.',
      intent: 'A dodge tank beside a Guard (dodge before intercept).',
      fx: { taunt: true, dodgeBonusBp: 1_200, storeDodgeStacks: 1 },
    }),
    K({
      id: 'catch-the-bolts',
      name: 'Catch the Bolts',
      family: 'Intercept',
      text: 'It {Intercept}s area hits too.',
      intent: 'Answers sweeps and splashes.',
      fx: { interceptArea: true },
    }),
    K({
      id: 'lightning-ears',
      name: 'Lightning Ears',
      family: 'Guard Prime',
      text: "It leaves its own element's {Mark} like a Setter, but it does not {Intercept}, and Armour -8.",
      intent:
        "A Setter that survives the front row; it pays with the Guard's verb and its armour (P-02: never a Setter and a Guard in one body).",
      fx: { marksAs: 'own', noIntercept: true, armourBonus: -8 },
    }),
    // Mire lines: the finale-ability passives, ported (they are how Mire applies Mired today)
    K({
      id: 'mud-wall',
      name: 'Mud Wall',
      family: 'Debuff',
      text: 'Each hit it takes, even Blocked, puts {Mired} x1 on the boss.',
      intent: "Keeps Mire's debuff alive after finale abilities go.",
      fx: { miresOnHit: true },
    }),
    K({
      id: 'squelch-song',
      name: 'Squelch Song',
      family: 'Debuff',
      text: 'At round start the boss gains {Mired} x1.',
      intent: "Keeps Mire's debuff alive after finale abilities go.",
      fx: { miresAtStart: true },
    }),
    // Remaining lines (phase 1, slice 2). Shared families keep their names (P-06).
    K({
      id: 'guards-shadow',
      name: "Guard's Shadow",
      family: 'Partner',
      text: '+25% on its hits while a living Guard stands beside it.',
      intent:
        "A Payoff that wants a Guard partner, ideally another player's in the raid. The same name as the gear line with the same effect.",
      fx: { besideGuardBp: 2_500 },
    }),
    K({
      id: 'crown-of-embers',
      name: 'Crown of Embers',
      family: 'Signature',
      text: 'Each {Mark} it leaves adds 2 to the count, and its hit still deals damage.',
      intent:
        "Solmane's signature: an epic Setter that feeds Detonators without giving up its damage.",
      fx: { markStacks: 2 },
    }),
    K({
      id: 'hide-in-mist',
      name: 'Hide in Mist',
      family: 'Evasion aura',
      text: 'Creatures beside it get +15 dodge.',
      intent:
        'A Guard that protects by hiding friends; strong with dodge-before-intercept (R1) when the boss hits often.',
      fx: { besideDodgeBp: 1_500 },
    }),
    K({
      id: 'thick-fog',
      name: 'Thick Fog',
      family: 'Evasion aura',
      text: 'Every creature in its row gets +8 dodge.',
      intent: 'The wide version for long raid rows.',
      fx: { rowDodgeBp: 800 },
    }),
    K({
      id: 'drizzle',
      name: 'Drizzle',
      family: 'Support shape',
      text: 'Instead of its boost and heal: it heals every creature in its row (itself too) by 5% of max HP.',
      intent: 'A row healer for long raid rows and steady damage.',
      fx: { support: 'rowRain' },
    }),
    K({
      id: 'living-shelter',
      name: 'Living Shelter',
      family: 'Row Ward',
      text: 'Creatures beside it take 25% less from {Area hit}s.',
      intent:
        'Ancientshell hosts small creatures: a Setter that shelters its neighbours from sweeps.',
      fx: { besideAreaCutBp: 2_500 },
    }),
    K({
      id: 'territorial',
      name: 'Territorial',
      family: 'Partner',
      text: '+30% on its hits while no other living Payoff stands beside it.',
      intent:
        'Coralynx guards its reef alone: a placement question its owner controls (beside, not the whole row, so other players cannot switch it off).',
      fx: { alonePayoffBp: 3_000 },
    }),
    K({
      id: 'carry-them',
      name: 'Carry Them',
      family: 'Intercept',
      text: '{Intercept}s aimed hits for the creatures {Beside} it when no Guard can. Reaction bonus -25%.',
      intent:
        "Gaiadrake protects everything it carries: a Payoff borrowing the Guard's verb at a cost (P-02).",
      fx: { interceptLikeGuard: true, bonusBp: 7_500 },
    }),
    K({
      id: 'starlight',
      name: 'Starlight',
      family: 'Support shape',
      text: 'Instead of its boost and heal: it {Boost}s every other creature in its row by 10%.',
      intent: 'Aurorix looks after friends from a distance: a row-wide boost for long raid rows.',
      fx: { support: 'rowBoost' },
    }),
    K({
      id: 'lantern-glow',
      name: 'Lantern Glow',
      family: 'Ward',
      text: 'Creatures beside it cannot be {Silenced}.',
      intent:
        'Lanternfin guides friends through the dark: the silence answer that protects others.',
      fx: { besideNoSilence: true },
    }),
    K({
      id: 'hearth',
      name: 'Hearth',
      family: 'Sustain',
      text: 'At round start it heals the creatures in its {Reach} by 6% of max HP.',
      intent:
        'Hearthshell hosts friends around its fire: a Guard that heals the creatures it protects.',
      fx: { guardMendBp: 600 },
    }),
  ].map((k) => [k.id, k]),
);

/** The Knacks that reshape or replace a Support's base verb (family "Support shape"). */
export const SUPPORT_SHAPE_KNACKS: ReadonlySet<string> = new Set(
  Object.values(KNACKS)
    .filter((k) => k.family === 'Support shape')
    .map((k) => k.id),
);

/**
 * The Knacks each form brings of its own (R11, Misa 2026-10-27). A creature knows them from the
 * moment it is caught; evolving adds the new form's own Knacks to the ones it knew, if the role stays
 * (a role change keeps only the new form's, since the old role's Knacks would do nothing).
 */
export const OWN_KNACKS: Readonly<Record<string, readonly string[]>> = {
  splashet: ['steady-mark', 'lead-the-way'],
  tidewing: ['double-mark', 'circle-round'],
  geyserpup: ['leave-a-trail', 'puddle-maker', 'all-at-once'],
  stormray: ['detonate', 'leave-a-trail'],
  tempestray: ['twin-strike'],
  halcyray: ['clear-skies', 'clear-the-air', 'gather-calm'],
  sproutle: ['wide-reach', 'primed-by-pain'],
  thornbuck: ['night-watch'],
  sunfawn: ['sunbeam', 'curl-up', 'ready-the-mark'],
  ashmole: ['wide-warmth', 'ready-the-mark'],
  magmole: ['tunnel-through'],
  kilnmole: ['draw-fire', 'keep-the-heat-in', 'baked-shell'],
  zipmouse: ['zoom', 'double-mark'],
  voltaro: ['zigzag'],
  ohmouse: ['catch-the-bolts', 'lightning-ears'],
  cindle: ['detonate', 'leave-a-trail'],
  pyrelynx: ['guards-shadow'],
  wickat: ['lead-the-way', 'steady-mark', 'double-mark'],
  mistnewt: ['wide-reach', 'hide-in-mist'],
  fogwyrm: ['thick-fog'],
  drizzlewt: ['drizzle', 'curl-up', 'clear-the-air'],
  mossback: ['steady-mark', 'feed-the-marks'],
  ancientshell: ['living-shelter'],
  bloomback: ['all-at-once', 'detonate', 'leave-a-trail'],
  coralynx: ['detonate', 'leave-a-trail', 'territorial'],
  solmane: ['lead-the-way', 'steady-mark', 'crown-of-embers'],
  gaiadrake: ['detonate', 'leave-a-trail', 'carry-them'],
  aurorix: ['starlight', 'clear-skies', 'gather-calm'],
  lanternfin: ['lantern-glow', 'clear-the-air', 'sunbeam'],
  hearthshell: ['draw-fire', 'keep-the-heat-in', 'hearth'],
  mudlump: ['mud-wall', 'wide-reach'],
  bogwarden: ['draw-fire'],
  squelch: ['squelch-song', 'ready-the-mark'],
  croakmire: ['wide-warmth'],
};

/** The form a stage 2 form evolves from (its line's stage 1 form), if any. */
export function evolvesFrom(form: string): string | undefined {
  const c = content.creatures.find((x) => x.id === form);
  if (!c || c.stage < 2) return undefined;
  return content.creatures.find((x) => x.line === c.line && x.stage === c.stage - 1)?.id;
}

/** Every Knack a form knows: what it knew before evolving (if the role stayed), then its own (R11). */
export function knacksOf(form: string): string[] {
  const own = OWN_KNACKS[form] ?? [];
  const parent = evolvesFrom(form);
  const role = content.creatures.find((x) => x.id === form)?.role;
  const kept =
    parent !== undefined && content.creatures.find((x) => x.id === parent)?.role === role
      ? knacksOf(parent)
      : [];
  return [...new Set([...kept, ...own])];
}

/** The Knacks each form can equip (R11): worked out from `OWN_KNACKS` and the evolution line. */
export const FORM_KNACKS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  Object.keys(OWN_KNACKS).map((f) => [f, knacksOf(f)]),
);

export function knack(id: string | undefined): KnackDef | undefined {
  return id === undefined ? undefined : KNACKS[id];
}

/**
 * Knacks of the combat v2 draft, as data: a small grammar of effects (`KnackFx`) plus the text a
 * player reads and the design intent for contributors (docs/design/combat-v2.md, "Knacks").
 *
 * Naming rule (principle 8): the same effect keeps the same name wherever it appears (another
 * species, a gear piece). A different effect gets a different name.
 */
export interface KnackFx {
  /** Guard reach +n on each side. */
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
  /** Intercepts every charged landing aimed at a creature in its row. */
  readonly interceptCharged?: boolean;
  /** The first time it intercepts each fight, it leaves one stack of its own element's mark. */
  readonly primeOnFirstIntercept?: boolean;
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
  /** Its hits deal this much more while no other living Payoff stands in its row. */
  readonly alonePayoffBp?: number;
  /** Creatures beside it take this much less from area hits. */
  readonly besideAreaCutBp?: number;
  /** A non-Guard that intercepts aimed hits for the creatures beside it, like a Guard. */
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
  /** Its first turn hit each fight deals this much more. */
  readonly firstHitBp?: number;
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
}

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
      text: 'Each reaction on a Tide mark heals the creature that set it off by 8% of its max HP.',
      intent: 'Keeps Payoffs alive when reactions hurt them (Reflective Hide, Thorns).',
      fx: { healOnReactionBp: 800 },
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
      text: 'Cashes only a mark at x2 or more, and {Spend}s all of its count. Huge on x3.',
      intent: "Misa's mark-mark-mark-big-payoff choice: a slow, huge hit that breaks armour.",
      fx: { minStacks: 2, spendAllBp: 10_000, bonusBp: 12_500 },
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
      text: 'Instead of boosting, the boss cannot dodge the hits of creatures beside it this round.',
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
      text: 'Its reach is +1 on each side.',
      intent: 'Protects fragile creatures two places away; strong in wide raid rows.',
      fx: { reachBonus: 1 },
    }),
    K({
      id: 'primed-by-pain',
      name: 'Primed by Pain',
      family: 'Guard Prime',
      text: "The first time it {Intercept}s each fight, it leaves x1 of its own element's mark.",
      intent: 'A Guard that helps prime for an Ember Payoff when no Grove Setter is around.',
      fx: { primeOnFirstIntercept: true },
    }),
    K({
      id: 'night-watch',
      name: 'Night Watch',
      family: 'Intercept',
      text: 'It {Intercept}s every {Charged} hit on a creature in its row.',
      intent: 'Answers telegraphed big hits (Great Wave).',
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
      text: "Instead of boosting and healing, at round start it adds x1 to its own element's mark.",
      intent: 'Lets a team without a Setter react; needs a Payoff of the right element.',
      fx: { support: 'readyMark' },
    }),
    // Ashmole line (Ember Support)
    K({
      id: 'wide-warmth',
      name: 'Wide Warmth',
      family: 'Support shape',
      text: 'Its boost also reaches one place further on each side, 10 points weaker.',
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
      text: 'While it stands, its row takes 15% less from area and {Charged} hits.',
      intent: "Protects other players' creatures in its row in the raid.",
      fx: { rowAreaCutBp: 1_500 },
    }),
    K({
      id: 'baked-shell',
      name: 'Baked Shell',
      family: 'Store',
      text: '{Store} Heat: +1 each time it or a creature in its reach takes damage. At 3, the next {Reaction} by a creature beside it deals double bonus.',
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
      text: '{Taunt}, +20 dodge. {Store} Static: +1 per dodge; at 3, its next mark gets +2 to its count.',
      intent: 'A dodge tank beside a Guard (dodge before intercept).',
      fx: { taunt: true, dodgeBonusBp: 2_000, storeDodgeStacks: 2 },
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
      text: "It leaves its own element's {Mark} like a Setter, but it does not {Intercept}.",
      intent: 'A Setter that survives the front row.',
      fx: { marksAs: 'own', noIntercept: true },
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
      family: 'Shadow',
      text: '+25% on its hits while a living Guard stands beside it.',
      intent:
        "A Payoff that wants a Guard partner, ideally another player's in the raid. The same name as the gear line with the same effect.",
      fx: { besideGuardBp: 2_500 },
    }),
    K({
      id: 'crown-of-embers',
      name: 'Crown of Embers',
      family: 'Signature',
      text: 'Its {Mark} starts at x2, and it still hits.',
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
      text: 'Instead of boosting, at round start it heals every creature in its row by 3%.',
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
      family: 'Signature',
      text: '+30% on its hits while no other Payoff stands in its row.',
      intent:
        'Coralynx guards its reef alone: it wants a row to itself, a placement question in the raid.',
      fx: { alonePayoffBp: 3_000 },
    }),
    K({
      id: 'carry-them',
      name: 'Carry Them',
      family: 'Intercept (borrowed)',
      text: 'It {Intercept}s aimed hits for the creatures beside it, like a Guard. Its reaction bonus is 25% smaller.',
      intent:
        "Gaiadrake protects everything it carries: a Payoff borrowing the Guard's verb at a cost (P-02).",
      fx: { interceptLikeGuard: true, bonusBp: 7_500 },
    }),
    K({
      id: 'starlight',
      name: 'Starlight',
      family: 'Support shape',
      text: 'It {Boost}s every creature in its row, 5 points weaker, and heals no one.',
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
      family: 'Guard Sustain',
      text: 'At round start it heals the creatures in its {Reach} by 4%.',
      intent:
        'Hearthshell hosts friends around its fire: a Guard that heals the creatures it protects.',
      fx: { guardMendBp: 400 },
    }),
  ].map((k) => [k.id, k]),
);

/** The Knacks each form can equip (first listed is the default for absent players, R11). */
export const FORM_KNACKS: Readonly<Record<string, readonly string[]>> = {
  splashet: ['steady-mark', 'lead-the-way'],
  tidewing: ['steady-mark', 'feed-the-marks', 'circle-round'],
  geyserpup: ['leave-a-trail', 'puddle-maker', 'all-at-once'],
  stormray: ['detonate', 'leave-a-trail'],
  tempestray: ['detonate', 'leave-a-trail', 'twin-strike'],
  halcyray: ['clear-skies', 'clear-the-air', 'gather-calm'],
  sproutle: ['wide-reach', 'primed-by-pain'],
  thornbuck: ['wide-reach', 'primed-by-pain', 'night-watch'],
  sunfawn: ['sunbeam', 'curl-up', 'ready-the-mark'],
  ashmole: ['wide-warmth', 'ready-the-mark'],
  magmole: ['wide-warmth', 'ready-the-mark', 'tunnel-through'],
  kilnmole: ['draw-fire', 'keep-the-heat-in', 'baked-shell'],
  zipmouse: ['zoom', 'double-mark'],
  voltaro: ['zoom', 'double-mark', 'zigzag'],
  ohmouse: ['double-mark', 'catch-the-bolts', 'lightning-ears'],
  cindle: ['detonate', 'leave-a-trail'],
  pyrelynx: ['detonate', 'leave-a-trail', 'guards-shadow'],
  wickat: ['lead-the-way', 'steady-mark', 'double-mark'],
  mistnewt: ['wide-reach', 'hide-in-mist'],
  fogwyrm: ['wide-reach', 'hide-in-mist', 'thick-fog'],
  drizzlewt: ['drizzle', 'curl-up', 'clear-the-air'],
  mossback: ['steady-mark', 'feed-the-marks'],
  ancientshell: ['steady-mark', 'feed-the-marks', 'living-shelter'],
  bloomback: ['all-at-once', 'detonate', 'leave-a-trail'],
  coralynx: ['detonate', 'leave-a-trail', 'territorial'],
  solmane: ['lead-the-way', 'steady-mark', 'crown-of-embers'],
  gaiadrake: ['detonate', 'leave-a-trail', 'carry-them'],
  aurorix: ['starlight', 'clear-skies', 'gather-calm'],
  lanternfin: ['lantern-glow', 'clear-the-air', 'sunbeam'],
  hearthshell: ['draw-fire', 'keep-the-heat-in', 'hearth'],
  mudlump: ['mud-wall', 'wide-reach'],
  bogwarden: ['mud-wall', 'wide-reach', 'draw-fire'],
  squelch: ['squelch-song', 'ready-the-mark'],
  croakmire: ['squelch-song', 'ready-the-mark', 'wide-warmth'],
};

export function knack(id: string | undefined): KnackDef | undefined {
  return id === undefined ? undefined : KNACKS[id];
}

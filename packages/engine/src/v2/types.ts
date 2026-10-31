/**
 * The types of the combat v2 fight: its input (`FightInputV2`, `WeekendInputV2`), the creatures it takes (`FighterSpec`) and the state they
 * end in (`Fighter`), the boss (`BossDef`) and the result. A v2 input is whole: it carries the rules numbers, the element chart and
 * every creature resolved, so a stored input replays exactly (docs/design/combat/engine-port.md, section 2).
 */
import type { KnackFx } from './effects';

export type Role = 'setter' | 'payoff' | 'guard' | 'support';

/**
 * One creature as the fight takes it, resolved: its stats at its level, its Knack's and talents' effects merged. The engine never
 * looks a form, Knack or talent up; whatever resolves a creature (the lab now, the game in phase 3) fills this in. Its slot is
 * (row, col): row 0 is the front.
 */
export interface FighterSpec {
  readonly uid: string;
  readonly owner: string;
  readonly formId: string;
  readonly name: string;
  readonly element: string;
  readonly role: Role;
  readonly maxHp: number;
  readonly atk: number;
  readonly spd: number;
  /** Armour before Knacks (a silenced creature loses its Knack's armour). */
  readonly baseArmour: number;
  /** The species' own crit chance (bp over the base) and crit damage (bp over the base crit): stats, so silence does not take them away. */
  readonly critChanceBp: number;
  readonly critDamageBp: number;
  readonly knack?: string | undefined;
  readonly talents: readonly string[];
  /** The Knack's and the talents' effects together (silence blanks all of it but the talents' stat lines, R12). */
  readonly fxAll: KnackFx;
  /** The talents' plain stat lines alone (`STAT_FIELDS`): what a silenced creature keeps (R12). */
  readonly fxStat: KnackFx;
  /**
   * Whether Triage does nothing for this creature: it aims the Support's own base verb, so a Support shape Knack leaves it idle (the
   * resolver knows which Knacks reshape the verb; the fight only reads this flag).
   */
  readonly triageIdle: boolean;
  readonly row: number;
  readonly col: number;
}

/** A creature of a raid weekend's team or bench: a spec without its `uid`, which the weekend gives by slot (`owner:formId:index`, see `weekendV2`). */
export type WeekendFighterSpec = Omit<FighterSpec, 'uid'>;

/** A creature in a fight: its spec and the state the fight changes. */
export interface Fighter extends FighterSpec {
  hp: number;
  /** Hits made unsilenced that got past dodge and armour this fight (First Pounce counts the first). */
  hitsLanded: number;
  /** Catch Breath fired this fight, or earlier in the raid weekend (once per weekend). */
  secondWindDone: boolean;
  /** Hold On (Refuse to Fall) fired this fight, or earlier in the raid weekend (once per weekend). */
  holdOnDone: boolean;
  silencedTurns: number;
  store: number;
  boostBp: number;
  undodgeable: boolean;
  /** The round of the last mark it left by intercepting (Primed by Pain: once a round); 0 for none yet. */
  lastPrimeRound: number;
  damageDealt: number;
  /** Damage its hits dealt to the boss, reactions included, counters not (Element Resistance reads it). */
  hitDamage: number;
  /** The boss turns done when Night Watch last took a Charged hit (it takes the first each boss turn). */
  watchTurn: number;
  damageThisRound: number;
  damageLastRound: number;
  /** The boss turn on which it last gained a reaction-fed Store point (at most one per boss turn). */
  lastStoreRound: number;
  /** Sure Crits it stores (at most `rules.sureCritMax`): each is spent on its next hit that lands, a guaranteed crit (Perfect Timing, Easily Provoked). */
  sureCrits: number;
  /** Damage it has taken from hits it intercepted since its last Sure Crit from them (Easily Provoked). */
  guardTaken: number;
  /** Hits it has landed this fight (past the dodge and the armour), for rhythms (Steady Rhythm: every third is a crit). */
  hitsMade: number;
  /** Set when it dodges unsilenced; its next unsilenced hit uses it up (Momentum). */
  momentum: boolean;
  /** A creature beside it was knocked out this fight while it was not silenced (Rally Cry). */
  avenged: boolean;
  /** Marks it has left this fight (Deep Ink: the first starts bigger). */
  marksLeft: number;
  /** Times its Support verb has run (Bright Boost: every second is doubled). */
  verbsUsed: number;
  /** How often each effect's condition held or its trigger fired this fight, by effect field (the report's "holds"). */
  fires: Record<string, number>;
}

/**
 * The numbers of the combat v2 rules, carried in every input (an input is whole: a rule number is never read from the engine's own
 * constants). Basis points (bp): 10000 is 100%. The lab's starting values are `LAB_RULES` (`packages/lab/src/rules.ts`).
 */
export interface V2Rules {
  /** A Payoff's reaction hit deals plain x this (R7). The pair Setter + Payoff should clearly beat two plain hitters, not double them. */
  readonly payoffMultBp: number;
  /** All reaction-bonus factors together (Knack factor, extra counts, Boiling Point) never pass this (R7). */
  readonly maxBonusFactorBp: number;
  /** A mark holds at most this many counts (R3). */
  readonly maxStacks: number;
  /** Dodge chance per point of Speed, the cap, and the share against area hits (R1). */
  readonly dodgePerSpdBp: number;
  readonly dodgeMaxBp: number;
  readonly areaDodgeShareBp: number;
  /** Crits on creature hits and on a boss's hits (R7.1): a crit doubles the hit (Misa, 2026-10-30: luck is a build). Crit damage from talents, Knacks, species and gear adds to the +100%. */
  readonly critChanceBp: number;
  readonly critBp: number;
  /** A heal that crits is 1.5 times: a heal is not a hit, so the doubling rule does not apply, and no crit talent raises it. */
  readonly healCritBp: number;
  /** A creature stores at most this many Sure Crits (the Store limit, R10); each is spent on one hit. */
  readonly sureCritMax: number;
  /** Easily Provoked: a Guard stores a Sure Crit each time the hits it takes for other creatures add up to this share of its Max HP. */
  readonly guardSureCritShareBp: number;
  /** A Guard covers area hits on creatures in its reach (4.3, kept). Cover with every bonus is one cut among the others (`cutMaxBp`). */
  readonly coverBp: number;
  /** Every cut one hit gets (auras, cover, Long Shadow's intercept cut, Front-liner, Brace, ...) multiplies together; the total cut never passes this, and it comes off before armour (panel 3). */
  readonly cutMaxBp: number;
  readonly guardReach: number;
  /** Support round-start verbs (4.5, kept): boost on the next hit, and the elements that heal. */
  readonly supportBoostBp: number;
  readonly supportBoostEmberBp: number;
  readonly supportHealBp: Readonly<Record<string, number>>;
  /** Buffs and debuffs: all hit bonuses from buffs together never pass this (R15). */
  readonly maxHitBonusBp: number;
  /** A Flank Guard's one side covers this many times the slots of its Reach. */
  readonly flankGuardSlots: number;
  /** Opportunist: a mark with at least this many counts. */
  readonly opportunistFromStacks: number;
  /** Mired, the Mire debuff: per stack, the boss deals less damage and dodges less. */
  readonly miredPerStackBp: number;
  /** With Clinging on a living creature each stack counts for this much instead (reworked 2026-10-28). */
  readonly miredClingingStackBp: number;
  readonly miredMaxStacks: number;
  /** Mired fades: one stack at the end of every second round; with Clinging on a living creature, never (panel 3, reworked 2026-10-28). */
  readonly miredFadeEvery: number;
  /** While a living creature has Clinging, Mired fades only every this many rounds. */
  readonly miredClingingFadeEvery: number;
  /** Refuse to Fall (Hold On): once per fight (a raid: once per weekend), a hit that would knock it out leaves it at the lower of this share of its Max HP and its HP before the hit (never a heal). */
  readonly holdOnLeaveBp: number;
  /** Element Resistance: the resisted element's creatures' hits start from this share of their base damage (a quarter less; counters are not cut). */
  readonly adaptElementBp: number;
  /** Mired slows the boss's escalation (R22): each stack raises the units the next step needs by this share of a step's units. */
  readonly miredSlowsEscalationBp: number;
  /** "The boss is low" for Finisher: its HP is below this share of its full HP. */
  readonly finisherBelowBp: number;
}

/** One pair of the element chart: an attacker of `attacker` against a defender of `defender` deals `bp` (10000 is plain; 15000 also cashes a mark). */
export interface ChartPair {
  readonly attacker: string;
  readonly defender: string;
  readonly bp: number;
}

/** Where the boss aims: an anchor slot, then a shape of slots around it (R2). */
export interface Pattern {
  readonly anchor: 'front' | 'strongest' | 'payoff' | 'random' | 'grudge' | 'back' | 'weakest';
  readonly shape:
    | 'single'
    | 'line3'
    | 'row'
    | 'column'
    | 'rowEnds'
    | 'randomRow'
    | 'all'
    | 'scatter'
    | 'chain'
    | 'columns'
    | 'rows'
    | 'cross'
    | 'checker';
  /**
   * rowEnds: how many arena slots from each end of each row (an empty slot is skipped). scatter: how many different
   * creatures are hit. chain: how many jumps after the anchor. columns, rows: how many neighbouring columns or rows.
   */
  readonly n?: number;
  /**
   * `n` is for this many columns of the arena and grows with its width: the count is `n x columns / perColumns`,
   * rounded, at least 1 (a scatter of 4 per 4 columns hits 10 creatures in an arena 10 slots wide). Without it `n` is fixed.
   */
  readonly perColumns?: number;
  /** chain: each jump deals this share (bp) of the hit before it. */
  readonly decayBp?: number;
  /**
   * single, line3, cross: how many different creatures the move is aimed at, each by the same anchor rule (the best match,
   * then the next best). With `perColumns` the count grows with the arena's width, so an aimed hit does not thin out in a
   * wide raid. Default 1.
   */
  readonly anchors?: number;
}

/**
 * Strength (Misa, 2026-10-29): every rule card and every boss gate has a strength from 0 to 10000 bp instead of being on or
 * off, so a card *asks* for a tool at low strength and *requires* it at high strength. 10000 is the full card. The number
 * is read by the engine (`fight.ts`) where it says so below; every default is 10000, so a boss without one is unchanged.
 */
export const FULL_STRENGTH_BP = 10_000;

export interface BossMove {
  readonly id: string;
  readonly name: string;
  readonly pattern: Pattern;
  readonly powerBp: number;
  /** Due in rounds every, 2 x every, ... (and on boss turn `turn` of that round; default the last). */
  readonly every: number;
  readonly turn?: number;
  /** Silences instead of dealing damage, for this many of the victim's turns. */
  readonly silenceTurns?: number;
  /**
   * The gate's strength (bp, default the boss's `strengthBp`). A silence hits that share of the slots it picks (each target
   * rolls) and lasts that share of its turns (at least one); a one-shot (`oneShotBp`) deals that share of the target's Max HP.
   */
  readonly strengthBp?: number;
  /**
   * A one-shot (Judgement Bolt): instead of Attack x power it deals this share (bp) of the target's Max HP at full strength,
   * `strengthBp` of it at a lower one (a heavy hit). Cuts, cover and armour still come off it.
   */
  readonly oneShotBp?: number;
  /**
   * A Charged (Wind-up) move. Every move whose targets use a roll (a random anchor, scatter, a random row) is announced
   * at round start, Charged or not: its slots are rolled and shown, and it lands on those creatures on its boss turn and
   * never re-aims (a creature knocked out by then is skipped). Being Charged only changes how its hits are dodged and
   * intercepted (full-chance dodge; a Guard takes one only through an effect that says so). A Guard takes a Charged hit only through an effect that says so
   * (Night Watch, Intercept area hits too); a Row Ward, Barricade and Brace read it.
   */
  readonly charged?: boolean;
}

/** What fills an escalation (the boss's Store). */
export const ESCALATION_FEEDS = [
  'reactions',
  'hpLost',
  'rounds',
  'crits',
  'dodges',
  'knockouts',
  'shed',
] as const;
export type EscalationFeed = (typeof ESCALATION_FEEDS)[number];

/**
 * What each step of an escalation adds to the boss. Growth adds up in a straight line: step 3 adds three times what step 1 does.
 * A positive number helps the boss and a negative one helps the players (it **falls**): Mired slows the growth that helps the
 * boss, not the one that falls (R22.3), so a boss with both (Thornmother: Attack and jumps up, armour down) gets the falling
 * part on time.
 */
export interface EscalationGrowth {
  /** Attack, in bp of the boss's own. */
  readonly atkBp?: number;
  /** Dodge chance, in bp, on top of its Speed's. */
  readonly dodgeBp?: number;
  /** Flat armour; a negative step lowers it (Thornmother's bark cracks), never below 0. */
  readonly armour?: number;
  /** More plain attacks on each boss turn. */
  readonly hits?: number;
  /** More jumps on every chain move. */
  readonly jumps?: number;
  /** More creatures hit by every scatter move (meteors). */
  readonly targets?: number;
  /** More neighbouring columns or rows on every columns or rows move. */
  readonly area?: number;
}

/**
 * The boss's Store (Misa, 2026-10-28), one rule with data per boss: it fills from a `feed`, every `per` units is a step,
 * it stops at `cap` steps, and each step `grow`s the boss (R22, the escalation rules):
 * - Steps apply only at round start, after the round-start Knacks and before the Charged announcements, at most one step
 *   per round, and each is announced in the log first. An optional `phase` adds moves once the feed has reached `atStep`
 *   steps' worth of units: announced at that round start, applied at the next, and Mired does not slow it (a phase is not a step).
 * - Step, phase and the feed's count carry across a raid weekend's stages like the boss's HP; event feeds keep counting
 *   (`rounds` too: the weekend's rounds, not the stage's).
 * - Mired slows it, it does not freeze it: each Mired stack on the boss at round start raises the units the next step
 *   needs by `rules.miredSlowsEscalationBp` of `per` (a quarter of a step's units per stack). A step that is due but
 *   not yet through the slowed bar comes in a later round, when the Mired has faded.
 * - Feeds: `reactions` it takes, `hpLost` (units are bp of its full HP, the weekend's shared HP in a raid), `rounds`
 *   passed, `crits` it takes, its `dodges`, creatures it `knockouts`, marks it `shed`.
 */
export interface Escalation {
  readonly name: string;
  readonly feed: EscalationFeed;
  readonly per: number;
  /**
   * `per` is for this many columns of the arena and grows with its width (`per x columns / perColumns`, at least 1): a raid
   * of more players feeds an event feed (reactions, crits, dodges, knockouts, marks shed) faster, so it needs more units per
   * step. Not for `hpLost` and `rounds`, which do not grow with the number of creatures.
   */
  readonly perColumns?: number;
  readonly cap: number;
  readonly grow: EscalationGrowth;
  /** Each step grows the boss by this share (bp, default the boss's `strengthBp`) of what `grow` says. */
  readonly strengthBp?: number;
  readonly phase?: {
    /** The phase starts when the feed has `atStep * per` units (announced a round ahead; Mired does not delay it). */
    readonly atStep: number;
    readonly name: string;
    readonly moves: readonly BossMove[];
  };
}

export interface BossDef {
  readonly id: string;
  readonly name: string;
  readonly element: string;
  readonly hp: number;
  readonly atk: number;
  readonly armour: number;
  readonly spd: number;
  readonly rounds: number;
  /** The arena: rows are variable per boss (R8). The boss takes one turn after each row acts. */
  readonly rows: number;
  readonly cols: number;
  readonly plain: { readonly pattern: Pattern; readonly powerBp: number; readonly hits?: number };
  readonly moves: readonly BossMove[];
  readonly cards: readonly string[];
  readonly mods: BossMods;
  /**
   * The boss's crit chance (bp, default 0; the Lucky Strike card gives it). Each damaging hit of a move or the plain attack that
   * lands on a creature rolls it after the dodge and the intercept, and a crit doubles the hit (`rules.critBp`) before the cuts
   * and the armour (R7.1). A one-shot (a share of Max HP) never crits.
   */
  readonly critChanceBp?: number;
  /**
   * A flat dodge chance (bp, default 0) on top of the Speed's, which Mired does not lower (the Slippery card gives it). Only a hit
   * that cannot be dodged (Clear Skies) gets past it for certain.
   */
  readonly dodgeBp?: number;
  /**
   * The strength of the boss's rule cards and gates (bp, default 10000 = full): reflection returns this share of the
   * reaction's bonus, Shake It Off clears this share of the Mired, Clean Scales and Fizzle take hold on this share of the
   * marks, Reaction Resistance halves the bonus by this share (a cut of half at full strength), Element Resistance cuts a quarter
   * at full strength and this share of that below it; cards that change a number (armour, Speed, the cap, healing, an
   * added move's power) are built with it (`applyCard`, `cards.ts`).
   */
  readonly strengthBp?: number;
  /**
   * The level of the players' creatures in a raid weekend against this boss when a pick names none (default `LEVEL`). Boss Rank
   * (Misa, 2026-10-29) stands for a server's whole roster, not only the boss's numbers: an early rank's server has lower-level
   * creatures, so its boss can be clearly softer in HP and Attack than the high rank's without being a walkover.
   */
  readonly rosterLevel?: number;
  /** The boss's Store, if it has one. */
  readonly escalation?: Escalation;
}

/** Standing rules a rule card puts on the boss. */
export interface BossMods {
  /** No single creature hit deals more than this (Stone Skin). */
  readonly capPerHit?: number;
  /** After each boss turn, marks without Seal are shed (Clean Scales). */
  readonly shedMarks?: boolean;
  /** The first reaction after each boss turn sends its bonus back at the Payoff (Reflective Hide). */
  readonly reflectFirst?: boolean;
  /** Healing is scaled by this (Wither). */
  readonly healBp?: number;
  /** A mark left by a reaction cannot be cashed until after the next boss turn (Fizzle). */
  readonly fizzle?: boolean;
  /** Every this many rounds the boss clears all its debuffs at the end of the round; announced at round start (Shake It Off). */
  readonly shakeEvery?: number;
  /** In a raid weekend, from stage 2 the boss resists the reaction used most so far (Adapts). */
  readonly adapts?: boolean;
  /** In a raid weekend, from stage 2 the boss takes less from the element that dealt the most damage so far (Element Resistance). */
  readonly adaptsElement?: boolean;
  /** Breakwater: a Row Ward or beside-cut aura cuts this many bp of its usual cut against the boss's area hits (10000 = as is, 30000 = three times as much), up to 75% of a hit. */
  readonly wardBp?: number;
}

/** What a fight reads besides the boss and the creatures (the dice come separately: `fightV2(input, rng)`). */
export interface FightOptions {
  /** Carried state from an earlier raid stage (attrition, R14): HP by uid. */
  readonly carryHp?: ReadonlyMap<string, number>;
  readonly bossHp?: number;
  /**
   * Damage potential (Misa, 2026-10-30): the boss goes below 0 HP without dying, so a raid weekend plays out all its rounds and
   * stages and `FightResult.damage` adds up every hit in full, overkill included (a Culling Strike does not end it). The boss's HP stays
   * at 1 once it is gone, so every "boss below X% HP" rule keeps applying. Divide the weekend's damage by the boss's HP.
   */
  readonly potential?: boolean;
  /**
   * With `potential`, the boss's real HP at the start (a stage of a weekend: the earlier stage's `bossHpReal`, which can be below 1);
   * `bossHp` is where the boss is held. Default `bossHp`. Every HP-share rule (Finisher, Culling Strike, the Build-up's HP feed) reads the real HP.
   */
  readonly shadowHp?: number;
  /**
   * Determination (Misa, 2026-10-30; after WoW's): the server's creatures deal and heal this many bp more, for each failed week on
   * the same boss (`path.ts` sets it; off, 0 and absent are the same).
   */
  readonly determinationBp?: number;
  readonly resistReaction?: string;
  /** The element the boss resists this fight (Element Resistance: their hits' base damage is `rules.adaptElementBp` of itself; counters are not cut). */
  readonly resistElement?: string;
  /** Carried from the earlier stages of a raid weekend: Catch Breath already used (uids of this stage's fighters). */
  readonly carryWindDone?: ReadonlySet<string>;
  /** Carried from the earlier stages of a raid weekend: Refuse to Fall already used (once per weekend; uids of this stage's fighters). */
  readonly carryHoldOnDone?: ReadonlySet<string>;
  /** Carried from the earlier stages of a raid weekend: the boss's escalation (R22). */
  readonly carryEscalation?: {
    readonly step: number;
    /** Steps of the falling growth (default `step`). */
    readonly fallStep?: number;
    readonly phase: boolean;
    /** The phase change was announced and applies at the next round start. */
    readonly phaseNext?: boolean;
    readonly count: number;
  };
  readonly log?: boolean;
}

export interface FightEvent {
  readonly round: number;
  readonly turn: number;
  readonly kind: string;
  readonly text: string;
  /** On an `announce` event of a move: the move's id and the (row, slot) of each creature it will land on (0-based). */
  readonly move?: string;
  readonly slots?: readonly (readonly [number, number])[];
}

export interface EscalationState {
  readonly name: string;
  readonly feed: EscalationFeed;
  /** Feed units so far this fight (for `hpLost` and `rounds`, the figure it was last read at). */
  readonly count: number;
  /** Steps of the growth that helps the boss (Mired slows them). */
  readonly step: number;
  /** Steps of the growth that helps the players (a falling armour; Mired does not slow them). Equal to `step` when nothing falls. */
  readonly fallStep: number;
  readonly cap: number;
  /** The count at which the next step applies, or null at the cap. */
  readonly nextAt: number | null;
  /** True once the phase change has applied. */
  readonly phase: boolean;
  /** True from the round start the phase change was announced until it applies, one round later. */
  readonly phaseNext: boolean;
}

/** Who defeated the boss (R21 draft): the creature whose hit, counter or Culling Strike took its last HP. */
export interface KillingBlow {
  readonly uid: string;
  readonly owner: string;
  readonly formId: string;
  readonly name: string;
  readonly round: number;
  /** True when Culling Strike, not damage, finished it. */
  readonly culled: boolean;
}

export interface FightResult {
  readonly damage: number;
  readonly bossHpLeft: number;
  /** The boss's real HP at the end: equal to `bossHpLeft`, but in potential mode it goes on below 1 (and below 0) while the boss is held at 1. */
  readonly bossHpReal: number;
  readonly won: boolean;
  /** The creature that landed the killing blow (no loot), or null if the boss lived. */
  readonly killingBlow: KillingBlow | null;
  readonly wiped: boolean;
  readonly knockouts: number;
  readonly reactions: number;
  readonly reactionsByMark: Readonly<Record<string, number>>;
  readonly blocked: number;
  readonly dodges: number;
  readonly intercepts: number;
  readonly healed: number;
  readonly hpLeft: ReadonlyMap<string, number>;
  /** The boss's escalation at the end of the fight: its count, step, and what the next step needs (readable state for the board). */
  readonly escalation: EscalationState | null;
  readonly fighters: readonly Fighter[];
  readonly events: readonly FightEvent[];
}

/** A whole fight: replays exactly from this and the dice. Plain data (no Maps, no functions), so it survives a JSON round trip. */
export interface FightInputV2 {
  readonly version: 2;
  readonly rules: V2Rules;
  /** Every element id, in the order of the content's list (a rule that takes the first element that matches follows it). */
  readonly elements: readonly string[];
  readonly chart: readonly ChartPair[];
  /** The boss with its rule cards applied. */
  readonly boss: BossDef;
  readonly fighters: readonly FighterSpec[];
  readonly options: FightOptions;
}

/**
 * A whole raid weekend (R14): the team and the bench, resolved. Between stages a knocked-out creature's owner may bring a bench creature
 * (the first of that owner's, which takes the empty slot). Every creature gets the uid `owner:formId:index` of its slot in its stage's
 * team, so carried state follows the slot and a replacement is a new creature.
 */
export interface WeekendInputV2 {
  readonly version: 2;
  readonly rules: V2Rules;
  readonly elements: readonly string[];
  readonly chart: readonly ChartPair[];
  readonly boss: BossDef;
  readonly team: readonly WeekendFighterSpec[];
  readonly bench: readonly WeekendFighterSpec[];
  /** The stage's options; `stages` is how many stages are played (default 3). */
  readonly options: FightOptions & { readonly stages?: number };
}

export interface WeekendResult {
  readonly stages: FightResult[];
  readonly won: boolean;
  readonly replacements: number;
}

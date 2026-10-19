import type {
  BossDef,
  ChargedPattern,
  Element,
  Role,
  Stats,
  TurnOrder,
  Zone,
  AdaptationDef,
  LuckConfig,
  CritBonus,
  SupportFx,
} from '@creatures/game';

export type { Zone, TurnOrder };

export type PhaseId = 'phase1' | 'phase2' | 'finale';

/**
 * The chance lines and trigger lines that write a `proc` event when they fire. Second wind and Second
 * breath write a `heal` event with a `cause` instead, and Sidestep a `boss_hit` that carries `sidestep`.
 */
export const PROC_KINDS = [
  // Chance lines.
  'echo',
  'steady_paws',
  'warm_heart',
  'quick_remark',
  'spill_over',
  // Trigger lines.
  'payback',
  'kindling',
  'opening_mark',
  'rally_cry',
  'ember_tail',
  'storm_warning',
  'stubborn',
  'last_stand',
  'overflow',
  'patient',
  'shared_warmth',
] as const;
export type ProcKind = (typeof PROC_KINDS)[number];

/** One creature standing in the row. Plain JSON, so fight inputs can be stored and replayed. */
export interface FightSlot {
  /** Unique within the fight (a creature id, or a guest id). */
  id: string;
  /** Owning player id, or null for guests (they earn no loot). */
  ownerId: string | null;
  /** Display name for logs. */
  name: string;
  speciesId: string;
  element: Element;
  role: Role;
  level: number;
  fusionCount: number;
  /**
   * Effective stats (`effectiveStats` from @creatures/game). If absent the engine computes them from
   * the species, level and fusion count. Guard's +30% HP is applied by the engine either way.
   */
  stats?: Stats;
  /** Crit bonus over the baseline (from the species content); absent: none. */
  crit?: CritBonus;
  /**
   * HP the creature starts the fight with (a whole number from 0), for creatures that carry damage
   * from an earlier fight (the daily dungeon). It is capped at the creature's maximum HP (the stats'
   * HP, plus the Guard bonus); 0 means the creature starts knocked out and never acts. Absent: full HP.
   */
  hp?: number;
  /**
   * The creature's modifier sheet (gear, talents, the day's weather folded into plain numbers before
   * the fight; see `SlotMods`). Absent: no modifiers, so a stored fight replays exactly as it was.
   */
  mods?: SlotMods;
}

/**
 * A creature's modifier sheet: plain integers, each read at one step of the fight
 * (docs/design/combat-rules.md, section 10). Every field is optional and 0 when absent. Conditions
 * (the wearer's element or role, which boss is this week's) are resolved by whoever builds the
 * sheet, so the engine sees numbers only. Basis points (bp) unless the name says otherwise; a
 * negative bonus is a penalty and a negative reduction makes the creature take more.
 */
export interface SlotMods {
  // --- The creature's hit on the boss: added to the hit's one combined bonus (2.4.3). ---
  /** Extra damage against a boss of that element (a Hunter line, resolved to the boss's element). */
  vsElementBp?: Partial<Record<Element, number>>;
  /** Hits on a marked boss that do not set off a reaction. */
  markedFoeBp?: number;
  /** The creature's first turn hit in each fight (an ability's strike is not a first hit). */
  firstHitBp?: number;
  /** The hit that leaves a mark or replaces one. */
  markingHitBp?: number;
  /** An ability's strike (`strike` effect). */
  strikeBp?: number;
  /** Extra damage while a living creature of that role stands beside it (position line, 10.4). */
  besideRoleBp?: Partial<Record<Role, number>>;
  /** The boss's adaptation resists this creature's hits this much less (0 to 10000). */
  pierceBp?: number;

  // --- The reaction it sets off or has set up. ---
  /** The bonus of each reaction it sets off (by reaction id: steam, wildfire, ...). */
  reactionBp?: Partial<Record<string, number>>;
  /** Added to the reaction multiplier's percentage (on top of a Payoff's own bonus). */
  pounceBp?: number;
  /** Reactions that others set off on a mark this creature left (the setter's sheet counts). */
  ownerMarkBp?: number;
  /** Crit chance on hits that set off a reaction (still under the crit cap). */
  keenReactionBp?: number;
  /** A Support's: the reaction bonus of the creatures beside it. */
  shareBp?: number;

  // --- The taker: each reduces what this creature takes, after armor and cover (3.2). ---
  /** Every hit. */
  takenBp?: number;
  /** Area hits. */
  areaBp?: number;
  /** Aimed hits. */
  aimedBp?: number;
  /** Reflected hits. */
  reflectedBp?: number;
  /** Hits of a charged move landing. */
  chargedBp?: number;
  /** Hits from a boss of that element (a Ward line, resolved to the boss's element). */
  wardBp?: Partial<Record<Element, number>>;
  /** Healing it receives (a Support's Mend), in either direction. */
  healReceivedBp?: number;

  // --- Roles. ---
  /** A Guard's armor, added to the rules' armor. */
  armorBp?: number;
  /** A Guard's cover for the creatures beside it, added to the rules' cover. */
  coverBp?: number;
  /** A Support's boost on the creatures beside it, added to the boost. */
  boostBp?: number;
  /** A Support's Mend: the share of max HP the creatures beside it heal at round start, added to the element's. */
  mendBp?: number;

  // --- Abilities and silence. ---
  /** Rounds added to the Rally, Shield Wall and Purge of the creature's own ability (0 to 3). */
  lingerRounds?: number;
  /** 1: silence does nothing to it. */
  ignoreSilence?: 0 | 1;

  // --- Gear sets and position lines (2026-10-18). Absent means exactly what it was before. ---
  /** Cover a Guard's cover on this creature gains (the position line Sheltered), added to the Guard's. */
  shelterBp?: number;
  /** 1: its first reaction each fight cannot be reflected by the boss's trap (Tidepool Finery). */
  unreflected?: 0 | 1;
  /** After it sets off a reaction, its crits deal this much more crit damage until the end of the next round (Forge-Warm Kit). */
  critWindowBp?: number;
  /** It heals this share of its max HP (0 to 10000) whenever it sets off a reaction (Hollow Weave). */
  healOnReactionBp?: number;
  /** 1: after it sets off a reaction the boss keeps the creature's own mark, so a chain can follow (Ridge Copper). */
  chainMark?: 0 | 1;
  /** 1: a Guard's cover also reaches the creature one slot further out in its row (Warden's Watch). */
  coverReach?: 0 | 1;
  /** 1: a Support's boost also lands on the creature two slots away (Hearth Helpers). */
  boostReach?: 0 | 1;
  /** 1: the first mark it leaves each fight cannot be replaced by another creature's hit (First Footprints). */
  sealMark?: 0 | 1;
  /** 1: its first reaction each fight is a critical hit (Pounce Set; crits must be on). */
  firstReactionCrit?: 0 | 1;

  // --- Chance lines (2026-10-18, `combat-rules.md` 11). Each is a chance in basis points (0 to 10000), rolled
  // on the creature's own luck dice (`LUCK_DICE`), drawn only when some creature of the fight has one. ---
  /** Each round start: heal `CHANCE_FX.secondWindHealBp` of max HP. */
  secondWindBp?: number;
  /** Its turn hit lands again for `CHANCE_FX.echoBp` of its plain damage. */
  echoBp?: number;
  /** An area hit that would reach it deals nothing. */
  sidestepBp?: number;
  /** A silence that lands on it is shrugged off. */
  steadyPawsBp?: number;
  /** Round start: a creature beside it gets a `CHANCE_FX.warmHeartBp` boost on its next hit. */
  warmHeartBp?: number;
  /** Its hit replaces a mark of another element, like a Setter's. */
  quickRemarkBp?: number;
  /** A reaction it sets off leaves its own mark behind. */
  spillOverBp?: number;

  // --- Trigger lines (2026-10-18, `combat-rules.md` 12). Each names a moment, writes a `proc` log line when
  // it fires, and carries its own number (a bonus or a cut in basis points, tiered by the line). ---
  /** It takes a hit for a neighbour: its next turn hit deals this much more. */
  paybackBp?: number;
  /** Round 1 starts: the creatures beside it start with a boost of this size on their first hit. */
  kindlingBp?: number;
  /** 1: round 1 starts and the boss has no mark: it leaves its own. */
  openingMark?: 0 | 1;
  /** A creature beside it is knocked out: its hits deal this much more for the rest of the fight (per fallen neighbour). */
  rallyCryBp?: number;
  /** It crits: its next turn hit deals this much more. */
  emberTailBp?: number;
  /** A charge is announced with it marked: it takes this much less from the landing. */
  stormWarningBp?: number;
  /** 1: the first hit that would knock it out leaves it at 1 HP (once a fight). */
  stubborn?: 0 | 1;
  /** It falls to a quarter of its HP: it takes this much less for the rest of the fight. */
  lastStandBp?: number;
  /** It sets off a reaction: the next creature to act gets a boost of this size. */
  overflowBp?: number;
  /** The first enrage round starts: it heals this share of its max HP. */
  secondBreathBp?: number;
  /** It is silenced: its next turn hit deals this much more. */
  patientBp?: number;
  /** A Support heals it: that Support's next boost is this much bigger. */
  sharedWarmthBp?: number;
}

export interface AbilityChoice {
  playerId: string;
  /** Id of a content finale ability, for example "rally". */
  abilityId: string;
  /**
   * Unique within the fight (for example `m1:basic` or `m1:<creature id>`). A player may hold
   * several choices; events carry the key so replays can tell them apart.
   */
  key: string;
  /**
   * The creature the ability belongs to: a slot in the row owned by `playerId`. Required for
   * abilities with a `strike` or an `own` zone or element, optional otherwise.
   */
  creatureId?: string;
  /** Round (1-based) the present player fires it. Absent: the ability's default round. */
  fireAtRound?: number;
  /** Shield Wall: the zone. Re-mark: the element. Absent: a documented default. */
  params?: { zone?: Zone; element?: Element };
}

export interface ActiveAdaptation {
  /** Id of an adaptation rule in the content pack. */
  rule: string;
  /** The resisted reaction id (top_reaction rules) or element (top_element rules). */
  target: string;
}

export interface FightInput {
  /** Resolved boss content. */
  boss: BossDef;
  /** Boss Attack for this fight (from `scaleBoss`). */
  bossAtk: number;
  /**
   * How many times the boss makes its plain attack each round, 1 to 3 (absent: 1). Each attack
   * picks its target when it is made, from who stands then, and has its own crit die; the extra
   * dice are drawn only when this is above 1, so a stored fight without it replays as it was.
   */
  bossAttacks?: number;
  phase: PhaseId;
  /** The week's boss HP pool, carried across phases. */
  bossHpPool: { max: number; current: number };
  adaptation: ActiveAdaptation | null;
  /** The row, left to right. */
  row: readonly FightSlot[];
  /**
   * Where the row's creatures stand on the board: `length` is the board row's full length and
   * `slots[i]` the board slot of `row[i]` (strictly increasing, below `length`). A raid fight carries
   * the board's own positions here, so zones, lanes and "beside" are the board's even when it has
   * empty slots. Absent: the dense row (creature i in slot i), so a stored input replays as it did.
   */
  board?: { length: number; slots: readonly number[] };
  /** Signed-up player ids. */
  players: readonly string[];
  finaleAbilities: readonly AbilityChoice[];
  turnOrderOverride?: TurnOrder;
  /**
   * Whom a Guard covers when the boss aims a hit at a creature that is not a Guard: `zone` (the
   * default, and what every raid fight uses) is the creatures in the Guard's own zone; `adjacent`
   * is the creatures directly left and right of it, for rows of three where each zone is one slot.
   * An aimed hit goes to a Guard standing beside the target (the left one first) while it is up.
   */
  guardReach?: 'zone' | 'adjacent';
  /**
   * Luck settings for this fight, stored with the input so a replay is exact. Absent: no luck.
   * Whoever builds a live input copies `RULES.combat.luck` in.
   */
  luck?: LuckConfig;
  /**
   * Combat rules for this fight, stored with the input so a later retune never changes a stored
   * fight. Absent: the rules before attack patterns (no cover, no element effects, no hit cap).
   * Whoever builds a live input copies them from `RULES.combat`.
   */
  rules?: FightRules;
  /**
   * The phase floor as boss HP (`bossHpPool.max x (10000 - clearAtLossBp) / 10000`): the boss
   * cannot go below it. When a hit takes it there the hit counts only down to the floor, the boss
   * retreats (`retreat` event) and the fight ends at once. Absent or 0: no floor (the finale).
   */
  bossHpFloor?: number;
  /**
   * Enrage: when the rounds run out with both sides standing, up to `rounds` more rounds are
   * played; in each the boss makes its plain attack, then hits every living creature for `powerBp`
   * of its Attack (area hits, under the single-hit cap). Gimmicks do not fire in enrage rounds and a
   * charge is never announced to land in one. Standing at the end is a loss. Absent: none.
   */
  enrage?: EnrageRules;
  /**
   * Ids of enabled mutators (the content feature flag), in the order they run. Only mutators that
   * are both listed here and passed in `options.mutators` run.
   */
  mutators?: readonly string[];
  /**
   * The day's Kind Rain: every living creature heals this share of its max HP (basis points, 1 to
   * 10000) at the start of every round, after the Supports' Mend, never above its max (and never a
   * revival). A creature's `healReceivedBp` applies. Absent: no rain, so a stored fight replays as it was.
   */
  rainHealBp?: number;
  /**
   * The day's Morning Haze: the ids of creatures that skip their first turn of the fight (the first
   * turn they would act; a silenced first turn already costs the turn, so the haze is spent on it).
   * Whoever builds the input picks them (`hazeSkips`: the first creature of each row in the raid, the
   * left one in the dungeon). Absent or empty: nobody, so a stored fight replays as it was.
   */
  skipFirstTurn?: readonly string[];
  /**
   * The day's Bramble Season: the first reaction set off each round sends this share of its bonus
   * damage (basis points, 1 to 10000) back at the creature that set it off, and the boss takes the
   * rest. The returning part is a reflected hit like Backdraft's (`reflectedBp`, Guards, Shield Walls,
   * armor). Absent: none, so a stored fight replays as it was.
   */
  brambleBp?: number;
  /**
   * The day's Lantern Light: rounds (1 to 3) added to the timed effects of every ability in the fight
   * (Rally, Shield Wall, timed Purge), basic ones included, on top of the `lingerRounds` of an ability's
   * own creature. The day's weather is only ever in this field, never also in a creature's sheet, so a
   * creature's ability is not lengthened twice. Absent: 0, so a stored fight replays as it was.
   */
  lingerAllRounds?: number;
}

export interface FightRules {
  /** Guard cover against area hits, basis points (`RULES.combat.coverBp`). */
  coverBp: number;
  /** The single-hit cap as a share of the victim's max HP, basis points (`RULES.combat.maxHitBp`). */
  maxHitBp: number;
  /**
   * A Guard's extra HP in basis points of its HP stat (`RULES.combat.guard.hpBp`). Fights without
   * `rules` use `RULES.combat.guardHpBp` instead.
   */
  guardHpBp: number;
  /**
   * The share of damage a Guard does not take from any hit it takes, basis points
   * (`RULES.combat.guard.armorBp`). Fights without `rules` have no armor.
   */
  guardArmorBp: number;
  /** Support effects by element (`RULES.combat.supportFx`). */
  supportFx: Readonly<Partial<Record<Element, SupportFx>>>;
}

export interface EnrageRules {
  rounds: number;
  powerBp: number;
}

export type FightEvent =
  | {
      t: 'round_start';
      round: number;
      bossHp: number;
      mark: Element | null;
      /** Set on the round a Surge ("Fortune smiles") or a Slump ("Bad omen") starts. */
      luck?: { kind: 'surge' | 'slump'; bp: number; rounds: number };
    }
  | { t: 'support_buff'; round: number; supporter: string; target: string; bp: number }
  /** A Support's Mend at round start: the HP actually restored (never above what was missing). */
  | {
      t: 'heal';
      round: number;
      supporter: string;
      target: string;
      amount: number;
      /** Set when a gear line healed the creature (it is then both `supporter` and `target`). */
      cause?: 'second_wind' | 'second_breath';
    }
  /** A Tide Support's Mend cleared a neighbour's silence. */
  | { t: 'cleanse'; round: number; supporter: string; target: string }
  /**
   * The day's Kind Rain at round start (`FightInput.rainHealBp`): the creatures it really healed
   * (never above what was missing), in row order. Not written when nobody needed healing.
   */
  | { t: 'sky_heal'; round: number; heals: { creature: string; amount: number }[] }
  /**
   * A charged pattern was announced at the start of `round` (after the dice, before abilities); it
   * lands in `landing` (= round + 1) on `marks` (creature ids) and, for a sweep, `rows`.
   */
  | {
      t: 'charge';
      round: number;
      landing: number;
      gimmick: string;
      op: ChargedPattern['op'];
      marks: string[];
      rows?: Zone[];
    }
  /**
   * The boss reached the phase floor (`FightInput.bossHpFloor`): it is immune, retreats, and the
   * fight ends after this event.
   */
  | { t: 'retreat'; round: number; bossHp: number }
  /** An enrage round starts (right after its `round_start`); `first` on the first one. */
  | { t: 'enrage'; round: number; first: boolean }
  | {
      t: 'ability';
      round: number;
      player: string;
      ability: string;
      key: string;
      /** The creature the ability belongs to, if any. */
      creature?: string;
      zone?: Zone;
      element?: Element;
      byDefault: boolean;
    }
  | {
      t: 'adaptation';
      round: number;
      rule: string;
      target: string | null;
      /** `restored`: a timed purge ended and the adaptation applies again. */
      status: 'active' | 'purged' | 'restored' | 'suggested';
    }
  | { t: 'turn'; round: number; creature: string }
  | { t: 'skip'; round: number; creature: string; reason: 'silenced' | 'haze' }
  | {
      t: 'hit';
      round: number;
      creature: string;
      damage: number;
      matchupBp: number;
      /** Total damage bonus in basis points (support, rally, mutators). */
      bonusBp: number;
      /** The boss's mark before the hit. */
      mark: Element | null;
      bossHp: number;
      /** Set when the hit is an ability's strike: the ability id and its fight key. */
      ability?: string;
      key?: string;
      /** Luck's share of the damage bonus in basis points (crit and spread); absent if none. */
      luckBp?: number;
      /** Set when the hit was critical ("Critical!"). */
      crit?: true;
      /** The extra damage of that crit in basis points of the plain hit (this creature's crit damage). */
      critBp?: number;
      /** The creature's sheet added this much to the hit's damage bonus (basis points); absent if none. */
      sheetBp?: number;
      /** Set when a gear set made this hit a crit (`firstReactionCrit`). */
      setCrit?: true;
      /** Set when a gear set's crit window added crit damage to this crit (`critWindowBp`). */
      warm?: true;
    }
  | {
      t: 'mark';
      round: number;
      /** The creature that applied it; null when a finale ability set it. */
      creature: string | null;
      player: string | null;
      element: Element;
      replaced: Element | null;
      /** Set when a gear set sealed the mark: another creature's hit cannot replace it (`sealMark`). */
      sealed?: true;
    }
  | {
      t: 'reaction';
      round: number;
      reaction: string;
      setupCreature: string | null;
      setupPlayer: string | null;
      payoff: string;
      /** Bonus damage of the reaction (dealt to the boss, or to the payoff creature if reflected). */
      bonus: number;
      reflected: boolean;
      /**
       * Bramble Season took part of this reaction (`FightInput.brambleBp`): the share in basis points
       * and the bonus damage that went back at the payoff creature instead of the boss (the boss's
       * `bonus` is what is left). Absent otherwise.
       */
      bramble?: { bp: number; amount: number };
      /** The sheets' share of the reaction: per-reaction and owner's mark bonus plus the pounce, in basis points; absent if none. */
      sheetBp?: number;
      /** Set when a gear set turned the boss's reflection aside (`unreflected`). */
      proof?: true;
      /** Set when a gear set left the creature's own mark standing after the reaction (`chainMark`). */
      chain?: true;
    }
  | {
      t: 'gimmick';
      round: number;
      gimmick: string;
      op: string;
      /**
       * Attack patterns only: the creatures the pattern picked, in hit order (for a charge, the
       * marks still standing), before any Guard steps in; the `boss_hit` events that follow say
       * who actually took each hit. `rows`: a sweep's rows. `lane`: a lance's slot position.
       */
      targets?: string[];
      rows?: Zone[];
      lane?: number;
    }
  | {
      t: 'boss_hit';
      round: number;
      /** `enrage`: the enraged boss's hit on every creature (`FightInput.enrage`). */
      source: 'attack' | 'gimmick' | 'reflect' | 'enrage';
      target: string;
      damage: number;
      /** Set when a guard took the hit: the creature it was aimed at. */
      from?: string;
      /** True when a Shield Wall stopped the damage. */
      shielded?: boolean;
      /** Set when Shield Walls softened the hit (not fully): the total reduction in basis points. */
      reducedBp?: number;
      /** Set when the boss's hit was critical ("Critical!"). */
      crit?: true;
      /** The extra damage of that crit in basis points (the boss's crit damage). */
      critBp?: number;
      /** A Slam's splash on a creature beside the impact. */
      splash?: true;
      /** Guard cover softened this area hit: the Guard and the damage it prevented. */
      covered?: { guard: string; prevented: number };
      /** A Guard's armor (`FightRules.guardArmorBp`) took this much off a hit the Guard took. */
      armored?: number;
      /** The single-hit cap (`FightRules.maxHitBp`) cut this hit down. */
      capped?: true;
      /** The taker's sheet reductions took this much off the hit (negative: its sheet made the hit bigger). */
      warded?: number;
      /** Set when the taker's Sidestep made it take nothing from an area hit (the damage is 0). */
      sidestep?: true;
      /** Set when the taker's Stubborn left it at 1 HP instead of knocking it out (the damage is still the full hit). */
      stubborn?: true;
    }
  | { t: 'knockout'; round: number; creature: string }
  /**
   * A chance line or a trigger line fired (`PROC_KINDS`). `creature` is the creature whose line it is;
   * `target` the other creature it names (a boost's receiver, the fallen creature of Rally cry, the
   * Support of Shared warmth); `amount` the number the line's words name (basis points of a bonus,
   * boost or cut; the damage of an Echo); `bossHp` is set when the event changed the boss's HP (Echo).
   */
  | {
      t: 'proc';
      round: number;
      creature: string;
      kind: ProcKind;
      target?: string;
      amount?: number;
      bossHp?: number;
    }
  | { t: 'silence'; round: number; creature: string; turns: number }
  | { t: 'round_end'; round: number; bossHp: number };

export interface PlayerTotals {
  damage: number;
  setupCredit: number;
  supportCredit: number;
  guardCredit: number;
  contribution: number;
}

export interface CreatureTotals extends PlayerTotals {
  ownerId: string | null;
  damageTaken: number;
  knockedOutRound: number | null;
}

export interface AdaptationSuggestion {
  rule: string;
  /** Reaction id or element; null if nothing happened that the rule could pick. */
  target: string | null;
  resistBp: number;
  /** Plain-language description shown to players. */
  description: string;
}

export interface FightResult {
  /** Rounds played (fewer than the phase length if the fight ended early). */
  rounds: number;
  bossHpStart: number;
  bossHpEnd: number;
  /** Boss HP lost so far this week (all phases) reached the phase's clear threshold. */
  cleared: boolean;
  /** The boss reached the phase floor and retreated (`retreat` event). */
  retreated: boolean;
  /** Enrage rounds were played (`enrage` events). */
  enraged: boolean;
  events: FightEvent[];
  perPlayer: Record<string, PlayerTotals>;
  perCreature: Record<string, CreatureTotals>;
  reactions: { byType: Record<string, number>; total: number };
  /** Damage dealt to the boss by the element of the hitting creature (reactions included). */
  damageByElement: Record<Element, number>;
  /**
   * Every creature's HP when the fight started, when it ended (0 for a knocked-out creature) and at
   * most (the stats' HP, plus the Guard bonus), by creature id. `hpEnd` is what a chained fight
   * carries into the next one as `FightSlot.hp`.
   */
  hpStart: Record<string, number>;
  hpEnd: Record<string, number>;
  hpMax: Record<string, number>;
  /** For phase 1: the counter the boss gains for phase 2. Null in other phases. */
  adaptationSuggestion: AdaptationSuggestion | null;
}

export type { AdaptationDef };

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
  phase: PhaseId;
  /** The week's boss HP pool, carried across phases. */
  bossHpPool: { max: number; current: number };
  adaptation: ActiveAdaptation | null;
  /** The row, left to right. */
  row: readonly FightSlot[];
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
  | { t: 'heal'; round: number; supporter: string; target: string; amount: number }
  /** A Tide Support's Mend cleared a neighbour's silence. */
  | { t: 'cleanse'; round: number; supporter: string; target: string }
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
  | { t: 'skip'; round: number; creature: string; reason: 'silenced' }
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
    }
  | {
      t: 'mark';
      round: number;
      /** The creature that applied it; null when a finale ability set it. */
      creature: string | null;
      player: string | null;
      element: Element;
      replaced: Element | null;
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
    }
  | { t: 'knockout'; round: number; creature: string }
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

import type {
  BossDef,
  Element,
  Role,
  Stats,
  TurnOrder,
  Zone,
  AdaptationDef,
  LuckConfig,
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
   * Luck settings for this fight, stored with the input so a replay is exact. Absent: no luck.
   * Whoever builds a live input copies `RULES.combat.luck` in.
   */
  luck?: LuckConfig;
  /**
   * Ids of enabled mutators (the content feature flag), in the order they run. Only mutators that
   * are both listed here and passed in `options.mutators` run.
   */
  mutators?: readonly string[];
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
  | { t: 'gimmick'; round: number; gimmick: string; op: string }
  | {
      t: 'boss_hit';
      round: number;
      source: 'attack' | 'gimmick' | 'reflect';
      target: string;
      damage: number;
      /** Set when a guard took the hit: the creature it was aimed at. */
      from?: string;
      /** True when a Shield Wall stopped the damage. */
      shielded?: boolean;
      /** Set when Shield Walls softened the hit (not fully): the total reduction in basis points. */
      reducedBp?: number;
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
  events: FightEvent[];
  perPlayer: Record<string, PlayerTotals>;
  perCreature: Record<string, CreatureTotals>;
  reactions: { byType: Record<string, number>; total: number };
  /** Damage dealt to the boss by the element of the hitting creature (reactions included). */
  damageByElement: Record<Element, number>;
  /** For phase 1: the counter the boss gains for phase 2. Null in other phases. */
  adaptationSuggestion: AdaptationSuggestion | null;
}

export type { AdaptationDef };

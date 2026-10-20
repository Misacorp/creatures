import type {
  AdaptationDef,
  AppliesDef,
  BossDef,
  ContentPack,
  Element,
  FinaleAbilityDef,
  LuckConfig,
  StatusEffectDef,
  ReactionDef,
  Rng,
  Role,
  Zone,
} from '@creatures/game';
import type { ResolvedMods } from './mods';
import type { CreatureView, Mutator, MutatorHooks } from './mutators';
import type { PatternPlan } from './patterns';
import type {
  AbilityChoice,
  CreatureTotals,
  FightEvent,
  FightInput,
  DodgeRules,
  FightRules,
  PlayerTotals,
} from './types';
import { neighbours, zoneIndices, zoneNeighbours, zoneTwoAway, type fightRowShape } from './zones';

/**
 * The state of one fight, shared by the modules that play it (`fight.ts` orchestrates; `fight-damage.ts`,
 * `fight-strike.ts`, `fight-boss.ts` and `fight-round.ts` do the work). It was once a closure over about
 * thirty `let`s inside `simulateFight`; every field is the same variable, now named, so the order of the
 * dice draws and of every update stayed exactly as it was.
 */

/** A status effect on a fighter: its stacks and the turns it has left (`combat-rules.md` 13). */
export interface ActiveEffect {
  id: string;
  stacks: number;
  turnsLeft: number;
}

/** Whoever can carry effects: a creature, or the boss (a foe too). */
export type Fighter = Creature | 'boss';

export interface Creature {
  idx: number;
  id: string;
  ownerId: string | null;
  name: string;
  element: Element;
  role: Role;
  atk: number;
  spd: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  /** Turns still to be skipped. */
  silenced: number;
  /**
   * Support buffs waiting for this creature's next hit. `tag` marks a boost a gear line gave (Kindling,
   * Warm heart, Overflow): it is kept apart from the Support's own, which a Support replaces each round.
   */
  buffs: { from: number; bp: number; tag?: 'kindling' | 'warm' | 'overflow' | 'slipstream' }[];
  /** This creature's crit chance and extra crit damage (basis points); 0 when crits are off. */
  critChanceBp: number;
  critBp: number;
  /** The creature's modifier sheet, filled in (`FightSlot.mods`). */
  mods: ResolvedMods;
  /** Turn hits made so far (an ability's strike is not one), for the first hit's bonus. */
  turnHits: number;
  /** Reactions this creature has set off, for the gear sets that act on the first one. */
  cashes: number;
  /** Its crits get `mods.critWindowBp` more crit damage through this round (0: no window). */
  critWindowUntil: number;
  /** The first mark it leaves has been sealed already (`mods.sealMark`). */
  sealed: boolean;
  /** Trigger lines: the bonus its next turn hit gets (Payback, Ember tail, Patient), each waiting for that hit. */
  paybackReady: number;
  emberTailReady: number;
  patientReady: number;
  /** Momentum: the bonus its next turn hit gets after a dodge (replaces an earlier one). */
  momentumReady: number;
  /** Rally cry: the bonus its hits have for the rest of the fight (one share per fallen neighbour). */
  rallyCry: number;
  /** Stubborn has been used this fight. */
  stubbornUsed: boolean;
  /** Last stand: it has fired, and the cut it gives from then on. */
  lastStandDone: boolean;
  lastStandCut: number;
  /** Storm warning: the round of the charge it is marked for, and the cut that landing gets (0: none). */
  stormRound: number;
  /** Shared warmth, on a Support: the extra its next boost carries. */
  nextBoostBp: number;
  /** Status effects it carries (always empty in a fight with effects off). */
  effects: ActiveEffect[];
  /** Passive abilities (`on_hit_taken`, `round_start`): the riders it puts on the boss, set when the fight starts. */
  hitTakenApplies: AppliesDef[];
  roundStartApplies: AppliesDef[];
}

export interface Mark {
  element: Element;
  creature: Creature | null;
  player: string | null;
  /** Another creature's hit cannot replace it (`SlotMods.sealMark`). */
  sealed?: boolean;
}

export type CreditKind = 'damage' | 'setupCredit' | 'supportCredit' | 'guardCredit';

/** One creature's dice for a round: its crit die and its damage spread. */
export interface Dice {
  crit: number;
  spread: number;
}

/** A finale ability waiting for its round. */
export interface Scheduled {
  choice: AbilityChoice;
  def: FinaleAbilityDef;
  byDefault: boolean;
  /** The creature the ability belongs to, if it has one. */
  source: Creature | null;
}

export interface FightState {
  // ---- what the fight is (never changes once it starts) ----
  readonly input: FightInput;
  readonly rng: Rng;
  readonly pack: ContentPack;
  readonly boss: BossDef;
  readonly phase: FightInput['phase'];
  /** The creatures in the row. */
  readonly n: number;
  /** Where the row stands on the board. */
  readonly shape: ReturnType<typeof fightRowShape>;
  readonly poolMax: number;
  /** Base rounds (enrage rounds come after them). */
  readonly rounds: number;
  readonly bossAttacks: number;
  readonly rainHealBp: number;
  readonly brambleBp: number;
  /** The day's Lantern Light: rounds added to every ability's timed effects (`FightInput.lingerAllRounds`). */
  readonly lingerAllRounds: number;
  readonly bossFloor: number;
  readonly enrage: FightInput['enrage'];
  readonly luck: LuckConfig;
  readonly critOn: boolean;
  readonly bossCrit: { chanceBp: number; damageBp: number };
  readonly bossCritOn: boolean;
  readonly randomTargetBp: number;
  /** Absent: the rules before attack patterns. */
  readonly rules: FightRules | undefined;
  readonly patternsOn: boolean;
  /** True when a creature of the fight has a chance line. */
  readonly luckOn: boolean;
  /** Status effects are on in this fight (`FightInput.effects`): off, nothing applies and no die is drawn. */
  readonly effectsOn: boolean;
  /** The status effects of the content pack, by id. */
  readonly effectDefs: ReadonlyMap<string, StatusEffectDef>;
  /** Dodge numbers of the fight's stored rules (`FightRules.dodge`); undefined: dodge is off. */
  readonly dodge: DodgeRules | undefined;
  readonly rule: AdaptationDef | null;
  readonly adaptationTarget: string;
  /** The reaction of each (mark element, trigger element) pair, by `reactionKey`. */
  readonly reactionByPair: ReadonlyMap<string, ReactionDef>;
  readonly guardReach: 'zone' | 'adjacent';
  /** The first zone attack of the boss, where the default Shield Wall goes. */
  readonly zoneHit: { round: number; zone: Zone } | null;
  readonly creatures: Creature[];
  /** Indices in the order creatures act. */
  order: number[];
  readonly active: Mutator[];

  // ---- what has happened (filled in as the fight goes) ----
  readonly events: FightEvent[];
  readonly perPlayer: Record<string, PlayerTotals>;
  readonly perCreature: Record<string, CreatureTotals>;
  readonly reactionsByType: Record<string, number>;
  reactionTotal: number;
  readonly damageByElement: Record<Element, number>;
  /** Shield Walls standing, each until the end of the round `until`. */
  readonly shields: { zone: Zone; reduceBp: number; until: number }[];
  /** Rallies running, each until the end of the round `until`. */
  readonly rallies: { bp: number; until: number }[];
  /** The creatures hit by each barrage gimmick's last volley (by gimmick id), for the no-repeat rule. */
  readonly lastVolley: Map<string, number[]>;
  /** The charges announced and not yet landed, by gimmick index and landing round (a charge due every round has several in the air). */
  readonly pendingCharges: Map<string, PatternPlan>;

  bossHp: number;
  /** The boss reached its phase floor and retreated: the fight is over. */
  retreated: boolean;
  /** Enrage rounds were played. */
  enraged: boolean;
  mark: Mark | null;
  bossDamageBp: number;
  currentRound: number;
  /** The last round the adaptation is switched off by a purge (0: never purged). */
  purgedThrough: number;
  /** Where in `order` the creature acting now stands (-1 before the first turn of a round), for Overflow. */
  orderPos: number;
  roundBonusBp: number;
  reflectArmed: boolean;
  reflectUsed: boolean;
  /** Bramble Season: this round's first reaction has been seen (a reflected one counts too). */
  brambleUsed: boolean;
  /** The running Surge (+) or Slump (-) in basis points of team damage, and its last round. */
  swingNow: number;
  swingUntil: number;
  /** Status effects on the boss (or foe). */
  bossEffects: ActiveEffect[];

  // ---- this round's dice, drawn at the start of every round (see `fight.ts`) ----
  /** Every creature's turn dice and strike dice: a creature's roll depends on the seed, the round and its slot only. */
  turnDice: Dice[];
  strikeDice: Dice[];
  /** The boss crit dice by target slot: one set for its normal attack, one for gimmicks. */
  bossAttackDice: number[];
  bossGimmickDice: number[];
  /**
   * With `bossAttacks` above 1 (and boss crits on): the crit dice of the 2nd and 3rd plain attacks,
   * by target slot. Drawn after every other die of the round, and only then, so a fight with one
   * attack a round (every older one) draws what it always did.
   */
  extraAttackDice: number[][];
  /** The dice for a random boss target: whether it applies, and which living creature. */
  targetDice: { use: number; pick: number };
  /**
   * The pattern dice: 40 uniform integers in [0, 1_000_000), drawn after every other die, and only when
   * the boss has a pattern op (`PATTERN_OPS`), so a boss without one draws what it always did. Each
   * gimmick reads its own window of them (`diceWindow`).
   */
  patternDice: number[];
  /**
   * With `rules` only: one die per slot per round, uniform in [0, `DICE_RANGE`), drawn after every
   * other die and drawn every round whatever happens. It picks the Guard when several could take a
   * hit on that slot (`guardFor`). Every hit on the same slot in the same round reuses the same die,
   * so those hits pick the same position among the candidates (two hits on one slot meet the same
   * Guard unless one of the Guards fell in between).
   */
  guardDice: number[];
  /**
   * With a chance line anywhere in the fight (`hasChance`): `LUCK_DICE` dice per creature per round,
   * uniform in [0, 10000), drawn after every other die of the round and only then, so a fight without a
   * chance line draws what it always did. Die 0 is Second wind's, 1 Echo's, 2 Steady paws', 3 Warm
   * heart's, 4 Quick re-mark's, 5 Spill-over's and 6 to 9 Sidestep's (the 1st to 4th area hit on the
   * creature that round, the 4th for any after). A chance of 1000 fires when its die is under 1000.
   */
  luckDice: number[][];
  /** Area hits each creature has met this round, for Sidestep's dice. */
  areaSeen: number[];
  /**
   * With effects on (`FightInput.effects`): `dice` uniform integers in [0, 10000) drawn at the very
   * end of the round's dice, after the luck dice, and only then, so a fight without effects draws what
   * it always did. Each application of an effect with a fractional power takes the next one in order
   * (`effectDiceUsed`, reset every round); when they run out, further chances count as a miss.
   */
  effectDice: number[];
  effectDiceUsed: number;
  /** The last `hurt` call ended in a dodge (set on every call), so a move's rider can skip it. */
  lastHitDodged: boolean;
  /**
   * With dodge on (`FightRules.dodge`): drawn after the effect dice, in this order, and only then.
   * `dodgeTakenDice`: `DODGE_TAKEN_DICE` dice per creature, the Nth hit it takes that round uses die N (the
   * last die for any later one). `dodgeTurnDice` and `dodgeStrikeDice`: one die per creature, the boss's
   * roll against that creature's turn hit and against its ability strike. All uniform in [0, 10000).
   * `dodgeSeen` counts the hits each creature has taken this round.
   */
  dodgeTakenDice: number[][];
  dodgeTurnDice: number[];
  dodgeStrikeDice: number[];
  dodgeSeen: number[];
}

export function pick(result: unknown, key: string): unknown {
  return typeof result === 'object' && result !== null
    ? (result as Record<string, unknown>)[key]
    : undefined;
}

/** True when `bp` is above 0 and creature `c`'s die number `k` of this round is under it. */
export function rolls(state: FightState, c: Creature, k: number, bp: number): boolean {
  return bp > 0 && (state.luckDice[c.idx]?.[k] ?? 10_000) < bp;
}

export function view(c: Creature): CreatureView {
  return {
    id: c.id,
    ownerId: c.ownerId,
    element: c.element,
    role: c.role,
    position: c.idx,
    hp: c.hp,
    maxHp: c.maxHp,
    alive: c.alive,
  };
}

export function baseContext(state: FightState) {
  return {
    phase: state.phase,
    round: state.currentRound,
    bossHp: state.bossHp,
    bossMaxHp: state.poolMax,
    mark: state.mark?.element ?? null,
    creatures: state.creatures.map(view),
    rng: state.rng,
  };
}

/** Runs a hook on every active mutator; `collect` gets the hook results (basis-point deltas). */
export function runHook<K extends keyof MutatorHooks>(
  state: FightState,
  name: K,
  makeContext: () => Parameters<MutatorHooks[K]>[0],
  collect?: (result: ReturnType<MutatorHooks[K]>) => void,
): void {
  if (state.active.length === 0) return;
  const ctx = makeContext();
  for (const m of state.active) {
    const hook = m.hooks[name] as ((c: typeof ctx) => ReturnType<MutatorHooks[K]>) | undefined;
    if (hook === undefined) continue;
    const result = hook(ctx);
    if (collect !== undefined) collect(result);
  }
}

export function credit(
  state: FightState,
  c: Creature | null,
  playerId: string | null,
  kind: CreditKind,
  amount: number,
): void {
  if (amount === 0) return;
  if (c !== null) (state.perCreature[c.id] as CreatureTotals)[kind] += amount;
  const owner = c !== null ? c.ownerId : playerId;
  if (owner !== null) {
    const p = state.perPlayer[owner];
    if (p !== undefined) p[kind] += amount;
  }
}

/** The living creatures standing in `zone`, in slot order. */
export function livingIn(state: FightState, zone: Zone): Creature[] {
  return zoneIndices(zone, state.shape)
    .map((i) => state.creatures[i] as Creature)
    .filter((c) => c.alive);
}

/**
 * Who is "beside" a slot. The raid's adjacency stops at zone edges; the dungeon (`adjacent`
 * reach: a row of three, one slot per zone) has no usable zones, so it keeps the plain line.
 */
export function besides(state: FightState, idx: number): number[] {
  return state.guardReach === 'adjacent'
    ? neighbours(idx, state.n)
    : zoneNeighbours(idx, state.shape);
}

/**
 * The slots two places away from `idx` in its row (a gear set's longer reach: a Guard's cover, a Support's
 * boost): the raid's row is a zone, so the slot must be in the same zone and, on the board, reached across
 * an occupied slot (a gap breaks the reach, as it breaks "beside"); the dungeon's line has no zones.
 */
export function further(state: FightState, idx: number): number[] {
  return state.guardReach === 'adjacent'
    ? [idx - 2, idx + 2].filter((i) => i >= 0 && i < state.n)
    : zoneTwoAway(idx, state.shape);
}

/**
 * A heal `healed` strong, changed by the creature's own `healReceivedBp` (Well-fed, Long Shadows): the
 * one scaling every heal from a source other than a Support's Mend shares (Kind Rain, Second wind,
 * Second breath, Hollow Weave). Rounded down; the caller still caps it at what is missing.
 */
export function receivedHeal(c: Creature, healed: number): number {
  return c.mods.healReceivedBp === 0
    ? healed
    : Math.floor((healed * Math.max(0, 10_000 + c.mods.healReceivedBp)) / 10_000);
}

/** The key of a (mark element, trigger element) pair in `reactionByPair`. */
export function reactionKey(mark: Element, trigger: Element): string {
  return `${mark}<${trigger}`;
}

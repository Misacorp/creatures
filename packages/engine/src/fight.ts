import {
  ELEMENTS,
  RULES,
  content,
  effectiveStats,
  int,
  NO_LUCK,
  PATTERN_OPS,
  type AdaptationDef,
  type BossDef,
  type ContentPack,
  type CritBonus,
  type Effect,
  type Element,
  type FinaleAbilityDef,
  type Gimmick,
  type LuckConfig,
  type ReactionDef,
  type Rng,
  type Role,
  type Stats,
  type TurnOrder,
  type Zone,
} from '@creatures/game';
import { firingIndex, gimmickDue, sweepRow } from './gimmick-schedule';
import { matchupBp } from './matchup';
import { cutBp, resolveMods, type ResolvedMods } from './mods';
import { sanitizeBp, type CreatureView, type Mutator, type MutatorHooks } from './mutators';
import {
  DEFAULT_DECAY_BP,
  DICE_RANGE,
  PATTERN_DICE,
  diceWindow,
  planChain,
  pickGuardWith,
  planPattern,
  type PatternContext,
  type PatternPlan,
} from './patterns';
import type {
  AbilityChoice,
  AdaptationSuggestion,
  CreatureTotals,
  FightEvent,
  FightInput,
  FightResult,
  FightRules,
  PlayerTotals,
} from './types';
import {
  ZONES,
  nearestLivingZone,
  neighbours,
  zoneIndices,
  zoneNeighbours,
  zoneOfIndex,
} from './zones';

export interface FightOptions {
  /** Mutators registered in code. A mutator runs only if `input.mutators` also lists its id. */
  mutators?: readonly Mutator[];
  /** Content to use instead of the shipped pack (tests). */
  pack?: ContentPack;
}

interface Creature {
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
  /** Support buffs waiting for this creature's next hit. */
  buffs: { from: number; bp: number }[];
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
}

interface Mark {
  element: Element;
  creature: Creature | null;
  player: string | null;
  /** Another creature's hit cannot replace it (`SlotMods.sealMark`). */
  sealed?: boolean;
}

type CreditKind = 'damage' | 'setupCredit' | 'supportCredit' | 'guardCredit';

function pick(result: unknown, key: string): unknown {
  return typeof result === 'object' && result !== null
    ? (result as Record<string, unknown>)[key]
    : undefined;
}

function zeroTotals(): PlayerTotals {
  return { damage: 0, setupCredit: 0, supportCredit: 0, guardCredit: 0, contribution: 0 };
}

function fail(message: string): never {
  throw new RangeError(`invalid fight input: ${message}`);
}

function isCount(n: number, min: number): boolean {
  return Number.isSafeInteger(n) && n >= min;
}

/**
 * The first zone attack of the boss from round 2 on (within `rounds`), or null if it has none: a
 * `hit_zone`, or a sweep of one named row (the row its walk reaches in that round; a sweep of
 * `all` rows or of the Payoff row names no row and does not count). A charged sweep counts in the round it lands (the
 * default Shield Wall goes there, not to the announcement a round earlier).
 */
function firstZoneHit(boss: BossDef, rounds: number): { round: number; zone: Zone } | null {
  for (let r = 2; r <= rounds; r++) {
    for (const g of boss.gimmicks) {
      if (g.op === 'hit_zone' && gimmickDue(g, r)) return { round: r, zone: g.zone };
      const sweep = g.op === 'charge' ? g.then : g;
      if (sweep.op === 'sweep' && gimmickDue(g, r)) {
        const row = sweepRow(sweep.rows, firingIndex(g, r));
        if (row !== 'all' && row !== 'payoffs') return { round: r, zone: row };
      }
    }
  }
  return null;
}

/** True if the ability can only work with a creature: it strikes or uses `own` zone or element. */
export function needsCreature(def: FinaleAbilityDef): boolean {
  return def.effects.some(
    (e: Effect) =>
      e.op === 'strike' ||
      (e.op === 'shield_wall' && e.zone === 'own') ||
      (e.op === 're_mark' && e.element === 'own'),
  );
}

/**
 * The round (1-based) a finale ability fires at when its player does nothing: the content default
 * round, or for abilities that default to the boss's first zone attack (Shield Wall), the round of
 * that attack, falling back to the content default if the boss has none. `simulateFight` uses this
 * same function, so the live finale and the engine can never disagree about default timing. Pass
 * the number of rounds of the fight (`boss.finaleRounds` for a finale).
 */
export function defaultAbilityRound(
  boss: BossDef,
  ability: FinaleAbilityDef,
  rounds: number,
): number {
  if (ability.defaultAtZoneHit === true) {
    const hit = firstZoneHit(boss, rounds);
    if (hit !== null) return hit.round;
  }
  return ability.defaultRound;
}

/**
 * Runs one phase of a boss fight and returns the result and the event log.
 *
 * Deterministic for a given input, mutator set and RNG: the MVP rules draw no randomness (ties
 * break by position); the RNG is handed to mutator hooks for future content.
 * All maths is integer maths in basis points with floor. Overkill on a killing blow: without `rules`
 * it counts as dealt for credit (the boss pool never goes below 0); with `rules` damage counts only
 * up to the HP the boss had left, as at a phase floor.
 *
 * Round order: round start (charge announcements, reflect arming, support buffs, Kind Rain's heal,
 * finale abilities), each living and non-silenced creature in turn order (a creature named in
 * `skipFirstTurn` loses its first one: Morning Haze; the first reaction of a round sends a share of
 * its bonus back when `brambleBp` is set: Bramble Season), boss gimmicks due this round, the boss's
 * normal attack, round end. The fight ends early when the pool reaches 0, when it reaches the phase
 * floor (`bossHpFloor`: the boss retreats) or when every creature is knocked out.
 *
 * Enrage (`input.enrage`): when the base rounds run out with the boss and a creature standing, up to
 * `enrage.rounds` more rounds are played. An enrage round has `round_start`, `enrage`, the creatures'
 * turns, the boss's plain attack, then a hit on every living creature (`source: 'enrage'`). Gimmicks
 * do not fire (a charge is never announced to land in one, the reflect trap is not armed) and finale
 * abilities do not fire (they are kept to the base rounds); rallies and Shield Walls already running
 * still apply.
 */
export function simulateFight(
  input: FightInput,
  rng: Rng,
  options: FightOptions = {},
): FightResult {
  const pack = options.pack ?? content;
  const { boss, phase } = input;
  const n = input.row.length;

  // ---- validation ----
  if (n < 1) fail('the row is empty');
  const pool = input.bossHpPool;
  if (!isCount(pool.max, 1) || !isCount(pool.current, 0) || pool.current > pool.max) {
    fail('bossHpPool needs integers with 0 <= current <= max and max >= 1');
  }
  if (!isCount(input.bossAtk, 1)) fail('bossAtk must be an integer >= 1');
  const bossAttacks = input.bossAttacks ?? 1;
  if (!Number.isInteger(bossAttacks) || bossAttacks < 1 || bossAttacks > 3) {
    fail('bossAttacks must be an integer from 1 to 3');
  }
  const rainHealBp = input.rainHealBp ?? 0;
  if (!isCount(rainHealBp, 0) || rainHealBp > 10_000) {
    fail('rainHealBp must be an integer from 0 to 10000');
  }
  const brambleBp = input.brambleBp ?? 0;
  if (!isCount(brambleBp, 0) || brambleBp > 10_000) {
    fail('brambleBp must be an integer from 0 to 10000');
  }
  const phaseCfg = RULES.raid.phases.find((p) => p.id === phase);
  if (phaseCfg === undefined) fail(`unknown phase "${phase}"`);
  const rounds = phase === 'finale' ? boss.finaleRounds : phaseCfg.rounds;
  const players = new Set(input.players);
  if (players.size !== input.players.length) fail('duplicate player ids');
  const ids = new Set<string>();
  for (const s of input.row) {
    if (ids.has(s.id)) fail(`duplicate creature id "${s.id}"`);
    ids.add(s.id);
    if (s.ownerId !== null && !players.has(s.ownerId)) {
      fail(`creature "${s.id}" belongs to a player who is not signed up`);
    }
  }
  /** Morning Haze: creatures that have not yet skipped the turn they owe (a turn they never reach never counts). */
  const hazePending = new Set<string>(input.skipFirstTurn ?? []);
  for (const id of hazePending) {
    if (!ids.has(id)) fail(`skipFirstTurn names unknown creature "${id}"`);
  }

  const reactionByMark = new Map<Element, ReactionDef>();
  for (const r of pack.reactions) reactionByMark.set(r.markElement, r);
  const abilityDefs = new Map<string, FinaleAbilityDef>();
  for (const a of pack.finaleAbilities) abilityDefs.set(a.id, a);

  let rule: AdaptationDef | null = null;
  /** The last round the adaptation is switched off by a purge (0: never purged). */
  let purgedThrough = 0;
  if (input.adaptation !== null) {
    rule = pack.adaptations.find((a) => a.id === input.adaptation?.rule) ?? null;
    if (rule === null) fail(`unknown adaptation rule "${input.adaptation.rule}"`);
  }
  const adaptationTarget = input.adaptation?.target ?? '';

  // ---- the phase floor and enrage (absent: neither) ----
  const bossFloor = input.bossHpFloor ?? 0;
  if (!isCount(bossFloor, 0) || bossFloor > pool.max) {
    fail('bossHpFloor must be an integer from 0 to the pool maximum');
  }
  const enrage = input.enrage;
  if (enrage !== undefined) {
    if (!isCount(enrage.rounds, 0) || enrage.rounds > 12) {
      fail('enrage.rounds must be an integer from 0 to 12');
    }
    if (!isCount(enrage.powerBp, 0) || enrage.powerBp > 1_000_000) {
      fail('enrage.powerBp must be an integer from 0 to 1000000');
    }
  }

  // ---- luck (all off by default) ----
  const luck: LuckConfig = input.luck ?? NO_LUCK;
  checkLuck(luck);
  const critOn = luck.critChanceBp > 0;
  const bossCrit = bossCritStats(luck, boss.crit);
  const bossCritOn = bossCrit.chanceBp > 0;
  const randomTargetBp = luck.bossRandomTargetBp ?? 0;
  // ---- combat rules (absent: the rules before attack patterns) ----
  const rules = input.rules;
  if (rules !== undefined) checkRules(rules);
  const spreadOn = luck.spreadBp > 0;
  const swingOn = luck.surgeChanceBp > 0 || luck.slumpChanceBp > 0;
  /** This round's dice, drawn at the start of every round whatever happens, so a creature's roll depends on the seed, the round and its slot only. */
  interface Dice {
    crit: number;
    spread: number;
  }
  let turnDice: Dice[] = [];
  let strikeDice: Dice[] = [];
  /** This round's boss crit dice by target slot: one set for its normal attack, one for gimmicks. */
  let bossAttackDice: number[] = [];
  let bossGimmickDice: number[] = [];
  /**
   * With `bossAttacks` above 1 (and boss crits on): the crit dice of the 2nd and 3rd plain attacks,
   * by target slot. Drawn after every other die of the round, and only then, so a fight with one
   * attack a round (every older one) draws what it always did.
   */
  let extraAttackDice: number[][] = [];
  /** This round's dice for a random boss target: whether it applies, and which living creature. */
  let targetDice = { use: 10_000, pick: 0 };
  /**
   * This round's pattern dice: 40 uniform integers in [0, 1_000_000), drawn after every other die,
   * and only when the boss has a pattern op (`PATTERN_OPS`), so a boss without one draws what it
   * always did. Each gimmick reads its own window of them (`diceWindow`).
   */
  const patternsOn = boss.gimmicks.some((g) => (PATTERN_OPS as readonly string[]).includes(g.op));
  let patternDice: number[] = [];
  /**
   * With `rules` only: one die per slot per round, uniform in [0, `DICE_RANGE`), drawn after every
   * other die and drawn every round whatever happens. It picks the Guard when several could take a
   * hit on that slot (`guardFor`). Every hit on the same slot in the same round reuses the same die,
   * so those hits pick the same position among the candidates (two hits on one slot meet the same
   * Guard unless one of the Guards fell in between).
   */
  let guardDice: number[] = [];
  /** The running Surge (+) or Slump (-) in basis points of team damage, and its last round. */
  let swingNow = 0;
  let swingUntil = 0;

  // ---- state ----
  const reactionIds = pack.reactions.map((r) => r.id);
  const creatures: Creature[] = input.row.map((s, idx) => {
    const stats: Stats = s.stats ?? statsFor(pack, s.speciesId, s.level, s.fusionCount);
    const crit = critOn ? creatureCritStats(luck, s.crit) : { chanceBp: 0, damageBp: 0 };
    const maxHp =
      s.role === 'guard'
        ? Math.floor(
            (stats.hp *
              (10_000 + (rules === undefined ? RULES.combat.guardHpBp : rules.guardHpBp))) /
              10_000,
          )
        : stats.hp;
    if (s.hp !== undefined && !isCount(s.hp, 0))
      fail(`creature "${s.id}" needs an integer hp >= 0`);
    const startHp = s.hp === undefined ? maxHp : Math.min(maxHp, s.hp);
    return {
      idx,
      id: s.id,
      ownerId: s.ownerId,
      name: s.name,
      element: s.element,
      role: s.role,
      atk: stats.atk,
      spd: stats.spd,
      hp: startHp,
      maxHp,
      alive: startHp > 0,
      silenced: 0,
      buffs: [],
      critChanceBp: crit.chanceBp,
      critBp: crit.damageBp,
      mods: resolveMods(s.id, s.mods, reactionIds),
      turnHits: 0,
      cashes: 0,
      critWindowUntil: 0,
      sealed: false,
    };
  });

  const hpStartById = Object.fromEntries(creatures.map((c) => [c.id, c.hp]));
  const perPlayer: Record<string, PlayerTotals> = {};
  for (const p of input.players) perPlayer[p] = zeroTotals();
  const perCreature: Record<string, CreatureTotals> = {};
  for (const c of creatures) {
    perCreature[c.id] = {
      ...zeroTotals(),
      ownerId: c.ownerId,
      damageTaken: 0,
      knockedOutRound: null,
    };
  }
  const reactionsByType: Record<string, number> = {};
  for (const r of pack.reactions) reactionsByType[r.id] = 0;
  let reactionTotal = 0;
  const damageByElement = { tide: 0, ember: 0, grove: 0, spark: 0 } satisfies Record<
    Element,
    number
  >;
  const events: FightEvent[] = [];

  let bossHp = pool.current;
  const bossHpStart = bossHp;
  /** The boss reached its phase floor and retreated: the fight is over. */
  let retreated = false;
  /** Enrage rounds were played. */
  let enraged = false;
  let mark = null as Mark | null;
  let bossDamageBp = 0;

  // ---- mutators ----
  const registry = new Map<string, Mutator>();
  for (const m of options.mutators ?? []) if (!registry.has(m.id)) registry.set(m.id, m);
  const active: Mutator[] = [];
  for (const id of new Set(input.mutators ?? [])) {
    const m = registry.get(id);
    if (m !== undefined) active.push(m);
  }
  let currentRound = 0;
  const view = (c: Creature): CreatureView => ({
    id: c.id,
    ownerId: c.ownerId,
    element: c.element,
    role: c.role,
    position: c.idx,
    hp: c.hp,
    maxHp: c.maxHp,
    alive: c.alive,
  });
  const baseContext = () => ({
    phase,
    round: currentRound,
    bossHp,
    bossMaxHp: pool.max,
    mark: mark?.element ?? null,
    creatures: creatures.map(view),
    rng,
  });
  /** Runs a hook on every active mutator; `collect` gets the hook results (basis-point deltas). */
  function runHook<K extends keyof MutatorHooks>(
    name: K,
    makeContext: () => Parameters<MutatorHooks[K]>[0],
    collect?: (result: ReturnType<MutatorHooks[K]>) => void,
  ): void {
    if (active.length === 0) return;
    const ctx = makeContext();
    for (const m of active) {
      const hook = m.hooks[name] as ((c: typeof ctx) => ReturnType<MutatorHooks[K]>) | undefined;
      if (hook === undefined) continue;
      const result = hook(ctx);
      if (collect !== undefined) collect(result);
    }
  }

  // ---- crediting ----
  function credit(c: Creature | null, playerId: string | null, kind: CreditKind, amount: number) {
    if (amount === 0) return;
    if (c !== null) (perCreature[c.id] as CreatureTotals)[kind] += amount;
    const owner = c !== null ? c.ownerId : playerId;
    if (owner !== null) {
      const p = perPlayer[owner];
      if (p !== undefined) p[kind] += amount;
    }
  }

  // ---- turn order ----
  const order = turnOrder(creatures, input.turnOrderOverride ?? boss.turnOrder);

  // ---- finale abilities ----
  const zoneHit = firstZoneHit(boss, rounds);
  interface Scheduled {
    choice: AbilityChoice;
    def: FinaleAbilityDef;
    byDefault: boolean;
    /** The creature the ability belongs to, if it has one. */
    source: Creature | null;
  }
  const abilitiesByRound = new Map<number, Scheduled[]>();
  const abilityKeys = new Set<string>();
  for (const choice of input.finaleAbilities) {
    const def = abilityDefs.get(choice.abilityId);
    if (def === undefined) fail(`unknown finale ability "${choice.abilityId}"`);
    if (!players.has(choice.playerId)) fail(`ability of unknown player "${choice.playerId}"`);
    if (choice.fireAtRound !== undefined && !isCount(choice.fireAtRound, 1)) {
      fail('fireAtRound must be an integer >= 1');
    }
    if (typeof choice.key !== 'string' || choice.key.length < 1 || choice.key.length > 64) {
      fail('an ability key must be 1 to 64 characters');
    }
    if (abilityKeys.has(choice.key)) fail(`duplicate ability key "${choice.key}"`);
    abilityKeys.add(choice.key);
    let source: Creature | null = null;
    if (choice.creatureId !== undefined) {
      source = creatures.find((c) => c.id === choice.creatureId) ?? null;
      if (source === null) fail(`ability "${choice.key}" names an unknown creature`);
      if (source.ownerId !== choice.playerId) {
        fail(`ability "${choice.key}" names a creature of another player`);
      }
    } else if (needsCreature(def)) {
      fail(`ability "${choice.key}" needs a creature`);
    }
    const byDefault = choice.fireAtRound === undefined;
    const round = choice.fireAtRound ?? defaultAbilityRound(boss, def, rounds);
    const list = abilitiesByRound.get(round) ?? [];
    list.push({ choice, def, byDefault, source });
    abilitiesByRound.set(round, list);
  }

  // ---- damage to creatures ----
  const shields: { zone: Zone; reduceBp: number; until: number }[] = [];
  const livingIn = (zone: Zone): Creature[] =>
    zoneIndices(zone, n)
      .map((i) => creatures[i] as Creature)
      .filter((c) => c.alive);

  /**
   * The Guard that takes a hit aimed at `target`: by default one standing in the target's zone;
   * with `guardReach: 'adjacent'`, one standing right beside it (the left neighbour first).
   */
  const guardReach = input.guardReach ?? 'zone';
  /**
   * Who is "beside" a slot. The raid's adjacency stops at zone edges; the dungeon (`adjacent`
   * reach: a row of three, one slot per zone) has no usable zones, so it keeps the plain line.
   */
  const besides = (idx: number): number[] =>
    guardReach === 'adjacent' ? neighbours(idx, n) : zoneNeighbours(idx, n);
  /**
   * The slots two places away from `idx` in its row (a gear set's longer reach: a Guard's cover, a Support's
   * boost): the raid's row is a zone, so the slot must be in the same zone; the dungeon's line has no zones.
   */
  const further = (idx: number): number[] =>
    [idx - 2, idx + 2].filter(
      (i) =>
        i >= 0 && i < n && (guardReach === 'adjacent' || zoneOfIndex(i, n) === zoneOfIndex(idx, n)),
    );
  function guardFor(target: Creature): Creature | undefined {
    const candidates =
      guardReach === 'adjacent'
        ? besides(target.idx)
            .map((i) => creatures[i] as Creature)
            .filter((c) => c.alive && c.role === 'guard')
        : livingIn(zoneOfIndex(target.idx, n)).filter((c) => c.role === 'guard');
    return pickGuard(candidates, target.idx);
  }

  /**
   * One of several Guards that could take a hit on slot `slot`. Without `rules` always the first
   * (the left one); with `rules` that slot's die picks one, uniformly.
   */
  function pickGuard(candidates: Creature[], slot: number): Creature | undefined {
    return pickGuardWith(candidates, slot, rules === undefined ? undefined : guardDice);
  }

  /**
   * The share of damage a Guard does not take (basis points): the rules' armor
   * (`FightRules.guardArmorBp`) plus the Guard's own sheet (`mods.armorBp`).
   */
  function guardArmorFor(c: Creature): number {
    if (rules === undefined || c.role !== 'guard') return 0;
    return Math.max(0, Math.min(10_000, rules.guardArmorBp + c.mods.armorBp));
  }

  /**
   * A living Guard right beside `victim` (as the Support's `besides` counts it), as it stands now:
   * the Guard whose cover softens an area hit (left neighbour first).
   */
  function coverGuardFor(victim: Creature): Creature | undefined {
    for (const i of besides(victim.idx)) {
      const c = creatures[i] as Creature;
      if (c.alive && c.role === 'guard') return c;
    }
    // A Guard with a longer reach (`coverReach`) also covers the creature one slot further out.
    for (const i of further(victim.idx)) {
      const c = creatures[i] as Creature;
      if (c.alive && c.role === 'guard' && c.mods.coverReach) return c;
    }
    return undefined;
  }

  /**
   * One hit on `target`, in one of three modes (docs/design/attack-patterns.md section 1):
   * - `aimed`: a Guard of the target's row (the dungeon: beside it) takes it instead;
   * - `area`: nobody steps in, but (with `rules`) a creature beside a living Guard takes `coverBp`
   *   less, credited to the Guard;
   * - `reflect` (a reaction's hit coming back at the hitter, not a boss attack): without `rules`
   *   nothing intercepts, covers or caps it; with `rules` a Guard takes it as an aimed hit, but it
   *   is not covered and not capped (the single-hit cap is for the boss's attacks).
   *
   * The reductions on one hit, in this order (each works on what the one before left; every
   * division rounds down, so the damage prevented rounds down):
   * 1. Intercept (aimed; a reflect with `rules`): the Guard that takes the hit is picked. With
   *    several candidates a die picks one (`guardDice`).
   * 2. Shield Walls (the hit can be stopped fully): with `rules` the walls on the zone of the
   *    creature that takes the hit (after the Guard stepped in); without `rules` the walls on the
   *    zone the hit was aimed at. In the raid a Guard is in the target's zone, so it never differs.
   * 3. Armor: the creature taking the hit is a Guard (`guardArmorFor`, `rules` only).
   * 4. Cover: the creature taking the hit is beside a living Guard and the hit is an area hit
   *    (`rules` only; never on a Guard, so armor and cover never stack).
   * 5. The taker's sheet (`SlotMods`), each step rounding down: the ward against the boss's element
   *    (`wardBp`), charged moves (`chargedBp`, only a charge landing), the hit's shape (`areaBp`,
   *    `aimedBp` or `reflectedBp`), then every hit (`takenBp`). Works with or without `rules`.
   * 6. The single-hit cap (aimed and area only, `rules` only), on the victim's max HP.
   *
   * Credit: a Guard is credited the damage it takes in place of another creature, and with it what
   * its armor really prevented on that hit; a cover credits the beside Guard with what it prevented.
   * Prevention that the cap would have made anyway is not credited. Returns who took the hit.
   *
   * Overkill (`rules` only): a creature loses at most the HP it has left, and the `boss_hit` event
   * logs that HP (`damage`), not the proposed amount; credit counts the damage a Guard really took
   * and the damage its armor or cover really saved (what it prevented, up to the HP that was left).
   */
  function hurt(
    target: Creature,
    rawAmount: number,
    source: 'attack' | 'gimmick' | 'reflect' | 'enrage',
    mode: 'aimed' | 'area' | 'reflect',
    /** The boss crit die of this hit (absent: the hit cannot crit). */
    die?: number,
    /** A slam's splash. */
    splash = false,
    /** The hit is a charged move landing (`SlotMods.chargedBp`). */
    charged = false,
  ): Creature {
    const crit = die !== undefined && bossCritOn && die < bossCrit.chanceBp;
    let amount = Math.max(
      0,
      Math.floor((rawAmount * (10_000 + bossDamageBp + (crit ? bossCrit.damageBp : 0))) / 10_000),
    );
    // 1. Who takes it (an aimed hit: a Guard steps in, see `guardFor`). The pick uses no state of the
    // hit, so doing it before the Shield Wall changes nothing for a hit the wall stops.
    let victim = target;
    const intercepts = mode === 'aimed' || (mode === 'reflect' && rules !== undefined);
    if (intercepts && target.role !== 'guard') {
      const guard = guardFor(target);
      if (guard !== undefined) victim = guard;
    }
    // 2. Shield Walls on the zone multiply: two 50% walls leave 25% of the damage. With `rules` the
    // wall that counts is the one on the zone of the creature that TAKES the hit (after a Guard
    // stepped in); without `rules` it is the zone the hit was aimed at (stored fights replay so).
    const walled = rules === undefined ? target : victim;
    const zone = zoneOfIndex(walled.idx, n);
    let remainingBp = 10_000;
    for (const w of shields) {
      if (w.zone === zone && w.until >= currentRound) {
        remainingBp = Math.floor((remainingBp * (10_000 - w.reduceBp)) / 10_000);
      }
    }
    if (remainingBp === 0) {
      events.push({
        t: 'boss_hit',
        round: currentRound,
        source,
        target: walled.id,
        damage: 0,
        shielded: true,
        ...(walled !== target ? { from: target.id } : {}),
        ...(splash ? { splash: true as const } : {}),
      });
      return walled;
    }
    const reducedBp = 10_000 - remainingBp;
    if (reducedBp > 0) amount = Math.floor((amount * remainingBp) / 10_000);
    // Armor, cover and the single-hit cap only exist with `rules`. The damage they prevent for the
    // Guard's credit is what they really saved (less than their share when the cap would have cut
    // the hit anyway). Armor needs a Guard victim and cover a victim that is not one, so at most one
    // of them applies to a hit.
    let covered: { guard: string; prevented: number } | undefined;
    let armored = 0;
    let capped = false;
    // 5. The taker's sheet: ward, charged, shape, every hit, in this order (a no-op without one).
    const sheet = (x: number): number => {
      const m = victim.mods;
      let out = cutBp(x, m.wardBp[boss.element] ?? 0);
      if (charged) out = cutBp(out, m.chargedBp);
      out = cutBp(out, mode === 'area' ? m.areaBp : mode === 'aimed' ? m.aimedBp : m.reflectedBp);
      return cutBp(out, m.takenBp);
    };
    let warded: number;
    if (rules !== undefined) {
      const capAt =
        mode !== 'reflect' && rules.maxHitBp > 0
          ? Math.max(1, Math.floor((victim.maxHp * rules.maxHitBp) / 10_000))
          : Number.POSITIVE_INFINITY;
      let after = amount;
      // 3. Armor.
      const armorBp = guardArmorFor(victim);
      if (armorBp > 0) after = amount - Math.floor((amount * armorBp) / 10_000);
      // 4. Cover.
      const guard =
        mode === 'area' && rules.coverBp > 0 && victim.role !== 'guard'
          ? coverGuardFor(victim)
          : undefined;
      if (guard !== undefined) {
        const coverBp = Math.max(
          0,
          Math.min(10_000, rules.coverBp + guard.mods.coverBp + victim.mods.shelterBp),
        );
        after = amount - Math.floor((amount * coverBp) / 10_000);
      }
      // 5. The taker's sheet, on what armor or cover left.
      const afterSheet = sheet(after);
      warded = after - afterSheet;
      // 6. The single-hit cap.
      capped = afterSheet > capAt;
      const final = Math.min(afterSheet, capAt);
      // What armor or cover really saved: the hit as it would have ended without them, less the hit.
      const prevented = Math.min(sheet(amount), capAt, victim.hp) - Math.min(final, victim.hp);
      if (guard !== undefined && prevented > 0) {
        covered = { guard: guard.id, prevented };
        credit(guard, null, 'guardCredit', prevented);
      }
      if (armorBp > 0 && prevented > 0) {
        armored = prevented;
        // Armor on a hit aimed at the Guard itself is not credited.
        if (victim !== target) credit(victim, null, 'guardCredit', prevented);
      }
      amount = final;
    } else {
      const afterSheet = sheet(amount);
      warded = amount - afterSheet;
      amount = afterSheet;
    }
    const taken = Math.min(amount, victim.hp);
    victim.hp -= taken;
    (perCreature[victim.id] as CreatureTotals).damageTaken += taken;
    // Guard credit: all of the damage a Guard takes in place of a neighbour, and `guardOwnCreditBp`
    // of what it takes when the hit was aimed at the Guard itself.
    if (victim.role === 'guard') {
      const share = victim !== target ? 10_000 : RULES.combat.guardOwnCreditBp;
      credit(victim, null, 'guardCredit', Math.floor((taken * share) / 10_000));
    }
    events.push({
      t: 'boss_hit',
      round: currentRound,
      source,
      target: victim.id,
      damage: amount,
      ...(victim !== target ? { from: target.id } : {}),
      ...(reducedBp > 0 ? { reducedBp } : {}),
      ...(crit && amount > 0 ? { crit: true as const, critBp: bossCrit.damageBp } : {}),
      ...(splash ? { splash: true as const } : {}),
      ...(covered === undefined ? {} : { covered }),
      ...(armored > 0 ? { armored } : {}),
      ...(capped ? { capped: true as const } : {}),
      ...(warded === 0 ? {} : { warded }),
    });
    if (victim.hp === 0 && victim.alive) {
      victim.alive = false;
      (perCreature[victim.id] as CreatureTotals).knockedOutRound = currentRound;
      events.push({ t: 'knockout', round: currentRound, creature: victim.id });
      runHook('onKnockout', () => ({ ...baseContext(), creature: view(victim) }));
    }
    return victim;
  }

  // ---- a creature hits the boss ----
  let roundBonusBp = 0;
  const rallies: { bp: number; until: number }[] = [];
  const rallyBp = (): number =>
    rallies.reduce((sum, r) => (r.until >= currentRound ? sum + r.bp : sum), 0);
  const adaptationOn = (): boolean => rule !== null && currentRound > purgedThrough;
  let reflectArmed = false;
  let reflectUsed = false;
  /** Bramble Season: this round's first reaction has been seen (a reflected one counts too). */
  let brambleUsed = false;

  /**
   * A creature hits the boss: its turn, or (with `strike`) an ability's strike, which hits for a
   * share of Attack, leaves the creature's support buffs for its next turn and lands even if the
   * creature is knocked out.
   */
  function hitBoss(c: Creature, strike?: { atkBp: number; ability: string; key: string }): void {
    const matchup = matchupBp(c.element, boss.element, pack.elements);
    const atk = strike === undefined ? c.atk : Math.floor((c.atk * strike.atkBp) / 10_000);
    const buffs = strike === undefined ? c.buffs : [];
    if (strike === undefined) c.buffs = [];
    const supportBp = buffs.reduce((sum, b) => sum + b.bp, 0);
    const markBefore = mark;

    const m = c.mods;

    let reaction: ReactionDef | undefined;
    if (markBefore !== null) {
      const candidate = reactionByMark.get(markBefore.element);
      if (candidate !== undefined && candidate.triggerElement === c.element) reaction = candidate;
    }
    const trapped = reaction !== undefined && c.alive && reflectArmed && !reflectUsed;
    if (trapped) reflectUsed = true;
    // A gear set turns the trap aside for the creature's first reaction of the fight (`unreflected`).
    const proof = trapped && m.unreflected && c.cashes === 0;
    const reflected = trapped && !proof;
    // Bramble Season: the first reaction each round (by a creature still standing) sends a share of
    // its bonus back. A reaction Backdraft already reflected in full uses the round's first up.
    const brambling = reaction !== undefined && c.alive && brambleBp > 0 && !brambleUsed;
    if (brambling) brambleUsed = true;
    const brambled = brambling && !reflected;

    const dice = (strike === undefined ? turnDice : strikeDice)[c.idx];
    let luckBp = swingNow;
    let crit = false;
    let setCrit = false;
    let warm = false;
    if (dice !== undefined) {
      // A hit that sets off a reaction crits more often with keen reactions (under the crit cap).
      const critChanceBp =
        reaction !== undefined && m.keenReactionBp !== 0
          ? Math.max(0, Math.min(luck.critMaxChanceBp ?? 10_000, c.critChanceBp + m.keenReactionBp))
          : c.critChanceBp;
      // A gear set makes the first reaction a crit (`firstReactionCrit`); crits must be on.
      setCrit = critOn && reaction !== undefined && m.firstReactionCrit && c.cashes === 0;
      if (critOn && (dice.crit < critChanceBp || setCrit)) {
        crit = true;
        luckBp += c.critBp;
        // After a reaction, a gear set's crit window adds crit damage until the end of the next round.
        if (m.critWindowBp !== 0 && c.critWindowUntil >= currentRound) {
          warm = true;
          luckBp += m.critWindowBp;
        }
      }
      luckBp += dice.spread;
    }

    // The creature's sheet on its hit (`SlotMods`), added to the one combined bonus.
    let sheetBp = m.vsElementBp[boss.element] ?? 0;
    if (markBefore !== null && reaction === undefined) sheetBp += m.markedFoeBp;
    // A setter's hit of another element replaces the mark, unless it is sealed (`sealMark`).
    const replaces =
      c.role === 'setter' &&
      markBefore !== null &&
      markBefore.element !== c.element &&
      markBefore.sealed !== true;
    if (reaction === undefined && (markBefore === null || replaces)) {
      sheetBp += m.markingHitBp;
    }
    if (strike !== undefined) {
      sheetBp += m.strikeBp;
    } else {
      if (c.turnHits === 0) sheetBp += m.firstHitBp;
      c.turnHits += 1;
    }
    const roleBonuses = Object.entries(m.besideRoleBp);
    if (roleBonuses.length > 0) {
      const near = besides(c.idx)
        .map((i) => creatures[i] as Creature)
        .filter((o) => o.alive);
      for (const [role, bp] of roleBonuses) {
        if (near.some((o) => o.role === role)) sheetBp += bp;
      }
    }

    let hookBp = 0;
    runHook(
      'onBeforeHit',
      () => ({ ...baseContext(), creature: view(c), matchupBp: matchup }),
      (r) => {
        hookBp += sanitizeBp(pick(r, 'damageBonusBp'));
      },
    );
    let reactionHookBp = 0;
    if (reaction !== undefined) {
      const r = reaction;
      runHook(
        'onReaction',
        () => ({ ...baseContext(), reaction: r.id, payoff: view(c), reflected }),
        (res) => {
          reactionHookBp += sanitizeBp(pick(res, 'bonusBp'));
        },
      );
    }

    const adapting = adaptationOn();
    const elementResist =
      adapting && rule?.kind === 'top_element' && adaptationTarget === c.element
        ? cutBp(rule.resistBp, m.pierceBp)
        : 0;
    const reactionResist =
      adapting &&
      reaction !== undefined &&
      rule?.kind === 'top_reaction' &&
      adaptationTarget === reaction.id
        ? cutBp(rule.resistBp, m.pierceBp)
        : 0;

    // Element effects of Supports beside the hitter (`rules.supportFx[...].reactionBp`, Spark's
    // Overcharge): a living, non-silenced Support adds its share of the reaction's bonus. Not on a
    // reflected reaction (that bonus comes back at the hitter).
    // A Support's sheet adds to it (`shareBp`).
    const overcharge: { s: Creature; bp: number }[] = [];
    if (reaction !== undefined && !reflected) {
      for (const i of besides(c.idx)) {
        const s = creatures[i] as Creature;
        const bp = (rules?.supportFx[s.element]?.reactionBp ?? 0) + s.mods.shareBp;
        if (s.role === 'support' && s.alive && s.silenced === 0 && bp > 0)
          overcharge.push({ s, bp });
      }
    }
    const overchargeBp = overcharge.reduce((sum, o) => sum + o.bp, 0);

    // The sheets' share of the reaction bonus: the reaction's own line, and the setter's (`ownerMarkBp`).
    const reactionSheetBp =
      reaction === undefined
        ? 0
        : (m.reactionBp[reaction.id] ?? 0) + (markBefore?.creature?.mods.ownerMarkBp ?? 0);
    const calc = (
      modBp: number,
      fxBp = overchargeBp,
    ): { damage: number; bonus: number; reflect: number } => {
      const factor = Math.max(0, 10_000 + Math.max(-10_000, modBp));
      let plain = Math.floor((atk * matchup * factor) / 100_000_000);
      if (elementResist > 0) plain = Math.floor((plain * (10_000 - elementResist)) / 10_000);
      if (reaction === undefined) return { damage: plain, bonus: 0, reflect: 0 };
      let mult = reaction.multiplierBp;
      // A Payoff's bonus, and every creature's pounce, are added together as a share of the multiplier.
      const multFactorBp = (c.role === 'payoff' ? reaction.payoffBonusBp : 10_000) + m.pounceBp;
      if (multFactorBp !== 10_000) mult = Math.floor((mult * Math.max(0, multFactorBp)) / 10_000);
      let bonus = Math.max(0, Math.floor((plain * mult) / 10_000) - plain);
      if (reactionResist > 0) bonus -= Math.floor((bonus * reactionResist) / 10_000);
      bonus = Math.max(
        0,
        Math.floor(
          (bonus * Math.max(0, 10_000 + reactionHookBp + reactionSheetBp + fxBp)) / 10_000,
        ),
      );
      if (reflected) return { damage: plain, bonus: 0, reflect: bonus };
      if (brambled) {
        const back = Math.floor((bonus * brambleBp) / 10_000);
        return { damage: plain + bonus - back, bonus: bonus - back, reflect: back };
      }
      return { damage: plain + bonus, bonus, reflect: 0 };
    };

    const rally = rallyBp();
    const totalBp = supportBp + rally + roundBonusBp + hookBp + luckBp + sheetBp;
    const full = calc(totalBp);
    // The phase floor: a hit that reaches it counts only down to it, so nothing is overkill (the
    // damage, the reaction bonus, the credit and the element totals). The plain hit is counted
    // first, the reaction's bonus gets what is left.
    // With `rules` the killing blow is trimmed the same way: damage counts only up to the HP the
    // boss had left (no overkill), though it is a kill, not a retreat.
    const room = Math.max(0, bossHp - bossFloor);
    const reaches = bossFloor > 0 && full.damage >= room;
    const trimmed = reaches || (rules !== undefined && full.damage >= room);
    const hit = trimmed
      ? {
          ...full,
          damage: room,
          bonus: Math.min(full.bonus, Math.max(0, room - (full.damage - full.bonus))),
        }
      : full;
    bossHp = Math.max(0, bossHp - hit.damage);
    damageByElement[c.element] += hit.damage;

    // Setup / payoff split of the reaction bonus: the setter gets the floor of `setupShareBp` of it,
    // the payoff the rest.
    let setup = 0;
    if (reaction !== undefined && !reflected && markBefore !== null) {
      setup = Math.floor((hit.bonus * RULES.combat.setupShareBp) / 10_000);
      credit(markBefore.creature, markBefore.player, 'setupCredit', setup);
    }

    // Support credit (zero-sum): the extra damage the buffs made possible moves from the hitter's
    // credit to the supporters, shared between them.
    // The element effect's own gain is credited first (what the hit lost without it), so the two
    // gains never overlap: together they are at most the hit's damage. A hit cut short by the floor
    // keeps the shares within what was really dealt.
    let supportShare = 0;
    let budget = trimmed ? Math.max(0, hit.damage - setup) : Number.POSITIVE_INFINITY;
    if (overcharge.length > 0) {
      const gain = Math.min(budget, Math.max(0, hit.damage - calc(totalBp, 0).damage));
      budget -= gain;
      supportShare += gain;
      const k = overcharge.length;
      const each = Math.floor(gain / k);
      let rest = gain - each * k;
      for (const o of overcharge) {
        const extra = rest > 0 ? 1 : 0;
        rest -= extra;
        credit(o.s, null, 'supportCredit', each + extra);
      }
    }
    if (supportBp > 0) {
      const gain = Math.min(
        budget,
        Math.max(0, calc(totalBp, 0).damage - calc(totalBp - supportBp, 0).damage),
      );
      supportShare += gain;
      const k = buffs.length;
      const each = Math.floor(gain / k);
      let rest = gain - each * k;
      for (const b of buffs) {
        const extra = rest > 0 ? 1 : 0;
        rest -= extra;
        credit(creatures[b.from] as Creature, null, 'supportCredit', each + extra);
      }
    }

    credit(c, null, 'damage', hit.damage - setup - supportShare);

    events.push({
      t: 'hit',
      round: currentRound,
      creature: c.id,
      damage: hit.damage,
      matchupBp: matchup,
      bonusBp: totalBp,
      mark: markBefore?.element ?? null,
      bossHp,
      ...(strike === undefined ? {} : { ability: strike.ability, key: strike.key }),
      ...(luckBp === 0 ? {} : { luckBp }),
      ...(crit ? { crit: true as const, critBp: c.critBp + (warm ? m.critWindowBp : 0) } : {}),
      ...(sheetBp === 0 ? {} : { sheetBp }),
      ...(setCrit && crit ? { setCrit: true as const } : {}),
      ...(warm ? { warm: true as const } : {}),
    });

    if (reaction !== undefined && markBefore !== null) {
      reactionsByType[reaction.id] = (reactionsByType[reaction.id] ?? 0) + 1;
      reactionTotal += 1;
      events.push({
        t: 'reaction',
        round: currentRound,
        reaction: reaction.id,
        setupCreature: markBefore.creature?.id ?? null,
        setupPlayer: markBefore.creature !== null ? markBefore.creature.ownerId : markBefore.player,
        payoff: c.id,
        bonus: reflected ? hit.reflect : hit.bonus,
        reflected,
        ...(brambled ? { bramble: { bp: brambleBp, amount: hit.reflect } } : {}),
        ...(reactionSheetBp + m.pounceBp === 0 ? {} : { sheetBp: reactionSheetBp + m.pounceBp }),
        ...(proof ? { proof: true as const } : {}),
        ...(m.chainMark && !reflected ? { chain: true as const } : {}),
      });
      mark = null;
      if (reflected) hurt(c, hit.reflect, 'reflect', 'reflect');
      else if (brambled && hit.reflect > 0) hurt(c, hit.reflect, 'reflect', 'reflect');
      if (!reflected) {
        // The gear sets that act on a reaction that was really cashed.
        if (m.critWindowBp !== 0) c.critWindowUntil = currentRound + 1;
        if (m.healOnReactionBp > 0 && c.alive) {
          const amount = Math.min(
            Math.floor((c.maxHp * m.healOnReactionBp) / 10_000),
            Math.max(0, c.maxHp - c.hp),
          );
          if (amount > 0) {
            c.hp += amount;
            events.push({
              t: 'heal',
              round: currentRound,
              supporter: c.id,
              target: c.id,
              amount,
            });
          }
        }
        if (m.chainMark) {
          mark = { element: c.element, creature: c, player: c.ownerId };
          events.push({
            t: 'mark',
            round: currentRound,
            creature: c.id,
            player: c.ownerId,
            element: c.element,
            replaced: null,
          });
        }
      }
      c.cashes += 1;
    } else if (markBefore === null) {
      const seal = m.sealMark && !c.sealed;
      if (seal) c.sealed = true;
      mark = {
        element: c.element,
        creature: c,
        player: c.ownerId,
        ...(seal ? { sealed: true } : {}),
      };
      events.push({
        t: 'mark',
        round: currentRound,
        creature: c.id,
        player: c.ownerId,
        element: c.element,
        replaced: null,
        ...(seal ? { sealed: true as const } : {}),
      });
    } else if (replaces) {
      const seal = m.sealMark && !c.sealed;
      if (seal) c.sealed = true;
      mark = {
        element: c.element,
        creature: c,
        player: c.ownerId,
        ...(seal ? { sealed: true } : {}),
      };
      events.push({
        t: 'mark',
        round: currentRound,
        creature: c.id,
        player: c.ownerId,
        element: c.element,
        replaced: markBefore.element,
        ...(seal ? { sealed: true as const } : {}),
      });
    }

    if (reaches) {
      retreated = true;
      events.push({ t: 'retreat', round: currentRound, bossHp });
    }
  }

  // ---- finale ability effects ----
  function fireAbility(a: Scheduled): void {
    const { choice, def, byDefault, source } = a;
    // Resolve what the effects need first, so the ability event can say it.
    let zone: Zone | undefined;
    let element: Element | undefined;
    for (const e of def.effects) {
      if (e.op === 'shield_wall') {
        zone =
          e.zone === 'own' && source !== null
            ? zoneOfIndex(source.idx, n)
            : (choice.params?.zone ?? zoneHit?.zone ?? 'front');
      } else if (e.op === 're_mark') {
        // The player's own creature for the default element: a living one first.
        const mine = creatures.filter((c) => c.ownerId === choice.playerId);
        const own = mine.find((c) => c.alive) ?? mine[0];
        element =
          e.element === 'own' && source !== null
            ? source.element
            : (choice.params?.element ?? source?.element ?? own?.element ?? ELEMENTS[0] ?? 'tide');
      }
    }
    events.push({
      t: 'ability',
      round: currentRound,
      player: choice.playerId,
      ability: def.id,
      key: choice.key,
      ...(source === null ? {} : { creature: source.id }),
      ...(zone === undefined ? {} : { zone }),
      ...(element === undefined ? {} : { element }),
      byDefault,
    });
    // Lingering: the ability's creature makes its timed effects last longer (basic abilities have none).
    const linger = source?.mods.lingerRounds ?? 0;
    for (const e of def.effects) {
      switch (e.op) {
        case 'rally':
          rallies.push({ bp: e.damageBp, until: currentRound + e.rounds + linger - 1 });
          break;
        case 'shield_wall':
          shields.push({
            zone: zone as Zone,
            reduceBp: e.reduceBp,
            until: currentRound + e.rounds + linger - 1,
          });
          break;
        case 're_mark':
          events.push({
            t: 'mark',
            round: currentRound,
            creature: source?.id ?? null,
            player: choice.playerId,
            element: element as Element,
            replaced: mark?.element ?? null,
          });
          mark = { element: element as Element, creature: source, player: choice.playerId };
          break;
        case 'purge':
          if (rule !== null && adaptationOn()) {
            events.push({
              t: 'adaptation',
              round: currentRound,
              rule: rule.id,
              target: adaptationTarget,
              status: 'purged',
            });
          }
          // A purge without `rounds` lasts to the end; the longest one wins.
          purgedThrough = Math.max(
            purgedThrough,
            e.rounds === undefined
              ? Number.POSITIVE_INFINITY
              : currentRound + e.rounds + linger - 1,
          );
          break;
        case 'strike':
          if (source !== null && bossHp > 0 && !retreated) {
            hitBoss(source, { atkBp: e.atkBp, ability: def.id, key: choice.key });
          }
          break;
      }
    }
  }

  // ---- boss gimmicks and attack ----
  /**
   * TARGETING RULE (every rule below picks among LIVING creatures only; a knocked-out creature is
   * never a target, so it can never soak up a boss ability). The attack patterns' selection lives in
   * `patterns.ts`; it returns a plan and `resolvePlan` plays it through `hurt()`.
   * - zone strike (`hit_zone`): hits every living creature of the aimed zone; if that zone has
   *   nobody standing, the strike falls to the nearest zone that has (one step away first, the
   *   front-side zone before the back-side one on a tie), so a wiped-out zone does not make the
   *   attack miss. Nothing happens only when the whole row is down. A sweep of a named row does the
   *   same.
   * - row ends (`silence_ends`): the leftmost and the rightmost LIVING creature (one creature
   *   standing is silenced once; nobody standing, nothing).
   * - strongest (`strike_highest_atk`): the living creature with the highest Attack, ties to the
   *   lower slot; with `jumps`, the next strongest after it.
   * - the plain attack: the front-most living creature (or the Guard of its zone), see `bossAttack`.
   * - random target: one of the living creatures.
   * - Guard intercept and Support buffs only count a living Guard or Support, and a buff only goes
   *   to a living neighbour; a Support beside a knocked-out creature simply buffs nobody there.
   */
  function zoneWithLiving(aimed: Zone): Zone | undefined {
    return nearestLivingZone(aimed, (z) => livingIn(z).length > 0);
  }

  /** The creatures hit by each barrage gimmick's last volley (by gimmick id), for the no-repeat rule. */
  const lastVolley = new Map<string, number[]>();

  /** The charges announced and not yet landed, by gimmick index and landing round (a charge due every round has several in the air). */
  const pendingCharges = new Map<string, PatternPlan>();

  /** `atRound` is the round the pattern fires in (a charge is planned a round before it lands). */
  function patternContext(
    g: Gimmick,
    gimmickIndex: number,
    atRound = currentRound,
  ): PatternContext {
    return {
      creatures,
      n,
      firing: firingIndex(g, atRound),
      dice: diceWindow(patternDice, gimmickIndex),
      ...(rules === undefined ? {} : { guardDice }),
      ...(lastVolley.has(g.id) ? { previousVolley: lastVolley.get(g.id) as number[] } : {}),
    };
  }

  /**
   * Plays a plan's hits in order; a slam's splash goes to the living creatures beside the impact.
   * With `rules`, a chain's jumps skip the creature that took its first hit (a Guard that stepped in
   * for it): each jump goes to the next strongest creature not yet hit (`plan.chain`).
   */
  function resolvePlan(plan: PatternPlan, charged = false): void {
    const chain = rules === undefined ? undefined : plan.chain;
    let jumps = chain?.rest ?? [];
    for (const [k, h] of plan.hits.entries()) {
      let targetIdx = h.target;
      if (chain !== undefined && k > 0) {
        const next = jumps[k - 1];
        if (next === undefined) continue;
        targetIdx = next;
      }
      const target = creatures[targetIdx] as Creature;
      // A creature that fell earlier in the same action is not hit again.
      if (!target.alive) continue;
      const raw = Math.floor((input.bossAtk * h.powerBp) / 10_000);
      const impact = hurt(
        target,
        raw,
        'gimmick',
        h.kind,
        bossGimmickDice[target.idx],
        false,
        charged,
      );
      if (chain !== undefined && k === 0) jumps = chain.rest.filter((i) => i !== impact.idx);
      if (plan.splashBp !== undefined && h.kind === 'aimed') {
        const splashRaw = Math.floor((raw * plan.splashBp) / 10_000);
        for (const i of besides(impact.idx)) {
          const next = creatures[i] as Creature;
          if (next.alive) {
            hurt(next, splashRaw, 'gimmick', 'area', bossGimmickDice[next.idx], true, charged);
          }
        }
      }
    }
  }

  /**
   * Charges are announced at the start of the round before they land (after the dice, before the
   * abilities): the inner pattern picks its victims from the creatures standing now, with that
   * round's pattern dice, and the `charge` event names them. The marks are fixed from then on. A
   * charge whose landing round is past the base rounds is never announced (no landing in an enrage
   * round), nor is one that would land in round 1 (there is no round before it).
   */
  function announceCharges(): void {
    const landing = currentRound + 1;
    if (landing > rounds) return;
    for (const [gi, g] of boss.gimmicks.entries()) {
      if (g.op !== 'charge' || !gimmickDue(g, landing)) continue;
      const plan = planPattern(g.then, patternContext(g, gi, landing));
      if (g.then.op === 'barrage') lastVolley.set(g.id, plan.targets);
      pendingCharges.set(`${String(gi)}:${String(landing)}`, plan);
      events.push({
        t: 'charge',
        round: currentRound,
        landing,
        gimmick: g.id,
        op: g.then.op,
        marks: plan.targets.map((i) => (creatures[i] as Creature).id),
        ...(plan.rows === undefined ? {} : { rows: plan.rows }),
      });
    }
  }

  function fireGimmick(g: Gimmick, gimmickIndex: number): void {
    const base = { t: 'gimmick' as const, round: currentRound, gimmick: g.id, op: g.op };
    const named = (plan: PatternPlan): FightEvent => ({
      ...base,
      targets: plan.targets.map((i) => (creatures[i] as Creature).id),
      ...(plan.rows === undefined ? {} : { rows: plan.rows }),
      ...(plan.lane === undefined ? {} : { lane: plan.lane }),
    });
    if (g.op === 'charge') {
      // The marks of the announcement are hit; one that fell since is skipped (nobody is re-aimed).
      const key = `${String(gimmickIndex)}:${String(currentRound)}`;
      const pending = pendingCharges.get(key);
      if (pending === undefined) return;
      pendingCharges.delete(key);
      const standing = pending.targets.filter((i) => (creatures[i] as Creature).alive);
      const rows = pending.rows?.filter((z) => standing.some((i) => zoneOfIndex(i, n) === z));
      events.push(
        named({
          ...pending,
          targets: standing,
          ...(rows === undefined ? {} : { rows }),
        }),
      );
      resolvePlan(pending, true);
      return;
    }
    switch (g.op) {
      case 'hit_zone': {
        events.push(base);
        const zone = zoneWithLiving(g.zone);
        if (zone === undefined) break;
        const amount = Math.floor((input.bossAtk * g.power) / 10_000);
        for (const c of livingIn(zone)) hurt(c, amount, 'gimmick', 'area', bossGimmickDice[c.idx]);
        break;
      }
      case 'silence_ends': {
        events.push(base);
        const standing = creatures.filter((c) => c.alive);
        const first = standing[0];
        const last = standing[standing.length - 1];
        if (first === undefined || last === undefined) break;
        for (const c of first === last ? [first] : [first, last]) {
          // Unbothered: the silence still picks it (the ends), and does nothing to it.
          if (c.mods.ignoreSilence) continue;
          c.silenced = Math.max(c.silenced, g.turns);
          events.push({ t: 'silence', round: currentRound, creature: c.id, turns: g.turns });
        }
        break;
      }
      case 'strike_highest_atk': {
        const jumps = g.jumps ?? 0;
        const plan = planChain(patternContext(g, gimmickIndex), {
          power: g.power,
          jumps,
          decayBp: g.decayBp ?? DEFAULT_DECAY_BP,
        });
        events.push(jumps > 0 ? named(plan) : base);
        resolvePlan(plan);
        break;
      }
      case 'reflect_first_reaction':
        events.push(base);
        break; // armed at round start
      case 'sweep':
      case 'barrage':
      case 'slam':
      case 'lance':
      case 'pincer': {
        const plan = planPattern(g, patternContext(g, gimmickIndex));
        events.push(named(plan));
        if (g.op === 'barrage') lastVolley.set(g.id, plan.targets);
        resolvePlan(plan);
        break;
      }
    }
  }

  /**
   * One plain attack: an aimed hit on the front-most row's Guard (else its leftmost creature),
   * picked from who stands right now. `dice` are this attack's boss crit dice by target slot.
   */
  function bossAttack(dice: readonly number[]): void {
    if (randomTargetBp > 0 && targetDice.use < randomTargetBp) {
      const living = creatures.filter((c) => c.alive);
      const target = living[Math.floor((targetDice.pick * living.length) / 1_000_000)];
      if (target !== undefined) {
        hurt(
          target,
          Math.floor((input.bossAtk * RULES.combat.bossAttackBp) / 10_000),
          'attack',
          'aimed',
          dice[target.idx],
        );
        return;
      }
    }
    for (const zone of ZONES) {
      const living = livingIn(zone);
      const first = living[0];
      if (first === undefined) continue;
      // The zone's Guard takes the plain attack (with `rules` and several, one picked by the die of
      // the front-most slot's position).
      const target =
        pickGuard(
          living.filter((c) => c.role === 'guard'),
          first.idx,
        ) ?? first;
      hurt(
        target,
        Math.floor((input.bossAtk * RULES.combat.bossAttackBp) / 10_000),
        'attack',
        'aimed',
        dice[target.idx],
      );
      return;
    }
  }

  /**
   * Kind Rain (`FightInput.rainHealBp`): each living creature heals that share of its max HP, rounded
   * down, changed by its own `healReceivedBp` like a Mend, and never above what it is missing. One
   * `sky_heal` event names who was really healed; nothing is written when nobody was.
   */
  function rainHeals(): void {
    const heals: { creature: string; amount: number }[] = [];
    for (const c of creatures) {
      if (!c.alive) continue;
      const healed = Math.floor((c.maxHp * rainHealBp) / 10_000);
      const received =
        c.mods.healReceivedBp === 0
          ? healed
          : Math.floor((healed * Math.max(0, 10_000 + c.mods.healReceivedBp)) / 10_000);
      const amount = Math.min(received, Math.max(0, c.maxHp - c.hp));
      if (amount <= 0) continue;
      c.hp += amount;
      heals.push({ creature: c.id, amount });
    }
    if (heals.length > 0) events.push({ t: 'sky_heal', round: currentRound, heals });
  }

  /**
   * The boss's plain attack, `bossAttacks` times (1 unless the input says more). Each attack picks
   * its target afterwards from the creatures standing then, so a creature the first one knocked out
   * is not aimed at again, and each has its own crit die.
   */
  function plainAttacks(): void {
    for (let k = 0; k < bossAttacks; k++) {
      if (!creatures.some((c) => c.alive)) return;
      bossAttack(k === 0 ? bossAttackDice : (extraAttackDice[k - 1] ?? []));
    }
  }

  // ---- the fight ----
  runHook('onFightStart', baseContext, (r) => {
    bossDamageBp += sanitizeBp(pick(r, 'bossDamageBonusBp'));
  });
  if (input.adaptation !== null && rule !== null) {
    events.push({
      t: 'adaptation',
      round: 0,
      rule: rule.id,
      target: input.adaptation.target,
      status: 'active',
    });
  }

  /**
   * Enrage: the boss's hit on every living creature, for `powerBp` of its Attack (area hits: cover,
   * Shield Walls and the single-hit cap apply).
   */
  function enrageStrike(): void {
    const raw = Math.floor((input.bossAtk * (enrage?.powerBp ?? 0)) / 10_000);
    for (const c of creatures) {
      if (c.alive) hurt(c, raw, 'enrage', 'area', bossGimmickDice[c.idx]);
    }
  }

  // The base rounds, then (with `enrage`, if both sides are still standing when they run out) the
  // enrage rounds. The loop stops on a kill, a retreat at the floor or a wipe, so a round past
  // `rounds` is only ever entered with the boss and a creature standing.
  const lastRound = rounds + (enrage?.rounds ?? 0);
  let played = 0;
  for (
    let round = 1;
    round <= lastRound && bossHp > 0 && !retreated && creatures.some((c) => c.alive);
    round++
  ) {
    played = round;
    currentRound = round;
    const enraging = round > rounds;
    if (enraging) enraged = true;
    // A Surge or Slump starts with this chance (one die every round, so the dice never depend on
    // what the players do) and lasts `swingRounds` rounds; a new one cannot start inside one.
    let started: { kind: 'surge' | 'slump'; bp: number; rounds: number } | undefined;
    if (swingOn) {
      const roll = int(rng, 10_000);
      if (round > swingUntil) swingNow = 0;
      if (swingNow === 0) {
        const kind =
          roll < luck.surgeChanceBp
            ? 'surge'
            : roll >= 10_000 - luck.slumpChanceBp
              ? 'slump'
              : undefined;
        if (kind !== undefined) {
          swingNow = kind === 'surge' ? luck.swingBp : -luck.swingBp;
          swingUntil = round + luck.swingRounds - 1;
          started = { kind, bp: luck.swingBp, rounds: luck.swingRounds };
        }
      }
    }
    events.push({
      t: 'round_start',
      round,
      bossHp,
      mark: mark?.element ?? null,
      ...(started === undefined ? {} : { luck: started }),
    });
    if (enraging) events.push({ t: 'enrage', round, first: round === rounds + 1 });
    roundBonusBp = 0;
    reflectArmed = false;
    reflectUsed = false;
    brambleUsed = false;
    if (
      rule !== null &&
      purgedThrough > 0 &&
      Number.isFinite(purgedThrough) &&
      purgedThrough === round - 1
    ) {
      events.push({
        t: 'adaptation',
        round,
        rule: rule.id,
        target: adaptationTarget,
        status: 'restored',
      });
    }
    runHook('onRoundStart', baseContext, (r) => {
      roundBonusBp += sanitizeBp(pick(r, 'damageBonusBp'));
    });
    if (critOn || spreadOn) {
      const draw = (): Dice[] =>
        creatures.map(() => ({
          crit: critOn ? int(rng, 10_000) : 10_000,
          spread: spreadOn ? int(rng, 2 * luck.spreadBp + 1) - luck.spreadBp : 0,
        }));
      turnDice = draw();
      strikeDice = draw();
    }
    if (bossCritOn) {
      // After the player dice, so switching boss crits on never moves the player dice.
      bossAttackDice = creatures.map(() => int(rng, 10_000));
      bossGimmickDice = creatures.map(() => int(rng, 10_000));
    }
    if (randomTargetBp > 0) {
      targetDice = { use: int(rng, 10_000), pick: int(rng, 1_000_000) };
    }
    if (patternsOn) {
      patternDice = Array.from({ length: PATTERN_DICE }, () => int(rng, DICE_RANGE));
    }
    if (rules !== undefined) {
      // The very last dice of the round, so they never move any other die.
      guardDice = creatures.map(() => int(rng, DICE_RANGE));
    }
    if (bossAttacks > 1 && bossCritOn) {
      // Later than everything else, so a second attack never moves another die.
      extraAttackDice = Array.from({ length: bossAttacks - 1 }, () =>
        creatures.map(() => int(rng, 10_000)),
      );
    }

    // Gimmicks rest in enrage rounds: no charge is announced and the reflect trap is not armed.
    if (!enraging) announceCharges();

    for (const g of enraging ? [] : boss.gimmicks) {
      if (g.op === 'reflect_first_reaction' && gimmickDue(g, round)) {
        reflectArmed = true;
        events.push({ t: 'gimmick', round, gimmick: g.id, op: g.op });
      }
    }

    // Support: living, non-silenced supports buff their neighbours' next hit. With `rules`, the
    // Support's element adds an effect (`supportFx`): a stronger buff, healing (never above the
    // missing HP, never a revive), clearing silence.
    for (const s of creatures) {
      if (s.role !== 'support' || !s.alive || s.silenced > 0) continue;
      const fx = rules?.supportFx[s.element];
      // The Support's own sheet adds to the boost and the mend (`boostBp`, `mendBp`).
      const buffBp = (fx?.buffBp ?? RULES.combat.supportBuffBp) + s.mods.boostBp;
      const mendBp = (fx?.healBp ?? 0) + s.mods.mendBp;
      // A Support with a longer reach (`boostReach`) also boosts the creature two slots away: the boost only.
      const near = besides(s.idx);
      const far = s.mods.boostReach ? further(s.idx) : [];
      for (const i of [...near, ...far]) {
        const t = creatures[i] as Creature;
        if (!t.alive) continue;
        t.buffs = t.buffs.filter((b) => b.from !== s.idx);
        t.buffs.push({ from: s.idx, bp: Math.max(-10_000, buffBp) });
        events.push({
          t: 'support_buff',
          round,
          supporter: s.id,
          target: t.id,
          bp: Math.max(-10_000, buffBp),
        });
        if (far.includes(i)) continue;
        if (mendBp > 0) {
          // What the neighbour receives: its own sheet can make a heal bigger or smaller.
          const healed = Math.floor((t.maxHp * mendBp) / 10_000);
          const amount = Math.min(
            t.mods.healReceivedBp === 0
              ? healed
              : Math.floor((healed * Math.max(0, 10_000 + t.mods.healReceivedBp)) / 10_000),
            Math.max(0, t.maxHp - t.hp),
          );
          if (amount > 0) {
            t.hp += amount;
            credit(s, null, 'supportCredit', amount);
            events.push({
              t: 'heal',
              round,
              supporter: s.id,
              target: t.id,
              amount,
            });
          }
        }
        if (fx?.cleanse === true && t.silenced > 0) {
          t.silenced = 0;
          events.push({ t: 'cleanse', round, supporter: s.id, target: t.id });
        }
      }
    }

    // Kind Rain: every living creature heals a share of its max HP, after the Supports' Mend.
    if (rainHealBp > 0) rainHeals();

    // Finale abilities are fixed to the base rounds: one set for a round past them never fires.
    for (const a of enraging ? [] : (abilitiesByRound.get(round) ?? [])) {
      if (bossHp === 0 || retreated) break;
      fireAbility(a);
    }

    for (const idx of order) {
      if (bossHp === 0 || retreated) break;
      const c = creatures[idx] as Creature;
      if (!c.alive) continue;
      // Morning Haze: the turn owed is the first one the creature reaches; a silence on that turn
      // already costs it, so the haze is spent there and never costs a second turn.
      const hazed = hazePending.delete(c.id);
      if (c.silenced > 0) {
        c.silenced -= 1;
        events.push({ t: 'skip', round, creature: c.id, reason: 'silenced' });
        continue;
      }
      if (hazed) {
        events.push({ t: 'skip', round, creature: c.id, reason: 'haze' });
        continue;
      }
      events.push({ t: 'turn', round, creature: c.id });
      hitBoss(c);
    }

    if (bossHp > 0 && !retreated) {
      if (!enraging) {
        for (const [gi, g] of boss.gimmicks.entries()) if (gimmickDue(g, round)) fireGimmick(g, gi);
      }
      plainAttacks();
      if (enraging) enrageStrike();
    }

    events.push({ t: 'round_end', round, bossHp });
    runHook('onRoundEnd', baseContext);
    if (!creatures.some((c) => c.alive)) break;
  }

  // ---- totals ----
  for (const totals of [...Object.values(perPlayer), ...Object.values(perCreature)]) {
    totals.contribution =
      totals.damage + totals.setupCredit + totals.supportCredit + totals.guardCredit;
  }
  const lossBp = (pool.max - bossHp) * 10_000;
  // Driving the boss to its floor clears the phase (the worker's floor is the clear threshold, so
  // the two agree; a floor passed by hand is the clear all the same).
  const cleared = retreated || lossBp >= phaseCfg.clearAtLossBp * pool.max;

  let adaptationSuggestion: AdaptationSuggestion | null = null;
  if (phase === 'phase1') {
    adaptationSuggestion = suggestAdaptation(
      pack,
      boss.adaptation,
      boss.name,
      reactionsByType,
      damageByElement,
    );
    events.push({
      t: 'adaptation',
      round: played,
      rule: adaptationSuggestion.rule,
      target: adaptationSuggestion.target,
      status: 'suggested',
    });
  }

  runHook('onFightEnd', () => ({ ...baseContext(), cleared }));

  return {
    rounds: played,
    bossHpStart,
    bossHpEnd: bossHp,
    cleared,
    retreated,
    enraged,
    events,
    perPlayer,
    perCreature,
    reactions: { byType: reactionsByType, total: reactionTotal },
    damageByElement,
    hpStart: hpStartById,
    hpEnd: Object.fromEntries(creatures.map((c) => [c.id, c.hp])),
    hpMax: Object.fromEntries(creatures.map((c) => [c.id, c.maxHp])),
    adaptationSuggestion,
  };
}

function checkRules(r: FightRules): void {
  for (const [name, value, max] of [
    ['coverBp', r.coverBp, 10_000],
    ['maxHitBp', r.maxHitBp, 1_000_000],
    ['guardHpBp', r.guardHpBp, 1_000_000],
    ['guardArmorBp', r.guardArmorBp, 10_000],
  ] as const) {
    if (!isCount(value, 0) || value > max)
      fail(`rules.${name} must be an integer from 0 to ${max}`);
  }
}

function checkLuck(l: LuckConfig): void {
  for (const [name, value, max] of [
    ['critChanceBp', l.critChanceBp, 10_000],
    ['critBp', l.critBp, 100_000],
    ['critMaxChanceBp', l.critMaxChanceBp ?? 0, 10_000],
    ['critMaxBp', l.critMaxBp ?? 0, 100_000],
    ['bossCritChanceBp', l.bossCritChanceBp ?? 0, 10_000],
    ['bossCritBp', l.bossCritBp ?? 0, 100_000],
    ['bossRandomTargetBp', l.bossRandomTargetBp ?? 0, 10_000],
    ['spreadBp', l.spreadBp, 10_000],
    ['surgeChanceBp', l.surgeChanceBp, 10_000],
    ['slumpChanceBp', l.slumpChanceBp, 10_000 - l.surgeChanceBp],
    ['swingBp', l.swingBp, 10_000],
    ['swingRounds', l.swingRounds, 12],
  ] as const) {
    if (!isCount(value, 0) || value > max) fail(`luck.${name} must be an integer from 0 to ${max}`);
  }
}

/**
 * A creature's crit stats: the baseline plus its content bonus (`CritBonus`), each capped. Chance
 * and damage are in basis points (damage is the extra share of the plain hit). Absent caps in a
 * stored older `luck` mean no cap.
 */
export function creatureCritStats(
  luck: LuckConfig,
  bonus: CritBonus | undefined,
): { chanceBp: number; damageBp: number } {
  return {
    chanceBp: Math.min(luck.critMaxChanceBp ?? 10_000, luck.critChanceBp + (bonus?.chanceBp ?? 0)),
    damageBp: Math.min(luck.critMaxBp ?? 100_000, luck.critBp + (bonus?.damageBp ?? 0)),
  };
}

/** The boss's crit stats: its own baseline plus the boss content bonus, with the same caps. */
export function bossCritStats(
  luck: LuckConfig,
  bonus: CritBonus | undefined,
): { chanceBp: number; damageBp: number } {
  const chance = luck.bossCritChanceBp ?? 0;
  if (chance <= 0) return { chanceBp: 0, damageBp: 0 };
  return {
    chanceBp: Math.min(luck.critMaxChanceBp ?? 10_000, chance + (bonus?.chanceBp ?? 0)),
    damageBp: Math.min(luck.critMaxBp ?? 100_000, (luck.bossCritBp ?? 0) + (bonus?.damageBp ?? 0)),
  };
}

function statsFor(pack: ContentPack, speciesId: string, level: number, fusionCount: number): Stats {
  const species = pack.creatures.find((c) => c.id === speciesId);
  if (species === undefined) fail(`unknown species "${speciesId}"`);
  return effectiveStats(species, level, fusionCount);
}

/** Indices in the order creatures act. Speed: highest first, ties by position. */
export function turnOrder(
  creatures: readonly { idx: number; spd: number }[],
  mode: TurnOrder,
): number[] {
  const idxs = creatures.map((c) => c.idx);
  if (mode === 'left_to_right') return idxs;
  if (mode === 'right_to_left') return idxs.reverse();
  const spd = new Map(creatures.map((c) => [c.idx, c.spd]));
  return idxs.sort((a, b) => (spd.get(b) ?? 0) - (spd.get(a) ?? 0) || a - b);
}

function suggestAdaptation(
  pack: ContentPack,
  ruleId: string,
  bossName: string,
  reactionsByType: Readonly<Record<string, number>>,
  damageByElement: Readonly<Record<Element, number>>,
): AdaptationSuggestion {
  const rule = pack.adaptations.find((a) => a.id === ruleId);
  if (rule === undefined) fail(`unknown adaptation rule "${ruleId}"`);
  const pct = Math.floor(rule.resistBp / 100);
  let target: string | null = null;
  let description: string;
  if (rule.kind === 'top_reaction') {
    let best = 0;
    for (const r of pack.reactions) {
      const count = reactionsByType[r.id] ?? 0;
      if (count > best) {
        best = count;
        target = r.id;
      }
    }
    const name = pack.reactions.find((r) => r.id === target)?.name;
    description =
      name === undefined
        ? `${bossName} has nothing to adapt to: no reactions were used.`
        : `${bossName} now resists ${name} by ${pct}% (the reaction used most).`;
  } else {
    let best = 0;
    for (const e of ELEMENTS) {
      if (damageByElement[e] > best) {
        best = damageByElement[e];
        target = e;
      }
    }
    const name = pack.elements.find((e) => e.id === target)?.name;
    description =
      name === undefined
        ? `${bossName} has nothing to adapt to: no damage was dealt.`
        : `${bossName} now resists ${name} damage by ${pct}% (the element that dealt the most damage).`;
  }
  return { rule: rule.id, target, resistBp: rule.resistBp, description };
}

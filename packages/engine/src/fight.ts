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
  type LuckConfig,
  type StatusEffectDef,
  type ReactionDef,
  type Rng,
  type Stats,
  type TurnOrder,
  type Zone,
} from '@creatures/game';
import { DODGE_RANGE, DODGE_TAKEN_DICE } from './fight-dodge';
import { BOSS, applyEffect, tickEffects } from './fight-effects';
import { announceCharges, enrageStrike, fireGimmick, plainAttacks } from './fight-boss';
import { gearRoundStart, fireAbility, rainHeals, supportBuffs } from './fight-round';
import { hitBoss } from './fight-strike';
import { firingIndex, gimmickDue, sweepRow } from './gimmick-schedule';
import {
  baseContext,
  pick,
  reactionKey,
  runHook,
  type Creature,
  type Dice,
  type FightState,
  type Scheduled,
} from './fight-state';
import { LUCK_DICE, hasChance, resolveMods } from './mods';
import { sanitizeBp, type Mutator } from './mutators';
import { DICE_RANGE, PATTERN_DICE } from './patterns';
import type {
  AdaptationSuggestion,
  CreatureTotals,
  FightEvent,
  FightInput,
  FightResult,
  FightRules,
  PlayerTotals,
} from './types';
import { ZONES, fightRowShape, zoneOfIndex, type FightBoard } from './zones';

export interface FightOptions {
  /** Mutators registered in code. A mutator runs only if `input.mutators` also lists its id. */
  mutators?: readonly Mutator[];
  /**
   * Tests only: called at the start of every round (after the dice are drawn, before the round's
   * first event), so a test can put a status effect on a fighter. `target` is a creature id, or null
   * for the boss. Needs `input.effects`, like every application.
   */
  effectHook?: (round: number, apply: ApplyEffect) => void;
  /** Content to use instead of the shipped pack (tests). */
  pack?: ContentPack;
}

/** What the test hook can do: apply an effect to a creature (id) or the boss (null). */
export type ApplyEffect = (
  target: string | null,
  effectId: string,
  powerBp: number,
  durationTurns?: number,
) => void;

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
      e.op === 'on_hit_taken' ||
      e.op === 'round_start' ||
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
  /** Where the row stands: the board's own positions when the input carries them. */
  const shape = fightRowShape(input);
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
  const lingerAllRounds = input.lingerAllRounds ?? 0;
  if (!isCount(lingerAllRounds, 0) || lingerAllRounds > 3) {
    fail('lingerAllRounds must be an integer from 0 to 3');
  }
  const effects = input.effects;
  if (effects !== undefined && (!isCount(effects.dice, 1) || effects.dice > 256)) {
    fail('effects.dice must be an integer from 1 to 256');
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

  const reactionByPair = new Map<string, ReactionDef>();
  for (const r of pack.reactions)
    reactionByPair.set(reactionKey(r.markElement, r.triggerElement), r);
  const abilityDefs = new Map<string, FinaleAbilityDef>();
  for (const a of pack.finaleAbilities) abilityDefs.set(a.id, a);

  let rule: AdaptationDef | null = null;
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
  const patternsOn = boss.gimmicks.some((g) => (PATTERN_OPS as readonly string[]).includes(g.op));

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
      paybackReady: 0,
      emberTailReady: 0,
      patientReady: 0,
      rallyCry: 0,
      stubbornUsed: false,
      lastStandDone: false,
      lastStandCut: 0,
      stormRound: 0,
      nextBoostBp: 0,
      effects: [],
      hitTakenApplies: [],
      roundStartApplies: [],
    };
  });

  const luckOn = creatures.some((c) => hasChance(c.mods));

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
  const damageByElement = Object.fromEntries(ELEMENTS.map((e) => [e, 0])) as Record<
    Element,
    number
  >;
  const events: FightEvent[] = [];

  const bossHpStart = pool.current;

  // ---- mutators ----
  const registry = new Map<string, Mutator>();
  for (const m of options.mutators ?? []) if (!registry.has(m.id)) registry.set(m.id, m);
  const active: Mutator[] = [];
  for (const id of new Set(input.mutators ?? [])) {
    const m = registry.get(id);
    if (m !== undefined) active.push(m);
  }

  // ---- turn order ----
  const orderMode = input.turnOrderOverride ?? boss.turnOrder;
  const roundOrder = (round: number): number[] =>
    turnOrder(creatures, orderMode, { round, board: shape });
  const order = roundOrder(1);

  // ---- finale abilities ----
  const zoneHit = firstZoneHit(boss, rounds);
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
    // Passive effects are on from the start, whatever round the ability itself "fires" in (so the fight
    // up to a round never depends on a press that comes later).
    for (const e of def.effects) {
      if (source === null) break;
      if (e.op === 'on_hit_taken') source.hitTakenApplies.push(e.apply);
      else if (e.op === 'round_start') source.roundStartApplies.push(e.apply);
    }
    const byDefault = choice.fireAtRound === undefined;
    const round = choice.fireAtRound ?? defaultAbilityRound(boss, def, rounds);
    const list = abilitiesByRound.get(round) ?? [];
    list.push({ choice, def, byDefault, source });
    abilitiesByRound.set(round, list);
  }

  // ---- the state the helpers share ----
  const guardReach = input.guardReach ?? 'zone';
  const state: FightState = {
    input,
    rng,
    pack,
    boss,
    phase,
    n,
    shape,
    poolMax: pool.max,
    rounds,
    bossAttacks,
    rainHealBp,
    brambleBp,
    lingerAllRounds,
    bossFloor,
    enrage,
    luck,
    critOn,
    bossCrit,
    bossCritOn,
    randomTargetBp,
    rules,
    patternsOn,
    luckOn,
    effectsOn: effects !== undefined,
    dodge: rules?.dodge,
    effectDefs: new Map<string, StatusEffectDef>(pack.statusEffects.map((e) => [e.id, e])),
    rule,
    adaptationTarget,
    reactionByPair,
    guardReach,
    zoneHit,
    creatures,
    order,
    active,
    events,
    perPlayer,
    perCreature,
    reactionsByType,
    reactionTotal: 0,
    damageByElement,
    shields: [],
    rallies: [],
    lastVolley: new Map(),
    pendingCharges: new Map(),
    bossHp: pool.current,
    retreated: false,
    enraged: false,
    mark: null,
    bossDamageBp: 0,
    currentRound: 0,
    purgedThrough: 0,
    orderPos: -1,
    roundBonusBp: 0,
    reflectArmed: false,
    reflectUsed: false,
    brambleUsed: false,
    swingNow: 0,
    swingUntil: 0,
    bossEffects: [],
    turnDice: [],
    strikeDice: [],
    bossAttackDice: [],
    bossGimmickDice: [],
    extraAttackDice: [],
    targetDice: { use: 10_000, pick: 0 },
    patternDice: [],
    guardDice: [],
    luckDice: [],
    areaSeen: [],
    effectDice: [],
    effectDiceUsed: 0,
    lastHitDodged: false,
    dodgeTakenDice: [],
    dodgeTurnDice: [],
    dodgeStrikeDice: [],
    dodgeSeen: [],
  };

  // ---- the fight ----
  runHook(
    state,
    'onFightStart',
    () => baseContext(state),
    (r) => {
      state.bossDamageBp += sanitizeBp(pick(r, 'bossDamageBonusBp'));
    },
  );
  if (input.adaptation !== null && rule !== null) {
    events.push({
      t: 'adaptation',
      round: 0,
      rule: rule.id,
      target: input.adaptation.target,
      status: 'active',
    });
  }

  // The base rounds, then (with `enrage`, if both sides are still standing when they run out) the
  // enrage rounds. The loop stops on a kill, a retreat at the floor or a wipe, so a round past
  // `rounds` is only ever entered with the boss and a creature standing.
  const lastRound = rounds + (enrage?.rounds ?? 0);
  let played = 0;
  for (
    let round = 1;
    round <= lastRound && state.bossHp > 0 && !state.retreated && creatures.some((c) => c.alive);
    round++
  ) {
    played = round;
    state.currentRound = round;
    const enraging = round > rounds;
    if (enraging) state.enraged = true;
    // A Surge or Slump starts with this chance (one die every round, so the dice never depend on
    // what the players do) and lasts `swingRounds` rounds; a new one cannot start inside one.
    let started: { kind: 'surge' | 'slump'; bp: number; rounds: number } | undefined;
    if (swingOn) {
      const roll = int(rng, 10_000);
      if (round > state.swingUntil) state.swingNow = 0;
      if (state.swingNow === 0) {
        const kind =
          roll < luck.surgeChanceBp
            ? 'surge'
            : roll >= 10_000 - luck.slumpChanceBp
              ? 'slump'
              : undefined;
        if (kind !== undefined) {
          state.swingNow = kind === 'surge' ? luck.swingBp : -luck.swingBp;
          state.swingUntil = round + luck.swingRounds - 1;
          started = { kind, bp: luck.swingBp, rounds: luck.swingRounds };
        }
      }
    }
    events.push({
      t: 'round_start',
      round,
      bossHp: state.bossHp,
      mark: state.mark?.element ?? null,
      ...(started === undefined ? {} : { luck: started }),
    });
    if (enraging) events.push({ t: 'enrage', round, first: round === rounds + 1 });
    state.roundBonusBp = 0;
    state.reflectArmed = false;
    state.reflectUsed = false;
    state.brambleUsed = false;
    if (
      rule !== null &&
      state.purgedThrough > 0 &&
      Number.isFinite(state.purgedThrough) &&
      state.purgedThrough === round - 1
    ) {
      events.push({
        t: 'adaptation',
        round,
        rule: rule.id,
        target: adaptationTarget,
        status: 'restored',
      });
    }
    runHook(
      state,
      'onRoundStart',
      () => baseContext(state),
      (r) => {
        state.roundBonusBp += sanitizeBp(pick(r, 'damageBonusBp'));
      },
    );
    if (critOn || spreadOn) {
      const draw = (): Dice[] =>
        creatures.map(() => ({
          crit: critOn ? int(rng, 10_000) : 10_000,
          spread: spreadOn ? int(rng, 2 * luck.spreadBp + 1) - luck.spreadBp : 0,
        }));
      state.turnDice = draw();
      state.strikeDice = draw();
    }
    if (bossCritOn) {
      // After the player dice, so switching boss crits on never moves the player dice.
      state.bossAttackDice = creatures.map(() => int(rng, 10_000));
      state.bossGimmickDice = creatures.map(() => int(rng, 10_000));
    }
    if (randomTargetBp > 0) {
      state.targetDice = { use: int(rng, 10_000), pick: int(rng, 1_000_000) };
    }
    if (patternsOn) {
      state.patternDice = Array.from({ length: PATTERN_DICE }, () => int(rng, DICE_RANGE));
    }
    if (rules !== undefined) {
      // The very last dice of the round, so they never move any other die.
      state.guardDice = creatures.map(() => int(rng, DICE_RANGE));
    }
    if (bossAttacks > 1 && bossCritOn) {
      // Later than everything else, so a second attack never moves another die.
      state.extraAttackDice = Array.from({ length: bossAttacks - 1 }, () =>
        creatures.map(() => int(rng, 10_000)),
      );
    }
    if (luckOn) {
      // The very last dice of all, and only when a creature of the fight has a chance line.
      state.luckDice = creatures.map(() =>
        Array.from({ length: LUCK_DICE }, () => int(rng, 10_000)),
      );
      state.areaSeen = creatures.map(() => 0);
    }
    if (effects !== undefined) {
      // After the luck dice, the very last of the round, and only when effects are on.
      state.effectDice = Array.from({ length: effects.dice }, () => int(rng, 10_000));
      state.effectDiceUsed = 0;
    }
    if (state.dodge !== undefined) {
      // After the effect dice, the very last of the round, and only when the fight's rules have dodge.
      state.dodgeTakenDice = creatures.map(() =>
        Array.from({ length: DODGE_TAKEN_DICE }, () => int(rng, DODGE_RANGE)),
      );
      state.dodgeTurnDice = creatures.map(() => int(rng, DODGE_RANGE));
      state.dodgeStrikeDice = creatures.map(() => int(rng, DODGE_RANGE));
      state.dodgeSeen = creatures.map(() => 0);
    }
    state.orderPos = -1;
    // Serpentine flips every row each round; the other orders are the same every round.
    if (orderMode === 'serpentine') state.order = roundOrder(round);

    options.effectHook?.(round, (target, effectId, powerBp, durationTurns) => {
      const who = target === null ? BOSS : creatures.find((c) => c.id === target);
      if (who === undefined) fail(`effect hook names unknown creature "${target}"`);
      applyEffect(state, who, effectId, powerBp, null, durationTurns);
    });

    // Gimmicks rest in enrage rounds: no charge is announced and the reflect trap is not armed.
    if (!enraging) announceCharges(state);

    for (const g of enraging ? [] : boss.gimmicks) {
      if (g.op === 'reflect_first_reaction' && gimmickDue(g, round)) {
        state.reflectArmed = true;
        events.push({ t: 'gimmick', round, gimmick: g.id, op: g.op });
      }
    }

    supportBuffs(state, round);

    // Kind Rain: every living creature heals a share of its max HP, after the Supports' Mend.
    if (rainHealBp > 0) rainHeals(state);

    // The gear lines of the round's start (chance and trigger lines), after the Supports and the sky.
    gearRoundStart(state, round, enraging);

    // Finale abilities are fixed to the base rounds: one set for a round past them never fires.
    for (const a of enraging ? [] : (abilitiesByRound.get(round) ?? [])) {
      if (state.bossHp === 0 || state.retreated) break;
      fireAbility(state, a);
    }

    for (const [pos, idx] of state.order.entries()) {
      if (state.bossHp === 0 || state.retreated) break;
      state.orderPos = pos;
      const c = creatures[idx] as Creature;
      if (!c.alive) continue;
      // Morning Haze: the turn owed is the first one the creature reaches; a silence on that turn
      // already costs it, so the haze is spent there and never costs a second turn.
      const hazed = hazePending.delete(c.id);
      if (c.silenced > 0) {
        c.silenced -= 1;
        events.push({ t: 'skip', round, creature: c.id, reason: 'silenced' });
        tickEffects(state, c);
        continue;
      }
      if (hazed) {
        events.push({ t: 'skip', round, creature: c.id, reason: 'haze' });
        tickEffects(state, c);
        continue;
      }
      events.push({ t: 'turn', round, creature: c.id });
      hitBoss(state, c);
      tickEffects(state, c);
    }

    if (state.bossHp > 0 && !state.retreated) {
      if (!enraging) {
        for (const [gi, g] of boss.gimmicks.entries())
          if (gimmickDue(g, round)) fireGimmick(state, g, gi);
      }
      plainAttacks(state);
      if (enraging) enrageStrike(state);
      // The boss's turn is over: its effects count down once a round.
      tickEffects(state, BOSS);
    }

    events.push({ t: 'round_end', round, bossHp: state.bossHp });
    runHook(state, 'onRoundEnd', () => baseContext(state));
    if (!creatures.some((c) => c.alive)) break;
  }

  // ---- totals ----
  for (const totals of [...Object.values(perPlayer), ...Object.values(perCreature)]) {
    totals.contribution =
      totals.damage + totals.setupCredit + totals.supportCredit + totals.guardCredit;
  }
  const lossBp = (pool.max - state.bossHp) * 10_000;
  // Driving the boss to its floor clears the phase (the worker's floor is the clear threshold, so
  // the two agree; a floor passed by hand is the clear all the same).
  const cleared = state.retreated || lossBp >= phaseCfg.clearAtLossBp * pool.max;

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

  runHook(state, 'onFightEnd', () => ({ ...baseContext(state), cleared }));

  return {
    rounds: played,
    bossHpStart,
    bossHpEnd: state.bossHp,
    cleared,
    retreated: state.retreated,
    enraged: state.enraged,
    events,
    perPlayer,
    perCreature,
    reactions: { byType: reactionsByType, total: state.reactionTotal },
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
  if (r.dodge !== undefined) {
    for (const [name, value] of [
      ['perSpeedBp', r.dodge.perSpeedBp],
      ['maxBp', r.dodge.maxBp],
      ['areaShareBp', r.dodge.areaShareBp],
    ] as const) {
      if (!isCount(value, 0) || value > 10_000) {
        fail(`rules.dodge.${name} must be an integer from 0 to 10000`);
      }
    }
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

/**
 * Indices in the order creatures act. Speed: highest first, ties by position. Serpentine: row by
 * row (Front, Middle, Back); on odd rounds Front and Back run left to right and Middle right to
 * left, on even rounds every row flips. Serpentine needs `board` (`board.slots[i]` is the board slot
 * of `creatures[i]`) and reads `round` (default 1); the other orders ignore both.
 */
export function turnOrder(
  creatures: readonly { idx: number; spd: number }[],
  mode: TurnOrder,
  at?: { round: number; board: FightBoard },
): number[] {
  const idxs = creatures.map((c) => c.idx);
  if (mode === 'left_to_right') return idxs;
  if (mode === 'right_to_left') return idxs.reverse();
  if (mode === 'serpentine') {
    const round = at?.round ?? 1;
    const board = at?.board ?? {
      length: creatures.length,
      slots: creatures.map((_, i) => i),
    };
    const out: number[] = [];
    for (const [z, zone] of ZONES.entries()) {
      // Position in `creatures`, left to right (slots rise with position).
      const inZone = creatures.flatMap((c, i) => (zoneOfIndex(i, board) === zone ? [c.idx] : []));
      // Front and Back run left to right on odd rounds, Middle right to left; even rounds flip all.
      const leftToRight = (z === 1) === (round % 2 === 0);
      out.push(...(leftToRight ? inZone : inZone.reverse()));
    }
    return out;
  }
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

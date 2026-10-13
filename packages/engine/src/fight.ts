import {
  ELEMENTS,
  RULES,
  content,
  effectiveStats,
  int,
  NO_LUCK,
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
import { gimmickDue } from './gimmick-schedule';
import { matchupBp } from './matchup';
import { sanitizeBp, type CreatureView, type Mutator, type MutatorHooks } from './mutators';
import type {
  AbilityChoice,
  AdaptationSuggestion,
  CreatureTotals,
  FightEvent,
  FightInput,
  FightResult,
  PlayerTotals,
} from './types';
import { ZONES, neighbours, zoneIndices, zoneOfIndex } from './zones';

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
}

interface Mark {
  element: Element;
  creature: Creature | null;
  player: string | null;
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

/** The first zone attack of the boss from round 2 on (within `rounds`), or null if it has none. */
function firstZoneHit(boss: BossDef, rounds: number): { round: number; zone: Zone } | null {
  for (let r = 2; r <= rounds; r++) {
    for (const g of boss.gimmicks) {
      if (g.op === 'hit_zone' && gimmickDue(g, r)) return { round: r, zone: g.zone };
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
 * All maths is integer maths in basis points with floor. Overkill damage on the last hit counts as
 * dealt for credit, but the boss pool never goes below 0.
 *
 * Round order: round start (reflect arming, support buffs, finale abilities), each living and
 * non-silenced creature in turn order, boss gimmicks due this round, the boss's normal attack,
 * round end. The fight ends early when the pool reaches 0 (or every creature is knocked out).
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

  // ---- luck (all off by default) ----
  const luck: LuckConfig = input.luck ?? NO_LUCK;
  checkLuck(luck);
  const critOn = luck.critChanceBp > 0;
  const bossCrit = bossCritStats(luck, boss.crit);
  const bossCritOn = bossCrit.chanceBp > 0;
  const randomTargetBp = luck.bossRandomTargetBp ?? 0;
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
  /** This round's dice for a random boss target: whether it applies, and which living creature. */
  let targetDice = { use: 10_000, pick: 0 };
  /** The running Surge (+) or Slump (-) in basis points of team damage, and its last round. */
  let swingNow = 0;
  let swingUntil = 0;

  // ---- state ----
  const creatures: Creature[] = input.row.map((s, idx) => {
    const stats: Stats = s.stats ?? statsFor(pack, s.speciesId, s.level, s.fusionCount);
    const crit = critOn ? creatureCritStats(luck, s.crit) : { chanceBp: 0, damageBp: 0 };
    const maxHp =
      s.role === 'guard'
        ? Math.floor((stats.hp * (10_000 + RULES.combat.guardHpBp)) / 10_000)
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
  function guardFor(target: Creature): Creature | undefined {
    if (guardReach === 'adjacent') {
      for (const i of neighbours(target.idx, n)) {
        const c = creatures[i] as Creature;
        if (c.alive && c.role === 'guard') return c;
      }
      return undefined;
    }
    return livingIn(zoneOfIndex(target.idx, n)).find((c) => c.role === 'guard');
  }

  function hurt(
    target: Creature,
    rawAmount: number,
    source: 'attack' | 'gimmick' | 'reflect',
    interceptable: boolean,
    /** The boss crit die of this hit (absent: the hit cannot crit). */
    die?: number,
  ): void {
    const crit = die !== undefined && bossCritOn && die < bossCrit.chanceBp;
    let amount = Math.max(
      0,
      Math.floor((rawAmount * (10_000 + bossDamageBp + (crit ? bossCrit.damageBp : 0))) / 10_000),
    );
    const zone = zoneOfIndex(target.idx, n);
    // Shield Walls on the zone multiply: two 50% walls leave 25% of the damage.
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
        target: target.id,
        damage: 0,
        shielded: true,
      });
      return;
    }
    const reducedBp = 10_000 - remainingBp;
    if (reducedBp > 0) amount = Math.floor((amount * remainingBp) / 10_000);
    let victim = target;
    if (interceptable && target.role !== 'guard') {
      const guard = guardFor(target);
      if (guard !== undefined) victim = guard;
    }
    const taken = Math.min(amount, victim.hp);
    victim.hp -= taken;
    (perCreature[victim.id] as CreatureTotals).damageTaken += taken;
    if (victim !== target) {
      credit(victim, null, 'guardCredit', taken);
      events.push({
        t: 'boss_hit',
        round: currentRound,
        source,
        target: victim.id,
        damage: amount,
        from: target.id,
        ...(reducedBp > 0 ? { reducedBp } : {}),
        ...(crit && amount > 0 ? { crit: true as const, critBp: bossCrit.damageBp } : {}),
      });
    } else {
      events.push({
        t: 'boss_hit',
        round: currentRound,
        source,
        target: victim.id,
        damage: amount,
        ...(reducedBp > 0 ? { reducedBp } : {}),
        ...(crit && amount > 0 ? { crit: true as const, critBp: bossCrit.damageBp } : {}),
      });
    }
    if (victim.hp === 0 && victim.alive) {
      victim.alive = false;
      (perCreature[victim.id] as CreatureTotals).knockedOutRound = currentRound;
      events.push({ t: 'knockout', round: currentRound, creature: victim.id });
      runHook('onKnockout', () => ({ ...baseContext(), creature: view(victim) }));
    }
  }

  // ---- a creature hits the boss ----
  let roundBonusBp = 0;
  const rallies: { bp: number; until: number }[] = [];
  const rallyBp = (): number =>
    rallies.reduce((sum, r) => (r.until >= currentRound ? sum + r.bp : sum), 0);
  const adaptationOn = (): boolean => rule !== null && currentRound > purgedThrough;
  let reflectArmed = false;
  let reflectUsed = false;

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

    const dice = (strike === undefined ? turnDice : strikeDice)[c.idx];
    let luckBp = swingNow;
    let crit = false;
    if (dice !== undefined) {
      if (critOn && dice.crit < c.critChanceBp) {
        crit = true;
        luckBp += c.critBp;
      }
      luckBp += dice.spread;
    }

    let reaction: ReactionDef | undefined;
    if (markBefore !== null) {
      const candidate = reactionByMark.get(markBefore.element);
      if (candidate !== undefined && candidate.triggerElement === c.element) reaction = candidate;
    }
    const reflected = reaction !== undefined && c.alive && reflectArmed && !reflectUsed;
    if (reflected) reflectUsed = true;

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
        ? rule.resistBp
        : 0;
    const reactionResist =
      adapting &&
      reaction !== undefined &&
      rule?.kind === 'top_reaction' &&
      adaptationTarget === reaction.id
        ? rule.resistBp
        : 0;

    const calc = (modBp: number): { damage: number; bonus: number; reflect: number } => {
      const factor = Math.max(0, 10_000 + Math.max(-10_000, modBp));
      let plain = Math.floor((atk * matchup * factor) / 100_000_000);
      if (elementResist > 0) plain = Math.floor((plain * (10_000 - elementResist)) / 10_000);
      if (reaction === undefined) return { damage: plain, bonus: 0, reflect: 0 };
      let mult = reaction.multiplierBp;
      if (c.role === 'payoff') mult = Math.floor((mult * reaction.payoffBonusBp) / 10_000);
      let bonus = Math.max(0, Math.floor((plain * mult) / 10_000) - plain);
      if (reactionResist > 0) bonus -= Math.floor((bonus * reactionResist) / 10_000);
      bonus = Math.max(0, Math.floor((bonus * Math.max(0, 10_000 + reactionHookBp)) / 10_000));
      if (reflected) return { damage: plain, bonus: 0, reflect: bonus };
      return { damage: plain + bonus, bonus, reflect: 0 };
    };

    const rally = rallyBp();
    const totalBp = supportBp + rally + roundBonusBp + hookBp + luckBp;
    const hit = calc(totalBp);
    bossHp = Math.max(0, bossHp - hit.damage);
    damageByElement[c.element] += hit.damage;

    // Support credit (zero-sum): the extra damage the buffs made possible moves from the hitter's
    // credit to the supporters, shared between them.
    let supportShare = 0;
    if (supportBp > 0) {
      const gain = Math.max(0, hit.damage - calc(totalBp - supportBp).damage);
      supportShare = gain;
      const k = buffs.length;
      const each = Math.floor(gain / k);
      let rest = gain - each * k;
      for (const b of buffs) {
        const extra = rest > 0 ? 1 : 0;
        rest -= extra;
        credit(creatures[b.from] as Creature, null, 'supportCredit', each + extra);
      }
    }

    // Setup / payoff split of the reaction bonus: setter gets the floor of half, payoff the rest.
    let setup = 0;
    if (reaction !== undefined && !reflected && markBefore !== null) {
      setup = Math.floor(hit.bonus / 2);
      credit(markBefore.creature, markBefore.player, 'setupCredit', setup);
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
      ...(crit ? { crit: true as const, critBp: c.critBp } : {}),
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
      });
      mark = null;
      if (reflected) hurt(c, hit.reflect, 'reflect', false);
    } else if (markBefore === null) {
      mark = { element: c.element, creature: c, player: c.ownerId };
      events.push({
        t: 'mark',
        round: currentRound,
        creature: c.id,
        player: c.ownerId,
        element: c.element,
        replaced: null,
      });
    } else if (c.role === 'setter' && markBefore.element !== c.element) {
      mark = { element: c.element, creature: c, player: c.ownerId };
      events.push({
        t: 'mark',
        round: currentRound,
        creature: c.id,
        player: c.ownerId,
        element: c.element,
        replaced: markBefore.element,
      });
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
        const own = creatures.find((c) => c.ownerId === choice.playerId);
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
    for (const e of def.effects) {
      switch (e.op) {
        case 'rally':
          rallies.push({ bp: e.damageBp, until: currentRound + e.rounds - 1 });
          break;
        case 'shield_wall':
          shields.push({
            zone: zone as Zone,
            reduceBp: e.reduceBp,
            until: currentRound + e.rounds - 1,
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
            e.rounds === undefined ? Number.POSITIVE_INFINITY : currentRound + e.rounds - 1,
          );
          break;
        case 'strike':
          if (source !== null && bossHp > 0) {
            hitBoss(source, { atkBp: e.atkBp, ability: def.id, key: choice.key });
          }
          break;
      }
    }
  }

  // ---- boss gimmicks and attack ----
  function livingTargetByAtk(): Creature | undefined {
    let best: Creature | undefined;
    for (const c of creatures) {
      if (c.alive && (best === undefined || c.atk > best.atk)) best = c;
    }
    return best;
  }

  function fireGimmick(g: Gimmick): void {
    events.push({ t: 'gimmick', round: currentRound, gimmick: g.id, op: g.op });
    switch (g.op) {
      case 'hit_zone': {
        const amount = Math.floor((input.bossAtk * g.power) / 10_000);
        for (const c of livingIn(g.zone)) hurt(c, amount, 'gimmick', false, bossGimmickDice[c.idx]);
        break;
      }
      case 'silence_ends': {
        const ends = n === 1 ? [0] : [0, n - 1];
        for (const i of ends) {
          const c = creatures[i] as Creature;
          if (c.alive) {
            c.silenced = Math.max(c.silenced, g.turns);
            events.push({ t: 'silence', round: currentRound, creature: c.id, turns: g.turns });
          }
        }
        break;
      }
      case 'strike_highest_atk': {
        const target = livingTargetByAtk();
        if (target !== undefined) {
          hurt(
            target,
            Math.floor((input.bossAtk * g.power) / 10_000),
            'gimmick',
            true,
            bossGimmickDice[target.idx],
          );
        }
        break;
      }
      case 'reflect_first_reaction':
        break; // armed at round start
    }
  }

  function bossAttack(): void {
    if (randomTargetBp > 0 && targetDice.use < randomTargetBp) {
      const living = creatures.filter((c) => c.alive);
      const target = living[Math.floor((targetDice.pick * living.length) / 1_000_000)];
      if (target !== undefined) {
        hurt(
          target,
          Math.floor((input.bossAtk * RULES.combat.bossAttackBp) / 10_000),
          'attack',
          true,
          bossAttackDice[target.idx],
        );
        return;
      }
    }
    for (const zone of ZONES) {
      const living = livingIn(zone);
      const first = living[0];
      if (first === undefined) continue;
      const target = living.find((c) => c.role === 'guard') ?? first;
      hurt(
        target,
        Math.floor((input.bossAtk * RULES.combat.bossAttackBp) / 10_000),
        'attack',
        true,
        bossAttackDice[target.idx],
      );
      return;
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

  let played = 0;
  for (let round = 1; round <= rounds && bossHp > 0 && creatures.some((c) => c.alive); round++) {
    played = round;
    currentRound = round;
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
    roundBonusBp = 0;
    reflectArmed = false;
    reflectUsed = false;
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

    for (const g of boss.gimmicks) {
      if (g.op === 'reflect_first_reaction' && gimmickDue(g, round)) {
        reflectArmed = true;
        events.push({ t: 'gimmick', round, gimmick: g.id, op: g.op });
      }
    }

    // Support: living, non-silenced supports buff their neighbours' next hit.
    for (const s of creatures) {
      if (s.role !== 'support' || !s.alive || s.silenced > 0) continue;
      for (const i of neighbours(s.idx, n)) {
        const t = creatures[i] as Creature;
        if (!t.alive) continue;
        t.buffs = t.buffs.filter((b) => b.from !== s.idx);
        t.buffs.push({ from: s.idx, bp: RULES.combat.supportBuffBp });
        events.push({
          t: 'support_buff',
          round,
          supporter: s.id,
          target: t.id,
          bp: RULES.combat.supportBuffBp,
        });
      }
    }

    for (const a of abilitiesByRound.get(round) ?? []) {
      if (bossHp === 0) break;
      fireAbility(a);
    }

    for (const idx of order) {
      if (bossHp === 0) break;
      const c = creatures[idx] as Creature;
      if (!c.alive) continue;
      if (c.silenced > 0) {
        c.silenced -= 1;
        events.push({ t: 'skip', round, creature: c.id, reason: 'silenced' });
        continue;
      }
      events.push({ t: 'turn', round, creature: c.id });
      hitBoss(c);
    }

    if (bossHp > 0) {
      for (const g of boss.gimmicks) if (gimmickDue(g, round)) fireGimmick(g);
      bossAttack();
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
  const cleared = lossBp >= phaseCfg.clearAtLossBp * pool.max;

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

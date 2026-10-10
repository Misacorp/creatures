import {
  ELEMENTS,
  RULES,
  content,
  effectiveStats,
  type AdaptationDef,
  type ContentPack,
  type Element,
  type FinaleAbilityDef,
  type Gimmick,
  type ReactionDef,
  type Rng,
  type Role,
  type Stats,
  type TurnOrder,
  type Zone,
} from '@creatures/game';
import { matchupBp } from './matchup';
import { sanitizeBp, type CreatureView, type Mutator, type MutatorHooks } from './mutators';
import type {
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
  let adaptationActive = false;
  if (input.adaptation !== null) {
    rule = pack.adaptations.find((a) => a.id === input.adaptation?.rule) ?? null;
    if (rule === null) fail(`unknown adaptation rule "${input.adaptation.rule}"`);
    adaptationActive = true;
  }
  const adaptationTarget = input.adaptation?.target ?? '';

  // ---- state ----
  const creatures: Creature[] = input.row.map((s, idx) => {
    const stats: Stats = s.stats ?? statsFor(pack, s.speciesId, s.level, s.fusionCount);
    const maxHp =
      s.role === 'guard'
        ? Math.floor((stats.hp * (10_000 + RULES.combat.guardHpBp)) / 10_000)
        : stats.hp;
    return {
      idx,
      id: s.id,
      ownerId: s.ownerId,
      name: s.name,
      element: s.element,
      role: s.role,
      atk: stats.atk,
      spd: stats.spd,
      hp: maxHp,
      maxHp,
      alive: true,
      silenced: 0,
      buffs: [],
    };
  });

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
  const gimmickDue = (g: Gimmick, round: number): boolean =>
    'every' in g.trigger ? round % g.trigger.every === 0 : true;
  let zoneHit: { round: number; zone: Zone } | null = null;
  for (let r = 2; r <= rounds && zoneHit === null; r++) {
    for (const g of boss.gimmicks) {
      if (g.op === 'hit_zone' && gimmickDue(g, r)) {
        zoneHit = { round: r, zone: g.zone };
        break;
      }
    }
  }
  const abilitiesByRound = new Map<
    number,
    { choice: FightInput['finaleAbilities'][number]; def: FinaleAbilityDef; byDefault: boolean }[]
  >();
  for (const choice of input.finaleAbilities) {
    const def = abilityDefs.get(choice.abilityId);
    if (def === undefined) fail(`unknown finale ability "${choice.abilityId}"`);
    if (!players.has(choice.playerId)) fail(`ability of unknown player "${choice.playerId}"`);
    if (choice.fireAtRound !== undefined && !isCount(choice.fireAtRound, 1)) {
      fail('fireAtRound must be an integer >= 1');
    }
    const byDefault = choice.fireAtRound === undefined;
    const defaultRound =
      def.defaultAtZoneHit === true && zoneHit !== null ? zoneHit.round : def.defaultRound;
    const round = choice.fireAtRound ?? defaultRound;
    const list = abilitiesByRound.get(round) ?? [];
    list.push({ choice, def, byDefault });
    abilitiesByRound.set(round, list);
  }

  // ---- damage to creatures ----
  const shielded = new Set<Zone>();
  const livingIn = (zone: Zone): Creature[] =>
    zoneIndices(zone, n)
      .map((i) => creatures[i] as Creature)
      .filter((c) => c.alive);

  function hurt(
    target: Creature,
    rawAmount: number,
    source: 'attack' | 'gimmick' | 'reflect',
    interceptable: boolean,
  ): void {
    const amount = Math.max(0, Math.floor((rawAmount * (10_000 + bossDamageBp)) / 10_000));
    const zone = zoneOfIndex(target.idx, n);
    if (shielded.has(zone)) {
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
    let victim = target;
    if (interceptable && target.role !== 'guard') {
      const guard = livingIn(zone).find((c) => c.role === 'guard');
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
      });
    } else {
      events.push({
        t: 'boss_hit',
        round: currentRound,
        source,
        target: victim.id,
        damage: amount,
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
  let rallyBp = 0;
  let reflectArmed = false;
  let reflectUsed = false;

  function hitBoss(c: Creature): void {
    const matchup = matchupBp(c.element, boss.element, pack.elements);
    const buffs = c.buffs;
    c.buffs = [];
    const supportBp = buffs.reduce((sum, b) => sum + b.bp, 0);
    const markBefore = mark;

    let reaction: ReactionDef | undefined;
    if (markBefore !== null) {
      const candidate = reactionByMark.get(markBefore.element);
      if (candidate !== undefined && candidate.triggerElement === c.element) reaction = candidate;
    }
    const reflected = reaction !== undefined && reflectArmed && !reflectUsed;
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

    const elementResist =
      adaptationActive && rule?.kind === 'top_element' && adaptationTarget === c.element
        ? rule.resistBp
        : 0;
    const reactionResist =
      adaptationActive &&
      reaction !== undefined &&
      rule?.kind === 'top_reaction' &&
      adaptationTarget === reaction.id
        ? rule.resistBp
        : 0;

    const calc = (modBp: number): { damage: number; bonus: number; reflect: number } => {
      const factor = Math.max(0, 10_000 + Math.max(-10_000, modBp));
      let plain = Math.floor((c.atk * matchup * factor) / 100_000_000);
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

    const totalBp = supportBp + rallyBp + roundBonusBp + hookBp;
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
  function fireAbility(
    choice: FightInput['finaleAbilities'][number],
    def: FinaleAbilityDef,
    byDefault: boolean,
  ): void {
    const base = {
      t: 'ability' as const,
      round: currentRound,
      player: choice.playerId,
      ability: def.id,
      byDefault,
    };
    switch (def.effect.op) {
      case 'rally':
        rallyBp += def.effect.damageBp;
        events.push(base);
        break;
      case 'shield_wall': {
        const zone = choice.params?.zone ?? zoneHit?.zone ?? 'front';
        shielded.add(zone);
        events.push({ ...base, zone });
        break;
      }
      case 're_mark': {
        const first = creatures.find((c) => c.ownerId === choice.playerId);
        const element = choice.params?.element ?? first?.element ?? ELEMENTS[0] ?? 'tide';
        events.push({ ...base, element });
        events.push({
          t: 'mark',
          round: currentRound,
          creature: null,
          player: choice.playerId,
          element,
          replaced: mark?.element ?? null,
        });
        mark = { element, creature: null, player: choice.playerId };
        break;
      }
      case 'purge':
        events.push(base);
        if (adaptationActive && rule !== null) {
          adaptationActive = false;
          events.push({
            t: 'adaptation',
            round: currentRound,
            rule: rule.id,
            target: adaptationTarget,
            status: 'purged',
          });
        }
        break;
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
        for (const c of livingIn(g.zone)) hurt(c, amount, 'gimmick', false);
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
          hurt(target, Math.floor((input.bossAtk * g.power) / 10_000), 'gimmick', true);
        }
        break;
      }
      case 'reflect_first_reaction':
        break; // armed at round start
    }
  }

  function bossAttack(): void {
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
  for (let round = 1; round <= rounds && bossHp > 0; round++) {
    played = round;
    currentRound = round;
    events.push({ t: 'round_start', round, bossHp, mark: mark?.element ?? null });
    roundBonusBp = 0;
    rallyBp = 0;
    reflectArmed = false;
    reflectUsed = false;
    shielded.clear();
    runHook('onRoundStart', baseContext, (r) => {
      roundBonusBp += sanitizeBp(pick(r, 'damageBonusBp'));
    });

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

    for (const a of abilitiesByRound.get(round) ?? []) fireAbility(a.choice, a.def, a.byDefault);

    for (const idx of order) {
      const c = creatures[idx] as Creature;
      if (!c.alive) continue;
      if (c.silenced > 0) {
        c.silenced -= 1;
        events.push({ t: 'skip', round, creature: c.id, reason: 'silenced' });
        continue;
      }
      events.push({ t: 'turn', round, creature: c.id });
      hitBoss(c);
      if (bossHp === 0) break;
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
    adaptationSuggestion,
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

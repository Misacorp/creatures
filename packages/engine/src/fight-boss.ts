// The boss's turn: gimmicks (patterns, charges), its plain attacks and the enrage strike.
// Part of the fight engine split from `fight.ts`; the shared state is `FightState` (`fight-state.ts`).
import { RULES, type AppliesDef, type Gimmick, type Zone } from '@creatures/game';
import { hurt, pickGuard } from './fight-damage';
import { applyRider, purgeBoss } from './fight-effects';
import { besides, livingIn, rolls, type Creature, type FightState } from './fight-state';
import { firingIndex, gimmickDue } from './gimmick-schedule';
import {
  DEFAULT_DECAY_BP,
  diceWindow,
  planChain,
  planPattern,
  type PatternContext,
  type PatternPlan,
} from './patterns';
import type { FightEvent } from './types';
import { ZONES, nearestLivingZone, zoneOfIndex } from './zones';

// ---- boss gimmicks and attack ----
/**
 * TARGETING RULE (every rule below picks among LIVING creatures only; a knocked-out creature is
 * never a target, so it can never soak up a boss ability). The attack patterns' selection lives in
 * `patterns.ts`; it returns a plan and `resolvePlan` plays it through `hurt(state)`.
 * - zone strike (`hit_zone`): hits every living creature of the aimed zone; if that zone has
 *   nobody standing, the strike falls to the nearest zone that has (one step away first, the
 *   front-side zone before the back-side one on a tie), so a wiped-out zone does not make the
 *   attack miss. Nothing happens only when the whole row is down. A sweep of a named row does the
 *   same.
 * - row ends (`silence_ends`): the leftmost and the rightmost LIVING creature of the whole line
 *   (`scope: row`, the dungeon) or of each row (`scope: rows`, the raid); one creature standing is
 *   silenced once, an empty row is skipped, nobody standing, nothing.
 * - strongest (`strike_highest_atk`): the living creature with the highest Attack, ties to the
 *   lower slot; with `jumps`, the next strongest after it.
 * - the plain attack: the front-most living creature (or the Guard of its zone), see `bossAttack`.
 * - random target: one of the living creatures.
 * - Guard intercept and Support buffs only count a living Guard or Support, and a buff only goes
 *   to a living neighbour; a Support beside a knocked-out creature simply buffs nobody there.
 */
/** The boss has fallen or retreated (a Riposte can do either in the middle of its own turn). */
export function bossDone(state: FightState): boolean {
  return state.bossHp <= 0 || state.retreated;
}

function zoneWithLiving(state: FightState, aimed: Zone): Zone | undefined {
  return nearestLivingZone(aimed, (z) => livingIn(state, z).length > 0);
}

/** `atRound` is the round the pattern fires in (a charge is planned a round before it lands). */
function patternContext(
  state: FightState,

  g: Gimmick,
  gimmickIndex: number,
  atRound = state.currentRound,
): PatternContext {
  const { n, shape, rules, creatures } = state;
  return {
    creatures,
    n,
    shape,
    firing: firingIndex(g, atRound),
    dice: diceWindow(state.patternDice, gimmickIndex),
    ...(rules === undefined ? {} : { guardDice: state.guardDice }),
    ...(state.lastVolley.has(g.id)
      ? { previousVolley: state.lastVolley.get(g.id) as number[] }
      : {}),
  };
}

/**
 * Plays a plan's hits in order; a slam's splash goes to the living creatures beside the impact.
 * With `rules`, a chain's jumps skip the creature that took its first hit (a Guard that stepped in
 * for it): each jump goes to the next strongest creature not yet hit (`plan.chain`).
 */
function resolvePlan(
  state: FightState,
  plan: PatternPlan,
  charged = false,
  applies?: AppliesDef,
): void {
  const { input, rules, creatures } = state;
  const chain = rules === undefined ? undefined : plan.chain;
  let jumps = chain?.rest ?? [];
  for (const [k, h] of plan.hits.entries()) {
    let targetIdx = h.target;
    if (chain !== undefined && k > 0) {
      const next = jumps[k - 1];
      if (next === undefined) continue;
      targetIdx = next;
    }
    // The boss fell or retreated mid-move (a Riposte): the rest of the move does not happen.
    if (bossDone(state)) return;
    const target = creatures[targetIdx] as Creature;
    // A creature that fell earlier in the same action is not hit again.
    if (!target.alive) continue;
    const raw = Math.floor((input.bossAtk * h.powerBp) / 10_000);
    const impact = hurt(
      state,
      target,
      raw,
      'gimmick',
      h.kind,
      state.bossGimmickDice[target.idx],
      false,
      charged,
    );
    applyRider(state, applies, impact);
    if (chain !== undefined && k === 0) jumps = chain.rest.filter((i) => i !== impact.idx);
    if (plan.splashBp !== undefined && h.kind === 'aimed') {
      const splashRaw = Math.floor((raw * plan.splashBp) / 10_000);
      for (const i of besides(state, impact.idx)) {
        const next = creatures[i] as Creature;
        if (bossDone(state)) return;
        if (next.alive) {
          const taker = hurt(
            state,
            next,
            splashRaw,
            'gimmick',
            'area',
            state.bossGimmickDice[next.idx],
            true,
            charged,
          );
          applyRider(state, applies, taker);
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
export function announceCharges(state: FightState): void {
  const { boss, rounds, creatures, events } = state;
  const landing = state.currentRound + 1;
  if (landing > rounds) return;
  for (const [gi, g] of boss.gimmicks.entries()) {
    if (g.op !== 'charge' || !gimmickDue(g, landing)) continue;
    const plan = planPattern(g.then, patternContext(state, g, gi, landing));
    if (g.then.op === 'barrage') state.lastVolley.set(g.id, plan.targets);
    state.pendingCharges.set(`${String(gi)}:${String(landing)}`, plan);
    events.push({
      t: 'charge',
      round: state.currentRound,
      landing,
      gimmick: g.id,
      op: g.then.op,
      marks: plan.targets.map((i) => (creatures[i] as Creature).id),
      ...(plan.rows === undefined ? {} : { rows: plan.rows }),
    });
    // Storm warning: a marked creature takes less from the landing.
    for (const i of plan.targets) {
      const c = creatures[i] as Creature;
      if (c.mods.stormWarningBp === 0 || !c.alive) continue;
      c.stormRound = landing;
      events.push({
        t: 'proc',
        round: state.currentRound,
        creature: c.id,
        kind: 'storm_warning',
        amount: c.mods.stormWarningBp,
      });
    }
  }
}

export function fireGimmick(state: FightState, g: Gimmick, gimmickIndex: number): void {
  const { input, shape, creatures, events } = state;
  const base = { t: 'gimmick' as const, round: state.currentRound, gimmick: g.id, op: g.op };
  const named = (plan: PatternPlan): FightEvent => ({
    ...base,
    targets: plan.targets.map((i) => (creatures[i] as Creature).id),
    ...(plan.rows === undefined ? {} : { rows: plan.rows }),
    ...(plan.lane === undefined ? {} : { lane: plan.lane }),
  });
  if (g.op === 'charge') {
    // The marks of the announcement are hit; one that fell since is skipped (nobody is re-aimed).
    const key = `${String(gimmickIndex)}:${String(state.currentRound)}`;
    const pending = state.pendingCharges.get(key);
    if (pending === undefined) return;
    state.pendingCharges.delete(key);
    const standing = pending.targets.filter((i) => (creatures[i] as Creature).alive);
    const rows = pending.rows?.filter((z) => standing.some((i) => zoneOfIndex(i, shape) === z));
    events.push(
      named({
        ...pending,
        targets: standing,
        ...(rows === undefined ? {} : { rows }),
      }),
    );
    resolvePlan(state, pending, true, g.applies);
    return;
  }
  switch (g.op) {
    case 'hit_zone': {
      events.push(base);
      const zone = zoneWithLiving(state, g.zone);
      if (zone === undefined) break;
      const amount = Math.floor((input.bossAtk * g.power) / 10_000);
      for (const c of livingIn(state, zone)) {
        if (bossDone(state)) break;
        const taker = hurt(state, c, amount, 'gimmick', 'area', state.bossGimmickDice[c.idx]);
        applyRider(state, g.applies, taker);
      }
      break;
    }
    case 'silence_ends': {
      events.push(base);
      // The two ends of the whole line (`row`), or of each board row (`rows`).
      const lines =
        g.scope === 'rows'
          ? ZONES.map((z) => livingIn(state, z))
          : [creatures.filter((c) => c.alive)];
      const ends = lines.flatMap((line) => {
        const first = line[0];
        const last = line[line.length - 1];
        if (first === undefined || last === undefined) return [];
        return first === last ? [first] : [first, last];
      });
      for (const c of ends) {
        // Unbothered: the silence still picks it (the ends), and does nothing to it.
        if (c.mods.ignoreSilence) continue;
        // Steady paws: a chance to shrug it off (the creature's die 2 of this round).
        if (rolls(state, c, 2, c.mods.steadyPawsBp)) {
          events.push({
            t: 'proc',
            round: state.currentRound,
            creature: c.id,
            kind: 'steady_paws',
          });
          continue;
        }
        c.silenced = Math.max(c.silenced, g.turns);
        events.push({ t: 'silence', round: state.currentRound, creature: c.id, turns: g.turns });
        // Patient: the silence gives its next turn hit a bonus.
        if (c.mods.patientBp > 0) {
          c.patientReady = c.mods.patientBp;
          events.push({
            t: 'proc',
            round: state.currentRound,
            creature: c.id,
            kind: 'patient',
            amount: c.mods.patientBp,
          });
        }
      }
      break;
    }
    case 'strike_highest_atk': {
      const jumps = g.jumps ?? 0;
      const plan = planChain(patternContext(state, g, gimmickIndex), {
        power: g.power,
        jumps,
        decayBp: g.decayBp ?? DEFAULT_DECAY_BP,
      });
      events.push(jumps > 0 ? named(plan) : base);
      resolvePlan(state, plan, false, g.applies);
      break;
    }
    case 'reflect_first_reaction':
      // Armed at round start, where the one `gimmick` event for the trap is written. Nothing
      // happens on the boss's turn, so nothing is announced again (it used to be, twice a round).
      break;
    case 'sweep':
    case 'barrage':
    case 'slam':
    case 'lance':
    case 'pincer': {
      const plan = planPattern(g, patternContext(state, g, gimmickIndex));
      events.push(named(plan));
      if (g.op === 'barrage') state.lastVolley.set(g.id, plan.targets);
      resolvePlan(state, plan, false, g.applies);
      break;
    }
    case 'purge':
      // The boss shakes off its debuffs, in its normal move order.
      events.push(base);
      purgeBoss(state);
      break;
  }
}

/**
 * One plain attack: an aimed hit on the front-most row's Guard (else its leftmost creature),
 * picked from who stands right now. `dice` are this attack's boss crit dice by target slot.
 */
function bossAttack(state: FightState, dice: readonly number[]): void {
  const { input, randomTargetBp, creatures } = state;
  if (randomTargetBp > 0 && state.targetDice.use < randomTargetBp) {
    const living = creatures.filter((c) => c.alive);
    const target = living[Math.floor((state.targetDice.pick * living.length) / 1_000_000)];
    if (target !== undefined) {
      hurt(
        state,
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
    const living = livingIn(state, zone);
    const first = living[0];
    if (first === undefined) continue;
    // The zone's Guard takes the plain attack (with `rules` and several, one picked by the die of
    // the front-most slot's position).
    const target =
      pickGuard(
        state,
        living.filter((c) => c.role === 'guard'),
        first.idx,
      ) ?? first;
    hurt(
      state,
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
 * The boss's plain attack, `bossAttacks` times (1 unless the input says more). Each attack picks
 * its target afterwards from the creatures standing then, so a creature the first one knocked out
 * is not aimed at again, and each has its own crit die.
 */
export function plainAttacks(state: FightState): void {
  const { bossAttacks, creatures } = state;
  for (let k = 0; k < bossAttacks; k++) {
    if (!creatures.some((c) => c.alive) || bossDone(state)) return;
    bossAttack(state, k === 0 ? state.bossAttackDice : (state.extraAttackDice[k - 1] ?? []));
  }
}

/**
 * Enrage: the boss's hit on every living creature, for `powerBp` of its Attack (area hits: cover,
 * Shield Walls and the single-hit cap apply).
 */
export function enrageStrike(state: FightState): void {
  const { input, enrage, creatures } = state;
  const raw = Math.floor((input.bossAtk * (enrage?.powerBp ?? 0)) / 10_000);
  for (const c of creatures) {
    if (bossDone(state)) return;
    if (c.alive) hurt(state, c, raw, 'enrage', 'area', state.bossGimmickDice[c.idx]);
  }
}

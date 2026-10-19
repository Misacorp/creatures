// Damage to creatures: `hurt` and the guard helpers it uses (docs/design/attack-patterns.md section 1).
// Part of the fight engine split from `fight.ts`; the shared state is `FightState` (`fight-state.ts`).
import { RULES } from '@creatures/game';
import { creatureDodgeBp, nextTakenDie } from './fight-dodge';
import { BOSS, clearEffects, effectBpOf } from './fight-effects';
import {
  baseContext,
  besides,
  credit,
  further,
  livingIn,
  rolls,
  runHook,
  view,
  type Creature,
  type FightState,
} from './fight-state';
import { cutBp } from './mods';
import { pickGuardWith } from './patterns';
import type { CreatureTotals } from './types';
import { zoneOfIndex } from './zones';

// ---- damage to creatures ----
/**
 * The Guard that takes a hit aimed at `target`: by default one standing in the target's zone;
 * with `guardReach: 'adjacent'`, one standing right beside it (the left neighbour first).
 */
function guardFor(state: FightState, target: Creature): Creature | undefined {
  const { shape, guardReach, creatures } = state;
  const candidates =
    guardReach === 'adjacent'
      ? besides(state, target.idx)
          .map((i) => creatures[i] as Creature)
          .filter((c) => c.alive && c.role === 'guard')
      : livingIn(state, zoneOfIndex(target.idx, shape)).filter((c) => c.role === 'guard');
  return pickGuard(state, candidates, target.idx);
}

/**
 * One of several Guards that could take a hit on slot `slot`. Without `rules` always the first
 * (the left one); with `rules` that slot's die picks one, uniformly.
 */
export function pickGuard(
  state: FightState,
  candidates: Creature[],
  slot: number,
): Creature | undefined {
  const { rules } = state;
  return pickGuardWith(candidates, slot, rules === undefined ? undefined : state.guardDice);
}

/**
 * The share of damage a Guard does not take (basis points): the rules' armor
 * (`FightRules.guardArmorBp`) plus the Guard's own sheet (`mods.armorBp`).
 */
function guardArmorFor(state: FightState, c: Creature): number {
  const { rules } = state;
  if (rules === undefined || c.role !== 'guard') return 0;
  return Math.max(0, Math.min(10_000, rules.guardArmorBp + c.mods.armorBp));
}

/**
 * A living Guard right beside `victim` (as the Support's `besides` counts it), as it stands now:
 * the Guard whose cover softens an area hit (left neighbour first).
 */
function coverGuardFor(state: FightState, victim: Creature): Creature | undefined {
  const { creatures } = state;
  for (const i of besides(state, victim.idx)) {
    const c = creatures[i] as Creature;
    if (c.alive && c.role === 'guard') return c;
  }
  // A Guard with a longer reach (`coverReach`) also covers the creature one slot further out.
  for (const i of further(state, victim.idx)) {
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
 *    several candidates a die picks one (`state.guardDice`).
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
export function hurt(
  state: FightState,

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
  const { boss, shape, bossCrit, bossCritOn, rules, creatures, events, perCreature } = state;
  state.lastHitDodged = false;
  const crit = die !== undefined && bossCritOn && die < bossCrit.chanceBp;
  // The boss's own status effects (Mired) change the damage it deals; a reflected hit is a creature's
  // reaction coming back, not the boss's own damage, so they do not touch it.
  const effectBp = mode === 'reflect' ? 0 : effectBpOf(state, BOSS, 'damageDealtBp');
  let amount = Math.max(
    0,
    Math.floor(
      (rawAmount *
        Math.max(0, 10_000 + state.bossDamageBp + effectBp + (crit ? bossCrit.damageBp : 0))) /
        10_000,
    ),
  );
  // 1. Who takes it (an aimed hit: a Guard steps in, see `guardFor`). The pick uses no state of the
  // hit, so doing it before the Shield Wall changes nothing for a hit the wall stops.
  let victim = target;
  const intercepts = mode === 'aimed' || (mode === 'reflect' && rules !== undefined);
  if (intercepts && target.role !== 'guard') {
    const guard = guardFor(state, target);
    if (guard !== undefined) victim = guard;
  }
  // Dodge (combat-rules.md 14): the taker rolls before any wall, armor, cover or crit. Never on a reflected
  // hit, and never on a hit a Guard stepped in to take (the Guard chose it). A charge landing and an enrage
  // hit roll the full chance whatever their kind; any other area hit rolls the area chance. The die counts
  // for every hit the taker takes, rolled or not, so the numbering never depends on the hit's kind.
  if (state.dodge !== undefined) {
    const die = nextTakenDie(state, victim);
    if (mode !== 'reflect' && victim === target) {
      const area = mode === 'area' && !charged && source !== 'enrage';
      if (die < creatureDodgeBp(state, victim, area)) {
        // Sidestep is only rolled when the dodge failed, but its die numbering still counts this area hit.
        if (mode === 'area' && victim.mods.sidestepBp > 0) {
          state.areaSeen[victim.idx] = (state.areaSeen[victim.idx] ?? 0) + 1;
        }
        state.lastHitDodged = true;
        events.push({
          t: 'boss_hit',
          round: state.currentRound,
          source,
          target: victim.id,
          damage: 0,
          dodged: true,
          ...(splash ? { splash: true as const } : {}),
        });
        return victim;
      }
    }
  }
  // Sidestep: a chance to take nothing from an area hit (before any wall, armor or cover).
  if (mode === 'area' && victim.mods.sidestepBp > 0) {
    const k = Math.min(state.areaSeen[victim.idx] ?? 0, 3);
    state.areaSeen[victim.idx] = (state.areaSeen[victim.idx] ?? 0) + 1;
    if (rolls(state, victim, 6 + k, victim.mods.sidestepBp)) {
      events.push({
        t: 'boss_hit',
        round: state.currentRound,
        source,
        target: victim.id,
        damage: 0,
        sidestep: true,
        ...(splash ? { splash: true as const } : {}),
      });
      return victim;
    }
  }
  // 2. Shield Walls on the zone multiply: two 50% walls leave 25% of the damage. With `rules` the
  // wall that counts is the one on the zone of the creature that TAKES the hit (after a Guard
  // stepped in); without `rules` it is the zone the hit was aimed at (stored fights replay so).
  const walled = rules === undefined ? target : victim;
  const zone = zoneOfIndex(walled.idx, shape);
  let remainingBp = 10_000;
  for (const w of state.shields) {
    if (w.zone === zone && w.until >= state.currentRound) {
      remainingBp = Math.floor((remainingBp * (10_000 - w.reduceBp)) / 10_000);
    }
  }
  if (remainingBp === 0) {
    events.push({
      t: 'boss_hit',
      round: state.currentRound,
      source,
      target: walled.id,
      damage: 0,
      shielded: true,
      ...(walled !== target ? { from: target.id } : {}),
      ...(splash ? { splash: true as const } : {}),
    });
    if (walled !== target) paybackFor(state, walled);
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
    out = cutBp(out, m.takenBp);
    // The trigger lines that cut a hit: Last stand (once it fired) and Storm warning (the landing it was marked for).
    out = cutBp(out, victim.lastStandCut);
    return charged && victim.stormRound === state.currentRound
      ? cutBp(out, victim.mods.stormWarningBp)
      : out;
  };
  let warded: number;
  if (rules !== undefined) {
    const capAt =
      mode !== 'reflect' && rules.maxHitBp > 0
        ? Math.max(1, Math.floor((victim.maxHp * rules.maxHitBp) / 10_000))
        : Number.POSITIVE_INFINITY;
    let after = amount;
    // 3. Armor.
    const armorBp = guardArmorFor(state, victim);
    if (armorBp > 0) after = amount - Math.floor((amount * armorBp) / 10_000);
    // 4. Cover.
    const guard =
      mode === 'area' && rules.coverBp > 0 && victim.role !== 'guard'
        ? coverGuardFor(state, victim)
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
      credit(state, guard, null, 'guardCredit', prevented);
    }
    if (armorBp > 0 && prevented > 0) {
      armored = prevented;
      // Armor on a hit aimed at the Guard itself is not credited.
      if (victim !== target) credit(state, victim, null, 'guardCredit', prevented);
    }
    amount = final;
  } else {
    const afterSheet = sheet(amount);
    warded = amount - afterSheet;
    amount = afterSheet;
  }
  // Stubborn: the first hit that would knock it out leaves it at 1 HP (the hit still shows its full damage).
  let taken = Math.min(amount, victim.hp);
  const stubborn =
    victim.mods.stubborn &&
    !victim.stubbornUsed &&
    victim.hp > 0 &&
    amount > 0 &&
    taken >= victim.hp;
  if (stubborn) {
    victim.stubbornUsed = true;
    taken = victim.hp - 1;
  }
  victim.hp -= taken;
  (perCreature[victim.id] as CreatureTotals).damageTaken += taken;
  // Guard credit: all of the damage a Guard takes in place of a neighbour, and `guardOwnCreditBp`
  // of what it takes when the hit was aimed at the Guard itself.
  if (victim.role === 'guard') {
    const share = victim !== target ? 10_000 : RULES.combat.guardOwnCreditBp;
    credit(state, victim, null, 'guardCredit', Math.floor((taken * share) / 10_000));
  }
  events.push({
    t: 'boss_hit',
    round: state.currentRound,
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
    ...(stubborn ? { stubborn: true as const } : {}),
  });
  if (stubborn)
    events.push({ t: 'proc', round: state.currentRound, creature: victim.id, kind: 'stubborn' });
  if (victim.hp === 0 && victim.alive) {
    victim.alive = false;
    clearEffects(victim);
    (perCreature[victim.id] as CreatureTotals).knockedOutRound = state.currentRound;
    events.push({ t: 'knockout', round: state.currentRound, creature: victim.id });
    runHook(state, 'onKnockout', () => ({ ...baseContext(state), creature: view(victim) }));
    // Rally cry: each living neighbour of the fallen creature hits harder from now on.
    for (const i of besides(state, victim.idx)) {
      const next = creatures[i] as Creature;
      if (!next.alive || next.mods.rallyCryBp === 0) continue;
      next.rallyCry += next.mods.rallyCryBp;
      events.push({
        t: 'proc',
        round: state.currentRound,
        creature: next.id,
        kind: 'rally_cry',
        target: victim.id,
        amount: next.mods.rallyCryBp,
      });
    }
  } else if (
    victim.alive &&
    victim.mods.lastStandBp > 0 &&
    !victim.lastStandDone &&
    victim.hp * 4 <= victim.maxHp
  ) {
    // Last stand: a hit leaves it at a quarter of its HP or less.
    victim.lastStandDone = true;
    victim.lastStandCut = victim.mods.lastStandBp;
    events.push({
      t: 'proc',
      round: state.currentRound,
      creature: victim.id,
      kind: 'last_stand',
      amount: victim.mods.lastStandBp,
    });
  }
  if (victim !== target) paybackFor(state, victim);
  return victim;
}

/** Payback: a creature that took a hit for a neighbour (and stands) gets a bonus on its next turn hit. */
function paybackFor(state: FightState, c: Creature): void {
  const { events } = state;
  if (!c.alive || c.mods.paybackBp === 0) return;
  c.paybackReady = c.mods.paybackBp;
  events.push({
    t: 'proc',
    round: state.currentRound,
    creature: c.id,
    kind: 'payback',
    amount: c.mods.paybackBp,
  });
}

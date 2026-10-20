// Status effects: stacks and turns on a creature or the boss (docs/design/combat-rules.md section 13).
// Part of the fight engine split from `fight.ts`; the shared state is `FightState` (`fight-state.ts`).
import type { AppliesDef, StatusEffectDef } from '@creatures/game';
import type { ActiveEffect, Creature, Fighter, FightState } from './fight-state';

/** The boss as a fighter (a foe too): the other kind of `Fighter` is a `Creature`. */
export const BOSS = 'boss' as const;

/** The id the events use for a fighter: a creature's id, or null for the boss. */
function fighterId(f: Fighter): string | null {
  return f === BOSS ? null : f.id;
}

function listOf(state: FightState, f: Fighter): ActiveEffect[] {
  return f === BOSS ? state.bossEffects : f.effects;
}

function defOf(state: FightState, id: string): StatusEffectDef {
  const def = state.effectDefs.get(id);
  if (def === undefined) throw new RangeError(`invalid fight input: unknown status effect "${id}"`);
  return def;
}

/**
 * The sum of one per-stack number over the fighter's effects (stacks times the number), in basis
 * points. 0 for a fighter without effects, so a fight without them is unchanged.
 */
export function effectBpOf(
  state: FightState,
  f: Fighter,
  field: 'spdBp' | 'damageDealtBp',
): number {
  // Clean coat (`debuffResistBp`): a creature's debuffs have weaker numbers per stack, rounded toward 0.
  const resist = f === BOSS ? 0 : f.mods.debuffResistBp;
  let sum = 0;
  for (const e of listOf(state, f)) {
    const def = defOf(state, e.id);
    let per = def.perStack[field] ?? 0;
    if (resist > 0 && def.kind === 'debuff') {
      per = Math.sign(per) * Math.floor((Math.abs(per) * (10_000 - resist)) / 10_000);
    }
    sum += e.stacks * per;
  }
  return sum;
}

/**
 * The fighter's Speed with its effects folded in: the base Speed times `10000 + sum of spdBp x stacks`
 * (rounded down, never below 0). A boss or foe's base is its content `baseSpd` (0 when absent); a
 * creature's is its stats' Speed. Dodge reads it (`fight-dodge.ts`).
 */
export function effectiveSpd(state: FightState, f: Fighter): number {
  const base = f === BOSS ? (state.boss.baseSpd ?? 0) : f.spd;
  const factor = Math.max(0, 10_000 + Math.max(-10_000, effectBpOf(state, f, 'spdBp')));
  return Math.floor((base * factor) / 10_000);
}

/** The effect dice of a round ran out: further fractional chances count as a miss. */
function effectDie(state: FightState): number {
  const die = state.effectDice[state.effectDiceUsed];
  state.effectDiceUsed += 1;
  return die ?? 10_000;
}

/**
 * Applies the effect `effectId` to `target` at `powerBp` application power: `floor(power / 10000)`
 * stacks for sure, plus one more with a chance of `power % 10000` in basis points, rolled on the
 * round's effect dice (taken in order, one for each application that has a fractional part; a spent
 * pool counts as a miss). A roll of 0 stacks is a miss and changes nothing. Any roll of 1 or more
 * stacks adds them (up to the effect's cap, also when it is already full) and sets the timer back to
 * the full duration (`turns` plus `durationTurns`). `source` is the creature that applied it (null: the
 * boss or something that is not a creature). Does nothing when the fight has effects off or the
 * target is knocked out.
 */
export function applyEffect(
  state: FightState,
  target: Fighter,
  effectId: string,
  powerBp: number,
  source: string | null,
  durationTurns = 0,
): void {
  if (!state.effectsOn) return;
  if (!Number.isSafeInteger(powerBp) || powerBp < 0) {
    throw new RangeError('invalid fight input: effect power must be an integer >= 0');
  }
  if (!Number.isSafeInteger(durationTurns) || durationTurns < 0) {
    throw new RangeError('invalid fight input: effect duration bonus must be an integer >= 0');
  }
  const def = defOf(state, effectId);
  if (target !== BOSS && !target.alive) return;
  // The applier's sheet (Heavy hand, Clinging): a debuff it applies has more power and lasts longer.
  if (source !== null && def.kind === 'debuff') {
    const from = state.creatures.find((c) => c.id === source);
    if (from !== undefined) {
      powerBp += from.mods.debuffPowerBp;
      durationTurns += from.mods.debuffDurationTurns;
    }
  }
  const sure = Math.floor(powerBp / 10_000);
  const chance = powerBp % 10_000;
  const rolled = sure + (chance > 0 && effectDie(state) < chance ? 1 : 0);
  if (rolled === 0) return;
  const list = listOf(state, target);
  const turnsLeft = def.turns + durationTurns;
  const have = list.find((e) => e.id === effectId);
  const before = have?.stacks ?? 0;
  const stacks = Math.min(def.maxStacks, before + rolled);
  if (have === undefined) list.push({ id: effectId, stacks, turnsLeft });
  else {
    have.stacks = stacks;
    have.turnsLeft = turnsLeft;
  }
  state.events.push({
    t: 'effect_apply',
    round: state.currentRound,
    target: fighterId(target),
    effect: effectId,
    stacksAdded: stacks - before,
    stacks,
    turnsLeft,
    ...(source === null ? {} : { source }),
  });
}

/** A damaging move's rider: the effect goes on the creature that took the hit, if it still stands and did not dodge it. */
export function applyRider(
  state: FightState,
  applies: AppliesDef | undefined,
  victim: Creature,
): void {
  if (applies === undefined) return;
  // A dodged hit applies nothing (the hit that was just resolved, `hurt` sets the flag every call).
  if (state.lastHitDodged) return;
  applyEffect(state, victim, applies.effect, applies.powerBp, null, applies.durationTurns ?? 0);
}

/**
 * The end of one of the fighter's turns: every effect on it has one turn less, and one that reaches
 * 0 ends (`effect_expire`; all its stacks go together). A creature's turn is its turn even when it was
 * skipped (silence, haze); the boss's is its whole boss turn.
 */
export function tickEffects(state: FightState, f: Fighter): void {
  const list = listOf(state, f);
  if (list.length === 0) return;
  for (const e of [...list]) {
    e.turnsLeft -= 1;
    if (e.turnsLeft > 0) continue;
    list.splice(list.indexOf(e), 1);
    state.events.push({
      t: 'effect_expire',
      round: state.currentRound,
      target: fighterId(f),
      effect: e.id,
    });
  }
}

/** A knocked-out creature's effects end at once, with no event (the `knockout` event says it all). */
export function clearEffects(c: Creature): void {
  c.effects = [];
}

/** The boss shakes off every debuff (a `purge` move). One `effect_purge` event, only if any went. */
export function purgeBoss(state: FightState): void {
  const removed: { effect: string; stacks: number }[] = [];
  state.bossEffects = state.bossEffects.filter((e) => {
    if (defOf(state, e.id).kind !== 'debuff') return true;
    removed.push({ effect: e.id, stacks: e.stacks });
    return false;
  });
  if (removed.length > 0) {
    state.events.push({ t: 'effect_purge', round: state.currentRound, removed });
  }
}

/** A Support's cleanse: every debuff on the creature goes, one `effect_cleanse` event for each. */
export function cleanseDebuffs(state: FightState, supporter: Creature, t: Creature): void {
  t.effects = t.effects.filter((e) => {
    if (defOf(state, e.id).kind !== 'debuff') return true;
    state.events.push({
      t: 'effect_cleanse',
      round: state.currentRound,
      supporter: supporter.id,
      target: t.id,
      effect: e.id,
      stacks: e.stacks,
    });
    return false;
  });
}

/**
 * The stacks of `effectId` the boss carries (0 when none, or when effects are off): what a reaction
 * that consumes the effect (Flare) counts before its hit.
 */
export function bossStacks(state: FightState, effectId: string): number {
  if (!state.effectsOn) return 0;
  return state.bossEffects.find((e) => e.id === effectId)?.stacks ?? 0;
}

/**
 * A reaction burns every stack of `effectId` off the boss (the effect ends at once, not by turns): one
 * `effect_consume` event, only if it had stacks. `bonusBp` is the reaction bonus the stacks added.
 */
export function consumeBossEffect(
  state: FightState,
  reaction: string,
  effectId: string,
  bonusBp: number,
): void {
  const have = state.bossEffects.find((e) => e.id === effectId);
  if (have === undefined) return;
  state.bossEffects = state.bossEffects.filter((e) => e !== have);
  state.events.push({
    t: 'effect_consume',
    round: state.currentRound,
    reaction,
    effect: effectId,
    stacks: have.stacks,
    bonusBp,
  });
}

// Dodge: Speed gives a chance to take nothing from a hit (docs/design/combat-rules.md section 14).
// Part of the fight engine split from `fight.ts`; the shared state is `FightState` (`fight-state.ts`).
import { BOSS, effectiveSpd } from './fight-effects';
import { besides, credit, type Creature, type FightState } from './fight-state';
import { matchupBp } from './matchup';

/**
 * Dice a creature gets each round for the hits it takes (the Nth hit it takes that round, as the taker,
 * uses die N, counting every hit it takes whether or not that hit can be dodged). A creature that takes
 * more than this many hits in a round uses the last die for every later one, as Sidestep does with its
 * 4th. Eight is more than a creature meets in a round today (three plain attacks, a few moves, a splash
 * and an enrage hit).
 */
export const DODGE_TAKEN_DICE = 8;

/** Dodge dice run over [0, DODGE_RANGE): a chance of 1000 fires when its die is under 1000. */
export const DODGE_RANGE = 10_000;

/**
 * A creature's dodge chance in basis points: the Speed part (its Speed with its status effects folded in,
 * times `perSpeedBp`, rounded down) plus its flat `dodgeBp`, capped at `maxBp`. Against an area hit the
 * chance is `areaShareBp` of that (rounded down) plus its flat `areaDodgeBp` in full, capped at `maxBp`
 * again. 0 when the fight has no dodge.
 */
export function creatureDodgeBp(state: FightState, c: Creature, area: boolean): number {
  const d = state.dodge;
  if (d === undefined) return 0;
  const full = Math.min(
    d.maxBp,
    Math.floor(effectiveSpd(state, c) * d.perSpeedBp) + c.mods.dodgeBp,
  );
  if (!area) return full;
  return Math.min(d.maxBp, Math.floor((full * d.areaShareBp) / 10_000) + c.mods.areaDodgeBp);
}

/** The boss's (or foe's) dodge chance in basis points: its Speed (with its effects, Mired) times `perSpeedBp`, capped. */
export function bossDodgeBp(state: FightState): number {
  const d = state.dodge;
  if (d === undefined) return 0;
  return Math.min(d.maxBp, Math.floor(effectiveSpd(state, BOSS) * d.perSpeedBp));
}

/**
 * The die for the next hit `victim` takes this round, and counts the hit (every hit counts, so the
 * numbering never depends on which hits can be dodged).
 */
export function nextTakenDie(state: FightState, victim: Creature): number {
  const seen = state.dodgeSeen[victim.idx] ?? 0;
  state.dodgeSeen[victim.idx] = seen + 1;
  const dice = state.dodgeTakenDice[victim.idx];
  return dice?.[Math.min(seen, DODGE_TAKEN_DICE - 1)] ?? DODGE_RANGE;
}

/**
 * True when the boss dodges a creature's hit: its die for this creature's turn hit (or strike) of the
 * round is under the boss's chance. A missing die (dodge off) never dodges.
 */
export function bossDodges(state: FightState, c: Creature, strike: boolean): boolean {
  const chance = bossDodgeBp(state);
  if (chance <= 0) return false;
  const die = (strike ? state.dodgeStrikeDice : state.dodgeTurnDice)[c.idx] ?? DODGE_RANGE;
  return die < chance;
}

/**
 * The on-dodge lines (combat-rules.md 12, speed-and-dodge.md 2.5), run when `victim` dodged a boss hit:
 * - Momentum: its next turn hit deals more (replaces an earlier one).
 * - Slipstream: the living creature beside it with the most Attack (ties to the lower slot) gets a boost on
 *   its next hit, in place of an earlier one of the same creature's.
 * - Riposte: it strikes the boss at once for a share of its Attack, at the element chart's matchup. No mark,
 *   no crit, no reaction, no dodge: it always lands, counted down to the phase floor like any hit on the
 *   boss (no overkill), credited to the creature as damage. A boss that is gone (fell or retreated) is not hit.
 * Each writes a `proc` event. No die is drawn.
 */
export function onDodged(state: FightState, victim: Creature): void {
  const m = victim.mods;
  const { events } = state;
  const round = state.currentRound;
  if (m.momentumBp > 0) {
    victim.momentumReady = m.momentumBp;
    events.push({ t: 'proc', round, creature: victim.id, kind: 'momentum', amount: m.momentumBp });
  }
  if (m.slipstreamBp > 0) {
    let best: Creature | undefined;
    for (const i of besides(state, victim.idx)) {
      const next = state.creatures[i] as Creature;
      if (next.alive && (best === undefined || next.atk > best.atk)) best = next;
    }
    if (best !== undefined) {
      best.buffs = best.buffs.filter((b) => !(b.from === victim.idx && b.tag === 'slipstream'));
      best.buffs.push({ from: victim.idx, bp: m.slipstreamBp, tag: 'slipstream' });
      events.push({
        t: 'proc',
        round,
        creature: victim.id,
        kind: 'slipstream',
        target: best.id,
        amount: m.slipstreamBp,
      });
    }
  }
  if (m.riposteBp > 0 && state.bossHp > 0 && !state.retreated) {
    const plain = Math.floor((victim.atk * m.riposteBp) / 10_000);
    const again = Math.floor(
      (plain * matchupBp(victim.element, state.boss.element, state.pack.elementChart)) / 10_000,
    );
    const room = Math.max(0, state.bossHp - state.bossFloor);
    const landed = Math.min(again, room);
    if (landed > 0) {
      state.bossHp -= landed;
      state.damageByElement[victim.element] += landed;
      credit(state, victim, null, 'damage', landed);
      events.push({
        t: 'proc',
        round,
        creature: victim.id,
        kind: 'riposte',
        amount: landed,
        bossHp: state.bossHp,
      });
      if (state.bossFloor > 0 && again >= room) {
        state.retreated = true;
        events.push({ t: 'retreat', round, bossHp: state.bossHp });
      }
    }
  }
}

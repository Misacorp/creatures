/**
 * The boss's turn (R8 moves and the plain attack, R9 Taunt, R1 dodge and intercepts, R2.3 Night Watch, R7.1 boss crits, R12 Silence,
 * R13 cards and mods, R22 the Build-up's hits): one move landing on its targets, and the turn's moves, plain hits and Clean Scales.
 */
import * as creatureMod from './creature';
import * as boardMod from './board';
import * as marksMod from './marks';
import * as escalationMod from './escalation';
import * as takingMod from './taking';
import * as stateMod from './state';
import type { State } from './state';
import type { BossMove, Fighter } from './types';
import { FULL_STRENGTH_BP } from './types';

// Bound once: a named import is read through a getter on every call under the lab's Vite loader, which costs 15% of a report.
const { counter } = creatureMod;
const { AIMED, beside, inReach, targetsOf } = boardMod;
const { addMark } = marksMod;
const { feed, grown, miredCut, movesOf } = escalationMod;
const { critWardOf, dodgeOf, gainSureCrit, takeHit } = takingMod;
const { alive, best, bump, fx, log, roll, silenced, strengthOf, strong } = stateMod;

/**
 * One move or plain attack lands. A Charged move lands on the creatures shown at round start and never re-aims (a
 * creature knocked out since is skipped). Each target rolls dodge first; then a Guard may take the hit (R1, R2.3): any
 * Guard for an aimed hit; for an area hit only one with an effect that says so (Intercept area hits too); for a Charged
 * hit, single or area, only an effect that says so (Night Watch, any creature in its row, the first Charged hit each boss
 * turn). A Guard takes at most one hit of a move: if it intercepts one, it does not also take its own area hit.
 */
function bossHits(
  s: State,
  move: Pick<
    BossMove,
    'id' | 'pattern' | 'powerBp' | 'silenceTurns' | 'charged' | 'strengthBp' | 'oneShotBp'
  >,
  plain: boolean,
): void {
  const R = s.ctx.rules;
  // An announced move lands on the slots shown at round start; any other aims as it lands.
  const targets =
    s.announced.get(move.id) ?? (move.charged ? [] : targetsOf(s, move.pattern, plain));
  const shape = move.pattern.shape;
  const aimedAt = AIMED.get(targets);
  const full = Math.floor(
    (((grown(s).atk * move.powerBp) / 10_000) * (10_000 - miredCut(s))) / 10_000,
  );
  // Wards are read before the move lands: a ward silenced by this same move still protects.
  const warded = new Set(
    move.silenceTurns
      ? targets.filter(
          (t) => fx(t).ignoreSilence || beside(s, t).some((o) => fx(o).besideNoSilence),
        )
      : [],
  );
  /** Creatures that have taken a hit of this move (their own or one they intercepted). */
  const took = new Set<Fighter>();
  for (const t of targets) {
    // The fight ends the moment the boss is down: the rest of the move does not land.
    if (s.bossHp <= 0) return;
    if (t.hp <= 0) continue;
    // A Guard that intercepted a hit of this move does not also take its own.
    if (took.has(t)) {
      log(
        s,
        'target',
        `${t.name} (row ${t.row + 1}, slot ${t.col + 1}) already took a hit of ${move.id}`,
      );
      continue;
    }
    if (s.opts.log)
      log(s, 'target', `${t.name} (row ${t.row + 1}, slot ${t.col + 1}) <- ${move.id}`);
    const area = !(
      shape === 'single' ||
      ((shape === 'line3' || shape === 'chain' || shape === 'cross') &&
        (aimedAt ? aimedAt.has(t) : t === targets[0]))
    );
    // A chain's jumps each deal a share of the hit before: the first hit full, the next at decay, then decay squared.
    const gate = move.strengthBp ?? strengthOf(s);
    let proposed = full;
    // A one-shot is a share of the target's Max HP (a heavy hit below full strength), still cut by Mired.
    if (move.oneShotBp)
      proposed = Math.floor(
        (((t.maxHp * move.oneShotBp * gate) / 1e8) * (10_000 - miredCut(s))) / 10_000,
      );
    if (shape === 'chain')
      for (let k = targets.indexOf(t); k > 0; k--)
        proposed = Math.floor((proposed * (move.pattern.decayBp ?? 6_000)) / 10_000);
    // A move that deals no damage is not dodged or intercepted (R1).
    if (move.silenceTurns) {
      if (warded.has(t)) {
        if (fx(t).ignoreSilence) bump(t, 'ignoreSilence');
        if (s.opts.log) log(s, 'silence', `${t.name} shrugs off the silence`);
        continue;
      }
      // A weaker gate hits fewer of the slots it picks and lasts fewer turns (at least one).
      if (!strong(s, gate)) {
        if (s.opts.log) log(s, 'silence', `${t.name} is spared the silence`);
        continue;
      }
      const turns =
        gate >= FULL_STRENGTH_BP
          ? move.silenceTurns
          : Math.max(1, Math.round((move.silenceTurns * gate) / 10_000));
      t.silencedTurns = Math.max(t.silencedTurns, turns);
      if (s.opts.log) log(s, 'silence', `${t.name} is silenced`);
      continue;
    }
    // R1: the target rolls dodge first; a charged landing rolls at full chance.
    if (roll(s, dodgeOf(s, t, area && !move.charged))) {
      s.count.dodges++;
      if (s.opts.log) log(s, 'dodge', `${t.name} dodges`);
      const k = fx(t);
      // Retaliate ignores armour: the hit back is a counter, not a hit (keywords).
      if (k.retaliateBp) counter(s, t, k.retaliateBp);
      if (k.storeDodgeStacks) t.store = Math.min(3, t.store + 1);
      // Momentum: its next hit deals more. Perfect Timing: it stores a Sure Crit.
      if (k.momentumBp) t.momentum = true;
      if (k.dodgeCritBp) gainSureCrit(s, t, 'dodgeCritBp');
      continue;
    }
    // Only if the dodge failed: a Guard in reach intercepts, if the hit is one it may take.
    let taker = t;
    let watched = false;
    if (t.role !== 'guard') {
      const guard = best(
        alive(s),
        // R1.3: a Guard first (nearest, then leftmost); an effect interceptor only when no Guard can.
        (a, b) =>
          Number(b.role === 'guard') - Number(a.role === 'guard') ||
          Math.abs(a.col - t.col) - Math.abs(b.col - t.col) ||
          a.col - b.col,
        (g) =>
          g.row === t.row &&
          g !== t &&
          !silenced(g) &&
          !fx(g).noIntercept &&
          !took.has(g) &&
          (g.role === 'guard'
            ? inReach(s, g, t)
            : fx(g).interceptLikeGuard === true && Math.abs(g.col - t.col) === 1) &&
          (move.charged
            ? area && fx(g).interceptArea === true
            : !area || fx(g).interceptArea === true),
      );
      // Night Watch: the first Charged hit each boss turn on a creature in its row, whatever the distance.
      const watch = move.charged
        ? best(
            alive(s),
            (a, b) => Math.abs(a.col - t.col) - Math.abs(b.col - t.col) || a.col - b.col,
            (g) =>
              g !== t &&
              g.row === t.row &&
              !took.has(g) &&
              fx(g).interceptCharged === true &&
              g.watchTurn !== s.bossTurnsDone,
          )
        : undefined;
      const by = guard ?? watch;
      if (by) {
        taker = by;
        took.add(by);
        if (by === watch) {
          watched = true;
          by.watchTurn = s.bossTurnsDone;
          bump(by, 'interceptCharged');
        } else if (area && fx(by).interceptArea) {
          // Take It All: the area hit it takes is cut by its own cover, like Night Watch's.
          watched = true;
        }
        s.count.intercepts++;
        if (s.opts.log) log(s, 'intercept', `${by.name} intercepts for ${t.name}`);
        // Momentum: a hit aimed at it that another creature took counts like a dodge.
        if (fx(t).momentumBp) t.momentum = true;
        if (fx(by).flankGuard) bump(by, 'flankGuard');
        if (fx(by).primeOnIntercept && by.lastPrimeRound !== s.round) {
          by.lastPrimeRound = s.round;
          addMark(s, by.element, 2, { by });
        }
        // Shoulder Charge: it strikes back, ignoring armour (a counter, not a hit).
        if (fx(by).interceptHitBackBp) {
          counter(s, by, fx(by).interceptHitBackBp ?? 0);
          bump(by, 'interceptHitBackBp');
          if (s.bossHp <= 0) return;
        }
      }
    }
    took.add(taker);
    // A boss crit (R7.1): rolled for each hit that lands on a creature, after the dodge and the intercept and before the cuts
    // and the armour, so Cool Head, the cover, Brace and armour all work on the doubled hit. A one-shot never crits.
    if (!move.oneShotBp && proposed > 0 && roll(s, s.boss.critChanceBp ?? 0)) {
      const ward = critWardOf(s, taker);
      proposed += Math.floor((proposed * (R.critBp - 10_000) * (10_000 - ward)) / 1e8);
      if (s.opts.log) log(s, 'boss-crit', `${s.boss.name} crits ${taker.name}`);
    }
    takeHit(s, taker, proposed, move.charged ? 'charged' : area ? 'area' : 'aimed', t, watched);
  }
}

export function bossTurn(s: State, turn: number): void {
  if (s.bossHp <= 0) return;
  s.turn = turn;
  const ageAtStart = s.markAge;
  const last = s.boss.rows - 1;
  for (const m of movesOf(s)) {
    if (s.bossHp <= 0) return;
    if (s.round % m.every === 0 && (m.turn ?? last) === turn) {
      if (s.opts.log) log(s, 'move', m.name);
      bossHits(s, m, false);
    }
  }
  for (let i = 0; i < grown(s).hits; i++) {
    if (s.bossHp <= 0) return;
    bossHits(
      s,
      { id: 'plain', pattern: s.boss.plain.pattern, powerBp: s.boss.plain.powerBp },
      true,
    );
  }
  if (s.bossHp <= 0) return;
  // Clean Scales sheds the marks that were on the boss when this turn began, unless sealed (R8).
  if (s.boss.mods.shedMarks)
    for (const [el, m] of s.marks)
      if (!m.sealed && m.age < ageAtStart && strong(s, strengthOf(s))) {
        s.marks.delete(el);
        feed(s, 'shed');
      }
  s.bossTurnsDone++;
  s.reflectArmed = true;
}

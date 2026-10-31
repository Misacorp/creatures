/**
 * A creature's turn and its hits on the boss (R6 the hit, R6.3b crits, R7 reactions, R7.1 crit damage, R15 the bonus cap, Pierce,
 * Sure Crits, Steady Rhythm, Cull and the killing blow, counters).
 */
import type { KnackFx } from './effects';
import type { Fighter } from './types';
import * as marksMod from './marks';
import * as boardMod from './board';
import * as escalationMod from './escalation';
import * as takingMod from './taking';
import * as stateMod from './state';
import type { Mark, State } from './state';

// Bound once: a named import is read through a getter on every call under the lab's Vite loader, which costs 15% of a report.
const { addMark, heal } = marksMod;
const { beside } = boardMod;
const { feed, grown, miredCut } = escalationMod;
const { takeHit } = takingMod;
const { alive, best, bump, fx, log, roll, silenced, strengthOf } = stateMod;

/**
 * Damage to the boss by `f`: HP, damage counts, Cull and the killing blow. A counter (Retaliate, Shoulder
 * Charge's strike-back) is damage and can land the killing blow, but it is not a hit: it never sets off
 * Cull. A hit that leaves the boss below `f`'s Cull share of its full HP (in a raid weekend, the weekend's
 * shared HP) defeats it outright; the HP that was left counts as the killing blow, not as damage dealt.
 * The creature whose damage or Cull takes the last HP lands the killing blow (the first one only).
 */
function hitBoss(s: State, f: Fighter, rawDmg: number, isHit: boolean): void {
  const dmg = s.opts.determinationBp
    ? Math.floor((rawDmg * (10_000 + s.opts.determinationBp)) / 10_000)
    : rawDmg;
  // Damage potential: every point of damage counts and the boss stays at 1 HP instead of dying (`FightOptions.potential`).
  // The boss's real HP (the shadow) keeps falling; the HP the fight reads for life and death stays at 1.
  const real = s.opts.potential ? dmg : Math.min(dmg, s.bossHp);
  s.shadowHp -= real;
  s.bossHp = s.opts.potential ? Math.max(1, s.shadowHp) : s.shadowHp;
  const dealt = real;
  let culled = false;
  const cull = isHit ? fx(f).cullBp : undefined;
  if (cull && real > 0 && s.shadowHp > 0 && s.shadowHp * 10_000 < s.boss.hp * cull) {
    // In potential the boss lives on (it stays at 1 HP), but it counts as defeated by the Cull for every HP-share rule.
    s.shadowHp = 0;
    s.bossHp = s.opts.potential ? 1 : 0;
    culled = true;
    bump(f, 'cullBp');
    if (s.opts.log) log(s, 'cull', `${f.name} culls ${s.boss.name}`);
  }
  s.count.damage += dealt;
  f.damageDealt += dealt;
  if (isHit) f.hitDamage += dealt;
  f.damageThisRound += dealt;
  if (s.bossHp <= 0 && (dealt > 0 || culled) && !s.killer) {
    s.killer = {
      uid: f.uid,
      owner: f.owner,
      formId: f.formId,
      name: f.name,
      round: s.round,
      culled,
    };
    if (s.opts.log) log(s, 'killing-blow', `${f.name} lands the killing blow`);
  }
}

/** Whether `f` stands in a row end slot: column 0 or the arena's last column, whoever stands beside it (Edge-walker). */
function atRowEnd(s: State, f: Fighter): boolean {
  return f.col === 0 || f.col === s.boss.cols - 1;
}

/** `bp` if the effect has a number and its condition holds (counted as held, the report's "holds"), else nothing. */
function conditional(
  f: Fighter,
  key: keyof KnackFx,
  bp: number | undefined,
  holds: boolean,
): number {
  if (!bp || !holds) return 0;
  bump(f, key);
  return bp;
}

function creatureHit(s: State, f: Fighter, shareBp: number): void {
  const R = s.ctx.rules;
  const k = fx(f);
  // 1. Plain damage: Attack, the element chart, boosts (capped, R15), the Knack's share, a crit.
  const near = beside(s, f);
  let guardBeside = false;
  let payoffBeside = false;
  let kinBeside = 0;
  for (const o of near) {
    if (o.role === 'guard') guardBeside = true;
    else if (o.role === 'payoff') payoffBeside = true;
    if (o.element === f.element) kinBeside++;
  }
  const kin = Math.min(2, kinBeside);
  // Conditions are read as the hit is worked out (R20.7). Each adds to the hit bonus, inside the cap (R15).
  const rounds = Math.max(0, s.round - 1);
  const situational =
    conditional(f, 'firstHitBp', k.firstHitBp, f.hitsLanded === 0) +
    conditional(f, 'lowHpAtkBp', k.lowHpAtkBp, f.hp * 2 < f.maxHp) +
    (guardBeside ? (k.besideGuardBp ?? 0) : 0) +
    (payoffBeside ? 0 : (k.alonePayoffBp ?? 0)) +
    conditional(f, 'perKindredBesideBp', kin * (k.perKindredBesideBp ?? 0), kin > 0) +
    conditional(f, 'oddOneOutBp', k.oddOneOutBp, kin === 0) +
    conditional(f, 'rowEndBp', k.rowEndBp, atRowEnd(s, f)) +
    conditional(
      f,
      'slowBurnBp',
      Math.min(rounds * (k.slowBurnBp ?? 0), k.slowBurnCapBp ?? 0),
      rounds > 0,
    ) +
    conditional(
      f,
      'finisherBp',
      k.finisherBp,
      s.shadowHp * 10_000 < s.boss.hp * R.finisherBelowBp,
    ) +
    conditional(f, 'momentumBp', k.momentumBp, f.momentum) +
    conditional(f, 'vengefulBp', k.vengefulBp, f.avenged);
  // A silenced creature does not use up its stored Momentum: what was stored before the silence stays.
  if (!silenced(f)) f.momentum = false;
  const bonusSum = Math.min(R.maxHitBonusBp, f.boostBp + situational);
  const atk = Math.floor((f.atk * (10_000 + (k.atkBp ?? 0))) / 10_000);
  const matched = Math.floor((atk * s.ctx.matchup(f.element, s.boss.element)) / 10_000);
  // Element Resistance (a raid weekend, from stage 2): the resisted element's creatures deal less.
  const base =
    s.opts.resistElement === f.element
      ? Math.floor(
          (matched *
            (10_000 - Math.floor(((10_000 - R.adaptElementBp) * strengthOf(s)) / 10_000))) /
            10_000,
        )
      : matched;
  let plain = k.noDamage
    ? 0
    : Math.floor((((base * (10_000 + bonusSum)) / 10_000) * shareBp * (k.plainBp ?? 10_000)) / 1e8);
  // 2. The boss rolls dodge (14.4). A hit that deals no damage is not rolled. Setup never misses.
  const bossDodge = f.undodgeable
    ? 0
    : Math.min(
        R.dodgeMaxBp,
        Math.max(
          0,
          Math.min(R.dodgeMaxBp, s.boss.spd * R.dodgePerSpdBp + grown(s).dodgeBp - miredCut(s)),
        ) + (s.boss.dodgeBp ?? 0),
      );
  const dodged = !k.noDamage && roll(s, bossDodge);
  if (dodged) {
    feed(s, 'dodges');
    s.count.dodges++;
    if (s.opts.log) log(s, 'boss-dodge', `${s.boss.name} dodges ${f.name}`);
  }
  // 3. Reaction (R5): only a Payoff cashes; of the marks this hit may cash, the oldest. Chosen here, worked out after the crit.
  let cand: [string, Mark] | undefined;
  if (!dodged && !k.noDamage && f.role === 'payoff' && !silenced(f)) {
    for (const entry of s.marks) {
      const [el, m] = entry;
      if (
        s.ctx.triggers(f.element, el) &&
        m.stacks >= (k.minStacks ?? 1) &&
        s.bossTurnsDone >= m.cashableAfterTurns &&
        (cand === undefined || m.age < cand[1].age)
      )
        cand = entry;
    }
  }
  // 3b. Crit (R6.3b): after the dodge and the choice of the reaction (so an effect may read both), before the reaction's bonus,
  // the cap and the armour. Chance and damage stack from the base, the species, the Knack and the talents (R7.1).
  let crit = false;
  // Steady Rhythm: every third hit that lands is a crit, no luck (a dodged or Blocked hit is not counted).
  let rhythmCrit = false;
  // A Sure Crit makes a hit that is not already a crit one, with more extra damage; it is spent below, only if the hit lands.
  let spendsSureCrit = false;
  if (!dodged && plain > 0) {
    crit = roll(s, R.critChanceBp + f.critChanceBp + (k.critChanceBp ?? 0));
    if (k.steadyRhythm && (f.hitsMade + 1) % 3 === 0) {
      crit = true;
      rhythmCrit = true;
    }
    spendsSureCrit = !crit && f.sureCrits > 0 && !silenced(f);
    if (spendsSureCrit) crit = true;
    if (crit) {
      const extra = spendsSureCrit ? (k.dodgeCritBp ?? 0) + (k.guardCritBp ?? 0) : 0;
      plain = Math.floor(
        (plain * (R.critBp + f.critDamageBp + (k.critDamageBp ?? 0) + extra)) / 10_000,
      );
      if (s.opts.log) log(s, 'crit', `${f.name} crits`);
    }
  }
  let bonus = 0;
  let reacted = false;
  if (cand) {
    const [el, mark] = cand;
    const spent = k.spendAllBp !== undefined ? mark.stacks : 1;
    // The bonus factor (R7): the Knack's own factor, extra counts, Boiling Point; capped together.
    let factor = ((k.bonusBp ?? 10_000) * (10_000 + (spent - 1) * (k.spendAllBp ?? 0))) / 10_000;
    const shell = s.carries.has('bakedShell')
      ? beside(s, f).find((o) => fx(o).bakedShell && o.store >= 3)
      : undefined;
    if (shell) {
      factor *= 2;
      shell.store = 0;
    }
    // Talents raise the factor, inside the cap (R7): a crit talent on a crit, Hungry always.
    if (crit && k.reactionCritBp) factor = (factor * (10_000 + k.reactionCritBp)) / 10_000;
    if (k.reactionBonusBp) factor = (factor * (10_000 + k.reactionBonusBp)) / 10_000;
    // Mark conditions: a mark at x3, a mark set this boss turn, a mark a Setter's talent left.
    const raise = (who: Fighter, key: keyof KnackFx, bp: number | undefined, holds: boolean) => {
      if (bp && holds) {
        factor = (factor * (10_000 + bp)) / 10_000;
        bump(who, key);
      }
    };
    raise(f, 'cashHighBp', k.cashHighBp, mark.stacks >= R.opportunistFromStacks);
    raise(f, 'freshMarkBp', k.freshMarkBp, mark.turnSet === s.bossTurnsDone);
    if (s.carries.has('ownMarkBp'))
      for (const o of alive(s)) raise(o, 'ownMarkBp', fx(o).ownMarkBp, mark.owners.has(o.uid));
    factor = Math.min(factor, R.maxBonusFactorBp);
    bonus = Math.floor((((plain * (R.payoffMultBp - 10_000)) / 10_000) * factor) / 10_000);
    // Reaction Resistance: half the bonus at full strength, less below it.
    if (s.opts.resistReaction === el)
      bonus = Math.floor(
        (bonus * (10_000 - Math.floor((5_000 * strengthOf(s)) / 10_000))) / 10_000,
      );
    mark.stacks -= spent;
    if (mark.stacks <= 0) s.marks.delete(el);
    reacted = true;
    feed(s, 'reactions');
    s.count.reactions++;
    s.byMark[el] = (s.byMark[el] ?? 0) + 1;
    if (s.opts.log) log(s, 'reaction', `${f.name} cashes ${el} x${spent} for +${bonus}`);
    for (const o of alive(s)) {
      const ok = fx(o);
      if (ok.support === 'gatherCalm' && o.lastStoreRound !== s.round) {
        o.store = Math.min(3, o.store + 1);
        o.lastStoreRound = s.round;
      }
      if (ok.healOnReactionBp && o.element === el) heal(s, f, ok.healOnReactionBp, false, o);
      if (ok.support === 'clearAir' && beside(s, o).includes(f)) {
        heal(s, f, 1_000, false, o);
        f.silencedTurns = 0;
      }
    }
    if (s.boss.mods.reflectFirst && s.reflectArmed) {
      s.reflectArmed = false;
      // Reflective Hide: the card's strength is the share of the bonus that bounces back; the rest lands.
      const back = Math.floor((bonus * strengthOf(s)) / 10_000);
      if (s.opts.log) log(s, 'reflect', `${s.boss.name} reflects ${back} at ${f.name}`);
      takeHit(s, f, back, 'reflected');
      bonus -= back;
    }
    // Leave a Trail: one link per chain, so a reaction on a trail mark leaves no trail.
    if (k.trail && !mark.fromTrail)
      addMark(s, f.element, 1, {
        sealed: k.seal ?? false,
        fromTrail: true,
        fizzle: true,
        by: f,
      });
  }
  // 4. Cap, then armour: at or below armour the hit is Blocked (R13). A spent mark stays spent.
  if (!dodged && !k.noDamage) {
    if (crit) feed(s, 'crits');
    let pierce = Math.max(k.pierceOwnBp ?? 0, 0);
    if (s.carries.has('pierceBesideBp'))
      for (const o of beside(s, f)) pierce = Math.max(pierce, fx(o).pierceBesideBp ?? 0);
    const armour = Math.floor((grown(s).armour * (10_000 - pierce)) / 10_000);
    let dmg = plain + bonus;
    if (s.boss.mods.capPerHit !== undefined) dmg = Math.min(dmg, s.boss.mods.capPerHit);
    dmg -= armour;
    if (dmg <= 0) {
      s.count.blocked++;
      if (s.opts.log) log(s, 'blocked', `${f.name}'s hit is Blocked`);
      dmg = 0;
    }
    // A hit made while silenced does not use up a first-hit effect (panel 3).
    if (dmg > 0 && !silenced(f)) f.hitsLanded++;
    // A hit that lands (past the dodge and the armour, R20.6) counts for Steady Rhythm and spends a Sure Crit, if it was not
    // a crit already (no Sure Crit was used then). A Blocked hit counts for neither and keeps its Sure Crit (R10).
    if (dmg > 0 && k.steadyRhythm) {
      f.hitsMade++;
      if (rhythmCrit) bump(f, 'steadyRhythm');
    }
    if (dmg > 0 && spendsSureCrit) {
      f.sureCrits--;
      if (s.opts.log) log(s, 'sure-crit', `${f.name} spends a Sure Crit (${f.sureCrits} left)`);
    }
    hitBoss(s, f, dmg, true);
  }
  // 5. Mark (R4): a hit that set off a reaction leaves no mark by the base rules.
  if (!reacted) {
    const marksAs = k.marksAs ?? (f.role === 'setter' && !silenced(f) ? 'own' : undefined);
    if (marksAs) {
      const el =
        marksAs === 'own'
          ? f.element
          : (s.ctx.elements.find((m) => s.ctx.triggers(f.element, m)) ?? f.element);
      let stacks = k.markStacks ?? 1;
      // Deep Ink: its first mark each fight starts bigger.
      if (k.firstMarkExtra && f.marksLeft === 0) {
        stacks += k.firstMarkExtra;
        bump(f, 'firstMarkExtra');
      }
      f.marksLeft++;
      if (k.storeDodgeStacks && f.store >= 3) {
        stacks += k.storeDodgeStacks;
        f.store = 0;
      }
      if (k.markOthers)
        for (const [other, m] of s.marks)
          if (other !== el) m.stacks = Math.min(R.maxStacks, m.stacks + 1);
      addMark(s, el, stacks, { sealed: k.seal ?? false, by: f });
      if (k.leadBoostBp) {
        const next = best(
          alive(s),
          (a, b) => a.col - b.col,
          (o) => o.row === f.row && o.col > f.col,
        );
        if (next) next.boostBp += k.leadBoostBp;
      }
    }
  }
}

export function creatureTurn(s: State, f: Fighter): void {
  if (f.hp <= 0 || s.bossHp <= 0) return;
  const k = fx(f);
  const hits = k.twinStrikeBp ? [k.twinStrikeBp, k.twinStrikeBp] : [10_000];
  for (const share of hits) if (s.bossHp > 0) creatureHit(s, f, share);
  f.boostBp = 0;
  // Silence lasts until the end of the creature's Nth turn (R12).
  if (f.silencedTurns > 0) f.silencedTurns--;
}

/**
 * A counter that ignores armour (Retaliate, Shoulder Charge's strike-back). It is damage and can land the
 * killing blow, but it is not one of the creature's hits: no Cull, no "its hits" talent.
 */
export function counter(s: State, f: Fighter, shareBp: number): void {
  // A counter is not a hit: no crit roll, no Sure Crit spent, no Steady Rhythm count, no Cull (R6, R21.7).
  const dmg = Math.floor((f.atk * shareBp) / 10_000);
  if (s.opts.log) log(s, 'counter', `${f.name} strikes back for ${dmg}`);
  hitBoss(s, f, dmg, false);
}

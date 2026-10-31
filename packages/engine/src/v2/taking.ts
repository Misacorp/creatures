/**
 * Taking hits (R1 dodge, R1.3 and R2.3 guards and cover, R6.5 and R13 cuts, armour and Blocked, wards and Breakwater, R7.1 the boss's
 * crit ward, Refuse to Fall, Second Wind, Easily Provoked's Sure Crits).
 */
import type { KnackFx } from './effects';
import type { Fighter } from './types';
import * as escalationMod from './escalation';
import * as boardMod from './board';
import * as marksMod from './marks';
import * as stateMod from './state';
import type { State } from './state';

// Bound once: a named import is read through a getter on every call under the lab's Vite loader, which costs 15% of a report.
const { addMired, feed } = escalationMod;
const { beside, inReach } = boardMod;
const { heal } = marksMod;
const { alive, best, bump, fx, log, ownArmour, silenced } = stateMod;

export function dodgeOf(s: State, f: Fighter, area: boolean): number {
  const R = s.ctx.rules;
  let aura = 0;
  if (s.carries.has('rowDodgeBp') || s.carries.has('besideDodgeBp'))
    for (const o of alive(s)) {
      if (o === f || o.row !== f.row) continue;
      const ok = fx(o);
      aura = Math.max(
        aura,
        ok.rowDodgeBp ?? 0,
        Math.abs(o.col - f.col) === 1 ? (ok.besideDodgeBp ?? 0) : 0,
      );
    }
  const base = Math.min(R.dodgeMaxBp, f.spd * R.dodgePerSpdBp + (fx(f).dodgeBonusBp ?? 0) + aura);
  if (!area) return base;
  return Math.min(
    R.dodgeMaxBp,
    Math.floor((base * R.areaDodgeShareBp) / 10_000) + (fx(f).areaDodgeBp ?? 0),
  );
}

/** A Sure Crit for `f` (at most `R.sureCritMax`), counted as the effect `key` firing. */
export function gainSureCrit(s: State, f: Fighter, key: keyof KnackFx): void {
  const R = s.ctx.rules;
  if (f.sureCrits >= R.sureCritMax) return;
  f.sureCrits++;
  bump(f, key);
  if (s.opts.log) log(s, 'sure-crit', `${f.name} stores a Sure Crit (${f.sureCrits})`);
}

/**
 * How much of a boss crit's extra damage `taker` is spared (bp): its own Cool Head, or the largest one on a living creature
 * beside it (an aura: the largest applies, R15). Counted for the creature that gives it.
 */
export function critWardOf(s: State, taker: Fighter): number {
  if (!s.carries.has('critWardBp')) return 0;
  let ward = fx(taker).critWardBp ?? 0;
  let by: Fighter | undefined = ward > 0 ? taker : undefined;
  for (const o of beside(s, taker)) {
    const w = fx(o).critWardBp ?? 0;
    if (w > ward) {
      ward = w;
      by = o;
    }
  }
  if (by) bump(by, 'critWardBp');
  return ward;
}

/** What is left of a hit (bp) after one more cut of `bp`. */
const cutOf = (left: number, bp: number): number =>
  Math.floor((left * (10_000 - Math.min(10_000, bp))) / 10_000);

/** The cut a Guard `g` gives a creature `who` in its reach: the base cover, its bonuses, and Long Shadow's per column of distance. */
const coverOf = (s: State, g: Fighter, who: Fighter): number =>
  s.ctx.rules.coverBp +
  (fx(g).coverBonusBp ?? 0) +
  (fx(g).distanceCoverBp ?? 0) * Math.abs(g.col - who.col);

/**
 * Damage lands on a creature: every cut it gets for this hit multiplies together (an aura, its own area cut,
 * cover, Front-liner, Brace, Long Shadow's intercept cut), the total cut is capped at 75% and comes off
 * before armour; then armour, Blocked or HP (R13), then hit-taken effects. `target` is the slot the hit was
 * aimed at; when another creature took it (an intercept), the distance between them counts for Long Shadow.
 * `watch` is set when Night Watch took a Charged hit for `target`, or Take It All an area hit: it takes it with its own cover's cut
 * (Night Watch's `watchCutBp` is a larger cut, if it has one).
 */
export function takeHit(
  s: State,
  taker: Fighter,
  proposed: number,
  how: 'aimed' | 'area' | 'charged' | 'reflected',
  target: Fighter = taker,
  watch = false,
): void {
  const R = s.ctx.rules;
  let dmg = proposed;
  const k = fx(taker);
  // What is left of the hit after each cut, in bp; they multiply (a cut of 0 changes nothing).
  let left = 10_000;
  if (how === 'area' || how === 'charged') {
    let ward = 0;
    if (s.carries.has('rowAreaCutBp'))
      for (const o of alive(s))
        if (o.row === taker.row) ward = Math.max(ward, fx(o).rowAreaCutBp ?? 0);
    let shelter = 0;
    if (s.carries.has('besideAreaCutBp'))
      for (const o of beside(s, taker)) shelter = Math.max(shelter, fx(o).besideAreaCutBp ?? 0);
    // Auras of one kind: the largest applies. The creature's own cut is a cut of its own. A boss whose waves break on
    // wards (Breakwater) is cut more by one, up to 75% of a hit.
    const wardMul = s.boss.mods.wardBp ?? 10_000;
    left = cutOf(left, Math.min(7_500, Math.floor((Math.max(ward, shelter) * wardMul) / 10_000)));
    left = cutOf(left, k.areaCutBp ?? 0);
    // Cover: the Guard with the largest cover whose reach includes the taker, with every bonus. A hit a
    // Guard intercepts is not covered again, except Night Watch's and Take It All': they take the hit with their own cover's cut.
    if (watch) {
      left = cutOf(left, Math.max(coverOf(s, taker, target), k.watchCutBp ?? 0));
    } else if (taker.role !== 'guard') {
      const covering = best(
        alive(s),
        (a, b) => coverOf(s, b, taker) - coverOf(s, a, taker),
        (g) => g.role === 'guard' && !silenced(g) && inReach(s, g, taker),
      );
      if (covering) {
        if (fx(covering).distanceCoverBp) bump(covering, 'distanceCoverBp');
        if (fx(covering).flankGuard) bump(covering, 'flankGuard');
        left = cutOf(left, coverOf(s, covering, taker));
      }
    }
  }
  // Front-liner: less from every hit in the front row.
  if (k.frontCutBp && taker.row === 0) {
    left = cutOf(left, k.frontCutBp);
    bump(taker, 'frontCutBp');
  }
  // Brace: less from a Charged hit aimed at its own slot, nothing from any other move or the plain attack.
  if (k.braceBp && how === 'charged' && taker === target) {
    left = cutOf(left, k.braceBp);
    bump(taker, 'braceBp');
  }
  // Long Shadow: the cut on a hit it intercepts grows with the distance to the creature it saved.
  if (k.distanceCoverBp && taker !== target) {
    left = cutOf(left, k.distanceCoverBp * Math.abs(taker.col - target.col));
    bump(taker, 'distanceCoverBp');
  }
  // One cap on every cut together: at most 75% off, before armour.
  dmg = Math.floor((dmg * Math.max(left, 10_000 - R.cutMaxBp)) / 10_000);
  dmg -= ownArmour(taker);
  // Sticky Mud counts every hit it takes, Blocked or not.
  if (k.miresOnHit) addMired(s, taker);
  if (dmg <= 0) {
    s.count.blocked++;
    if (s.opts.log) log(s, 'blocked', `${taker.name} blocks the hit`);
    return;
  }
  if (dmg >= taker.hp && k.holdOn && !taker.holdOnDone) {
    // Refuse to Fall, once per fight and (in a raid) once per weekend (panel 5): the hit leaves it at the lower of two fifths of
    // its Max HP and its HP before the hit (at least 1 HP). It never heals.
    taker.holdOnDone = true;
    bump(taker, 'holdOn');
    const leave = Math.max(
      1,
      Math.min(taker.hp, Math.floor((taker.maxHp * R.holdOnLeaveBp) / 10_000)),
    );
    dmg = taker.hp - leave;
    if (s.opts.log) log(s, 'hold-on', `${taker.name} holds on`);
  }
  taker.hp = Math.max(0, taker.hp - dmg);
  if (taker.hp === 0) {
    s.live = null;
    s.liveBySlot = null;
  }
  // Easily Provoked: the damage it takes from hits it intercepted builds a Sure Crit each time it adds up to a share of its Max HP.
  if (taker !== target && k.guardCritBp && taker.hp > 0) {
    taker.guardTaken += dmg;
    const per = Math.max(1, Math.floor((taker.maxHp * R.guardSureCritShareBp) / 10_000));
    while (taker.guardTaken >= per) {
      taker.guardTaken -= per;
      gainSureCrit(s, taker, 'guardCritBp');
    }
  }
  const wind = k.secondWindBp;
  if (wind && !taker.secondWindDone && taker.hp > 0 && taker.hp * 2 < taker.maxHp) {
    taker.secondWindDone = true;
    bump(taker, 'secondWindBp');
    heal(s, taker, wind, false);
  }
  if (taker.hp === 0) feed(s, 'knockouts');
  if (s.opts.log)
    log(s, 'hit', `${taker.name} takes ${dmg}${taker.hp === 0 ? ' and is knocked out' : ''}`);
  // Rally Cry: a creature beside it was knocked out (a silenced creature does not arm it).
  if (taker.hp === 0) for (const g of beside(s, taker)) if (fx(g).vengefulBp) g.avenged = true;
  if (s.carries.has('bakedShell'))
    for (const g of alive(s)) {
      if (fx(g).bakedShell && (g === taker || inReach(s, g, taker)))
        g.store = Math.min(3, g.store + 1);
    }
}

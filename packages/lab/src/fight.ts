/**
 * The combat v2 prototype fight (docs/design/combat/proposals/001-combat-v2.md). Pure: no I/O, an
 * injected RNG. It is separate from the shipped engine on purpose: this is where the draft rules are
 * tried, measured and argued about before any of them reach `@creatures/engine`.
 *
 * A round (R8): round start (in slot order: Support verbs, then round-start Knacks; charged moves of
 * the round are announced), then for each row from the front: the row's creatures act left to
 * right, then the boss takes a turn. A boss turn is its due moves, its plain attack, then (Clean
 * Scales) the shedding of the marks that were on it when the turn began.
 */
import { chance, int } from '@creatures/game';
import { knack, type KnackFx } from './knacks';
import { mergeFx, talent, talentIdleUnder } from './talents';
import { LAB_RULES as R } from './rules';
import { ELEMENTS, formStats, matchupBp, triggers } from './species';
import type {
  BossDef,
  BossMove,
  FightEvent,
  FightOptions,
  FightResult,
  Fighter,
  KillingBlow,
  Pattern,
  Placement,
} from './types';

interface Mark {
  stacks: number;
  age: number;
  sealed: boolean;
  /** Left by Leave a Trail: a reaction on it leaves no further trail (the chain cap, R5). */
  fromTrail: boolean;
  /** With Fizzle, a mark left by a reaction cannot be cashed until this many boss turns have passed. */
  cashableAfterTurns: number;
  /** The boss turns done when a count was last added: "set this boss turn" means equal to now (Quick Draw). */
  turnSet: number;
  /** Creatures that left a count on it (Owner's Mark). */
  owners: Set<string>;
}

interface State {
  readonly boss: BossDef;
  readonly opts: FightOptions;
  readonly fighters: Fighter[];
  bossHp: number;
  marks: Map<string, Mark>;
  markAge: number;
  mired: number;
  round: number;
  turn: number;
  bossTurnsDone: number;
  reflectArmed: boolean;
  /** Targets of this round's charged moves, rolled when announced at round start (by move id). */
  announced: Map<string, Fighter[]>;
  readonly events: FightEvent[];
  /** The creature whose hit took the boss's last HP (the first to do so). */
  killer: KillingBlow | null;
  readonly count: {
    reactions: number;
    blocked: number;
    dodges: number;
    intercepts: number;
    healed: number;
    damage: number;
  };
  readonly byMark: Record<string, number>;
}

const fx = (f: Fighter): KnackFx => (f.silencedTurns > 0 ? {} : f.fxAll);
/** Silence blanks the creature: its Knack and its role's verb (Misa, 2026-10-26). Stats still work. */
const silenced = (f: Fighter) => f.silencedTurns > 0;
const ownArmour = (f: Fighter) => f.baseArmour + (fx(f).armourBonus ?? 0);
const alive = (s: State) => s.fighters.filter((f) => f.hp > 0);
const bySlot = (a: Fighter, b: Fighter) => a.row - b.row || a.col - b.col;
const roll = (s: State, bp: number) => bp > 0 && chance(s.opts.rng, Math.min(bp, 10_000), 10_000);
/** Counts that an effect's condition held or its trigger fired (the report's "holds"). */
const bump = (f: Fighter, key: keyof KnackFx) => {
  f.fires[key] = (f.fires[key] ?? 0) + 1;
};
const log = (s: State, kind: string, text: string) => {
  if (s.opts.log) s.events.push({ round: s.round, turn: s.turn, kind, text });
};

export function placeFighters(placements: readonly Placement[]): Fighter[] {
  return placements.map((p, i) => {
    const st = formStats(p.formId, p.level);
    const k = p.knack === 'none' ? undefined : p.knack;
    const fxAll = mergeFx([
      knack(k)?.fx ?? {},
      ...(p.talents ?? []).map((id) => talent(id)?.fx ?? {}),
    ]);
    // Max HP is set when the fight starts (a stat, so silence does not take it away).
    const maxHp = Math.floor((st.hp * (10_000 + (fxAll.hpBp ?? 0))) / 10_000);
    return {
      uid: `${p.owner}:${p.formId}:${i}`,
      owner: p.owner,
      formId: p.formId,
      name: st.name,
      element: st.element,
      role: st.role,
      maxHp,
      hp: maxHp,
      atk: st.atk,
      spd: st.spd,
      baseArmour: st.armour,
      knack: k,
      talents: p.talents ?? [],
      fxAll,
      hitsLanded: 0,
      secondWindDone: false,
      holdOnDone: false,
      row: p.row,
      col: p.col,
      silencedTurns: 0,
      store: 0,
      boostBp: 0,
      undodgeable: false,
      firstInterceptDone: false,
      damageDealt: 0,
      damageThisRound: 0,
      damageLastRound: 0,
      lastStoreRound: -1,
      hitsMade: 0,
      momentum: false,
      avenged: false,
      marksLeft: 0,
      verbsUsed: 0,
      fires: {},
    };
  });
}

/** Creatures beside `f` in its row, within `reach` columns, living (`reach` 1 is {Beside}). */
function beside(s: State, f: Fighter, reach = 1): Fighter[] {
  return alive(s).filter((o) => o !== f && o.row === f.row && Math.abs(o.col - f.col) <= reach);
}

const reachOf = (g: Fighter) => R.guardReach + (fx(g).reachBonus ?? 0);

/**
 * Whether `o` is in `g`'s reach: the same row, within its reach on each side, whatever stands in the slots
 * between (empty and knocked-out slots do not stop it). Flank Guard covers only its longer side (the side
 * with more slots to the row end; a Guard in the exact middle covers both), with twice the slots.
 */
function inReach(s: State, g: Fighter, o: Fighter): boolean {
  if (g === o || g.row !== o.row) return false;
  const r = reachOf(g);
  const d = o.col - g.col;
  if (fx(g).flankGuard) {
    const toRight = s.boss.cols - 1 - g.col;
    if (g.col === toRight) return Math.abs(d) <= R.flankGuardSlots * r && d !== 0;
    const left = g.col > toRight;
    return left ? d >= -R.flankGuardSlots * r && d <= -1 : d >= 1 && d <= R.flankGuardSlots * r;
  }
  return Math.abs(d) <= r;
}

/** The most hurt of these (lowest share of max HP, ties to the front then the left); none if all are at full HP. */
function mostHurt(xs: readonly Fighter[]): Fighter | undefined {
  return xs
    .filter((o) => o.hp > 0 && o.hp < o.maxHp)
    .sort((a, b) => a.hp * b.maxHp - b.hp * a.maxHp || bySlot(a, b))[0];
}

function addMark(
  s: State,
  element: string,
  stacks: number,
  opts: { sealed?: boolean; fromTrail?: boolean; fizzle?: boolean; by?: Fighter } = {},
): void {
  const m = s.marks.get(element);
  const after = opts.fizzle && s.boss.mods.fizzle ? s.bossTurnsDone + 1 : 0;
  if (m) {
    m.turnSet = s.bossTurnsDone;
    if (opts.by) m.owners.add(opts.by.uid);
    m.stacks = Math.min(R.maxStacks, m.stacks + stacks);
    // A mark is sealed if any of its counts was left sealed (R8).
    m.sealed ||= opts.sealed ?? false;
    m.cashableAfterTurns = Math.max(m.cashableAfterTurns, after);
  } else {
    s.marks.set(element, {
      stacks: Math.min(R.maxStacks, stacks),
      age: s.markAge++,
      sealed: opts.sealed ?? false,
      fromTrail: opts.fromTrail ?? false,
      cashableAfterTurns: after,
      turnSet: s.bossTurnsDone,
      owners: new Set(opts.by ? [opts.by.uid] : []),
    });
  }
  log(s, 'mark', `${element} x${s.marks.get(element)?.stacks ?? 0}`);
}

/** A heal by `src` (if any): healing past full HP passes on to the most hurt creature in the row of the one healed (Overheal Spill). */
function heal(s: State, target: Fighter, amountBp: number, critOk = true, src?: Fighter): void {
  if (target.hp <= 0) return;
  let amt = Math.floor((target.maxHp * amountBp) / 10_000);
  if (critOk && roll(s, R.critChanceBp)) amt = Math.floor((amt * R.critBp) / 10_000);
  amt = Math.floor((amt * (s.boss.mods.healBp ?? 10_000)) / 10_000);
  amt = Math.floor((amt * (10_000 + (fx(target).healReceivedBp ?? 0))) / 10_000);
  const real = Math.min(amt, target.maxHp - target.hp);
  target.hp += real;
  s.count.healed += real;
  const over = amt - real;
  if (over > 0 && src && fx(src).spillOver) {
    const next = mostHurt(alive(s).filter((o) => o !== target && o.row === target.row));
    if (next) {
      const moved = Math.min(over, next.maxHp - next.hp);
      next.hp += moved;
      s.count.healed += moved;
      bump(src, 'spillOver');
    }
  }
}

/** What the boss's Mired takes off its damage and its dodge, in bp: per stack, more while a living creature has Clinging. */
function miredCut(s: State): number {
  const per = alive(s).some((f) => fx(f).clinging) ? R.miredClingingStackBp : R.miredPerStackBp;
  return s.mired * per;
}

/** Mired stacks (capped); Heavy Hand gives a chance of 1 extra stack each time. */
function addMired(s: State, by: Fighter): void {
  const extra = roll(s, fx(by).miredExtraBp ?? 0) ? 1 : 0;
  if (extra) bump(by, 'miredExtraBp');
  s.mired = Math.min(R.miredMaxStacks, s.mired + 1 + extra);
  log(s, 'mired', `Mired x${s.mired}`);
}

// ---------- round start ----------

/**
 * Mired fades at the end of every second round, and not at all while a living creature has Clinging (panel 3, reworked
 * 2026-10-28: fading every third round instead gained under a point; each stack counts for more as well, `miredCut`). Squelch Song alone builds stacks over a fight.
 */
function fadeMired(s: State): void {
  if (s.mired <= 0) return;
  const clinging = alive(s).find((f) => fx(f).clinging);
  if (s.round % R.miredFadeEvery !== 0) return;
  if (clinging) {
    bump(clinging, 'clinging');
    return;
  }
  s.mired--;
  log(s, 'mired', `Mired x${s.mired}`);
}

function roundStart(s: State): void {
  if (s.boss.mods.shakeEvery && s.round % s.boss.mods.shakeEvery === 0)
    log(s, 'announce', `${s.boss.name} will shake off its debuffs`);
  // R8.2 a: Support verbs (and their shapes), in slot order.
  for (const f of [...alive(s)].sort(bySlot))
    if (f.role === 'support' && !silenced(f)) supportVerb(s, f, fx(f));
  // R8.2 b: round-start Knacks and talents, in slot order.
  for (const f of [...alive(s)].sort(bySlot)) {
    const k = fx(f);
    if (k.miresAtStart) addMired(s, f);
    if (k.guardMendBp)
      for (const o of alive(s).filter((o) => inReach(s, f, o))) heal(s, o, k.guardMendBp, true, f);
  }
  // Charged moves due this round are announced now: their slots are rolled and shown (R8).
  s.announced = new Map();
  for (const m of s.boss.moves) {
    if (m.charged && s.round % m.every === 0) s.announced.set(m.id, targetsOf(s, m.pattern, false));
  }
}

function supportVerb(s: State, f: Fighter, k: KnackFx): void {
  f.verbsUsed++;
  let boost =
    (f.element === 'ember' ? R.supportBoostEmberBp : R.supportBoostBp) + (k.boostBonusBp ?? 0);
  // Bright Boost: every second boost it gives is doubled.
  if (k.brightBoost && f.verbsUsed % 2 === 0) {
    boost *= 2;
    bump(f, 'brightBoost');
  }
  // Kindred Boost: bigger on creatures of its own element.
  const kindred = (o: Fighter) => {
    const extra = o.element === f.element ? (k.kindredBoostBp ?? 0) : 0;
    if (extra) bump(f, 'kindredBoostBp');
    return extra;
  };
  const healBp = (R.supportHealBp[f.element] ?? 0) + (k.mendBonusBp ?? 0);
  // Triage aims the Support's own base verb: a Support shape Knack leaves it idle.
  const triage = (k.triageBp ?? 0) > 0 && !talentIdleUnder('triage', f.knack);
  switch (k.support) {
    case 'rowRain':
      for (const o of alive(s).filter((o) => o.row === f.row))
        heal(s, o, 500 + (k.mendBonusBp ?? 0), true, f);
      return;
    case 'rowBoost':
      for (const o of alive(s).filter((o) => o.row === f.row && o !== f))
        o.boostBp += boost - 500 + kindred(o);
      return;
    case 'readyMark':
      addMark(s, f.element, 1, { by: f });
      return;
    case 'clearSkies':
      for (const o of beside(s, f)) o.undodgeable = true;
      return;
    case 'sunbeam':
      for (const o of alive(s).filter((o) => o.col === f.col && o.row < f.row)) {
        o.boostBp += boost + kindred(o);
        heal(s, o, Math.max(healBp, 600), true, f);
      }
      return;
    default: {
      const near = beside(s, f);
      for (const o of near) o.boostBp += boost + kindred(o);
      if (healBp) {
        // Triage: only the most hurt creature beside it, at a bigger size.
        const patients = triage ? [mostHurt(near)].filter((o): o is Fighter => !!o) : near;
        for (const o of patients) {
          const size = k.support === 'curlUp' && o.hp * 2 < o.maxHp ? 3 : 1;
          const aimed = triage ? 10_000 + (k.triageBp ?? 0) : 10_000;
          heal(s, o, Math.floor((healBp * size * aimed) / 10_000), true, f);
          if (triage) bump(f, 'triageBp');
        }
      }
      if (k.support === 'wideWarmth')
        for (const o of beside(s, f, 2).filter((o) => Math.abs(o.col - f.col) === 2))
          o.boostBp += boost - 1_000 + kindred(o);
      if (k.support === 'gatherCalm' && f.store >= 3) {
        for (const o of beside(s, f)) o.boostBp += 4_500;
        f.store = 0;
      }
    }
  }
}

// ---------- a creature's turn (R6) ----------

/**
 * Damage to the boss by `f`: HP, damage counts, Cull and the killing blow. A counter (Retaliate, Shoulder
 * Charge's strike-back) is damage and can land the killing blow, but it is not a hit: it never sets off
 * Cull. A hit that leaves the boss below `f`'s Cull share of its full HP (in a raid weekend, the weekend's
 * shared HP) defeats it outright; the HP that was left counts as the killing blow, not as damage dealt.
 * The creature whose damage or Cull takes the last HP lands the killing blow (the first one only).
 */
function hitBoss(s: State, f: Fighter, dmg: number, isHit: boolean): void {
  const real = Math.min(dmg, s.bossHp);
  s.bossHp -= real;
  const dealt = real;
  let culled = false;
  const cull = isHit ? fx(f).cullBp : undefined;
  if (cull && real > 0 && s.bossHp > 0 && s.bossHp * 10_000 < s.boss.hp * cull) {
    s.bossHp = 0;
    culled = true;
    bump(f, 'cullBp');
    log(s, 'cull', `${f.name} culls ${s.boss.name}`);
  }
  s.count.damage += dealt;
  f.damageDealt += dealt;
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
    log(s, 'killing-blow', `${f.name} lands the killing blow`);
  }
}

/** Whether `f` stands in a row end slot: column 0 or the arena's last column, whoever stands beside it (Edge-walker). */
function atRowEnd(s: State, f: Fighter): boolean {
  return f.col === 0 || f.col === s.boss.cols - 1;
}

function creatureHit(s: State, f: Fighter, shareBp: number): void {
  const k = fx(f);
  // 1. Plain damage: Attack, the element chart, boosts (capped, R15), the Knack's share, a crit.
  const near = beside(s, f);
  const guardBeside = near.some((o) => o.role === 'guard');
  const payoffBeside = near.some((o) => o.role === 'payoff');
  const kin = Math.min(2, near.filter((o) => o.element === f.element).length);
  // Conditions are read as the hit is worked out (R20.7). Each adds to the hit bonus, inside the cap (R15).
  const on = (key: keyof KnackFx, bp: number | undefined, holds: boolean): number => {
    if (!bp || !holds) return 0;
    bump(f, key);
    return bp;
  };
  const rounds = Math.max(0, s.round - 1);
  const situational =
    on('firstHitBp', k.firstHitBp, f.hitsLanded === 0) +
    on('lowHpAtkBp', k.lowHpAtkBp, f.hp * 2 < f.maxHp) +
    (guardBeside ? (k.besideGuardBp ?? 0) : 0) +
    (payoffBeside ? 0 : (k.alonePayoffBp ?? 0)) +
    on('perKindredBesideBp', kin * (k.perKindredBesideBp ?? 0), kin > 0) +
    on('oddOneOutBp', k.oddOneOutBp, kin === 0) +
    on('rowEndBp', k.rowEndBp, atRowEnd(s, f)) +
    on('slowBurnBp', Math.min(rounds * (k.slowBurnBp ?? 0), k.slowBurnCapBp ?? 0), rounds > 0) +
    on('finisherBp', k.finisherBp, s.bossHp * 10_000 < s.boss.hp * R.finisherBelowBp) +
    on('momentumBp', k.momentumBp, f.momentum) +
    on('vengefulBp', k.vengefulBp, f.avenged);
  // A silenced creature does not use up its stored Momentum: what was stored before the silence stays.
  if (!silenced(f)) f.momentum = false;
  const bonusSum = Math.min(R.maxHitBonusBp, f.boostBp + situational);
  const atk = Math.floor((f.atk * (10_000 + (k.atkBp ?? 0))) / 10_000);
  const base = Math.floor((atk * matchupBp(f.element, s.boss.element)) / 10_000);
  let plain = k.noDamage
    ? 0
    : Math.floor((((base * (10_000 + bonusSum)) / 10_000) * shareBp * (k.plainBp ?? 10_000)) / 1e8);
  let crit = plain > 0 && roll(s, R.critChanceBp + (k.critChanceBp ?? 0));
  // Steady Rhythm: every third hit it makes is a crit, no luck.
  if (plain > 0 && k.steadyRhythm && ++f.hitsMade % 3 === 0) {
    crit = true;
    bump(f, 'steadyRhythm');
  }
  if (crit) plain = Math.floor((plain * (R.critBp + (k.critDamageBp ?? 0))) / 10_000);
  // 2. The boss rolls dodge (14.4). A hit that deals no damage is not rolled. Setup never misses.
  const bossDodge = f.undodgeable
    ? 0
    : Math.max(0, Math.min(R.dodgeMaxBp, s.boss.spd * R.dodgePerSpdBp - miredCut(s)));
  const dodged = !k.noDamage && roll(s, bossDodge);
  if (dodged) {
    s.count.dodges++;
    log(s, 'boss-dodge', `${s.boss.name} dodges ${f.name}`);
  }
  // 3. Reaction (R5): only a Payoff cashes; of the marks this hit may cash, the oldest.
  let bonus = 0;
  let reacted = false;
  if (!dodged && !k.noDamage && f.role === 'payoff' && !silenced(f)) {
    const cand = [...s.marks.entries()]
      .filter(
        ([el, m]) =>
          triggers(f.element, el) &&
          m.stacks >= (k.minStacks ?? 1) &&
          s.bossTurnsDone >= m.cashableAfterTurns,
      )
      .sort((a, b) => a[1].age - b[1].age)[0];
    if (cand) {
      const [el, mark] = cand;
      const spent = k.spendAllBp !== undefined ? mark.stacks : 1;
      // The bonus factor (R7): the Knack's own factor, extra counts, Baked Shell; capped together.
      let factor = ((k.bonusBp ?? 10_000) * (10_000 + (spent - 1) * (k.spendAllBp ?? 0))) / 10_000;
      const shell = beside(s, f).find((o) => fx(o).bakedShell && o.store >= 3);
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
      for (const o of alive(s)) raise(o, 'ownMarkBp', fx(o).ownMarkBp, mark.owners.has(o.uid));
      factor = Math.min(factor, R.maxBonusFactorBp);
      bonus = Math.floor((((plain * (R.payoffMultBp - 10_000)) / 10_000) * factor) / 10_000);
      if (s.opts.resistReaction === el) bonus = Math.floor(bonus / 2);
      mark.stacks -= spent;
      if (mark.stacks <= 0) s.marks.delete(el);
      reacted = true;
      s.count.reactions++;
      s.byMark[el] = (s.byMark[el] ?? 0) + 1;
      log(s, 'reaction', `${f.name} cashes ${el} x${spent} for +${bonus}`);
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
        log(s, 'reflect', `${s.boss.name} reflects ${bonus} at ${f.name}`);
        takeHit(s, f, bonus, 'reflected');
        bonus = 0;
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
  }
  // 4. Cap, then armour: at or below armour the hit is Blocked (R13). A spent mark stays spent.
  if (!dodged && !k.noDamage) {
    const pierce = Math.max(0, ...beside(s, f).map((o) => fx(o).pierceBesideBp ?? 0));
    const armour = Math.floor((s.boss.armour * (10_000 - pierce)) / 10_000);
    let dmg = plain + bonus;
    if (s.boss.mods.capPerHit !== undefined) dmg = Math.min(dmg, s.boss.mods.capPerHit);
    dmg -= armour;
    if (dmg <= 0) {
      s.count.blocked++;
      log(s, 'blocked', `${f.name}'s hit is Blocked`);
      dmg = 0;
    }
    // A hit made while silenced does not use up a first-hit effect (panel 3).
    if (dmg > 0 && !silenced(f)) f.hitsLanded++;
    hitBoss(s, f, dmg, true);
  }
  // 5. Mark (R4): a hit that set off a reaction leaves no mark by the base rules.
  if (!reacted) {
    const marksAs = k.marksAs ?? (f.role === 'setter' && !silenced(f) ? 'own' : undefined);
    if (marksAs) {
      const el =
        marksAs === 'own' ? f.element : (ELEMENTS.find((m) => triggers(f.element, m)) ?? f.element);
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
        const next = alive(s)
          .filter((o) => o.row === f.row && o.col > f.col)
          .sort((a, b) => a.col - b.col)[0];
        if (next) next.boostBp += k.leadBoostBp;
      }
    }
  }
}

function creatureTurn(s: State, f: Fighter): void {
  if (f.hp <= 0 || s.bossHp <= 0) return;
  const k = fx(f);
  const hits = k.twinStrikeBp ? [k.twinStrikeBp, k.twinStrikeBp] : [10_000];
  for (const share of hits) if (s.bossHp > 0) creatureHit(s, f, share);
  f.boostBp = 0;
  // Silence lasts until the end of the creature's Nth turn (R12).
  if (f.silencedTurns > 0) f.silencedTurns--;
}

// ---------- the boss's turn ----------

function anchorOf(s: State, p: Pattern): Fighter | undefined {
  const live = alive(s);
  if (live.length === 0) return undefined;
  // "Strongest" is the highest Attack; ties go to the front, then the left.
  const strongest = (xs: Fighter[]) => [...xs].sort((a, b) => b.atk - a.atk || bySlot(a, b))[0];
  switch (p.anchor) {
    case 'front':
      return [...live].sort(bySlot)[0];
    case 'strongest':
      return strongest(live);
    case 'payoff':
      return strongest(live.filter((f) => f.role === 'payoff')) ?? strongest(live);
    case 'random':
      return live[int(s.opts.rng, live.length)];
    case 'grudge':
      // Last round's top hitter; in round 1, the strongest.
      return s.round === 1
        ? strongest(live)
        : [...live].sort((a, b) => b.damageLastRound - a.damageLastRound || bySlot(a, b))[0];
  }
}

/** The slots a pattern covers, as the living creatures standing in them (R2: targets are slots). */
function targetsOf(s: State, p: Pattern, plain: boolean): Fighter[] {
  const live = alive(s);
  // Taunt becomes the anchor of every plain attack, whatever its anchor (R9).
  const taunter = plain ? live.filter((f) => fx(f).taunt).sort(bySlot)[0] : undefined;
  const a = taunter ?? anchorOf(s, p);
  if (!a) return [];
  switch (p.shape) {
    case 'single':
      return [a];
    case 'line3':
      // The anchor first: it takes the aimed hit, its neighbours the area hits (R2).
      return [a, ...live.filter((f) => f !== a && f.row === a.row && Math.abs(f.col - a.col) <= 1)];
    case 'row':
      return live.filter((f) => f.row === a.row);
    case 'randomRow': {
      const rows = [...new Set(live.map((f) => f.row))];
      const r = rows[int(s.opts.rng, rows.length)];
      return live.filter((f) => f.row === r);
    }
    case 'column':
      return live.filter((f) => f.col === a.col);
    case 'all':
      return live;
    case 'rowEnds': {
      const n = p.n ?? 1;
      const out = new Set<Fighter>();
      for (const r of new Set(live.map((f) => f.row))) {
        const row = live.filter((f) => f.row === r).sort((x, y) => x.col - y.col);
        row.slice(0, n).forEach((f) => out.add(f));
        row.slice(-n).forEach((f) => out.add(f));
      }
      return [...out];
    }
  }
}

function dodgeOf(s: State, f: Fighter, area: boolean): number {
  const aura = Math.max(
    0,
    ...alive(s)
      .filter((o) => o !== f && o.row === f.row)
      .map((o) =>
        Math.max(
          fx(o).rowDodgeBp ?? 0,
          Math.abs(o.col - f.col) === 1 ? (fx(o).besideDodgeBp ?? 0) : 0,
        ),
      ),
  );
  const base = Math.min(R.dodgeMaxBp, f.spd * R.dodgePerSpdBp + (fx(f).dodgeBonusBp ?? 0) + aura);
  if (!area) return base;
  return Math.min(
    R.dodgeMaxBp,
    Math.floor((base * R.areaDodgeShareBp) / 10_000) + (fx(f).areaDodgeBp ?? 0),
  );
}

/**
 * Damage lands on a creature: every cut it gets for this hit multiplies together (an aura, its own area cut,
 * cover, Front-liner, Brace, Long Shadow's intercept cut), the total cut is capped at 75% and comes off
 * before armour; then armour, Blocked or HP (R13), then hit-taken effects. `target` is the slot the hit was
 * aimed at; when another creature took it (an intercept), the distance between them counts for Long Shadow.
 */
function takeHit(
  s: State,
  taker: Fighter,
  proposed: number,
  how: 'aimed' | 'area' | 'charged' | 'reflected',
  target: Fighter = taker,
  move = false,
): void {
  let dmg = proposed;
  const k = fx(taker);
  // What is left of the hit after each cut, in bp; they multiply (a cut of 0 changes nothing).
  let left = 10_000;
  const cut = (bp: number) => {
    left = Math.floor((left * (10_000 - Math.min(10_000, bp))) / 10_000);
  };
  if (how === 'area' || how === 'charged') {
    const ward = Math.max(
      0,
      ...alive(s)
        .filter((o) => o.row === taker.row)
        .map((o) => fx(o).rowAreaCutBp ?? 0),
    );
    const shelter = Math.max(0, ...beside(s, taker).map((o) => fx(o).besideAreaCutBp ?? 0));
    // Auras of one kind: the largest applies. The creature's own cut is a cut of its own.
    cut(Math.max(ward, shelter));
    cut(k.areaCutBp ?? 0);
    // Cover: the Guard with the largest cover whose reach includes the taker, with every bonus. A hit a
    // Guard intercepts is not covered again.
    if (taker.role !== 'guard') {
      const cover = (g: Fighter) =>
        R.coverBp +
        (fx(g).coverBonusBp ?? 0) +
        (fx(g).distanceCoverBp ?? 0) * Math.abs(g.col - taker.col);
      const coverers = alive(s).filter(
        (g) => g.role === 'guard' && !silenced(g) && inReach(s, g, taker),
      );
      const best = coverers.sort((a, b) => cover(b) - cover(a))[0];
      if (best) {
        if (fx(best).distanceCoverBp) bump(best, 'distanceCoverBp');
        if (fx(best).flankGuard) bump(best, 'flankGuard');
        cut(cover(best));
      }
    }
  }
  // Front-liner: less from every hit in the front row.
  if (k.frontCutBp && taker.row === 0) {
    cut(k.frontCutBp);
    bump(taker, 'frontCutBp');
  }
  // Brace: less from the boss's moves (a Charged landing aimed at its own slot, and any other move), half of that from its plain attack.
  if (k.braceBp && move && (how !== 'charged' || taker === target)) {
    cut(k.braceBp);
    bump(taker, 'braceBp');
  } else if (k.braceBp && !move && how !== 'reflected') {
    // Its plain attack too, at half the cut (a card-shaped talent that is never fully idle).
    cut(Math.floor(k.braceBp / 2));
    bump(taker, 'braceBp');
  }
  // Long Shadow: the cut on a hit it intercepts grows with the distance to the creature it saved.
  if (k.distanceCoverBp && taker !== target) {
    cut(k.distanceCoverBp * Math.abs(taker.col - target.col));
    bump(taker, 'distanceCoverBp');
  }
  // One cap on every cut together: at most 75% off, before armour.
  dmg = Math.floor((dmg * Math.max(left, 10_000 - R.cutMaxBp)) / 10_000);
  dmg -= ownArmour(taker);
  // Mud Wall counts every hit it takes, Blocked or not.
  if (k.miresOnHit) addMired(s, taker);
  if (dmg <= 0) {
    s.count.blocked++;
    log(s, 'blocked', `${taker.name} blocks the hit`);
    return;
  }
  let heldOn = false;
  if (dmg >= taker.hp && k.holdOn && !taker.holdOnDone) {
    taker.holdOnDone = true;
    heldOn = true;
    bump(taker, 'holdOn');
    dmg = taker.hp - 1;
    log(s, 'hold-on', `${taker.name} holds on`);
  }
  taker.hp = Math.max(0, taker.hp - dmg);
  // Holding on leaves it at two fifths of its Max HP (at least 1 HP); reworked 2026-10-28: 1 HP alone gained about 2%.
  if (heldOn) taker.hp = Math.max(taker.hp, Math.floor((taker.maxHp * R.holdOnLeaveBp) / 10_000));
  const wind = k.secondWindBp;
  if (wind && !taker.secondWindDone && taker.hp > 0 && taker.hp * 2 < taker.maxHp) {
    taker.secondWindDone = true;
    bump(taker, 'secondWindBp');
    heal(s, taker, wind, false);
  }
  log(s, 'hit', `${taker.name} takes ${dmg}${taker.hp === 0 ? ' and is knocked out' : ''}`);
  // Rally Cry: a creature beside it was knocked out (a silenced creature does not arm it).
  if (taker.hp === 0) for (const g of beside(s, taker)) if (fx(g).vengefulBp) g.avenged = true;
  for (const g of alive(s)) {
    if (fx(g).bakedShell && (g === taker || inReach(s, g, taker)))
      g.store = Math.min(3, g.store + 1);
  }
}

/**
 * A counter that ignores armour (Retaliate, Shoulder Charge's strike-back). It is damage and can land the
 * killing blow, but it is not one of the creature's hits: no Cull, no "its hits" talent.
 */
function counter(s: State, f: Fighter, shareBp: number): void {
  hitBoss(s, f, Math.floor((f.atk * shareBp) / 10_000), false);
}

function bossHits(
  s: State,
  move: Pick<BossMove, 'id' | 'pattern' | 'powerBp' | 'silenceTurns' | 'charged'>,
  plain: boolean,
): void {
  const targets =
    (move.charged ? s.announced.get(move.id) : undefined) ?? targetsOf(s, move.pattern, plain);
  const shape = move.pattern.shape;
  const proposed = Math.floor(
    (((s.boss.atk * move.powerBp) / 10_000) * (10_000 - miredCut(s))) / 10_000,
  );
  // Wards are read before the move lands: a ward silenced by this same move still protects.
  const warded = new Set(
    targets.filter((t) => fx(t).ignoreSilence || beside(s, t).some((o) => fx(o).besideNoSilence)),
  );
  for (const t of targets) {
    // The fight ends the moment the boss is down: the rest of the move does not land.
    if (s.bossHp <= 0) return;
    if (t.hp <= 0) continue;
    const area = !(shape === 'single' || (shape === 'line3' && t === targets[0]));
    // A move that deals no damage is not dodged or intercepted (R1).
    if (move.silenceTurns) {
      if (warded.has(t)) {
        if (fx(t).ignoreSilence) bump(t, 'ignoreSilence');
        log(s, 'silence', `${t.name} shrugs off the silence`);
        continue;
      }
      t.silencedTurns = Math.max(t.silencedTurns, move.silenceTurns);
      log(s, 'silence', `${t.name} is silenced`);
      continue;
    }
    // R1: the target rolls dodge first; a charged landing rolls at full chance.
    if (roll(s, dodgeOf(s, t, area && !move.charged))) {
      s.count.dodges++;
      log(s, 'dodge', `${t.name} dodges`);
      const k = fx(t);
      // Retaliate ignores armour: the hit back is a counter, not a hit (keywords).
      if (k.retaliateBp) counter(s, t, k.retaliateBp);
      if (k.storeDodgeStacks) t.store = Math.min(3, t.store + 1);
      // Momentum: its next hit deals more.
      if (k.momentumBp) t.momentum = true;
      continue;
    }
    // Only if the dodge failed: a Guard in reach intercepts (aimed hits; area or charged with a Knack).
    let taker = t;
    if (t.role !== 'guard') {
      const guard = alive(s)
        .filter(
          (g) =>
            !silenced(g) &&
            !fx(g).noIntercept &&
            g !== t &&
            g.row === t.row &&
            (g.role === 'guard'
              ? inReach(s, g, t)
              : fx(g).interceptLikeGuard === true && Math.abs(g.col - t.col) === 1),
        )
        .filter((g) => !area || fx(g).interceptArea || (move.charged && fx(g).interceptCharged))
        // R1.3: a Guard first (nearest, then leftmost); an effect interceptor only when no Guard can.
        .sort(
          (a, b) =>
            Number(b.role === 'guard') - Number(a.role === 'guard') ||
            Math.abs(a.col - t.col) - Math.abs(b.col - t.col) ||
            a.col - b.col,
        )[0];
      const watch = move.charged
        ? alive(s).find((g) => g.row === t.row && g !== t && fx(g).interceptCharged)
        : undefined;
      const by = guard ?? watch;
      if (by) {
        taker = by;
        s.count.intercepts++;
        log(s, 'intercept', `${by.name} intercepts for ${t.name}`);
        // Momentum: a hit aimed at it that another creature took counts like a dodge.
        if (fx(t).momentumBp) t.momentum = true;
        if (fx(by).flankGuard) bump(by, 'flankGuard');
        if (fx(by).primeOnFirstIntercept && !by.firstInterceptDone) {
          by.firstInterceptDone = true;
          addMark(s, by.element, 1, { by });
        }
        // Shoulder Charge: it strikes back, ignoring armour (a counter, not a hit).
        if (fx(by).interceptHitBackBp) {
          counter(s, by, fx(by).interceptHitBackBp ?? 0);
          bump(by, 'interceptHitBackBp');
          if (s.bossHp <= 0) return;
        }
      }
    }
    takeHit(s, taker, proposed, move.charged ? 'charged' : area ? 'area' : 'aimed', t, !plain);
  }
}

function bossTurn(s: State, turn: number): void {
  if (s.bossHp <= 0) return;
  s.turn = turn;
  const ageAtStart = s.markAge;
  const last = s.boss.rows - 1;
  for (const m of s.boss.moves) {
    if (s.bossHp <= 0) return;
    if (s.round % m.every === 0 && (m.turn ?? last) === turn) {
      log(s, 'move', m.name);
      bossHits(s, m, false);
    }
  }
  for (let i = 0; i < (s.boss.plain.hits ?? 1); i++) {
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
    for (const [el, m] of s.marks) if (!m.sealed && m.age < ageAtStart) s.marks.delete(el);
  s.bossTurnsDone++;
  s.reflectArmed = true;
}

/** One fight: the boss, the placed creatures, and the rounds of R8. */
export function fight(
  boss: BossDef,
  placements: readonly Placement[],
  opts: FightOptions,
): FightResult {
  const fighters = placeFighters(placements);
  if (opts.carryHp) for (const f of fighters) f.hp = opts.carryHp.get(f.uid) ?? f.hp;
  const s: State = {
    boss,
    opts,
    fighters,
    bossHp: opts.bossHp ?? boss.hp,
    marks: new Map(),
    markAge: 0,
    mired: 0,
    round: 0,
    turn: 0,
    bossTurnsDone: 0,
    // Reflective Hide arms after each boss turn, so not before the first one.
    reflectArmed: false,
    announced: new Map(),
    events: [],
    killer: null,
    count: { reactions: 0, blocked: 0, dodges: 0, intercepts: 0, healed: 0, damage: 0 },
    byMark: {},
  };
  const startAlive = alive(s).length;
  for (s.round = 1; s.round <= boss.rounds && s.bossHp > 0 && alive(s).length > 0; s.round++) {
    for (const f of fighters) {
      f.undodgeable = false;
      f.damageLastRound = f.damageThisRound;
      f.damageThisRound = 0;
    }
    s.turn = 0;
    roundStart(s);
    // The boss takes a turn after every row of the arena, empty or not.
    for (let r = 0; r < boss.rows && s.bossHp > 0 && alive(s).length > 0; r++) {
      // Events of this row's turns and of the boss turn after them carry the row's number.
      s.turn = r;
      for (const f of alive(s)
        .filter((x) => x.row === r)
        .sort((a, b) => a.col - b.col))
        creatureTurn(s, f);
      bossTurn(s, r);
    }
    fadeMired(s);
    // Shake It Off: announced at round start, the boss clears every debuff when its round ends.
    if (s.boss.mods.shakeEvery && s.round % s.boss.mods.shakeEvery === 0 && s.mired > 0) {
      s.mired = 0;
      log(s, 'shake', `${boss.name} shakes off its debuffs`);
      log(s, 'mired', 'Mired x0');
    }
  }
  return {
    damage: s.count.damage,
    bossHpLeft: s.bossHp,
    won: s.bossHp <= 0,
    killingBlow: s.killer,
    wiped: alive(s).length === 0,
    knockouts: startAlive - alive(s).length,
    reactions: s.count.reactions,
    reactionsByMark: s.byMark,
    blocked: s.count.blocked,
    dodges: s.count.dodges,
    intercepts: s.count.intercepts,
    healed: s.count.healed,
    hpLeft: new Map(fighters.map((f) => [f.uid, f.hp])),
    fighters,
    events: s.events,
  };
}

/**
 * A raid weekend with attrition (R14): stages share the boss's HP; creatures keep their HP between
 * stages, nobody heals between them, and a knocked-out creature stays out (its owner may bring a
 * replacement from `bench`, which takes the empty slot). Only HP carries: marks, Stores, Mired and
 * "each fight" effects start fresh each stage. From stage 2 an adapting boss resists the reaction
 * used most so far.
 */
export function weekend(
  boss: BossDef,
  placements: readonly Placement[],
  bench: readonly Placement[],
  opts: FightOptions & { readonly stages?: number },
): { readonly stages: FightResult[]; readonly won: boolean; readonly replacements: number } {
  const stages: FightResult[] = [];
  let current = [...placements];
  const benchLeft = [...bench];
  // Carried HP is keyed by the uids of the next stage's fighters (see below).
  let hp = new Map<string, number>();
  let bossHp = boss.hp;
  let replacements = 0;
  const used: Record<string, number> = {};
  for (let i = 0; i < (opts.stages ?? 3) && bossHp > 0; i++) {
    const top = Object.entries(used).sort((a, b) => b[1] - a[1])[0]?.[0];
    const resist = boss.mods.adapts && i > 0 ? top : undefined;
    const res = fight(boss, current, {
      ...opts,
      carryHp: hp,
      bossHp,
      ...(resist ? { resistReaction: resist } : {}),
    });
    stages.push(res);
    bossHp = res.bossHpLeft;
    for (const [el, n] of Object.entries(res.reactionsByMark)) used[el] = (used[el] ?? 0) + n;
    const next: Placement[] = [];
    res.fighters.forEach((f, idx) => {
      const p = current[idx];
      if (!p) return;
      if (f.hp > 0) next.push(p);
      else {
        const j = benchLeft.findIndex((b) => b.owner === p.owner);
        if (j >= 0) {
          const [rep] = benchLeft.splice(j, 1);
          if (rep) {
            next.push({ ...rep, row: p.row, col: p.col });
            replacements++;
          }
        }
      }
    });
    const nextFighters = placeFighters(next);
    const carried = new Map<string, number>();
    nextFighters.forEach((nf) => {
      const prev = res.fighters.find(
        (f) =>
          f.owner === nf.owner &&
          f.formId === nf.formId &&
          f.row === nf.row &&
          f.col === nf.col &&
          f.hp > 0,
      );
      carried.set(nf.uid, prev ? prev.hp : nf.maxHp);
    });
    hp = carried;
    current = next;
  }
  return { stages, won: bossHp <= 0, replacements };
}

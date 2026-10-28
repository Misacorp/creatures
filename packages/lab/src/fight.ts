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
import { mergeFx, talent } from './talents';
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
      sleeperDone: false,
      fires: {},
    };
  });
}

/** Creatures beside `f` in its row, within `reach` columns, living. */
function beside(s: State, f: Fighter, reach = 1): Fighter[] {
  return alive(s).filter((o) => o !== f && o.row === f.row && Math.abs(o.col - f.col) <= reach);
}

const reachOf = (g: Fighter) => R.guardReach + (fx(g).reachBonus ?? 0);

/**
 * Whether `o` is in `g`'s reach: the same row, within its reach on each side. Flank Guard covers only
 * one side, with twice the slots (both flags cancel out).
 */
function inReach(g: Fighter, o: Fighter): boolean {
  if (g === o || g.row !== o.row) return false;
  const k = fx(g);
  const r = reachOf(g);
  const d = o.col - g.col;
  if (!!k.flankLeft !== !!k.flankRight)
    return k.flankLeft ? d >= -2 * r && d <= -1 : d >= 1 && d <= 2 * r;
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

/** A heal by `src` (if any): healing past full HP passes on to the most hurt creature beside `src` (Overheal Spill). */
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
    const next = mostHurt(beside(s, src).filter((o) => o !== target));
    if (next) {
      const moved = Math.min(over, next.maxHp - next.hp);
      next.hp += moved;
      s.count.healed += moved;
      bump(src, 'spillOver');
    }
  }
}

/** Mired stacks (capped); a debuff's Heavy Hand talent adds extra stacks each time. */
function addMired(s: State, by: Fighter): void {
  s.mired = Math.min(R.miredMaxStacks, s.mired + 1 + (fx(by).miredExtra ?? 0));
  if (fx(by).miredExtra) bump(by, 'miredExtra');
  log(s, 'mired', `Mired x${s.mired}`);
}

// ---------- round start ----------

function roundStart(s: State): void {
  // Mired fades first: a stack at every round start, or every second one while a living creature has
  // Clinging (Misa, 2026-10-28). A creature that puts Mired on again afterwards keeps it up.
  if (s.mired > 0) {
    const clinging = alive(s).find((f) => fx(f).clinging);
    const every = clinging ? R.miredClingingFadeEvery : R.miredFadeEvery;
    if (s.round % every === 0) {
      s.mired--;
      log(s, 'mired', `Mired x${s.mired}`);
    } else if (clinging) bump(clinging, 'clinging');
  }
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
      for (const o of alive(s).filter((o) => inReach(f, o))) heal(s, o, k.guardMendBp, true, f);
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
  const kindred = (o: Fighter) => (o.element === f.element ? (k.kindredBoostBp ?? 0) : 0);
  const healBp = (R.supportHealBp[f.element] ?? 0) + (k.mendBonusBp ?? 0);
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
        // Triage: only the most hurt creature beside it, at double size.
        const patients = k.triage ? [mostHurt(near)].filter((o): o is Fighter => !!o) : near;
        for (const o of patients) {
          const size = (k.support === 'curlUp' && o.hp * 2 < o.maxHp ? 3 : 1) * (k.triage ? 2 : 1);
          heal(s, o, healBp * size, true, f);
          if (k.triage) bump(f, 'triage');
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
 * Damage to the boss by `f` (a hit, or a counter that ignores armour): HP, damage counts, Cull and the
 * killing blow. A hit that leaves the boss below `f`'s Cull share of its full HP defeats it outright;
 * the HP that was left counts as damage dealt. The creature whose damage or Cull takes the last HP
 * lands the killing blow (the first one only).
 */
function hitBoss(s: State, f: Fighter, dmg: number): void {
  const real = Math.min(dmg, s.bossHp);
  s.bossHp -= real;
  let dealt = real;
  let culled = false;
  const cull = fx(f).cullBp;
  if (cull && real > 0 && s.bossHp > 0 && s.bossHp * 10_000 < s.boss.hp * cull) {
    dealt += s.bossHp;
    s.bossHp = 0;
    culled = true;
    bump(f, 'cullBp');
    log(s, 'cull', `${f.name} culls ${s.boss.name}`);
  }
  s.count.damage += dealt;
  f.damageDealt += dealt;
  f.damageThisRound += dealt;
  if (s.bossHp <= 0 && dealt > 0 && !s.killer) {
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

/** Whether `f` is the leftmost or rightmost living creature of its row (Edge-walker). */
function atRowEnd(s: State, f: Fighter): boolean {
  const cols = alive(s)
    .filter((o) => o.row === f.row)
    .map((o) => o.col);
  return f.col === Math.min(...cols) || f.col === Math.max(...cols);
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
    (f.hitsLanded === 0 ? (k.firstHitBp ?? 0) : 0) +
    (f.hp * 2 < f.maxHp ? (k.lowHpAtkBp ?? 0) : 0) +
    (guardBeside ? (k.besideGuardBp ?? 0) : 0) +
    (payoffBeside ? 0 : (k.alonePayoffBp ?? 0)) +
    on('perKindredBesideBp', kin * (k.perKindredBesideBp ?? 0), kin > 0) +
    on('oddOneOutBp', k.oddOneOutBp, near.length > 0 && kin === 0) +
    on('loneWolfBp', k.loneWolfBp, near.length === 0) +
    on('rowEndBp', k.rowEndBp, atRowEnd(s, f)) +
    on('slowBurnBp', Math.min(rounds * (k.slowBurnBp ?? 0), k.slowBurnCapBp ?? 0), rounds > 0) +
    on('finisherBp', k.finisherBp, s.bossHp * 10_000 < s.boss.hp * R.finisherBelowBp) +
    on('momentumBp', k.momentumBp, f.momentum) +
    on('vengefulBp', k.vengefulBp, f.avenged);
  f.momentum = false;
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
    : Math.max(
        0,
        Math.min(R.dodgeMaxBp, s.boss.spd * R.dodgePerSpdBp - s.mired * R.miredPerStackBp),
      );
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
      raise(f, 'cashFullBp', k.cashFullBp, mark.stacks === R.maxStacks);
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
    if (dmg > 0) f.hitsLanded++;
    hitBoss(s, f, dmg);
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

/** Armour: base, the Knack's and talents', and the largest share a neighbour passes on (Share the Load). */
function armourOf(s: State, f: Fighter): number {
  const shared = Math.max(
    0,
    ...beside(s, f).map((o) => Math.floor((ownArmour(o) * (fx(o).shareArmourBp ?? 0)) / 10_000)),
  );
  return ownArmour(f) + shared;
}

/**
 * Damage lands on a creature: reductions, armour, then Blocked or HP (R13), then hit-taken effects.
 * `target` is the slot the hit was aimed at; when another creature took it (an intercept), the
 * distance between them counts for Long Shadow.
 */
function takeHit(
  s: State,
  taker: Fighter,
  proposed: number,
  how: 'aimed' | 'area' | 'charged' | 'reflected',
  target: Fighter = taker,
): void {
  let dmg = proposed;
  if (how === 'area' || how === 'charged') {
    const ward = Math.max(
      0,
      ...alive(s)
        .filter((o) => o.row === taker.row)
        .map((o) => fx(o).rowAreaCutBp ?? 0),
    );
    const shelter = Math.max(0, ...beside(s, taker).map((o) => fx(o).besideAreaCutBp ?? 0));
    // Auras of one kind: the largest applies; the creature's own cut adds (R15), at most 75%.
    const cut = Math.min(R.areaCutMaxBp, Math.max(ward, shelter) + (fx(taker).areaCutBp ?? 0));
    dmg = Math.floor((dmg * (10_000 - cut)) / 10_000);
    // Cover: the best of the Guards in reach, with every bonus, capped (Misa, 2026-10-28). A hit a
    // Guard intercepts is not covered again; it needs no cap, the Guard still takes it.
    if (taker.role !== 'guard') {
      const cover = (g: Fighter) =>
        R.coverBp +
        (fx(g).coverBonusBp ?? 0) +
        (fx(g).distanceCoverBp ?? 0) * Math.abs(g.col - taker.col);
      const coverers = alive(s).filter(
        (g) => g.role === 'guard' && !silenced(g) && inReach(g, taker),
      );
      const best = coverers.sort((a, b) => cover(b) - cover(a))[0];
      if (best) {
        if (fx(best).distanceCoverBp) bump(best, 'distanceCoverBp');
        dmg = Math.floor((dmg * (10_000 - Math.min(R.coverMaxBp, cover(best)))) / 10_000);
      }
    }
  }
  const k = fx(taker);
  // Front-liner: less from every hit in the front row.
  if (k.frontCutBp && taker.row === 0) {
    dmg = Math.floor((dmg * (10_000 - k.frontCutBp)) / 10_000);
    bump(taker, 'frontCutBp');
  }
  // Brace: less from a Charged landing aimed at its own slot.
  if (k.braceBp && how === 'charged' && taker === target) {
    dmg = Math.floor((dmg * (10_000 - k.braceBp)) / 10_000);
    bump(taker, 'braceBp');
  }
  // Long Shadow: the cut on a hit it intercepts grows with the distance to the creature it saved.
  if (k.distanceCoverBp && taker !== target) {
    const cut = Math.min(10_000, k.distanceCoverBp * Math.abs(taker.col - target.col));
    dmg = Math.floor((dmg * (10_000 - cut)) / 10_000);
    bump(taker, 'distanceCoverBp');
  }
  dmg -= armourOf(s, taker);
  // Thick Skull: a hit smaller than a share of its max HP is Blocked.
  if (dmg > 0 && k.skullBp && dmg * 10_000 < taker.maxHp * k.skullBp) {
    dmg = 0;
    bump(taker, 'skullBp');
  }
  // Mud Wall counts every hit it takes, Blocked or not.
  if (k.miresOnHit) addMired(s, taker);
  if (dmg <= 0) {
    s.count.blocked++;
    log(s, 'blocked', `${taker.name} blocks the hit`);
    return;
  }
  if (dmg >= taker.hp && k.holdOn && !taker.holdOnDone) {
    taker.holdOnDone = true;
    dmg = taker.hp - 1;
    log(s, 'hold-on', `${taker.name} holds on`);
  }
  taker.hp = Math.max(0, taker.hp - dmg);
  const wind = k.secondWindBp;
  if (wind && !taker.secondWindDone && taker.hp > 0 && taker.hp * 2 < taker.maxHp) {
    taker.secondWindDone = true;
    heal(s, taker, wind, false);
  }
  log(s, 'hit', `${taker.name} takes ${dmg}${taker.hp === 0 ? ' and is knocked out' : ''}`);
  // Vengeful: a creature beside it was knocked out.
  if (taker.hp === 0) for (const g of beside(s, taker)) if (g.fxAll.vengefulBp) g.avenged = true;
  for (const g of alive(s)) {
    if (fx(g).bakedShell && (g === taker || inReach(g, taker))) g.store = Math.min(3, g.store + 1);
  }
}

/** A hit back that ignores armour (Retaliate, Shoulder Charge): the counter of a creature. */
function counter(s: State, f: Fighter, shareBp: number): void {
  hitBoss(s, f, Math.floor((f.atk * shareBp) / 10_000));
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
    (((s.boss.atk * move.powerBp) / 10_000) * (10_000 - s.mired * R.miredPerStackBp)) / 10_000,
  );
  // Wards are read before the move lands: a ward silenced by this same move still protects.
  const warded = new Set(
    targets.filter((t) => fx(t).ignoreSilence || beside(s, t).some((o) => fx(o).besideNoSilence)),
  );
  for (const t of targets) {
    if (t.hp <= 0) continue;
    const area = !(shape === 'single' || (shape === 'line3' && t === targets[0]));
    // A move that deals no damage is not dodged or intercepted (R1).
    if (move.silenceTurns) {
      if (warded.has(t)) {
        log(s, 'silence', `${t.name} shrugs off the silence`);
        continue;
      }
      // Light Sleeper: the first silence each fight lasts one turn.
      let turns = move.silenceTurns;
      if (fx(t).lightSleeper && !t.sleeperDone) {
        t.sleeperDone = true;
        turns = 1;
        bump(t, 'lightSleeper');
      }
      t.silencedTurns = Math.max(t.silencedTurns, turns);
      log(s, 'silence', `${t.name} is silenced`);
      continue;
    }
    // R1: the target rolls dodge first; a charged landing rolls at full chance.
    if (roll(s, dodgeOf(s, t, area && !move.charged))) {
      s.count.dodges++;
      log(s, 'dodge', `${t.name} dodges`);
      const k = fx(t);
      // Retaliate ignores armour: the hit back is a counter, not an attack (keywords).
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
              ? inReach(g, t)
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
        if (fx(by).primeOnFirstIntercept && !by.firstInterceptDone) {
          by.firstInterceptDone = true;
          addMark(s, by.element, 1, { by });
        }
        // Shoulder Charge: it hits back, ignoring armour.
        if (fx(by).interceptHitBackBp) {
          counter(s, by, fx(by).interceptHitBackBp ?? 0);
          bump(by, 'interceptHitBackBp');
        }
      }
    }
    takeHit(s, taker, proposed, move.charged ? 'charged' : area ? 'area' : 'aimed', t);
  }
}

function bossTurn(s: State, turn: number): void {
  if (s.bossHp <= 0) return;
  s.turn = turn;
  const ageAtStart = s.markAge;
  const last = s.boss.rows - 1;
  for (const m of s.boss.moves) {
    if (s.round % m.every === 0 && (m.turn ?? last) === turn) {
      log(s, 'move', m.name);
      bossHits(s, m, false);
    }
  }
  for (let i = 0; i < (s.boss.plain.hits ?? 1); i++)
    bossHits(
      s,
      { id: 'plain', pattern: s.boss.plain.pattern, powerBp: s.boss.plain.powerBp },
      true,
    );
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

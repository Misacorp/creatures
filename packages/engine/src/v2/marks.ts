/**
 * Marks, Support verbs and the start of a round (R3 to R5 marks, R8.2 round start, the Support verbs and heals of R10 and the
 * Overheal Spill rule). Round start runs the Support verbs, the round-start Knacks, the escalation step and the announcements.
 */
import { GEAR_SHARES, type KnackFx } from './effects';
import type { Fighter } from './types';
import * as escalationMod from './escalation';
import * as boardMod from './board';
import * as stateMod from './state';
import type { State } from './state';

// Bound once: a named import is read through a getter on every call under the lab's Vite loader, which costs 15% of a report.
const { addMired, escalate, movesOf } = escalationMod;
const { beside, inReach, targetsOf, usesRoll } = boardMod;
const {
  alive,
  aliveBySlot,
  boostNext,
  bump,
  emit,
  fx,
  keyOf,
  log,
  mostHurt,
  onceIn,
  roll,
  setStore,
  silenced,
} = stateMod;

export function addMark(
  s: State,
  element: string,
  stacks: number,
  opts: { sealed?: boolean; fromTrail?: boolean; by?: Fighter } = {},
): void {
  const R = s.ctx.rules;
  const m = s.marks.get(element);
  if (m) {
    m.turnSet = s.bossTurnsDone;
    if (opts.by) m.owners.add(opts.by.uid);
    m.stacks = Math.min(R.maxStacks, m.stacks + stacks);
    // A mark is sealed if any of its counts was left sealed (R8).
    m.sealed ||= opts.sealed ?? false;
  } else {
    s.marks.set(element, {
      stacks: Math.min(R.maxStacks, stacks),
      age: s.markAge++,
      sealed: opts.sealed ?? false,
      fromTrail: opts.fromTrail ?? false,
      turnSet: s.bossTurnsDone,
      owners: new Set(opts.by ? [opts.by.uid] : []),
    });
  }
  if (s.opts.log) {
    const now = s.marks.get(element);
    log(s, 'mark', `${element} x${now?.stacks ?? 0}`, {
      board: { type: 'mark', element, stacks: now?.stacks ?? 0, sealed: now?.sealed ?? false },
    });
  }
}

/** A heal by `src` (if any): healing past full HP passes on to the most hurt creature in the row of the one healed (Overheal Spill). */
export function heal(
  s: State,
  target: Fighter,
  amountBp: number,
  critOk = true,
  src?: Fighter,
): void {
  const R = s.ctx.rules;
  if (target.hp <= 0) return;
  let amt = Math.floor((target.maxHp * amountBp) / 10_000);
  if (critOk && roll(s, R.critChanceBp)) amt = Math.floor((amt * R.healCritBp) / 10_000);
  amt = Math.floor((amt * (s.boss.mods.healBp ?? 10_000)) / 10_000);
  amt = Math.floor((amt * (10_000 + (fx(target).healReceivedBp ?? 0))) / 10_000);
  if (s.opts.determinationBp) amt = Math.floor((amt * (10_000 + s.opts.determinationBp)) / 10_000);
  const real = Math.min(amt, target.maxHp - target.hp);
  target.hp += real;
  s.count.healed += real;
  if (s.opts.log && real > 0)
    emit(s, {
      type: 'heal',
      who: keyOf(target),
      amount: real,
      ...(src ? { by: keyOf(src) } : {}),
    });
  // Shared Warmth (gear): a Support that heals a creature wearing it has a bigger boost next time, once a round.
  const warmth = fx(target).sharedWarmthBp;
  if (warmth && real > 0 && src?.role === 'support' && onceIn(src, 'sharedWarmthBp', s.round)) {
    src.warmBp = Math.max(src.warmBp, warmth);
    bump(target, 'sharedWarmthBp');
  }
  const over = amt - real;
  if (over > 0 && src && fx(src).spillOver) {
    const next = mostHurt(alive(s).filter((o) => o !== target && o.row === target.row));
    if (next) {
      const moved = Math.min(over, next.maxHp - next.hp);
      next.hp += moved;
      s.count.healed += moved;
      if (s.opts.log && moved > 0)
        emit(s, { type: 'heal', who: keyOf(next), amount: moved, by: keyOf(src) });
      bump(src, 'spillOver');
    }
  }
}

export function roundStart(s: State): void {
  if (s.boss.mods.shakeEvery && s.round % s.boss.mods.shakeEvery === 0)
    log(s, 'announce', `${s.boss.name} will shake off its debuffs`);
  // R8.2 a: Support verbs (and their shapes), in slot order.
  for (const f of aliveBySlot(s))
    if (f.role === 'support' && !silenced(f)) supportVerb(s, f, fx(f));
  // R8.2 b: round-start Knacks and talents, in slot order.
  for (const f of aliveBySlot(s)) {
    const k = fx(f);
    if (k.miresAtStart) addMired(s, f);
    // Boiling Point's Heat also builds by itself: +1 at every round start (panel 5: it was filled by damage alone and never picked).
    if (k.bakedShell) setStore(s, f, Math.min(3, f.store + 1));
    if (k.guardMendBp)
      for (const o of alive(s).filter((o) => inReach(s, f, o))) heal(s, o, k.guardMendBp, true, f);
    // Gear: Second Wind (a chance to heal each round, only while hurt) and Kindling (round 1: the creatures beside it start boosted).
    if (k.windChanceBp && f.hp < f.maxHp && roll(s, k.windChanceBp)) {
      bump(f, 'windChanceBp');
      heal(s, f, GEAR_SHARES.windHealBp, false);
    }
    if (k.kindlingBp && s.round === 1)
      for (const o of beside(s, f)) {
        boostNext(s, o, f, k.kindlingBp);
        bump(f, 'kindlingBp');
      }
  }
  // The escalation steps up (announced), then every move due this round whose targets use a roll (a random anchor,
  // scatter, a random row) or that is Charged is announced: its slots are rolled and shown now, and it lands on exactly
  // those creatures (a creature knocked out meanwhile is skipped; nothing re-aims). Being Charged only changes how its
  // hits are dodged and intercepted. The log carries the move's id and its slots for the board.
  escalate(s);
  s.announced = new Map();
  for (const m of movesOf(s)) {
    if (s.round % m.every !== 0 || !(m.charged || usesRoll(m.pattern))) continue;
    const aimed = targetsOf(s, m.pattern, false);
    s.announced.set(m.id, aimed);
    if (s.opts.log) {
      const slots = aimed.map((t) => [t.row, t.col] as const);
      log(
        s,
        'announce',
        `${m.name} (${m.id}${m.charged ? ', Wind-up' : ''}) will land on ${aimed.map((t) => `${t.name} (row ${t.row + 1}, slot ${t.col + 1})`).join(', ') || 'nobody'}`,
        { move: m.id, slots, board: { type: 'announce', move: m.id, slots } },
      );
    }
  }
}

function supportVerb(s: State, f: Fighter, k: KnackFx): void {
  const R = s.ctx.rules;
  /** `o`'s next hit gets `bp` more (and the board is told). */
  const give = (o: Fighter, bp: number): void => boostNext(s, o, f, bp);
  f.verbsUsed++;
  let boost =
    (f.element === 'ember' ? R.supportBoostEmberBp : R.supportBoostBp) + (k.boostBonusBp ?? 0);
  // Shared Warmth (gear): a creature it healed since its last boost makes this one bigger.
  if (f.warmBp > 0) {
    boost += f.warmBp;
    f.warmBp = 0;
  }
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
  const triage = (k.triageBp ?? 0) > 0 && !f.triageIdle;
  switch (k.support) {
    case 'rowRain':
      for (const o of alive(s).filter((o) => o.row === f.row))
        heal(s, o, 500 + (k.mendBonusBp ?? 0), true, f);
      return;
    case 'rowBoost':
      for (const o of alive(s).filter((o) => o.row === f.row && o !== f))
        give(o, boost - 500 + kindred(o));
      return;
    case 'readyMark':
      addMark(s, f.element, 1, { by: f });
      return;
    case 'clearSkies':
      for (const o of beside(s, f)) {
        o.undodgeable = true;
        if (s.opts.log) emit(s, { type: 'sure', who: keyOf(o), by: keyOf(f) });
      }
      return;
    case 'sunbeam':
      for (const o of alive(s).filter((o) => o.col === f.col && o.row < f.row)) {
        give(o, boost + kindred(o));
        heal(s, o, Math.max(healBp, 600), true, f);
      }
      return;
    default: {
      const near = beside(s, f);
      for (const o of near) give(o, boost + kindred(o));
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
          give(o, boost + kindred(o));
      if (k.support === 'gatherCalm' && f.store >= 3) {
        for (const o of beside(s, f)) give(o, 4_500);
        setStore(s, f, 0);
      }
    }
  }
}

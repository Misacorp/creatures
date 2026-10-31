/**
 * Marks, Support verbs and the start of a round (R3 to R5 marks, R8.2 round start, the Support verbs and heals of R10 and the
 * Overheal Spill rule). Round start runs the Support verbs, the round-start Knacks, the escalation step and the announcements.
 */
import type { KnackFx } from './effects';
import type { Fighter } from './types';
import * as escalationMod from './escalation';
import * as boardMod from './board';
import * as stateMod from './state';
import type { State } from './state';

// Bound once: a named import is read through a getter on every call under the lab's Vite loader, which costs 15% of a report.
const { addMired, escalate, movesOf } = escalationMod;
const { beside, inReach, targetsOf, usesRoll } = boardMod;
const { alive, aliveBySlot, bump, fx, log, mostHurt, roll, silenced, strengthOf, strong } =
  stateMod;

export function addMark(
  s: State,
  element: string,
  stacks: number,
  opts: { sealed?: boolean; fromTrail?: boolean; fizzle?: boolean; by?: Fighter } = {},
): void {
  const R = s.ctx.rules;
  const m = s.marks.get(element);
  const after =
    opts.fizzle && s.boss.mods.fizzle && strong(s, strengthOf(s)) ? s.bossTurnsDone + 1 : 0;
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
  if (s.opts.log) log(s, 'mark', `${element} x${s.marks.get(element)?.stacks ?? 0}`);
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
    // Baked Shell's Heat also builds by itself: +1 at every round start (panel 5: it was filled by damage alone and never picked).
    if (k.bakedShell) f.store = Math.min(3, f.store + 1);
    if (k.guardMendBp)
      for (const o of alive(s).filter((o) => inReach(s, f, o))) heal(s, o, k.guardMendBp, true, f);
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
    log(
      s,
      'announce',
      `${m.name} (${m.id}${m.charged ? ', Wind-up' : ''}) will land on ${aimed.map((t) => `${t.name} (row ${t.row + 1}, slot ${t.col + 1})`).join(', ') || 'nobody'}`,
      { move: m.id, slots: aimed.map((t) => [t.row, t.col] as const) },
    );
  }
}

function supportVerb(s: State, f: Fighter, k: KnackFx): void {
  const R = s.ctx.rules;
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
  const triage = (k.triageBp ?? 0) > 0 && !f.triageIdle;
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
          o.boostBp += boost + kindred(o);
      if (k.support === 'gatherCalm' && f.store >= 3) {
        for (const o of beside(s, f)) o.boostBp += 4_500;
        f.store = 0;
      }
    }
  }
}

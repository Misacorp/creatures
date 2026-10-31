/**
 * The boss's escalation and Mired (R22): the Store's feed, the Build-up's steps and the phase change, what the steps add to the boss
 * (`grown`), and the Mired stacks that slow it and cut the boss's damage and dodge (R22.3). Docs: docs/design/combat/proposals/001-combat-v2.md.
 */
import type { BossMove, Escalation, EscalationFeed, EscalationState, Fighter } from './types';
import * as stateMod from './state';
import type { Grown, State } from './state';

// Bound once: a named import is read through a getter on every call under the lab's Vite loader, which costs 15% of a report.
const { alive, bump, fx, log, roll, strengthOf } = stateMod;

// ---------- the boss's escalation (its Store) ----------

/** One unit of an event feed (`reactions`, `crits`, `dodges`, `knockouts`, `shed`). */
export function feed(s: State, kind: EscalationFeed): void {
  if (s.boss.escalation?.feed === kind) s.esc.fed++;
}

/** The units one step needs: `per`, or with `perColumns`, `per` for that many columns of the arena (a wider raid feeds the boss faster, so it needs more per step). */
const perOf = (s: State): number => {
  const e = s.boss.escalation;
  if (!e) return 0;
  return e.perColumns ? Math.max(1, Math.round((e.per * s.boss.cols) / e.perColumns)) : e.per;
};

/** What the escalation's steps add to the boss now: `grow` for each step, at the Build-up's strength (a share of it). */
export const grown = (s: State): Grown => {
  const n = s.esc.step;
  // It is asked for on every hit but only changes with the step, so it is worked out once a step.
  if (s.grownNow && s.grownStep === n && s.grownFall === s.esc.fall) return s.grownNow;
  const g = s.boss.escalation?.grow ?? {};
  const st = s.boss.escalation?.strengthBp ?? strengthOf(s);
  // A growth that falls (a negative number) helps the players and comes in on the steps Mired does not slow (R22.3).
  const part = (v: number | undefined) =>
    Math.trunc((((v ?? 0) < 0 ? s.esc.fall : n) * (v ?? 0) * st) / 10_000);
  s.grownStep = n;
  s.grownFall = s.esc.fall;
  return (s.grownNow = {
    atk: Math.floor((s.boss.atk * (10_000 + part(g.atkBp))) / 10_000),
    dodgeBp: part(g.dodgeBp),
    armour: Math.max(0, s.boss.armour + part(g.armour)),
    hits: (s.boss.plain.hits ?? 1) + part(g.hits),
    jumps: part(g.jumps),
    targets: part(g.targets),
    area: part(g.area),
  });
};

/**
 * The boss's moves now: its own, and its phase's once the phase change has applied, in the boss card's order. Moves due on
 * one boss turn are announced and land in this order (R8.3, panel 5), then the plain attack.
 */
export const movesOf = (s: State): readonly BossMove[] =>
  s.esc.phase && s.boss.escalation?.phase
    ? (s.phaseMoves ??= [...s.boss.moves, ...s.boss.escalation.phase.moves])
    : s.boss.moves;

/** The feed units now: event feeds count as they happen; `rounds` and `hpLost` are read from the fight. */
function escalationCount(s: State): number {
  const e = s.boss.escalation;
  if (!e) return 0;
  if (e.feed === 'rounds') return s.esc.base + s.round - 1;
  // Read from the real HP (the shadow in potential mode), at most all of it: a boss cannot lose more than its HP.
  if (e.feed === 'hpLost')
    return Math.min(10_000, Math.floor(((s.boss.hp - s.shadowHp) * 10_000) / s.boss.hp));
  return s.esc.base + s.esc.fed;
}

export function escalationState(s: State): EscalationState | null {
  const e = s.boss.escalation;
  if (!e) return null;
  return {
    name: e.name,
    feed: e.feed,
    count: escalationCount(s),
    step: s.esc.step,
    fallStep: s.esc.fall,
    cap: e.cap,
    nextAt: s.esc.step >= e.cap ? null : (s.esc.step + 1) * perOf(s),
    phase: s.esc.phase,
    phaseNext: s.esc.phaseNext,
  };
}

/**
 * Round start, after the Knacks (R8.2 b) and before the Charged announcements: the boss steps up when its count has
 * reached the next step's units, announcing the step before it applies; at most one step per round (R22). Mired slows
 * it: each Mired stack at this moment raises the units the next step needs by a share of a step's units, so a step
 * that is due but not through the slowed bar waits for the Mired to fade.
 */
export function escalate(s: State): void {
  const e = s.boss.escalation;
  if (!e) return;
  s.esc.count = escalationCount(s);
  // The phase change is not a step: Mired does not slow it. It is announced at the round start the feed reaches its
  // units (`atStep` steps' worth) and applies at the next round start, so players see it coming a round ahead.
  if (e.phase && !s.esc.phase) {
    if (s.esc.phaseNext) {
      s.esc.phase = true;
      s.esc.phaseNext = false;
      if (s.opts.log) log(s, 'phase', `${s.boss.name}: ${e.phase.name}`);
    } else if (s.esc.count >= e.phase.atStep * perOf(s)) {
      s.esc.phaseNext = true;
      if (s.opts.log) log(s, 'announce', `${s.boss.name}: ${e.phase.name} begins next round`);
    }
  }
  const per = perOf(s);
  // The growth that helps the players (a falling armour) steps on the same bar but is never slowed: one step at most a round (R22.3).
  const falls = Object.values(e.grow).some((v) => (v ?? 0) < 0);
  if (falls && s.esc.fall < e.cap && s.esc.count >= (s.esc.fall + 1) * per) {
    s.esc.fall++;
    log(
      s,
      'escalation',
      `${e.name}: what helps the players falls to step ${s.esc.fall} of ${e.cap}; Mired does not slow it`,
    );
  }
  if (s.esc.step < e.cap) stepUp(s, e, per);
  if (!falls) s.esc.fall = s.esc.step;
}

/** The Build-up's steps that help the boss: one step if the count has reached the next bar, raised by the Mired (R22.3). */
function stepUp(s: State, e: Escalation, per: number): void {
  const R = s.ctx.rules;
  const due = (s.esc.step + 1) * per;
  if (s.esc.count < due) return;
  if (s.esc.count * 10_000 < due * 10_000 + s.mired * per * R.miredSlowsEscalationBp) {
    log(
      s,
      'escalation',
      `${e.name} is slowed by the Mired (x${s.mired}): ${s.esc.count} of the ${due} ${e.feed} its next step needs, and more while it is Mired`,
    );
    return;
  }
  s.esc.step++;
  log(
    s,
    'escalation',
    `${e.name}: step ${s.esc.step} of ${e.cap} (${s.esc.count} ${e.feed}); next at ${
      s.esc.step >= e.cap ? 'the cap' : (s.esc.step + 1) * per
    }`,
  );
}

/** What the boss's Mired takes off its damage and its dodge, in bp: per stack, more while a living creature has Clinging. */
export function miredCut(s: State): number {
  const R = s.ctx.rules;
  if (s.mired === 0) return 0;
  const per =
    s.carries.has('clinging') && alive(s).some((f) => fx(f).clinging)
      ? R.miredClingingStackBp
      : R.miredPerStackBp;
  return s.mired * per;
}

/** Mired stacks (capped); Wicked gives a chance of 1 extra stack each time. */
export function addMired(s: State, by: Fighter): void {
  const R = s.ctx.rules;
  const extra = roll(s, fx(by).miredExtraBp ?? 0) ? 1 : 0;
  if (extra) bump(by, 'miredExtraBp');
  s.mired = Math.min(R.miredMaxStacks, s.mired + 1 + extra);
  if (s.opts.log) log(s, 'mired', `Mired x${s.mired}`);
}

/**
 * Mired fades at the end of every second round; while a living creature has Clinging, only every third round
 * (Misa, 2026-10-28: one debuff creature must not hold it for the whole fight). Clinging also makes each stack
 * count for more (`miredCut`). Squelch Song alone builds stacks over a fight.
 */
export function fadeMired(s: State): void {
  const R = s.ctx.rules;
  if (s.mired <= 0) return;
  const clinging = s.carries.has('clinging') ? alive(s).find((f) => fx(f).clinging) : undefined;
  const every = clinging ? R.miredClingingFadeEvery : R.miredFadeEvery;
  if (s.round % every !== 0) {
    if (clinging && s.round % R.miredFadeEvery === 0) bump(clinging, 'clinging');
    return;
  }
  s.mired--;
  if (s.opts.log) log(s, 'mired', `Mired x${s.mired}`);
}

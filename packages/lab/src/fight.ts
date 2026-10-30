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
import { KNACKS, knack, type KnackFx } from './knacks';
import { STAT_FIELDS, TALENTS, mergeFx, talent, talentIdleUnder } from './talents';
import { LAB_RULES as R } from './rules';
import {
  ELEMENTS,
  formStats,
  matchupBp as chartMatchup,
  triggers as chartTriggers,
} from './species';
import type {
  BossDef,
  BossMove,
  Escalation,
  EscalationFeed,
  EscalationState,
  FightEvent,
  FightOptions,
  FightResult,
  Fighter,
  KillingBlow,
  Pattern,
  Placement,
} from './types';
import { FULL_STRENGTH_BP } from './types';

/** `fn` of two element ids, worked out once per pair (the element chart is a list the species module searches each time). */
function pairMemo<T>(fn: (a: string, b: string) => T): (a: string, b: string) => T {
  const seen = new Map<string, Map<string, T>>();
  return (a, b) => {
    let row = seen.get(a);
    if (!row) seen.set(a, (row = new Map<string, T>()));
    let v = row.get(b);
    if (v === undefined) row.set(b, (v = fn(a, b)));
    return v;
  };
}
const matchupBp = pairMemo(chartMatchup);
const triggers = pairMemo(chartTriggers);

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
  /**
   * The boss's real HP in potential mode (`FightOptions.potential`): it keeps falling below 1 (and below 0) while `bossHp` stays
   * at 1, and every "boss below a share of its HP" rule (Finisher, Cull, the Build-up's HP feed) reads it. Otherwise equal to `bossHp`.
   */
  shadowHp: number;
  marks: Map<string, Mark>;
  markAge: number;
  mired: number;
  round: number;
  turn: number;
  bossTurnsDone: number;
  reflectArmed: boolean;
  /**
   * The boss's escalation (its Store, R22): units fed by events this stage, the units carried from earlier stages, the
   * step applied, the count read at the last round start and whether its phase change has applied.
   */
  esc: {
    fed: number;
    base: number;
    /** Steps applied: the Build-up's growth that helps the boss, which Mired slows (R22.3). */
    step: number;
    /** Steps applied to the growth that helps the players (a falling armour): the same rule without Mired's slowing (R22.3). */
    fall: number;
    count: number;
    phase: boolean;
    /** The phase change was announced at an earlier round start and applies at the next. */
    phaseNext: boolean;
  };
  /** Targets of this round's announced moves (Charged, or with a roll in their targets), rolled at round start (by move id). */
  announced: Map<string, readonly Fighter[]>;
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
  /**
   * Caches of the living fighters (see `alive`, `aliveBySlot`), dropped the moment a creature's HP reaches 0 (`takeHit`, the
   * only place HP falls; heals never raise a knocked-out creature). A cached array is never changed, only replaced, so a
   * loop over one sees the same snapshot a fresh filter would have given.
   */
  live: readonly Fighter[] | null;
  liveBySlot: readonly Fighter[] | null;
  /**
   * The effects some fighter of this fight carries (set from the creatures' own effects, which never change; silence only
   * blanks them). A pass over the living for an effect nobody carries can be skipped (see `carried`).
   */
  readonly carries: ReadonlySet<keyof KnackFx>;
  /** `grown` for the escalation steps `grownStep` and `grownFall` (it only changes when a step does). */
  grownStep: number;
  grownFall: number;
  grownNow: Grown | null;
  /** The boss's moves with its phase's, once the phase change has applied (see `movesOf`). */
  phaseMoves: readonly BossMove[] | null;
}

/** What the escalation's steps add to the boss now (see `grown`). */
interface Grown {
  readonly atk: number;
  readonly dodgeBp: number;
  readonly armour: number;
  readonly hits: number;
  readonly jumps: number;
  readonly targets: number;
  readonly area: number;
}

/** The effects of `all` that have a value that counts. */
const carriedBy = (all: KnackFx): (keyof KnackFx)[] =>
  Object.entries(all)
    .filter(([, value]) => value)
    .map(([name]) => name as keyof KnackFx);

/** `carriedBy` for the merged effects `fxOf` hands out, worked out once each. */
const CARRIED = new WeakMap<KnackFx, readonly (keyof KnackFx)[]>();

/** The effects that any of `fighters` carries. */
function effectsCarried(fighters: readonly Fighter[]): ReadonlySet<keyof KnackFx> {
  const out = new Set<keyof KnackFx>();
  for (const f of fighters)
    for (const key of CARRIED.get(f.fxAll) ?? carriedBy(f.fxAll)) out.add(key);
  return out;
}

/**
 * What a creature's effects are now: all of them, or while it is silenced only its talents' plain stat lines (R12, amended in
 * panel 6: Attack, Max HP, Armour, Speed, crit chance and crit damage survive; effect lines and the Knack, its stat bonuses
 * included, are blanked).
 */
const fx = (f: Fighter): KnackFx => (f.silencedTurns > 0 ? f.fxStat : f.fxAll);
/** Silence blanks the creature: its Knack and its role's verb (Misa, 2026-10-26). Stat lines of talents and the species' stats still work. */
const silenced = (f: Fighter) => f.silencedTurns > 0;
const ownArmour = (f: Fighter) => f.baseArmour + (fx(f).armourBonus ?? 0);
/** The living fighters, in placement order. */
const alive = (s: State): readonly Fighter[] => (s.live ??= s.fighters.filter((f) => f.hp > 0));
const bySlot = (a: Fighter, b: Fighter) => a.row - b.row || a.col - b.col;
/** The living fighters from the front row, left to right (ties keep placement order, as a stable sort does). */
const aliveBySlot = (s: State): readonly Fighter[] => (s.liveBySlot ??= [...alive(s)].sort(bySlot));
/**
 * The first of `xs` that no other beats under `cmp` (negative: the first argument goes first), among those `keep` allows:
 * what `[...xs].filter(keep).sort(cmp)[0]` gives (a stable sort keeps the earlier of equals), without the copies.
 */
function best<T>(
  xs: readonly T[],
  cmp: (a: T, b: T) => number,
  keep?: (x: T) => boolean,
): T | undefined {
  let top: T | undefined;
  for (const x of xs) {
    if (keep && !keep(x)) continue;
    if (top === undefined || cmp(x, top) < 0) top = x;
  }
  return top;
}
const roll = (s: State, bp: number) => bp > 0 && chance(s.opts.rng, Math.min(bp, 10_000), 10_000);
/** Counts that an effect's condition held or its trigger fired (the report's "holds"). */
const bump = (f: Fighter, key: keyof KnackFx) => {
  f.fires[key] = (f.fires[key] ?? 0) + 1;
};
const log = (s: State, kind: string, text: string, extra: Partial<FightEvent> = {}) => {
  if (s.opts.log) s.events.push({ round: s.round, turn: s.turn, kind, text, ...extra });
};

// ---------- the boss's escalation (its Store) ----------

/** One unit of an event feed (`reactions`, `crits`, `dodges`, `knockouts`, `shed`). */
function feed(s: State, kind: EscalationFeed): void {
  if (s.boss.escalation?.feed === kind) s.esc.fed++;
}

/** The units one step needs: `per`, or with `perColumns`, `per` for that many columns of the arena (a wider raid feeds the boss faster, so it needs more per step). */
const perOf = (s: State): number => {
  const e = s.boss.escalation;
  if (!e) return 0;
  return e.perColumns ? Math.max(1, Math.round((e.per * s.boss.cols) / e.perColumns)) : e.per;
};

/** The strength of the boss's cards and gates (bp; 10000 is the full card). */
const strengthOf = (s: State): number => s.boss.strengthBp ?? FULL_STRENGTH_BP;

/** A chance of `st` bp that draws nothing at full strength (so a full-strength boss keeps its seeded results). */
const strong = (s: State, st: number): boolean => st >= FULL_STRENGTH_BP || roll(s, st);

/** What the escalation's steps add to the boss now: `grow` for each step, at the Build-up's strength (a share of it). */
const grown = (s: State): Grown => {
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
const movesOf = (s: State): readonly BossMove[] =>
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

function escalationState(s: State): EscalationState | null {
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
function escalate(s: State): void {
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

/** Every effect name a Knack or talent uses, in a fixed order (see `uniformFx`). */
const FX_KEYS: readonly string[] = [
  ...new Set(
    [...Object.values(KNACKS), ...Object.values(TALENTS)].flatMap((d) => Object.keys(d.fx)),
  ),
];

/**
 * `merged` as an object with every effect name set in one fixed order (the ones it lacks `undefined`). Every creature's
 * effects then share one object shape, so the hot reads of `fx(f).someKey` stay fast; a read gives the same value as before.
 */
function uniformFx(merged: KnackFx): KnackFx {
  const src = merged as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of FX_KEYS) out[key] = src[key];
  for (const key of Object.keys(src)) if (!(key in out)) out[key] = src[key];
  return out;
}

/** The merged effects of a Knack and talents, and the stats of a form at a level: worked out once, they never change. */
const FX_MEMO = new Map<string, KnackFx>();
const STAT_FX_MEMO = new Map<string, KnackFx>();
const STATS_MEMO = new Map<string, ReturnType<typeof formStats>>();

function fxOf(knackId: string | undefined, talents: readonly string[]): KnackFx {
  const key = `${knackId ?? ''}|${talents.join(',')}`;
  let fxAll = FX_MEMO.get(key);
  if (!fxAll) {
    fxAll = uniformFx(
      mergeFx([knack(knackId)?.fx ?? {}, ...talents.map((id) => talent(id)?.fx ?? {})]),
    );
    FX_MEMO.set(key, fxAll);
    CARRIED.set(fxAll, carriedBy(fxAll));
  }
  return fxAll;
}

/** The talents' plain stat lines alone (`STAT_FIELDS`): what silence leaves (R12). */
function statFxOf(talents: readonly string[]): KnackFx {
  const key = talents.join(',');
  let stat = STAT_FX_MEMO.get(key);
  if (!stat) {
    const merged = mergeFx(talents.map((id) => talent(id)?.fx ?? {})) as Record<string, unknown>;
    const only: Record<string, unknown> = {};
    for (const name of Object.keys(merged))
      if (STAT_FIELDS.has(name as keyof KnackFx)) only[name] = merged[name];
    stat = uniformFx(only);
    STAT_FX_MEMO.set(key, stat);
  }
  return stat;
}

function statsOf(formId: string, level: number): ReturnType<typeof formStats> {
  const key = `${formId}|${level}`;
  let st = STATS_MEMO.get(key);
  if (!st) {
    st = formStats(formId, level);
    STATS_MEMO.set(key, st);
  }
  return st;
}

export function placeFighters(placements: readonly Placement[]): Fighter[] {
  return placements.map((p, i) => {
    const st = statsOf(p.formId, p.level);
    const k = p.knack === 'none' ? undefined : p.knack;
    const fxAll = fxOf(k, p.talents ?? []);
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
      critChanceBp: st.critChanceBp,
      critDamageBp: st.critDamageBp,
      sureCrits: 0,
      guardTaken: 0,
      knack: k,
      talents: p.talents ?? [],
      fxAll,
      fxStat: statFxOf(p.talents ?? []),
      hitsLanded: 0,
      secondWindDone: false,
      holdOnDone: false,
      row: p.row,
      col: p.col,
      silencedTurns: 0,
      store: 0,
      boostBp: 0,
      undodgeable: false,
      lastPrimeRound: 0,
      damageDealt: 0,
      hitDamage: 0,
      watchTurn: -1,
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
  const out: Fighter[] = [];
  for (const o of alive(s))
    if (o !== f && o.row === f.row && Math.abs(o.col - f.col) <= reach) out.push(o);
  return out;
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
  return best(
    xs,
    (a, b) => a.hp * b.maxHp - b.hp * a.maxHp || bySlot(a, b),
    (o) => o.hp > 0 && o.hp < o.maxHp,
  );
}

function addMark(
  s: State,
  element: string,
  stacks: number,
  opts: { sealed?: boolean; fromTrail?: boolean; fizzle?: boolean; by?: Fighter } = {},
): void {
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
function heal(s: State, target: Fighter, amountBp: number, critOk = true, src?: Fighter): void {
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

/** What the boss's Mired takes off its damage and its dodge, in bp: per stack, more while a living creature has Clinging. */
function miredCut(s: State): number {
  if (s.mired === 0) return 0;
  const per =
    s.carries.has('clinging') && alive(s).some((f) => fx(f).clinging)
      ? R.miredClingingStackBp
      : R.miredPerStackBp;
  return s.mired * per;
}

/** Mired stacks (capped); Heavy Hand gives a chance of 1 extra stack each time. */
function addMired(s: State, by: Fighter): void {
  const extra = roll(s, fx(by).miredExtraBp ?? 0) ? 1 : 0;
  if (extra) bump(by, 'miredExtraBp');
  s.mired = Math.min(R.miredMaxStacks, s.mired + 1 + extra);
  if (s.opts.log) log(s, 'mired', `Mired x${s.mired}`);
}

// ---------- round start ----------

/**
 * Mired fades at the end of every second round; while a living creature has Clinging, only every third round
 * (Misa, 2026-10-28: one debuff creature must not hold it for the whole fight). Clinging also makes each stack
 * count for more (`miredCut`). Squelch Song alone builds stacks over a fight.
 */
function fadeMired(s: State): void {
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

function roundStart(s: State): void {
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
          o.boostBp += boost + kindred(o);
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
  const matched = Math.floor((atk * matchupBp(f.element, s.boss.element)) / 10_000);
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
        triggers(f.element, el) &&
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
    // The bonus factor (R7): the Knack's own factor, extra counts, Baked Shell; capped together.
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

function anchorOf(s: State, p: Pattern, exclude: readonly Fighter[] = []): Fighter | undefined {
  const live = exclude.length === 0 ? alive(s) : alive(s).filter((f) => !exclude.includes(f));
  if (live.length === 0) return undefined;
  // "Strongest" is the highest Attack; ties go to the front, then the left.
  const byStrength = (a: Fighter, b: Fighter) => b.atk - a.atk || bySlot(a, b);
  switch (p.anchor) {
    case 'front':
      return best(live, bySlot);
    case 'strongest':
      return best(live, byStrength);
    case 'payoff':
      return best(live, byStrength, (f) => f.role === 'payoff') ?? best(live, byStrength);
    case 'random':
      return live[int(s.opts.rng, live.length)];
    case 'back':
      // The back-most living creature (the highest row, then the leftmost).
      return best(live, (a, b) => b.row - a.row || a.col - b.col);
    case 'weakest':
      // The lowest share of its max HP; ties to the front, then the left.
      return best(live, (a, b) => a.hp * b.maxHp - b.hp * a.maxHp || bySlot(a, b));
    case 'grudge':
      // Last round's top hitter; in round 1, the strongest.
      return s.round === 1
        ? best(live, byStrength)
        : best(live, (a, b) => b.damageLastRound - a.damageLastRound || bySlot(a, b));
  }
}

/** Whether a pattern's targets are rolled: a random anchor, a scatter or a random row. */
const usesRoll = (p: Pattern): boolean =>
  p.shape === 'scatter' ||
  p.shape === 'randomRow' ||
  (!ANCHORLESS.has(p.shape) && p.anchor === 'random');

/** Shapes with no anchor: scatter, a random row, everything and the row ends. Taunt does not move them (R9). */
const ANCHORLESS: ReadonlySet<Pattern['shape']> = new Set([
  'scatter',
  'randomRow',
  'all',
  'rowEnds',
]);

/** The creatures a multi-anchor pattern aims at (its anchors), by the array `targetsOf` returned. */
const AIMED = new WeakMap<readonly Fighter[], ReadonlySet<Fighter>>();

/** A pattern's count `n` in this arena: fixed, or per `perColumns` columns of its width (at least 1). */
const countOf = (cols: number, n: number, perColumns: number | undefined): number =>
  perColumns ? Math.max(1, Math.round((n * cols) / perColumns)) : n;

/** The slots a pattern covers, as the living creatures standing in them (R2: targets are slots). */
function targetsOf(s: State, p0: Pattern, plain: boolean): readonly Fighter[] {
  const live = alive(s);
  // The escalation widens a pattern: more jumps, more shells, more neighbouring columns or rows.
  const g = grown(s);
  const cols = s.boss.cols;
  const n0 = (dflt: number) => countOf(cols, p0.n ?? dflt, p0.perColumns);
  const p: Pattern =
    p0.shape === 'chain'
      ? { ...p0, n: n0(1) + g.jumps }
      : p0.shape === 'scatter'
        ? { ...p0, n: n0(1) + g.targets }
        : p0.shape === 'columns' || p0.shape === 'rows'
          ? { ...p0, n: n0(2) + g.area }
          : p0.shape === 'rowEnds'
            ? { ...p0, n: n0(1) }
            : p0;
  // The shapes with no anchor never ask for one (they draw no random anchor, and Taunt does not move them).
  if (ANCHORLESS.has(p.shape)) {
    switch (p.shape) {
      case 'scatter': {
        // n different creatures, drawn one by one (a shell never lands twice on one creature).
        const rest = [...live];
        const out: Fighter[] = [];
        for (let i = 0; i < (p.n ?? 1) && rest.length > 0; i++)
          out.push(...rest.splice(int(s.opts.rng, rest.length), 1));
        return out;
      }
      case 'randomRow': {
        const rows = [...new Set(live.map((f) => f.row))];
        if (rows.length === 0) return [];
        const r = rows[int(s.opts.rng, rows.length)];
        return live.filter((f) => f.row === r);
      }
      case 'all':
        return live;
      default: {
        // Row ends: the first and last n slots of every row of the arena (an empty end slot is skipped, R21.1).
        const n = p.n ?? 1;
        return aliveBySlot(s).filter((f) => f.col < n || f.col >= cols - n);
      }
    }
  }
  // Taunt becomes the anchor of every plain attack that has an anchor, whatever its anchor (R9).
  const taunter = plain ? best(live, bySlot, (f) => !!fx(f).taunt) : undefined;
  // An aimed shape may have several anchors (`anchors`, per `perColumns` columns): each is the next best match.
  const count =
    p.anchors !== undefined && (p.shape === 'single' || p.shape === 'line3' || p.shape === 'cross')
      ? countOf(cols, p.anchors, p.perColumns)
      : 1;
  if (count > 1) {
    const used: Fighter[] = [];
    const out: Fighter[] = [];
    for (let i = 0; i < count; i++) {
      // R2.1 (panel 5): each further anchor is the best match not already inside the move's shape so far (an anchor that a
      // neighbour's line, cross or chain already covers would only bunch the hits up).
      const next = i === 0 ? (taunter ?? anchorOf(s, p)) : anchorOf(s, p, out);
      if (!next) break;
      used.push(next);
      for (const t of shapeAround(s, p, next)) if (!out.includes(t)) out.push(t);
    }
    AIMED.set(out, new Set(used));
    return out;
  }
  const a = taunter ?? anchorOf(s, p);
  if (!a) return [];
  return shapeAround(s, p, a);
}

/** The creatures a shape covers around one anchor (the shapes that start from an anchor). */
function shapeAround(s: State, p: Pattern, a: Fighter): readonly Fighter[] {
  const live = alive(s);
  const cols = s.boss.cols;
  switch (p.shape) {
    case 'chain': {
      // The anchor takes the aimed hit; each jump goes to the strongest creature not yet hit in a slot next to the last
      // one hit (beside it in its row, or in front of or behind it in its column; ties to the front, then the left).
      // Every jump is chosen now, before any hit lands: a dodge or an intercept does not change the path.
      const out = [a];
      for (let k = 0; k < (p.n ?? 1); k++) {
        const last = out[out.length - 1] as Fighter;
        const next = best(
          live,
          (x, y) => y.atk - x.atk || bySlot(x, y),
          (f) => !out.includes(f) && Math.abs(f.row - last.row) + Math.abs(f.col - last.col) === 1,
        );
        if (!next) break;
        out.push(next);
      }
      return out;
    }
    case 'columns': {
      // n neighbouring columns, the anchor's first (towards the right; the last columns shift left to fit).
      const n = p.n ?? 2;
      const from = Math.min(a.col, Math.max(0, cols - n));
      return live.filter((f) => f.col >= from && f.col < from + n);
    }
    case 'rows': {
      // n neighbouring rows, the anchor's first (towards the back; the last rows shift forward to fit).
      const n = p.n ?? 2;
      const from = Math.min(a.row, Math.max(0, s.boss.rows - n));
      return live.filter((f) => f.row >= from && f.row < from + n);
    }
    case 'cross':
      // The anchor first, then the creatures right beside it in its row and right in front of or behind it in its column.
      return [
        a,
        ...live.filter((f) => f !== a && Math.abs(f.row - a.row) + Math.abs(f.col - a.col) === 1),
      ];
    case 'checker':
      // Every other slot of the arena, the slots of the anchor's colour.
      return live.filter((f) => (f.row + f.col) % 2 === (a.row + a.col) % 2);
    case 'line3':
      // The anchor first: it takes the aimed hit, its neighbours the area hits (R2).
      return [a, ...live.filter((f) => f !== a && f.row === a.row && Math.abs(f.col - a.col) <= 1)];
    case 'row':
      return live.filter((f) => f.row === a.row);
    case 'column':
      return live.filter((f) => f.col === a.col);
    default:
      return [a];
  }
}

function dodgeOf(s: State, f: Fighter, area: boolean): number {
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
function gainSureCrit(s: State, f: Fighter, key: keyof KnackFx): void {
  if (f.sureCrits >= R.sureCritMax) return;
  f.sureCrits++;
  bump(f, key);
  if (s.opts.log) log(s, 'sure-crit', `${f.name} stores a Sure Crit (${f.sureCrits})`);
}

/**
 * How much of a boss crit's extra damage `taker` is spared (bp): its own Cool Head, or the largest one on a living creature
 * beside it (an aura: the largest applies, R15). Counted for the creature that gives it.
 */
function critWardOf(s: State, taker: Fighter): number {
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
const coverOf = (g: Fighter, who: Fighter): number =>
  R.coverBp + (fx(g).coverBonusBp ?? 0) + (fx(g).distanceCoverBp ?? 0) * Math.abs(g.col - who.col);

/**
 * Damage lands on a creature: every cut it gets for this hit multiplies together (an aura, its own area cut,
 * cover, Front-liner, Brace, Long Shadow's intercept cut), the total cut is capped at 75% and comes off
 * before armour; then armour, Blocked or HP (R13), then hit-taken effects. `target` is the slot the hit was
 * aimed at; when another creature took it (an intercept), the distance between them counts for Long Shadow.
 * `watch` is set when Night Watch took a Charged hit for `target`: it takes it with its own cover's cut.
 */
function takeHit(
  s: State,
  taker: Fighter,
  proposed: number,
  how: 'aimed' | 'area' | 'charged' | 'reflected',
  target: Fighter = taker,
  watch = false,
): void {
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
    // Auras of one kind: the largest applies. The creature's own cut is a cut of its own.
    left = cutOf(left, Math.max(ward, shelter));
    left = cutOf(left, k.areaCutBp ?? 0);
    // Cover: the Guard with the largest cover whose reach includes the taker, with every bonus. A hit a
    // Guard intercepts is not covered again, except Night Watch's: it takes the Charged hit with its own cover's cut.
    if (watch) {
      left = cutOf(left, coverOf(taker, target));
    } else if (taker.role !== 'guard') {
      const covering = best(
        alive(s),
        (a, b) => coverOf(b, taker) - coverOf(a, taker),
        (g) => g.role === 'guard' && !silenced(g) && inReach(s, g, taker),
      );
      if (covering) {
        if (fx(covering).distanceCoverBp) bump(covering, 'distanceCoverBp');
        if (fx(covering).flankGuard) bump(covering, 'flankGuard');
        left = cutOf(left, coverOf(covering, taker));
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
  // Mud Wall counts every hit it takes, Blocked or not.
  if (k.miresOnHit) addMired(s, taker);
  if (dmg <= 0) {
    s.count.blocked++;
    if (s.opts.log) log(s, 'blocked', `${taker.name} blocks the hit`);
    return;
  }
  if (dmg >= taker.hp && k.holdOn && !taker.holdOnDone) {
    // Stubborn, once per fight and (in a raid) once per weekend (panel 5): the hit leaves it at the lower of two fifths of
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
  // Hold the Line: the damage it takes from hits it intercepted builds a Sure Crit each time it adds up to a share of its Max HP.
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

/**
 * A counter that ignores armour (Retaliate, Shoulder Charge's strike-back). It is damage and can land the
 * killing blow, but it is not one of the creature's hits: no Cull, no "its hits" talent.
 */
function counter(s: State, f: Fighter, shareBp: number): void {
  // A counter is not a hit: no crit roll, no Sure Crit spent, no Steady Rhythm count, no Cull (R6, R21.7).
  const dmg = Math.floor((f.atk * shareBp) / 10_000);
  if (s.opts.log) log(s, 'counter', `${f.name} strikes back for ${dmg}`);
  hitBoss(s, f, dmg, false);
}

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

function bossTurn(s: State, turn: number): void {
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

/** One fight: the boss, the placed creatures, and the rounds of R8. */
export function fight(
  boss: BossDef,
  placements: readonly Placement[],
  opts: FightOptions,
): FightResult {
  const fighters = placeFighters(placements);
  if (opts.carryHp) for (const f of fighters) f.hp = opts.carryHp.get(f.uid) ?? f.hp;
  // Catch Breath is once per raid weekend: a creature that used it in an earlier stage does not have it again.
  for (const f of fighters) if (opts.carryWindDone?.has(f.uid)) f.secondWindDone = true;
  // So is Stubborn (panel 5: once per weekend, not per stage).
  for (const f of fighters) if (opts.carryHoldOnDone?.has(f.uid)) f.holdOnDone = true;
  const carried = opts.carryEscalation;
  const s: State = {
    boss,
    opts,
    fighters,
    bossHp: opts.bossHp ?? boss.hp,
    // A potential stage carried on from an earlier one starts at the real HP (below 1), not at the 1 the boss was held at.
    shadowHp: opts.potential ? (opts.shadowHp ?? opts.bossHp ?? boss.hp) : (opts.bossHp ?? boss.hp),
    marks: new Map(),
    markAge: 0,
    mired: 0,
    round: 0,
    turn: 0,
    bossTurnsDone: 0,
    // Reflective Hide arms after each boss turn, so not before the first one.
    reflectArmed: false,
    esc: {
      fed: 0,
      base: carried?.count ?? 0,
      step: carried?.step ?? 0,
      fall: carried?.fallStep ?? carried?.step ?? 0,
      count: carried?.count ?? 0,
      phase: carried?.phase ?? false,
      phaseNext: carried?.phaseNext ?? false,
    },
    announced: new Map(),
    events: [],
    killer: null,
    count: { reactions: 0, blocked: 0, dodges: 0, intercepts: 0, healed: 0, damage: 0 },
    byMark: {},
    carries: effectsCarried(fighters),
    live: null,
    liveBySlot: null,
    grownStep: -1,
    grownFall: -1,
    grownNow: null,
    phaseMoves: null,
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
      // Left to right: the living in slot order, this row's.
      for (const f of aliveBySlot(s).filter((x) => x.row === r)) creatureTurn(s, f);
      bossTurn(s, r);
    }
    fadeMired(s);
    // Shake It Off: announced at round start, the boss clears every debuff when its round ends.
    if (s.boss.mods.shakeEvery && s.round % s.boss.mods.shakeEvery === 0 && s.mired > 0) {
      // Shake It Off clears the card's strength's share of the Mired (all of it at full strength).
      s.mired -= Math.min(s.mired, Math.round((s.mired * strengthOf(s)) / 10_000));
      if (s.opts.log) log(s, 'shake', `${boss.name} shakes off its debuffs`);
      if (s.opts.log) log(s, 'mired', `Mired x${s.mired}`);
    }
  }
  return {
    damage: s.count.damage,
    bossHpLeft: s.bossHp,
    bossHpReal: s.shadowHp,
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
    escalation: escalationState(s),
    fighters,
    events: s.events,
  };
}

/** The element Element Resistance picks from the damage so far: the one alone on top; a tie for the most gives none. */
export function resistedElement(
  damageByElement: Readonly<Record<string, number>>,
): string | undefined {
  const sorted = Object.entries(damageByElement).sort((a, b) => b[1] - a[1]);
  const [top, second] = sorted;
  return top && top[1] > (second?.[1] ?? 0) ? top[0] : undefined;
}

/**
 * A raid weekend with attrition (R14): stages share the boss's HP; creatures keep their HP between
 * stages, nobody heals between them, and a knocked-out creature stays out (its owner may bring a
 * replacement from `bench`, which takes the empty slot). HP carries, and so do Catch Breath's and Stubborn's use (once per weekend) and
 * the boss's escalation (step, phase and count, R22); marks, Stores, Mired and "each fight" effects start fresh each
 * stage. From stage 2 an adapting boss resists the reaction used most so far (Adapts) or the element whose creatures'
 * hits (reactions included, counters not) dealt the most damage so far, chosen at the stage break; a tie for the most
 * gives no resistance (Element Resistance).
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
  // Carried state is keyed by the uids of the next stage's fighters (see below).
  let hp = new Map<string, number>();
  let windDone = new Set<string>();
  let holdDone = new Set<string>();
  let escalation: FightOptions['carryEscalation'];
  let bossHp = boss.hp;
  // Damage potential: the real HP (below 1) carries from stage to stage, while the boss is held at 1 HP.
  let shadowHp = boss.hp;
  let replacements = 0;
  const used: Record<string, number> = {};
  const dealt: Record<string, number> = {};
  const most = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1])[0]?.[0];
  for (let i = 0; i < (opts.stages ?? 3) && bossHp > 0; i++) {
    const resist = boss.mods.adapts && i > 0 ? most(used) : undefined;
    const resistEl = boss.mods.adaptsElement && i > 0 ? resistedElement(dealt) : undefined;
    const res = fight(boss, current, {
      ...opts,
      carryHp: hp,
      carryWindDone: windDone,
      carryHoldOnDone: holdDone,
      ...(escalation ? { carryEscalation: escalation } : {}),
      bossHp,
      shadowHp,
      ...(resist ? { resistReaction: resist } : {}),
      ...(resistEl ? { resistElement: resistEl } : {}),
    });
    stages.push(res);
    bossHp = res.bossHpLeft;
    shadowHp = res.bossHpReal;
    if (res.escalation)
      escalation = {
        step: res.escalation.step,
        fallStep: res.escalation.fallStep,
        phase: res.escalation.phase,
        phaseNext: res.escalation.phaseNext,
        count: res.escalation.count,
      };
    for (const [el, n] of Object.entries(res.reactionsByMark)) used[el] = (used[el] ?? 0) + n;
    for (const f of res.fighters) dealt[f.element] = (dealt[f.element] ?? 0) + f.hitDamage;
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
    const winds = new Set<string>();
    const holds = new Set<string>();
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
      if (prev?.secondWindDone) winds.add(nf.uid);
      if (prev?.holdOnDone) holds.add(nf.uid);
    });
    hp = carried;
    windDone = winds;
    holdDone = holds;
    current = next;
  }
  return { stages, won: bossHp <= 0, replacements };
}

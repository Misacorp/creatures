/**
 * The state of one combat v2 fight and the small helpers every rule module shares (docs/design/combat/proposals/001-combat-v2.md;
 * docs/design/combat/engine-port.md, slice 2): the `Context` of rules and chart, the `State` that `fight.ts` builds and the other
 * modules read and change, the living-fighter caches, the dice (`roll`), the log, the effects a creature has now (`fx`, silence R12)
 * and the strength of the boss's cards (R13). No rule of its own beyond those.
 */
import { chance, type Rng } from '@creatures/game';
import type { KnackFx } from './effects';
import type {
  BoardEvent,
  BossDef,
  BossMove,
  ChartPair,
  FightEvent,
  FightInputV2,
  FinaleAction,
  FightOptions,
  Fighter,
  KillingBlow,
  V2Rules,
} from './types';
import { FULL_STRENGTH_BP } from './types';

/** `fn` of two element ids, worked out once per pair (the element chart is a list that is searched each time). */
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

/** What a fight reads of the input besides its creatures and boss: the rules numbers and the element chart (see `contextOf`). */
export interface Context {
  readonly rules: V2Rules;
  /** Every element id, in the order the chart's content lists them (the order matters where a rule takes the first match). */
  readonly elements: readonly string[];
  /** The element chart multiplier (bp) of an attacker against a defender's element; 10000 when the chart has no pair. */
  readonly matchup: (attacker: string, defender: string) => number;
  /** True when an attacker of `attacker` cashes a mark of `mark` (the chart's strong pairs, 15000 bp). */
  readonly triggers: (attacker: string, mark: string) => boolean;
}

/** The pair memos of one chart, worked out once per chart array (a lab run plays the same chart a million times). */
const CHART_MEMOS = new WeakMap<readonly ChartPair[], Pick<Context, 'matchup' | 'triggers'>>();

function chartMemos(chart: readonly ChartPair[]): Pick<Context, 'matchup' | 'triggers'> {
  let memos = CHART_MEMOS.get(chart);
  if (!memos) {
    memos = {
      matchup: pairMemo(
        (a, d) => chart.find((p) => p.attacker === a && p.defender === d)?.bp ?? 10_000,
      ),
      triggers: pairMemo((a, m) =>
        chart.some((p) => p.attacker === a && p.defender === m && p.bp === 15_000),
      ),
    };
    CHART_MEMOS.set(chart, memos);
  }
  return memos;
}

/** The context of an input's rules, element order and chart. */
export function contextOf(input: Pick<FightInputV2, 'rules' | 'elements' | 'chart'>): Context {
  return { rules: input.rules, elements: input.elements, ...chartMemos(input.chart) };
}

export interface Mark {
  stacks: number;
  age: number;
  sealed: boolean;
  /** Left by Leave a Trail: a reaction on it leaves no further trail (the chain cap, R5). */
  fromTrail: boolean;
  /** The boss turns done when a count was last added: "set this boss turn" means equal to now (Quick Draw). */
  turnSet: number;
  /** Creatures that left a count on it (Potent Mark). */
  owners: Set<string>;
}

export interface State {
  /** The rules numbers, the element order and the chart's pair memos (`contextOf`). */
  readonly ctx: Context;
  /** The fight's dice. */
  readonly rng: Rng;
  readonly boss: BossDef;
  readonly opts: FightOptions;
  /** The live finale's inputs (R18); none in most fights. */
  readonly actions: readonly FinaleAction[];
  /** This round's effect of them, set at round start (`applyActions`): a Rally, the rows with a Shield Wall (or null), a Purge. */
  rally: boolean;
  shieldRows: ReadonlySet<number> | null;
  purged: boolean;
  readonly fighters: Fighter[];
  bossHp: number;
  /**
   * The boss's real HP in potential mode (`FightOptions.potential`): it keeps falling below 1 (and below 0) while `bossHp` stays
   * at 1, and every "boss below a share of its HP" rule (Finisher, Culling Strike, the escalation's HP feed) reads it. Otherwise equal to `bossHp`.
   */
  shadowHp: number;
  marks: Map<string, Mark>;
  markAge: number;
  boggedDown: number;
  round: number;
  turn: number;
  bossTurnsDone: number;
  /** Fizzle: the boss is immune to reactions from the turn it fires until its next boss turn begins. */
  fizzled: boolean;
  reflectArmed: boolean;
  /**
   * The boss's escalation (its Store, R22): units fed by events this stage, the units carried from earlier stages, the
   * step applied, the count read at the last round start and whether its phase change has applied.
   */
  esc: {
    fed: number;
    base: number;
    /** Steps applied: the escalation's growth that helps the boss, which Bogged Down slows (R22.3). */
    step: number;
    /** Steps applied to the growth that helps the players (a falling armour): the same rule without Bogged Down's slowing (R22.3). */
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
export interface Grown {
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

/** `carriedBy` for each merged effects object a fight has met, worked out once (a resolver that shares one object between creatures of one build makes this a lookup). */
const CARRIED = new WeakMap<KnackFx, readonly (keyof KnackFx)[]>();

/** The effects that any of `fighters` carries. */
export function effectsCarried(fighters: readonly Fighter[]): ReadonlySet<keyof KnackFx> {
  const out = new Set<keyof KnackFx>();
  for (const f of fighters) {
    let keys = CARRIED.get(f.fxAll);
    if (!keys) CARRIED.set(f.fxAll, (keys = carriedBy(f.fxAll)));
    for (const key of keys) out.add(key);
  }
  return out;
}

/**
 * What a creature's effects are now: all of them, or while it is silenced only its talents' plain stat lines (R12, amended in
 * panel 6: Attack, Max HP, Armour, Speed, crit chance and crit damage survive; effect lines and the Knack, its stat bonuses
 * included, are blanked).
 */
export const fx = (f: Fighter): KnackFx => (f.silencedTurns > 0 ? f.fxStat : f.fxAll);
/** Silence blanks the creature: its Knack and its role's verb (Misa, 2026-10-26). Stat lines of talents and the species' stats still work. */
export const silenced = (f: Fighter) => f.silencedTurns > 0;
export const ownArmour = (f: Fighter) => f.baseArmour + (fx(f).armourBonus ?? 0);
/** The living fighters, in placement order. */
export const alive = (s: State): readonly Fighter[] =>
  (s.live ??= s.fighters.filter((f) => f.hp > 0));
export const bySlot = (a: Fighter, b: Fighter) => a.row - b.row || a.col - b.col;
/** The living fighters from the front row, left to right (ties keep placement order, as a stable sort does). */
export const aliveBySlot = (s: State): readonly Fighter[] =>
  (s.liveBySlot ??= [...alive(s)].sort(bySlot));
/**
 * The first of `xs` that no other beats under `cmp` (negative: the first argument goes first), among those `keep` allows:
 * what `[...xs].filter(keep).sort(cmp)[0]` gives (a stable sort keeps the earlier of equals), without the copies.
 */
export function best<T>(
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
export const roll = (s: State, bp: number) => bp > 0 && chance(s.rng, Math.min(bp, 10_000), 10_000);
/** Counts that an effect's condition held or its trigger fired (the report's "holds"). */
export const bump = (f: Fighter, key: keyof KnackFx) => {
  f.fires[key] = (f.fires[key] ?? 0) + 1;
};
/**
 * Whether the gear trigger `key` of `f` may fire in `unit` (a round number, or a boss turn number plus one): at most once a unit, so an
 * effect that fires outside the creature's own turn cannot pile up. Marks the unit used when it answers yes.
 */
export const onceIn = (f: Fighter, key: keyof KnackFx, unit: number): boolean => {
  if (f.gearUnit[key] === unit) return false;
  f.gearUnit[key] = unit;
  return true;
};
export const log = (s: State, kind: string, text: string, extra: Partial<FightEvent> = {}) => {
  if (s.opts.log) s.events.push({ round: s.round, turn: s.turn, kind, text, ...extra });
};

/** A board event with no text line of its own (see `BoardEvent`). Callers build the event only when the fight logs. */
export const emit = (s: State, event: BoardEvent) => {
  if (s.opts.log)
    s.events.push({ round: s.round, turn: s.turn, kind: 'board', text: '', board: event });
};

/** The name the board uses for a creature: its stable key, else its uid. */
export const keyOf = (f: Pick<Fighter, 'key' | 'uid'>): string => f.key ?? f.uid;

/**
 * The live finale's inputs that apply to this round (R18): a Rally or a Shield Wall of this round, a Purge of this round or the
 * `purgeRounds - 1` before it. Called at every round start; with no actions it leaves the defaults.
 */
export function applyActions(s: State): void {
  const R = s.ctx.rules;
  let rally = false;
  let purged = false;
  let rows: Set<number> | null = null;
  for (const a of s.actions) {
    if (a.kind === 'purge') {
      if (a.round <= s.round && s.round < a.round + R.purgeRounds) purged = true;
    } else if (a.round === s.round) {
      if (a.kind === 'rally') rally = true;
      else if (a.row !== undefined) (rows ??= new Set<number>()).add(a.row);
    }
    if (s.opts.log && a.round === s.round)
      emit(s, {
        type: 'action',
        kind: a.kind,
        ...(a.row === undefined ? {} : { row: a.row }),
        by: a.by,
      });
  }
  s.rally = rally;
  s.shieldRows = rows;
  s.purged = purged;
}

/** `o`'s next hit gets `bp` more (inside the hit-bonus cap), given by `by` (`o` itself for a self boost); the board is told. */
export const boostNext = (s: State, o: Fighter, by: Fighter, bp: number): void => {
  o.boostBp += bp;
  if (s.opts.log && bp > 0) emit(s, { type: 'boost', who: keyOf(o), by: keyOf(by), bp });
};

/** A creature's Store set to `value`, shown on the board when it changed. */
export const setStore = (s: State, f: Fighter, value: number) => {
  if (f.store === value) return;
  f.store = value;
  if (s.opts.log) emit(s, { type: 'store', who: keyOf(f), value });
};

/** The strength of the boss's cards and gates (bp; 10000 is the full card). */
export const strengthOf = (s: State): number => s.boss.strengthBp ?? FULL_STRENGTH_BP;

/** A chance of `st` bp that draws nothing at full strength (so a full-strength boss keeps its seeded results). */
export const strong = (s: State, st: number): boolean => st >= FULL_STRENGTH_BP || roll(s, st);

/** The most hurt of these (lowest share of max HP, ties to the front then the left); none if all are at full HP. */
export function mostHurt(xs: readonly Fighter[]): Fighter | undefined {
  return best(
    xs,
    (a, b) => a.hp * b.maxHp - b.hp * a.maxHp || bySlot(a, b),
    (o) => o.hp > 0 && o.hp < o.maxHp,
  );
}

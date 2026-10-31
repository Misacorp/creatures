/**
 * Shared builders for the combat v2 rule tests (`v2-*.test.ts`). A test builds its creatures and its boss by hand and names the
 * effects directly (`fx: { dodgeCritBp: 10_000 }`, never "the Knack that has it"), so a rule is proven without the catalogue. The rules
 * numbers are passed explicitly (`RULES`, copied from the lab's starting numbers) and the element chart is the shipped one.
 * Not a test file (no `.test.ts` suffix), so vitest does not run it.
 */
import { content, createSeededRng } from '@creatures/game';
import {
  fightV2,
  mergeFx,
  weekendV2,
  type BossDef,
  type BossMove,
  type FightEvent,
  type FightInputV2,
  type FightOptions,
  type FightResult,
  type FighterSpec,
  type KnackFx,
  type Pattern,
  type V2Rules,
  type WeekendFighterSpec,
  type WeekendInputV2,
  type WeekendResult,
} from '@creatures/engine/v2';

/** The numbers of the rules, written out (the lab's `LAB_RULES`): an input carries its own rules, and a test may change one. */
export const RULES: V2Rules = {
  payoffMultBp: 20_000,
  extraStackBp: 5_000,
  maxBonusFactorBp: 30_000,
  maxStacks: 3,
  dodgePerSpdBp: 10,
  dodgeMaxBp: 5_000,
  areaDodgeShareBp: 5_000,
  critChanceBp: 500,
  critBp: 20_000,
  healCritBp: 15_000,
  sureCritMax: 3,
  guardSureCritShareBp: 2_500,
  coverBp: 4_000,
  cutMaxBp: 7_500,
  guardReach: 1,
  supportBoostBp: 1_500,
  supportBoostEmberBp: 2_500,
  supportHealBp: { tide: 400, grove: 600 },
  maxHitBonusBp: 15_000,
  flankGuardSlots: 2,
  opportunistFromStacks: 2,
  miredPerStackBp: 150,
  miredClingingStackBp: 225,
  miredMaxStacks: 5,
  miredFadeEvery: 2,
  miredClingingFadeEvery: 3,
  holdOnLeaveBp: 4_000,
  adaptElementBp: 7_500,
  miredSlowsEscalationBp: 2_500,
  finisherBelowBp: 3_333,
};

/** The shipped elements and chart (tide cashes ember, ember grove, grove spark, spark tide, mire ember, ember mire). */
export const ELEMENTS: readonly string[] = content.elements.map((e) => e.id);
export const CHART = content.elementChart;

// ---------- dice ----------

/** A roll of `0` passes any chance above 0; `NO` (9999 of 10000) fails any chance below 100%. */
export const YES = 0;
export const NO = 9_999;

/**
 * An RNG that hands out `values` in order (then `NO`), counting the draws: `int(rng, 10000)` is the value itself, and `int(rng, n)` is
 * the value modulo `n` (so a pick among `n` creatures is `value % n`). With no values it never lets a chance below 100% happen.
 */
export function scripted(values: readonly number[] = []) {
  let n = 0;
  return { rng: { nextU32: () => values[n++] ?? NO }, draws: () => n };
}

export const seeded = (seed: string) => createSeededRng(seed);

// ---------- creatures ----------

export interface SpecOver extends Partial<Omit<FighterSpec, 'fxAll' | 'fxStat'>> {
  /** Every effect the creature carries (its Knack's and talents' together, merged). */
  readonly fx?: KnackFx;
  /** The plain stat lines among them (what silence leaves): they are added to `fx` as well. */
  readonly stat?: KnackFx;
}

/**
 * A creature, resolved, at slot (`row`, `col`). Defaults: a tide Setter with 400 HP, 100 Attack, no Speed, no armour and no crit
 * stats; `uid` and `formId` follow `name`. `fx` is every effect it carries, `stat` the stat lines that survive silence.
 */
export function spec(over: SpecOver = {}): FighterSpec {
  const { fx = {}, stat = {}, ...rest } = over;
  const name = rest.name ?? 'A';
  return {
    uid: name,
    owner: 'p1',
    formId: name.toLowerCase(),
    name,
    element: 'tide',
    role: 'setter',
    maxHp: 400,
    atk: 100,
    spd: 0,
    baseArmour: 0,
    critChanceBp: 0,
    critDamageBp: 0,
    talents: [],
    triageIdle: false,
    row: 0,
    col: 0,
    ...rest,
    fxAll: mergeFx([fx, stat]),
    fxStat: stat,
  };
}

/** A raid weekend's team member: a spec without its uid. */
export function member(over: SpecOver = {}): WeekendFighterSpec {
  const withoutUid = Object.entries(spec(over)).filter(([key]) => key !== 'uid');
  return Object.fromEntries(withoutUid) as unknown as WeekendFighterSpec;
}

// ---------- the boss ----------

export interface BossOver extends Partial<Omit<BossDef, 'plain' | 'mods'>> {
  /** The plain attack's pattern, power and number of hits (default: none at all, so the boss does only what the test says). */
  readonly plain?: BossDef['plain'];
  readonly mods?: BossDef['mods'];
}

/**
 * A boss that does only what a test asks: a neutral element (no matchups), no armour, no Speed, an Attack of 1, one round, and a
 * plain attack that never happens. `hp` is huge so damage tests are not cut by its HP.
 */
export function boss(over: BossOver = {}): BossDef {
  return {
    id: 'golem',
    name: 'Golem',
    element: 'neutral',
    hp: 1_000_000,
    atk: 1,
    armour: 0,
    spd: 0,
    rounds: 1,
    rows: 1,
    cols: 1,
    plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 0, hits: 0 },
    moves: [],
    cards: [],
    mods: {},
    ...over,
  };
}

/** A boss whose plain attack hits `hits` times (default 1) with a `pattern` at `powerBp`. */
export const striker = (
  over: BossOver = {},
  pattern: Pattern = { anchor: 'front', shape: 'single' },
  hits = 1,
  powerBp = 10_000,
): BossDef => boss({ ...over, plain: { pattern, powerBp, hits } });

/** A move due every round on boss turn `turn` (default 0). */
export function move(pattern: Pattern, over: Partial<BossMove> = {}): BossMove {
  return { id: 'm', name: 'Move', pattern, powerBp: 10_000, every: 1, turn: 0, ...over };
}

/** A boss with one move (and no plain attack) in an arena of `rows` x `cols`. */
export function mover(
  pattern: Pattern,
  rows: number,
  cols: number,
  over: BossOver = {},
  m: Partial<BossMove> = {},
): BossDef {
  return boss({ rows, cols, moves: [move(pattern, m)], ...over });
}

/** A move that silences every creature it reaches for `turns` of their turns (at the start of boss turn `turn`). */
export const hush = (
  shape: Pattern['shape'] = 'all',
  turns = 9,
  turn = 0,
  over: Partial<BossMove> = {},
): BossMove => ({
  id: 'hush',
  name: 'Hush',
  pattern: { anchor: 'front', shape },
  powerBp: 0,
  every: 1,
  turn,
  silenceTurns: turns,
  ...over,
});

// ---------- playing ----------

/** A whole fight input: the shipped chart, the rules above, a log, and any part overridden. */
export function input(
  b: BossDef,
  fighters: readonly FighterSpec[],
  options: FightOptions = {},
  over: Partial<FightInputV2> = {},
): FightInputV2 {
  return {
    version: 2,
    rules: RULES,
    elements: ELEMENTS,
    chart: CHART,
    boss: b,
    fighters,
    options: { log: true, ...options },
    ...over,
  };
}

/** Play a fight. The dice default to `scripted()`: no chance below 100% ever happens, so a test sees only the effects it set up. */
export function play(
  b: BossDef,
  fighters: readonly FighterSpec[],
  options: FightOptions = {},
  rng: { nextU32(): number } = scripted().rng,
  over: Partial<FightInputV2> = {},
): FightResult {
  return fightV2(input(b, fighters, options, over), rng);
}

/** Play with scripted dice and report how many were drawn. */
export function playScripted(
  b: BossDef,
  fighters: readonly FighterSpec[],
  values: readonly number[],
  options: FightOptions = {},
  over: Partial<FightInputV2> = {},
) {
  const s = scripted(values);
  const res = play(b, fighters, options, s.rng, over);
  return { res, draws: s.draws() };
}

/** A raid weekend of a hand-built team and bench. */
export function playWeekend(
  b: BossDef,
  team: readonly WeekendFighterSpec[],
  bench: readonly WeekendFighterSpec[],
  options: FightOptions & { readonly stages?: number } = {},
  rng: { nextU32(): number } = scripted().rng,
  over: Partial<WeekendInputV2> = {},
): WeekendResult {
  return weekendV2(
    {
      version: 2,
      rules: RULES,
      elements: ELEMENTS,
      chart: CHART,
      boss: b,
      team,
      bench,
      options: { log: true, ...options },
      ...over,
    },
    rng,
  );
}

// ---------- reading the log ----------

/** How many events of `kind` (whose text starts with `from`, if given). */
export const count = (res: FightResult, kind: string, from?: string): number =>
  res.events.filter((e) => e.kind === kind && (from === undefined || e.text.startsWith(from)))
    .length;

/** The texts of the events of `kind`, in order. */
export const texts = (res: FightResult, kind: string): string[] =>
  res.events.filter((e) => e.kind === kind).map((e) => e.text);

/** The marks the fight left, in order ("tide x1"). */
export const marks = (res: FightResult): string[] => texts(res, 'mark');

/** The Mired stack counts the fight went through ("Mired x1"). */
export const mired = (res: FightResult): string[] => texts(res, 'mired');

/** What each hit on `name` did (the "takes N" lines), in order. */
export const takes = (res: FightResult, name: string): number[] =>
  res.events
    .filter((e) => e.kind === 'hit' && e.text.startsWith(`${name} takes `))
    .map((e) => Number(e.text.split(' ')[2]));

/** The slots ("row,col", 0-based) the move or plain attack `id` was aimed at, in order. */
export const slotsHit = (res: FightResult, id: string): string[] =>
  res.events
    .filter((e) => e.kind === 'target' && new RegExp(`(<-|of) ${id}$`).test(e.text))
    .map((e) => {
      const m = /\(row (\d+), slot (\d+)\)/.exec(e.text);
      return `${Number(m?.[1]) - 1},${Number(m?.[2]) - 1}`;
    });

/** The names of the creatures a move or the plain attack was aimed at, in order. */
export const aimedAt = (res: FightResult, id: string): string[] =>
  res.events
    .filter((e) => e.kind === 'target' && new RegExp(`<- ${id}$`).test(e.text))
    .map((e) => e.text.split(' (row')[0] as string);

/** The fighter named `name` after the fight. */
export function by(res: FightResult, name: string) {
  const f = res.fighters.find((x) => x.name === name);
  if (!f) throw new Error(`no fighter ${name}`);
  return f;
}

export const kinds = (events: readonly FightEvent[]): string[] => events.map((e) => e.kind);

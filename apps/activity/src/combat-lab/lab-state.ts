import { createSeededRng } from '@creatures/game';
import {
  CARDS,
  FORM_KNACKS,
  SCENARIOS,
  fight,
  formStats,
  labBoss,
  type BossDef,
  type FightEvent,
  type FightResult,
  type Placement,
} from '@creatures/lab';

/**
 * The combat lab's setup (`CombatLab.tsx`): the arena, the boss, the rule cards and the creatures on
 * the board. Pure data and functions, no DOM. The address holds the setup as `#s=<base64url of JSON>`;
 * `decodeSetup` never throws: whatever is wrong in an address is dropped or clamped.
 */

export const MIN_ROWS = 1;
export const MAX_ROWS = 4;
export const MIN_COLS = 1;
export const MAX_COLS = 5;
export const MIN_ROUNDS = 1;
export const MAX_ROUNDS = 20;
export const MIN_ATK = 50;
export const MAX_ATK = 400;
export const MIN_HP = 1;
export const MAX_HP = 1_000_000;
export const MIN_LEVEL = 1;
export const MAX_LEVEL = 30;
export const DEFAULT_LEVEL = 25;
/** What "damage test" gives the boss: so much HP that it never falls, and the damage is the score. */
export const DAMAGE_TEST_HP = 1_000_000;
/** The boss HP to start from when the damage test is switched off. */
export const DEFAULT_WINNABLE_HP = 4_000;
/** The Knack choice that means "no Knack" (the engine's word for it). */
export const NO_KNACK = 'none';
const MAX_ADDRESS = 4000;

/** One slot of the board. `formId` is null for an empty slot. */
export interface Cell {
  formId: string | null;
  /** A Knack id the form can equip, or `none`. */
  knack: string;
  level: number;
}

export interface Setup {
  rows: number;
  cols: number;
  rounds: number;
  atk: number;
  /** True: the boss has `DAMAGE_TEST_HP`. False: it has `hp`. */
  damageTest: boolean;
  hp: number;
  /** Rule card ids, in the order of `CARDS`. */
  cards: string[];
  /** `MAX_ROWS * MAX_COLS` cells, index `row * MAX_COLS + col`; only the first `rows` x `cols` are in play. */
  cells: Cell[];
}

/** The rule cards a player can switch on: not the "no card" baseline, and not Adapts (raid weekends only). */
export const CARD_CHOICES = CARDS.filter((c) => c.id !== 'plain' && !c.raidOnly);

/** Every form the lab can place, in the lab's own order. */
export const FORM_IDS: readonly string[] = Object.keys(FORM_KNACKS);

export function formName(formId: string): string {
  return formStats(formId, 1).name;
}

const emptyCell = (): Cell => ({ formId: null, knack: NO_KNACK, level: DEFAULT_LEVEL });

export const cellIndex = (row: number, col: number): number => row * MAX_COLS + col;

/** A whole number from anything, clamped; `fallback` when it is not a finite number. */
export function clampInt(value: unknown, lo: number, hi: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(value)));
}

/** The Knacks a form can equip (a form the lab does not know has none). */
export function knacksOf(formId: string | null): readonly string[] {
  return formId === null ? [] : (FORM_KNACKS[formId] ?? []);
}

/** A cell with an unknown form emptied, a Knack the form cannot equip dropped, and the level clamped. */
export function cleanCell(raw: unknown): Cell {
  if (typeof raw !== 'object' || raw === null) return emptyCell();
  const r = raw as Record<string, unknown>;
  const formId =
    typeof r['formId'] === 'string' && FORM_IDS.includes(r['formId']) ? r['formId'] : null;
  if (formId === null) return emptyCell();
  const knack =
    typeof r['knack'] === 'string' && knacksOf(formId).includes(r['knack']) ? r['knack'] : NO_KNACK;
  return { formId, knack, level: clampInt(r['level'], MIN_LEVEL, MAX_LEVEL, DEFAULT_LEVEL) };
}

function blankCells(): Cell[] {
  return Array.from({ length: MAX_ROWS * MAX_COLS }, emptyCell);
}

function pairCell(pair: string): Cell {
  const [formId = '', knack = NO_KNACK] = pair.split('/');
  return cleanCell({ formId, knack, level: DEFAULT_LEVEL });
}

const CLASSIC = 'tidewing/steady-mark tempestray/detonate thornbuck/wide-reach';

export const RAID_PRESET = 'Raid: four classic trios';

/** The preset names, in the order shown: the lab's scenarios, then the raid. */
export const PRESET_NAMES: readonly string[] = [...Object.keys(SCENARIOS), RAID_PRESET];

/** A board with one row of `form/knack` pairs at level 25. */
function lineBoard(spec: string): { cells: Cell[]; cols: number } {
  const cells = blankCells();
  const pairs = spec.split(' ').filter((p) => p !== '');
  pairs.slice(0, MAX_COLS).forEach((pair, i) => {
    cells[cellIndex(0, i)] = pairCell(pair);
  });
  return { cells, cols: Math.min(MAX_COLS, Math.max(MIN_COLS, pairs.length)) };
}

export function defaultSetup(): Setup {
  const { cells, cols } = lineBoard(CLASSIC);
  return {
    rows: 1,
    cols,
    rounds: 10,
    atk: 110,
    damageTest: true,
    hp: DEFAULT_WINNABLE_HP,
    cards: [],
    cells,
  };
}

/** The setup after choosing a preset: its board, rows and columns. The boss settings stay as they were. */
export function applyPreset(setup: Setup, name: string): Setup {
  if (name === RAID_PRESET) {
    const cells = blankCells();
    const trio = CLASSIC.split(' ');
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 4; c++) cells[cellIndex(r, c)] = pairCell(trio[(r * 4 + c) % 3] ?? '');
    return { ...setup, rows: 3, cols: 4, cells };
  }
  const spec = SCENARIOS[name];
  if (spec === undefined) return setup;
  const { cells, cols } = lineBoard(spec);
  return { ...setup, rows: 1, cols, cells };
}

function toBase64Url(text: string): string {
  let binary = '';
  for (const b of new TextEncoder().encode(text)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): string | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(binary, (ch) => ch.charCodeAt(0)),
    );
  } catch {
    return null;
  }
}

/** The address hash for a setup: `#s=...`. Only the slots in play are written. */
export function encodeSetup(setup: Setup): string {
  const grid: [string, string, number][] = [];
  for (let r = 0; r < setup.rows; r++)
    for (let c = 0; c < setup.cols; c++) {
      const cell = setup.cells[cellIndex(r, c)] ?? emptyCell();
      grid.push([cell.formId ?? '', cell.knack, cell.level]);
    }
  const json = JSON.stringify({
    r: setup.rows,
    c: setup.cols,
    n: setup.rounds,
    a: setup.atk,
    h: setup.damageTest ? 0 : setup.hp,
    k: setup.cards,
    g: grid,
  });
  return `#s=${toBase64Url(json)}`;
}

/** Reads `#s=...`. Anything missing, too long or broken gives the default setup; bad parts are dropped or clamped. */
export function decodeSetup(hash: string): Setup {
  const base = defaultSetup();
  const text = hash.startsWith('#') ? hash.slice(1) : hash;
  if (text.length > MAX_ADDRESS) return base;
  const param = new URLSearchParams(text).get('s');
  const json = param === null ? null : fromBase64Url(param);
  if (json === null) return base;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return base;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return base;
  const p = parsed as Record<string, unknown>;
  const rows = clampInt(p['r'], MIN_ROWS, MAX_ROWS, base.rows);
  const cols = clampInt(p['c'], MIN_COLS, MAX_COLS, base.cols);
  const grid = Array.isArray(p['g']) ? (p['g'] as unknown[]) : [];
  const cells = blankCells();
  for (let i = 0; i < rows * cols; i++) {
    const raw: unknown = grid[i];
    if (!Array.isArray(raw)) continue;
    const g = raw as unknown[];
    cells[cellIndex(Math.floor(i / cols), i % cols)] = cleanCell({
      formId: g[0],
      knack: g[1],
      level: g[2],
    });
  }
  const wanted: unknown[] = Array.isArray(p['k']) ? (p['k'] as unknown[]) : [];
  const hp = p['h'];
  return {
    rows,
    cols,
    rounds: clampInt(p['n'], MIN_ROUNDS, MAX_ROUNDS, base.rounds),
    atk: clampInt(p['a'], MIN_ATK, MAX_ATK, base.atk),
    damageTest: typeof hp !== 'number' || hp <= 0,
    hp: clampInt(hp, MIN_HP, MAX_HP, base.hp),
    cards: CARD_CHOICES.filter((c) => wanted.includes(c.id)).map((c) => c.id),
    cells,
  };
}

/** The boss of a setup. */
export function bossOf(setup: Setup): BossDef {
  return labBoss({
    rows: setup.rows,
    cols: setup.cols,
    cards: setup.cards,
    atk: setup.atk,
    hp: setup.damageTest ? DAMAGE_TEST_HP : setup.hp,
    rounds: setup.rounds,
  });
}

/** The creatures on the board, row by row. A raid (more than one row) gives each column its own player. */
export function placementsOf(setup: Setup): Placement[] {
  const out: Placement[] = [];
  for (let row = 0; row < setup.rows; row++)
    for (let col = 0; col < setup.cols; col++) {
      const cell = setup.cells[cellIndex(row, col)];
      if (cell === undefined || cell.formId === null) continue;
      out.push({
        owner: setup.rows > 1 ? `p${String(col + 1)}` : 'p1',
        formId: cell.formId,
        level: cell.level,
        knack: cell.knack,
        row,
        col,
      });
    }
  return out;
}

/** The highest level a form reaches in the lab (stage 1 forms stop early). */
export function levelCapOf(formId: string): number {
  return formStats(formId, MAX_LEVEL).levelCap;
}

/** One fight of a setup, with its step log, from a seed text. */
export function runFight(setup: Setup, seed: string): FightResult {
  return fight(bossOf(setup), placementsOf(setup), { rng: createSeededRng(seed), log: true });
}

/** How many seeds "Run 100 seeds" plays. */
export const MANY = 100;

export interface ManyStats {
  fights: number;
  meanDamage: number;
  lowestDamage: number;
  highestDamage: number;
  /** Share of fights the boss fell in, 0 to 1. */
  winShare: number;
  meanKnockouts: number;
  meanReactions: number;
}

/** The same setup on seeds `<seed>:0` to `<seed>:99` (no step logs), and the numbers that matter. */
export function runMany(setup: Setup, seed: string): ManyStats {
  const boss = bossOf(setup);
  const placements = placementsOf(setup);
  let damage = 0;
  let lowest = Infinity;
  let highest = -Infinity;
  let wins = 0;
  let knockouts = 0;
  let reactions = 0;
  for (let i = 0; i < MANY; i++) {
    const r = fight(boss, placements, { rng: createSeededRng(`${seed}:${String(i)}`) });
    damage += r.damage;
    lowest = Math.min(lowest, r.damage);
    highest = Math.max(highest, r.damage);
    if (r.won) wins++;
    knockouts += r.knockouts;
    reactions += r.reactions;
  }
  return {
    fights: MANY,
    meanDamage: damage / MANY,
    lowestDamage: lowest,
    highestDamage: highest,
    winShare: wins / MANY,
    meanKnockouts: knockouts / MANY,
    meanReactions: reactions / MANY,
  };
}

/** The step log of a round, in the order of play: row N acts, then the boss's turn N. */
export interface StepGroup {
  /** The arena row (0-based) whose creatures act, and whose boss turn follows. */
  row: number;
  events: FightEvent[];
}

export interface RoundSteps {
  round: number;
  groups: StepGroup[];
}

/**
 * The log of one fight, by round and then by row: each group is one row's turns and the boss's turn
 * after it (the lab tags every event with that row's number, `turn`; round-start events are row 0).
 */
export function groupSteps(events: readonly FightEvent[]): RoundSteps[] {
  const rounds: RoundSteps[] = [];
  for (const event of events) {
    let round = rounds[rounds.length - 1];
    if (round === undefined || round.round !== event.round) {
      round = { round: event.round, groups: [] };
      rounds.push(round);
    }
    let group = round.groups[round.groups.length - 1];
    if (group === undefined || group.row !== event.turn) {
      group = { row: event.turn, events: [] };
      round.groups.push(group);
    }
    group.events.push(event);
  }
  return rounds;
}

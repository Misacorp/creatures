/**
 * The board: slots, reach and patterns (R2 targets are slots, R8 the pattern shapes, R9 Taunt, R1.3 and R2.1 reach and anchors). Who
 * stands beside whom, what a Guard reaches, which creatures a boss move aims at and the shapes it covers.
 */
import { int } from '@creatures/game';
import * as escalationMod from './escalation';
import * as stateMod from './state';
import type { State } from './state';
import type { Fighter, Pattern } from './types';

// Bound once: a named import is read through a getter on every call under the lab's Vite loader, which costs 15% of a report.
const { grown } = escalationMod;
const { alive, aliveBySlot, best, bySlot, fx } = stateMod;

/** Creatures beside `f` in its row, within `reach` columns, living (`reach` 1 is {Beside}). */
export function beside(s: State, f: Fighter, reach = 1): Fighter[] {
  const out: Fighter[] = [];
  for (const o of alive(s))
    if (o !== f && o.row === f.row && Math.abs(o.col - f.col) <= reach) out.push(o);
  return out;
}

const reachOf = (s: State, g: Fighter) => s.ctx.rules.guardReach + (fx(g).reachBonus ?? 0);

/**
 * Whether `o` is in `g`'s reach: the same row, within its reach on each side, whatever stands in the slots
 * between (empty and knocked-out slots do not stop it). Flank Guard covers only its longer side (the side
 * with more slots to the row end; a Guard in the exact middle covers both), with twice the slots.
 */
export function inReach(s: State, g: Fighter, o: Fighter): boolean {
  const R = s.ctx.rules;
  if (g === o || g.row !== o.row) return false;
  const r = reachOf(s, g);
  const d = o.col - g.col;
  if (fx(g).flankGuard) {
    const toRight = s.boss.cols - 1 - g.col;
    if (g.col === toRight) return Math.abs(d) <= R.flankGuardSlots * r && d !== 0;
    const left = g.col > toRight;
    return left ? d >= -R.flankGuardSlots * r && d <= -1 : d >= 1 && d <= R.flankGuardSlots * r;
  }
  return Math.abs(d) <= r;
}

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
      return live[int(s.rng, live.length)];
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
export const usesRoll = (p: Pattern): boolean =>
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
export const AIMED = new WeakMap<readonly Fighter[], ReadonlySet<Fighter>>();

/** A pattern's count `n` in this arena: fixed, or per `perColumns` columns of its width (at least 1). */
const countOf = (cols: number, n: number, perColumns: number | undefined): number =>
  perColumns ? Math.max(1, Math.round((n * cols) / perColumns)) : n;

/** The slots a pattern covers, as the living creatures standing in them (R2: targets are slots). */
export function targetsOf(s: State, p0: Pattern, plain: boolean): readonly Fighter[] {
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
          out.push(...rest.splice(int(s.rng, rest.length), 1));
        return out;
      }
      case 'randomRow': {
        const rows = [...new Set(live.map((f) => f.row))];
        if (rows.length === 0) return [];
        const r = rows[int(s.rng, rows.length)];
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

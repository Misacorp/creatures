import { content, createSeededRng, int, type Rng, type TurnOrder } from '@creatures/game';
import { turnOrder, zoneNeighbours, type FightSlot } from '@creatures/engine';

/**
 * The two ways a player group can arrange its row in the setup study (`setups.ts`). Both take the
 * creatures the group brings (any order) and return a row, left to right. They model a group that
 * knows what it wants and arranges the row for that, not a random shuffle: the arrangement is the
 * best one a seeded hill-climb finds for the formation's own score, so the study measures two
 * philosophies at their best.
 *
 * - **Greedy** wants the most reactions: setters and payoffs packed so a mark is cashed in as often
 *   as the turn order allows. Guards and Supports go only where they cost the fewest reactions, and
 *   among those places at the edges of the row, out of the way.
 * - **Protected** wants every payoff to stand beside a Guard (in its own zone: adjacency stops at
 *   zone edges), then Supports standing between two payoffs, and takes whatever reactions are left.
 */
export type Setup = 'greedy' | 'protected';

/** `markElement -> triggerElement` of the reactions in the content. */
const TRIGGERS: ReadonlyMap<string, string> = new Map(
  content.reactions.map((r) => [r.markElement, r.triggerElement]),
);

/** The order the creatures act in, as indices into `row`. */
function actingOrder(row: readonly FightSlot[], mode: TurnOrder): number[] {
  return turnOrder(
    row.map((s, idx) => ({ idx, spd: s.stats?.spd ?? 0 })),
    mode,
  );
}

/**
 * Reactions in one round of a long fight, by the mark rules of the engine (`hitBoss`): the first hit
 * marks the boss, a creature whose element triggers the mark cashes it in (and clears it), a Setter
 * of another element replaces the mark. The mark carries over between rounds, so two rounds are
 * walked and the second counted. Ignores resistances, knock-outs and abilities.
 */
export function reactionsPerRound(row: readonly FightSlot[], mode: TurnOrder): number {
  const triggers = TRIGGERS;
  const order = actingOrder(row, mode);
  let mark: string | null = null;
  let counted = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (const i of order) {
      const c = row[i] as FightSlot;
      if (mark === null) {
        mark = c.element;
      } else if (triggers.get(mark) === c.element) {
        mark = null;
        if (pass === 1) counted += 1;
      } else if (c.role === 'setter' && mark !== c.element) {
        mark = c.element;
      }
    }
  }
  return counted;
}

/** Payoffs standing beside a Guard in their own zone, and the other protection counts. */
export function protection(row: readonly FightSlot[]): {
  guardedPayoffs: number;
  payoffs: number;
  payoffsBesideSupport: number;
  supportsBetweenPayoffs: number;
  supports: number;
} {
  let guardedPayoffs = 0;
  let payoffs = 0;
  let payoffsBesideSupport = 0;
  let supportsBetweenPayoffs = 0;
  let supports = 0;
  for (const [i, c] of row.entries()) {
    const near = zoneNeighbours(i, row.length).map((j) => row[j] as FightSlot);
    if (c.role === 'payoff') {
      payoffs += 1;
      if (near.some((n) => n.role === 'guard')) guardedPayoffs += 1;
      if (near.some((n) => n.role === 'support')) payoffsBesideSupport += 1;
    } else if (c.role === 'support') {
      supports += 1;
      if (near.length === 2 && near.every((n) => n.role === 'payoff')) supportsBetweenPayoffs += 1;
    }
  }
  return { guardedPayoffs, payoffs, payoffsBesideSupport, supportsBetweenPayoffs, supports };
}

/** Hill-climb moves tried per creature in the row (per start). */
const STEPS_PER_CREATURE = 40;

/** Distance of a place from the nearest end of the row. */
const edgeDistance = (i: number, n: number): number => Math.min(i, n - 1 - i);

function greedyScore(row: readonly FightSlot[], mode: TurnOrder): number {
  let tidy = 0;
  for (const [i, c] of row.entries()) {
    if (c.role === 'guard' || c.role === 'support') tidy -= edgeDistance(i, row.length);
  }
  return reactionsPerRound(row, mode) * 1_000 + tidy;
}

function protectedScore(row: readonly FightSlot[], mode: TurnOrder): number {
  const p = protection(row);
  return (
    p.guardedPayoffs * 1_000_000 +
    p.supportsBetweenPayoffs * 10_000 +
    p.payoffsBesideSupport * 100 +
    reactionsPerRound(row, mode)
  );
}

/**
 * Seeded hill-climb over swaps and moves (a creature taken out and put back elsewhere), accepting
 * any change that does not lower the score. Two starts: the row as given and its reverse; the
 * better result wins (ties: the first).
 */
function climb(
  start: readonly FightSlot[],
  score: (row: readonly FightSlot[]) => number,
  rng: Rng,
): FightSlot[] {
  const n = start.length;
  let best: FightSlot[] = [...start];
  let bestScore = score(best);
  for (const from of [[...start], [...start].reverse()]) {
    const row = from;
    let current = score(row);
    for (let step = 0; step < STEPS_PER_CREATURE * n; step++) {
      const a = int(rng, n);
      const b = int(rng, n);
      if (a === b) continue;
      const swap = step % 2 === 0;
      const move = (x: number, y: number): void => {
        if (swap) {
          const t = row[x] as FightSlot;
          row[x] = row[y] as FightSlot;
          row[y] = t;
        } else {
          const [t] = row.splice(x, 1);
          row.splice(y, 0, t as FightSlot);
        }
      };
      move(a, b);
      const s = score(row);
      if (s >= current) current = s;
      else move(swap ? a : b, swap ? b : a);
    }
    if (current > bestScore) {
      best = [...row];
      bestScore = current;
    }
  }
  return best;
}

/** Arranges `row` (the group's creatures, in any order) for the setup; deterministic. */
const cache = new Map<string, readonly FightSlot[]>();

/**
 * Arranges `row` (the group's creatures, in any order) for the setup; deterministic. Results are
 * cached by creatures and turn order: the stats of a creature do not change inside one study.
 */
export function arrangeRow(row: readonly FightSlot[], setup: Setup, mode: TurnOrder): FightSlot[] {
  if (row.length < 2) return [...row];
  const key = `${setup}:${mode}:${row.map((s) => `${s.id}:${s.speciesId}:${s.stats?.spd ?? 0}`).join(',')}`;
  const hit = cache.get(key);
  if (hit !== undefined) {
    // The cached order, with this call's own slot objects (their stats may have changed since).
    const byId = new Map(row.map((s) => [s.id, s]));
    return hit.map((s) => byId.get(s.id) as FightSlot);
  }
  const rng = createSeededRng(`setup:${key}`);
  const arranged = climb(
    row,
    setup === 'greedy' ? (r) => greedyScore(r, mode) : (r) => protectedScore(r, mode),
    rng,
  );
  cache.set(key, arranged);
  return arranged;
}

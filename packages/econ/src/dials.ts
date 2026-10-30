import type { Rules } from './rules';
import type { Axis } from './tuner';

/**
 * The dials the tuner may move: each is a multiplier on one or more numbers of `rules.ts` (1 is today's value), with the range it may
 * take and its smallest step. A dial is a path into the rules; applying it returns a new rules object and never edits `RULES`.
 * Adding a dial is one row here.
 */
export interface Dial {
  readonly id: string;
  readonly label: string;
  /** Paths into the rules (a number or an array of numbers); each is multiplied by the dial's value. */
  readonly paths: readonly (readonly string[])[];
  /** Whether the results are whole numbers (prices). */
  readonly integer?: boolean;
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export const DIALS: readonly Dial[] = [
  {
    id: 'projectSize',
    label: 'project size (the base of every project)',
    paths: [['commons', 'baseSize']],
    min: 0.25,
    max: 8,
    step: 0.25,
  },
  {
    id: 'scoutScrap',
    label: "scouts' scrap rate",
    paths: [['scouts', 'perHour', 'scrap']],
    min: 0.1,
    max: 2,
    step: 0.05,
  },
  {
    id: 'scoutShards',
    label: "scouts' shard rate",
    paths: [['scouts', 'perHour', 'shards']],
    min: 0.1,
    max: 2,
    step: 0.05,
  },
  {
    id: 'scoutCreatures',
    label: "scouts' creature chance",
    paths: [['scouts', 'perHour', 'creatures']],
    min: 0.25,
    max: 4,
    step: 0.25,
  },
  {
    id: 'seatPrices',
    label: 'seat prices (scout seats, anvils and their scrap)',
    paths: [
      ['seats', 'scoutPrices'],
      ['seats', 'anvilPrices'],
      ['seats', 'anvilScrap'],
    ],
    integer: true,
    min: 0.25,
    max: 4,
    step: 0.25,
  },
  {
    id: 'kitPrice',
    label: 'kit price',
    paths: [['kit', 'price']],
    integer: true,
    min: 0.25,
    max: 4,
    step: 0.25,
  },
  {
    id: 'storeHours',
    label: 'store size (hours a store holds)',
    paths: [['posts', 'storeHours']],
    min: 0.5,
    max: 4,
    step: 0.25,
  },
  {
    id: 'pieceHours',
    label: 'hours a Forge piece takes',
    paths: [['forge', 'pieceHours']],
    min: 0.5,
    max: 3,
    step: 0.25,
  },
  {
    id: 'hearth',
    label: "the hearth's growth a level",
    paths: [['bonfire', 'hearth', 'perLevel']],
    min: 0.5,
    max: 4,
    step: 0.25,
  },
  {
    id: 'allowance',
    label: 'the daily Acorn allowance',
    paths: [['acorns', 'allowancePerDay']],
    min: 0.25,
    max: 3,
    step: 0.25,
  },
  {
    id: 'idleXp',
    label: 'idle XP an hour',
    paths: [['xp', 'idlePerHour']],
    min: 0.5,
    max: 2,
    step: 0.1,
  },
];

export const dialById = (id: string): Dial => {
  const found = DIALS.find((d) => d.id === id);
  if (!found) throw new Error(`unknown dial ${id} (known: ${DIALS.map((d) => d.id).join(', ')})`);
  return found;
};

/** The axis of a dial for the tuner: today is 1. */
export const axisOf = (dial: Dial): Axis => ({
  id: dial.id,
  min: dial.min,
  max: dial.max,
  step: dial.step,
  start: 1,
});

type Tree = { [key: string]: unknown };

/** A copy of `tree` with the value at `path` replaced by `change(old)`; the rest is shared. */
function updateAt(tree: Tree, path: readonly string[], change: (old: unknown) => unknown): Tree {
  const [head, ...rest] = path;
  if (head === undefined) return tree;
  const old = tree[head];
  return {
    ...tree,
    [head]: rest.length === 0 ? change(old) : updateAt(old as Tree, rest, change),
  };
}

/** The rules with one dial multiplied by `m` (a copy; today's rules are never edited). */
export function applyDial(rules: Rules, dial: Dial, m: number): Rules {
  const scale = (x: number): number => {
    const scaled = x * m;
    return dial.integer ? Math.round(scaled) : Math.round(scaled * 1e6) / 1e6;
  };
  let out = rules as unknown as Tree;
  for (const path of dial.paths)
    out = updateAt(out, path, (old) =>
      Array.isArray(old) ? (old as number[]).map(scale) : scale(old as number),
    );
  return out as unknown as Rules;
}

/** The rules with every dial in `values` applied (dials missing from `values` stay at today's). */
export function applyDials(rules: Rules, values: Readonly<Record<string, number>>): Rules {
  return Object.entries(values).reduce((r, [id, m]) => applyDial(r, dialById(id), m), rules);
}

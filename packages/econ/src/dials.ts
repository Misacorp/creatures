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
  /** A dial that is not a plain multiplier (the shares of a project, which must add up to 1) says how it changes the rules. */
  readonly custom?: (rules: Rules, m: number) => Rules;
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
    id: 'firstProject',
    label: "the first level's project (level 1 to 2, small on purpose: V-COM-15)",
    paths: [['commons', 'levelFactor', '0']],
    min: 0.25,
    max: 2,
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
    label: 'seat prices in Acorns (scout seats and anvils)',
    paths: [
      ['seats', 'scoutPrices'],
      ['seats', 'anvilPrices'],
    ],
    integer: true,
    min: 0.25,
    max: 4,
    step: 0.25,
  },
  {
    id: 'anvilScrap',
    label: 'scrap an anvil costs besides its Acorns',
    paths: [['seats', 'anvilScrap']],
    integer: true,
    min: 0.25,
    max: 2,
    step: 0.25,
  },
  {
    id: 'dupScrap',
    label: 'scrap a duplicate creature melts into',
    paths: [['scouts', 'duplicateCreatureScrap']],
    integer: true,
    min: 0.5,
    max: 4,
    step: 0.5,
  },
  {
    id: 'materialShare',
    label:
      "the share of a project paid in scrap and shards (the rest in Acorns; today's 60%, at most 90%)",
    paths: [],
    custom: (rules, m) => {
      const scrap = Math.round(rules.commons.costSplit.scrap * m * 1e6) / 1e6;
      const shards = Math.round(rules.commons.costSplit.shards * m * 1e6) / 1e6;
      const acorns = Math.round((1 - scrap - shards) * 1e6) / 1e6;
      return { ...rules, commons: { ...rules.commons, costSplit: { acorns, scrap, shards } } };
    },
    min: 0.5,
    max: 1.5,
    step: 0.125,
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
    min: 0.75,
    max: 3,
    step: 0.25,
  },
  {
    id: 'rarity',
    label: 'how often rare and epic species arrive (their weights; commons stay the same)',
    paths: [
      ['scouts', 'rarity', 'weights', '1'],
      ['scouts', 'rarity', 'weights', '2'],
    ],
    min: 0.25,
    max: 4,
    step: 0.25,
  },
  {
    id: 'catchUp',
    label: "catch-up's top multiplier (x2 today)",
    paths: [['bonfire', 'catchUp', 'maxMultiplier']],
    min: 0.5,
    max: 3,
    step: 0.25,
  },
  {
    id: 'pieceCost',
    label: 'scrap a Forge piece takes (kept under about 60: at most 1.6 times 36)',
    paths: [['forge', 'scrap']],
    integer: true,
    min: 0.5,
    max: 1.6,
    step: 0.1,
  },
  {
    id: 'communal',
    label: "a communal seat's output toward its project",
    paths: [['commons', 'communalPerHour']],
    min: 0.25,
    max: 8,
    step: 0.25,
  },
  {
    id: 'fireWarmth',
    label: 'what each thing adds to the fire (place levels, collections, boss kills ...)',
    paths: [
      ['fire', 'warmth', 'placeLevel'],
      ['fire', 'warmth', 'forgeLevel'],
      ['fire', 'warmth', 'collection'],
      ['fire', 'warmth', 'bossKill'],
      ['fire', 'warmth', 'cosmetic'],
    ],
    min: 0.25,
    max: 3,
    step: 0.25,
  },
  {
    id: 'evolveCost',
    label: 'Essence an evolution costs',
    paths: [['xp', 'evolveEssence']],
    integer: true,
    min: 0.5,
    max: 4,
    step: 0.5,
  },
  {
    id: 'essenceIncome',
    label: 'Essence from the raid and the dungeon',
    paths: [
      ['fights', 'raid', 'essenceKill'],
      ['fights', 'raid', 'essencePhases'],
      ['fights', 'dungeon', 'essence'],
    ],
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
  const value = rest.length === 0 ? change(old) : updateAt(old as Tree, rest, change);
  if (Array.isArray(tree)) {
    const copy = [...(tree as unknown[])];
    copy[Number(head)] = value;
    return copy as unknown as Tree;
  }
  return { ...tree, [head]: value };
}

/** The rules with one dial multiplied by `m` (a copy; today's rules are never edited). */
export function applyDial(rules: Rules, dial: Dial, m: number): Rules {
  const scale = (x: number): number => {
    const scaled = x * m;
    return dial.integer ? Math.round(scaled) : Math.round(scaled * 1e6) / 1e6;
  };
  if (dial.custom) return dial.custom(rules, m);
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

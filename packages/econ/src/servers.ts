import type { AwayCurve } from './rules';
import { profileById } from './profiles';
import type { PlayerProfile } from './schema';

/** The servers the lab runs (model.md "Servers"): who plays, and the server's dials. */
export type BossDial = 'all' | 'half' | 'none';
export type Policy = PlayerProfile['policy'];

export interface ServerConfig {
  readonly id: string;
  /** The name the random draws are keyed by (variants of a server share it); the id when missing. */
  readonly seedKey?: string;
  readonly label: string;
  /** One entry per player: a profile id, and optionally a policy replacing the profile's default. */
  readonly players: readonly { readonly profile: string; readonly policy?: Policy }[];
  /** How often the server kills its weekly boss (the fire's dial; combat is not simulated). */
  readonly bossKills: BossDial;
  readonly weeks: number;
  readonly curve: AwayCurve;
  /** Whether communal seats exist (V-COM-14; Misa is unsure they are fun). */
  readonly communalSeats: boolean;
  /** The generosity dial: replaces every player's share of income given to projects (a hoarder still saves first). */
  readonly giveShare?: number;
  /** Whether the Forge's shard exchange exists (Q34). */
  readonly shardExchange: boolean;
  /** Replaces the scouts' creature chance an hour (a sensitivity run for T-1). */
  readonly creatureRate?: number;
  /** Replaces the fire's time floor, in levels a week (the "slow floor" variants set `SLOW_FLOOR`; the default is none, Q40 B). */
  readonly fireFloor?: number;
  /** Whether catch-up also multiplies what the dungeon and the raid pay (a sensitivity run for T-2d). */
  readonly catchUpFights?: boolean;
}

const server = (
  id: string,
  label: string,
  players: Record<string, number>,
  more: Partial<ServerConfig> = {},
): ServerConfig => ({
  id,
  label,
  players: Object.entries(players).flatMap(([profile, n]) =>
    Array.from({ length: n }, () => ({ profile })),
  ),
  bossKills: 'half',
  weeks: 24,
  curve: 'B',
  communalSeats: true,
  shardExchange: true,
  ...more,
});

const withPolicy = (
  config: ServerConfig,
  policy: Policy,
  id: string,
  label: string,
): ServerConfig => ({
  ...config,
  id,
  label,
  players: config.players.map((p) => ({ ...p, policy })),
});

/** The mixed server of 8: one of each kind but the hoarder, two daily players. */
const EIGHT = {
  daily: 2,
  active: 1,
  'every-other-day': 1,
  'weekend-off': 1,
  weekly: 1,
  new: 1,
  returner: 1,
};

const MIXED_8 = server('mixed8', 'Mixed server of 8', EIGHT, { seedKey: 'mixed8' });

export const SERVERS: readonly ServerConfig[] = [
  server('mixed5', 'Mixed server of 5', { daily: 2, active: 1, 'every-other-day': 1, weekly: 1 }),
  MIXED_8,
  server('mixed15', 'Mixed server of 15', {
    daily: 4,
    active: 2,
    'every-other-day': 2,
    'weekend-off': 2,
    weekly: 3,
    new: 1,
    returner: 1,
  }),
  server('lone', 'A lone keen player', { active: 1 }),
  server('hoarder', 'A hoarder server (4 hoarders, 4 daily)', { hoarder: 4, daily: 4 }),
];

/** The slow time floor of Q37 B (levels a week), kept for the fire's comparison now that the default has none (Q40 B). */
export const SLOW_FLOOR = 1.875;

/** Variants of the mixed server of 8 for the targets and the fire. */
export const VARIANTS: readonly ServerConfig[] = [
  { ...MIXED_8, id: 'mixed8-all', label: 'Mixed 8, every boss killed', bossKills: 'all' },
  { ...MIXED_8, id: 'mixed8-none', label: 'Mixed 8, no boss killed', bossKills: 'none' },
  withPolicy(MIXED_8, 'setAndForget', 'mixed8-sf', 'Mixed 8, everyone set-and-forget'),
  withPolicy(MIXED_8, 'optimiser', 'mixed8-opt', 'Mixed 8, everyone an optimiser'),
  withPolicy(
    { ...MIXED_8, shardExchange: false },
    'setAndForget',
    'mixed8-sf-noexchange',
    'Mixed 8, set-and-forget, no shard exchange',
  ),
  withPolicy(
    { ...MIXED_8, shardExchange: false },
    'optimiser',
    'mixed8-opt-noexchange',
    'Mixed 8, optimisers, no shard exchange',
  ),
  {
    ...MIXED_8,
    id: 'mixed8-noexchange',
    label: 'Mixed 8, no shard exchange',
    shardExchange: false,
  },
  {
    ...MIXED_8,
    id: 'mixed8-slowfloor',
    label: 'Mixed 8, with a slow time floor',
    fireFloor: SLOW_FLOOR,
  },
  {
    ...MIXED_8,
    id: 'mixed8-all-slowfloor',
    label: 'Mixed 8, every boss killed, slow time floor',
    bossKills: 'all',
    fireFloor: SLOW_FLOOR,
  },
  {
    ...MIXED_8,
    id: 'mixed8-none-slowfloor',
    label: 'Mixed 8, no boss killed, slow time floor',
    bossKills: 'none',
    fireFloor: SLOW_FLOOR,
  },
  {
    ...MIXED_8,
    id: 'mixed8-creatures2',
    label: "Mixed 8, creatures at 2% an hour (the docs' table)",
    creatureRate: 0.02,
  },
  withPolicy(
    { ...MIXED_8, creatureRate: 0.02 },
    'optimiser',
    'mixed8-creatures2-opt',
    'Mixed 8, creatures at 2% an hour, everyone an optimiser',
  ),
  {
    ...MIXED_8,
    id: 'mixed8-catchfights',
    label: 'Mixed 8, catch-up also on fight XP',
    catchUpFights: true,
  },
  { ...MIXED_8, id: 'mixed8-give10', label: 'Mixed 8, everyone gives 10%', giveShare: 0.1 },
  { ...MIXED_8, id: 'mixed8-give60', label: 'Mixed 8, everyone gives 60%', giveShare: 0.6 },
  { ...MIXED_8, id: 'mixed8-curveA', label: 'Mixed 8, away curve A', curve: 'A' },
  {
    ...MIXED_8,
    id: 'mixed8-nocommunal',
    label: 'Mixed 8, no communal seats',
    communalSeats: false,
  },
  // A new player's table needs weeks since joining up to 24: the server runs 30 weeks so the week 6 joiner has 25.
  {
    ...MIXED_8,
    id: 'mixed8-long',
    label: 'Mixed 8, 30 weeks (for the new-player table)',
    weeks: 30,
  },
];

export const ALL_SERVERS: readonly ServerConfig[] = [...SERVERS, ...VARIANTS];

export const playerProfile = (
  entry: ServerConfig['players'][number],
  giveShare?: number,
): PlayerProfile => {
  const base = profileById(entry.profile);
  const withPolicy = entry.policy ? { ...base, policy: entry.policy } : base;
  return giveShare === undefined ? withPolicy : { ...withPolicy, giveShare };
};

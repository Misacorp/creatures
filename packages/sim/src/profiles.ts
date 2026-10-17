import { createSeededRng, chance, int, type Rng } from '@creatures/game';
import * as v from 'valibot';
import { ARCHETYPES, ARCHETYPE_CONFIG, type ArchetypeId } from './archetypes';

/**
 * Player profiles for the journey simulator (docs/design/player-journey-sim.md): a profile is data,
 * a set of dials. The economy reads a player's habits and decisions only from its profile; today's
 * four archetypes are profiles too (`LEGACY_PROFILES`), with exactly today's behaviour.
 */

export const TRAINING_FOCUS = [3, 6, 'spread'] as const;
export type TrainingFocus = (typeof TRAINING_FOCUS)[number];

/**
 * Which activities a player packs a treat for (a per-creature checkbox, 3 + half the level in Bait, double
 * experience): `none`; `long` the 12 hour and 24 hour trips and the dungeon; `all` every trip of 6 hours and
 * more, the dungeon and the Workshop jobs of 3 hours and more. Only the training focus gets treats.
 */
export const TREAT_POLICIES = ['none', 'long', 'all'] as const;
export type TreatPolicy = (typeof TREAT_POLICIES)[number];

/**
 * How good the daily dungeon team is:
 * - `best`: the best three of the player's top six by the sim's row score (most reactions, then
 *   power), stood in the game's row order;
 * - `good`: the strongest three, stood in the game's row order (today's behaviour);
 * - `reasonable`: the strongest three, stood strongest first (no row planning);
 * - `random`: any three creatures in any order.
 */
export const DUNGEON_SKILLS = ['best', 'good', 'reasonable', 'random'] as const;
export type DungeonSkill = (typeof DUNGEON_SKILLS)[number];

/** `auto`: the default row (`autoPlace`); the others arrange the player's places by the setup study's rule. */
export const RAID_ROWS = ['auto', 'greedy', 'protected'] as const;
export type RaidRow = (typeof RAID_ROWS)[number];

const percent = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100));

export const ProfileSchema = v.strictObject({
  id: v.pipe(v.string(), v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), v.maxLength(40)),
  label: v.pipe(v.string(), v.minLength(1), v.maxLength(40)),
  /** First week (1-based) the player takes part. */
  joinWeek: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(104)),
  /** Days a week the player opens the game (may be fractional: the average over weeks). */
  loginDays: v.pipe(v.number(), v.minValue(0), v.maxValue(7)),
  /** Days a week with a leet; never more than the login days (a leet is a login). May be fractional. */
  leetDays: v.pipe(v.number(), v.minValue(0), v.maxValue(7)),
  /** Percent chance that each of Friday to Sunday is picked first when the login days are chosen. */
  raidDayBias: percent,
  /** Local hours (0 to 23, ascending) of the check-ins of a login day. */
  checkInHours: v.pipe(
    v.array(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(23))),
    v.minLength(1),
    v.maxLength(12),
  ),
  trainFocus: v.picklist(TRAINING_FOCUS),
  /** Rush a creature that is working towards its evolution before levelling the rest. */
  evolutionPush: v.boolean(),
  /** Which activities get a treat (Bait, double experience). Absent in a profile written before treats: `none`. */
  treats: v.optional(v.picklist(TREAT_POLICIES), 'none'),
  /** Percent of check-ins at which idle expedition slots get a trip. */
  tripPercent: percent,
  dungeon: v.picklist(DUNGEON_SKILLS),
  signUpPercent: percent,
  /** Signing up needs a login on Monday to Friday of that week (the game must be opened to sign up). */
  signUpNeedsLogin: v.boolean(),
  raidRow: v.picklist(RAID_ROWS),
  /** Percent of check-ins at which the player upgrades gear and starts workshop jobs. */
  craftPercent: percent,
});
export type PlayerProfile = v.InferOutput<typeof ProfileSchema>;

/** Parses one profile; throws an Error with a readable message on bad input. */
export function parseProfile(raw: unknown): PlayerProfile {
  const parsed = v.safeParse(ProfileSchema, raw);
  if (!parsed.success) {
    const first = parsed.issues[0];
    const path = first?.path?.map((p) => String(p.key)).join('.') ?? '';
    throw new Error(`Invalid profile at "${path}": ${first?.message ?? 'unknown error'}`);
  }
  const p = parsed.output;
  if (p.leetDays > p.loginDays) throw new Error(`Invalid profile "${p.id}": leetDays > loginDays`);
  const hours = p.checkInHours;
  for (let i = 1; i < hours.length; i++) {
    if ((hours[i] as number) <= (hours[i - 1] as number)) {
      throw new Error(`Invalid profile "${p.id}": checkInHours must be ascending and unique`);
    }
  }
  return p;
}

/** Parses a list of profiles with unique ids. */
export function parseProfiles(raw: unknown): PlayerProfile[] {
  const parsed = v.safeParse(v.pipe(v.array(v.unknown()), v.minLength(1), v.maxLength(40)), raw);
  if (!parsed.success) throw new Error('Invalid profiles: expected a list of 1 to 40 profiles');
  const out = parsed.output.map(parseProfile);
  const seen = new Set<string>();
  for (const p of out) {
    if (seen.has(p.id)) throw new Error(`Invalid profiles: duplicate id "${p.id}"`);
    seen.add(p.id);
  }
  return out;
}

// --- Today's archetypes as profiles ---

/**
 * Today's archetypes as profiles, with exactly today's behaviour: casuals open the game only on their
 * leet days and check in once (09:00); the others open it every day and check in at 09:00 and 20:00.
 * Everybody trains the top 3 with the evolution push, always sends trips, runs the dungeon with the strongest three in the game's row order, takes the default
 * raid row and always works the gear.
 */
export const LEGACY_PROFILES: Readonly<Record<ArchetypeId, PlayerProfile>> = Object.fromEntries(
  ARCHETYPES.map((id) => {
    const cfg = ARCHETYPE_CONFIG[id];
    const onceOnLeetDays = cfg.checkIns === 'leet_days_once';
    const profile: PlayerProfile = {
      id,
      label: cfg.label,
      joinWeek: cfg.joinWeek,
      loginDays: onceOnLeetDays ? cfg.leetDaysPerWeek : 7,
      leetDays: cfg.leetDaysPerWeek,
      raidDayBias: 0,
      checkInHours: onceOnLeetDays ? [9] : [9, 20],
      trainFocus: 3,
      evolutionPush: true,
      treats: 'none',
      tripPercent: 100,
      dungeon: 'good',
      signUpPercent: cfg.signUpPercent,
      signUpNeedsLogin: false,
      raidRow: 'auto',
      craftPercent: 100,
    };
    return [id, profile];
  }),
) as Record<ArchetypeId, PlayerProfile>;

/**
 * The archetype that a profile is closest to, used only to label journey players in the reports that
 * group by archetype: someone who opens the game on fewer than 7 days is a casual, someone who leets
 * every day a top earner, everyone else a daily. Behaviour never reads it.
 */
export function proxyArchetype(profile: PlayerProfile): ArchetypeId {
  if (profile.loginDays < 7) return 'casual';
  return profile.leetDays >= 7 ? 'top' : 'daily';
}

// --- The journey presets ---

export const PRESET_IDS = ['min-maxer', 'engaged', 'regular', 'drop-in'] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export const PRESETS: Readonly<Record<PresetId, PlayerProfile>> = {
  'min-maxer': {
    id: 'min-maxer',
    label: 'Min-maxer',
    joinWeek: 1,
    loginDays: 7,
    leetDays: 7,
    raidDayBias: 0,
    checkInHours: [0, 3, 6, 9, 12, 15, 18, 21],
    trainFocus: 3,
    evolutionPush: true,
    treats: 'all',
    tripPercent: 100,
    dungeon: 'best',
    signUpPercent: 100,
    signUpNeedsLogin: true,
    raidRow: 'protected',
    craftPercent: 100,
  },
  engaged: {
    id: 'engaged',
    label: 'Engaged',
    joinWeek: 1,
    loginDays: 7,
    leetDays: 5.5,
    raidDayBias: 0,
    checkInHours: [9, 20],
    trainFocus: 6,
    evolutionPush: true,
    treats: 'long',
    tripPercent: 85,
    dungeon: 'good',
    signUpPercent: 100,
    signUpNeedsLogin: true,
    raidRow: 'auto',
    craftPercent: 40,
  },
  regular: {
    id: 'regular',
    label: 'Regular',
    joinWeek: 1,
    loginDays: 4.5,
    leetDays: 2.25,
    raidDayBias: 0,
    checkInHours: [18],
    trainFocus: 'spread',
    evolutionPush: false,
    treats: 'none',
    tripPercent: 55,
    dungeon: 'reasonable',
    signUpPercent: 85,
    signUpNeedsLogin: true,
    raidRow: 'auto',
    craftPercent: 10,
  },
  'drop-in': {
    id: 'drop-in',
    label: 'Drop-in',
    joinWeek: 1,
    loginDays: 1.5,
    leetDays: 0.3,
    raidDayBias: 60,
    checkInHours: [20],
    trainFocus: 'spread',
    evolutionPush: false,
    treats: 'none',
    tripPercent: 30,
    dungeon: 'random',
    signUpPercent: 90,
    signUpNeedsLogin: true,
    raidRow: 'auto',
    craftPercent: 0,
  },
};

/** The profile of an archetype or preset id, or undefined. */
export function profileById(id: string): PlayerProfile | undefined {
  return (
    (PRESETS as Record<string, PlayerProfile>)[id] ??
    (LEGACY_PROFILES as Record<string, PlayerProfile>)[id]
  );
}

// --- Noise ---

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/**
 * A profile with its dials drawn from a range around the preset's (the "noise" option): every
 * player of a preset is a little different. Login and leet days move by up to one day, the
 * percentages by up to 15 points, the check-in hours by up to two hours (together), and now and
 * then the training focus moves one step. Choices that define a style (dungeon skill, raid row,
 * evolution push) stay. The draws come from `rng`, so a seed gives the same players.
 */
export function noisyProfile(base: PlayerProfile, rng: Rng, id: string = base.id): PlayerProfile {
  const wiggle = (width: number): number => int(rng, 2 * width + 1) - width;
  const pct = (x: number, width = 15): number => clamp(x + wiggle(width), 0, 100);
  const login = clamp(base.loginDays + wiggle(1) * (base.loginDays > 1 ? 1 : 0.5), 0.5, 7);
  const leetShare = base.loginDays === 0 ? 0 : base.leetDays / base.loginDays;
  const leet = clamp(
    Math.round(login * clamp(leetShare + wiggle(10) / 100, 0, 1) * 4) / 4,
    0,
    login,
  );
  const shift = wiggle(2);
  const hours = [...new Set(base.checkInHours.map((h) => (((h + shift) % 24) + 24) % 24))].sort(
    (a, b) => a - b,
  );
  const focusSteps: TrainingFocus[] = [3, 6, 'spread'];
  const at = focusSteps.indexOf(base.trainFocus);
  const moved = chance(rng, 15, 100)
    ? clamp(at + (chance(rng, 1, 2) ? 1 : -1), 0, focusSteps.length - 1)
    : at;
  return {
    ...base,
    id,
    loginDays: login,
    leetDays: leet,
    checkInHours: hours,
    trainFocus: focusSteps[moved] as TrainingFocus,
    tripPercent: base.tripPercent === 100 ? 100 : pct(base.tripPercent),
    signUpPercent: base.signUpPercent === 100 ? 100 : pct(base.signUpPercent, 10),
    craftPercent: base.craftPercent === 100 ? 100 : pct(base.craftPercent),
  };
}

// --- Server mixes ---

/** How many players of each profile a server has. */
export type ProfileMix = Readonly<Record<string, number>>;

/** The default server: 1 min-maxer, 3 engaged, 3 regular, 2 drop-in. */
export const DEFAULT_JOURNEY_MIX: ProfileMix = {
  'min-maxer': 1,
  engaged: 3,
  regular: 3,
  'drop-in': 2,
};

/** Named server mixes for `--server-mix`. */
export const SERVER_MIXES: Readonly<Record<string, ProfileMix>> = {
  default: DEFAULT_JOURNEY_MIX,
  'casual-heavy': { 'min-maxer': 0, engaged: 1, regular: 4, 'drop-in': 4 },
  committed: { 'min-maxer': 2, engaged: 4, regular: 2, 'drop-in': 1 },
};

/**
 * A mix scaled to `count` players by largest-remainder apportionment (ties go to the earlier profile
 * in the mix's own order). The result always sums to `count`; the long-run and pity sims use it to
 * play the default journey server at 5, 9 and 15 players.
 */
export function scaleProfileMix(mix: ProfileMix, count: number): ProfileMix {
  if (!Number.isInteger(count) || count < 1) throw new RangeError('player count must be >= 1');
  const entries = Object.entries(mix);
  const total = entries.reduce((n, [, c]) => n + c, 0);
  if (total < 1) throw new RangeError('the mix has no players');
  const parts = entries.map(([id, c], order) => ({
    id,
    order,
    base: Math.floor((c * count) / total),
    rem: (c * count) % total,
  }));
  let left = count - parts.reduce((n, p) => n + p.base, 0);
  const extra = new Set<string>();
  for (const p of [...parts].sort((a, b) => b.rem - a.rem || a.order - b.order)) {
    if (left <= 0) break;
    extra.add(p.id);
    left -= 1;
  }
  return Object.fromEntries(parts.map((p) => [p.id, p.base + (extra.has(p.id) ? 1 : 0)]));
}

/** The players of the default journey server scaled to `count` (`DEFAULT_JOURNEY_MIX`), as profiles. */
export function journeyRoster(count: number): PlayerProfile[] {
  const presets = PRESET_IDS.map((id) => PRESETS[id]);
  return rosterProfiles(scaleProfileMix(DEFAULT_JOURNEY_MIX, count), presets);
}

/**
 * Parses a mix like `min-maxer=1,engaged=3,regular=3,drop-in=2`. Names must be in `known`; counts
 * are whole numbers from 0 to 30 and the server needs at least one player.
 */
export function parseMix(text: string, known: readonly string[]): ProfileMix {
  const out: Record<string, number> = {};
  for (const part of text.split(',')) {
    const match = /^([a-z0-9-]{1,40})=([0-9]{1,2})$/.exec(part.trim());
    if (match === null) throw new Error(`--mix: cannot read "${part}" (expected name=count)`);
    const name = match[1] as string;
    const count = Number(match[2]);
    if (!known.includes(name)) throw new Error(`--mix: unknown profile "${name}"`);
    if (count > 30) throw new Error('--mix: at most 30 players of a profile');
    out[name] = count;
  }
  if (Object.values(out).reduce((a, b) => a + b, 0) < 1) {
    throw new Error('--mix: the server needs at least one player');
  }
  return out;
}

/** The profiles of a server, in mix order (the order of `profiles`), noisy when `noiseSeed` is given. */
export function rosterProfiles(
  mix: ProfileMix,
  profiles: readonly PlayerProfile[],
  noiseSeed?: string,
): PlayerProfile[] {
  const rng = noiseSeed === undefined ? null : createSeededRng(noiseSeed);
  const out: PlayerProfile[] = [];
  for (const base of profiles) {
    for (let k = 0; k < (mix[base.id] ?? 0); k++) {
      out.push(rng === null ? base : noisyProfile(base, rng));
    }
  }
  return out;
}

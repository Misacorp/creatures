/**
 * The valley's roster data: the one input the valley (the passive-systems redesign) gives the combat lab.
 *
 * Both files come from the valley branch `ccr-93a1de17-yutb1a`, commit `8ffe5d0`, `docs/design/valley/economy/`, copied verbatim
 * (whitespace aside) into `packages/lab/data/valley/`:
 * - `roster-profile.json`: the `RosterProfile` (`roster.ts`): per kind of player (`daily`, `weekly`, `newPlayer`) and week 1 to 24,
 *   the levels of the 1st, 3rd, 10th and 20th creature, the roster size, the forms, the talent slots and the average worn item level.
 * - `server-coverage.json`: for mixed servers of 5, 8 and 15 players and each week 1 to 24, the share of each rarity's species that at
 *   least one player on the server owns (the chance a given species of that rarity can be pooled into the raid roster).
 *
 * The valley replaces the data by copying new versions over the two files. The loader checks their shape at load and throws with a
 * clear message when something is off, so a bad drop-in fails loudly, not as odd numbers in a report.
 */
import coverageJson from '../data/valley/server-coverage.json';
import rosterJson from '../data/valley/roster-profile.json';
import { LEVEL_CAP, ROSTER_WEEKS, type RosterProfile, type RosterWeek } from './roster';

/** The mixed servers the coverage is given for. */
export const COVERAGE_SERVERS = ['mixed5', 'mixed8', 'mixed15'] as const;
export type CoverageServer = (typeof COVERAGE_SERVERS)[number];

/** The rarities a species has (`content.creatures`); the coverage is the share of each owned by at least one player. */
export const COVERAGE_RARITIES = ['common', 'rare', 'epic'] as const;
export type CoverageRarity = (typeof COVERAGE_RARITIES)[number];

/** One week of a server's coverage: for each rarity, the share (0 to 1) of its species a player on the server owns. */
export interface CoverageWeek {
  readonly week: number;
  readonly common: number;
  readonly rare: number;
  readonly epic: number;
}

/** The coverage of each kind of mixed server, by week (index 0 is week 1). */
export type ServerCoverage = Readonly<Record<CoverageServer, readonly CoverageWeek[]>>;

const KINDS = ['daily', 'weekly', 'newPlayer'] as const;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A number in `[min, max]` (whole if asked), or a thrown error naming where it is. */
function num(v: unknown, where: string, min: number, max: number, whole = false): number {
  if (
    typeof v !== 'number' ||
    !Number.isFinite(v) ||
    v < min ||
    v > max ||
    (whole && !Number.isInteger(v))
  )
    throw new Error(
      `valley data: ${where} must be ${whole ? 'a whole number' : 'a number'} from ${min} to ${max}, not ${JSON.stringify(v)}`,
    );
  return v;
}

function rowsOf(v: unknown, where: string): unknown[] {
  if (!Array.isArray(v) || v.length !== ROSTER_WEEKS)
    throw new Error(
      `valley data: ${where} must list ${ROSTER_WEEKS} weeks, not ${Array.isArray(v) ? v.length : typeof v}`,
    );
  return v;
}

function weekOf(row: unknown, where: string, index: number): RosterWeek {
  const at = `${where}[${index}]`;
  if (!isRecord(row)) throw new Error(`valley data: ${at} must be an object`);
  const week = num(row['week'], `${at}.week`, 1, ROSTER_WEEKS, true);
  if (week !== index + 1)
    throw new Error(`valley data: ${at}.week must be ${index + 1}, not ${week}`);
  const forms = row['forms'];
  if (
    forms !== 'all' &&
    !(Array.isArray(forms) && forms.every((f) => typeof f === 'string' && f !== ''))
  )
    throw new Error(`valley data: ${at}.forms must be "all" or a list of form ids`);
  const picked = row['talentsPicked'];
  if (typeof picked !== 'boolean')
    throw new Error(`valley data: ${at}.talentsPicked must be true or false`);
  return {
    week,
    first: num(row['first'], `${at}.first`, 1, LEVEL_CAP),
    third: num(row['third'], `${at}.third`, 1, LEVEL_CAP),
    tenth: num(row['tenth'], `${at}.tenth`, 1, LEVEL_CAP),
    twentieth: num(row['twentieth'], `${at}.twentieth`, 1, LEVEL_CAP),
    size: num(row['size'], `${at}.size`, 1, 1000, true),
    forms: forms === 'all' ? 'all' : (forms as string[]),
    talentSlots: num(row['talentSlots'], `${at}.talentSlots`, 0, 3, true),
    talentsPicked: picked,
    gear: num(row['gear'], `${at}.gear`, 0, 1000),
  };
}

/** Checks a roster profile read from JSON and returns it typed; throws a clear error when its shape is wrong. */
export function parseRosterProfile(data: unknown): RosterProfile {
  if (!isRecord(data)) throw new Error('valley data: the roster profile must be an object');
  const [daily, weekly, newPlayer] = KINDS.map((kind) =>
    rowsOf(data[kind], kind).map((row, i) => weekOf(row, kind, i)),
  ) as [RosterWeek[], RosterWeek[], RosterWeek[]];
  return { daily, weekly, newPlayer };
}

/** Checks a server coverage read from JSON and returns it typed; throws a clear error when its shape is wrong. */
export function parseServerCoverage(data: unknown): ServerCoverage {
  if (!isRecord(data)) throw new Error('valley data: the server coverage must be an object');
  const out = {} as Record<CoverageServer, CoverageWeek[]>;
  for (const server of COVERAGE_SERVERS) {
    out[server] = rowsOf(data[server], server).map((row, i) => {
      const at = `${server}[${i}]`;
      if (!isRecord(row)) throw new Error(`valley data: ${at} must be an object`);
      const week = num(row['week'], `${at}.week`, 1, ROSTER_WEEKS, true);
      if (week !== i + 1) throw new Error(`valley data: ${at}.week must be ${i + 1}, not ${week}`);
      return {
        week,
        common: num(row['common'], `${at}.common`, 0, 1),
        rare: num(row['rare'], `${at}.rare`, 0, 1),
        epic: num(row['epic'], `${at}.epic`, 0, 1),
      };
    });
  }
  return out;
}

/** The valley's roster profile: what a daily, a weekly and a new player have at each week. The default of the path and the tuner. */
export const VALLEY_ROSTER: RosterProfile = parseRosterProfile(rosterJson);

/** The valley's server coverage: the share of each rarity's species a mixed server of 5, 8 or 15 owns, by week. */
export const VALLEY_COVERAGE: ServerCoverage = parseServerCoverage(coverageJson);

/**
 * The share of `rarity`'s species a mixed server owns by `week` (clamped to 1..24): **the running maximum** of the valley's share up to
 * that week, per server size and rarity. A species already in the pool never becomes less owned, so the share can only fall because a
 * content drop (about every 4th week in the valley's data) adds species nobody owns yet to the denominator. The answer lines use only
 * the first content's 34 forms, so the running maximum is a lower bound for the chance that one of those is owned (its ownership never
 * falls). It becomes exact if the valley reports the coverage of the first content separately.
 */
export function coverageAt(
  coverage: ServerCoverage,
  server: CoverageServer,
  rarity: CoverageRarity,
  week: number,
): number {
  const w = Math.min(ROSTER_WEEKS, Math.max(1, Math.round(week)));
  return Math.max(...coverage[server].slice(0, w).map((x) => x[rarity]));
}

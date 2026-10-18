/**
 * Live finale API: the snapshot types, a strict shape check and the requests. The shapes mirror the
 * server's `LiveSnapshot` (`apps/worker/src/raid-live-view.ts`) and `docs/design/m5-finale.md`; the
 * fixtures in `src/fixtures` are real server responses that the tests parse. Everything here is
 * display data: the server runs the fight and decides every outcome; the client sends Fire and the Auto fire toggle
 * as intents.
 *
 * The server sends one object for every state, with nulls where there is nothing yet (no boss HP or
 * names in the lobby, no party or start time when there is no finale soon). The parser checks that
 * object and narrows it by status: `none` carries only the clock, `lobby` has a start time but no
 * fight yet, and `live` or `done` have the whole fight.
 */
import type { Element } from '@creatures/game';
import type { EventNames, FightEvent, Zone, ZoneSizes } from '@creatures/engine';
import { apiFetch, jsonRequest } from './api';
import {
  isEvent,
  isEventNames,
  isFestivalGrant,
  isGuardRules,
  isOptZones,
  isRankChange,
  isReplayRow,
  type FestivalGrant,
  type FightGuardRules,
  type RankChange,
  type ReplayRowEntry,
} from './raid-api';
import {
  isArrayOf,
  isBool,
  isCount,
  isInt,
  isNullableInt,
  isNullableStr,
  isPositiveInt,
  isRecord,
  isStr,
} from './parse-core';

export type LiveStatus = 'none' | 'lobby' | 'live' | 'done';
type LiveAbilityMode = 'default' | 'held' | 'fired';

/**
 * One use of an ability. A player has one entry for their basic ability and one for each of their
 * unlocked team creatures' abilities.
 */
export interface LiveAbility {
  /** Unique in the fight. The caller sends it to Fire or toggle Auto fire on their own ability. */
  key: string;
  /** An opaque per-fight player key, the same keys as `names.players` and `LiveFight.you`. */
  alias: string;
  abilityId: string;
  /** The row slot (creature id, as in `row[].id`) of a creature ability; null for a basic ability. */
  creature: string | null;
  mode: LiveAbilityMode;
  /**
   * Auto fire is on: false exactly when the mode is `held`. In the lobby this is the player's
   * preference for the start; once the fight is on it follows the toggle.
   */
  autoFire: boolean;
  /** True once the ability has taken effect. */
  fired: boolean;
  /** The round it took effect in, once it has. */
  firedAtRound: number | null;
  /** Fire was pressed and it has not taken effect yet: the round it will take effect in. */
  fireAtRound: number | null;
  /** The round it fires in if nobody touches it (the engine's own default). */
  defaultRound: number;
}

export interface LiveLoot {
  cleared: boolean;
  /** Everything the finale paid the caller, as one figure. */
  essence: number;
  /** What the finale did to the server's rank; null until the ladder has moved, and in practice. */
  rankChange: RankChange | null;
  /** The Festival creature the finale gave the caller, or null. */
  festivalGrant: FestivalGrant | null;
}

/** What every state carries (the fields that are the same in the lobby and in the fight). */
interface LiveShared {
  /** A staging practice fight: no rewards. */
  practice: boolean;
  week: string;
  /** The caller's opaque player key in this fight, or null. */
  you: string | null;
  /**
   * The fixed round length of a fight that was stored before content pacing; null otherwise. Rounds
   * last as long as their events take to play (6 to 22 seconds): use `roundStarts` and `nextRoundAt`.
   */
  roundMs: number | null;
  rounds: number;
  /** The round being played now (0 before the start). */
  round: number;
  /** When each round started, for rounds 1..`round` (server clock, UTC ms). */
  roundStarts: number[];
  /**
   * When the state next changes: the start of the next round, or the end of the fight during its
   * last round; the start in the lobby. Null when there is nothing to wait for.
   */
  nextRoundAt: number | null;
  serverNow: number;
  /** The frozen fighting row, left to right. Empty in the lobby. */
  row: ReplayRowEntry[];
  /** The Guard numbers the fight is played with; null when unknown (the Guard of the old rules). */
  rules: FightGuardRules | null;
  /** How many creatures of the row are in each zone (the board's rows); absent or null: the length formula. */
  zones: ZoneSizes | null;
  abilities: LiveAbility[];
  events: FightEvent[];
  /** Display names of the players who are watching. */
  watching: string[];
  /** The caller's own loot once the fight is done. */
  loot: LiveLoot | null;
}

interface LiveBossOf<Hp> {
  id: string;
  name: string;
  element: string;
  hpMax: Hp;
  hpStart: Hp;
}

/** No finale is coming up soon (or the caller has no party). Polling stops. */
export interface LiveNone {
  status: 'none';
  serverNow: number;
}

/**
 * Before the start: the countdown, who is here and a preview of the stage. The row, the names and the
 * boss pool are what the fight would use now (a practice fight: what it was started with), and
 * `abilities` holds only the caller's own, with their Auto fire setting. There are no events yet. The
 * preview can be missing (an empty row, no names) when the party has none to show.
 */
export interface LiveLobby extends LiveShared {
  status: 'lobby';
  party: number;
  startsAt: number;
  boss: LiveBossOf<number | null>;
  names: EventNames | null;
  bossHp: number | null;
}

/** The fight in progress, or over (with the caller's loot, unless it was a practice fight). */
export interface LiveRunning extends LiveShared {
  status: 'live' | 'done';
  party: number;
  startsAt: number;
  boss: LiveBossOf<number>;
  names: EventNames;
  bossHp: number;
}

/** A snapshot that has a fight (or the lobby of one). */
export type LiveFight = LiveLobby | LiveRunning;

export type LiveSnapshot = LiveNone | LiveFight;

/** Fire an ability of the caller's, or toggle its Auto fire (`hold`: off, `unhold`: on), named by its `key`. */
export type LiveActionRequest =
  | { key: string; action: 'hold' | 'unhold' }
  | { key: string; action: 'fire'; zone?: Zone; element?: Element };

// --- Shape checks ---

const isLiveStatus = (value: unknown): value is LiveStatus =>
  value === 'none' || value === 'lobby' || value === 'live' || value === 'done';

function isLiveAbility(value: unknown): value is LiveAbility {
  return (
    isRecord(value) &&
    isStr(value['key']) &&
    isStr(value['alias']) &&
    isStr(value['abilityId']) &&
    isNullableStr(value['creature']) &&
    (value['mode'] === 'default' || value['mode'] === 'held' || value['mode'] === 'fired') &&
    isBool(value['autoFire']) &&
    isBool(value['fired']) &&
    (value['firedAtRound'] === null || isPositiveInt(value['firedAtRound'])) &&
    (value['fireAtRound'] === null || isPositiveInt(value['fireAtRound'])) &&
    isCount(value['defaultRound'])
  );
}

function isLiveLoot(value: unknown): value is LiveLoot {
  return (
    isRecord(value) &&
    isBool(value['cleared']) &&
    isCount(value['essence']) &&
    (value['rankChange'] === null || isRankChange(value['rankChange'])) &&
    (value['festivalGrant'] === null || isFestivalGrant(value['festivalGrant']))
  );
}

/** The boss block with its two pool numbers, which are null until the party has a pool. */
function isLiveBoss(value: unknown): value is LiveBossOf<number | null> {
  return (
    isRecord(value) &&
    isStr(value['id']) &&
    isStr(value['name']) &&
    isStr(value['element']) &&
    (value['hpMax'] === null || isPositiveInt(value['hpMax'])) &&
    (value['hpStart'] === null || isCount(value['hpStart']))
  );
}

/** The fields every status carries, with the types the server sends (nullable ones included). */
function hasSharedShape(data: Record<string, unknown>): boolean {
  return (
    isBool(data['practice']) &&
    isStr(data['week']) &&
    isNullableInt(data['party']) &&
    isNullableStr(data['you']) &&
    isNullableInt(data['startsAt']) &&
    (data['roundMs'] === null || isPositiveInt(data['roundMs'])) &&
    isPositiveInt(data['rounds']) &&
    isCount(data['round']) &&
    isArrayOf(data['roundStarts'], isInt) &&
    isNullableInt(data['nextRoundAt']) &&
    isInt(data['serverNow']) &&
    isLiveBoss(data['boss']) &&
    isArrayOf(data['row'], isReplayRow) &&
    (data['rules'] === null || isGuardRules(data['rules'])) &&
    data['zones'] !== undefined &&
    isOptZones(data['zones']) &&
    (data['names'] === null || isEventNames(data['names'])) &&
    isArrayOf(data['abilities'], isLiveAbility) &&
    isArrayOf(data['events'], isEvent) &&
    (data['bossHp'] === null || isCount(data['bossHp'])) &&
    isArrayOf(data['watching'], isStr) &&
    (data['loot'] === null || isLiveLoot(data['loot']))
  );
}

/** Checks a snapshot from the live endpoints. Throws on anything unexpected. */
export function parseLiveSnapshot(data: unknown): LiveSnapshot {
  if (!isRecord(data) || !isLiveStatus(data['status']) || !hasSharedShape(data)) {
    throw new Error('the server returned an unexpected finale state');
  }
  if (data['status'] === 'none') return { status: 'none', serverNow: data['serverNow'] as number };
  // From the lobby on there is a party and a start time.
  if (!isInt(data['party']) || !isInt(data['startsAt'])) {
    throw new Error('the server returned an unexpected finale state');
  }
  if (data['status'] === 'lobby') return data as unknown as LiveLobby;
  // A fight in progress or over has the boss pool, the names and the HP.
  const boss = data['boss'] as LiveBossOf<number | null>;
  if (
    boss.hpMax === null ||
    boss.hpStart === null ||
    data['names'] === null ||
    data['bossHp'] === null
  ) {
    throw new Error('the server returned an unexpected finale state');
  }
  return data as unknown as LiveRunning;
}

// --- Requests ---

/** The caller's party's live state. */
export async function fetchLive(): Promise<LiveSnapshot> {
  return parseLiveSnapshot(await apiFetch('/api/raid/live'));
}

/** Fire or toggle Auto fire on one ability. Fire may carry the zone (Shield Wall) or the element (Re-mark). */
export async function sendLiveAction(request: LiveActionRequest): Promise<LiveSnapshot> {
  return parseLiveSnapshot(await apiFetch('/api/raid/live/action', jsonRequest('POST', request)));
}

/** Staging only: starts a practice fight. Anywhere else the server answers 404. */
export async function startPractice(): Promise<LiveSnapshot> {
  return parseLiveSnapshot(await apiFetch('/api/raid/practice', jsonRequest('POST', {})));
}

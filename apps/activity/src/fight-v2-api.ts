/**
 * The combat v2 fight as the server sends it for playback (apps/worker/src/raid-v2-view.ts; docs/design/combat/integration.md, sections 5
 * and 9): a stored stage (`GET /api/raid/replay/:week/:party/:stage`), the live finale (`GET /api/raid/live`, pushed over the finale socket,
 * `POST /api/raid/live/action`) and the after-action numbers of a stage (`GET /api/raid/stats/...`). Each says `rules: 2`; a v1 payload
 * says nothing of the kind (or carries the Guard numbers in `rules`), which is how the screens tell them apart.
 *
 * The board events (`FightEvent.board`) are checked one by one: an event this client cannot read refuses the whole payload, so a screen
 * never plays half a fight. Names, labels and sentences are the server's and are drawn as text only.
 */
import type { BoardEvent, FightEvent, FinaleAction, FinaleActionKind } from '@creatures/engine/v2';
import { apiFetch, jsonRequest } from './api';
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
import {
  isRankChange,
  isFestivalGrant,
  parseReplayView,
  parseStats,
  type AfterActionStats,
  type ReplayView,
  type FestivalGrant,
  type RankChange,
} from './raid-api';
import type { BossCardV2 } from './raid-v2-api';
import { isCard } from './raid-v2-api';

/** The phases of a v2 weekend as the server stores them: the finale is the third stage. */
export type FightPhaseV2 = 'stage1' | 'stage2' | 'finale';
const PHASES: readonly string[] = ['stage1', 'stage2', 'finale'];

/** A creature of the fight, as the server lists it beside the events (the events call it by `key`). */
export interface FightCreatureV2 {
  key: string;
  name: string;
  species: string;
  element: string;
  role: string;
  /** Not stored with a fight: null. */
  level: number | null;
  /** The opaque owner key (`m1`, ...), the same keys as `names.players`. */
  owner: string;
  row: number;
  col: number;
  knack: string | null;
  /** The saved Knack's name (null: none). */
  knackName: string | null;
  talents: string[];
  maxHp: number;
  /** Its HP when the stage began (carried between stages). */
  startHp: number;
  /** The creature is shiny (absent: not). */
  shiny?: boolean;
}

/** The boss of a fight: what the stage draws of it. */
export interface FightBossV2 {
  id: string;
  name: string;
  element: string;
  hp: number;
  rows: number;
  cols: number;
  rounds: number;
}

export interface FightNamesV2 {
  players: Record<string, string>;
  creatures: Record<string, string>;
}

/** The part of the weekend's carry the screens read: the boss's HP and who stands out. */
export interface FightCarryV2 {
  bossHp: number;
  hp: Readonly<Record<string, number>>;
  out: readonly string[];
}

/** A stored stage, as the replay answers it. */
export interface ReplayViewV2 {
  rules: 2;
  weekId: string;
  party: number;
  phase: FightPhaseV2;
  /** The stage's index in the weekend (0 to 2). */
  stage: number;
  at: number;
  boss: FightBossV2;
  moveNames: Record<string, string>;
  /** The boss card at the stage's start: the move labels, the rule cards and the Escalating step. */
  card: BossCardV2;
  rounds: number;
  cleared: boolean;
  /** The boss fell in this stage. */
  kill: boolean;
  bossHpMax: number;
  bossHpStart: number;
  bossHpEnd: number;
  /** The caller's opaque owner key in this stage, or null if they were not in it. */
  you: string | null;
  fighters: FightCreatureV2[];
  /** The finale's live inputs as they acted. */
  actions: readonly FinaleAction[] | null;
  events: readonly FightEvent[];
  names: FightNamesV2;
  carry: FightCarryV2;
}

export type LiveStatusV2 = 'none' | 'lobby' | 'live' | 'done';

/** The caller's one live input and what they did with it. */
export interface LiveAbilityV2 {
  /** `<alias>:basic`: what the caller sends to fire or hold it. */
  key: string;
  alias: string;
  abilityId: string;
  kind: FinaleActionKind;
  mode: 'default' | 'held' | 'fired';
  autoFire: boolean;
  /** It has acted by the round the clock is in. */
  fired: boolean;
  firedAtRound: number | null;
  /** Fired and not yet acted: the round it acts in. */
  fireAtRound: number | null;
  /** The round it acts in when nobody touches it. */
  defaultRound: number;
  /** A Shield Wall's row (from 0). */
  row: number | null;
}

export interface LiveLootV2 {
  cleared: boolean;
  essence: number;
  rankChange: RankChange | null;
  festivalGrant: FestivalGrant | null;
}

/** The live finale as a poll or a push answers it. */
export interface LiveSnapshotV2 {
  rules: 2;
  status: LiveStatusV2;
  practice: false;
  week: string;
  party: number | null;
  you: string | null;
  startsAt: number | null;
  /** The fixed length of a round. */
  roundMs: number;
  rounds: number;
  /** The round the clock is in (0 before the start). */
  round: number;
  roundStarts: number[];
  nextRoundAt: number | null;
  serverNow: number;
  boss: {
    id: string;
    name: string;
    element: string;
    hpMax: number | null;
    hpStart: number | null;
  } | null;
  /** The boss card at the finale's start (null in the lobby and when there is no fight). */
  card: BossCardV2 | null;
  /** The boss's rows, columns and rounds (null as `boss`). */
  bossDef: FightBossV2 | null;
  moveNames: Record<string, string>;
  fighters: FightCreatureV2[];
  names: FightNamesV2 | null;
  abilities: LiveAbilityV2[];
  /** Every event of rounds 1 to `round`. */
  events: readonly FightEvent[];
  bossHp: number | null;
  /** The carry the finale started from. */
  carry: FightCarryV2 | null;
  watching: string[];
  loot: LiveLootV2 | null;
}

// --- Shape checks ---

const isSlotPair = (value: unknown): value is readonly [number, number] =>
  Array.isArray(value) && value.length === 2 && isCount(value[0]) && isCount(value[1]);

const isActionKind = (value: unknown): value is FinaleActionKind =>
  value === 'rally' || value === 'shieldWall' || value === 'purge';

/** Whether a board event reads right: every field of its type, nothing else is looked at. */
export function isBoardEvent(value: unknown): value is BoardEvent {
  if (!isRecord(value) || !isStr(value['type'])) return false;
  switch (value['type']) {
    case 'round':
      return isCount(value['round']);
    case 'announce':
      return isStr(value['move']) && isArrayOf(value['slots'], isSlotPair);
    case 'bossTurn':
      return isCount(value['row']);
    case 'hit':
      return (
        isNullableStr(value['from']) &&
        isNullableStr(value['to']) &&
        isCount(value['damage']) &&
        isBool(value['crit']) &&
        isBool(value['blocked']) &&
        isBool(value['dodged']) &&
        (value['by'] === undefined || isStr(value['by'])) &&
        (value['critBp'] === undefined || isCount(value['critBp'])) &&
        (value['bonus'] === undefined || isBool(value['bonus']))
      );
    case 'intercept':
      return isStr(value['guard']) && isStr(value['who']);
    case 'cover':
      return (
        isStr(value['guard']) &&
        isStr(value['who']) &&
        isCount(value['prevented']) &&
        (value['byKnack'] === undefined || isBool(value['byKnack']))
      );
    case 'boost':
      return isStr(value['who']) && isStr(value['by']) && isCount(value['bp']);
    case 'counter':
      return (
        isStr(value['from']) &&
        isCount(value['damage']) &&
        (value['byKnack'] === undefined || isBool(value['byKnack']))
      );
    case 'sure':
      return isStr(value['who']) && isStr(value['by']);
    case 'mark':
      return isStr(value['element']) && isCount(value['stacks']) && isBool(value['sealed']);
    case 'shed':
      return isArrayOf(value['marks'], isStr);
    case 'reaction':
      return (
        isStr(value['by']) &&
        isStr(value['mark']) &&
        isCount(value['spent']) &&
        isCount(value['bonus']) &&
        isCount(value['left']) &&
        (value['split'] === undefined || isBool(value['split']))
      );
    case 'heal':
      return (
        isStr(value['who']) &&
        isCount(value['amount']) &&
        (value['by'] === undefined || isStr(value['by']))
      );
    case 'knockout':
      return isStr(value['who']);
    case 'forgo':
      return isStr(value['who']);
    case 'silence':
      return isStr(value['who']) && isCount(value['turns']);
    case 'store':
      return isStr(value['who']) && isCount(value['value']);
    case 'boggedDown':
      return isCount(value['stacks']) && (value['shook'] === undefined || isCount(value['shook']));
    case 'escalation':
      return (
        isCount(value['count']) &&
        isCount(value['step']) &&
        isCount(value['fall']) &&
        isBool(value['phase']) &&
        isBool(value['phaseNext'])
      );
    case 'fizzle':
      return (
        (value['state'] === 'on' || value['state'] === 'off' || value['state'] === 'blocked') &&
        (value['by'] === undefined || isStr(value['by'])) &&
        (value['mark'] === undefined || isStr(value['mark']))
      );
    case 'resistance':
      return (
        (value['reaction'] === undefined || isStr(value['reaction'])) &&
        (value['element'] === undefined || isStr(value['element']))
      );
    case 'action':
      return (
        isActionKind(value['kind']) &&
        (value['row'] === undefined || isCount(value['row'])) &&
        isStr(value['by'])
      );
    case 'end':
      return (
        isCount(value['round']) &&
        isBool(value['won']) &&
        isBool(value['wiped']) &&
        isInt(value['bossHp'])
      );
    default:
      return false;
  }
}

/**
 * A stored fight written before the debuff was renamed (2026-11-13) names its board event `mired`. The payload is freshly parsed
 * JSON, so the old type is rewritten in place to the current one before the shape check; nothing else holds the old name.
 */
const migrateLegacyBoard = (value: unknown): void => {
  if (!isRecord(value) || !isRecord(value['board'])) return;
  if (value['board']['type'] === 'mired') value['board']['type'] = 'boggedDown';
};

export const isFightEventV2 = (value: unknown): value is FightEvent =>
  (migrateLegacyBoard(value), true) &&
  isRecord(value) &&
  isCount(value['round']) &&
  isCount(value['turn']) &&
  isStr(value['kind']) &&
  isStr(value['text']) &&
  (value['board'] === undefined || isBoardEvent(value['board']));

const isStrRecord = (value: unknown): value is Record<string, string> =>
  isRecord(value) && Object.values(value).every(isStr);

const isNames = (value: unknown): value is FightNamesV2 =>
  isRecord(value) && isStrRecord(value['players']) && isStrRecord(value['creatures']);

const isCreature = (value: unknown): value is FightCreatureV2 =>
  isRecord(value) &&
  isStr(value['key']) &&
  isStr(value['name']) &&
  isStr(value['species']) &&
  isStr(value['element']) &&
  isStr(value['role']) &&
  isNullableInt(value['level']) &&
  isStr(value['owner']) &&
  isCount(value['row']) &&
  isCount(value['col']) &&
  isNullableStr(value['knack']) &&
  isNullableStr(value['knackName']) &&
  isArrayOf(value['talents'], isStr) &&
  isPositiveInt(value['maxHp']) &&
  isCount(value['startHp']) &&
  (value['shiny'] === undefined || typeof value['shiny'] === 'boolean');

/** The boss's own numbers the stage draws (the server sends the whole definition; the rest is not read). */
const bossOf = (value: unknown): FightBossV2 | null =>
  isRecord(value) &&
  isStr(value['id']) &&
  isStr(value['name']) &&
  isStr(value['element']) &&
  isPositiveInt(value['hp']) &&
  isPositiveInt(value['rows']) &&
  isPositiveInt(value['cols']) &&
  isPositiveInt(value['rounds'])
    ? {
        id: value['id'],
        name: value['name'],
        element: value['element'],
        hp: value['hp'],
        rows: value['rows'],
        cols: value['cols'],
        rounds: value['rounds'],
      }
    : null;

const carryOf = (value: unknown): FightCarryV2 | null => {
  if (!isRecord(value) || !isInt(value['bossHp']) || !isRecord(value['hp'])) return null;
  if (!Object.values(value['hp']).every(isInt) || !isArrayOf(value['out'], isStr)) return null;
  return { bossHp: value['bossHp'], hp: value['hp'] as Record<string, number>, out: value['out'] };
};

const isAction = (value: unknown): value is FinaleAction =>
  isRecord(value) &&
  isPositiveInt(value['round']) &&
  isActionKind(value['kind']) &&
  (value['row'] === undefined || isCount(value['row'])) &&
  isStr(value['by']);

const isLiveAbility = (value: unknown): value is LiveAbilityV2 =>
  isRecord(value) &&
  isStr(value['key']) &&
  isStr(value['alias']) &&
  isStr(value['abilityId']) &&
  isActionKind(value['kind']) &&
  (value['mode'] === 'default' || value['mode'] === 'held' || value['mode'] === 'fired') &&
  isBool(value['autoFire']) &&
  isBool(value['fired']) &&
  (value['firedAtRound'] === null || isPositiveInt(value['firedAtRound'])) &&
  (value['fireAtRound'] === null || isPositiveInt(value['fireAtRound'])) &&
  isCount(value['defaultRound']) &&
  (value['row'] === null || isCount(value['row']));

const isLoot = (value: unknown): value is LiveLootV2 =>
  isRecord(value) &&
  isBool(value['cleared']) &&
  isCount(value['essence']) &&
  (value['rankChange'] === null || isRankChange(value['rankChange'])) &&
  (value['festivalGrant'] === null || isFestivalGrant(value['festivalGrant']));

/** Whether a payload is a combat v2 one: the replay and the live snapshot say `rules: 2`. */
export const isRulesV2 = (value: unknown): boolean => isRecord(value) && value['rules'] === 2;

export function parseReplayV2(data: unknown): ReplayViewV2 {
  const fail = (): never => {
    throw new Error('the server returned an unexpected replay');
  };
  if (!isRecord(data) || data['rules'] !== 2) return fail();
  const boss = bossOf(data['boss']);
  const carry = carryOf(data['carry']);
  if (
    boss === null ||
    carry === null ||
    !isStr(data['weekId']) ||
    !isCount(data['party']) ||
    !isStr(data['phase']) ||
    !PHASES.includes(data['phase']) ||
    !isCount(data['stage']) ||
    !isInt(data['at']) ||
    !isStrRecord(data['moveNames']) ||
    !isCard(data['card']) ||
    !isCount(data['rounds']) ||
    !isBool(data['cleared']) ||
    !isBool(data['kill']) ||
    !isCount(data['bossHpMax']) ||
    !isInt(data['bossHpStart']) ||
    !isInt(data['bossHpEnd']) ||
    !isNullableStr(data['you']) ||
    !isArrayOf(data['fighters'], isCreature) ||
    !(data['actions'] === null || isArrayOf(data['actions'], isAction)) ||
    !isArrayOf(data['events'], isFightEventV2) ||
    !isNames(data['names'])
  ) {
    return fail();
  }
  return { ...(data as unknown as ReplayViewV2), boss, carry };
}

export function parseLiveV2(data: unknown): LiveSnapshotV2 {
  const fail = (): never => {
    throw new Error('the server returned an unexpected finale state');
  };
  if (!isRecord(data) || data['rules'] !== 2) return fail();
  const boss = data['boss'];
  const bossDef = data['bossDef'] === null ? null : bossOf(data['bossDef']);
  const carry = data['carry'] === null ? null : carryOf(data['carry']);
  if (
    !(
      data['status'] === 'none' ||
      data['status'] === 'lobby' ||
      data['status'] === 'live' ||
      data['status'] === 'done'
    ) ||
    data['practice'] !== false ||
    !isStr(data['week']) ||
    !isNullableInt(data['party']) ||
    !isNullableStr(data['you']) ||
    !isNullableInt(data['startsAt']) ||
    !isPositiveInt(data['roundMs']) ||
    !isPositiveInt(data['rounds']) ||
    !isCount(data['round']) ||
    !isArrayOf(data['roundStarts'], isInt) ||
    !isNullableInt(data['nextRoundAt']) ||
    !isInt(data['serverNow']) ||
    !(
      boss === null ||
      (isRecord(boss) &&
        isStr(boss['id']) &&
        isStr(boss['name']) &&
        isStr(boss['element']) &&
        (boss['hpMax'] === null || isPositiveInt(boss['hpMax'])) &&
        (boss['hpStart'] === null || isCount(boss['hpStart'])))
    ) ||
    (data['bossDef'] !== null && bossDef === null) ||
    !(data['card'] === null || isCard(data['card'])) ||
    !isStrRecord(data['moveNames']) ||
    !isArrayOf(data['fighters'], isCreature) ||
    !(data['names'] === null || isNames(data['names'])) ||
    !isArrayOf(data['abilities'], isLiveAbility) ||
    !isArrayOf(data['events'], isFightEventV2) ||
    !(data['bossHp'] === null || isInt(data['bossHp'])) ||
    (data['carry'] !== null && carry === null) ||
    !isArrayOf(data['watching'], isStr) ||
    !(data['loot'] === null || isLoot(data['loot']))
  ) {
    return fail();
  }
  if (
    (data['status'] === 'live' || data['status'] === 'done') &&
    (data['boss'] === null || bossDef === null || data['card'] === null || data['names'] === null)
  ) {
    return fail();
  }
  return { ...(data as unknown as LiveSnapshotV2), bossDef, carry };
}

// --- After-action stats of a stage ---

/** The lean after-action numbers of a v2 stage (`buildStatsV2` of the worker). */
export interface StatsV2 {
  rules: 2;
  phase: FightPhaseV2;
  stage: number;
  slot: number;
  cleared: boolean;
  kill: boolean;
  rounds: number;
  boss: { id: string; name: string; hpMax: number; hpStart: number; hpEnd: number };
  players: { displayName: string; you: boolean; damage: number; knockouts: number }[];
  creatures: {
    name: string;
    species: string;
    owner: string | null;
    you: boolean;
    damage: number;
    hp: number;
    maxHp: number;
    out: boolean;
  }[];
  reactions: { total: number; byMark: Record<string, number> };
  knockouts: number;
  blocked: number;
  dodges: number;
  intercepts: number;
  healed: number;
}

export function parseStatsV2(data: unknown): StatsV2 {
  if (
    !isRecord(data) ||
    data['rules'] !== 2 ||
    !isStr(data['phase']) ||
    !PHASES.includes(data['phase']) ||
    !isCount(data['stage']) ||
    !isCount(data['slot']) ||
    !isBool(data['cleared']) ||
    !isBool(data['kill']) ||
    !isCount(data['rounds']) ||
    !isRecord(data['boss']) ||
    !isStr(data['boss']['id']) ||
    !isStr(data['boss']['name']) ||
    !isCount(data['boss']['hpMax']) ||
    !isInt(data['boss']['hpStart']) ||
    !isInt(data['boss']['hpEnd']) ||
    !isArrayOf(
      data['players'],
      (p): p is StatsV2['players'][number] =>
        isRecord(p) &&
        isStr(p['displayName']) &&
        isBool(p['you']) &&
        isCount(p['damage']) &&
        isCount(p['knockouts']),
    ) ||
    !isArrayOf(
      data['creatures'],
      (c): c is StatsV2['creatures'][number] =>
        isRecord(c) &&
        isStr(c['name']) &&
        isStr(c['species']) &&
        isNullableStr(c['owner']) &&
        isBool(c['you']) &&
        isCount(c['damage']) &&
        isInt(c['hp']) &&
        isCount(c['maxHp']) &&
        isBool(c['out']),
    ) ||
    !isRecord(data['reactions']) ||
    !isCount(data['reactions']['total']) ||
    !isRecord(data['reactions']['byMark']) ||
    !Object.values(data['reactions']['byMark']).every(isCount) ||
    !isCount(data['knockouts']) ||
    !isCount(data['blocked']) ||
    !isCount(data['dodges']) ||
    !isCount(data['intercepts']) ||
    !isCount(data['healed'])
  ) {
    throw new Error('the server returned unexpected fight stats');
  }
  return data as unknown as StatsV2;
}

// --- Requests ---

/**
 * The server's name of a stage for the replay and stats routes (`phase1` and `phase2` of a v2 week are stages 1 and 2). A name the server
 * already uses (`stage1`, `stage2`) stays as it is: it is never turned into the finale.
 */
export const stagePhaseOf = (phase: 'phase1' | 'phase2' | 'finale' | FightPhaseV2): FightPhaseV2 =>
  phase === 'phase1' || phase === 'stage1'
    ? 'stage1'
    : phase === 'phase2' || phase === 'stage2'
      ? 'stage2'
      : 'finale';

export async function fetchReplayV2(
  weekId: string,
  party: number,
  phase: FightPhaseV2,
): Promise<ReplayViewV2> {
  const path = `/api/raid/replay/${encodeURIComponent(weekId)}/${String(party)}/${phase}`;
  return parseReplayV2(await apiFetch(path));
}

export async function fetchStatsV2(
  weekId: string,
  party: number,
  phase: FightPhaseV2,
): Promise<StatsV2> {
  const path = `/api/raid/stats/${encodeURIComponent(weekId)}/${String(party)}/${phase}`;
  return parseStatsV2(await apiFetch(path));
}

/** The caller's party's live finale on a v2 week. */
export async function fetchLiveV2(): Promise<LiveSnapshotV2> {
  return parseLiveV2(await apiFetch('/api/raid/live'));
}

/** Fire, Hold or Unhold the caller's one input (`row` goes with Fire of a Shield Wall only). Answers the new snapshot. */
export async function sendLiveActionV2(request: {
  key: string;
  action: 'fire' | 'hold' | 'unhold';
  row?: number;
}): Promise<LiveSnapshotV2> {
  return parseLiveV2(await apiFetch('/api/raid/live/action', jsonRequest('POST', request)));
}

/**
 * The after-action stats of a stage under whichever rules it was played: a combat v2 stage says `rules: 2`, any other is the shipped shape.
 * The card (`RaidSummary`) draws each its own way. `phase` is the name the route takes (`phase1`, `stage1`, `finale`...).
 */
export type StatsEither = { rules: 1; stats: AfterActionStats } | { rules: 2; stats: StatsV2 };

export async function fetchStatsEither(
  weekId: string,
  party: number,
  phase: string,
): Promise<StatsEither> {
  const path = `/api/raid/stats/${encodeURIComponent(weekId)}/${String(party)}/${encodeURIComponent(phase)}`;
  const data = await apiFetch(path);
  return isRulesV2(data)
    ? { rules: 2, stats: parseStatsV2(data) }
    : { rules: 1, stats: parseStats(data) };
}

/** A stored stage under whichever rules it was played (the replay route answers either shape). */
export type ReplayEither = { rules: 1; data: ReplayView } | { rules: 2; data: ReplayViewV2 };

export async function fetchReplayEither(
  weekId: string,
  party: number,
  phase: string,
): Promise<ReplayEither> {
  const path = `/api/raid/replay/${encodeURIComponent(weekId)}/${String(party)}/${encodeURIComponent(phase)}`;
  const data = await apiFetch(path);
  return isRulesV2(data)
    ? { rules: 2, data: parseReplayV2(data) }
    : { rules: 1, data: parseReplayView(data) };
}

/**
 * Raid API: response types, shape checks and requests. The shapes mirror the server's read models
 * (`apps/worker/src/raid-view.ts`). Everything here is display data; the server decides every
 * outcome, and the client only sends intents (team, placement, opt-out).
 */
import type { EventNames, FightEvent, Zone } from '@creatures/engine';
import { apiFetch } from './api';

export type RaidStatus = 'open' | 'phase1' | 'phase2' | 'finale';
export type RaidEventId = 'weekStart' | 'phase1' | 'phase2' | 'finale';
export type RaidPhaseId = 'phase1' | 'phase2' | 'finale';

export const RAID_EVENT_IDS: readonly RaidEventId[] = ['weekStart', 'phase1', 'phase2', 'finale'];
export const RAID_PHASE_IDS: readonly RaidPhaseId[] = ['phase1', 'phase2', 'finale'];

export interface RosterEntry {
  displayName: string;
  you: boolean;
  party: number;
}

export interface RowSlotView {
  slot: number;
  zone: Zone;
  creature: null | {
    ownerName: string;
    species: string;
    name: string;
    level: number;
    mine: boolean;
    /** Only present for the caller's own creatures. */
    creatureId?: string;
  };
}

export interface TeamCreatureView {
  creatureId: string;
  species: string;
  name: string;
  level: number;
  slot: number | null;
}

export interface PhaseResultView {
  phase: RaidPhaseId;
  at: number;
  cleared: boolean;
  rounds: number;
  bossHpMax: number;
  bossHpStart: number;
  bossHpEnd: number;
  damage: number;
  reactions: number;
  top: { displayName: string; damage: number; contribution: number; you: boolean }[];
  /** Essence the caller earned in this phase. */
  essence: number;
  /** Finale only: what it did to the server's rank; null until the ladder has moved, and for phases. */
  rankChange: RankChange | null;
  /** Finale only: the Festival creature the caller got; null otherwise. */
  festivalGrant: FestivalGrant | null;
}

/** The vague "how ready your team looks" band of a party. Never a number. */
export type ReadinessBand = 'long_shot' | 'even' | 'likely' | 'strong';
export const READINESS_BANDS: readonly ReadinessBand[] = ['long_shot', 'even', 'likely', 'strong'];

/** What a finale did to the server's Boss Rank. */
export interface RankChange {
  /** The server's rank for the week that was played. */
  before: number;
  /** The server's rank for the next week. */
  after: number;
  /** The week was a Festival: a win does not raise the rank, and the rank eases afterwards. */
  festival: boolean;
  /** At least half of the server's parties won. */
  serverWon: boolean;
}

/** The Festival creature a finale gave the caller. */
export interface FestivalGrant {
  species: string;
  outcome: 'new' | 'fused' | 'converted';
  /** Only for `fused`: the creature's fusion count now. */
  fusionCount?: number;
  /** Only for `converted`: the Bait it was worth. */
  bait?: number;
  firstOnServer: boolean;
}

/** The loot of a finale the player took part in, shown once as a reveal. */
export interface RaidReveal {
  week: string;
  /** The caller's party in that finale: with `week`, the key of its after-action stats. */
  party: number;
  cleared: boolean;
  /** Everything the finale paid the caller, as one figure. */
  essence: number;
  /** The ladder's move; null until every party of the server has finished (and for old weeks). */
  rankChange: RankChange | null;
  /** The Festival creature the caller got, or null. */
  festivalGrant: FestivalGrant | null;
}

/** One ability the caller brings to the finale, or could once the creature is trained. */
export interface AbilityPreview {
  /** The key it will have in the fight. Missing for a locked ability: it will not be there. */
  key?: string;
  abilityId: string;
  /** The caller's team creature it belongs to; null for the basic ability. */
  creatureId: string | null;
  /** The creature's species; null for the basic ability. */
  species: string | null;
  unlocked: boolean;
  /** The creature level that unlocks it. */
  unlockLevel: number;
  /** The caller's Auto fire setting for the finale (on unless they turned it off). */
  autoFire: boolean;
}

export interface RaidView {
  weekId: string;
  status: RaidStatus;
  timezone: string;
  boss: {
    id: string;
    name: string;
    element: string;
    turnOrder: string;
    gimmicks: { id: string; name: string }[];
    finaleRounds: number;
  };
  /** The server's Boss Rank this week; null for a week from before ranks, or while nobody is in. */
  rank: number | null;
  /** The rank the boss fights at (lower in a Festival week). Null with `rank`. */
  effectiveRank: number | null;
  /** A Festival week: easier boss, bonus Essence, a creature for every winner. */
  festival: boolean;
  /** The Festival creature's species id in a Festival week, else null. */
  festivalCreature: string | null;
  /** Where the week sits in its season; `week` is 1 to 5, the 5th being the Festival. */
  season: { index: number; week: number } | null;
  /** The highest rank the server has cleared in a normal week; null until it has cleared one. */
  bestRank: number | null;
  schedule: Record<RaidEventId, number>;
  next: { event: RaidEventId; at: number } | null;
  serverNow: number;
  roster: RosterEntry[];
  parties: { party: number; size: number }[];
  you: {
    inRoster: boolean;
    optOut: boolean;
    party: number | null;
    canEdit: boolean;
    canOptOut: boolean;
    team: { mode: 'auto' | 'chosen'; creatures: TeamCreatureView[] } | null;
    /** The finale ability: `chosen` is false when it was assigned automatically. Null outside a party. */
    ability: { abilityId: string; chosen: boolean } | null;
    /** Everything the caller brings to the finale with their current team: basic ability first. */
    abilities: AbilityPreview[];
    /** A finale result the player has not seen yet. */
    reveal: RaidReveal | null;
  };
  party: null | {
    party: number;
    rowLength: number;
    row: RowSlotView[];
    guests: boolean;
    bossHp: { max: number; current: number } | null;
    adaptation: { description: string; rule: string | null; target: string | null } | null;
    results: PhaseResultView[];
    /** How ready the party's team looks; null when there is no band (the finale has started). */
    readiness: ReadinessBand | null;
  };
}

export interface ReplayRowEntry {
  position: number;
  id: string;
  name: string;
  species: string;
  element: string;
  role: string;
  level: number;
  /** An opaque per-fight player key (see `names.players`), or null for a guest. */
  owner: string | null;
}

export interface ReplayView {
  weekId: string;
  party: number;
  phase: RaidPhaseId;
  at: number;
  boss: { id: string; name: string };
  rounds: number;
  cleared: boolean;
  bossHpMax: number;
  bossHpStart: number;
  bossHpEnd: number;
  /** The caller's opaque owner key in this fight (see `ReplayRowEntry.owner`), or null if not in it. */
  you: string | null;
  row: ReplayRowEntry[];
  events: FightEvent[];
  names: EventNames;
}

// --- Shape checks ---

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export const isStr = (value: unknown): value is string => typeof value === 'string';
export const isBool = (value: unknown): value is boolean => typeof value === 'boolean';
export const isInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value);
export const isNullableStr = (value: unknown): value is string | null =>
  value === null || isStr(value);
export const isArrayOf = <T>(value: unknown, check: (item: unknown) => item is T): value is T[] =>
  Array.isArray(value) && value.every(check);
const isStrRecord = (value: unknown): value is Record<string, string> =>
  isRecord(value) && Object.values(value).every(isStr);

const isStatus = (value: unknown): value is RaidStatus =>
  value === 'open' || value === 'phase1' || value === 'phase2' || value === 'finale';
const isEventId = (value: unknown): value is RaidEventId =>
  RAID_EVENT_IDS.some((id) => id === value);
const isPhaseId = (value: unknown): value is RaidPhaseId =>
  RAID_PHASE_IDS.some((id) => id === value);
const isZone = (value: unknown): value is Zone =>
  value === 'front' || value === 'middle' || value === 'back';

function isRosterEntry(value: unknown): value is RosterEntry {
  return (
    isRecord(value) && isStr(value['displayName']) && isBool(value['you']) && isInt(value['party'])
  );
}

function isRowSlot(value: unknown): value is RowSlotView {
  if (!isRecord(value) || !isInt(value['slot']) || !isZone(value['zone'])) return false;
  const c = value['creature'];
  if (c === null) return true;
  return (
    isRecord(c) &&
    isStr(c['ownerName']) &&
    isStr(c['species']) &&
    isStr(c['name']) &&
    isInt(c['level']) &&
    isBool(c['mine']) &&
    (c['creatureId'] === undefined || isStr(c['creatureId']))
  );
}

function isTeamCreature(value: unknown): value is TeamCreatureView {
  return (
    isRecord(value) &&
    isStr(value['creatureId']) &&
    isStr(value['species']) &&
    isStr(value['name']) &&
    isInt(value['level']) &&
    (value['slot'] === null || isInt(value['slot']))
  );
}

function isResult(value: unknown): value is PhaseResultView {
  return (
    isRecord(value) &&
    isPhaseId(value['phase']) &&
    isInt(value['at']) &&
    isBool(value['cleared']) &&
    isInt(value['rounds']) &&
    isInt(value['bossHpMax']) &&
    isInt(value['bossHpStart']) &&
    isInt(value['bossHpEnd']) &&
    isInt(value['damage']) &&
    isInt(value['reactions']) &&
    isInt(value['essence']) &&
    (value['rankChange'] === null || isRankChange(value['rankChange'])) &&
    (value['festivalGrant'] === null || isFestivalGrant(value['festivalGrant'])) &&
    isArrayOf(
      value['top'],
      (t): t is PhaseResultView['top'][number] =>
        isRecord(t) &&
        isStr(t['displayName']) &&
        isInt(t['damage']) &&
        isInt(t['contribution']) &&
        isBool(t['you']),
    )
  );
}

function isScheduleRecord(value: unknown): value is Record<RaidEventId, number> {
  return isRecord(value) && RAID_EVENT_IDS.every((id) => isInt(value[id]));
}

/** A rank is a whole number from 1, or null. */
const isNullableRank = (value: unknown): value is number | null =>
  value === null || (isInt(value) && value >= 1);

function isSeason(value: unknown): value is NonNullable<RaidView['season']> {
  return (
    isRecord(value) &&
    isInt(value['index']) &&
    isInt(value['week']) &&
    value['week'] >= 1 &&
    value['week'] <= 5
  );
}

function isBoss(value: unknown): value is RaidView['boss'] {
  return (
    isRecord(value) &&
    isStr(value['id']) &&
    isStr(value['name']) &&
    isStr(value['element']) &&
    isStr(value['turnOrder']) &&
    isInt(value['finaleRounds']) &&
    isArrayOf(
      value['gimmicks'],
      (g): g is { id: string; name: string } => isRecord(g) && isStr(g['id']) && isStr(g['name']),
    )
  );
}

function isAbilityPreview(value: unknown): value is AbilityPreview {
  return (
    isRecord(value) &&
    (value['key'] === undefined || isStr(value['key'])) &&
    isStr(value['abilityId']) &&
    isNullableStr(value['creatureId']) &&
    isNullableStr(value['species']) &&
    isBool(value['unlocked']) &&
    isInt(value['unlockLevel']) &&
    isBool(value['autoFire'])
  );
}

function isAbilityPick(value: unknown): value is NonNullable<RaidView['you']['ability']> {
  return isRecord(value) && isStr(value['abilityId']) && isBool(value['chosen']);
}

export function isRankChange(value: unknown): value is RankChange {
  return (
    isRecord(value) &&
    isInt(value['before']) &&
    isInt(value['after']) &&
    isBool(value['festival']) &&
    isBool(value['serverWon'])
  );
}

export function isFestivalGrant(value: unknown): value is FestivalGrant {
  return (
    isRecord(value) &&
    isStr(value['species']) &&
    (value['outcome'] === 'new' ||
      value['outcome'] === 'fused' ||
      value['outcome'] === 'converted') &&
    (value['fusionCount'] === undefined || isInt(value['fusionCount'])) &&
    (value['bait'] === undefined || isInt(value['bait'])) &&
    isBool(value['firstOnServer'])
  );
}

function isReveal(value: unknown): value is RaidReveal {
  return (
    isRecord(value) &&
    isStr(value['week']) &&
    isInt(value['party']) &&
    isBool(value['cleared']) &&
    isInt(value['essence']) &&
    (value['rankChange'] === null || isRankChange(value['rankChange'])) &&
    (value['festivalGrant'] === null || isFestivalGrant(value['festivalGrant']))
  );
}

const isReadiness = (value: unknown): value is ReadinessBand =>
  READINESS_BANDS.some((band) => band === value);

function isYou(value: unknown): value is RaidView['you'] {
  if (
    !isRecord(value) ||
    !isBool(value['inRoster']) ||
    !isBool(value['optOut']) ||
    !(value['party'] === null || isInt(value['party'])) ||
    !isBool(value['canEdit']) ||
    !isBool(value['canOptOut']) ||
    !(value['ability'] === null || isAbilityPick(value['ability'])) ||
    !isArrayOf(value['abilities'], isAbilityPreview) ||
    !(value['reveal'] === null || isReveal(value['reveal']))
  ) {
    return false;
  }
  const team = value['team'];
  if (team === null) return true;
  return (
    isRecord(team) &&
    (team['mode'] === 'auto' || team['mode'] === 'chosen') &&
    isArrayOf(team['creatures'], isTeamCreature)
  );
}

function isPartyView(value: unknown): value is NonNullable<RaidView['party']> {
  if (
    !isRecord(value) ||
    !isInt(value['party']) ||
    !isInt(value['rowLength']) ||
    !isArrayOf(value['row'], isRowSlot) ||
    !isBool(value['guests']) ||
    !isArrayOf(value['results'], isResult) ||
    !(value['readiness'] === null || isReadiness(value['readiness']))
  ) {
    return false;
  }
  const hp = value['bossHp'];
  const adaptation = value['adaptation'];
  return (
    (hp === null || (isRecord(hp) && isInt(hp['max']) && isInt(hp['current']))) &&
    (adaptation === null ||
      (isRecord(adaptation) &&
        isStr(adaptation['description']) &&
        isNullableStr(adaptation['rule']) &&
        isNullableStr(adaptation['target'])))
  );
}

export function parseRaidView(data: unknown): RaidView {
  if (
    !isRecord(data) ||
    !isStr(data['weekId']) ||
    !isStatus(data['status']) ||
    !isStr(data['timezone']) ||
    !isBoss(data['boss']) ||
    !isScheduleRecord(data['schedule']) ||
    !isNullableRank(data['rank']) ||
    !isNullableRank(data['effectiveRank']) ||
    !isBool(data['festival']) ||
    !isNullableStr(data['festivalCreature']) ||
    !(data['season'] === null || isSeason(data['season'])) ||
    !isNullableRank(data['bestRank']) ||
    !(
      data['next'] === null ||
      (isRecord(data['next']) && isEventId(data['next']['event']) && isInt(data['next']['at']))
    ) ||
    !isInt(data['serverNow']) ||
    !isArrayOf(data['roster'], isRosterEntry) ||
    !isArrayOf(
      data['parties'],
      (p): p is { party: number; size: number } =>
        isRecord(p) && isInt(p['party']) && isInt(p['size']),
    ) ||
    !isYou(data['you']) ||
    !(data['party'] === null || isPartyView(data['party']))
  ) {
    throw new Error('the server returned an unexpected raid state');
  }
  return data as unknown as RaidView;
}

/** Every event type the engine can emit; anything else is refused rather than half-displayed. */
const EVENT_TYPES: ReadonlySet<string> = new Set([
  'round_start',
  'support_buff',
  'ability',
  'adaptation',
  'turn',
  'skip',
  'hit',
  'mark',
  'reaction',
  'gimmick',
  'boss_hit',
  'knockout',
  'silence',
  'round_end',
]);

export const isEvent = (value: unknown): value is FightEvent =>
  isRecord(value) && isStr(value['t']) && EVENT_TYPES.has(value['t']) && isInt(value['round']);

export function isReplayRow(value: unknown): value is ReplayRowEntry {
  return (
    isRecord(value) &&
    isInt(value['position']) &&
    isStr(value['id']) &&
    isStr(value['name']) &&
    isStr(value['species']) &&
    isStr(value['element']) &&
    isStr(value['role']) &&
    isInt(value['level']) &&
    isNullableStr(value['owner'])
  );
}

export function isEventNames(value: unknown): value is EventNames {
  if (!isRecord(value) || !isStr(value['boss']) || !isStrRecord(value['creatures'])) return false;
  const optional = [
    'players',
    'reactions',
    'gimmicks',
    'abilities',
    'marks',
    'elements',
    'adaptations',
  ] as const;
  return optional.every((key) => value[key] === undefined || isStrRecord(value[key]));
}

export function parseReplayView(data: unknown): ReplayView {
  if (
    !isRecord(data) ||
    !isStr(data['weekId']) ||
    !isInt(data['party']) ||
    !isPhaseId(data['phase']) ||
    !isInt(data['at']) ||
    !(isRecord(data['boss']) && isStr(data['boss']['id']) && isStr(data['boss']['name'])) ||
    !isInt(data['rounds']) ||
    !isBool(data['cleared']) ||
    !isInt(data['bossHpMax']) ||
    !isInt(data['bossHpStart']) ||
    !isInt(data['bossHpEnd']) ||
    !isNullableStr(data['you']) ||
    !isArrayOf(data['row'], isReplayRow) ||
    !isArrayOf(data['events'], isEvent) ||
    !isEventNames(data['names'])
  ) {
    throw new Error('the server returned an unexpected replay');
  }
  return data as unknown as ReplayView;
}

// --- After-action stats (`GET /api/raid/stats/:week/:party/:phase`) ---

export type StatsOutcome = 'cleared' | 'missed' | 'wiped';

export interface StatsPlayer {
  displayName: string;
  you: boolean;
  damage: number;
  contribution: number;
}

export interface StatsCreature {
  /** Place among all creatures in the fight, by damage. */
  rank: number;
  name: string;
  species: string;
  /** The owner's display name, or null for a guest. */
  owner: string | null;
  you: boolean;
  damage: number;
  contribution: number;
}

export interface StatsReaction {
  name: string;
  count: number;
  reflected: number;
}

export interface StatsAbilityUse {
  player: string;
  you: boolean;
  ability: string;
  /** The creature it belongs to; null for a basic ability. */
  creature: string | null;
  round: number;
  byDefault: boolean;
}

export interface StatsKnockout {
  creature: string;
  species: string;
  owner: string | null;
  you: boolean;
  round: number;
}

export interface StatsAdaptation {
  name: string;
  target: string | null;
  resistBp: number;
  purged: boolean;
  purgedRound: number | null;
  restoredRound: number | null;
}

export interface AfterActionStats {
  phase: RaidPhaseId;
  outcome: StatsOutcome;
  /** "Close one!": missed by little, or won with little to spare (the server decides). */
  close: boolean;
  rounds: number;
  maxRounds: number;
  boss: {
    hpMax: number;
    hpStart: number;
    hpEnd: number;
    /** The share of the whole pool left, in basis points. */
    leftBp: number;
    /** HP that had to come off the pool for the stage to be cleared. */
    needed: number;
    /** HP that has come off the pool. */
    lost: number;
  };
  players: StatsPlayer[];
  creatures: StatsCreature[];
  reactions: StatsReaction[];
  reactionsTotal: number;
  abilities: { used: StatsAbilityUse[]; unused: number };
  knockouts: StatsKnockout[];
  adaptation: StatsAdaptation | null;
}

const isCount = (value: unknown): value is number => isInt(value) && value >= 0;

const isStatsPlayer = (value: unknown): value is StatsPlayer =>
  isRecord(value) &&
  isStr(value['displayName']) &&
  isBool(value['you']) &&
  isCount(value['damage']) &&
  isCount(value['contribution']);

const isStatsCreature = (value: unknown): value is StatsCreature =>
  isRecord(value) &&
  isInt(value['rank']) &&
  isStr(value['name']) &&
  isStr(value['species']) &&
  isNullableStr(value['owner']) &&
  isBool(value['you']) &&
  isCount(value['damage']) &&
  isCount(value['contribution']);

const isStatsReaction = (value: unknown): value is StatsReaction =>
  isRecord(value) && isStr(value['name']) && isCount(value['count']) && isCount(value['reflected']);

const isStatsAbilityUse = (value: unknown): value is StatsAbilityUse =>
  isRecord(value) &&
  isStr(value['player']) &&
  isBool(value['you']) &&
  isStr(value['ability']) &&
  isNullableStr(value['creature']) &&
  isInt(value['round']) &&
  isBool(value['byDefault']);

const isStatsKnockout = (value: unknown): value is StatsKnockout =>
  isRecord(value) &&
  isStr(value['creature']) &&
  isStr(value['species']) &&
  isNullableStr(value['owner']) &&
  isBool(value['you']) &&
  isInt(value['round']);

const isNullableInt = (value: unknown): value is number | null => value === null || isInt(value);

const isStatsAdaptation = (value: unknown): value is StatsAdaptation =>
  isRecord(value) &&
  isStr(value['name']) &&
  isNullableStr(value['target']) &&
  isCount(value['resistBp']) &&
  isBool(value['purged']) &&
  isNullableInt(value['purgedRound']) &&
  isNullableInt(value['restoredRound']);

const isStatsOutcome = (value: unknown): value is StatsOutcome =>
  value === 'cleared' || value === 'missed' || value === 'wiped';

/** Refuses anything that is not exactly the after-action shape; the card shows nothing half-parsed. */
export function parseStats(data: unknown): AfterActionStats {
  if (
    !isRecord(data) ||
    !isPhaseId(data['phase']) ||
    !isStatsOutcome(data['outcome']) ||
    !isBool(data['close']) ||
    !isCount(data['rounds']) ||
    !isCount(data['maxRounds']) ||
    !isCount(data['reactionsTotal']) ||
    !isRecord(data['boss']) ||
    !isCount(data['boss']['hpMax']) ||
    !isCount(data['boss']['hpStart']) ||
    !isCount(data['boss']['hpEnd']) ||
    !isCount(data['boss']['leftBp']) ||
    !isCount(data['boss']['needed']) ||
    !isInt(data['boss']['lost']) ||
    !isArrayOf(data['players'], isStatsPlayer) ||
    !isArrayOf(data['creatures'], isStatsCreature) ||
    !isArrayOf(data['reactions'], isStatsReaction) ||
    !isRecord(data['abilities']) ||
    !isArrayOf(data['abilities']['used'], isStatsAbilityUse) ||
    !isCount(data['abilities']['unused']) ||
    !isArrayOf(data['knockouts'], isStatsKnockout) ||
    !(data['adaptation'] === null || isStatsAdaptation(data['adaptation']))
  ) {
    throw new Error('the server returned unexpected fight stats');
  }
  return data as unknown as AfterActionStats;
}

// --- Requests ---

function send(path: string, method: string, body: unknown): Promise<unknown> {
  return apiFetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function fetchRaid(): Promise<RaidView> {
  return parseRaidView(await apiFetch('/api/raid'));
}

/** `creatureIds`: exactly three of the player's creatures, or null for the automatic team. */
export async function setRaidTeam(creatureIds: readonly string[] | null): Promise<RaidView> {
  return parseRaidView(await send('/api/raid/team', 'PUT', { creatureIds }));
}

export async function placeCreature(creatureId: string, slot: number): Promise<RaidView> {
  return parseRaidView(await send('/api/raid/placement', 'PUT', { creatureId, slot }));
}

export async function unplaceCreature(creatureId: string): Promise<RaidView> {
  return parseRaidView(await send('/api/raid/placement', 'DELETE', { creatureId }));
}

export async function setRaidOptOut(optOut: boolean): Promise<RaidView> {
  return parseRaidView(await send('/api/raid/opt-out', 'PUT', { optOut }));
}

export async function fetchReplay(
  weekId: string,
  party: number,
  phase: RaidPhaseId,
): Promise<ReplayView> {
  // The week id comes from the server's own view; encode anyway so a path can never be injected.
  const path = `/api/raid/replay/${encodeURIComponent(weekId)}/${String(party)}/${phase}`;
  return parseReplayView(await apiFetch(path));
}

/** The after-action stats of a resolved stage of the caller's own party. */
export async function fetchStats(
  weekId: string,
  party: number,
  phase: RaidPhaseId,
): Promise<AfterActionStats> {
  const path = `/api/raid/stats/${encodeURIComponent(weekId)}/${String(party)}/${phase}`;
  return parseStats(await apiFetch(path));
}

/** Picks the finale ability (any time before the finale starts). */
export async function setRaidAbility(abilityId: string): Promise<RaidView> {
  return parseRaidView(await send('/api/raid/ability', 'PUT', { abilityId }));
}

/**
 * The Auto fire setting of one ability for this week's finale: `target` is `basic` or the id of one
 * of the caller's own team creatures. Allowed until the finale starts. Answers with the new view.
 */
export async function setRaidAutofire(target: string, on: boolean): Promise<RaidView> {
  return parseRaidView(await send('/api/raid/autofire', 'PUT', { target, on }));
}

/** Marks a finale reveal as seen. Idempotent on the server. */
export async function markRevealSeen(week: string): Promise<RaidView> {
  return parseRaidView(await send('/api/raid/reveal-seen', 'POST', { week }));
}

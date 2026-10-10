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
  jackpot: string[];
}

/** The loot of a finale the player took part in, shown once as a reveal. */
export interface RaidReveal {
  week: string;
  cleared: boolean;
  essence: number;
  jackpot: null | { essence: number; firstOnServer: boolean };
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
    isArrayOf(value['jackpot'], isStr) &&
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

function isAbilityPick(value: unknown): value is NonNullable<RaidView['you']['ability']> {
  return isRecord(value) && isStr(value['abilityId']) && isBool(value['chosen']);
}

export function isJackpot(value: unknown): value is { essence: number; firstOnServer: boolean } {
  return isRecord(value) && isInt(value['essence']) && isBool(value['firstOnServer']);
}

function isReveal(value: unknown): value is RaidReveal {
  return (
    isRecord(value) &&
    isStr(value['week']) &&
    isBool(value['cleared']) &&
    isInt(value['essence']) &&
    (value['jackpot'] === null || isJackpot(value['jackpot']))
  );
}

function isYou(value: unknown): value is RaidView['you'] {
  if (
    !isRecord(value) ||
    !isBool(value['inRoster']) ||
    !isBool(value['optOut']) ||
    !(value['party'] === null || isInt(value['party'])) ||
    !isBool(value['canEdit']) ||
    !isBool(value['canOptOut']) ||
    !(value['ability'] === null || isAbilityPick(value['ability'])) ||
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
    !isArrayOf(value['results'], isResult)
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

/** Picks the finale ability (any time before the finale starts). */
export async function setRaidAbility(abilityId: string): Promise<RaidView> {
  return parseRaidView(await send('/api/raid/ability', 'PUT', { abilityId }));
}

/** Marks a finale reveal as seen. Idempotent on the server. */
export async function markRevealSeen(week: string): Promise<RaidView> {
  return parseRaidView(await send('/api/raid/reveal-seen', 'POST', { week }));
}

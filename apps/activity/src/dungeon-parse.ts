/**
 * Shape checks for what the dungeon routes answer. The Worker's own tests check these shapes against
 * its code (`dungeon-fixtures.test.ts`) and the same fixtures run through these functions here, so a
 * change on either side fails a test. Every parser throws a plain `Error` for an answer it does not
 * understand; nothing here repairs or guesses.
 */
import { ELEMENTS, RoleSchema } from '@creatures/game';
import { isExperienceView } from './experience';
import { isConvertedLoot, isGearLoot, isPartsBundle } from './gear-parse';
import { isEvent, isEventNames } from './raid-api';
import { isArrayOf, isBool, isCount, isInt, isRecord, isStr } from './parse-core';
import type {
  DungeonActResponse,
  DungeonEventView,
  DungeonKeepsakeView,
  DungeonMapNode,
  DungeonMapView,
  DungeonNodeKind,
  DungeonPack,
  DungeonPending,
  DungeonReplay,
  DungeonReplayRowEntry,
  DungeonRewards,
  DungeonRoomSummary,
  DungeonRunCreature,
  DungeonRunState,
  DungeonRunSummary,
  DungeonStartResponse,
  DungeonStepLog,
  DungeonTeamMember,
  DungeonTeamResponse,
  DungeonToday,
} from './dungeon-types';

const isElement = (value: unknown): boolean => (ELEMENTS as readonly unknown[]).includes(value);
const isRole = (value: unknown): boolean =>
  (RoleSchema.options as readonly unknown[]).includes(value);
const NODE_KINDS: readonly unknown[] = [
  'fight',
  'elite',
  'mystery',
  'cache',
  'camp',
  'boss',
  'door',
  'epic',
];
const isNodeKind = (value: unknown): value is DungeonNodeKind => NODE_KINDS.includes(value);

/** A record of whole numbers by creature id. */
const isHpMap = (value: unknown): value is Record<string, number> =>
  isRecord(value) && Object.values(value).every(isCount);

function isModifierText(value: unknown): boolean {
  return (
    isRecord(value) && isStr(value['id']) && isStr(value['name']) && isStr(value['description'])
  );
}

function isFoe(value: unknown): boolean {
  return (
    isRecord(value) &&
    isStr(value['id']) &&
    isStr(value['name']) &&
    isElement(value['element']) &&
    isCount(value['hpMax'])
  );
}

function isTeamMember(value: unknown): value is DungeonTeamMember {
  return (
    isRecord(value) &&
    isStr(value['id']) &&
    isStr(value['name']) &&
    isStr(value['speciesId']) &&
    isElement(value['element']) &&
    isRole(value['role']) &&
    isInt(value['level']) &&
    isCount(value['hpMax']) &&
    isCount(value['hpEnd'])
  );
}

function isRoomSummary(value: unknown): value is DungeonRoomSummary {
  return (
    isRecord(value) &&
    isCount(value['index']) &&
    (value['kind'] === 'foe' || value['kind'] === 'boss') &&
    (value['elite'] === undefined || isBool(value['elite'])) &&
    (value['epic'] === undefined || isBool(value['epic'])) &&
    isFoe(value['foe']) &&
    isModifierText(value['modifier']) &&
    isBool(value['played']) &&
    isBool(value['cleared']) &&
    isCount(value['rounds']) &&
    isCount(value['foeHpEnd'])
  );
}

function isRewards(value: unknown): value is DungeonRewards {
  if (!isRecord(value)) return false;
  const streak = value['streak'];
  return (
    isCount(value['bait']) &&
    isCount(value['essence']) &&
    isPartsBundle(value['parts']) &&
    isArrayOf(value['gear'], isGearLoot) &&
    isArrayOf(value['converted'], isConvertedLoot) &&
    (value['supplies'] === undefined || isArrayOf(value['supplies'], isStr)) &&
    (value['experience'] === undefined || isArrayOf(value['experience'], isExperienceView)) &&
    isBool(value['landmark']) &&
    (streak === null ||
      (isRecord(streak) &&
        isCount(streak['day']) &&
        isCount(streak['bait']) &&
        isCount(streak['essence']) &&
        isPartsBundle(streak['parts'])))
  );
}

const isOutcome = (value: unknown): boolean =>
  value === 'cleared' || value === 'home' || value === 'defeat';

/** Bait, Essence and scrap in the pack: whole numbers, none negative. */
function isPack(value: unknown): value is DungeonPack {
  return (
    isRecord(value) &&
    isCount(value['bait']) &&
    isCount(value['essence']) &&
    isCount(value['scrap']) &&
    (value['shards'] === undefined ||
      (isRecord(value['shards']) &&
        Object.entries(value['shards']).every(([kind, n]) => SHARD_KIND.test(kind) && isCount(n))))
  );
}

const SHARD_KIND = /^(?:tide|ember|grove|spark|mire)-shard$/;

function isKeepsake(value: unknown): value is DungeonKeepsakeView {
  return (
    isRecord(value) && isStr(value['id']) && isStr(value['name']) && isStr(value['description'])
  );
}

function isEventView(value: unknown): value is DungeonEventView {
  return (
    isRecord(value) &&
    isStr(value['id']) &&
    isStr(value['name']) &&
    isStr(value['text']) &&
    Array.isArray(value['options']) &&
    value['options'].length === 2 &&
    value['options'].every(
      (o: unknown) => isRecord(o) && isStr(o['label']) && isStr(o['description']),
    )
  );
}

/** What the boss chest banked, as the descent card shows it. */
function isBanked(value: unknown): boolean {
  return (
    isRecord(value) &&
    isArrayOf(value['gear'], isConvertedLoot) &&
    isArrayOf(value['supplies'], isStr) &&
    isPartsBundle(value['parts'])
  );
}

function isPending(value: unknown): value is DungeonPending {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  switch (value['kind']) {
    case 'event':
      return isEventView(value['event']);
    case 'camp':
      return isArrayOf(value['offers'], isKeepsake) && isCount(value['restBp']);
    case 'descend':
      return (
        isCount(value['level']) &&
        isCount(value['floors']) &&
        isCount(value['depthBonus']) &&
        isCount(value['catchBreathBp']) &&
        isCount(value['reviveBp']) &&
        isCount(value['newDepth']) &&
        isBanked(value['banked'])
      );
    default:
      return false;
  }
}

/** An optional keepsake: absent, or a whole one. */
const isOptionalKeepsake = (value: unknown): boolean => value === undefined || isKeepsake(value);

/** What a room of the path did (`DungeonStepLog`): one entry per room visited, each of a known shape. */
function isStepLog(value: unknown): value is DungeonStepLog {
  if (!isRecord(value) || !isStr(value['node'])) return false;
  const kind = value['kind'];
  switch (value['result']) {
    case 'fight':
      return (
        (kind === 'fight' || kind === 'elite' || kind === 'boss' || kind === 'epic') &&
        isBool(value['cleared']) &&
        isCount(value['rounds']) &&
        isCount(value['foeHpEnd']) &&
        isCount(value['foeHpMax']) &&
        isPack(value['loot']) &&
        isOptionalKeepsake(value['keepsake']) &&
        (value['supply'] === undefined || isBool(value['supply']))
      );
    case 'cache':
      return kind === 'cache' && isPack(value['loot']);
    case 'event':
      return (
        kind === 'mystery' &&
        isStr(value['event']) &&
        isStr(value['option']) &&
        isStr(value['outcome']) &&
        isPack(value['loot']) &&
        isOptionalKeepsake(value['keepsake'])
      );
    case 'camp':
      return (
        kind === 'camp' &&
        (value['choice'] === 'rest' ||
          value['choice'] === 'swap' ||
          value['choice'] === 'keepsake' ||
          value['choice'] === 'home') &&
        isStr(value['detail']) &&
        isOptionalKeepsake(value['keepsake'])
      );
    case 'pending':
      return (
        kind === 'camp' ||
        (kind === 'mystery' && isStr(value['event'])) ||
        (kind === 'descend' && isCount(value['level']))
      );
    case 'door':
      return kind === 'door' && isBool(value['added']);
    case 'chest':
      return (
        kind === 'boss' &&
        isCount(value['level']) &&
        isPack(value['loot']) &&
        isArrayOf(value['gear'], isConvertedLoot)
      );
    case 'descend':
      return (
        kind === 'descend' &&
        isCount(value['level']) &&
        isCount(value['healed']) &&
        (value['revived'] === undefined || isCount(value['revived']))
      );
    case 'home':
      return kind === 'descend' && isCount(value['level']);
    default:
      return false;
  }
}

function isMapNode(value: unknown): value is DungeonMapNode {
  if (!isRecord(value)) return false;
  const foe = value['foe'];
  const event = value['event'];
  return (
    isStr(value['id']) &&
    isCount(value['floor']) &&
    isCount(value['lane']) &&
    isNodeKind(value['kind']) &&
    isArrayOf(value['next'], isStr) &&
    (foe === undefined ||
      (isRecord(foe) &&
        isStr(foe['id']) &&
        isStr(foe['name']) &&
        isElement(foe['element']) &&
        (foe['kind'] === 'foe' || foe['kind'] === 'boss') &&
        isCount(foe['hpMax']) &&
        isBool(foe['elite']))) &&
    (value['modifier'] === undefined || isModifierText(value['modifier'])) &&
    (event === undefined || (isRecord(event) && isStr(event['id']) && isStr(event['name'])))
  );
}

function isMapView(value: unknown): value is DungeonMapView {
  return (
    isRecord(value) &&
    isCount(value['floors']) &&
    isArrayOf(value['nodes'], isMapNode) &&
    (value['level'] === undefined || isCount(value['level'])) &&
    (value['label'] === undefined || isStr(value['label'])) &&
    (value['crack'] === undefined || isBool(value['crack']))
  );
}

/** The Undercroft of a run: the levels drawn so far and how many rooms the carved door added. */
function isUndercroft(value: unknown): boolean {
  return (
    value === null ||
    (isRecord(value) && isArrayOf(value['maps'], isMapView) && isCount(value['marks']))
  );
}

function isRunCreature(value: unknown): value is DungeonRunCreature {
  return (
    isRecord(value) &&
    isStr(value['id']) &&
    isStr(value['name']) &&
    isStr(value['speciesId']) &&
    isElement(value['element']) &&
    isRole(value['role']) &&
    isInt(value['level']) &&
    isCount(value['hp']) &&
    isCount(value['hpMax']) &&
    isBool(value['treat'])
  );
}

/** The state of a run, open or done. */
function isRunState(value: unknown): value is DungeonRunState {
  if (!isRecord(value)) return false;
  const last = value['lastEvent'];
  return (
    isStr(value['id']) &&
    isStr(value['day']) &&
    isInt(value['attempt']) &&
    isCount(value['depth']) &&
    isBool(value['landmark']) &&
    (value['status'] === 'active' || value['status'] === 'done') &&
    (value['outcome'] === null || isOutcome(value['outcome'])) &&
    isCount(value['step']) &&
    isMapView(value['map']) &&
    isCount(value['level']) &&
    isUndercroft(value['undercroft']) &&
    (value['at'] === null || isStr(value['at'])) &&
    isArrayOf(value['path'], isStr) &&
    isArrayOf(value['reachable'], isStr) &&
    isPending(value['pending']) &&
    isArrayOf(value['team'], isRunCreature) &&
    isArrayOf(value['keepsakes'], isKeepsake) &&
    isPack(value['pack']) &&
    isCount(value['roomsCleared']) &&
    isBool(value['supply']) &&
    (last === null ||
      (isRecord(last) && isStr(last['name']) && isStr(last['option']) && isStr(last['outcome']))) &&
    (value['history'] === undefined || isArrayOf(value['history'], isStepLog))
  );
}

/** The Boon and Omen a run was fought under: content ids, the omen null when there was none. */
function isWeather(value: unknown): boolean {
  return (
    isRecord(value) && isStr(value['boon']) && (value['omen'] === null || isStr(value['omen']))
  );
}

/** The route of a finished run: its map, the rooms walked and what each did. */
function isRoute(value: unknown): boolean {
  return (
    isRecord(value) &&
    isMapView(value['map']) &&
    isArrayOf(value['path'], isStr) &&
    isArrayOf(value['history'], isStepLog) &&
    (value['undercroft'] === undefined || isArrayOf(value['undercroft'], isMapView))
  );
}

function isRunSummary(value: unknown): value is DungeonRunSummary {
  return (
    isRecord(value) &&
    isStr(value['id']) &&
    isStr(value['day']) &&
    isInt(value['attempt']) &&
    isCount(value['depth']) &&
    isCount(value['newDepth']) &&
    isBool(value['cleared']) &&
    (value['deepest'] === undefined || isCount(value['deepest'])) &&
    isCount(value['roomsCleared']) &&
    isBool(value['landmark']) &&
    isCount(value['streak']) &&
    isInt(value['createdAt']) &&
    isArrayOf(value['team'], isTeamMember) &&
    isArrayOf(value['rooms'], isRoomSummary) &&
    isRewards(value['rewards']) &&
    (value['weather'] === undefined || isWeather(value['weather'])) &&
    (value['outcome'] === undefined || isOutcome(value['outcome'])) &&
    (value['path'] === undefined || isArrayOf(value['path'], isNodeKind)) &&
    (value['pack'] === undefined ||
      (isRecord(value['pack']) &&
        isPack(value['pack']['found']) &&
        isPack(value['pack']['kept']))) &&
    (value['keepsakes'] === undefined || isArrayOf(value['keepsakes'], isKeepsake)) &&
    (value['route'] === undefined || isRoute(value['route']))
  );
}

const isDraftTeam = (value: unknown): value is (string | null)[] =>
  isArrayOf(value, (item): item is string | null => item === null || isStr(item));

/** The announced landmark boss: absent or null, or the depth and the floor boss's content id. */
function isLandmarkBoss(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (isRecord(value) && isCount(value['depth']) && isStr(value['foeId']))
  );
}

/** Today as the server sends it: `draftTeam` and `landmarkBoss` are optional (absent: none). */
function isToday(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const blocked = value['blocked'];
  return (
    isInt(value['serverNow']) &&
    isStr(value['day']) &&
    isStr(value['timezone']) &&
    isInt(value['resetsAt']) &&
    isCount(value['depth']) &&
    isBool(value['landmark']) &&
    isLandmarkBoss(value['landmarkBoss']) &&
    isCount(value['streak']) &&
    isCount(value['attemptsToday']) &&
    isCount(value['attemptsAllowed']) &&
    isBool(value['canRun']) &&
    (blocked === null || blocked === 'already_run' || blocked === 'need_creatures') &&
    (value['last'] === null || isRunSummary(value['last'])) &&
    (value['lastTeam'] === null || isArrayOf(value['lastTeam'], isStr)) &&
    (value['draftTeam'] === undefined ||
      value['draftTeam'] === null ||
      isDraftTeam(value['draftTeam'])) &&
    (value['map'] === undefined || value['map'] === null || isMapView(value['map'])) &&
    (value['active'] === undefined || value['active'] === null || isRunState(value['active']))
  );
}

/** A checked today, with an absent `draftTeam`, `landmarkBoss`, `map` or `active` made null. */
function readToday(value: unknown): DungeonToday | null {
  if (!isToday(value)) return null;
  const today = value as DungeonToday;
  return {
    ...today,
    draftTeam: today.draftTeam ?? null,
    landmarkBoss: today.landmarkBoss ?? null,
    map: today.map ?? null,
    active: today.active ?? null,
  };
}

function isReplayRoom(value: unknown): boolean {
  return (
    isRecord(value) &&
    isCount(value['index']) &&
    (value['kind'] === 'foe' || value['kind'] === 'boss') &&
    (value['elite'] === undefined || isBool(value['elite'])) &&
    (value['epic'] === undefined || isBool(value['epic'])) &&
    (value['node'] === undefined || isStr(value['node'])) &&
    (value['keepsakes'] === undefined || isArrayOf(value['keepsakes'], isKeepsake)) &&
    (value['row'] === undefined || isArrayOf(value['row'], isReplayRowEntry)) &&
    isFoe(value['foe']) &&
    isModifierText(value['modifier']) &&
    isBool(value['cleared']) &&
    isCount(value['rounds']) &&
    isHpMap(value['hpStart']) &&
    isHpMap(value['hpMax']) &&
    isArrayOf(value['events'], isEvent) &&
    isEventNames(value['names'])
  );
}

function isReplayRowEntry(value: unknown): value is DungeonReplayRowEntry {
  return (
    isRecord(value) &&
    isCount(value['position']) &&
    isStr(value['id']) &&
    isStr(value['name']) &&
    isStr(value['species']) &&
    isElement(value['element']) &&
    isRole(value['role']) &&
    isInt(value['level'])
  );
}

export function parseDungeonToday(data: unknown): DungeonToday {
  const today = readToday(data);
  if (today === null) throw new Error('the server returned an unexpected dungeon state');
  return today;
}

/** `POST /api/dungeon/start`: the run's first state and today. */
export function parseDungeonStart(data: unknown): DungeonStartResponse {
  const today = isRecord(data) ? readToday(data['today']) : null;
  if (!isRecord(data) || !isRunState(data['state']) || today === null) {
    throw new Error('the server returned an unexpected dungeon run');
  }
  return { state: data['state'], today };
}

/**
 * `POST /api/dungeon/act`: the new state, the fight just played (a replay room), and, when the run
 * ended, its summary and the fresh today. Each of the three is optional on its own.
 */
export function parseDungeonAct(data: unknown): DungeonActResponse {
  const bad = (): never => {
    throw new Error('the server returned an unexpected dungeon step');
  };
  if (!isRecord(data) || !isRunState(data['state'])) return bad();
  const answer: DungeonActResponse = { state: data['state'] };
  const room = data['room'];
  if (room !== undefined) {
    if (!isReplayRoom(room)) return bad();
    answer.room = room as DungeonReplay['rooms'][number];
  }
  const summary = data['summary'];
  if (summary !== undefined) {
    if (!isRunSummary(summary)) return bad();
    answer.summary = summary;
  }
  if (data['today'] !== undefined) {
    const today = readToday(data['today']);
    if (today === null) return bad();
    answer.today = today;
  }
  return answer;
}

/** The answer of `PUT /api/dungeon/team`. */
export function parseDungeonTeamSaved(data: unknown): DungeonTeamResponse {
  if (!isRecord(data) || !isDraftTeam(data['draftTeam'])) {
    throw new Error('the server returned an unexpected dungeon team');
  }
  return { draftTeam: data['draftTeam'] };
}

export function parseDungeonReplay(data: unknown): DungeonReplay {
  if (
    !isRecord(data) ||
    !isRunSummary(data['summary']) ||
    !isArrayOf(data['row'], isReplayRowEntry) ||
    !isArrayOf(data['rooms'], (r): r is DungeonReplay['rooms'][number] => isReplayRoom(r))
  ) {
    throw new Error('the server returned an unexpected dungeon replay');
  }
  return data as unknown as DungeonReplay;
}

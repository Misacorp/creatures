/**
 * Shape checks for what the dungeon routes answer. The Worker's own tests check these shapes against
 * its code (`dungeon-fixtures.test.ts`) and the same fixtures run through these functions here, so a
 * change on either side fails a test. Every parser throws a plain `Error` for an answer it does not
 * understand; nothing here repairs or guesses.
 */
import { GEAR_RARITIES } from '@creatures/game';
import { isPartsBundle } from './gear-parse';
import { isEvent, isEventNames, isRecord } from './raid-api';
import type {
  DungeonReplay,
  DungeonRewards,
  DungeonRoomSummary,
  DungeonRunResponse,
  DungeonRunSummary,
  DungeonTeamMember,
  DungeonToday,
} from './dungeon-types';

const isStr = (value: unknown): value is string => typeof value === 'string';
const isInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value);
const isCount = (value: unknown): value is number => isInt(value) && value >= 0;
const isBool = (value: unknown): value is boolean => typeof value === 'boolean';
const isArrayOf = <T>(value: unknown, guard: (item: unknown) => item is T): value is T[] =>
  Array.isArray(value) && value.every(guard);

const ELEMENTS: readonly unknown[] = ['tide', 'ember', 'grove', 'spark'];
const ROLES: readonly unknown[] = ['setter', 'payoff', 'support', 'guard'];
const isElement = (value: unknown): boolean => ELEMENTS.includes(value);
const isRole = (value: unknown): boolean => ROLES.includes(value);
const isRarity = (value: unknown): boolean => (GEAR_RARITIES as readonly unknown[]).includes(value);

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
    isArrayOf(
      value['gear'],
      (g): g is DungeonRewards['gear'][number] =>
        isRecord(g) && isStr(g['id']) && isStr(g['baseId']) && isRarity(g['rarity']),
    ) &&
    isArrayOf(
      value['converted'],
      (c): c is DungeonRewards['converted'][number] =>
        isRecord(c) && isStr(c['baseId']) && isRarity(c['rarity']),
    ) &&
    isBool(value['landmark']) &&
    (streak === null ||
      (isRecord(streak) &&
        isCount(streak['day']) &&
        isCount(streak['bait']) &&
        isCount(streak['essence']) &&
        isPartsBundle(streak['parts'])))
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
    isCount(value['roomsCleared']) &&
    isBool(value['landmark']) &&
    isCount(value['streak']) &&
    isInt(value['createdAt']) &&
    isArrayOf(value['team'], isTeamMember) &&
    isArrayOf(value['rooms'], isRoomSummary) &&
    isRewards(value['rewards'])
  );
}

function isToday(value: unknown): value is DungeonToday {
  if (!isRecord(value)) return false;
  const blocked = value['blocked'];
  return (
    isInt(value['serverNow']) &&
    isStr(value['day']) &&
    isStr(value['timezone']) &&
    isInt(value['resetsAt']) &&
    isCount(value['depth']) &&
    isBool(value['landmark']) &&
    isCount(value['streak']) &&
    isArrayOf(
      value['modifiers'],
      (m): m is DungeonToday['modifiers'][number] =>
        isModifierText(m) && isRecord(m) && isCount(m['room']),
    ) &&
    isCount(value['attemptsToday']) &&
    isCount(value['attemptsAllowed']) &&
    isBool(value['canRun']) &&
    (blocked === null || blocked === 'already_run' || blocked === 'need_creatures') &&
    (value['last'] === null || isRunSummary(value['last']))
  );
}

function isReplayRoom(value: unknown): boolean {
  return (
    isRecord(value) &&
    isCount(value['index']) &&
    (value['kind'] === 'foe' || value['kind'] === 'boss') &&
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

function isReplayRowEntry(value: unknown): boolean {
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
  if (!isToday(data)) throw new Error('the server returned an unexpected dungeon state');
  return data;
}

export function parseDungeonRun(data: unknown): DungeonRunResponse {
  if (!isRecord(data) || !isRunSummary(data['run']) || !isToday(data['today'])) {
    throw new Error('the server returned an unexpected dungeon run');
  }
  return { run: data['run'], today: data['today'] };
}

export function parseDungeonReplay(data: unknown): DungeonReplay {
  if (
    !isRecord(data) ||
    !isRunSummary(data['summary']) ||
    !isArrayOf(data['row'], (r): r is DungeonReplay['row'][number] => isReplayRowEntry(r)) ||
    !isArrayOf(data['rooms'], (r): r is DungeonReplay['rooms'][number] => isReplayRoom(r))
  ) {
    throw new Error('the server returned an unexpected dungeon replay');
  }
  return data as unknown as DungeonReplay;
}

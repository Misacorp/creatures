/**
 * Checks of the gear payloads the server sends (`GET /api/gear`, the action results and the loot of
 * a claim). Pure type guards, so they are unit-tested against the real server output in
 * `fixtures/`. A payload that does not match is an error, never a half-drawn screen.
 */
import { GEAR_RARITIES, GEAR_SLOTS, GEAR_TAGS, PART_KINDS } from '@creatures/game';
import type {
  ConversionNotice,
  DismantleResult,
  DismissResult,
  EquipBestResult,
  EquipResult,
  GearItem,
  GearLine,
  GearRarity,
  GearSlot,
  GearState,
  GrantLoot,
  GrantRecord,
  ItemOrigin,
  Job,
  JobResult,
  PartKind,
  PartsBundle,
  StartJobResult,
  WornGear,
} from './gear-types';
import { isArrayOf, isCount, isInt, isNullableStr, isRecord, isStr } from './parse-core';

export const isRarity = (value: unknown): value is GearRarity =>
  (GEAR_RARITIES as readonly unknown[]).includes(value);
export const isSlot = (value: unknown): value is GearSlot =>
  (GEAR_SLOTS as readonly unknown[]).includes(value);
const isTag = (value: unknown): boolean => (GEAR_TAGS as readonly unknown[]).includes(value);
const isPartKind = (value: unknown): value is PartKind =>
  (PART_KINDS as readonly unknown[]).includes(value);

/** Parts by kind: only known kinds, whole numbers, never negative. */
export function isPartsBundle(value: unknown): value is PartsBundle {
  return (
    isRecord(value) && Object.entries(value).every(([kind, n]) => isPartKind(kind) && isCount(n))
  );
}

const isNullableCount = (value: unknown): boolean => value === null || isCount(value);

function isLine(value: unknown): value is GearLine {
  return (
    isRecord(value) &&
    isStr(value['id']) &&
    isStr(value['name']) &&
    isStr(value['text']) &&
    isStr(value['about']) &&
    (value['source'] === 'base' || value['source'] === 'fixed' || value['source'] === 'rolled') &&
    isNullableCount(value['tier']) &&
    isNullableCount(value['bestTier']) &&
    (value['active'] === null || typeof value['active'] === 'boolean')
  );
}

function isOrigin(value: unknown): value is ItemOrigin {
  if (!isRecord(value)) return false;
  switch (value['kind']) {
    case 'raid':
    case 'festival':
      return isStr(value['boss']) && isInt(value['rank']);
    case 'dungeon':
      return isInt(value['depth']);
    case 'trip':
      return isStr(value['place']) && isInt(value['rank']);
    case 'craft':
    case 'welcome':
    case 'converted':
      return true;
    default:
      return false;
  }
}

function isGearItem(value: unknown): value is GearItem {
  if (!isRecord(value)) return false;
  const needs = value['needs'];
  const madeBy = value['madeBy'];
  return (
    isStr(value['id']) &&
    isStr(value['baseId']) &&
    isSlot(value['slot']) &&
    isTag(value['tag']) &&
    isRarity(value['rarity']) &&
    isCount(value['itemLevel']) &&
    isArrayOf(value['lines'], isLine) &&
    isRecord(needs) &&
    isCount(needs['level']) &&
    isNullableStr(needs['role']) &&
    isNullableStr(value['equippedOn']) &&
    isPartsBundle(value['dismantle']) &&
    isStr(value['source']) &&
    isInt(value['createdAt']) &&
    (madeBy === null || (isRecord(madeBy) && isStr(madeBy['name']) && isInt(madeBy['at']))) &&
    (value['origin'] === null || isOrigin(value['origin']))
  );
}

function isJobResult(value: unknown): value is JobResult {
  if (!isRecord(value)) return false;
  const common =
    isCount(value['xp']) &&
    isCount(value['skillXp']) &&
    isCount(value['skillLevel']) &&
    typeof value['leveledUp'] === 'boolean';
  if (!common) return false;
  switch (value['kind']) {
    case 'craft':
      return (
        isStr(value['gearId']) &&
        isStr(value['baseId']) &&
        isRarity(value['rarity']) &&
        isCount(value['itemLevel']) &&
        typeof value['upgraded'] === 'boolean'
      );
    case 'supply':
      return isStr(value['supplyId']) && isCount(value['amount']);
    case 'retired':
      return (
        (value['was'] === 'improve' || value['was'] === 'enchant') && isPartsBundle(value['refund'])
      );
    default:
      return false;
  }
}

function isJobInput(value: unknown): value is Job['input'] {
  return (
    isRecord(value) &&
    (value['baseId'] === undefined || isStr(value['baseId'])) &&
    (value['supplyId'] === undefined || isStr(value['supplyId']))
  );
}

const JOB_KINDS_STORED: readonly unknown[] = ['craft', 'supply', 'improve', 'enchant'];

function isJob(value: unknown): value is Job {
  return (
    isRecord(value) &&
    isStr(value['id']) &&
    isStr(value['creatureId']) &&
    JOB_KINDS_STORED.includes(value['kind']) &&
    isJobInput(value['input']) &&
    isPartsBundle(value['cost']) &&
    (value['bait'] === undefined || isCount(value['bait'])) &&
    isInt(value['startedAt']) &&
    isInt(value['endsAt']) &&
    (value['status'] === 'running' ||
      value['status'] === 'ready' ||
      value['status'] === 'claimed') &&
    (value['claimedAt'] === null || isInt(value['claimedAt'])) &&
    (value['result'] === null || isJobResult(value['result']))
  );
}

const isBlueprintLoot = (value: unknown): value is GrantLoot['blueprints'][number] =>
  isRecord(value) && isStr(value['baseId']) && typeof value['duplicate'] === 'boolean';

/** The item level a dropped item arrived with: absent on grants from before gear v2. */
const isLootLevel = (value: unknown): boolean => value === undefined || isCount(value);

const isGearLoot = (value: unknown): value is GrantLoot['gear'][number] =>
  isRecord(value) &&
  isStr(value['id']) &&
  isStr(value['baseId']) &&
  isRarity(value['rarity']) &&
  isLootLevel(value['itemLevel']);

const isConvertedLoot = (value: unknown): value is GrantLoot['converted'][number] =>
  isRecord(value) &&
  isStr(value['baseId']) &&
  isRarity(value['rarity']) &&
  isLootLevel(value['itemLevel']);

/** What a grant gave: the loot of an expedition claim, a finale, a Festival or the welcome kit. */
export function isGrantLoot(value: unknown): value is GrantLoot {
  return (
    isRecord(value) &&
    isArrayOf(value['gear'], isGearLoot) &&
    isArrayOf(value['converted'], isConvertedLoot) &&
    isPartsBundle(value['parts']) &&
    isArrayOf(value['blueprints'], isBlueprintLoot) &&
    (value['supplies'] === undefined || isArrayOf(value['supplies'], isStr))
  );
}

const GRANT_SOURCES: readonly unknown[] = [
  'raid_phase',
  'raid_finale',
  'festival',
  'expedition',
  'welcome',
  'dungeon',
  'rank_gift',
];

function isGrantRecord(value: unknown): value is GrantRecord {
  if (!isRecord(value)) return false;
  return (
    isStr(value['key']) &&
    GRANT_SOURCES.includes(value['source']) &&
    isInt(value['at']) &&
    isGrantLoot(value)
  );
}

const isPartCounts = (value: unknown): value is Record<PartKind, number> =>
  isRecord(value) && PART_KINDS.every((kind) => isCount(value[kind]));

function isSkill(value: unknown): value is GearState['skills'][number] {
  return (
    isRecord(value) &&
    isStr(value['creatureId']) &&
    isCount(value['xp']) &&
    isCount(value['level']) &&
    (value['nextLevelXp'] === null || isCount(value['nextLevelXp']))
  );
}

function isBlueprint(value: unknown): value is GearState['blueprints'][number] {
  return (
    isRecord(value) &&
    isStr(value['baseId']) &&
    isInt(value['learnedAt']) &&
    isCount(value['marks'])
  );
}

function isSlotOpens(value: unknown): value is GearState['slotOpens'] {
  return isRecord(value) && GEAR_SLOTS.every((slot) => isCount(value[slot]));
}

function isUnequipped(value: unknown): value is ConversionNotice['unequipped'][number] {
  return (
    isRecord(value) &&
    isStr(value['id']) &&
    isStr(value['baseId']) &&
    isSlot(value['slot']) &&
    isCount(value['itemLevel']) &&
    (value['reason'] === 'item_level' ||
      value['reason'] === 'slot_locked' ||
      value['reason'] === 'role') &&
    isNullableCount(value['needs'])
  );
}

function isNotice(value: unknown): value is ConversionNotice {
  return (
    isRecord(value) &&
    isCount(value['converted']) &&
    isArrayOf(value['unequipped'], isUnequipped) &&
    isCount(value['refundedItems']) &&
    isPartsBundle(value['parts']) &&
    isCount(value['essence']) &&
    isCount(value['blueprints']) &&
    isCount(value['retiredJobs'])
  );
}

/** Checks `GET /api/gear` (and the `gear` view of every action). Throws when the shape is wrong. */
export function parseGearState(data: unknown): GearState {
  if (
    !isRecord(data) ||
    !isInt(data['serverNow']) ||
    !isRecord(data['balances']) ||
    !isCount(data['balances']['bait']) ||
    !isCount(data['balances']['essence']) ||
    !isRecord(data['inventory']) ||
    !isCount(data['inventory']['cap']) ||
    !isCount(data['inventory']['used']) ||
    !isCount(data['inventory']['reserved']) ||
    !isArrayOf(data['items'], isGearItem) ||
    !isSlotOpens(data['slotOpens']) ||
    !isPartCounts(data['parts']) ||
    !isArrayOf(data['blueprints'], isBlueprint) ||
    !isArrayOf(data['jobs'], isJob) ||
    !isRecord(data['slots']) ||
    !isCount(data['slots']['total']) ||
    !isCount(data['slots']['used']) ||
    !isArrayOf(data['skills'], isSkill) ||
    !isArrayOf(data['grants'], isGrantRecord) ||
    !(data['notice'] === null || isNotice(data['notice']))
  ) {
    throw new Error('the server returned an unexpected gear view');
  }
  return data as unknown as GearState;
}

/** A worn item as the collection view lists it on a creature. */
export function isWornGear(value: unknown): value is WornGear {
  return (
    isRecord(value) &&
    isStr(value['id']) &&
    isStr(value['baseId']) &&
    isSlot(value['slot']) &&
    isRarity(value['rarity']) &&
    isCount(value['itemLevel'])
  );
}

export function parseEquipResult(value: unknown): EquipResult {
  if (
    !isRecord(value) ||
    !isGearItem(value['item']) ||
    !(value['unequipped'] === null || isGearItem(value['unequipped']))
  ) {
    throw new Error('the server returned an unexpected equip result');
  }
  return value as unknown as EquipResult;
}

export function parseEquipBestResult(value: unknown): EquipBestResult {
  if (
    !isRecord(value) ||
    !isArrayOf(
      value['changes'],
      (c): c is EquipBestResult['changes'][number] =>
        isRecord(c) && isStr(c['creatureId']) && isSlot(c['slot']) && isStr(c['itemId']),
    )
  ) {
    throw new Error('the server returned an unexpected equip best result');
  }
  return value as unknown as EquipBestResult;
}

export function parseDismissResult(value: unknown): DismissResult {
  if (!isRecord(value) || typeof value['dismissed'] !== 'boolean') {
    throw new Error('the server returned an unexpected dismiss result');
  }
  return { dismissed: value['dismissed'] };
}

export function parseDismantleResult(value: unknown): DismantleResult {
  if (
    !isRecord(value) ||
    !isStr(value['gearId']) ||
    !isStr(value['baseId']) ||
    !isRarity(value['rarity']) ||
    !isCount(value['itemLevel']) ||
    !isPartsBundle(value['parts']) ||
    typeof value['unequipped'] !== 'boolean'
  ) {
    throw new Error('the server returned an unexpected dismantle result');
  }
  return value as unknown as DismantleResult;
}

export function parseStartJobResult(value: unknown): StartJobResult {
  if (!isRecord(value) || !isStr(value['jobId'])) {
    throw new Error('the server returned an unexpected job start result');
  }
  return { jobId: value['jobId'] };
}

export function parseJobResult(value: unknown): JobResult {
  if (!isJobResult(value)) throw new Error('the server returned an unexpected job result');
  return value;
}

/**
 * Checks of the gear payloads the server sends (`GET /api/gear`, the action results and the loot of
 * a claim). Pure type guards, so they are unit-tested against the real server output in
 * `fixtures/`. A payload that does not match is an error, never a half-drawn screen.
 */
import { GEAR_RARITIES, GEAR_STATS, JOB_KINDS, PART_KINDS } from '@creatures/game';
import type {
  DismantleResult,
  EquipResult,
  GearItem,
  GearRarity,
  GearState,
  GearStat,
  GrantLoot,
  GrantRecord,
  Job,
  JobKind,
  JobResult,
  PartKind,
  PartsBundle,
  StartJobResult,
  UpgradeResult,
} from './gear-types';

type Rec = Record<string, unknown>;

export const isRecord = (value: unknown): value is Rec =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isStr = (value: unknown): value is string => typeof value === 'string';
const isInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value);
const isCount = (value: unknown): value is number => isInt(value) && value >= 0;
const isNullableStr = (value: unknown): value is string | null => value === null || isStr(value);
const isArrayOf = <T>(value: unknown, guard: (item: unknown) => item is T): value is T[] =>
  Array.isArray(value) && value.every(guard);

const isRarity = (value: unknown): value is GearRarity =>
  (GEAR_RARITIES as readonly unknown[]).includes(value);
const isStat = (value: unknown): value is GearStat =>
  (GEAR_STATS as readonly unknown[]).includes(value);
const isPartKind = (value: unknown): value is PartKind =>
  (PART_KINDS as readonly unknown[]).includes(value);
const isJobKind = (value: unknown): value is JobKind =>
  (JOB_KINDS as readonly unknown[]).includes(value);

/** Parts by kind: only known kinds, whole numbers, never negative. */
export function isPartsBundle(value: unknown): value is PartsBundle {
  return (
    isRecord(value) && Object.entries(value).every(([kind, n]) => isPartKind(kind) && isCount(n))
  );
}

function isRoll(value: unknown): value is { stat: GearStat; bp: number } {
  return isRecord(value) && isStat(value['stat']) && isInt(value['bp']);
}

export function isGearItem(value: unknown): value is GearItem {
  if (!isRecord(value)) return false;
  const cost = value['upgradeCost'];
  return (
    isStr(value['id']) &&
    isStr(value['baseId']) &&
    isRarity(value['rarity']) &&
    isCount(value['level']) &&
    isCount(value['maxLevel']) &&
    isRoll(value['primary']) &&
    isArrayOf(value['secondaries'], isRoll) &&
    isNullableStr(value['enchantId']) &&
    (value['enchantActive'] === null || typeof value['enchantActive'] === 'boolean') &&
    isNullableStr(value['equippedOn']) &&
    isNullableStr(value['jobId']) &&
    (cost === null || (isRecord(cost) && isCount(cost['essence']) && isCount(cost['scrap']))) &&
    isPartsBundle(value['dismantle']) &&
    isStr(value['source']) &&
    isInt(value['createdAt'])
  );
}

function isJobResult(value: unknown): value is JobResult {
  if (!isRecord(value)) return false;
  const common =
    isCount(value['xp']) &&
    isCount(value['skillXp']) &&
    isCount(value['skillLevel']) &&
    typeof value['leveledUp'] === 'boolean' &&
    isStr(value['gearId']) &&
    isStr(value['baseId']);
  if (!common) return false;
  switch (value['kind']) {
    case 'craft':
      return isRarity(value['rarity']) && typeof value['upgraded'] === 'boolean';
    case 'improve':
      return isCount(value['secondaryIndex']) && isRoll(value['from']) && isRoll(value['to']);
    case 'enchant':
      return isStr(value['enchantId']);
    default:
      return false;
  }
}

function isJobInput(value: unknown): value is Job['input'] {
  return (
    isRecord(value) &&
    (value['baseId'] === undefined || isStr(value['baseId'])) &&
    (value['gearId'] === undefined || isStr(value['gearId'])) &&
    (value['enchantId'] === undefined || isStr(value['enchantId'])) &&
    (value['secondaryIndex'] === undefined || isCount(value['secondaryIndex']))
  );
}

export function isJob(value: unknown): value is Job {
  return (
    isRecord(value) &&
    isStr(value['id']) &&
    isStr(value['creatureId']) &&
    isJobKind(value['kind']) &&
    isJobInput(value['input']) &&
    isPartsBundle(value['cost']) &&
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
  isRecord(value) &&
  isStr(value['baseId']) &&
  isRarity(value['rarity']) &&
  typeof value['duplicate'] === 'boolean';

const isGearLoot = (value: unknown): value is GrantLoot['gear'][number] =>
  isRecord(value) && isStr(value['id']) && isStr(value['baseId']) && isRarity(value['rarity']);

const isConvertedLoot = (value: unknown): value is GrantLoot['converted'][number] =>
  isRecord(value) && isStr(value['baseId']) && isRarity(value['rarity']);

/** What a grant gave: the loot of an expedition claim, a finale, a Festival or the welcome kit. */
export function isGrantLoot(value: unknown): value is GrantLoot {
  return (
    isRecord(value) &&
    isArrayOf(value['gear'], isGearLoot) &&
    isArrayOf(value['converted'], isConvertedLoot) &&
    isPartsBundle(value['parts']) &&
    isArrayOf(value['blueprints'], isBlueprintLoot)
  );
}

const GRANT_SOURCES: readonly unknown[] = [
  'raid_phase',
  'raid_finale',
  'festival',
  'expedition',
  'welcome',
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
    isRarity(value['rarity']) &&
    isInt(value['learnedAt'])
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
    !isPartCounts(data['parts']) ||
    !isArrayOf(data['blueprints'], isBlueprint) ||
    !isArrayOf(data['jobs'], isJob) ||
    !isRecord(data['slots']) ||
    !isCount(data['slots']['total']) ||
    !isCount(data['slots']['used']) ||
    !isArrayOf(data['skills'], isSkill) ||
    !isArrayOf(data['grants'], isGrantRecord)
  ) {
    throw new Error('the server returned an unexpected gear view');
  }
  return data as unknown as GearState;
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

export function parseUpgradeResult(value: unknown): UpgradeResult {
  if (!isRecord(value) || !isStr(value['gearId']) || !isCount(value['level'])) {
    throw new Error('the server returned an unexpected upgrade result');
  }
  return { gearId: value['gearId'], level: value['level'] };
}

export function parseDismantleResult(value: unknown): DismantleResult {
  if (
    !isRecord(value) ||
    !isStr(value['gearId']) ||
    !isStr(value['baseId']) ||
    !isRarity(value['rarity']) ||
    !isCount(value['level']) ||
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

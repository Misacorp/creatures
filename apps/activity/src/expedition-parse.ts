/**
 * Checks of the expedition payloads the server sends (`GET /api/state`, the trip routes, the
 * destinations and the profile). Pure type guards, unit-tested against the real server output in
 * `fixtures/expedition-*.json`. A payload that does not match is an error, never a half-drawn screen.
 * Unknown extra keys are tolerated (the server may add fields), unknown values of a known field are not.
 */
import { EXPEDITION_LENGTHS } from '@creatures/game';
import type {
  CancelledTrip,
  DestinationsView,
  ExpeditionLength,
  ExplorerView,
  GoalRisk,
  JournalFind,
  Milestone,
  OfferedGoal,
  Profile,
  RankGift,
  Slots,
  SupplyTier,
  Trip,
  TripCatch,
  TripResult,
} from './expedition-types';
import { isExperienceView } from './experience';
import { isGrantLoot, isPartsBundle } from './gear-parse';
import { isArrayOf, isBool, isCount, isInt, isRecord, isStr } from './parse-core';
import { isChoiceResult, isTalentView } from './talent-parse';

const isExpeditionLength = (value: unknown): value is ExpeditionLength =>
  (EXPEDITION_LENGTHS as readonly unknown[]).includes(value);
const isTier = (value: unknown): value is SupplyTier =>
  value === 'basic' || value === 'good' || value === 'great';
const isRisk = (value: unknown): value is GoalRisk => value === 'safe' || value === 'risky';

export function isExplorerView(value: unknown): value is ExplorerView {
  return (
    isRecord(value) &&
    isInt(value['rank']) &&
    value['rank'] >= 1 &&
    isCount(value['xp']) &&
    (value['nextRankXp'] === null || isCount(value['nextRankXp'])) &&
    isCount(value['trips'])
  );
}

export function isSlots(value: unknown): value is Slots {
  if (!isRecord(value)) return false;
  const next = value['next'];
  return (
    isCount(value['total']) &&
    isCount(value['used']) &&
    isCount(value['rankSum']) &&
    isCount(value['tripsFinished']) &&
    (next === null ||
      (isRecord(next) &&
        (next['kind'] === 'trips' || next['kind'] === 'rank_sum') &&
        isCount(next['at'])))
  );
}

function isCatch(value: unknown): value is TripCatch {
  return (
    isRecord(value) &&
    isStr(value['species']) &&
    isBool(value['shiny']) &&
    (value['outcome'] === 'new' ||
      value['outcome'] === 'duplicate' ||
      value['outcome'] === 'fused' ||
      value['outcome'] === 'converted') &&
    (value['talent'] === undefined || isTalentView(value['talent'])) &&
    (value['pendingId'] === undefined || isStr(value['pendingId'])) &&
    (value['deep'] === undefined || value['deep'] === true) &&
    (value['secondLook'] === undefined || value['secondLook'] === true) &&
    (value['fusionCount'] === undefined || isCount(value['fusionCount'])) &&
    (value['bait'] === undefined || isCount(value['bait'])) &&
    isBool(value['firstOnServer'])
  );
}

function isJournalFind(value: unknown): value is JournalFind {
  return (
    isRecord(value) &&
    isStr(value['entryId']) &&
    (value['set'] === null || isStr(value['set'])) &&
    isBool(value['setComplete'])
  );
}

function isPushOnResult(value: unknown): value is NonNullable<TripResult['pushOn']> {
  return (
    isRecord(value) &&
    isStr(value['goalId']) &&
    isRisk(value['risk']) &&
    isCount(value['oddsBp']) &&
    (value['outcome'] === 'worked' ||
      value['outcome'] === 'failed' ||
      value['outcome'] === 'declined')
  );
}

function isRankGift(value: unknown): value is RankGift {
  return (
    isRecord(value) &&
    isInt(value['rank']) &&
    value['rank'] >= 2 &&
    isCount(value['bait']) &&
    isPartsBundle(value['parts']) &&
    isArrayOf(value['supplies'], isStr)
  );
}

export function isTripResult(value: unknown): value is TripResult {
  if (!isRecord(value)) return false;
  const xp = value['xp'];
  const familiarity = value['familiarity'];
  const unlocked = value['slotUnlocked'];
  return (
    isBool(value['recalled']) &&
    isArrayOf(value['catches'], isCatch) &&
    (value['noCatch'] === undefined || isCount(value['noCatch'])) &&
    (value['autoSettled'] === undefined || isArrayOf(value['autoSettled'], isChoiceResult)) &&
    (value['loot'] === undefined || isGrantLoot(value['loot'])) &&
    (value['failed'] === undefined || value['failed'] === true) &&
    (value['pushOn'] === undefined || isPushOnResult(value['pushOn'])) &&
    (xp === undefined ||
      (isRecord(xp) &&
        isCount(xp['gained']) &&
        isCount(xp['total']) &&
        isInt(xp['rank']) &&
        isInt(xp['rankBefore']))) &&
    (familiarity === undefined ||
      (isRecord(familiarity) &&
        isCount(familiarity['stars']) &&
        isCount(familiarity['starsBefore']) &&
        isCount(familiarity['trips']))) &&
    (value['journal'] === undefined || isArrayOf(value['journal'], isJournalFind)) &&
    (value['rankGifts'] === undefined || isArrayOf(value['rankGifts'], isRankGift)) &&
    (value['experience'] === undefined || isExperienceView(value['experience'])) &&
    (unlocked === undefined || (isRecord(unlocked) && isCount(unlocked['total'])))
  );
}

function isOfferedGoal(value: unknown): value is OfferedGoal {
  return (
    isRecord(value) &&
    isStr(value['id']) &&
    isRisk(value['risk']) &&
    isCount(value['extraHours']) &&
    isCount(value['oddsBp']) &&
    value['oddsBp'] <= 10_000
  );
}

export function isTrip(value: unknown): value is Trip {
  if (!isRecord(value)) return false;
  const offer = value['offer'];
  const pushOn = value['pushOn'];
  return (
    isStr(value['id']) &&
    isStr(value['creatureId']) &&
    isExpeditionLength(value['duration']) &&
    isTier(value['supplies']) &&
    isArrayOf(value['kit'], isStr) &&
    isStr(value['destination']) &&
    (value['twist'] === null || isStr(value['twist'])) &&
    isCount(value['rolls']) &&
    isCount(value['cost']) &&
    isBool(value['treat']) &&
    isInt(value['startedAt']) &&
    isInt(value['endsAt']) &&
    isInt(value['readyAt']) &&
    (value['status'] === 'active' || value['status'] === 'claimed') &&
    (value['claimedAt'] === null || isInt(value['claimedAt'])) &&
    (value['result'] === null || isTripResult(value['result'])) &&
    (offer === null || (isRecord(offer) && isArrayOf(offer['goals'], isOfferedGoal))) &&
    (pushOn === null ||
      (isRecord(pushOn) &&
        isStr(pushOn['goalId']) &&
        isInt(pushOn['startedAt']) &&
        isInt(pushOn['endsAt']) &&
        isCount(pushOn['oddsBp'])))
  );
}

export function isCancelledTrip(value: unknown): value is CancelledTrip {
  return (
    isRecord(value) &&
    isStr(value['id']) &&
    isStr(value['creatureId']) &&
    isStr(value['destination']) &&
    isExpeditionLength(value['duration']) &&
    isInt(value['startedAt']) &&
    isStr(value['reason'])
  );
}

/** Supplies in stock: supply id to a whole amount. */
export function isSupplyStock(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every(isCount);
}

// --- The other routes ---

/** The answer of POST /api/expeditions and POST /api/expeditions/:id/push-on (the state is parsed by the caller). */
export function parseTripAnswer(data: unknown): { expedition: Trip; state: unknown } {
  if (!isRecord(data) || !isTrip(data['expedition'])) {
    throw new Error('the server returned an unexpected trip');
  }
  return { expedition: data['expedition'], state: data['state'] };
}

function isMilestone(value: unknown): value is Milestone {
  if (!isRecord(value)) return false;
  const bonus = value['bonus'];
  return (
    isStr(value['id']) &&
    isStr(value['stat']) &&
    isCount(value['at']) &&
    isCount(value['value']) &&
    isBool(value['reached']) &&
    isRecord(bonus) &&
    isStr(bonus['kind']) &&
    isCount(bonus['bp'])
  );
}

/** Checks `GET /api/profile`. */
export function parseProfile(data: unknown): Profile {
  if (!isRecord(data)) throw new Error('the server returned an unexpected profile');
  const stats = data['stats'];
  const bonuses = data['bonuses'];
  const journal = data['journal'];
  if (
    !isRecord(stats) ||
    !Object.values(stats).every(isCount) ||
    !isArrayOf(data['milestones'], isMilestone) ||
    !isRecord(bonuses) ||
    !isCount(bonuses['rarityBp']) ||
    !isCount(bonuses['partsBp']) ||
    !isCount(bonuses['offerBp']) ||
    !isCount(bonuses['xpBp']) ||
    !isRecord(journal) ||
    !isCount(journal['total']) ||
    !isArrayOf(
      journal['found'],
      (f): f is { entryId: string; foundAt: number } =>
        isRecord(f) && isStr(f['entryId']) && isInt(f['foundAt']),
    ) ||
    !isArrayOf(
      journal['sets'],
      (s): s is { id: string; found: number; total: number } =>
        isRecord(s) && isStr(s['id']) && isCount(s['found']) && isCount(s['total']),
    ) ||
    !isArrayOf(
      data['explorers'],
      (e): e is { creatureId: string } & ExplorerView =>
        isRecord(e) && isStr(e['creatureId']) && isExplorerView(e),
    ) ||
    !isSlots(data['slots'])
  ) {
    throw new Error('the server returned an unexpected profile');
  }
  return data as unknown as Profile;
}

/** Checks `GET /api/destinations`. */
export function parseDestinations(data: unknown): DestinationsView {
  if (!isRecord(data)) throw new Error('the server returned unexpected destinations');
  const special = data['special'];
  const isClosed = (v: unknown): v is 'night' | 'festival' | 'rank' =>
    v === 'night' || v === 'festival' || v === 'rank';
  if (
    !isInt(data['serverNow']) ||
    !isRecord(special) ||
    !isStr(special['destination']) ||
    !isStr(special['twist']) ||
    !isStr(special['description']) ||
    !isBool(special['festival']) ||
    !isBool(data['festivalWeek']) ||
    !isBool(data['night']) ||
    !isArrayOf(
      data['destinations'],
      (d): d is DestinationsView['destinations'][number] =>
        isRecord(d) &&
        isStr(d['id']) &&
        isCount(d['minRank']) &&
        isBool(d['nightOnly']) &&
        isBool(d['festivalOnly']) &&
        isArrayOf(d['closed'], isClosed),
    ) ||
    !isArrayOf(
      data['familiarity'],
      (f): f is DestinationsView['familiarity'][number] =>
        isRecord(f) &&
        isStr(f['creatureId']) &&
        isStr(f['destination']) &&
        isCount(f['trips']) &&
        isArrayOf(f['found'], isStr) &&
        isBool(f['shiny']) &&
        isCount(f['stars']) &&
        isCount(f['deepChanceBp']),
    )
  ) {
    throw new Error('the server returned unexpected destinations');
  }
  return data as unknown as DestinationsView;
}

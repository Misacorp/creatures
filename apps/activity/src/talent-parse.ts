/**
 * Checks of the talent payloads the server sends (the creatures of `GET /api/state`, the pending
 * duplicates, the answers of the choice and Talent Book routes). Pure type guards, unit-tested against
 * the real server output in `fixtures/creatures-*.json`. A payload that does not match is an error,
 * never a half-drawn screen. Unknown extra keys are tolerated; unknown values of a known field are not.
 */
import { isPartsBundle } from './gear-parse';
import { isArrayOf, isBool, isCount, isInt, isRecord, isStr } from './parse-core';
import type {
  ChoiceResult,
  CreatureTalents,
  DuplicateChoice,
  PendingCatch,
  Recommendation,
  SlotResult,
  TalentSlotView,
  TalentView,
} from './talent-types';

const CHOICES: readonly unknown[] = ['teach', 'fuse', 'release', 'keep'];
export const isDuplicateChoice = (value: unknown): value is DuplicateChoice =>
  CHOICES.includes(value);

export function isTalentView(value: unknown): value is TalentView {
  return (
    isRecord(value) &&
    isStr(value['id']) &&
    isStr(value['name']) &&
    isBool(value['golden']) &&
    isStr(value['text']) &&
    isStr(value['about']) &&
    isBool(value['idle'])
  );
}

function isSlotView(value: unknown): value is TalentSlotView {
  return (
    isRecord(value) &&
    isInt(value['slot']) &&
    value['slot'] >= 1 &&
    value['slot'] <= 3 &&
    isCount(value['opensAt']) &&
    isBool(value['open']) &&
    (value['talent'] === null || isTalentView(value['talent']))
  );
}

function isBookEntry(value: unknown): value is TalentView & { slot: number | null } {
  return (
    isTalentView(value) &&
    isRecord(value) &&
    (value['slot'] === null || (isInt(value['slot']) && value['slot'] >= 1 && value['slot'] <= 3))
  );
}

export function isCreatureTalents(value: unknown): value is CreatureTalents {
  return (
    isRecord(value) &&
    isArrayOf(value['slots'], isSlotView) &&
    (value['signature'] === null || isTalentView(value['signature'])) &&
    isArrayOf(value['book'], isBookEntry)
  );
}

function isRecommendation(value: unknown): value is Recommendation {
  return (
    isRecord(value) &&
    isDuplicateChoice(value['choice']) &&
    (value['creatureId'] === undefined || isStr(value['creatureId'])) &&
    (value['slot'] === undefined || (isInt(value['slot']) && value['slot'] >= 1))
  );
}

export function isPendingCatch(value: unknown): value is PendingCatch {
  if (!isRecord(value)) return false;
  const offered = value['offered'];
  return (
    isStr(value['id']) &&
    isStr(value['species']) &&
    isStr(value['line']) &&
    isBool(value['shiny']) &&
    (value['source'] === 'expedition' || value['source'] === 'festival') &&
    isInt(value['createdAt']) &&
    isTalentView(value['talent']) &&
    isRecord(offered) &&
    isArrayOf(offered['teach'], isStr) &&
    isArrayOf(offered['fuse'], isStr) &&
    isBool(offered['release']) &&
    isBool(offered['keep']) &&
    isPartsBundle(value['releases']) &&
    isRecommendation(value['recommended'])
  );
}

export function isChoiceResult(value: unknown): value is ChoiceResult {
  if (!isRecord(value)) return false;
  const talent = value['talent'];
  return (
    isDuplicateChoice(value['choice']) &&
    isBool(value['auto']) &&
    isStr(value['pendingId']) &&
    isStr(value['species']) &&
    (value['creatureId'] === undefined || isStr(value['creatureId'])) &&
    (value['slot'] === undefined || isInt(value['slot'])) &&
    isRecord(talent) &&
    isStr(talent['talentId']) &&
    isBool(talent['golden']) &&
    (value['fusionCount'] === undefined || isCount(value['fusionCount'])) &&
    (value['fusionPoints'] === undefined || isCount(value['fusionPoints'])) &&
    (value['pointsAdded'] === undefined || isCount(value['pointsAdded'])) &&
    (value['parts'] === undefined || isPartsBundle(value['parts']))
  );
}

export function isSlotResult(value: unknown): value is SlotResult {
  return (
    isRecord(value) &&
    isStr(value['creatureId']) &&
    isStr(value['talentId']) &&
    isBool(value['golden']) &&
    isInt(value['slot'])
  );
}

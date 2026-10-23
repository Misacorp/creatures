/**
 * Checks of the Valley Games payloads (`GET /api/games`, the entry and stall answers and a creature's
 * medals, event badges and records), unit-tested against the real server output in `fixtures/games-*.json`. Pure type
 * guards: a payload that does not match is an error, never a half-drawn tab. Unknown extra keys are
 * tolerated; unknown values of a known field are not.
 *
 * A show's events (`show.events`, the engine's `GamesEventResult`, a few hundred KB) are checked for the
 * shape the show player reads: the event's own fields, every actor, and every beat's tick and kind. The
 * beats' other fields are the engine's, read by `games/show-timeline.ts` with its own defaults.
 */
import type { GamesEventResult } from '@creatures/engine';
import { GAMES_FAVOURS, GAMES_KINDS, type GamesFavour, type GamesKind } from '@creatures/game';
import { isGrantLoot } from './gear-parse';
import { isArrayOf, isBool, isCount, isInt, isNullableInt, isRecord, isStr } from './parse-core';
import type {
  BoardRow,
  CreatureGames,
  GamesBadge,
  GamesMedal,
  GamesNext,
  GamesResult,
  GamesShowView,
  GamesView,
  GamesYou,
  LineupEvent,
  MedalCounts,
  ShowSegmentView,
  StallOffer,
  StallPurchase,
  StallView,
} from './games-types';

const KINDS: readonly unknown[] = GAMES_KINDS;
const FAVOURS: readonly unknown[] = GAMES_FAVOURS;
const PHASES: readonly unknown[] = ['entries', 'locked', 'show', 'after'];
const MEDALS: readonly unknown[] = ['gold', 'silver', 'bronze'];
const OFFER_KINDS: readonly unknown[] = ['gear', 'supply', 'bait', 'shards', 'glimmer'];

const isKind = (value: unknown): value is GamesKind => KINDS.includes(value);
const isFavour = (value: unknown): value is GamesFavour => FAVOURS.includes(value);
const isMedal = (value: unknown): value is GamesMedal => MEDALS.includes(value);
const isTeam = (value: unknown): value is 1 | 3 => value === 1 || value === 3;
/** An optional `bonus` mark: absent or `true`, never `false`. */
const isBonus = (value: unknown): boolean => value === undefined || value === true;
const isDay = (value: unknown): value is string =>
  isStr(value) && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** A map of string keys to values that pass `guard`. */
function isRecordOf<T>(
  value: unknown,
  guard: (item: unknown) => item is T,
): value is Record<string, T> {
  return isRecord(value) && Object.values(value).every(guard);
}

export function isLineupEvent(value: unknown): value is LineupEvent {
  return (
    isRecord(value) &&
    isStr(value['id']) &&
    isStr(value['name']) &&
    isKind(value['kind']) &&
    isStr(value['scene']) &&
    isTeam(value['team']) &&
    isStr(value['line']) &&
    isArrayOf(value['favours'], isFavour) &&
    isBonus(value['bonus'])
  );
}

const isWins = (value: unknown): value is number => isInt(value) && value >= 1;

function isNext(value: unknown): value is GamesNext {
  return (
    isRecord(value) &&
    isDay(value['day']) &&
    isInt(value['lockAt']) &&
    isInt(value['showAt']) &&
    isBool(value['open']) &&
    isArrayOf(value['lineup'], isLineupEvent) &&
    isRecordOf(value['entries'], (v): v is string[] => isArrayOf(v, isStr)) &&
    isRecordOf(value['goodFit'], (v): v is string[] => isArrayOf(v, isStr)) &&
    isRecordOf(value['badges'], (v): v is Record<string, number> => isRecordOf(v, isWins))
  );
}

function isSegment(value: unknown): value is ShowSegmentView {
  return (
    isRecord(value) &&
    isStr(value['eventId']) &&
    isCount(value['introMs']) &&
    isCount(value['startMs']) &&
    isCount(value['endMs']) &&
    isCount(value['podiumEndMs']) &&
    isBool(value['skipped'])
  );
}

function isActor(value: unknown): boolean {
  return (
    isRecord(value) &&
    isCount(value['a']) &&
    isStr(value['entrantId']) &&
    isStr(value['playerId']) &&
    isStr(value['teamId']) &&
    isStr(value['name']) &&
    isStr(value['speciesId']) &&
    isStr(value['element']) &&
    typeof value['x'] === 'number' &&
    typeof value['y'] === 'number' &&
    (value['shiny'] === undefined || isBool(value['shiny']))
  );
}

const isBeat = (value: unknown): boolean =>
  isRecord(value) && isCount(value['t']) && isStr(value['k']);

function isStanding(value: unknown): boolean {
  return (
    isRecord(value) &&
    isStr(value['teamId']) &&
    isInt(value['place']) &&
    typeof value['score'] === 'number' &&
    isArrayOf(value['actors'], isCount)
  );
}

/** The shape of a stored event the show player reads (see the module comment). */
export function isEventResult(value: unknown): value is GamesEventResult {
  if (!isRecord(value)) return false;
  const actors = value['actors'];
  const beats = value['beats'];
  return (
    isStr(value['eventId']) &&
    isKind(value['kind']) &&
    isStr(value['scene']) &&
    isTeam(value['team']) &&
    isInt(value['tickMs']) &&
    value['tickMs'] > 0 &&
    isCount(value['ticks']) &&
    Array.isArray(actors) &&
    actors.every(isActor) &&
    Array.isArray(beats) &&
    beats.every(isBeat) &&
    Array.isArray(value['standings']) &&
    value['standings'].every(isStanding) &&
    isCount(value['moments']) &&
    isArrayOf(value['momentTicks'], isCount) &&
    isArrayOf(value['scores'], (v): v is number => typeof v === 'number') &&
    isArrayOf(value['outAt'], isNullableInt)
  );
}

function isPlayer(value: unknown): value is GamesShowView['players'][number] {
  return isRecord(value) && isStr(value['id']) && isStr(value['name']) && isBool(value['bot']);
}

function isShow(value: unknown): value is GamesShowView {
  return (
    isRecord(value) &&
    isDay(value['day']) &&
    isInt(value['showAt']) &&
    isInt(value['endsAt']) &&
    isArrayOf(value['lineup'], isLineupEvent) &&
    isArrayOf(value['timeline'], isSegment) &&
    isArrayOf(value['events'], isEventResult) &&
    isArrayOf(value['skipped'], isStr) &&
    isArrayOf(value['players'], isPlayer)
  );
}

export function isMedalCounts(value: unknown): value is MedalCounts {
  return (
    isRecord(value) &&
    isCount(value['gold']) &&
    isCount(value['silver']) &&
    isCount(value['bronze']) &&
    isCount(value['pins'])
  );
}

function isResult(value: unknown): value is GamesResult {
  return (
    isRecord(value) &&
    isStr(value['eventId']) &&
    isArrayOf(value['creatureIds'], isStr) &&
    isInt(value['place']) &&
    value['place'] >= 1 &&
    (value['medal'] === null || isMedal(value['medal'])) &&
    isBool(value['pin']) &&
    isArrayOf(value['pins'], isStr) &&
    isCount(value['xp']) &&
    isBonus(value['bonus'])
  );
}

function isYou(value: unknown): value is GamesYou {
  if (!isRecord(value)) return false;
  const last = value['lastResults'];
  return (
    isMedalCounts(value['medals']) &&
    isCount(value['pocket']) &&
    (last === undefined ||
      (isRecord(last) && isDay(last['day']) && isArrayOf(last['results'], isResult)))
  );
}

function isOfferParams(value: unknown): value is StallOffer['params'] {
  return isRecordOf(value, (v): v is string | number => isStr(v) || isInt(v));
}

function isOffer(value: unknown): value is StallOffer {
  return (
    isRecord(value) &&
    isStr(value['id']) &&
    OFFER_KINDS.includes(value['kind']) &&
    isStr(value['name']) &&
    isCount(value['price']) &&
    isCount(value['weeklyLimit']) &&
    isCount(value['left']) &&
    isOfferParams(value['params'])
  );
}

function isStall(value: unknown): value is StallView {
  return (
    isRecord(value) &&
    isBool(value['open']) &&
    isDay(value['week']) &&
    isInt(value['opensAt']) &&
    isInt(value['closesAt']) &&
    isArrayOf(value['offers'], isOffer)
  );
}

function isBoardRow(value: unknown): value is BoardRow {
  return (
    isRecord(value) &&
    isStr(value['userId']) &&
    isStr(value['name']) &&
    isCount(value['gold']) &&
    isCount(value['silver']) &&
    isCount(value['bronze'])
  );
}

function fail(what: string): never {
  throw new Error(`The ${what} is not what the game expected.`);
}

/** `GET /api/games`, or an `Error` for an answer that is not one. */
export function parseGamesView(raw: unknown): GamesView {
  if (
    !isRecord(raw) ||
    !isInt(raw['serverNow']) ||
    !isStr(raw['timezone']) ||
    !PHASES.includes(raw['phase']) ||
    !isNext(raw['next']) ||
    !(raw['show'] === null || isShow(raw['show'])) ||
    !isYou(raw['you']) ||
    !isStall(raw['stall']) ||
    !isArrayOf(raw['board'], isBoardRow)
  ) {
    fail('Games tab');
  }
  return {
    serverNow: raw['serverNow'],
    timezone: raw['timezone'],
    phase: raw['phase'] as GamesView['phase'],
    next: raw['next'],
    show: raw['show'],
    you: raw['you'],
    stall: raw['stall'],
    board: raw['board'],
  };
}

/** `PUT /api/games/entry`: the next show day as it is now. */
export function parseEntryAnswer(raw: unknown): GamesNext {
  if (!isRecord(raw) || !isNext(raw['next'])) fail('entry answer');
  return raw['next'];
}

/** `POST /api/games/stall/buy`. */
export function parseStallPurchase(raw: unknown): StallPurchase {
  if (!isRecord(raw)) fail('purchase');
  const p = raw['purchase'];
  if (
    !isRecord(p) ||
    !isStr(p['offerId']) ||
    !isCount(p['price']) ||
    !isGrantLoot(p['grant']) ||
    !(p['bait'] === undefined || isCount(p['bait'])) ||
    !isYou(raw['you']) ||
    !isStall(raw['stall'])
  ) {
    fail('purchase');
  }
  return {
    purchase: {
      offerId: p['offerId'],
      price: p['price'],
      grant: p['grant'],
      ...(p['bait'] === undefined ? {} : { bait: p['bait'] }),
    },
    you: raw['you'],
    stall: raw['stall'],
  };
}

function isRecordRow(value: unknown): value is CreatureGames['records'][number] {
  return (
    isRecord(value) &&
    isStr(value['eventId']) &&
    isStr(value['name']) &&
    isCount(value['best']) &&
    isStr(value['unit']) &&
    isDay(value['day'])
  );
}

function isBadge(value: unknown): value is GamesBadge {
  return isRecord(value) && isStr(value['eventId']) && isWins(value['wins']);
}

/** `GET /api/games/creature/:id`. */
export function parseCreatureGames(raw: unknown): CreatureGames {
  if (
    !isRecord(raw) ||
    !isMedalCounts(raw['medals']) ||
    !isArrayOf(raw['badges'], isBadge) ||
    !isArrayOf(raw['records'], isRecordRow)
  ) {
    fail("creature's medals");
  }
  return { medals: raw['medals'], badges: raw['badges'], records: raw['records'] };
}

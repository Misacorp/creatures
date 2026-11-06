/**
 * What the valley says about the commons (phase 5 step 6b, `systems/commons.md`), as plain functions over the server's
 * `valley.commons` block: a place's level and project in words, what is still needed, the parts a player can give, the plaque,
 * the collection boards, the Forge's fire and the bonfire's hearth. Pure: no clock and no request; the server's numbers go
 * in, words come out. Nothing here shows another player's amounts (V-COM-2): only the caller's own part.
 */
import {
  VALLEY_RULES,
  type ProjectPart,
  type ValleyCommonsPlace,
  type ValleyCommonsView,
} from '@creatures/game';
import type { ValleyVisit } from '../api';
import { elementName } from '../game';
import { destinationName } from '../trip-view';
import { shardName } from './forge-view';

type ValleyCollectionView = ValleyCommonsView['collections'][number];
type ValleyCommonsFire = ValleyCommonsView['fire'];

const plural = (n: number, one: string, many: string): string =>
  n === 1 ? one : `${String(n)} ${many}`;

/** The places that have a project, in the valley's order. */
export type CommonsPlaceId =
  | 'bonfire'
  | 'forge'
  | 'signpost'
  | 'paddock'
  | 'school'
  | 'market';

/** What each place is called on its board. */
export const COMMONS_NAMES: Readonly<Record<string, string>> = {
  bonfire: 'Bonfire',
  forge: 'Forge',
  signpost: 'Signpost',
  paddock: 'Paddock',
  school: 'School',
  market: 'Market',
};

/** What a place's project builds, for a sentence ("the hearth is being built"). */
const BUILDS: Readonly<Record<string, string>> = {
  bonfire: 'the hearth',
  forge: 'the Forge',
  signpost: 'the road',
  paddock: 'the Paddock',
  school: 'the School',
  market: 'the Market',
};

export const buildName = (place: string): string => BUILDS[place] ?? 'the place';

/** The commons block of the valley view, when the server sent one. */
export const commonsOf = (visit: ValleyVisit | null | undefined): ValleyCommonsView | null =>
  visit?.commons ?? null;

/** One place's row of the commons block. */
export function placeOf(
  commons: ValleyCommonsView | null,
  place: string,
): ValleyCommonsPlace | undefined {
  return commons?.places.find((p) => p.id === place);
}

/** The place's level: "Level 2 / 5"; past the max, "Level 5, finished" and how many extras stand. */
export function levelLine(p: ValleyCommonsPlace): string {
  // A place built once (the Market) is built or not, whatever its level counts.
  if (VALLEY_RULES.commons.oneShot[p.id] !== undefined) {
    return p.level >= 2 ? 'Built' : 'Not built yet';
  }
  if (p.level < p.max) return `Level ${String(p.level)} / ${String(p.max)}`;
  return p.cosmetic === 0
    ? `Level ${String(p.max)}, finished`
    : `Level ${String(p.max)}, ${plural(p.cosmetic, '1 extra', 'extras')}`;
}

/** The place's level as the Bonfire reads it (1 when the commons did not arrive). */
export const levelOf = (commons: ValleyCommonsView | null, place: string): number =>
  placeOf(commons, place)?.level ?? 1;

/** How much of the open project is filled, in whole percent (0 with no project). */
export function percentFilled(p: ValleyCommonsPlace): number {
  const project = p.project;
  if (project === null || project.size <= 0) return 0;
  return Math.min(100, Math.floor((project.progress / project.size) * 100));
}

/** One unit of a part, as the board counts it: whole units, never below 1 while something is needed. */
export const unitsLeft = (need: number): number => (need <= 1e-9 ? 0 : Math.ceil(need - 1e-9));

/** The parts' words for a count ("40 Acorns", "12 scrap", "3 Grove shards"). */
export function partWords(part: ProjectPart, count: number, element: string): string {
  switch (part) {
    case 'acorns':
      return `${String(count)} ${count === 1 ? 'Acorn' : 'Acorns'}`;
    case 'scrap':
      return `${String(count)} scrap`;
    case 'shards':
      return `${String(count)} ${elementName(element)} ${count === 1 ? 'shard' : 'shards'}`;
  }
}

/** What the open project still needs, in words ("40 Acorns, 12 scrap, 3 Grove shards"); empty with none open or nothing left. */
export function stillNeeded(p: ValleyCommonsPlace): string {
  const project = p.project;
  if (project === null) return '';
  const out: string[] = [];
  const acorns = unitsLeft(project.needs.acorns);
  const scrap = unitsLeft(project.needs.scrap);
  const shards = unitsLeft(project.needs.shards);
  if (acorns > 0) out.push(partWords('acorns', acorns, ''));
  if (scrap > 0) out.push(partWords('scrap', scrap, ''));
  if (shards > 0) out.push(partWords('shards', shards, project.shardElement));
  return out.join(', ');
}

/** The place's state in a few words, for its tag. */
export function stateTag(p: ValleyCommonsPlace): string {
  switch (p.state) {
    case 'open':
      return 'Open';
    case 'building':
      return 'Building';
    case 'waiting':
      return 'Not yet';
    case 'done':
      return 'Built';
  }
}

/** Whole days left of a build, in words ("2 days left", "1 day left"). */
export const daysLeft = (days: number): string =>
  `${plural(Math.max(1, days), '1 day', 'days')} left`;

/** What the place's project is doing, as one line. */
export function stateLine(p: ValleyCommonsPlace): string {
  switch (p.state) {
    case 'open':
      return p.project?.cosmetic === true
        ? 'A new decoration is open for gifts.'
        : 'The next level is open for gifts.';
    case 'building':
      return `${capital(buildName(p.id))} is being built, ${daysLeft(p.buildDaysLeft)}.`;
    case 'waiting':
      return p.id === 'forge'
        ? 'Opens once the hearth has grown.'
        : 'Opens once the hearth and the Forge have grown.';
    case 'done':
      return `${capital(buildName(p.id))} is built.`;
  }
}

const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** The player's own part, private to them (V-COM-2): "You gave 31% of this." Empty when nothing was given yet. */
export function yourPart(p: ValleyCommonsPlace): string {
  if (p.mine.given <= 0) return '';
  const percent = Math.max(1, Math.round(p.mine.shareBp / 100));
  return `You gave ${String(percent)}% of this.`;
}

/** The Places list's short mention of a project: only while a place builds ("the hearth is being built, 2 days left"). */
export function placeMention(commons: ValleyCommonsView | null, place: string): string | null {
  const p = placeOf(commons, place);
  if (p === undefined || p.state !== 'building') return null;
  return `${buildName(place)} is being built, ${daysLeft(p.buildDaysLeft)}`;
}

// --- The gift: what a player can give, and how many ---

/** One thing a player can give to a place's project. */
export interface GiveRow {
  /** A key for the list. */
  id: string;
  part: ProjectPart;
  element: string | null;
  /** The row's name ("Acorns", "Grove shards", "Mire shards, 3 for 1"). */
  name: string;
  /** What the player holds of it. */
  held: number;
  /** The most units the stepper offers: what the project still takes and the player can pay. */
  max: number;
  /** Units to the bar for each stepper step: 1, or the exchange's rate for shards of another element (they count 1 for `rate`). */
  per: number;
  /** Why nothing can be given of it; null when something can. */
  reason: string | null;
}

/** What the player holds, for the give rows: the Acorns (`bait`) and the Forge's shelf. */
export interface Purse {
  acorns: number;
  scrap: number;
  shards: Readonly<Record<string, number>>;
}

/** The elements of shards, in the order the shelf lists them. */
const ELEMENTS = ['tide', 'ember', 'grove', 'spark', 'mire'] as const;

/**
 * The rows of the give list for a place's open project: Acorns, scrap, the place's own shards, and any other element the player holds
 * enough of for the exchange's rate (`rate` shards for 1). Empty with no project open.
 */
export function giveRows(p: ValleyCommonsPlace, purse: Purse, rate: number): GiveRow[] {
  const project = p.project;
  if (project === null) return [];
  const need = {
    acorns: unitsLeft(project.needs.acorns),
    scrap: unitsLeft(project.needs.scrap),
    shards: unitsLeft(project.needs.shards),
  };
  const row = (
    id: string,
    part: ProjectPart,
    element: string | null,
    name: string,
    held: number,
    per: number,
    left: number,
  ): GiveRow => {
    const units = Math.floor(held / per);
    const max = Math.min(units, left);
    const reason =
      left <= 0
        ? 'This part is full'
        : units <= 0
          ? held <= 0
            ? 'You have none'
            : `You need ${String(per)} for one`
          : null;
    return { id, part, element, name, held, max, per, reason };
  };
  const rows: GiveRow[] = [
    row('acorns', 'acorns', null, 'Acorns', purse.acorns, 1, need.acorns),
    row('scrap', 'scrap', null, 'Scrap', purse.scrap, 1, need.scrap),
    row(
      `shards:${project.shardElement}`,
      'shards',
      project.shardElement,
      capital(shardName(project.shardElement)),
      purse.shards[project.shardElement] ?? 0,
      1,
      need.shards,
    ),
  ];
  // A project that takes no shards (the Market's) lists none: a row that is always "full" would only be noise.
  if (VALLEY_RULES.commons.oneShot[p.id]?.costSplit.shards === 0) return rows.filter((r) => r.part !== 'shards');
  for (const element of ELEMENTS) {
    if (element === project.shardElement) continue;
    const held = purse.shards[element] ?? 0;
    if (held < rate) continue;
    rows.push(
      row(
        `shards:${element}`,
        'shards',
        element,
        `${capital(shardName(element))}, ${String(rate)} for 1`,
        held,
        rate,
        need.shards,
      ),
    );
  }
  return rows;
}

/** The price line of a gift ("12 Acorns", "3 Grove shards for 1"): the player's own cost, never more than the project takes. */
export function giftPrice(row: GiveRow, units: number): string {
  const spent = units * row.per;
  if (row.part === 'acorns') return `${String(spent)} Acorns`;
  if (row.part === 'scrap') return `${String(spent)} scrap`;
  return partWords('shards', spent, row.element ?? '');
}

// --- The plaque ---

/** The plaque's line: how many names, then the names are listed (alphabetical, no amounts). */
export function plaqueTitle(p: ValleyCommonsPlace): string {
  return p.level <= 1 ? 'Nothing built yet' : `Level ${String(p.level)} was built by`;
}

// --- Collections (V-COM-12) ---

/** What each place's collection is called. */
const BOARD_NAMES: Readonly<Record<string, string>> = {
  forge: 'The First Fires',
  signpost: 'Stones of the Roads',
  bonfire: 'Embers of the First Fire',
  paddock: 'Old Friends',
  school: 'The Lost Lessons',
};

export const boardName = (place: string): string => BOARD_NAMES[place] ?? 'Collection';

/** The place's collection board, when it has one. */
export function collectionOf(
  commons: ValleyCommonsView | null,
  place: string,
): ValleyCollectionView | undefined {
  return commons?.collections.find((c) => c.place === place);
}

/** How many sockets are set. */
export const socketsSet = (board: ValleyCollectionView): number =>
  board.sockets.filter((s) => s.set).length;

/** What a socket asks for, and where it turns up, from its source id. */
export function socketWords(source: string): { name: string; where: string } {
  const [kind = '', rest = ''] = source.split(':');
  switch (kind) {
    case 'keystone': {
      const place = destinationName(rest);
      return {
        name: `A keystone of ${place}`,
        where: `A scout posted at ${place} may turn it up, now and then.`,
      };
    }
    case 'landmark':
      return {
        name: `An ember of the deep, no. ${rest}`,
        where: 'Found in the dungeon, now and then.',
      };
    case 'resident':
      return {
        name: `A rare resident's token, no. ${rest}`,
        where: 'A rare resident may leave it with the creature that finds it.',
      };
    case 'page':
      return {
        name: `A lost journal page, no. ${rest}`,
        where: 'Some of the pages scouts find belong here.',
      };
    default:
      return {
        name: 'A find from daily work',
        where: 'Any scout may turn it up in everyday work.',
      };
  }
}

/** One socket's line when it is set: what it is, and who found it. */
export const socketFinder = (finder: string | null): string =>
  finder === null ? 'Set into the board' : `Found by ${finder}`;

// --- The fire (V-COM-13) and the hearth (V-BON-7) ---

/** The flame's size as a pixel scale: it grows with the fire's thresholds (a plain fire, then three steps up). */
export function flameScale(level: number, thresholds: readonly number[]): number {
  const passed = thresholds.filter((t) => level >= t).length;
  return 3 + Math.min(3, passed);
}

/** The thresholds of the item level that open a better modifier tier (the game's rules). */
export const FIRE_THRESHOLDS: readonly number[] = VALLEY_RULES.fire.thresholds;

/** The fire's one line: the item level pieces come out at now. */
export const fireLine = (fire: ValleyCommonsFire): string =>
  `Pieces come out at level ${String(fire.level)}.`;

/** What the fire's next step brings, in one short line; null at the top. */
export function fireNextLine(fire: ValleyCommonsFire): string | null {
  return fire.next === null ? null : `At level ${String(fire.next)}: a stronger modifier tier.`;
}

/** What warmed the fire, in words. */
export function warmthWords(
  source: ValleyCommonsFire['recent'][number]['source'],
  place: string | null,
): string {
  const where = place === null ? '' : (COMMONS_NAMES[place] ?? '');
  switch (source) {
    case 'place':
    case 'forge':
      return where === '' ? 'A place grew' : `The ${where} grew`;
    case 'collection':
      return where === ''
        ? 'A collection was completed'
        : `The ${where}'s collection was completed`;
    case 'cosmetic':
      return where === '' ? 'A decoration went up' : `A decoration went up at the ${where}`;
    case 'boss':
      return 'A boss fell for the first time';
    case 'master':
      return 'Creatures earned Master titles';
  }
}

/** The hearth's bonus in whole percent ("+4%"): the growth every idle creature gets now (basis points over x1). */
export function hearthPercent(hearthBp: number): number {
  return Math.round((hearthBp - 10_000) / 100);
}

/** The Bonfire's line about its hearth; null at the plain fire. */
export function hearthLine(hearthBp: number): string | null {
  const percent = hearthPercent(hearthBp);
  return percent <= 0 ? null : `The hearth adds ${String(percent)}% to every creature's growth.`;
}

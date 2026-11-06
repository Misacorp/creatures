/**
 * What the Signpost says about the player's scouts (phase 5 step 2, `systems/scouts.md`, `posts.md` V-POST-4 and V-POST-12,
 * `return.md` V-RET-9), as plain functions over the server's `valley` block: the words for a seat's pack, its pace, its fit
 * and its mastery, the destinations as the picker lists them, the kit, and the state line the Places list shows. Pure: no
 * clock and no request; the server's numbers go in, words come out. Nothing here says what was missed.
 */
import {
  VALLEY_RULES,
  type ScoutKit,
  type ValleyPlaceView,
  type ValleySeatView,
} from '@creatures/game';
import type { Creature, ValleyVisit } from '../api';
import { creatureName, elementName, getSpecies } from '../game';
import { acornCount, anyShardMark, priceOf, resourceMark, type Price } from '../resource-count';
import { destinationName } from '../trip-view';
import { formatCountdown } from '../time-format';
import type { CountItem } from '../ui/CountBadge';

const plural = (n: number, one: string, many: string): string =>
  n === 1 ? one : `${String(n)} ${many}`;

/** The three kit items, in the order the picker lists them, with what each does (V-SCOUT-5). */
export const KIT_ORDER: readonly ScoutKit[] = ['lure', 'lantern', 'satchel'];
export const KIT_INFO: Readonly<Record<ScoutKit, { name: string; line: string }>> = {
  lure: { name: 'Lure', line: 'Draws more creatures, leaning toward a kind you lack.' },
  lantern: { name: 'Lantern', line: 'Draws rare finds: gear, blueprints and journal pages.' },
  satchel: { name: 'Satchel', line: 'Brings more scrap and shards.' },
};

/** What a place's find profile is rich in, in words. */
const RICH_WORDS: Readonly<Record<ValleyPlaceView['rich'], string>> = {
  scrap: 'rich in scrap',
  shards: 'rich in shards',
  creatures: 'rich in creatures',
  rare: 'rich in rare finds',
  none: 'a bit of everything',
};

/** The mastery steps' names (V-POST-12): none yet, then Skilled, Expert, Master. */
const MASTERY_NAMES = ['New to scouting', 'Skilled', 'Expert', 'Master'] as const;
export const masteryName = (step: 0 | 1 | 2 | 3): string => MASTERY_NAMES[step];

/** A bonus in basis points as "+5%". */
export const percentOf = (bp: number): string => `+${String(Math.round(bp / 100))}%`;

/** The fit bonus (V-POST-4) in whole percent. */
export const FIT_PERCENT = Math.round(VALLEY_RULES.posts.fitBonus * 100);

/** The destination's name; an id the content does not know shows as its words ("moonlit-reef" as "Moonlit reef"). */
export function placeName(id: string): string {
  const known = destinationName(id);
  if (known !== id) return known;
  const words = id.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** One destination as the picker lists it: its name, what it is, and whether a scout can go there now. */
export interface DestinationRow {
  id: string;
  name: string;
  open: boolean;
  /** "Tide, rich in scrap. More at night. This week's special." */
  line: string;
  /** Why it cannot be picked (null when it can). */
  closed: string | null;
  special: boolean;
}

export function destinationLine(place: ValleyPlaceView): string {
  const parts = [
    place.element === null ? 'No element' : elementName(place.element),
    RICH_WORDS[place.rich],
  ];
  const head = `${parts[0] ?? ''}, ${parts[1] ?? ''}.`;
  const more = [place.night ? 'More at night.' : '', place.special ? "This week's special." : ''];
  return [head, ...more].filter((p) => p !== '').join(' ');
}

/** The destinations in the order they are listed: this week's special and the open ones first, the closed last. */
export function destinationRows(visit: ValleyVisit): DestinationRow[] {
  const rows = visit.places.map((place) => ({
    id: place.id,
    name: placeName(place.id),
    open: place.open,
    line: destinationLine(place),
    closed: place.open ? null : 'Closed until a Festival week',
    special: place.special,
  }));
  const rank = (r: DestinationRow): number => (!r.open ? 2 : r.special ? 0 : 1);
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i)
    .map(({ r }) => r);
}

/** The place a seat points at, if the server listed it. */
export function placeOfSeat(visit: ValleyVisit, seat: ValleySeatView): ValleyPlaceView | undefined {
  return visit.places.find((p) => p.id === seat.destination);
}

/** What a paused post says (V-POST-7): the scout or the smith is in the raid, and the post waits for the finale. */
export const RAID_PAUSE = 'In the raid until Sunday';

/** "Pack full", "Full in 2 d 14 h", or what an empty seat says. */
export function packLine(seat: ValleySeatView): string {
  if (seat.creatureId === null) return 'Nobody posted';
  if (seat.paused !== null) return RAID_PAUSE;
  if (seat.store.full) return 'Pack full';
  if (seat.store.fullInHours === null) return 'Pack filling';
  if (seat.store.fullInHours < 1 / 60) return 'Pack almost full';
  return `Full in ${formatCountdown(seat.store.fullInHours * 3_600_000, 'short')}`;
}

/** A row of a seat's table: a label (a resource has its icon as `mark` instead, never its name) and a value. */
export interface SeatRow {
  label: string;
  mark?: CountItem;
  value: string;
}

const SCRAP_MARK = resourceMark('scrap');
const SHARDS_MARK = anyShardMark();

/** The pack's finds with their counts, nothing for a kind with none (scrap and shards by their icons). */
export function packContents(seat: ValleySeatView): { label: string; mark?: CountItem; count: number }[] {
  const s = seat.store;
  const rows: { label: string; mark?: CountItem; count: number }[] = [
    { label: 'Scrap', mark: SCRAP_MARK, count: s.scrap },
    { label: 'Shards', mark: SHARDS_MARK, count: s.shards },
    { label: 'Gear', count: s.gear },
    { label: 'Blueprints', count: s.blueprints },
    { label: 'Journal pages', count: s.pages },
  ];
  return rows.filter((r) => r.count > 0);
}

/** A per-day number as it reads: whole when it is large, one place when it is small ("18", "0.5"); under a tenth "under 0.1". */
export function perDayText(n: number): string {
  if (n <= 0) return 'none';
  if (n < 0.1) return 'under 0.1';
  return n >= 10 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
}

/** What a seat brings a day (V-RET-9), as label and number rows, scrap and shards first, the rare finds last. */
export function perDayRows(seat: ValleySeatView): SeatRow[] {
  const d = seat.perDay;
  return [
    { label: 'Scrap', mark: SCRAP_MARK, value: perDayText(d.scrap) },
    { label: 'Shards', mark: SHARDS_MARK, value: perDayText(d.shards) },
    { label: 'Creatures', value: perDayText(d.creatures) },
    { label: 'Gear', value: perDayText(d.gear) },
    { label: 'Blueprints', value: perDayText(d.blueprints) },
    { label: 'Journal pages', value: perDayText(d.pages) },
  ];
}

/** A seat's fit (V-POST-4) in words. */
export function fitText(seat: ValleySeatView): string {
  return seat.fit ? `Fits here, +${String(FIT_PERCENT)}%` : 'No fit here';
}

/** A seat's mastery in words: its step, and the bonus it brings. */
export function masteryText(seat: ValleySeatView): string {
  const { step, bonusBp } = seat.mastery;
  return step === 0 ? masteryName(0) : `${masteryName(step)}, ${percentOf(bonusBp)}`;
}

/** A creature's element, from its species. */
export function elementOf(creature: Pick<Creature, 'species'>): string | null {
  return getSpecies(creature.species)?.element ?? null;
}

/** Whether a creature fits a place (V-POST-4): its element is the place's. */
export function fitsPlace(
  creature: Pick<Creature, 'species'>,
  place: ValleyPlaceView | undefined,
): boolean {
  if (place === undefined || place.element === null) return false;
  return elementOf(creature) === place.element;
}

/**
 * The preview of putting `creature` on `seat` (V-POST-4): one arrow and one number, for the change in the seat's fit. A
 * creature that swaps with the one standing there is compared with that one. "No change" when the fit stays as it is.
 */
export function fitPreview(
  creature: Creature,
  seat: ValleySeatView,
  visit: ValleyVisit,
  creatures: readonly Creature[],
): { arrow: 'up' | 'down' | 'none'; text: string } {
  const place = placeOfSeat(visit, seat);
  const now = seat.creatureId === null ? false : seat.fit;
  const next = fitsPlace(creature, place);
  const where = placeName(seat.destination);
  const standing = creatures.find((c) => c.id === seat.creatureId);
  const swap = standing !== undefined && standing.id !== creature.id;
  const tail = swap ? ` Swaps with ${creatureName(standing)}.` : '';
  if (next && !now) return { arrow: 'up', text: `+${String(FIT_PERCENT)}% at ${where}.${tail}` };
  if (!next && now) return { arrow: 'down', text: `-${String(FIT_PERCENT)}% at ${where}.${tail}` };
  const same = next ? `Fits ${where} already.` : `No fit at ${where}.`;
  return { arrow: 'none', text: `${same} No change.${tail}` };
}

/** How many scouts stand at a seat now. */
export const scoutsOut = (visit: ValleyVisit): number =>
  visit.seats.filter((s) => s.creatureId !== null && s.paused === null).length;

/** How many scouts are in the raid (V-POST-7): their seats wait for the finale. */
export const scoutsInRaid = (visit: ValleyVisit): number =>
  visit.seats.filter((s) => s.creatureId !== null && s.paused !== null).length;

/** How many packs are full. */
export const fullPacks = (visit: ValleyVisit): number =>
  visit.seats.filter((s) => s.creatureId !== null && s.store.full).length;

/** The Signpost's line in the Places list: a full pack first, else how many scouts are out. */
export function signpostSystemsLine(visit: ValleyVisit): string {
  const full = fullPacks(visit);
  if (full > 0) return full === 1 ? 'a pack is full' : `${String(full)} packs are full`;
  const out = scoutsOut(visit);
  if (out === 0 && scoutsInRaid(visit) > 0) return 'scouts are in the raid';
  if (out === 0) return visit.seats.length === 0 ? 'a free seat waits' : 'nobody is out';
  return `${plural(out, 'a scout', 'scouts')} out`;
}

/** The scene's one calm line under the Signpost's art. */
export function signpostCalm(visit: ValleyVisit): string {
  const full = fullPacks(visit);
  if (full > 0) return full === 1 ? 'A pack is full' : `${String(full)} packs are full`;
  const out = scoutsOut(visit);
  if (visit.seats.length === 0) return 'Your first seat is free';
  if (out === 0 && scoutsInRaid(visit) > 0) return 'Scouts are in the raid';
  if (out === 0) return 'No scouts out';
  return out === 1 ? '1 scout out' : `${String(out)} scouts out`;
}

/** What the next seat costs, as Acorns with their icon ("free" for the first). */
export const seatPrice = (price: number): Price => priceOf([acornCount(price)]);

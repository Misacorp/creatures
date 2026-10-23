/**
 * What the Games tab shows, as plain data (docs/design/valley-games.md): the icons of what an event
 * favours, the slots of an event and who fills them, the creature picker's rows (the "Good fit" badge,
 * the event badge, who is in another event), the tab's pip, when to ask the server again, the medals of a result and the units of
 * a record. Pure: the server decides every entry, placing, medal and number; this only arranges them.
 */
import { RULES, expToNext, gamesEventInfo, gamesIsSmall, type GamesFavour } from '@creatures/game';
import type { Creature } from './api';
import { creatureName, getSpecies } from './game';
import type {
  GamesMedal,
  GamesNext,
  GamesResult,
  GamesShowView,
  GamesView,
  LineupEvent,
  MedalCounts,
} from './games-types';
import type { IconRef } from './icon-ref';
import { baseOption, type PickerOption } from './roster-picker';
import { ALERT_TEXT } from './tab-alerts';
import { xpChange, type XpChange } from './xp-change';

// --- What an event favours ---

export interface FavourView {
  favour: GamesFavour;
  icon: IconRef;
  /** The glossary entry a tap opens. */
  entry: string;
  /** What assistive technology says. */
  label: string;
}

const ELEMENT_FAVOURS: readonly string[] = ['tide', 'ember', 'grove', 'spark', 'mire'];
const ROLE_FAVOURS: Readonly<Record<string, string>> = {
  setter: 'mark',
  payoff: 'sparkle',
  guard: 'shield',
  support: 'ability',
};
const STAT_FAVOURS: Readonly<Record<string, { glyph: string; entry: string; label: string }>> = {
  hp: { glyph: 'fav-hp', entry: 'games-favour-hp', label: 'HP' },
  atk: { glyph: 'fav-atk', entry: 'games-favour-atk', label: 'Attack' },
  spd: { glyph: 'fav-spd', entry: 'games-favour-spd', label: 'Speed' },
  dodge: { glyph: 'fav-dodge', entry: 'stat-dodge', label: 'Dodge' },
  crit: { glyph: 'reticle', entry: 'crit', label: 'Crits' },
  small: { glyph: 'fav-small', entry: 'games-favour-small', label: 'Small creatures' },
  big: { glyph: 'fav-big', entry: 'games-favour-big', label: 'Big creatures' },
};

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** The picture, the glossary entry and the spoken name of one favour. */
export function favourView(favour: GamesFavour): FavourView {
  if (ELEMENT_FAVOURS.includes(favour)) {
    return {
      favour,
      icon: { kind: 'element', element: favour },
      entry: `element-${favour}`,
      label: cap(favour),
    };
  }
  const role = ROLE_FAVOURS[favour];
  if (role !== undefined) {
    return {
      favour,
      icon: { kind: 'glyph', id: role },
      entry: `role-${favour}`,
      label: `${cap(favour)}s`,
    };
  }
  const stat = STAT_FAVOURS[favour] ?? { glyph: 'unknown', entry: 'games', label: favour };
  return { favour, icon: { kind: 'glyph', id: stat.glyph }, entry: stat.entry, label: stat.label };
}

// --- Slots and entries ---

/** How many creatures an event takes. */
export const slotCount = (event: Pick<LineupEvent, 'team'>): number =>
  event.team === 3 ? RULES.games.teamSize : 1;

/** The event's slots in order: a creature id or null for an empty one. */
export function slotsOf(next: Pick<GamesNext, 'entries'>, event: LineupEvent): (string | null)[] {
  const ids = next.entries[event.id] ?? [];
  return Array.from({ length: slotCount(event) }, (_, i) => ids[i] ?? null);
}

/** The event a creature is entered in, or null. */
export function entryOf(next: Pick<GamesNext, 'entries'>, creatureId: string): string | null {
  for (const [eventId, ids] of Object.entries(next.entries)) {
    if (ids.includes(creatureId)) return eventId;
  }
  return null;
}

/** The event's creatures after putting `creatureId` in slot `slot` (or emptying it with null). */
export function withSlot(
  current: readonly string[],
  slot: number,
  creatureId: string | null,
): string[] {
  const list = [...current];
  if (creatureId === null) {
    list.splice(slot, 1);
    return list;
  }
  if (slot < list.length) list[slot] = creatureId;
  else list.push(creatureId);
  return list.filter((id, i) => list.indexOf(id) === i);
}

/** True when the event has room and the player has a creature that is in no event yet. */
function canFill(
  next: GamesNext,
  event: LineupEvent,
  creatures: readonly Pick<Creature, 'id'>[],
): boolean {
  if ((next.entries[event.id] ?? []).length > 0) return false;
  return creatures.some((c) => entryOf(next, c.id) === null);
}

/** Events the player has not entered while a free creature could go: the pip's reason. */
export function emptyEvents(
  next: GamesNext,
  creatures: readonly Pick<Creature, 'id'>[],
): LineupEvent[] {
  if (!next.open) return [];
  return next.lineup.filter((e) => canFill(next, e, creatures));
}

// --- The phase, the pip and when to ask again ---

/** The show is playing at `serverNow` (it may be the stored one, or the next day's once it starts). */
export function showLive(view: GamesView, serverNow: number): boolean {
  const show = view.show;
  if (show !== null && serverNow >= show.showAt && serverNow < show.endsAt) return true;
  return view.phase === 'locked' && serverNow >= view.next.showAt;
}

/**
 * What the tab shows at `serverNow`: the show player while a stored show plays, the stands (the
 * countdown) between the lock and the next show's results, else the lineup.
 */
export function screenOf(view: GamesView, serverNow: number): 'stands' | 'show' | 'lineup' {
  const show = view.show;
  if (show !== null && serverNow >= show.showAt && serverNow < show.endsAt) return 'show';
  if (view.phase === 'locked') return 'stands';
  return 'lineup';
}

/** The Games tab's pip: the show is on, or there are events to enter. Null: none. */
export function gamesAlert(
  view: GamesView | null,
  creatures: readonly Pick<Creature, 'id'>[],
  serverNow: number,
): string | null {
  if (view === null) return null;
  if (showLive(view, serverNow)) return ALERT_TEXT.gamesLive;
  if (serverNow < view.next.lockAt && emptyEvents(view.next, creatures).length > 0) {
    return ALERT_TEXT.gamesEntries;
  }
  return null;
}

/** A moment after a server time, so the server's clock has surely passed it too. */
export const GAMES_GRACE_MS = 1_500;

/**
 * The next server time at which the tab's view changes by itself: the lock (entries close), the show's
 * start (its results arrive) or its end (the awards are in). Null when nothing is due.
 */
export function nextRefetchAt(view: GamesView, serverNow: number): number | null {
  const times = [view.next.lockAt, view.next.showAt];
  if (view.show !== null) times.push(view.show.showAt, view.show.endsAt + GAMES_GRACE_MS);
  const future = times.filter((t) => t > serverNow);
  return future.length === 0 ? null : Math.min(...future);
}

// --- The picker ---

/** One row of an event's picker: the creature, its badges and where it is entered now. */
export interface GamesPickerOption extends PickerOption {
  /** The server's "Good fit" badge for this event. */
  goodFit: boolean;
  /** Its wins of this event (its event badge); 0: none. */
  wins: number;
  /** The event it is in now (picking it moves it here), or null. */
  inEvent: string | null;
  /**
   * The event's size favour when this creature has it (`gamesIsSmall`), shown as the favour's glyph
   * at the right of the row; null when the event favours no size or the creature is the other size.
   */
  size: 'small' | 'big' | null;
}

/** The size favour of an event ('small' or 'big'), or null. */
export function sizeFavourOf(event: Pick<LineupEvent, 'favours'>): 'small' | 'big' | null {
  if (event.favours.includes('small')) return 'small';
  if (event.favours.includes('big')) return 'big';
  return null;
}

/** Whether a creature has the size an event favours (one rule: `gamesIsSmall`). */
export function fitsSize(favour: 'small' | 'big' | null, speciesId: string): boolean {
  if (favour === null) return false;
  const species = getSpecies(speciesId);
  if (species === undefined) return false;
  return gamesIsSmall(species) === (favour === 'small');
}

/**
 * The creatures for one slot of an event: the good fits first, then the rest, each group by name, free
 * ones before those in another event (a tap moves them here; the note names the event). No scores: the
 * badge says it. One already in this event's other slot cannot be picked and comes last. A creature on a
 * trip or a job can enter (the show takes no creature time), so nobody else is greyed.
 */
export function pickerRows(
  next: GamesNext,
  event: LineupEvent,
  slot: number,
  creatures: readonly Creature[],
): GamesPickerOption[] {
  const here = next.entries[event.id] ?? [];
  const good = new Set(next.goodFit[event.id] ?? []);
  const wins = next.badges[event.id] ?? {};
  const names = new Map(next.lineup.map((e) => [e.id, e.name]));
  const size = sizeFavourOf(event);
  const rows = creatures.map((c): GamesPickerOption => {
    const inEvent = entryOf(next, c.id);
    const sameTeam = inEvent === event.id && here.indexOf(c.id) !== slot;
    const inSlot = inEvent === event.id && here.indexOf(c.id) === slot;
    const elsewhere = inEvent !== null && inEvent !== event.id;
    return {
      ...baseOption(c),
      goodFit: good.has(c.id),
      wins: wins[c.id] ?? 0,
      inEvent,
      size: fitsSize(size, c.species) ? size : null,
      onBoard: elsewhere,
      disabled: sameTeam ? 'In this team' : null,
      ...(elsewhere ? { note: `In ${names.get(inEvent) ?? inEvent}` } : {}),
      ...(inSlot ? { note: 'Entered here' } : {}),
    };
  });
  const rank = (o: GamesPickerOption): number =>
    (o.disabled !== null ? 4 : 0) + (o.goodFit ? 0 : 2) + (o.onBoard ? 1 : 0);
  return rows.sort(
    (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1),
  );
}

// --- Results ---

/** The medal of a place, or null off the podium. */
export const placeMedal = (place: number): GamesMedal | null =>
  place === 1 ? 'gold' : place === 2 ? 'silver' : place === 3 ? 'bronze' : null;

/** The experience one creature of an entry earned (an entry's `xp` is its creatures' together). */
export function creatureXp(result: GamesResult, creatureId: string): number {
  const pin = RULES.games.xp.pin;
  const n = Math.max(1, result.creatureIds.length);
  const pinned = result.pins.filter((id) => result.creatureIds.includes(id)).length;
  const base = Math.max(0, Math.round((result.xp - pin * pinned) / n));
  return base + (result.pins.includes(creatureId) ? pin : 0);
}

/** One reason a creature earned experience in an event: entering, its medal, a pin. */
export type GamesXpPart =
  | { kind: 'enter'; xp: number }
  | { kind: 'medal'; medal: GamesMedal; xp: number }
  | { kind: 'pin'; xp: number };

const MEDAL_INDEX: Readonly<Record<GamesMedal, number>> = { gold: 0, silver: 1, bronze: 2 };

/**
 * Why a creature earned what it did in an event (`RULES.games.xp`, as the server pays it): the flat
 * amount for entering, its medal's bonus (none off the podium) and a pin's when it set a personal best.
 */
export function gamesXpParts(
  result: Pick<GamesResult, 'medal' | 'pins'>,
  creatureId: string,
): GamesXpPart[] {
  const xp = RULES.games.xp;
  const parts: GamesXpPart[] = [{ kind: 'enter', xp: xp.enter }];
  if (result.medal !== null) {
    parts.push({
      kind: 'medal',
      medal: result.medal,
      xp: xp.place[MEDAL_INDEX[result.medal]] ?? 0,
    });
  }
  if (result.pins.includes(creatureId)) parts.push({ kind: 'pin', xp: xp.pin });
  return parts;
}

/**
 * A creature's Games experience as the shared "XP gained" row: the bar where the creature is now, filled
 * back by what the show paid (the level before is worked out from the level sizes).
 */
export function gamesXpChange(
  creature: Pick<Creature, 'level' | 'exp' | 'expNeeded' | 'species' | 'nickname'>,
  gained: number,
): XpChange {
  let level = creature.level;
  let into = creature.exp;
  let left = Math.max(0, gained);
  while (left > into && level > 1) {
    left -= into;
    level -= 1;
    into = expToNext(level);
  }
  return xpChange({
    kind: 'experience',
    levelBefore: level,
    level: creature.level,
    value: creature.exp,
    max: creature.expNeeded,
    gained,
    label: `${creatureName(creature)}'s experience`,
  });
}

/** Where in the show an event's replay starts (its intro), from the server's timeline. */
export function replayStart(show: GamesShowView, eventId: string): number {
  return show.timeline.find((s) => s.eventId === eventId)?.introMs ?? 0;
}

/** The cabinet's order: the three medals, then pins. */
export const MEDAL_ORDER: readonly (GamesMedal | 'pins')[] = ['gold', 'silver', 'bronze', 'pins'];

/** True when there is anything to show in a cabinet of medals. */
export const hasMedals = (m: MedalCounts): boolean => m.gold + m.silver + m.bronze + m.pins > 0;

// --- Records ---

/** A record as the player reads it: "12.4 s", "18 m", "7 peppers", "1.5 laps", "87%", "9 crates". */
export function recordText(record: { eventId: string; best: number; unit: string }): string {
  switch (record.unit) {
    case 'ticks': {
      const tickMs = gamesEventInfo(record.eventId)?.tickMs ?? 1000;
      return `${trim((record.best * tickMs) / 1000)} s`;
    }
    case 'm':
      return `${String(record.best)} m`;
    case 'peppers':
      return `${String(record.best)} ${record.best === 1 ? 'pepper' : 'peppers'}`;
    case 'centilaps':
      return `${trim(record.best / 100)} ${record.best === 100 ? 'lap' : 'laps'}`;
    case 'percent':
      return `${String(record.best)}%`;
    case 'crates':
      return `${String(record.best)} ${record.best === 1 ? 'crate' : 'crates'}`;
    default:
      return String(record.best);
  }
}

/** One decimal at most, no trailing zero. */
function trim(n: number): string {
  return String(Math.round(n * 10) / 10);
}

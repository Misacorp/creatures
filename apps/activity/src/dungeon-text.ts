/**
 * The words of the dungeon screens, as pure functions: error messages, why a run is blocked, the
 * depth and streak lines, the results headline. Plain text only; creature names and foe names can
 * carry player text and must be rendered as text.
 */
import { RULES, dungeonContent } from '@creatures/game';
import { ApiError } from './api';
import type {
  DungeonErrorCode,
  DungeonPack,
  DungeonRunState,
  DungeonRunSummary,
  DungeonToday,
} from './dungeon-types';
import { errorText } from './game';

/** One short plain message for every error code the dungeon routes send. */
export const DUNGEON_ERROR_TEXT: Readonly<Record<DungeonErrorCode, string>> = {
  invalid_body:
    'The server did not understand that run. Close and reopen the Activity if it keeps happening.',
  duplicate_creature: 'Pick three different creatures.',
  invalid_id: 'That run could not be found. Close and reopen the Activity.',
  not_found:
    'One of those creatures, or that run, could not be found. The screen was out of date, so it was refreshed.',
  already_run: "You already used today's run. A new one opens when the day resets.",
  key_conflict: 'That clashed with an earlier request. Check your picks and try again.',
  invalid_treat: 'A treat can only go to a creature in the team, once.',
  insufficient_funds: 'Not enough Bait for those treats.',
  run_active: 'Your run is still open. Carry on from the map.',
  stale_step: 'Your run moved on in another window. The map was refreshed.',
  invalid_act: "That can't be done right now. The map was refreshed.",
  gone: 'The game was updated. Close and reopen the Activity to play the new dungeon.',
};

/** The message for a failed dungeon request; any other failure gets the game's usual text. */
export function dungeonErrorText(err: unknown): string {
  return errorText(err, 'Bait', DUNGEON_ERROR_TEXT);
}

/** The codes that say the screen showed an old state: load today again and show what is there. */
const STALE_CODES: readonly (string | null)[] = [
  'already_run',
  'not_found',
  'stale_step',
  'invalid_act',
  'run_active',
];

/**
 * True when the failure says the dungeon screen was out of date, so today's state should be loaded
 * again (the open run, if there is one, shows again). Narrower than `isStaleError`: it goes by the
 * error code, not the status (a clashing key is a 409 too, but the screen is not stale then).
 */
export function isStaleDungeonError(err: unknown): boolean {
  return err instanceof ApiError && STALE_CODES.includes(err.code);
}

/**
 * The line on the pre-run card at a landmark depth, which names the room boss before the run:
 * "Depth 14, a landmark: the Slag Tyrant waits. It winds up Slag Spill a round ahead." A boss with
 * no signature move leaves out the second sentence; a boss the content does not know is just "a
 * room boss". The names come from the content, never from the server's text.
 */
export function landmarkLine(landmark: NonNullable<DungeonToday['landmarkBoss']>): string {
  const foe = dungeonContent.foes.find((f) => f.id === landmark.foeId);
  const head = `Depth ${String(landmark.depth)}, a landmark`;
  if (foe === undefined) return `${head}: a room boss waits.`;
  const waits = `${head}: the ${foe.name} waits.`;
  return foe.signature === undefined
    ? waits
    : `${waits} It winds up ${foe.signature.name} a round ahead.`;
}

/**
 * The supply promise on the pre-run card, from the rules (`RULES.dungeon.perRoom` and `supplyTiers`):
 * which rooms drop a supply, and that deeper runs drop better ones (the tier odds grow with depth, and
 * good ones start at a depth). Null when no room drops a supply.
 */
export function supplyPromiseLine(depth: number): string | null {
  const per = RULES.dungeon.perRoom;
  const dropping = per.flatMap((room, i) => (room.supply > 0 ? [i] : []));
  if (dropping.length === 0) return null;
  const last = per.length - 1;
  let promise: string;
  if (dropping.length === per.length) promise = 'Every room you clear drops a supply.';
  else if (dropping.length === 1 && dropping[0] === 0) {
    promise = 'Clear the first room and you take home a supply, guaranteed.';
  } else if (dropping.length === 1 && dropping[0] === last) {
    promise = 'Clear the whole dungeon and you take home a supply, guaranteed.';
  } else promise = 'Clearing rooms drops supplies, guaranteed.';
  const goodFrom = RULES.dungeon.supplyTiers.good.fromDepth;
  const better =
    depth >= goodFrom
      ? 'The deeper you go, the better they get.'
      : `Better ones start at depth ${String(goodFrom)}.`;
  return `${promise} ${better}`;
}

/** Why a run cannot start now, in words; null when it can. */
export function blockedText(today: Pick<DungeonToday, 'blocked' | 'canRun'>): string | null {
  switch (today.blocked) {
    case 'already_run':
      return 'You have already run the dungeon today. A new run opens when the day resets.';
    case 'need_creatures':
      return 'You need at least 3 creatures to enter. Catch more on an expedition.';
    case null:
      return today.canRun ? null : 'No run is possible right now.';
  }
}

/** True on the first-day retry: a first run that was lost may be tried once more. */
export function isRetryOffer(
  today: Pick<DungeonToday, 'canRun' | 'attemptsToday' | 'attemptsAllowed' | 'last'>,
): boolean {
  return (
    today.canRun &&
    today.attemptsToday > 0 &&
    today.attemptsToday < today.attemptsAllowed &&
    today.last !== null &&
    !today.last.cleared
  );
}

/** The dungeon's one turn rule, said before the run (setup) and linked to "Your row" in the glossary. */
export const ORDER_LINE = 'Your creatures act left to right, then the foe.';

export const RETRY_TEXT = 'Your first run was lost. You get one more try today, free.';

/** How many days in a row, in words. */
export function streakLine(streak: number): string {
  if (streak <= 0) return 'No streak yet. Run today to start one.';
  return streak === 1 ? '1 day in a row' : `${String(streak)} days in a row`;
}

export interface StreakPip {
  day: number;
  on: boolean;
  /** The day pays a small bonus. */
  bonus: boolean;
}

/** The pips of a streak: a cycle of days (7), lit up to today's count; day 8 counts as day 1 again. */
export function streakPips(
  streak: number,
  cycleDays: number = RULES.dungeon.streak.cycleDays,
  bonusDays: readonly number[] = RULES.dungeon.streak.bonuses.map((b) => b.day),
): StreakPip[] {
  const lit = streak <= 0 ? 0 : ((streak - 1) % cycleDays) + 1;
  return Array.from({ length: cycleDays }, (_, i) => ({
    day: i + 1,
    on: i + 1 <= lit,
    bonus: bonusDays.includes(i + 1),
  }));
}

/** What a screen reader says for the streak row: "Streak: 3 / 7 days of the cycle". */
export function streakLabel(streak: number): string {
  const pips = streakPips(streak);
  const lit = pips.filter((p) => p.on).length;
  return `Streak: ${String(lit)} / ${String(pips.length)} days of the cycle`;
}

/** Foes' names get "Fierce" in front when they are the elite of a room (once: a name that has it keeps it). */
export function fierceName(name: string, elite: boolean | undefined): string {
  return elite === true && !name.startsWith('Fierce ') ? `Fierce ${name}` : name;
}

/**
 * The headline of a finished run. A path run says how it ended: cleared (one depth deeper), home
 * (the whole pack kept) or defeated (half the pack kept). A run from before the map has no outcome,
 * and keeps the old words about its three rooms.
 */
export function resultHeadline(
  run: Pick<DungeonRunSummary, 'cleared' | 'roomsCleared' | 'rooms'> &
    Partial<Pick<DungeonRunSummary, 'outcome' | 'depth' | 'newDepth' | 'pack'>>,
): string {
  switch (run.outcome) {
    case 'cleared':
      return `Cleared! Depth ${String(run.depth ?? 0)} to ${String(run.newDepth ?? 0)}`;
    case 'home':
      return 'Home safe with your whole pack';
    case 'defeat':
      // A defeat with nothing in the pack had nothing to halve: do not promise what did not happen.
      return run.pack !== undefined && isPackEmpty(run.pack.found)
        ? 'Defeated: your pack was empty'
        : 'Defeated: half your pack made it home';
    case undefined:
      break;
  }
  if (run.cleared) return 'Dungeon cleared!';
  const total = run.rooms.length;
  return run.roomsCleared === 0
    ? 'Your team was beaten in the first room.'
    : `Your team fell in room ${String(run.roomsCleared + 1)} / ${String(total)}.`;
}

/** What the run did to the depth. */
export function depthChangeText(
  run: Pick<DungeonRunSummary, 'depth' | 'newDepth'> & Partial<Pick<DungeonRunSummary, 'outcome'>>,
): string {
  if (run.newDepth > run.depth) return `Depth ${String(run.depth)} to ${String(run.newDepth)}`;
  const again = run.outcome === undefined ? 'Clear all three rooms' : 'Beat the room boss';
  return `Still at depth ${String(run.depth)}. ${again} to go deeper.`;
}

// --- The pack and the run strip ---

const PACK_KINDS = [
  ['bait', 'Bait'],
  ['essence', 'Essence'],
  ['scrap', 'Scrap'],
] as const;

/** True when the pack holds nothing. */
export function isPackEmpty(pack: DungeonPack): boolean {
  return pack.bait === 0 && pack.essence === 0 && pack.scrap === 0;
}

/** What a pack holds, without the empty kinds: "2 Bait · 1 Scrap". Empty: "nothing". */
export function packText(pack: DungeonPack): string {
  const parts = PACK_KINDS.filter(([kind]) => pack[kind] > 0).map(
    ([kind, name]) => `${String(pack[kind])} ${name}`,
  );
  return parts.length === 0 ? 'nothing' : parts.join(' · ');
}

/** The pack on the run strip: "In your pack: 2 Bait · 1 Scrap", or that it is empty. */
export function packLine(pack: DungeonPack): string {
  return isPackEmpty(pack) ? 'Your pack is empty.' : `In your pack: ${packText(pack)}`;
}

/** The floor of a node id ("f2l1" is floor 2), or null for an id that is not one. */
export function nodeFloor(node: string): number | null {
  const found = /^f(\d+)l\d+$/.exec(node);
  return found === null ? null : Number(found[1]);
}

/** "Floor 3 / 7": a floor counted from 1. */
export function floorLine(floor: number, floors: number): string {
  return `Floor ${String(floor + 1)} / ${String(floors)}`;
}

/**
 * Where the run is, for the run strip: "Depth 3 · At the entrance", "Depth 3 · Floor 3 / 7", and at
 * the camp "Depth 3 · At the camp". `landmark` is added by the screen as a chip.
 */
export function runStatusLine(
  state: Pick<DungeonRunState, 'at' | 'depth' | 'map' | 'pending'>,
): string {
  const depth = `Depth ${String(state.depth)}`;
  if (state.at === null) return `${depth} · At the entrance`;
  const node = state.map.nodes.find((n) => n.id === state.at);
  const floor = nodeFloor(state.at);
  if (node?.kind === 'camp') return `${depth} · At the camp`;
  return floor === null ? depth : `${depth} · ${floorLine(floor, state.map.floors)}`;
}

/** What the last mystery room did: its name and the choice, then the plain outcome. */
export function lastEventText(event: { name: string; option: string; outcome: string }): {
  title: string;
  outcome: string;
} {
  const outcome = event.outcome.trim();
  return {
    title: `${event.name}: ${event.option}`,
    outcome: /[.!?]$/.test(outcome) ? outcome : `${outcome}.`,
  };
}

/** A creature's HP in the run strip and the camp: "340 / 391 HP", or "Knocked out". */
export function runHpText(creature: { hp: number; hpMax: number }): string {
  return creature.hp <= 0 ? 'Knocked out' : `${String(creature.hp)} / ${String(creature.hpMax)} HP`;
}

// --- The camp ---

/** Basis points as a percentage in words: 4000 is "40%", 1250 is "12.5%". */
export function percentText(bp: number): string {
  return `${String(Math.round(bp) / 100)}%`;
}

export const CAMP_TITLE = 'The camp';
export const CAMP_INTRO = 'Pick one. You can also change the order for free.';
export const CAMP_HOME_BUTTON = 'Head home with your pack';
export const CAMP_HOME_LINE = 'Push on and a defeat keeps only half your pack.';

/** The three choices of the camp, each with its exact effect (the rest's number is the server's). */
export function campChoiceLines(restBp: number): {
  rest: { label: string; line: string };
  keepsake: { label: string; line: string };
  swap: { label: string; line: string };
} {
  return {
    rest: { label: 'Rest', line: `Standing creatures recover ${percentText(restBp)} HP.` },
    keepsake: { label: 'Take a keepsake', line: 'Choose one of two. It lasts the whole run.' },
    swap: {
      label: 'Swap a creature',
      line: 'Bring in a fresh creature at full HP. One goes home.',
    },
  };
}

/** Why Swap is not possible: the player has no creature outside the row. */
export const NO_SWAP_LINE = 'You have no other creatures to bring in.';

/** The room's place in the run, for the stage header: "Room 3 / 3, room boss". */
export function roomLine(index: number, total: number): string {
  return `Room ${String(index + 1)} / ${String(total)}`;
}

/**
 * The place of a fight in the stage header. A room of a path (it has a map node) reads by its floor,
 * "Floor 3 / 7" (`total` is the map's floors); a room of an old three-room run reads "Room 2 / 3".
 */
export function roomPlaceLine(
  room: { index: number; node?: string | undefined },
  total: number,
): string {
  const floor = room.node === undefined ? null : nodeFloor(room.node);
  return floor === null ? roomLine(room.index, total) : floorLine(floor, total);
}

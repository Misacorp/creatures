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
import { nodeLevel } from './dungeon-map';
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
 * The line on the pre-run card at a landmark depth, which names the floor boss before the run:
 * "Depth 14, a landmark: the Slag Tyrant waits. It winds up Slag Spill a round ahead." A boss with
 * no signature move leaves out the second sentence; a boss the content does not know is just "a
 * floor boss". The names come from the content, never from the server's text.
 */
export function landmarkLine(landmark: NonNullable<DungeonToday['landmarkBoss']>): string {
  const foe = dungeonContent.foes.find((f) => f.id === landmark.foeId);
  const head = `Depth ${String(landmark.depth)}, a landmark`;
  if (foe === undefined) return `${head}: a floor boss waits.`;
  const waits = `${head}: the ${foe.name} waits.`;
  return foe.signature === undefined
    ? waits
    : `${waits} It winds up ${foe.signature.name} a round ahead.`;
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

/** What the title of the results is coloured: green for a success (cleared, or home safe), red for a defeat. */
export type ResultTone = 'good' | 'bad';

/** The fields of a run summary that the results' title and summary line read. */
type ResultRun = Pick<DungeonRunSummary, 'cleared' | 'roomsCleared' | 'rooms'> &
  Partial<Pick<DungeonRunSummary, 'outcome' | 'depth' | 'newDepth' | 'pack' | 'deepest' | 'route'>>;

/**
 * The title of a finished run, a few words: "Cleared!", "Home safe", "Defeated", or "Lost in the
 * Undercroft" (the floor boss fell first, then the run was lost below it). A run from before the map has
 * no outcome: it is "Cleared!" or "Defeated".
 */
export function resultTitle(run: ResultRun): string {
  if (run.outcome === 'home') return 'Home safe';
  if (run.outcome === 'defeat' && run.cleared) return 'Lost in the Undercroft';
  return run.outcome === 'cleared' || (run.outcome === undefined && run.cleared)
    ? 'Cleared!'
    : 'Defeated';
}

/** The title's colour: a defeat is red, everything else green. */
export function resultTone(run: Pick<ResultRun, 'cleared' | 'outcome'>): ResultTone {
  return run.outcome === 'defeat' || (run.outcome === undefined && !run.cleared) ? 'bad' : 'good';
}

/** "room 4 / 7": the room of the day's floor the run was lost in, from its log; null when the log does not say. */
function lostRoomText(run: Pick<ResultRun, 'route'>): string | null {
  const route = run.route;
  if (route === undefined) return null;
  const lost = [...route.history].reverse().find((e) => e.result === 'fight' && !e.cleared);
  const floor = lost === undefined || nodeLevel(lost.node) > 0 ? null : nodeFloor(lost.node);
  return floor === null ? null : `room ${String(floor + 1)} / ${String(route.map.floors)}`;
}

/** "cleared 2 Undercroft floors". */
function undercroftFloorsText(floors: number): string {
  return `cleared ${String(floors)} Undercroft ${floors === 1 ? 'floor' : 'floors'}`;
}

/**
 * The line under the title: the whole run in plain words, in one or two short sentences. A clear says the
 * floor boss fell, the new depth, any Undercroft floors cleared and that the whole pack came home; a defeat in
 * the Undercroft names the floor boss that fell first; a defeat on the day's floor names the room it fell in;
 * a run that headed home from the camp says it kept the depth. A defeat with an empty pack does not promise
 * half of nothing (the rewards say so). Older runs, from before the map, keep a line about their rooms.
 */
export function resultSummary(run: ResultRun): string {
  const depth = run.depth ?? 0;
  const newDepth = run.newDepth ?? depth;
  const floors = run.deepest ?? 0;
  const empty = run.pack !== undefined && isPackEmpty(run.pack.found);
  switch (run.outcome) {
    case 'cleared': {
      const down = floors > 0 ? ` and ${undercroftFloorsText(floors)}` : '';
      const lead = `You defeated the floor boss and advanced to depth ${String(newDepth)}${down}.`;
      return empty ? lead : `${lead} You brought your whole pack home.`;
    }
    case 'home':
      return `You headed home from the camp with ${empty ? 'an empty pack' : 'your whole pack'}. You stay at depth ${String(depth)}.`;
    case 'defeat': {
      const kept = empty ? ' with an empty pack' : ' and kept half of your loot pack';
      if (run.cleared) {
        const below = floors > 0 ? `, then ${undercroftFloorsText(floors)}` : '';
        return `You defeated the first floor boss and advanced to depth ${String(newDepth)}${below}. You were defeated in the Undercroft${kept}.`;
      }
      const room = lostRoomText(run);
      return `You were defeated ${room === null ? 'on the way to the floor boss' : `in ${room}`}${kept}.`;
    }
    case undefined:
      break;
  }
  const total = run.rooms.length;
  if (run.cleared) {
    return newDepth > depth
      ? `You cleared all ${String(total)} rooms and went from depth ${String(depth)} to ${String(newDepth)}.`
      : `You cleared all ${String(total)} rooms. You stay at depth ${String(depth)}.`;
  }
  const fell =
    run.roomsCleared === 0
      ? 'Your team was beaten in the first room.'
      : `Your team fell in room ${String(run.roomsCleared + 1)} / ${String(total)}.`;
  return `${fell} You stay at depth ${String(depth)}.`;
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

/** The floor of a node id ("f2l1" is floor 2; "u1f0l0" is floor 0 of Undercroft level 1), or null for an id that is not one. */
export function nodeFloor(node: string): number | null {
  const found = /^(?:u\d+)?f(\d+)l\d+$/.exec(node);
  return found === null ? null : Number(found[1]);
}

/** "Undercroft 1": an Undercroft floor's name (its `level`) on the strip and the stage banner. */
export function undercroftName(level: number): string {
  return `Undercroft ${String(level)}`;
}

/** "Room 3 / 7": how far along the path a room is, counted from 1 (`floor` is the 0-based row of the map). */
export function floorLine(floor: number, floors: number): string {
  return `Room ${String(floor + 1)} / ${String(floors)}`;
}

/**
 * Where the run is, for the run strip: "Depth 3 · At the entrance", "Depth 3 · Room 3 / 7", and at
 * the camp "Depth 3 · At the camp". Once the floor boss has fallen: "Depth 9 · The floor boss is down" (the
 * depth it locked in) and, below, "Undercroft 1 · Room 2 / 4". `landmark` is added by the screen as a chip.
 */
export function runStatusLine(
  state: Pick<DungeonRunState, 'at' | 'depth' | 'map' | 'pending'> &
    Partial<Pick<DungeonRunState, 'level' | 'undercroft'>>,
): string {
  const level = state.level ?? 0;
  const maps = [state.map, ...(state.undercroft?.maps ?? [])];
  if (state.pending?.kind === 'descend') {
    return `Depth ${String(state.pending.newDepth)} · The floor boss is down`;
  }
  // Below the floor boss the depth is not the question: the Undercroft floor is.
  const depth = level > 0 ? undercroftName(level) : `Depth ${String(state.depth)}`;
  if (state.at === null) return `${depth} · At the entrance`;
  const at = state.at;
  const node = maps.flatMap((m) => m.nodes).find((n) => n.id === at);
  const floor = nodeFloor(at);
  if (node?.kind === 'camp') return `${depth} · At the camp`;
  const own = maps[nodeLevel(at)] ?? state.map;
  return floor === null ? depth : `${depth} · ${floorLine(floor, own.floors)}`;
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
/** The camp's one line of help: pick a choice, and the row can be reordered. */
export const CAMP_INTRO = 'Pick one. Drag or tap two creatures to swap places.';
/** The arrange step's one line, after a swap. */
export const CAMP_ARRANGE_LINE = 'Drag or tap two creatures to swap places, then confirm.';
export const CAMP_HOME_BUTTON = 'Head home with your pack';

/** The three choices of the camp, each with its exact effect (the rest's number is the server's). */
export function campChoiceLines(restBp: number): {
  rest: { label: string; line: string };
  keepsake: { label: string; line: string };
  swap: { label: string; line: string };
} {
  return {
    rest: { label: 'Rest', line: `Standing creatures heal ${percentText(restBp)} HP.` },
    keepsake: { label: 'Take a keepsake', line: 'One of two, for this run.' },
    swap: {
      label: 'Swap a creature',
      line: 'A fresh creature comes in at full HP.',
    },
  };
}

/** Why Swap is not possible: the player has no creature outside the row. */
export const NO_SWAP_LINE = 'You have no other creatures to bring in.';

/** The room's place in the run, for the stage header: "Room 3 / 3, floor boss". */
export function roomLine(index: number, total: number): string {
  return `Room ${String(index + 1)} / ${String(total)}`;
}

/**
 * The place of a fight in the stage header. A room of a path (it has a map node) reads by how far along
 * the path it is, "Room 3 / 7" (`total` is the map's floors, its rows); a room of an old three-room run
 * reads "Room 2 / 3".
 */
export function roomPlaceLine(
  room: { index: number; node?: string | undefined },
  total: number,
): string {
  const floor = room.node === undefined ? null : nodeFloor(room.node);
  if (floor === null) return roomLine(room.index, total);
  const level = room.node === undefined ? 0 : nodeLevel(room.node);
  return level > 0
    ? `${undercroftName(level)} · ${floorLine(floor, total)}`
    : floorLine(floor, total);
}

// --- The descent card ---

/** The pending descent of a run: what the card shows (`DungeonRunState.pending` of kind `descend`). */
type Descent = Extract<NonNullable<DungeonRunState['pending']>, { kind: 'descend' }>;

export const DESCEND_BUTTON = 'Descend';
/** The same words as the camp's button: the same choice reads the same on both cards. */
export const DESCEND_HOME_BUTTON = CAMP_HOME_BUTTON;
export const DESCEND_TITLE_CRACKED = 'The floor cracks open';

/** "Depth 15 unlocked" after the day's floor boss; "The floor cracks open" after an Undercroft floor boss (a cracked floor). */
export function descendTitle(descent: Pick<Descent, 'level' | 'newDepth'>): string {
  return descent.level <= 1 ? `Depth ${String(descent.newDepth)} unlocked` : DESCEND_TITLE_CRACKED;
}

/** The line under the title: a new depth was won (after the day's floor boss), or the floor has cracked (after an Undercroft floor boss). */
export function descendIntro(descent: Pick<Descent, 'level' | 'newDepth'>): string {
  return descent.level <= 1
    ? 'You beat the floor boss and achieved a new depth. Do you dare delve deeper?'
    : 'Another floor waits below. Do you dare delve deeper?';
}

/** The title of the Undercroft part of the card. */
export const DESCEND_UNDER_HEADING = 'The Undercroft';

/** Under "Still at risk" when the pack is empty. */
export const DESCEND_EMPTY_PACK_HELP = 'Your pack is empty, so there is nothing to lose.';

/** "20% HP": the breath the creatures catch on the way down. */
export function catchBreathText(catchBreathBp: number): string {
  return `${percentText(catchBreathBp)} HP`;
}

/** "10% HP": the HP a fallen creature gets back up with on the way down. */
export function reviveText(reviveBp: number): string {
  return `${percentText(reviveBp)} HP`;
}

/**
 * What the Undercroft below holds, one plain line each, from the descent the server sent and the rules:
 * its rooms (one per row of its map, the floor boss's last) and the depth its foes fight at (the run's `depth` plus
 * `depthBonus` for each Undercroft floor, as `undercroftDepth` scales them), the breath the row catches, the loot
 * there and the way home. The numbers are the server's (the loot multiplier is the rules').
 */
export function descendLines(
  descent: Pick<Descent, 'level' | 'floors' | 'depthBonus' | 'catchBreathBp' | 'reviveBp'>,
  depth: number,
  lootMultiplier: number = RULES.dungeon.undercroft.lootMultiplier,
): string[] {
  const foeDepth = depth + descent.depthBonus * descent.level;
  const rooms = `${String(descent.floors)} ${descent.floors === 1 ? 'room' : 'rooms'}`;
  const loot = lootMultiplier === 2 ? 'double' : `${String(lootMultiplier)}×`;
  return [
    `${rooms} with a floor boss at the end. Foes are from depth ${String(foeDepth)}.`,
    `Your creatures catch their breath and heal ${catchBreathText(descent.catchBreathBp)}. Downed creatures revive to ${reviveText(descent.reviveBp)}.`,
    `Fights in the Undercroft reward ${loot} loot.`,
    "Once you go down, you fight to the end. If you're lucky, finding a camp may give you a chance to return safely.",
  ];
}

/** Under the Descend button: what a loss below costs. */
export const DESCEND_RISK_LINE = 'Keep half of your pack if you are defeated.';
/** Under the home button. */
export const DESCEND_HOME_LINE = 'Keep your full pack.';

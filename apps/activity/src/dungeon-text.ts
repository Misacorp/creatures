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
 * The headline of a finished run. A path run says how it ended: cleared (one depth deeper, and how many
 * Undercroft floors it cleared), home (the whole pack kept) or defeated (half the pack kept; below the
 * floor boss it is "Lost in the Undercroft", since the boss fell and the depth went up). A run from before
 * the map has no outcome, and keeps the old words about its three rooms.
 */
export function resultHeadline(
  run: Pick<DungeonRunSummary, 'cleared' | 'roomsCleared' | 'rooms'> &
    Partial<Pick<DungeonRunSummary, 'outcome' | 'depth' | 'newDepth' | 'pack' | 'deepest'>>,
): string {
  switch (run.outcome) {
    case 'cleared': {
      const depth = `Cleared! Depth ${String(run.depth ?? 0)} to ${String(run.newDepth ?? 0)}`;
      const deepest = run.deepest ?? 0;
      return deepest > 0 ? `${depth} · ${undercroftClearedText(deepest)}` : depth;
    }
    case 'home':
      return 'Home safe with your whole pack';
    case 'defeat': {
      // A defeat with nothing in the pack had nothing to halve: do not promise what did not happen.
      const empty = run.pack !== undefined && isPackEmpty(run.pack.found);
      // The floor boss fell first (`cleared` stays true), so this was a loss in the Undercroft.
      const lead = run.cleared ? 'Lost in the Undercroft' : 'Defeated';
      return empty ? `${lead}: your pack was empty` : `${lead}: half your pack made it home`;
    }
    case undefined:
      break;
  }
  if (run.cleared) return 'Dungeon cleared!';
  const total = run.rooms.length;
  return run.roomsCleared === 0
    ? 'Your team was beaten in the first room.'
    : `Your team fell in room ${String(run.roomsCleared + 1)} / ${String(total)}.`;
}

/**
 * What the run did to the depth. A run lost below the floor boss still went one deeper: it says so (the
 * boss fell first, so the depth stays) and how many Undercroft floors it had cleared.
 */
export function depthChangeText(
  run: Pick<DungeonRunSummary, 'depth' | 'newDepth'> &
    Partial<Pick<DungeonRunSummary, 'outcome' | 'cleared' | 'deepest'>>,
): string {
  if (run.newDepth > run.depth) {
    const change = `Depth ${String(run.depth)} to ${String(run.newDepth)}`;
    if (run.outcome !== 'defeat') return change;
    const floors = run.deepest ?? 0;
    const cleared = floors > 0 ? ` ${undercroftClearedText(floors)}.` : '';
    return `${change}.${cleared} The floor boss fell first, so the new depth stays.`;
  }
  const again = run.outcome === undefined ? 'Clear all three rooms' : 'Beat the floor boss';
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

/** The floor of a node id ("f2l1" is floor 2; "u1f0l0" is floor 0 of Undercroft level 1), or null for an id that is not one. */
export function nodeFloor(node: string): number | null {
  const found = /^(?:u\d+)?f(\d+)l\d+$/.exec(node);
  return found === null ? null : Number(found[1]);
}

/** "Undercroft floor 1": an Undercroft floor's name (its `level`) on the strip and the stage banner. */
export function undercroftName(level: number): string {
  return `Undercroft floor ${String(level)}`;
}

/** "1 Undercroft floor cleared" or "2 Undercroft floors cleared": how many Undercroft floors a run cleared. */
export function undercroftClearedText(floors: number): string {
  return `${String(floors)} Undercroft ${floors === 1 ? 'floor' : 'floors'} cleared`;
}

/** "Room 3 / 7": how far along the path a room is, counted from 1 (`floor` is the 0-based row of the map). */
export function floorLine(floor: number, floors: number): string {
  return `Room ${String(floor + 1)} / ${String(floors)}`;
}

/**
 * Where the run is, for the run strip: "Depth 3 · At the entrance", "Depth 3 · Room 3 / 7", and at
 * the camp "Depth 3 · At the camp". Once the floor boss has fallen: "Depth 9 · The floor boss is down" (the
 * depth it locked in) and, below, "Undercroft floor 1 · Room 2 / 4". `landmark` is added by the screen as a chip.
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
export const DESCEND_HOME_BUTTON = 'Head Home';
export const DESCEND_TITLE_CRACKED = 'The floor cracks open';

/** "Depth 15 Unlocked" after the day's floor boss; "The floor cracks open" after an Undercroft floor boss (a cracked floor). */
export function descendTitle(descent: Pick<Descent, 'level' | 'newDepth'>): string {
  return descent.level <= 1 ? `Depth ${String(descent.newDepth)} Unlocked` : DESCEND_TITLE_CRACKED;
}

/** The line under the title: a new depth was won (after the day's floor boss), or the floor has cracked (after an Undercroft floor boss). */
export function descendIntro(descent: Pick<Descent, 'level' | 'newDepth'>): string {
  return descent.level <= 1
    ? 'You beat the boss and achieved a new depth. Do you dare delve deeper?'
    : 'Another floor waits below. Do you dare delve deeper?';
}

/** The title of the Undercroft part of the card. */
export const DESCEND_UNDER_HEADING = 'The Undercroft';

/** Under "Banked now": what is safe. */
export const DESCEND_BANKED_HELP =
  'Experience gained by creatures and the following items are yours, no matter what happens below.';
/** Under "Still at risk": the pack. */
export const DESCEND_RISK_HELP =
  'Your pack contains the following items and you risk losing some of them by delving deeper.';
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
    `${rooms} with a floor boss at the end. Foes are from depth level ${String(foeDepth)}.`,
    `Your creatures catch their breath and heal ${catchBreathText(descent.catchBreathBp)}. Downed creatures revive to ${reviveText(descent.reviveBp)}.`,
    `Fights in the Undercroft reward ${loot} loot.`,
    "Once you go down, you fight to the end. If you're lucky, finding a camp may give you a chance to return safely.",
  ];
}

/** Under the Descend button: what a loss below costs. */
export const DESCEND_RISK_LINE = 'Keep half of your pack if you are defeated.';
/** Under the home button. */
export const DESCEND_HOME_LINE = 'Keep your full pack.';

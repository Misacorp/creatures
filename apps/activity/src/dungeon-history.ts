/**
 * The words of what happened in a room the run has been through (`DungeonStepLog`): the drawer of a
 * visited room on the run map and on the results map says them. Pure functions, plain text; names and
 * lines come from the server's content and are rendered as text only.
 */
import { isPackEmpty } from './dungeon-text';
import type { MapRun } from './dungeon-map';
import type {
  DungeonMapView,
  DungeonPack,
  DungeonRunSummary,
  DungeonStepLog,
} from './dungeon-types';

type FightLog = Extract<DungeonStepLog, { result: 'fight' }>;
type ChestLog = Extract<DungeonStepLog, { result: 'chest' }>;
type DescendLog = Extract<DungeonStepLog, { kind: 'descend' }>;

/** What happened at a room: its first entry in the history, or undefined (an older server sends none). */
export function stepAt(
  history: readonly DungeonStepLog[] | undefined,
  node: string,
): DungeonStepLog | undefined {
  return history?.find((entry) => entry.node === node);
}

/**
 * Everything that happened at a room, in order. A boss that fell has up to three entries: the fight, its
 * chest and the descent (a waiting card, or the way the run went on: down or home).
 */
export function stepsAt(
  history: readonly DungeonStepLog[] | undefined,
  node: string,
): DungeonStepLog[] {
  return (history ?? []).filter((entry) => entry.node === node);
}

/** "HP 0 / 412" for a foe that was beaten, "HP 120 / 412" for one that was left standing. */
export function foeHpOutcomeLine(entry: Pick<FightLog, 'foeHpEnd' | 'foeHpMax'>): string {
  const left = Math.max(0, Math.min(entry.foeHpEnd, entry.foeHpMax));
  return `HP ${String(left)} / ${String(entry.foeHpMax)}`;
}

/** The word on a fight's tag: "Cleared" or "Defeat". */
export function fightResultWord(entry: Pick<FightLog, 'cleared'>): 'Cleared' | 'Defeat' {
  return entry.cleared ? 'Cleared' : 'Defeat';
}

/** How long the fight lasted: "Won in 5 rounds." or "Your team fell after 5 rounds." */
export function roundsLine(entry: Pick<FightLog, 'cleared' | 'rounds'>): string {
  const rounds = `${String(entry.rounds)} ${entry.rounds === 1 ? 'round' : 'rounds'}`;
  return entry.cleared ? `Won in ${rounds}.` : `Your team fell after ${rounds}.`;
}

export const SUPPLY_LINE = "Earned the run's supply.";
/** Under the loot of a room that put something in the pack. */
export const LOOT_LABEL = 'Into your pack';
/** A room that gave nothing: said so in a quiet line. */
export const NO_LOOT_LINE = 'Nothing went into the pack.';
export const PENDING_EVENT_LINE = 'A choice is waiting here.';
/** A carved door that added a room, and one that had nothing more to add (a run holds two at most). */
export const DOOR_ADDED_LINE = 'Added a room to the Undercroft.';
export const DOOR_NONE_LINE = 'Nothing more to add.';
export const PENDING_DESCEND_LINE = 'The way down is open. Head home, or descend.';

/** What a carved door did when the run stepped through (which room it added is never said). */
export function doorLine(
  entry: Pick<Extract<DungeonStepLog, { result: 'door' }>, 'added'>,
): string {
  return entry.added ? DOOR_ADDED_LINE : DOOR_NONE_LINE;
}

/** A boss chest: "The boss chest opened." or "The keeper's chest opened." (level 0 is the room boss's). */
export function chestLine(entry: Pick<ChestLog, 'level'>): string {
  return entry.level === 0 ? 'The boss chest opened.' : "The keeper's chest opened.";
}

/** The label over a chest's gear: it was banked at once, not put in the pack. */
export const CHEST_GEAR_LABEL = 'Banked at once';

/**
 * What the descent card's choice came to: "You went down into Undercroft 1. Your creatures caught their
 * breath (140 HP between them). 2 fallen creatures got back up." or "You headed home with the whole pack." (a card still waiting is
 * `PENDING_DESCEND_LINE`).
 */
export function descendLine(
  entry: Pick<DescendLog, 'result' | 'level'> & { healed?: number; revived?: number },
): string {
  switch (entry.result) {
    case 'descend': {
      const revived = entry.revived ?? 0;
      const back =
        revived <= 0
          ? ''
          : ` ${String(revived)} fallen ${revived === 1 ? 'creature' : 'creatures'} got back up.`;
      return `You went down into Undercroft ${String(entry.level)}. Your creatures caught their breath (${String(entry.healed ?? 0)} HP between them).${back}`;
    }
    case 'home':
      return 'You headed home with the whole pack.';
    case 'pending':
      return PENDING_DESCEND_LINE;
  }
}

export const PENDING_CAMP_LINE =
  'The camp is waiting. Rest, swap, take a keepsake, or head home with your pack.';

/** What a mystery room's pick was: "You picked: Take one coin." */
export function pickedLine(option: string): string {
  const text = option.trim();
  return `You picked: ${/[.!?]$/.test(text) ? text : `${text}.`}`;
}

/** The loot of a log entry (zeros for the kinds that carry none), for the badges. */
export function lootOf(entry: DungeonStepLog): DungeonPack | null {
  if (
    entry.result === 'fight' ||
    entry.result === 'cache' ||
    entry.result === 'event' ||
    entry.result === 'chest'
  ) {
    return isPackEmpty(entry.loot) ? null : entry.loot;
  }
  return null;
}

/**
 * The route of a finished run as the map wants it: the rooms walked, none to go to and no room it
 * stands in, with what each did. Null for a run with no route (an older run).
 */
export function routeRun(run: Pick<DungeonRunSummary, 'route' | 'landmark'>): {
  map: NonNullable<DungeonRunSummary['route']>['map'];
  /** The Undercroft levels the run went down into, in order (none: it never did). */
  undercroft: DungeonMapView[];
  run: MapRun;
} | null {
  const route = run.route;
  if (route === undefined) return null;
  return {
    map: route.map,
    run: {
      status: 'done',
      at: null,
      path: route.path,
      reachable: [],
      landmark: run.landmark,
      history: route.history,
    },
    undercroft: route.undercroft ?? [],
  };
}

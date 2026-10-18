/**
 * The words of what happened in a room the run has been through (`DungeonStepLog`): the drawer of a
 * visited room on the run map and on the results map says them. Pure functions, plain text; names and
 * lines come from the server's content and are rendered as text only.
 */
import { isPackEmpty } from './dungeon-text';
import type { MapRun } from './dungeon-map';
import type { DungeonPack, DungeonRunSummary, DungeonStepLog } from './dungeon-types';

type FightLog = Extract<DungeonStepLog, { result: 'fight' }>;

/** What happened at a room: its entry in the history, or undefined (an older server sends none). */
export function stepAt(
  history: readonly DungeonStepLog[] | undefined,
  node: string,
): DungeonStepLog | undefined {
  return history?.find((entry) => entry.node === node);
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
export const PENDING_CAMP_LINE =
  'The camp is waiting. Rest, swap, take a keepsake, or head home with your pack.';

/** What a mystery room's pick was: "You picked: Take one coin." */
export function pickedLine(option: string): string {
  const text = option.trim();
  return `You picked: ${/[.!?]$/.test(text) ? text : `${text}.`}`;
}

/** The loot of a log entry (zeros for the kinds that carry none), for the badges. */
export function lootOf(entry: DungeonStepLog): DungeonPack | null {
  if (entry.result === 'fight' || entry.result === 'cache' || entry.result === 'event') {
    return isPackEmpty(entry.loot) ? null : entry.loot;
  }
  return null;
}

/**
 * The route of a finished run as the map wants it: the rooms walked, none to go to and no room it
 * stands in, with what each did. Null for a run with no route (an older run).
 */
export function routeRun(
  run: Pick<DungeonRunSummary, 'route' | 'landmark'>,
): { map: NonNullable<DungeonRunSummary['route']>['map']; run: MapRun } | null {
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
  };
}

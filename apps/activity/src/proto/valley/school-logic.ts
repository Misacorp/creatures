/**
 * The School's trials as plain functions (prototype, dev only; `systems/trials.md`, V-TRIAL-1 to 5, and
 * `school.md`, V-SCH-9): a trial is an honour (a ribbon, a title "Pip, Bronze"), never a gate; its boxes come
 * from the valley's systems; a creature with every box ticked graduates at the day's ceremony at the School,
 * whether or not its player is there. No DOM, no clock: the phase of the ceremony is a pure function of the
 * local time (or of a dev override).
 */

/** The honours, lowest first (V-TRIAL-2: Bronze from level 10, Silver from 20, Gold from 30). */
export type Honour = 'bronze' | 'silver' | 'gold';

/** The first level a creature may try a Bronze trial. */
export const BRONZE_FROM_LEVEL = 10;

export type BoxId = 'dungeon' | 'post' | 'find' | 'fire';

/**
 * Bronze's boxes (V-TRIAL-2): a dungeon clear, a day at a post, a find or a day of smithing, a moment at the
 * bonfire. Each has a picture (`glyphs.ts`) and a short label for the checklist drawer.
 */
export const BRONZE_BOXES: readonly { id: BoxId; label: string; glyph: string }[] = [
  { id: 'dungeon', label: 'Cleared a dungeon', glyph: 'lantern' },
  { id: 'post', label: 'A day at a post', glyph: 'satchel' },
  { id: 'find', label: 'A find, or a day of smithing', glyph: 'gift' },
  { id: 'fire', label: 'A moment at the bonfire', glyph: 'sparkle' },
];

/** A creature's Bronze trial: which boxes are ticked. */
export interface Trial {
  creatureId: string;
  ticked: readonly BoxId[];
}

export const tickedCount = (trial: Trial): number =>
  BRONZE_BOXES.filter((b) => trial.ticked.includes(b.id)).length;

/** Every box is ticked: the creature graduates at the next ceremony. */
export const isComplete = (trial: Trial): boolean => tickedCount(trial) === BRONZE_BOXES.length;

/** Whether a creature of this level may try Bronze (a level 9 creature shows no trial yet). */
export const canTry = (level: number): boolean => level >= BRONZE_FROM_LEVEL;

/** SAMPLE ceremony time: the School's daily ceremony begins at 9:00 and lasts half an hour. */
export const CEREMONY_START = 9 * 60;
export const CEREMONY_LENGTH = 30;

/** Before the day's ceremony, during it, or after it (the graduates already wear their ribbons). */
export type CeremonyPhase = 'before' | 'live' | 'after';

export const CEREMONY_PHASES: readonly CeremonyPhase[] = ['before', 'live', 'after'];

/** The phase at a local time; a dev override wins (`&ceremony=live`). */
export function ceremonyPhase(
  clock: { hour: number; minute: number },
  override?: CeremonyPhase | null,
): CeremonyPhase {
  if (override !== undefined && override !== null) return override;
  const minutes = clock.hour * 60 + clock.minute;
  if (minutes < CEREMONY_START) return 'before';
  return minutes < CEREMONY_START + CEREMONY_LENGTH ? 'live' : 'after';
}

/** Reads the dev override from a hash such as `#valley?ceremony=live`; null when absent or unknown. */
export function ceremonyParam(hash: string): CeremonyPhase | null {
  const found = /[?&]ceremony=([a-z]+)(?:&|$)/.exec(hash)?.[1];
  return CEREMONY_PHASES.find((p) => p === found) ?? null;
}

/** What a pupil shows at a phase: still working, ready (all ticked, the ceremony not yet), pinned now, or wearing the ribbon. */
export type PupilState = 'working' | 'ready' | 'pinning' | 'graduated';

export function pupilState(trial: Trial, phase: CeremonyPhase): PupilState {
  if (!isComplete(trial)) return 'working';
  if (phase === 'before') return 'ready';
  return phase === 'live' ? 'pinning' : 'graduated';
}

/** The title a graduate wears: "Pip, Bronze". */
export function honourTitle(name: string, honour: Honour = 'bronze'): string {
  return `${name}, ${honour.charAt(0).toUpperCase()}${honour.slice(1)}`;
}

/** How many creatures are ready to graduate (V-TRIAL-3: the valley's "2 ready to graduate"). */
export const readyCount = (trials: readonly Trial[]): number => trials.filter(isComplete).length;

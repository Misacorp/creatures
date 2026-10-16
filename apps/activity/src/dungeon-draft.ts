/**
 * The timing of saving the dungeon team draft, with no screen in it. The row of the setup changes
 * often (every drop, every pick), so a change only starts a short wait; more changes restart it, and
 * only the last row is sent. `flush` sends a waiting row at once (the screen is being left or hidden),
 * `cancel` forgets it (a run is starting, which deletes the draft anyway). A save that fails is
 * dropped without a word: the draft is a convenience, and the row is still in memory.
 */
import type { Slots } from './dungeon-team';

/** How long the row has to stay unchanged before it is saved. */
export const DRAFT_SAVE_DELAY_MS = 800;

export interface DraftSaver {
  /** The row changed: send it after the wait (replacing any row still waiting). */
  change: (team: Slots) => void;
  /** Sends the waiting row now; does nothing when none waits. */
  flush: () => void;
  /** Forgets the waiting row without sending it. */
  cancel: () => void;
  /** True while a row waits. */
  pending: () => boolean;
}

export function createDraftSaver(
  save: (team: Slots) => Promise<unknown>,
  delayMs: number = DRAFT_SAVE_DELAY_MS,
): DraftSaver {
  let waiting: Slots | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stop = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const send = (): void => {
    stop();
    const team = waiting;
    waiting = null;
    if (team === null) return;
    try {
      // A rejected promise and a throw are the same to the player: nothing to say.
      save(team).catch(() => undefined);
    } catch {
      // Nothing to do either.
    }
  };

  return {
    change: (team) => {
      waiting = team;
      stop();
      timer = setTimeout(send, delayMs);
    },
    flush: send,
    cancel: () => {
      stop();
      waiting = null;
    },
    pending: () => waiting !== null,
  };
}

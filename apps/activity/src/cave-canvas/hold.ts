/**
 * What the Cave canvas holds back while a room's fight plays (`docs/design/dungeon-canvas.md`, "The hold rule"). The server answers a
 * move at once with the room's stored fight AND the run as it stands after it (HP, the pack, the route, maybe the whole run over); the
 * fight is then played out on the scene over many seconds. Until it has finished nothing of the answer may show: the map, the HP on it,
 * the Pack, the Route, the now line, the valley's Cave line and the Home pips all stay at the state before the room, so the fight is
 * never told in advance. Balances already wait (`Dungeon`'s `refreshOwed`). Pure; the screen above (`Dungeon.tsx`) applies it.
 *
 * The raid canvas's `raid-canvas/hold.ts` is the model: it holds a stage's outcome signals until `endsAt`; here the end is the
 * playback's own `onDone`, so the held part is kept and released then.
 */
import type { PlaybackInput } from '../dungeon-playback';
import type {
  DungeonActResponse,
  DungeonRunState,
  DungeonRunSummary,
  DungeonToday,
} from '../dungeon-types';

/** What the canvas draws. `fight` carries the run as it stood BEFORE the room; `after` is the answer's own state, shown on release. */
export type CaveView =
  | { kind: 'setup' }
  | { kind: 'run'; state: DungeonRunState }
  | {
      kind: 'fight';
      input: PlaybackInput;
      before: DungeonRunState;
      after: DungeonRunState;
      summary: DungeonRunSummary | null;
    }
  | { kind: 'playback'; input: PlaybackInput; run: DungeonRunSummary }
  | { kind: 'results'; run: DungeonRunSummary };

/** The run the canvas shows now: while a fight plays, the one before it; never the answer's. */
export function shownRun(view: CaveView): DungeonRunState | null {
  switch (view.kind) {
    case 'run':
      return view.state;
    case 'fight':
      return view.before;
    default:
      return null;
  }
}

/** The parts of an answer that wait for the fight: today's state (the pip, the Cave line), or a reload of it when the run ended. */
export interface HeldAnswer {
  today: DungeonToday | null;
  /** The answer carried the summary but no `today`: ask the server for it once the fight is over. */
  reload: boolean;
}

export function heldOf(answer: Pick<DungeonActResponse, 'today' | 'summary'>): HeldAnswer {
  return {
    today: answer.today ?? null,
    reload: answer.today === undefined && answer.summary !== undefined,
  };
}

/** Lets the held part go: what the page applies at once, applied now. */
export function release(
  held: HeldAnswer | null,
  apply: { accept: (today: DungeonToday) => void; load: () => void },
): void {
  if (held === null) return;
  if (held.today !== null) apply.accept(held.today);
  else if (held.reload) apply.load();
}

/**
 * Whether the valley's Cave line already says "the run is over": the page's rule flips it as soon as the answer that ended the run
 * arrives (`dungeonPhase(..., runEnded)`); on the canvas it waits for the fight, so it never tells the fight in advance.
 */
export function runEndedForPhase(
  view: { kind: string; summary?: unknown },
  canvas: boolean,
): boolean {
  return view.kind === 'fight' && view.summary !== null && !canvas;
}

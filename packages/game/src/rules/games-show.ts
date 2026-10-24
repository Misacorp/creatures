/**
 * The Valley Games show's timeline (docs/design/valley-games.md): when each event's intro card, play and
 * podium card run, as offsets from the show's start. Shared by the server (the show's end is the award
 * time) and the client (it seeks to `serverNow - showAt`), so both always agree. Pure.
 */

/** How long each event's intro card shows before it plays, and its podium card after. */
export const GAMES_SHOW_TIMING = { introMs: 4_000, podiumMs: 5_000 } as const;

/** What the timeline needs of an event: its length (`GamesEventResult.ticks` and `tickMs`). */
export interface ShowTimelineInput {
  eventId: string;
  ticks: number;
  tickMs: number;
  /** Nobody entered: the intro card says so, and there is no play and no podium. */
  skipped?: boolean;
}

export interface ShowSegment {
  eventId: string;
  /** The intro card shows from here (ms after the show's start). */
  introMs: number;
  /** Play runs from `startMs` to `endMs` (equal for a skipped event). */
  startMs: number;
  endMs: number;
  /** The podium card shows from `endMs` to here; the next event's intro starts here. */
  podiumEndMs: number;
  skipped: boolean;
}

/**
 * The segments of a show, in order: each event's intro card, its play (`ticks * tickMs`) and its podium
 * card. A skipped event is its intro card only. Throws a RangeError for a negative or fractional length.
 */
export function showTimeline(events: readonly ShowTimelineInput[]): ShowSegment[] {
  const { introMs, podiumMs } = GAMES_SHOW_TIMING;
  const out: ShowSegment[] = [];
  let at = 0;
  for (const e of events) {
    if (!Number.isInteger(e.ticks) || e.ticks < 0 || !Number.isInteger(e.tickMs) || e.tickMs < 1) {
      throw new RangeError(`event "${e.eventId}": ticks and tickMs must be whole numbers`);
    }
    const skipped = e.skipped === true;
    const startMs = at + introMs;
    const endMs = skipped ? startMs : startMs + e.ticks * e.tickMs;
    const podiumEndMs = skipped ? endMs : endMs + podiumMs;
    out.push({ eventId: e.eventId, introMs: at, startMs, endMs, podiumEndMs, skipped });
    at = podiumEndMs;
  }
  return out;
}

/** The whole show's length in ms (0 for no events). */
export function showLengthMs(events: readonly ShowTimelineInput[]): number {
  return showTimeline(events).at(-1)?.podiumEndMs ?? 0;
}

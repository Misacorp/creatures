import type { FightEvent } from '@creatures/engine';
import { useEffect, useRef, useState } from 'preact/hooks';
import { buildBeats, fitBeats, liveBudgetMs, playStart } from './stage';

/** The beat being animated: events [from, to), its length, and a counter that grows with every beat. */
export interface Anim {
  from: number;
  to: number;
  ms: number;
  seq: number;
}

export interface StageView {
  /** How many events the stage shows. */
  index: number;
  anim: Anim | null;
}

/**
 * Plays the live finale's new events as beats. When a poll brings more events, the stage steps
 * through them one beat at a time (each at most 600 ms, together within the round length); rounds that
 * went by unseen are skipped. A stage that is mounted with events already there shows them at
 * once, and so does a player who asks for reduced motion (the newest beat is then only
 * outlined). The server's fight is never touched: this only decides what to show when.
 */
export function useLiveStage(
  events: readonly FightEvent[],
  rowIds: readonly string[],
  roundMs: number,
  reducedMotion: boolean,
): StageView {
  const [view, setView] = useState<StageView>({ index: events.length, anim: null });
  const shown = useRef(events.length);
  const seq = useRef(0);
  const latest = useRef({ events, rowIds, roundMs, reducedMotion });
  latest.current = { events, rowIds, roundMs, reducedMotion };
  const length = events.length;

  useEffect(() => {
    const { events: log, rowIds: ids, roundMs: ms, reducedMotion: still } = latest.current;
    if (log.length <= shown.current) {
      // Nothing new (or a different, shorter log): show what there is.
      shown.current = log.length;
      setView((v) =>
        v.index === log.length && v.anim === null ? v : { index: log.length, anim: null },
      );
      return undefined;
    }
    if (still) {
      const last = buildBeats(log, shown.current, ids).at(-1);
      shown.current = log.length;
      seq.current += 1;
      setView({
        index: log.length,
        anim: last === undefined ? null : { from: last.from, to: last.to, ms: 0, seq: seq.current },
      });
      return undefined;
    }
    const beats = fitBeats(buildBeats(log, playStart(log, shown.current), ids), liveBudgetMs(ms));
    let next = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const step = (): void => {
      const beat = beats[next];
      if (beat === undefined) {
        shown.current = log.length;
        setView({ index: log.length, anim: null });
        return;
      }
      next += 1;
      seq.current += 1;
      shown.current = beat.to;
      setView({
        index: beat.to,
        anim: { from: beat.from, to: beat.to, ms: beat.ms, seq: seq.current },
      });
      timer = setTimeout(step, beat.ms);
    };
    step();
    return () => {
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [length, reducedMotion]);

  return view;
}

import type { FightEvent } from '@creatures/engine';
import { useEffect, useRef, useState } from 'preact/hooks';
import { buildBeats, playStart } from './stage';
import { INTRO_LIVE_MS, planLiveRound, staticFx, type FxItem, type IntroView } from './stage-fx';
import { useFxTrail } from './use-fx-trail';

/** The beat being animated: events [from, to), its stagger, and a counter that grows with every beat. */
export interface Anim {
  from: number;
  to: number;
  ms: number;
  seq: number;
}

export interface StageView {
  /** How many events the stage shows. */
  index: number;
  /** The newest beat, for the short animations (hops, flashes, shakes). */
  anim: Anim | null;
  /** Effects that stay longer than their beat: numbers, bursts, ability cards, knockouts. */
  fx: readonly FxItem[];
  /** The "Round N" overlay while a live round opens; null otherwise. */
  intro: IntroView | null;
}

interface Position {
  index: number;
  anim: Anim | null;
}

/**
 * Plays the live finale's new events. When a poll brings a new round, the stage first shows "Round N"
 * for 3 seconds, then steps through the round's beats, each starting 500 to 700 ms after the one
 * before (squeezed to at least 250 ms so the last beat's effects are over about 1.5 seconds before
 * the next round). Effects stay on screen for their own, longer time and overlap the following beats.
 * Rounds that went by unseen are skipped. A stage that is mounted with events already there shows
 * them at once, and so does a player who asks for reduced motion (the newest beat is then only
 * outlined and the intro is plain text). `hold` waits before starting (while "FIGHT!" is on screen).
 * The server's fight is never touched: this only decides what to show when.
 */
export function useLiveStage(
  events: readonly FightEvent[],
  rowIds: readonly string[],
  roundMs: number,
  rounds: number,
  reducedMotion: boolean,
  hold = false,
): StageView {
  const [pos, setPos] = useState<Position>({ index: events.length, anim: null });
  const [intro, setIntro] = useState<IntroView | null>(null);
  const [still, setStill] = useState<readonly FxItem[]>([]);
  const trail = useFxTrail();
  const shown = useRef(events.length);
  const seq = useRef(0);
  const latest = useRef({ events, rowIds, roundMs, rounds, reducedMotion, hold });
  latest.current = { events, rowIds, roundMs, rounds, reducedMotion, hold };
  const length = events.length;

  useEffect(() => {
    const {
      events: log,
      rowIds: ids,
      roundMs: ms,
      rounds: total,
      reducedMotion: calm,
    } = latest.current;
    if (log.length <= shown.current) {
      // Nothing new (or a different, shorter log): show what there is.
      shown.current = log.length;
      setPos((v) =>
        v.index === log.length && v.anim === null ? v : { index: log.length, anim: null },
      );
      return undefined;
    }
    if (latest.current.hold) return undefined;
    const start = playStart(log, shown.current);
    const opening = log[start];
    const round = opening?.t === 'round_start' ? opening.round : null;
    let introTimer: ReturnType<typeof setTimeout> | undefined;
    if (calm) {
      const last = buildBeats(log, shown.current, ids).at(-1);
      shown.current = log.length;
      seq.current += 1;
      setPos({
        index: log.length,
        anim: last === undefined ? null : { from: last.from, to: last.to, ms: 0, seq: seq.current },
      });
      setStill(last === undefined ? [] : staticFx(last.cues));
      // The intro is plain text for the same time, with no animation.
      if (round !== null) {
        seq.current += 1;
        setIntro({ round, rounds: total, ms: INTRO_LIVE_MS, key: seq.current });
        introTimer = setTimeout(() => {
          setIntro(null);
        }, INTRO_LIVE_MS);
      }
      return () => {
        if (introTimer !== undefined) clearTimeout(introTimer);
        setIntro(null);
      };
    }

    const plan = planLiveRound(buildBeats(log, start, ids), log, ms);
    const { beats } = plan;
    let next = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const step = (): void => {
      const beat = beats[next];
      if (beat === undefined) {
        shown.current = log.length;
        setPos({ index: log.length, anim: null });
        return;
      }
      next += 1;
      seq.current += 1;
      shown.current = beat.to;
      setPos({
        index: beat.to,
        anim: { from: beat.from, to: beat.to, ms: beat.ms, seq: seq.current },
      });
      trail.push(beat.cues);
      timer = setTimeout(step, beat.ms);
    };
    if (plan.introRound !== null) {
      seq.current += 1;
      setIntro({ round: plan.introRound, rounds: total, ms: plan.introMs, key: seq.current });
      timer = setTimeout(() => {
        setIntro(null);
        step();
      }, plan.introMs);
    } else {
      step();
    }
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      setIntro(null);
    };
  }, [length, reducedMotion, hold]);

  return {
    index: pos.index,
    anim: pos.anim,
    fx: reducedMotion ? still : trail.items,
    intro,
  };
}

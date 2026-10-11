import type { FightEvent } from '@creatures/engine';
import { useEffect, useRef, useState } from 'preact/hooks';
import { buildBeats, playStart } from './stage';
import { liveTimeline, staticFx, type FxItem, type IntroView } from './stage-fx';
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
  /** Effects that stay longer than their beat: numbers, bursts, ability cards, knockouts, boss strikes. */
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
 * for 1.5 seconds, then steps through the round's beats with the engine's staggers (500 to 700 ms,
 * the same pacing the server schedules the round by, so the round plays in exactly as long as the
 * server gives it: its beats and then 2 seconds for the last effects to finish). A boss action is
 * telegraphed first: 600 ms of red reticles on its targets, then the hit lands. Effects stay on
 * screen for their own, longer time and overlap the following beats. Rounds that went by unseen are
 * skipped. A stage that is mounted with events already there shows them at once, and so does a player
 * who asks for reduced motion (the newest beat is then only outlined and the intro is plain text).
 * `hold` waits before starting (while "FIGHT!" is on screen). The server's fight is never touched:
 * this only decides what to show when.
 */
export function useLiveStage(
  events: readonly FightEvent[],
  rowIds: readonly string[],
  bossId: string,
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
  const latest = useRef({ events, rowIds, bossId, rounds, reducedMotion, hold });
  latest.current = { events, rowIds, bossId, rounds, reducedMotion, hold };
  const length = events.length;

  useEffect(() => {
    const {
      events: log,
      rowIds: ids,
      bossId: boss,
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
    const beats = buildBeats(log, start, ids, boss);
    const opening = beats[0];
    const introRound = opening !== undefined && opening.introMs > 0 ? opening.round : null;
    const introMs = opening?.introMs ?? 0;
    let introTimer: ReturnType<typeof setTimeout> | undefined;
    if (calm) {
      // Nothing moves: show the last beat that has anything to show, outlined, and the boss actions
      // of the round before it (a zone hit and the attack after it both stay readable).
      const last = beats.findLast((b) => b.cues.length > 0);
      const earlier = beats
        .filter((b) => b !== last && b.to <= (last?.from ?? 0))
        .flatMap((b) =>
          b.cues.filter((c) => c.kind === 'strike' || (c.kind === 'zone' && c.effect === 'hit')),
        );
      shown.current = log.length;
      seq.current += 1;
      setPos({
        index: log.length,
        anim: last === undefined ? null : { from: last.from, to: last.to, ms: 0, seq: seq.current },
      });
      setStill(last === undefined ? [] : staticFx([...earlier, ...last.cues]));
      // The intro is plain text for the same time, with no animation.
      if (introRound !== null) {
        seq.current += 1;
        setIntro({ round: introRound, rounds: total, ms: introMs, key: seq.current });
        introTimer = setTimeout(() => {
          setIntro(null);
        }, introMs);
      }
      return () => {
        if (introTimer !== undefined) clearTimeout(introTimer);
        setIntro(null);
      };
    }

    // The whole round is scheduled up front from the engine's timeline (see `liveTimeline`), so it plays
    // in exactly the time the server gives the round.
    const { steps, endsAt } = liveTimeline(beats);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const step of steps) {
      const beat = beats[step.beat] as (typeof beats)[number];
      timers.push(
        setTimeout(() => {
          switch (step.kind) {
            case 'intro':
              seq.current += 1;
              setIntro({ round: beat.round, rounds: total, ms: beat.introMs, key: seq.current });
              break;
            case 'intro-end':
              setIntro(null);
              break;
            case 'windup':
              // Telegraph first: reticles on exactly the creatures the boss is about to hit.
              trail.push(beat.windup);
              break;
            case 'land':
              seq.current += 1;
              shown.current = beat.to;
              setPos({
                index: beat.to,
                anim: { from: beat.from, to: beat.to, ms: beat.ms, seq: seq.current },
              });
              trail.push(beat.cues);
              break;
          }
        }, step.at),
      );
    }
    timers.push(
      setTimeout(() => {
        shown.current = log.length;
        setPos({ index: log.length, anim: null });
      }, endsAt),
    );
    return () => {
      for (const t of timers) clearTimeout(t);
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

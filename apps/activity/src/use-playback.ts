import type { FightEvent } from '@creatures/engine';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { usePrefersReducedMotion } from './hooks';
import { beatEnds, indexAfterBeat, type Speed } from './replay';
import { buildBeats, cuesForEvents } from './stage';
import type { Anim } from './use-live-stage';
import { staticFx, type FxItem, type IntroView } from './stage-fx';
import { useFxTrail } from './use-fx-trail';

/** Where the player is: the step number, the one before it and a counter that grows with every move. */
export interface Position {
  beat: number;
  prev: number;
  seq: number;
}

interface PlaybackArgs {
  events: readonly FightEvent[];
  /** The row's creature ids, left to right. */
  rowIds: readonly string[];
  bossId: string;
  /** Rounds in the fight, for the "Round N" overlay. */
  rounds: number;
  /** How long "Round N" shows at normal speed (a replay shows it for 1 second). */
  introMs: number;
  speed: Speed;
  /** Start playing at once. */
  autoplay?: boolean;
}

export interface Playback {
  pos: Position;
  /** Steps in the fight. */
  total: number;
  /** Events applied after the current step. */
  index: number;
  finished: boolean;
  playing: boolean;
  setPlaying: (playing: boolean) => void;
  /** Jumps to a step (a skip or a restart: nothing is animated). */
  move: (to: number) => void;
  /** The animation of the step that just played, or null (a jump shows only the new state). */
  anim: Anim | null;
  /** The effects to draw on the stage. */
  fx: readonly FxItem[];
  intro: IntroView | null;
}

/**
 * Plays a fight's events step by step on the same timeline the live stage runs, shared by the raid
 * replay and the dungeon: the engine's pacing (`buildBeats`, which comes from `planRounds`), the
 * "Round N" intro, the 600 ms telegraph before a boss action, and effects that stay for their own
 * time and overlap the next steps. With reduced motion the newest step's effects are shown still.
 */
export function usePlayback(args: PlaybackArgs): Playback {
  const { events, rowIds, bossId, rounds, introMs, speed } = args;
  const ends = beatEnds(events);
  const total = ends.length;
  const [pos, setPos] = useState<Position>({ beat: 0, prev: 0, seq: 0 });
  const [playing, setPlaying] = useState(args.autoplay === true);
  // The same pacing as the live finale (the engine's); 2x halves all of it.
  const beats = useMemo(
    () => buildBeats(events, 0, rowIds, bossId, { introMs, speed }),
    [events, speed],
  );
  const [intro, setIntro] = useState<IntroView | null>(null);
  const reduced = usePrefersReducedMotion();
  const trail = useFxTrail();
  const { beat } = pos;

  const move = (to: number): void => {
    setPos((p) => ({ beat: to, prev: p.beat, seq: p.seq + 1 }));
  };

  // Advance one step at a time while playing. After the previous step lands, the rest of its stagger
  // passes (for the last step of a round that is the 2 second tail), then a step that opens a round
  // shows "Round N" for a moment (1 s, 0.5 s at 2x), and a boss action is telegraphed for 600 ms
  // (300 ms at 2x) before it lands.
  useEffect(() => {
    if (!playing) return undefined;
    if (beat >= total) {
      setPlaying(false);
      return undefined;
    }
    const next = beats[beat];
    if (next === undefined) return undefined;
    const previous = beats[beat - 1];
    const lead = previous === undefined ? 0 : Math.max(0, previous.ms - previous.windupMs);
    const advance = (): void => {
      setPos((p) => ({ beat: p.beat + 1, prev: p.beat, seq: p.seq + 1 }));
    };
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number): void => {
      timers.push(setTimeout(fn, ms));
    };
    const telegraph = (): void => {
      if (next.windupMs > 0) {
        if (!reduced) trail.push(next.windup, speed);
        later(advance, next.windupMs);
      } else {
        advance();
      }
    };
    later(() => {
      if (next.introMs === 0) {
        telegraph();
        return;
      }
      setIntro({ round: next.round, rounds, ms: next.introMs, key: pos.seq + 1 });
      later(() => {
        setIntro(null);
        telegraph();
      }, next.introMs);
    }, lead);
    return () => {
      for (const t of timers) clearTimeout(t);
      setIntro(null);
    };
  }, [playing, beat, speed, total, reduced]);

  const index = indexAfterBeat(ends, beat);
  const finished = beat >= total;
  // Only a single step forward is animated; a skip or a restart just shows the new state.
  const stepBeat = beats[beat - 1];
  const anim: Anim | null =
    beat >= 1 && beat === pos.prev + 1 && stepBeat !== undefined
      ? {
          from: indexAfterBeat(ends, pos.prev),
          to: index,
          ms: stepBeat.ms,
          seq: pos.seq,
        }
      : null;

  // The effects of a step stay for their own time (the same at every speed but 2x, which is about
  // 30% shorter) and overlap the next steps. A skip or a restart drops them.
  useEffect(() => {
    if (anim === null) {
      trail.clear();
      return;
    }
    if (!reduced) {
      trail.push(cuesForEvents(events, anim.from, anim.to, rowIds, bossId), speed);
    }
  }, [pos.seq]);
  const fx = reduced
    ? anim === null
      ? []
      : staticFx(cuesForEvents(events, anim.from, anim.to, rowIds, bossId))
    : trail.items;

  return { pos, total, index, finished, playing, setPlaying, move, anim, fx, intro };
}

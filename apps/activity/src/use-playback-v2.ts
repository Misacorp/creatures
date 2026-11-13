import type { FightEvent } from '@creatures/engine/v2';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { showOf, type BeatShow, type StageModel } from './fight-v2';
import { useKnackNames } from './home/use-knack-names';
import { usePrefersReducedMotion } from './hooks';
import { beatDurations, resumeAt, type SpeedV2 } from './playback-v2';
import type { Cue } from './stage';
import { staticFx, type FxItem, type IntroView } from './stage-fx';
import { useFxTrail } from './use-fx-trail';

/** What the hook shows the stage: the number of steps played, the one that just landed and the effects on screen. */
export interface PlaybackV2 {
  /** Beats applied: 0 is the start of the fight, `total` its end. */
  beat: number;
  total: number;
  finished: boolean;
  playing: boolean;
  setPlaying: (playing: boolean) => void;
  /** Jumps to a step (a skip or a restart): nothing is animated. */
  move: (to: number) => void;
  /** What the newest beat shows (who flashes, the move's name...), or null when the stage jumped. */
  show: BeatShow | null;
  /** The numbers and tags that stay on screen longer than their beat. */
  fx: readonly FxItem[];
  /** The "Round N" overlay while a round opens. */
  intro: IntroView | null;
}

interface PlaybackArgs {
  model: StageModel;
  events: readonly FightEvent[];
  /** The fight's round limit, for "Round 3 / 8". */
  rounds: number | null;
  speed: SpeedV2;
  /** How long "Round N" shows at 1x. */
  introMs: number;
  /** What the beats of one round may take together (at 1x); `Infinity` for none. */
  budgetMs: number;
  /**
   * `replay`: starts at the beginning and plays by itself. `live`: starts at what is there and plays what arrives (a round at a time), skipping
   * rounds that went by unseen.
   */
  mode: 'replay' | 'live';
  /** Show each Knack's name when its creature acts (the player's option; absent: read from the device's Settings). */
  knackNames?: boolean;
  /** Start playing at once (the default), or wait until `setPlaying(true)` (the dungeon's room waits behind its banner). */
  autoplay?: boolean;
}

/** The creatures whose Knack does not act when beat `at` begins: silenced or knocked out in the state before it. */
function quietBefore(model: StageModel, at: number): ReadonlySet<string> {
  const state = model.states[Math.max(0, at)];
  return new Set(
    Object.entries(state?.creatures ?? {}).flatMap(([key, c]) =>
      c.out || c.silenced > 0 ? [key] : [],
    ),
  );
}

/** The numbers and tags of a beat as the effect trail takes them (the shapes of the shipped stage's cues, which it already draws). */
export function cuesOf(show: BeatShow, knackNames = false): Cue[] {
  return [
    ...show.floats.map((f): Cue => ({
      kind: 'float',
      i: f.i,
      target: f.target,
      text: f.text,
      tone: f.tone,
      crit: f.crit,
      drift: f.drift,
      ...(f.element === undefined ? {} : { element: f.element }),
      ...(f.elements === undefined ? {} : { elements: f.elements }),
      ...(f.sub === undefined ? {} : { sub: f.sub }),
      ...(f.mult === undefined ? {} : { mult: f.mult }),
      ...(f.hit === undefined ? {} : { hit: f.hit }),
    })),
    // The Knack's name pops on its creature only when the player asked for it (Settings, "Show Knack names in fights").
    ...(knackNames
      ? show.knacks.map((k): Cue => ({
          kind: 'float',
          i: k.i,
          target: k.who,
          text: k.name,
          tone: 'knack',
          crit: false,
          drift: 0,
        }))
      : []),
    // A Knack that gave up its creature's hit is always named: it is the reason the creature did not attack.
    ...show.forgone.flatMap((k): Cue[] =>
      k.name === null
        ? []
        : [
            {
              kind: 'float',
              i: k.i,
              target: k.who,
              text: k.name,
              tone: 'knack',
              crit: false,
              drift: 0,
            },
          ],
    ),
    ...show.saves.map((s): Cue => ({ kind: 'cover', i: s.i, creature: s.who, guard: s.guard })),
    ...show.knockedOut.map((k): Cue => ({ kind: 'ko', i: k.i, creature: k.who })),
  ];
}

/**
 * Plays a combat v2 fight beat by beat: the same shape as `usePlayback` of the v1 stage (timers, a "Round N" intro, effects that outlast
 * their beat), on the beats of the fold (`fight-v2.ts`). A beat stays as long as `beatDurations` says; a round's beats share the budget.
 * With reduced motion the numbers of the newest beat stand still. The fight is never touched: this only decides what shows when.
 */
export function usePlaybackV2(args: PlaybackArgs): PlaybackV2 {
  const { model, events, rounds, speed, introMs, budgetMs, mode } = args;
  const knackOption = useKnackNames();
  const knackNames = args.knackNames ?? knackOption;
  const total = model.beats.length;
  const live = mode === 'live';
  const [pos, setPos] = useState({ beat: live ? total : 0, prev: live ? total : 0, seq: 0 });
  const [playing, setPlaying] = useState(args.autoplay !== false);
  const [intro, setIntro] = useState<IntroView | null>(null);
  const reduced = usePrefersReducedMotion();
  const trail = useFxTrail();
  const durations = useMemo(
    () => beatDurations(model.beats, { speed, budgetMs }),
    [model.beats, speed, budgetMs],
  );
  const latest = useRef({ model, events, durations, rounds });
  latest.current = { model, events, durations, rounds };
  const { beat } = pos;

  const move = (to: number): void => {
    setPos((p) => ({ beat: to, prev: p.beat, seq: p.seq + 1 }));
  };

  // A live stage that fell behind (the tab was in the background) resumes at the round that is on.
  useEffect(() => {
    if (!live) return;
    const at = resumeAt(latest.current.model.beats, pos.beat, 24);
    if (at !== pos.beat) move(at);
  }, [total]);

  // Land one beat at a time while playing: the previous beat's time first, then (at a round's start) "Round N", then the beat itself.
  useEffect(() => {
    if (!playing) return undefined;
    if (beat >= total) {
      if (!live) setPlaying(false);
      return undefined;
    }
    const { model: m, durations: ms, rounds: limit } = latest.current;
    const next = m.beats[beat];
    if (next === undefined) return undefined;
    const lead = beat === 0 || (live && next.kind === 'round') ? 0 : (ms[beat - 1] ?? 0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, wait: number): void => {
      timers.push(setTimeout(fn, wait));
    };
    const advance = (): void => {
      setPos((p) => ({ beat: p.beat + 1, prev: p.beat, seq: p.seq + 1 }));
    };
    later(() => {
      if (next.kind === 'round' && next.round > 0 && introMs > 0) {
        const wait = speed === 2 ? Math.round(introMs / 2) : introMs;
        setIntro({ round: next.round, rounds: limit, ms: wait, key: pos.seq + 1 });
        later(() => {
          setIntro(null);
          advance();
        }, wait);
      } else {
        advance();
      }
    }, lead);
    return () => {
      for (const t of timers) clearTimeout(t);
      setIntro(null);
    };
  }, [playing, beat, total, speed, live]);

  // A single step forward is animated; a skip or a restart only shows the new state.
  const landed = beat >= 1 && beat === pos.prev + 1 ? model.beats[beat - 1] : undefined;
  const show = useMemo(
    () =>
      landed === undefined
        ? null
        : showOf(events, landed, {
            creatures: model.setup.creatures,
            quiet: quietBefore(model, beat - 1),
          }),
    [landed, events],
  );

  useEffect(() => {
    if (show === null) {
      trail.clear();
      return;
    }
    if (!reduced) trail.push(cuesOf(show, knackNames), speed);
  }, [pos.seq]);
  const fx = reduced ? (show === null ? [] : staticFx(cuesOf(show, knackNames))) : trail.items;

  return {
    beat,
    total,
    finished: beat >= total,
    playing,
    setPlaying,
    move,
    show,
    fx,
    intro,
  };
}

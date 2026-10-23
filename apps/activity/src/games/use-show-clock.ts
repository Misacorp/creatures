/**
 * The show player's clock. Live: everyone is at the same moment, `now - startsAt` on the server's clock
 * (the local clock corrected by `serverNow`, which is the server's time when the props were made). A
 * replay: its own position, played, paused, at 1x or 2x, and moved by a skip. Driven by
 * requestAnimationFrame at about 30 frames a second, and still while the tab is hidden.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Speed } from '../replay';

/** Frames closer together than this are skipped (about 30 a second). */
export const FRAME_MS = 32;
/** A replay never jumps more than this in one frame (a tab coming back, a slow device). */
const MAX_STEP_MS = 250;

export interface ShowClockArgs {
  mode: 'live' | 'replay';
  /** The show's length (ms). */
  total: number;
  startsAt?: number | undefined;
  serverNow?: number | undefined;
  /** Start a replay playing (the default). */
  autoplay?: boolean | undefined;
  /** Where a replay starts (ms into the show; default 0). */
  startMs?: number | undefined;
}

export interface ShowClock {
  /** Ms into the show (negative before a live show starts). */
  ms: number;
  playing: boolean;
  setPlaying: (on: boolean) => void;
  speed: Speed;
  setSpeed: (s: Speed) => void;
  /** Moves a replay to `ms` (a live show cannot be moved). */
  seek: (ms: number) => void;
}

/** Server minus local clock, from a server time read now. */
export function clockOffsetOf(serverNow: number | undefined, localNow: number): number {
  return serverNow === undefined ? 0 : serverNow - localNow;
}

/** Ms into a live show at local time `localNow`. */
export function liveShowMs(startsAt: number, offset: number, localNow: number): number {
  return localNow + offset - startsAt;
}

function hidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

export function useShowClock(args: ShowClockArgs): ShowClock {
  const { mode, total, startsAt, serverNow } = args;
  // The offset is taken once per server time: the moment `serverNow` arrived.
  const offset = useMemo(() => clockOffsetOf(serverNow, Date.now()), [serverNow]);
  const liveNow = (): number =>
    startsAt === undefined ? 0 : liveShowMs(startsAt, offset, Date.now());
  const [ms, setMs] = useState(() =>
    mode === 'live' ? liveNow() : Math.max(0, Math.min(total, args.startMs ?? 0)),
  );
  const [playing, setPlaying] = useState(mode === 'live' || args.autoplay !== false);
  const [speed, setSpeed] = useState<Speed>(1);
  const pos = useRef(ms);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  useEffect(() => {
    if (mode === 'live') {
      const now = liveNow();
      pos.current = now;
      setMs(now);
    }
  }, [mode, startsAt, offset]);

  useEffect(() => {
    if (typeof requestAnimationFrame !== 'function') return undefined;
    if (mode === 'replay' && !playing) return undefined;
    let id = 0;
    let last: number | null = null;
    let shown = Number.NEGATIVE_INFINITY;
    const frame = (time: number): void => {
      id = requestAnimationFrame(frame);
      if (hidden()) {
        last = null;
        return;
      }
      if (mode === 'live') {
        const now = liveNow();
        // After the show nothing moves any more.
        if (now >= total && pos.current >= total) return;
        // Before the show only the countdown moves: a few frames a second are plenty.
        if (now < 0 && time - shown < 250) return;
        if (time - shown < FRAME_MS) return;
        shown = time;
        pos.current = now;
        setMs(now);
        return;
      }
      const dt = last === null ? 0 : Math.min(MAX_STEP_MS, time - last);
      last = time;
      const next = Math.min(total, pos.current + dt * speedRef.current);
      pos.current = next;
      if (next >= total) {
        setMs(next);
        setPlaying(false);
        return;
      }
      if (time - shown < FRAME_MS) return;
      shown = time;
      setMs(next);
    };
    id = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(id);
    };
  }, [mode, playing, total, startsAt, offset]);

  const seek = (to: number): void => {
    if (mode === 'live') return;
    const clamped = Math.max(0, Math.min(total, to));
    pos.current = clamped;
    setMs(clamped);
  };
  const play = (on: boolean): void => {
    if (mode === 'live') return;
    // Play at the end starts again.
    if (on && pos.current >= total) seek(0);
    setPlaying(on);
  };
  return { ms, playing, setPlaying: play, speed, setSpeed, seek };
}

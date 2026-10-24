import type { Pace } from '@creatures/engine';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Speed } from './replay';
import { activeFx, addFx, nextFxEnd, type FxItem } from './stage-fx';
import type { Cue } from './stage';

interface FxTrail {
  /** The effects on screen now. */
  items: readonly FxItem[];
  /** Starts the effects of a beat (those that outlast it stay for their own duration). */
  push: (cues: readonly Cue[], speed?: Speed, pace?: Readonly<Pace>) => void;
  /** Drops every effect at once (the stage jumped somewhere else). */
  clear: () => void;
}

/**
 * The effects that are on screen (floating numbers, reaction bursts, ability cards, knockout tags)
 * with one timer that wakes up when the next one ends. A beat's effects are added when it starts and
 * stay for their own, longer duration, so they overlap the beats that follow. The rules for what
 * stays and for how long are pure and live in `stage-fx.ts`.
 */
export function useFxTrail(): FxTrail {
  const [items, setItems] = useState<readonly FxItem[]>([]);
  const kept = useRef<readonly FxItem[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const api = useRef<Pick<FxTrail, 'push' | 'clear'> | null>(null);

  if (api.current === null) {
    const arm = (): void => {
      if (timer.current !== undefined) clearTimeout(timer.current);
      timer.current = undefined;
      const wait = nextFxEnd(kept.current, Date.now());
      if (wait === null) return;
      timer.current = setTimeout(() => {
        timer.current = undefined;
        kept.current = activeFx(kept.current, Date.now());
        setItems(kept.current);
        arm();
      }, wait + 10);
    };
    api.current = {
      push: (cues, speed = 1, pace) => {
        kept.current = addFx(kept.current, cues, Date.now(), speed, pace);
        setItems(kept.current);
        arm();
      },
      clear: () => {
        kept.current = [];
        setItems(kept.current);
        arm();
      },
    };
  }

  useEffect(
    () => () => {
      if (timer.current !== undefined) clearTimeout(timer.current);
    },
    [],
  );

  const trail = api.current;
  return { items, push: trail.push, clear: trail.clear };
}

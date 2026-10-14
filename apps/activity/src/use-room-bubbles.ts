/**
 * The living room's speech bubbles: one timeout chain. After a random wait of 8 to 20 s one random
 * candidate creature shows a short line for 3 s, then the next wait starts. Paused while the page is
 * hidden. Local flavour only; the randomness is the browser's crypto source, never `Math.random`.
 */
import { createCryptoRng } from '@creatures/game';
import { useEffect, useRef, useState } from 'preact/hooks';
import { BUBBLE_SHOW_MS, bubbleGap, bubbleLine, bubbleSpeaker } from './room-bubbles';

export interface Bubble {
  /** The resident who is talking. */
  userId: string;
  line: string;
}

/**
 * `candidates` is read at the moment a bubble is due and returns the user ids that may speak (the
 * ones in view). Returns the bubble on screen now, or null.
 */
export function useRoomBubbles(candidates: () => readonly string[]): Bubble | null {
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const latest = useRef(candidates);
  latest.current = candidates;

  useEffect(() => {
    const rng = createCryptoRng((array) => {
      crypto.getRandomValues(array as Uint32Array<ArrayBuffer>);
      return array;
    });
    let timer: ReturnType<typeof setTimeout> | undefined;

    const wait = (): void => {
      timer = setTimeout(speak, bubbleGap(rng));
    };
    const speak = (): void => {
      const ids = latest.current();
      const who = bubbleSpeaker(rng, ids.length);
      const userId = who === null ? undefined : ids[who];
      if (userId === undefined) {
        wait();
        return;
      }
      setBubble({ userId, line: bubbleLine(rng) });
      timer = setTimeout(() => {
        setBubble(null);
        wait();
      }, BUBBLE_SHOW_MS);
    };
    const onVisibility = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      if (document.hidden) setBubble(null);
      else wait();
    };

    document.addEventListener('visibilitychange', onVisibility);
    if (!document.hidden) wait();
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, []);

  return bubble;
}

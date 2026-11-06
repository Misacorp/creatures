import type { RefObject } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  edgesWithMore,
  isLearned,
  markLearned,
  playerScrolled,
  type Edges,
} from './pan-hint-logic';

/**
 * The one cue that a map pans sideways, the same on every scrolling map (the Expeditions world map, the
 * valley, the living room): a soft stepped fade and a small gold arrow at each edge that has more to see.
 * It shows only while the box really scrolls (never where the map fits), goes away for good, for that
 * map, once the player has scrolled it (a scroll that follows a touch, drag, wheel or key; the room's own
 * idle pan does not count), and is never focusable and never takes a tap (`pointer-events: none`).
 *
 * Draw it as the next sibling of the scrolling box and pass that box as `target`; `id` names the map for
 * "learned this session". It is placed over the box from the box's own offsets, so both must share a
 * containing block (siblings do). The fade is drawn in `--pan-hint-bg` (the colour at the map's edge).
 * Guard: `pan-hint-guard.test.ts` fails on a scrolling map that lacks it.
 */
export function PanHint({
  target,
  id,
}: {
  /** The box that scrolls sideways. */
  target: RefObject<HTMLElement | null>;
  /** The map's name for the memory, for example `world-map`. */
  id: string;
}) {
  const [edges, setEdges] = useState<Edges>({ left: false, right: false });
  const layer = useRef<HTMLDivElement>(null);

  // The box's ref may be set a moment after this child's effect first runs: wait for it, a few frames.
  const [box, setBox] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (
      isLearned(id) ||
      typeof window === 'undefined' ||
      typeof requestAnimationFrame !== 'function'
    )
      return;
    let frame = 0;
    let tries = 0;
    const find = (): void => {
      const found = target.current;
      if (found !== null) {
        setBox(found);
        return;
      }
      tries += 1;
      if (tries < 30) frame = requestAnimationFrame(find);
    };
    find();
    return () => {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
    };
  }, [target, id]);

  useEffect(() => {
    if (box === null || isLearned(id) || typeof window === 'undefined') return;
    let lastInput: number | null = null;
    let startLeft = box.scrollLeft;
    let done = false;

    const measure = (): void => {
      const mark = layer.current;
      if (mark !== null) {
        mark.style.setProperty('--ph-left', `${String(box.offsetLeft)}px`);
        mark.style.setProperty('--ph-top', `${String(box.offsetTop)}px`);
        mark.style.setProperty('--ph-width', `${String(box.offsetWidth)}px`);
        mark.style.setProperty('--ph-height', `${String(box.offsetHeight)}px`);
      }
      const next = edgesWithMore(box.scrollLeft, box.clientWidth, box.scrollWidth);
      setEdges((was) => (was.left === next.left && was.right === next.right ? was : next));
    };
    const input = (): void => {
      lastInput = Date.now();
    };
    const pressedMove = (e: Event): void => {
      if ((e as PointerEvent).buttons > 0) input();
    };
    const onScroll = (): void => {
      if (done) return;
      if (playerScrolled(Date.now(), lastInput, startLeft, box.scrollLeft)) {
        done = true;
        markLearned(id);
        setEdges({ left: false, right: false });
        return;
      }
      // A scroll the game made (centring on a place, the room's idle pan) moves the baseline.
      if (lastInput === null) startLeft = box.scrollLeft;
      measure();
    };

    const events = ['wheel', 'touchstart', 'touchmove', 'pointerdown', 'keydown'] as const;
    for (const name of events) box.addEventListener(name, input, { passive: true });
    box.addEventListener('pointermove', pressedMove, { passive: true });
    box.addEventListener('scroll', onScroll, { passive: true });
    const watcher = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    watcher?.observe(box);
    window.addEventListener('resize', measure);
    measure();
    // A map may centre itself just after it mounts (not the player's doing): take that as the start.
    const settle = setTimeout(() => {
      startLeft = box.scrollLeft;
      measure();
    }, 400);
    return () => {
      for (const name of events) box.removeEventListener(name, input);
      box.removeEventListener('pointermove', pressedMove);
      box.removeEventListener('scroll', onScroll);
      watcher?.disconnect();
      window.removeEventListener('resize', measure);
      clearTimeout(settle);
    };
  }, [box, id]);

  const shown = !isLearned(id) && (edges.left || edges.right);
  return (
    <div ref={layer} class={`pan-hint${shown ? '' : ' off'}`} aria-hidden="true" data-pan-hint={id}>
      {edges.left && <span class="pan-hint-edge pan-hint-left" />}
      {edges.right && <span class="pan-hint-edge pan-hint-right" />}
    </div>
  );
}

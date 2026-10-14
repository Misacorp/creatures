/**
 * Lets an element break out of the card it sits in to the full width of the window: measures the
 * window's real width (the root element's `clientWidth`, which leaves out a vertical scrollbar, unlike
 * `100vw`) and where the element's own column starts, so it can be shifted left to the window's
 * edge. `probe` is an element in normal flow with the width of the column (it must not itself be shifted).
 */
import type { RefObject } from 'preact';
import { useLayoutEffect, useState } from 'preact/hooks';

export interface Bleed {
  /** The window's usable width in CSS px. */
  width: number;
  /** Shift left by this much to reach the window's left edge (the column's distance from it). */
  left: number;
  /** The space between the window's right edge and the column's right edge. */
  right: number;
}

/** The bleed for a column at `left` with `columnWidth`, in a window `width` wide. */
export function bleedOf(width: number, left: number, columnWidth: number): Bleed {
  return { width, left, right: Math.max(0, width - left - columnWidth) };
}

/** The bleed of `probe`, kept up to date as the window or the column resizes; null until measured. */
export function useBleed(probe: RefObject<HTMLElement>): Bleed | null {
  const [bleed, setBleed] = useState<Bleed | null>(null);
  useLayoutEffect(() => {
    const el = probe.current;
    if (el === null) return undefined;
    const read = (): void => {
      const rect = el.getBoundingClientRect();
      const next = bleedOf(
        document.documentElement.clientWidth,
        Math.round(rect.left),
        Math.round(rect.width),
      );
      setBleed((old) =>
        old !== null &&
        old.width === next.width &&
        old.left === next.left &&
        old.right === next.right
          ? old
          : next,
      );
    };
    read();
    window.addEventListener('resize', read);
    if (typeof ResizeObserver !== 'function') {
      return () => {
        window.removeEventListener('resize', read);
      };
    }
    const observer = new ResizeObserver(read);
    observer.observe(el);
    observer.observe(document.documentElement);
    return () => {
      window.removeEventListener('resize', read);
      observer.disconnect();
    };
  }, []);
  return bleed;
}

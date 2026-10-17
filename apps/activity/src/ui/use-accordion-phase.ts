import { useEffect, useRef, useState } from 'preact/hooks';
import { ACCORDION_MOTION_MS, motionAllowed } from './accordion-state';

/** Where an accordion's body is in its short open or close animation. `idle` is at rest. */
export type AccordionPhase = 'idle' | 'opening' | 'closing';

/**
 * Follows `open` and says which animation the body is in. With reduced motion (or no way to tell) the
 * phase is always `idle`, so a closed body goes at once. The phase is worked out while drawing, so the
 * body never has a frame in which it is gone but the close animation has not started.
 */
export function useAccordionPhase(open: boolean): AccordionPhase {
  const previous = useRef(open);
  const phase = useRef<AccordionPhase>('idle');
  const [, redraw] = useState(0);

  if (previous.current !== open) {
    previous.current = open;
    phase.current = motionAllowed() ? (open ? 'opening' : 'closing') : 'idle';
  }

  useEffect(() => {
    if (phase.current === 'idle') return undefined;
    const timer = setTimeout(() => {
      phase.current = 'idle';
      redraw((n) => n + 1);
    }, ACCORDION_MOTION_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [open]);

  return phase.current;
}

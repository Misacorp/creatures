/**
 * A place seen from inside, full screen: the place's scene drawn on one pixel canvas that fills the whole space,
 * at one world scale for every sprite in it (3 on a phone, 4 on a wide window, or the scene's own). The scene's
 * ground goes on to every edge, so there is no strip of art over an empty panel. The one main action of the
 * place is pinned at the bottom of the scene (`act`), always in view. Escape leaves.
 *
 * Step 1 of the valley uses it for the places that are not open yet; the scenes of the places that are open
 * (phase 4, step 3) are drawn in it too. Today's pages open in place of it, not inside it.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { cssVars } from '../css-vars';
import { paint } from './paint';
import { useSize } from './parts';
import { sceneScale } from './scale';
import type { Placement } from './valley-art';

export interface SceneGeometry {
  /** The world scale (CSS px per scene pixel). */
  s: number;
  /** The scene's size in scene pixels (the whole space, rounded up). */
  W: number;
  H: number;
  /** The middle of the scene, in scene pixels (a whole number). */
  cx: number;
  /** The first scene row below the HUD (scene pixels). */
  top: number;
  /** Scene pixels to CSS px. */
  X: (x: number) => number;
  Y: (y: number) => number;
}

export { sceneScale };

/** The room a scene keeps clear at its top (CSS px): scenes keep their buttons below it. */
export const TOP_CLEAR = 16;

/** The geometry of a scene filling `width` x `height` CSS px. */
export function sceneGeometry(width: number, height: number, scale?: number): SceneGeometry {
  const s = scale ?? sceneScale(width);
  const W = Math.ceil(width / s);
  const H = Math.ceil(height / s);
  return {
    s,
    W,
    H,
    cx: Math.floor(W / 2),
    top: Math.ceil(TOP_CLEAR / s),
    X: (x) => x * s,
    Y: (y) => y * s,
  };
}

export function SceneFrame({
  id,
  label,
  draw,
  onLeave,
  children,
  act,
  scaleFor,
  band = false,
  rows,
}: {
  /** The place's id, for its look (`vy-in-<id>`). */
  id: string;
  /** The place's spoken name ("School, talents"). */
  label: string;
  /** The scene in scene pixels, filling `g.W` x `g.H`. */
  draw: (g: SceneGeometry) => Placement[];
  onLeave: () => void;
  children?: (g: SceneGeometry) => ComponentChildren;
  /** The main action, pinned at the bottom of the scene. */
  act?: ComponentChildren;
  /** The scene's own pixel scale for a window of this size (a place that fills the screen picks it); else `sceneScale`. */
  scaleFor?: (width: number, height: number) => number;
  /**
   * A band above today's page instead of the whole screen: `rows` scene pixels high (the scale makes the CSS height),
   * the action under the scene in the flow, not over it. Escape is left to the page's own way back.
   */
  band?: boolean;
  rows?: number;
}) {
  const rootRef = useRef<HTMLElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useSize(boxRef);
  const g = sceneGeometry(size.width, size.height, scaleFor?.(size.width, size.height));
  const placements = useMemo(() => draw(g), [draw, g.W, g.H, g.s]);
  const pxW = g.W * g.s;
  const pxH = g.H * g.s;

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) paint(ctx, placements, g.s);
  }, [placements, g.s]);

  useEffect(() => {
    if (band) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && document.querySelector('[role="dialog"]') === null) onLeave();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [onLeave, band]);

  const hasAct = act !== undefined && act !== null;
  return (
    <section
      ref={(el) => {
        rootRef.current = el;
        if (band && rows !== undefined) cssVars({ '--band-h': `${String(rows * g.s)}px` })(el);
      }}
      class={`vy-interior vy-in-${id}${band ? ' vy-band' : ''}`}
      aria-label={label}
    >
      <div class="vy-scene-box" ref={boxRef}>
        <div
          class="vy-scene"
          ref={cssVars({ '--w': `${String(pxW)}px`, '--h': `${String(pxH)}px` })}
        >
          <canvas ref={canvasRef} class="vy-canvas" width={pxW} height={pxH} aria-hidden="true" />
          {children?.(g)}
        </div>
      </div>
      {hasAct && <div class="vy-act">{act}</div>}
    </section>
  );
}

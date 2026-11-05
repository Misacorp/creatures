/**
 * The inside of a place, full screen (round 2): the place's scene drawn on one pixel canvas that fills the
 * whole space between the HUD and the creature tray, at one world scale for every sprite in it (3 on a
 * phone, 4 on a wide window). The scene's walls and floor go on to every edge, so there is no strip of art
 * over an empty panel: what you do there happens on the floor, as sprites and buttons in the scene, and the
 * one main action is pinned at the bottom of the scene (`act`), always in view. Escape leaves.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { cssVars } from '../../css-vars';
import { paint } from './paint';
import { useSize } from './parts';
import { sceneScale } from './scale';
import { StoryPlate, type Waiting } from '../welcome/PlaceStories';
import type { PlaceId, Placement } from './valley-art';

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

/** The HUD's height (CSS px): scenes keep their buttons below it. */
export const HUD_HEIGHT = 56;

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
    top: Math.ceil(HUD_HEIGHT / s),
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
  waiting,
  ground = 'var(--night)',
  scaleFor,
}: {
  id: PlaceId;
  /** The place's spoken name ("Forge, Workshop"). */
  label: string;
  /** The scene in scene pixels, filling `g.W` x `g.H`. */
  draw: (g: SceneGeometry) => Placement[];
  onLeave: () => void;
  children: (g: SceneGeometry) => ComponentChildren;
  /** The main action, pinned at the bottom of the scene. */
  act?: ComponentChildren;
  /** The stories waiting here (a welcome-back marker led in): a slim clipping above `act`, its creatures on its edge. */
  waiting?: Waiting | undefined;
  /** The colour behind the canvas (shows only while it loads). */
  ground?: string;
  /** The scene's own pixel scale for a window of this size (a place that fills the screen picks it); else `sceneScale`. */
  scaleFor?: (width: number, height: number) => number;
}) {
  const rootRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useSize(rootRef);
  const g = sceneGeometry(size.width, size.height, scaleFor?.(size.width, size.height));
  const placements = useMemo(() => draw(g), [draw, g.W, g.H, g.s]);
  const pxW = g.W * g.s;
  const pxH = g.H * g.s;

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) paint(ctx, placements, g.s);
  }, [placements, g.s]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && document.querySelector('[role="dialog"]') === null) onLeave();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onLeave]);

  const hasAct = act !== undefined && act !== null;
  const hasStories = waiting !== undefined && waiting.stories.length > 0;
  return (
    <section
      ref={(el) => {
        rootRef.current = el;
        cssVars({ '--ground': ground })(el);
      }}
      class={`pv-interior pv-in-${id}`}
      aria-label={label}
    >
      <div class="pv-scene" ref={cssVars({ '--w': `${String(pxW)}px`, '--h': `${String(pxH)}px` })}>
        <canvas ref={canvasRef} class="pv-canvas" width={pxW} height={pxH} aria-hidden="true" />
        {children(g)}
      </div>
      {(hasAct || hasStories) && (
        <div class="pv-act">
          {waiting !== undefined && <StoryPlate waiting={waiting} place={id} />}
          {hasAct && act}
        </div>
      )}
    </section>
  );
}

import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'preact/hooks';
import { cssVars } from '../../css-vars';
import { TILE } from '../../games/art/tiles';
import { paint } from './paint';
import { SCENES, type SceneId } from './scenes';
import { useSize } from './use-size';
import { fitScale } from './world-layout';

export interface SceneGeometry {
  /** Screen pixels per scene pixel. */
  s: number;
  /** Content x and y (scene pixels) to CSS pixels inside the scene. */
  X: (x: number) => number;
  Y: (y: number) => number;
}

/** Where a scene's content sits: centred across, and down to a whole tile (so the bands line up). */
export function sceneOrigin(
  view: { width: number; height: number },
  content: { width: number; height: number },
  s: number,
  pans: boolean,
): { x: number; y: number } {
  const x = pans ? 0 : Math.floor((view.width / s - content.width) / 2);
  const y = Math.max(0, Math.floor((view.height / s - content.height) / 2 / TILE) * TILE);
  return { x, y };
}

/**
 * A place's inside: its scene on one canvas filling the whole field at one scale (the wall runs on up, the
 * floor down, nothing framed), the place's parts over it as real buttons (`children`, placed in scene
 * pixels through `g`), a "◀ Camp" back button in the top-left corner (as in every place) and a pinned
 * strip at the bottom for the one main button, always on screen. A scene wider than the window (the
 * living room on a phone) pans sideways, starting at `start`.
 */
export function PlaceScene({
  id,
  label,
  onBack,
  children,
  pinned,
  start,
  maxScale = 6,
}: {
  id: SceneId;
  label: string;
  onBack: () => void;
  children: (g: SceneGeometry) => ComponentChildren;
  pinned?: ComponentChildren;
  /** Scene x to centre on when the scene pans. */
  start?: number;
  maxScale?: number;
}) {
  const def = SCENES[id];
  const rootRef = useRef<HTMLElement | null>(null);
  const panRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useSize(rootRef);
  // The pinned strip (the main button) keeps its own room under the content.
  const reserve = pinned === undefined || pinned === null ? 8 : 76;
  const view = { width: size.width, height: Math.max(0, size.height - reserve - 48) };
  const s = fitScale(view, def, 3, maxScale);
  const pans = def.width * s > size.width;
  const origin = sceneOrigin(view, def, s, pans);
  // Under the back button.
  origin.y += Math.ceil(48 / s / TILE) * TILE;
  const sceneW = pans ? def.width : Math.ceil(size.width / s);
  const cols = Math.ceil(sceneW / TILE) + 1;
  const rows = Math.ceil(size.height / s / TILE) + 1;
  const placements = useMemo(
    () => def.draw(cols, rows, origin.x, origin.y),
    [def, cols, rows, origin.x, origin.y],
  );
  const pxW = pans ? def.width * s : size.width;
  const pxH = size.height;
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) paint(ctx, placements, s);
  }, [placements, s, pxW, pxH]);
  useLayoutEffect(() => {
    const el = panRef.current;
    if (el === null || !pans) return;
    el.scrollLeft = Math.max(0, (start ?? def.width / 2) * s - size.width / 2);
  }, [pans, start, s, size.width]);

  const g: SceneGeometry = {
    s,
    X: (x) => (x + origin.x) * s,
    Y: (y) => (y + origin.y) * s,
  };
  return (
    <section
      ref={(el) => {
        rootRef.current = el;
      }}
      class={`pp-place pp-place-${id}`}
      aria-label={label}
    >
      <div ref={panRef} class={pans ? 'pp-pan pans' : 'pp-pan'}>
        <div
          class="pp-stage"
          ref={cssVars({ '--w': `${String(pxW)}px`, '--h': `${String(pxH)}px`, '--s': s })}
        >
          <canvas ref={canvasRef} class="pp-world" width={pxW} height={pxH} aria-hidden="true" />
          {size.width > 0 && children(g)}
        </div>
      </div>
      <button type="button" class="pp-back" aria-label="Back to camp" onClick={onBack}>
        <svg viewBox="0 0 4 7" aria-hidden="true" shape-rendering="crispEdges">
          <path d="M3 0h1v7h-1v-1h-1v-1h-1v-1h-1v-1h1v-1h1v-1h1z" />
        </svg>
        <span>Camp</span>
      </button>
      {pinned !== undefined && pinned !== null && <div class="pp-pinned">{pinned}</div>}
    </section>
  );
}

/** Something placed in the scene at content (x, y), in scene pixels. */
export function At({
  g,
  x,
  y,
  class: extra,
  children,
}: {
  g: SceneGeometry;
  x: number;
  y: number;
  class?: string;
  children: ComponentChildren;
}) {
  return (
    <div
      class={extra === undefined ? 'pp-at' : `pp-at ${extra}`}
      ref={cssVars({ '--x': `${String(g.X(x))}px`, '--y': `${String(g.Y(y))}px` })}
    >
      {children}
    </div>
  );
}

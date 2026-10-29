/**
 * The inside of a place: the place's scene drawn on one pixel canvas at a whole scale (3 on a phone, up to 5
 * on a desktop), its background tiles continued to the window's edges so there is never a frame round it,
 * the place's parts laid over it as real buttons (`children`, placed in scene pixels), the door to leave
 * (bottom-left, and Escape), and under the scene its floor, where what you do there happens (a reveal, the
 * creatures lining up to be picked). A scene wider than a phone pans sideways, like the valley.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'preact/hooks';
import { cssVars } from '../../css-vars';
import { useDragScroll } from '../../ui/use-drag-scroll';
import { paint } from './paint';
import { LeaveDoor, useSize } from './parts';
import { TILE, type Placement } from './valley-art';

export interface SceneGeometry {
  /** Pixel scale. */
  s: number;
  /** Scene x to stage CSS px. */
  X: (x: number) => number;
  /** Scene y to stage CSS px. */
  Y: (y: number) => number;
}

/** The scene's scale: 3 on a phone; on a wide window as big as fits 60% of the height, at most 5. */
export function sceneScale(width: number, height: number, w: number, h: number, phone = 3): number {
  if (width < 700) return phone;
  const fit = Math.min(Math.floor(width / w), Math.floor((height * 0.6) / h));
  return Math.max(3, Math.min(5, fit));
}

/** The drawing's width in whole tiles (at least the content's), and where the content starts (tile-aligned). */
export function sceneSpan(
  viewWidth: number,
  s: number,
  contentWidth: number,
): { cols: number; ox: number } {
  const need = Math.max(contentWidth, Math.ceil(viewWidth / s));
  const cols = Math.ceil(need / TILE) + 1;
  const ox = Math.max(0, Math.floor((cols * TILE - contentWidth) / 2 / TILE) * TILE);
  return { cols, ox };
}

export function SceneFrame({
  id,
  label,
  width,
  height,
  draw,
  onLeave,
  children,
  floor,
  start,
  ground = 'var(--night)',
  phoneScale = 3,
}: {
  /** The scale on a phone (3; the living room, a wide strip, is drawn at 4 and pans). */
  phoneScale?: number;
  id: string;
  /** The place's spoken name ("Forge, Workshop"). */
  label: string;
  /** The scene's content size in scene pixels. */
  width: number;
  height: number;
  /** The scene drawn `cols` tiles wide with its content starting at `ox` (scene pixels). */
  draw: (cols: number, ox: number) => Placement[];
  onLeave: () => void;
  children: (g: SceneGeometry) => ComponentChildren;
  /** What happens under the scene (a reveal, a line-up). */
  floor?: ComponentChildren;
  /** A scene that pans: the scene x to centre on at first. */
  start?: number;
  /** The floor's colour, continuing the scene's ground. */
  ground?: string;
}) {
  const rootRef = useRef<HTMLElement | null>(null);
  const panRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useSize(rootRef);
  const s = sceneScale(size.width, size.height, width, height, phoneScale);
  const pans = width * s > size.width;
  const span = pans ? { cols: Math.ceil(width / TILE), ox: 0 } : sceneSpan(size.width, s, width);
  const placements = useMemo(() => draw(span.cols, span.ox), [draw, span.cols, span.ox]);
  const pxW = span.cols * TILE * s;
  const pxH = height * s;
  useDragScroll(panRef);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) paint(ctx, placements, s);
  }, [placements, s]);

  useLayoutEffect(() => {
    const el = panRef.current;
    if (el === null) return;
    if (pans && start !== undefined) el.scrollLeft = Math.max(0, start * s - size.width / 2);
    else if (!pans) el.scrollLeft = Math.max(0, (pxW - size.width) / 2);
  }, [pans, start, s, size.width, pxW]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && document.querySelector('.drawer, [role="dialog"]') === null)
        onLeave();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onLeave]);

  const g: SceneGeometry = {
    s,
    X: (x) => (x + span.ox) * s,
    Y: (y) => y * s,
  };
  return (
    <section
      ref={(el) => {
        rootRef.current = el;
        cssVars({ '--sh': `${String(pxH)}px`, '--ground': ground })(el);
      }}
      class={`pv-interior pv-in-${id}`}
      aria-label={label}
    >
      <div
        class={`pv-scene-pan${pans ? ' pans' : ''}`}
        ref={(el) => {
          panRef.current = el;
        }}
      >
        <div
          class="pv-scene"
          ref={cssVars({ '--w': `${String(pxW)}px`, '--h': `${String(pxH)}px` })}
        >
          <canvas ref={canvasRef} class="pv-canvas" width={pxW} height={pxH} aria-hidden="true" />
          {children(g)}
        </div>
      </div>
      <LeaveDoor onLeave={onLeave} />
      <div class="pv-floor">{floor}</div>
    </section>
  );
}

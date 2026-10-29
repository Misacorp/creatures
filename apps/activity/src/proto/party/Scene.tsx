import { useEffect, useRef } from 'preact/hooks';
import { drawSprites } from '../../room-canvas';
import { TRAIL_DASH, worldSprite } from '../../sprites/world-map-art';
import { parseSprite } from '../../sprites/sprite-data';
import type { Composition } from './art';
import { trailDashes, type Point } from './layout';

/** A composition of sprites on one canvas, at a whole-number scale (decorative). */
export function PixelScene({
  art,
  scale,
  class: extra,
}: {
  art: Composition;
  scale: number;
  class?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const width = art.width * scale;
  const height = art.height * scale;
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    drawSprites(ctx, art.placed, scale, 0, { width, height });
  }, [art, scale, width, height]);
  return (
    <canvas
      ref={ref}
      class={extra === undefined ? 'pp-scene' : `pp-scene ${extra}`}
      width={width}
      height={height}
      aria-hidden="true"
    />
  );
}

const grass = parseSprite(worldSprite('grass'));
const dash = parseSprite(TRAIL_DASH);

/**
 * The clearing's ground: the world map's grass tile repeated, and the sand trails from each station
 * (`[data-station]` inside the same parent) to the camp fire (`[data-hub]`). Redrawn when the parent
 * changes size. Decorative.
 */
export function Ground({ scale, version }: { scale: number; version: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    if (canvas == null || parent == null) return undefined;
    const draw = (): void => {
      const box = parent.getBoundingClientRect();
      const w = Math.max(1, Math.round(parent.clientWidth));
      const h = Math.max(1, Math.round(parent.scrollHeight));
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const tile = 16 * scale;
      for (let ty = 0; ty < h; ty += tile) {
        for (let tx = 0; tx < w; tx += tile) {
          for (const cell of grass.cells) {
            ctx.fillStyle = cell.colour;
            ctx.fillRect(tx + cell.x * scale, ty + cell.y * scale, scale, scale);
          }
        }
      }
      const centre = (el: Element): Point => {
        const r = el.getBoundingClientRect();
        return {
          x: r.left - box.left + r.width / 2,
          y: r.top - box.top + parent.scrollTop + r.height * 0.62,
        };
      };
      const hubEl = parent.querySelector('[data-hub]');
      const stations = [...parent.querySelectorAll('[data-station]')].map(centre);
      const hub = hubEl === null ? { x: w / 2, y: h / 2 } : centre(hubEl);
      const step = 3 * scale;
      for (const p of trailDashes(stations, hub, step)) {
        for (const cell of dash.cells) {
          ctx.fillStyle = cell.colour;
          // Snap to the pixel grid of the grass.
          const x = Math.floor(p.x / scale) * scale;
          const y = Math.floor(p.y / scale) * scale;
          ctx.fillRect(x + cell.x * scale, y + cell.y * scale, scale, scale);
        }
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(parent);
    return () => {
      observer.disconnect();
    };
  }, [scale, version]);
  return <canvas ref={ref} class="pp-ground" aria-hidden="true" />;
}

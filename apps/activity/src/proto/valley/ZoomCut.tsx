/**
 * The stepped pixel zoom into a place: the valley redrawn round the place's door at scale 3, then 4 (real
 * whole-scale redraws, never a CSS scale, so the pixels stay hard), 90 ms apart, then a two-frame wipe of
 * ink closing on the door, then the cut to the inside. Decoration over everything; under reduced motion it
 * is never shown (the caller cuts at once).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { paint } from './paint';
import { placeOf, valleyDrawing, type PlaceId } from './valley-art';

const STEPS = [3, 4, 5, 6] as const;
const FRAME_MS = 90;
const NO_MARGIN = { left: 4, top: 4, right: 4, bottom: 4 };

export function ZoomCut({ place, onDone }: { place: PlaceId; onDone: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (frame + 1 >= STEPS.length) onDone();
      else setFrame(frame + 1);
    }, FRAME_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, [frame, onDone]);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    const s = STEPS[frame] ?? 3;
    const drawing = valleyDrawing(NO_MARGIN);
    const door = placeOf(place).door;
    const ox = Math.round(canvas.width / 2 - (door.x + drawing.ox) * s);
    const oy = Math.round(canvas.height / 2 - (door.y + drawing.oy) * s);
    paint(ctx, drawing.placements, s, ox, oy);
    // The wipe: ink closing in from the edges, leaving the door's opening, then nothing.
    if (frame >= 2) {
      const keep = frame === 2 ? 0.25 : 0;
      const w = canvas.width * keep;
      const h = canvas.height * keep;
      ctx.fillStyle = '#0d0a1a';
      ctx.fillRect(0, 0, canvas.width, (canvas.height - h) / 2);
      ctx.fillRect(0, (canvas.height + h) / 2, canvas.width, canvas.height);
      ctx.fillRect(0, 0, (canvas.width - w) / 2, canvas.height);
      ctx.fillRect((canvas.width + w) / 2, 0, canvas.width, canvas.height);
    }
  }, [frame, place]);
  return <canvas ref={ref} class="pv-zoom" aria-hidden="true" />;
}

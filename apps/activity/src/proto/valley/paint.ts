/**
 * Draws placements onto a canvas at an integer scale with hard edges, offset by (`ox`, `oy`) canvas
 * pixels (the game's `drawSprites` has no vertical offset; the zoom needs one). Sprites are parsed once.
 */
import { parseSprite, type SpriteDef } from '../../sprites/sprite-data';
import type { Placement } from '../../games/art/pixel';

type Parsed = ReturnType<typeof parseSprite>;
const cache = new WeakMap<SpriteDef, Parsed>();

function parsed(sprite: SpriteDef): Parsed {
  let hit = cache.get(sprite);
  if (hit === undefined) {
    hit = parseSprite(sprite);
    cache.set(sprite, hit);
  }
  return hit;
}

export function paint(
  ctx: CanvasRenderingContext2D,
  placements: readonly Placement[],
  scale: number,
  ox = 0,
  oy = 0,
  clear = true,
): void {
  const f = Math.max(1, Math.floor(scale));
  const { width, height } = ctx.canvas;
  if (clear) ctx.clearRect(0, 0, width, height);
  for (const p of placements) {
    const left = ox + p.x * f;
    const top = oy + p.y * f;
    const sprite = parsed(p.sprite);
    // Skip what is wholly outside the canvas (the zoom draws a small part of a big world).
    if (
      left > width ||
      top > height ||
      left + sprite.width * f < 0 ||
      top + sprite.height * f < 0
    ) {
      continue;
    }
    for (const cell of sprite.cells) {
      ctx.fillStyle = cell.colour;
      ctx.fillRect(left + cell.x * f, top + cell.y * f, f, f);
    }
  }
}

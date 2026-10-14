/**
 * Draws many sprites onto one canvas at an integer scale, with sharp edges (the room's back and
 * front layers are each one canvas, not one per prop). Sprites are parsed once and kept.
 */
import { parseSprite, type SpriteDef } from './sprites/sprite-data';

type Parsed = ReturnType<typeof parseSprite>;

const parsedSprites = new WeakMap<SpriteDef, Parsed>();

function parsed(sprite: SpriteDef): Parsed {
  let result = parsedSprites.get(sprite);
  if (result === undefined) {
    result = parseSprite(sprite);
    parsedSprites.set(sprite, result);
  }
  return result;
}

/**
 * Clears the canvas and draws each sprite with its top-left at (`originX` + x * scale, y * scale).
 * `originX` is in canvas pixels; x and y are in sprite pixels.
 */
export function drawSprites(
  ctx: CanvasRenderingContext2D,
  placements: readonly { sprite: SpriteDef; x: number; y: number }[],
  scale: number,
  originX: number,
  size: { width: number; height: number },
): void {
  const factor = Math.max(1, Math.floor(scale));
  ctx.clearRect(0, 0, size.width, size.height);
  for (const placement of placements) {
    const left = originX + placement.x * factor;
    const top = placement.y * factor;
    for (const cell of parsed(placement.sprite).cells) {
      ctx.fillStyle = cell.colour;
      ctx.fillRect(left + cell.x * factor, top + cell.y * factor, factor, factor);
    }
  }
}

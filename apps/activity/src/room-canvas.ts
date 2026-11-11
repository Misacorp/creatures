/**
 * Draws many sprites onto one canvas at an integer scale, with sharp edges (the room's back and
 * front layers are each one canvas, not one per prop). This is the shared scene painter (`scene-paint.ts`): each sprite is
 * rendered to a bitmap once and stamped, whatever its size.
 */
import { stamp } from './scene-paint';
import type { SpriteDef } from './sprites/sprite-data';

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
  ctx.clearRect(0, 0, size.width, size.height);
  stamp(ctx, placements, scale, originX);
}

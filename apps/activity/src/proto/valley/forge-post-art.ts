/**
 * The Forge post's furniture (prototype): the smith's own anvil between the two job anvils, and two planks on
 * the wall right of the chimney where the finished pieces stand (three to a plank). Drawn over the Forge's
 * scene; the scene's buttons and creatures use the same spots.
 */
import { PixelGrid, gridPlacements } from '../../games/art/pixel';
import { RAMPS } from '../../games/art/tint';
import type { SceneGeometry } from './SceneFrame';
import { forgeDraw, forgeFloor, forgeSpots } from './scene-art';
import { ANVIL, type Placement } from './valley-art';

const INK = '#0d0a1a';

/** Pieces to a plank, and the planks: the shelf holds six. */
export const PIECES_PER_PLANK = 3;
export const PLANKS = 2;

function plank(w: number, x: number, y: number): Placement[] {
  const g = new PixelGrid(w, 4);
  g.rect(0, 0, w, 4, 'k');
  g.rect(1, 1, w - 2, 1, 'a');
  g.rect(1, 2, w - 2, 1, 'b');
  return gridPlacements(g, { a: RAMPS.wood[0], b: RAMPS.wood[1], k: INK }, x, y);
}

/** Where the post stands (scene pixels): the smith, its anvil, the finished shelf, the broker. */
export function postSpots(g: SceneGeometry) {
  const f = forgeFloor(g);
  const x0 = g.cx - 64;
  const base = forgeSpots(g);
  const mid = base.anvils[0]?.x ?? x0 + 20;
  return {
    smith: { x: mid + 21, y: f + 12 },
    anvil: { x: mid + 38, y: f + 14 },
    /** The top-left of each plank (a piece stands 16 px above it). */
    planks: Array.from({ length: PLANKS }, (_, i) => ({
      x: x0 + 78,
      y: f - 38 + i * 20,
      width: PIECES_PER_PLANK * 17 - 1,
    })),
    /** Where the broker stands, below the smith, its bubble above. */
    broker: { x: mid + 28, y: f + 44 },
  };
}

export function forgePostDraw(g: SceneGeometry): Placement[] {
  const at = postSpots(g);
  return [
    ...forgeDraw(g),
    { sprite: ANVIL, x: at.anvil.x, y: at.anvil.y },
    ...at.planks.flatMap((p) => plank(p.width, p.x, p.y)),
  ];
}

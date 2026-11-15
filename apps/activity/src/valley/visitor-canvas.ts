/**
 * The visitor's stall as a canvas (`VisitorCanvas.tsx`; the rule is "A place is a canvas" in `ux-patterns.md`): his stall in its meadow
 * fills the view, and everything is done by clicking something in it. The scene's main thing is the stall (he has no building project,
 * so no builders' corner). Here: the visitor himself (the reroll) and the week's blueprint on the counter (the purchase). Away: the
 * shuttered stall and its sign, which says he is back Thursday. Pure: the scene's size goes in, scale, placements and boxes come out.
 *
 * The ground is the place scene's (`place-scene.ts`: grass to every edge, the valley's sky above it); the new edges of a wide window
 * are dressed with the Bonfire's quiet pieces (`edgeDressing`: trees, bushes, rocks and flowers, no plate and no tap). The week's
 * blueprint lies on the counter only while it is for sale (not once bought, not while he is away).
 */
import { edgeDressing } from './bonfire-canvas';
import { PLATE_ROW_PX } from './place-plates';
import { artSize, grassTo, skyBackdrop, treesAround, type ArtBox } from './place-scene';
import type { SceneGeometry } from './SceneFrame';
import { propArt } from './place-prop-art';
import { glowSprite, visitorName } from './valley-places';
import type { Placement } from './valley-art';

/** The pixel scales the scene may take (whole numbers): at least the phone's, at most the one the stall fills a big window at. */
export const SCALE_MIN = 3;
export const SCALE_MAX = 8;

/** Scene pixels from the clear zone's top to the top of the stall's art (the hills show above it), and the grass kept under it. */
const ART_TOP = 20;
const GRASS_UNDER = 3;
/** Scene pixels each side the art keeps from the window's edge. */
const EDGE = 6;

/** The stall's art size (the open one and the shuttered one are the same size). */
export const STALL = artSize(visitorName(true));

/** A thing in the scene you can click, in art pixels from the stall's top-left. */
export interface StallTarget {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The visitor, standing left of his stall: a click is the reroll. */
export const VISITOR_BOX: StallTarget = { x: 3, y: 7, w: 19, h: 34 };
/**
 * The week's blueprint, lying on the counter: the prop's bottom row is on stall row 29, the row above the counter top (the first orange
 * row, 30; the Art notes say 46 and 47 for a taller sprite than the stall is, 48 rows), x 33 to 48, clear of the stall's edges at 27 and
 * 54. The prop's own box; a click is the purchase.
 */
export const BLUEPRINT_BOX: StallTarget = { x: 33, y: 20, w: 16, h: 10 };
/** The shuttered stall's sign, on the right: a click reads it. */
export const SIGN_BOX: StallTarget = { x: 47, y: 13, w: 12, h: 15 };

/** The scene pixels the plates under the stall take at scale `s`. */
const underArt = (s: number): number => Math.ceil(PLATE_ROW_PX / s) + GRASS_UNDER;

/** The width and the height (at scale `s`) the stall and its plates need, in scene pixels. */
function needed(s: number): { w: number; h: number } {
  return { w: STALL.width + 2 * EDGE, h: ART_TOP + STALL.height + underArt(s) };
}

/**
 * The scene's one pixel scale: the largest whole number from `SCALE_MIN` to `SCALE_MAX` at which the stall and the plates under it fit
 * both ways, so it fills the window's height (or its width, on a narrow one). It depends on the window only, never on whether he is
 * here, so the scene keeps its size while you are in it (and does not jump on Thursday).
 */
export function visitorScale(width: number, height: number): number {
  for (let s = SCALE_MAX; s > SCALE_MIN; s -= 1) {
    const w = Math.ceil(width / s);
    const h = Math.ceil(height / s);
    const need = needed(s);
    // The clear zone at the top (the HUD) is part of the height the stall needs.
    if (w >= need.w && h >= need.h + Math.ceil(16 / s)) return s;
  }
  return SCALE_MIN;
}

/**
 * Where the stall's art stands in a scene of `g`'s size: centred sideways, and a little above the middle (the spare height of a whole
 * scale's remainder goes mostly under it), the plates under it kept in view.
 */
export function visitorBox(g: Pick<SceneGeometry, 'W' | 'H' | 'cx' | 's' | 'top'>): ArtBox {
  const need = needed(g.s);
  const spare = Math.max(0, g.H - g.top - need.h);
  return {
    x: g.cx - Math.floor(STALL.width / 2),
    y: g.top + ART_TOP + Math.floor(spare * 0.4),
    ...STALL,
  };
}

/** The scene: grass and sky to every edge, the edges dressed, the trees round the stall, the stall (open or shuttered) and, while it is for sale, the blueprint on its counter. */
export function visitorSceneDraw(here: boolean, blueprintForSale: boolean) {
  return (g: SceneGeometry): Placement[] => {
    const box = visitorBox(g);
    return [
      ...grassTo(g),
      ...skyBackdrop(g, box.y - g.top),
      ...edgeDressing(g, box, { left: box.x, right: box.x + box.width }),
      ...treesAround(box.x, box.y, box),
      { sprite: glowSprite(visitorName(here)), x: box.x, y: box.y },
      ...(here && blueprintForSale
        ? [
            {
              sprite: propArt('visitorBlueprint'),
              x: box.x + BLUEPRINT_BOX.x,
              y: box.y + BLUEPRINT_BOX.y,
            },
          ]
        : []),
    ];
  };
}

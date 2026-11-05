/**
 * Where creatures may stand in a scene so that their nameplates never overlap and never leave the scene (the rule
 * of `ux-patterns.md`, "Creatures in a scene stand by their feet"): the gap between two creatures is the larger of
 * a sprite and their plates, a spot keeps its whole plate inside the scene, and a scene shows only as many
 * creatures as fit that way at its width (fewer on a phone). A plate is drawn at most `PLATE_MAX_PX` CSS px wide
 * (a longer name is cut with an ellipsis), so the rule needs no text measuring. Pure; scene pixels throughout.
 */
import type { Cast, Stand } from './place-cast';
import { CREATURE_PX } from './place-cast';
import type { Rect } from './valley-art';
import { crowdSlots, type Gap } from './valley-logic';

/** The widest a nameplate is drawn (CSS px, `.vy-feet-plate .nameplate`); a longer name ends in an ellipsis. */
export const PLATE_MAX_PX = 96;
/** CSS px under a creature's feet that its plate takes: the gap to the feet and the plate's height. */
export const PLATE_ROW_PX = 18;

/** The size of a scene (the part that matters here) and its pixel scale. */
export interface PlateScene {
  W: number;
  H: number;
  s: number;
  /** The first scene row creatures may stand on (below the HUD's clear zone). */
  top: number;
}

/** How far apart two creatures stand, sideways and downwards: a sprite, or the plates, whichever is more. */
export function plateGap(s: number): { x: number; y: number } {
  return {
    x: Math.max(CREATURE_PX, Math.ceil(PLATE_MAX_PX / s)),
    y: CREATURE_PX + Math.ceil(PLATE_ROW_PX / s),
  };
}

/** The room a creature's top-left keeps from the scene's side edges so its plate stays inside. */
export function plateInset(s: number): number {
  return Math.max(0, Math.ceil(PLATE_MAX_PX / s / 2) - CREATURE_PX / 2);
}

/** Where a creature's top-left may be in `scene`: its sprite and plate fully inside. */
export function standBounds(scene: PlateScene): Rect {
  const inset = plateInset(scene.s);
  const bottom = scene.H - CREATURE_PX - Math.ceil(PLATE_ROW_PX / scene.s);
  return {
    x: inset,
    y: scene.top,
    width: Math.max(1, scene.W - CREATURE_PX - 2 * inset + 1),
    height: Math.max(1, bottom - scene.top + 1),
  };
}

/** Whether two creatures (top-left spots) stand too close for their sprites and plates. */
export function crowded(
  a: { x: number; y: number },
  b: { x: number; y: number },
  gap: Gap,
): boolean {
  const g = typeof gap === 'number' ? { x: gap, y: gap } : gap;
  return Math.abs(a.x - b.x) < g.x && Math.abs(a.y - b.y) < g.y;
}

/**
 * The spots for creatures that want to stand at `wanted` (scene pixels), in order: each keeps its own spot, or
 * the nearest free spot inside `bounds` that is a whole `gap` from every creature placed before it (and from the
 * `fixed` ones, such as newcomers at a gate). A creature that finds no spot is `null`: it is not drawn.
 */
export function placeStands(
  wanted: readonly { x: number; y: number }[],
  bounds: Rect,
  gap: Gap,
  fixed: readonly { x: number; y: number }[] = [],
): ({ x: number; y: number } | null)[] {
  const taken = [...fixed];
  const out: ({ x: number; y: number } | null)[] = [];
  const x1 = bounds.x + bounds.width - 1;
  const y1 = bounds.y + bounds.height - 1;
  for (const want of wanted) {
    const at = {
      x: Math.min(x1, Math.max(bounds.x, want.x)),
      y: Math.min(y1, Math.max(bounds.y, want.y)),
    };
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    for (let y = bounds.y; y <= y1; y += 1) {
      for (let x = bounds.x; x <= x1; x += 1) {
        const dist = (x - at.x) ** 2 + (y - at.y) ** 2;
        if (dist >= bestDist) continue;
        if (taken.some((t) => crowded(t, { x, y }, gap))) continue;
        best = { x, y };
        bestDist = dist;
      }
    }
    if (best !== null) taken.push(best);
    out.push(best);
  }
  return out;
}

/**
 * The paddock's meadow for roamers: the cast's own meadow (`roam`, in scene pixels), widened evenly to both sides
 * until `count` creatures fit a gap apart, and kept inside `bounds`; and how many creatures fit in it.
 */
export function roamMeadow(
  roam: Rect,
  count: number,
  bounds: Rect,
  gap: { x: number; y: number },
): { area: Rect; fit: number } {
  const bottom = bounds.y + bounds.height;
  const y = Math.min(Math.max(roam.y, bounds.y), bottom - 1);
  const height = Math.max(1, Math.min(roam.height, bottom - y));
  const rows = Math.max(1, Math.ceil(height / gap.y));
  const cols = Math.max(1, Math.ceil(count / rows));
  const wantWidth = Math.max(roam.width, (cols - 1) * gap.x + 1);
  const width = Math.min(wantWidth, bounds.width);
  const centre = roam.x + roam.width / 2;
  const x = Math.round(
    Math.min(bounds.x + bounds.width - width, Math.max(bounds.x, centre - width / 2)),
  );
  const area = { x, y, width, height };
  return { area, fit: crowdSlots(area, gap).length };
}

/** A cast's standing creatures at the spots they really stand in `scene` (an `art` box's corner added), none hidden but the ones that do not fit. */
export function standSpots(
  stands: readonly Stand[],
  art: { x: number; y: number },
  scene: PlateScene,
  fixed: readonly { x: number; y: number }[] = [],
): { stand: Stand; x: number; y: number }[] {
  const spots = placeStands(
    stands.map((st) => ({ x: art.x + st.x, y: art.y + st.y })),
    standBounds(scene),
    plateGap(scene.s),
    fixed,
  );
  return stands.flatMap((stand, i) => {
    const spot = spots[i];
    return spot === null || spot === undefined ? [] : [{ stand, x: spot.x, y: spot.y }];
  });
}

/** How the paddock's roamers fare in `scene`: their meadow and how many are drawn. */
export function roamPlan(
  cast: Pick<Cast, 'roam' | 'roamers' | 'gate'>,
  art: { x: number; y: number },
  scene: PlateScene,
): { area: Rect; shown: number } | null {
  if (cast.roam === null) return null;
  const bounds = standBounds(scene);
  // The meadow stops a sprite short of the gate, where the newcomers wait.
  const gate = cast.gate[0];
  const right = gate === undefined ? Infinity : art.x + gate.x - CREATURE_PX;
  const limited = { ...bounds, width: Math.max(1, Math.min(bounds.width, right - bounds.x + 1)) };
  const { area, fit } = roamMeadow(
    { ...cast.roam, x: art.x + cast.roam.x, y: art.y + cast.roam.y },
    cast.roamers.length,
    limited,
    plateGap(scene.s),
  );
  return { area, shown: Math.min(cast.roamers.length, fit) };
}

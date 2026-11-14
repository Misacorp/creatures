/**
 * One picture of the welcome-back Gazette: the valley redrawn round a place's door (a real redraw of the valley's
 * pixels at a whole scale, never a CSS scale), the creatures standing on it by their feet (`stories.ts`
 * keeps them a sprite's width apart; lower feet are drawn in front). The player is never in it. A creature in it
 * is a `SmallCreature`: a tap (or Enter) opens its popover, for the curious.
 */
import { useLayoutEffect, useMemo, useRef } from 'preact/hooks';
import { getSpecies } from '../../game';
import { SmallCreature } from '../../SmallCreature';
import type { CreatureInfo } from '../../creature-info';
import { At, CreatureSprite, useSize } from '../parts';
import { paint } from '../paint';
import { TILE, placeOf, valleyDrawing, type PlaceId, type Placement } from '../valley-art';
import type { CastMember, Scene } from './stories';

const NO_MARGIN = { left: 4, top: 4, right: 4, bottom: 4 };
/** Where the door sits in the picture: down the middle, this far down, so the building shows above it. */
const DOOR_AT = 0.6;
/** The doors of the places a story can be at (valley pixels), as the prototype placed them. */
const DOORS: Partial<Record<PlaceId, { x: number; y: number }>> = {
  fair: { x: 92, y: 248 },
  house: { x: 240, y: 122 },
  forge: { x: 336, y: 196 },
  arena: { x: 456, y: 112 },
  signpost: { x: 492, y: 272 },
  // The Market's stall (322, 68, 60 by 48): a door inside it, so the window keeps the whole stall (the paper's Market story, Q64).
  market: { x: 352, y: 108 },
  // The School (122, 66, 60 by 50): its door is under the bell, so the window keeps the house (the paper's graduation, lesson and teacher stories, step 9b).
  school: { x: 152, y: 108 },
};

/** A place's door: its entry above, else the middle of the foot of its art. */
function doorOf(place: PlaceId): { x: number; y: number } {
  const known = DOORS[place];
  if (known !== undefined) return known;
  const rect = placeOf(place).rect;
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
}

/** A window onto the valley, in valley pixels. */
export interface View {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * The picture's placements without the objects the window would cut: ground tiles (a whole tile of the grid) may
 * run past the edge, but a building, tree or sign that crosses it is left out, so no neighbour shows half drawn
 * (a spear of the Market at the Arena's edge). What stands over the door (the picture's own place) always stays.
 */
export function wholeObjects(
  placements: readonly Placement[],
  view: View,
  door: { x: number; y: number },
): Placement[] {
  return placements.filter((p) => {
    const width = p.sprite.rows[0]?.length ?? 0;
    const height = p.sprite.rows.length;
    const ground = width === TILE && height === TILE && p.x % TILE === 0 && p.y % TILE === 0;
    if (ground) return true;
    const inside =
      p.x >= view.x0 && p.y >= view.y0 && p.x + width <= view.x1 && p.y + height <= view.y1;
    const outside =
      p.x >= view.x1 || p.y >= view.y1 || p.x + width <= view.x0 || p.y + height <= view.y0;
    const hasDoor = door.x >= p.x && door.x < p.x + width && door.y >= p.y && door.y < p.y + height;
    return inside || outside || hasDoor;
  });
}

/** A creature sprite is this many pixels high. */
const CREATURE_PX = 16;

/** The popover facts of a creature of the cast. */
function infoOf(member: CastMember): CreatureInfo | null {
  const def = getSpecies(member.species);
  if (def === undefined) return null;
  return {
    name: member.name,
    species: member.species,
    level: member.level,
    element: def.element,
    role: def.role,
    ...(member.shiny ? { shiny: true } : {}),
  };
}

/** The creatures of a scene standing round a spot (`cx`, `cy`: CSS px, the place's door) at a whole scale `s`. */
export function SceneActors({
  scene,
  cx,
  cy,
  s,
}: {
  scene: Scene;
  cx: number;
  cy: number;
  s: number;
}) {
  return (
    <>
      {scene.actors.map((a, slot) => {
        const member = a.member;
        const info = infoOf(member);
        const sprite = (
          <CreatureSprite
            creature={{ species: member.species, shiny: member.shiny }}
            scale={s}
            flip={a.flip === true}
          />
        );
        return (
          <At
            key={`a${String(slot)}`}
            x={cx + a.dx * s - (CREATURE_PX / 2) * s}
            y={cy + (a.dy - CREATURE_PX) * s}
            z={a.dy}
            class="gz-actor"
            hidden={info === null}
          >
            {info === null ? (
              sprite
            ) : (
              <SmallCreature
                id={`gazette:${member.species}:${String(slot)}`}
                info={info}
                class="gz-face"
              >
                {sprite}
              </SmallCreature>
            )}
          </At>
        );
      })}
    </>
  );
}

export function SceneCrop({ scene, class: extra }: { scene: Scene; class?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useSize(wrapRef);
  // Phone-sized pictures are drawn at 2, a wide one at 3.
  const s = size.width >= 420 ? 3 : 2;
  const drawing = useMemo(() => valleyDrawing(NO_MARGIN), []);
  const door = doorOf(scene.place);
  const cx = Math.round(size.width / 2);
  const cy = Math.round(size.height * DOOR_AT);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    canvas.width = size.width;
    canvas.height = size.height;
    const ox = cx - (door.x + drawing.ox) * s;
    const oy = cy - (door.y + drawing.oy) * s;
    // The window in valley pixels (the drawing's own coordinates), so the objects it would cut can be left out.
    const view = {
      x0: -ox / s,
      y0: -oy / s,
      x1: (size.width - ox) / s,
      y1: (size.height - oy) / s,
    };
    const at = { x: door.x + drawing.ox, y: door.y + drawing.oy };
    paint(ctx, wholeObjects(drawing.placements, view, at), s, ox, oy);
  }, [drawing, door.x, door.y, s, size.width, size.height, cx, cy]);

  return (
    <div ref={wrapRef} class={`gz-scene${extra === undefined ? '' : ` ${extra}`}`}>
      <canvas ref={canvasRef} class="gz-scene-canvas" aria-hidden="true" />
      <SceneActors scene={scene} cx={cx} cy={cy} s={s} />
    </div>
  );
}

/**
 * One picture of the welcome-back Gazette: the valley redrawn round a place's door (a real redraw of the valley's
 * pixels at a whole scale, never a CSS scale), the creatures standing on it by their feet (`stories.ts`
 * keeps them a sprite's width apart; lower feet are drawn in front). The player is never in it. A creature in it
 * is a `SmallCreature`: a tap (or Enter) opens its popover, for the curious.
 */
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { getSpecies } from '../../game';
import { SmallCreature } from '../../SmallCreature';
import type { CreatureInfo } from '../../creature-info';
import { At, CreatureSprite, useSize } from '../parts';
import { paint } from '../paint';
import { placeOf, valleyDrawing, type PlaceId } from '../valley-art';
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
};

/** A place's door: its entry above, else the middle of the foot of its art. */
function doorOf(place: PlaceId): { x: number; y: number } {
  const known = DOORS[place];
  if (known !== undefined) return known;
  const rect = placeOf(place).rect;
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
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
  cast,
  cx,
  cy,
  s,
}: {
  scene: Scene;
  cast: readonly CastMember[];
  cx: number;
  cy: number;
  s: number;
}) {
  return (
    <>
      {scene.actors.map((a) => {
        const member = cast[a.slot];
        if (member === undefined) return null;
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
            key={`a${String(a.slot)}`}
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
                id={`gazette:${member.species}:${String(a.slot)}`}
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

export function SceneCrop({
  scene,
  cast,
  class: extra,
}: {
  scene: Scene;
  cast: readonly CastMember[];
  class?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useSize(wrapRef);
  // Phone-sized pictures are drawn at 2, a wide one at 3.
  const s = size.width >= 420 ? 3 : 2;
  const drawing = useMemo(() => valleyDrawing(NO_MARGIN), []);
  const door = doorOf(scene.place);
  const cx = Math.round(size.width / 2);
  const cy = Math.round(size.height * DOOR_AT);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    canvas.width = size.width;
    canvas.height = size.height;
    const ox = cx - (door.x + drawing.ox) * s;
    const oy = cy - (door.y + drawing.oy) * s;
    paint(ctx, drawing.placements, s, ox, oy);
  }, [drawing, door.x, door.y, s, size.width, size.height, cx, cy]);

  return (
    <div ref={wrapRef} class={`gz-scene${extra === undefined ? '' : ` ${extra}`}`}>
      <canvas ref={canvasRef} class="gz-scene-canvas" aria-hidden="true" />
      <SceneActors scene={scene} cast={cast} cx={cx} cy={cy} s={s} />
    </div>
  );
}

/**
 * One picture of the welcome-back popup: the valley redrawn round a place's door (the zoom's way: a real
 * redraw of the valley's pixels at a whole scale, never a CSS scale), the creatures and props of a story
 * standing on it. The Gazette's pictures; the player is never in it. A creature in it is a `SmallCreature`: a
 * tap (or Enter) opens its popover, for the curious.
 */
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { getSpecies, speciesName } from '../../game';
import { SmallCreature } from '../../SmallCreature';
import type { CreatureInfo } from '../../creature-info';
import { PACK_ART } from '../../sprites/pack-art';
import { At, CreatureSprite, Glyph, Pic, useSize } from '../valley/parts';
import { paint } from '../valley/paint';
import { placeOf, valleyDrawing } from '../valley/valley-art';
import type { Actor, Cast, Prop, Scene, Who } from './highlights';

const NO_MARGIN = { left: 4, top: 4, right: 4, bottom: 4 };
/** Where the door sits in the picture: down the middle, this far down, so the building shows above it. */
const DOOR_AT = 0.72;
/** A creature sprite is this many pixels high. */
const CREATURE_PX = 16;

/** The species, look and popover facts of who acts: a cast member as it is in the valley, a newcomer at level 1. */
function whoIs(who: Who, cast: Cast): { shiny: boolean; info: CreatureInfo | null; id: string } {
  const member =
    who.kind === 'species'
      ? undefined
      : cast.creatures[who.slot % Math.max(1, cast.creatures.length)];
  const species = who.kind === 'species' ? who.species : (member?.species ?? 'splashet');
  const def = getSpecies(species);
  return {
    shiny: member?.shiny ?? false,
    id: who.kind === 'species' ? `new:${species}` : `cast:${species}:${member?.name ?? ''}`,
    info:
      def === undefined
        ? null
        : {
            name: member?.name ?? speciesName(species),
            species,
            level: member?.level ?? 1,
            element: def.element,
            role: def.role,
            ...(member?.shiny === true ? { shiny: true } : {}),
          },
  };
}

/** A prop of a scene, drawn at its scale. */
function PropArt({ prop, scale }: { prop: Prop; scale: number }) {
  switch (prop.kind) {
    case 'glyph':
      return <Glyph id={prop.id} scale={scale} />;
    case 'sack':
      return <Pic sprite={PACK_ART} scale={scale} />;
  }
}

export function SceneCrop({
  scene,
  cast,
  class: extra,
}: {
  scene: Scene;
  cast: Cast;
  class?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useSize(wrapRef);
  // Phone-sized pictures are drawn at 2, a wide one at 3.
  const s = size.width >= 420 ? 3 : 2;
  const drawing = useMemo(() => valleyDrawing(NO_MARGIN), []);
  const door = placeOf(scene.place).door;
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

  const actors: Actor[] = scene.actors;
  return (
    <div ref={wrapRef} class={`wb-scene${extra === undefined ? '' : ` ${extra}`}`}>
      <canvas ref={canvasRef} class="wb-scene-canvas" aria-hidden="true" />
      {scene.props.map((p, i) => (
        <At
          key={`p${String(i)}`}
          x={cx + p.dx * s - 6 * (p.big === true ? s + 1 : s)}
          y={cy + p.dy * s - 6 * (p.big === true ? s + 1 : s)}
          class="wb-prop"
        >
          <PropArt prop={p.prop} scale={p.big === true ? s + 1 : s} />
        </At>
      ))}
      {actors.map((a, i) => {
        const who = whoIs(a.who, cast);
        const sprite = (
          <CreatureSprite
            creature={{ species: who.info?.species ?? 'splashet', shiny: who.shiny }}
            scale={s}
            flip={a.flip === true}
          />
        );
        return (
          <At
            key={`a${String(i)}`}
            x={cx + a.dx * s - (CREATURE_PX / 2) * s}
            y={cy + (a.dy - CREATURE_PX) * s}
            class="wb-actor"
            hidden={who.info === null}
          >
            {who.info === null ? (
              sprite
            ) : (
              <SmallCreature id={`${who.id}:${String(i)}`} info={who.info} class="wb-face">
                {sprite}
              </SmallCreature>
            )}
          </At>
        );
      })}
    </div>
  );
}

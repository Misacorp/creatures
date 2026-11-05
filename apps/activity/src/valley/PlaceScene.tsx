/**
 * A place's scene above today's page (phase 4, step 3; the five places whose work stays in phase 5): the place's
 * art in its day light under the valley's sky, with the creatures that are really there standing in front of it
 * (who and where come from `place-cast.ts`), one pixel scale for everything, and the scene's one main action
 * under it (`PinnedAct`), which takes you to the part of the page that does it. Tapping a creature opens its
 * popover, as everywhere (`SmallCreature`). The paddock's creatures wander (not with reduced motion).
 */
import { useMemo } from 'preact/hooks';
import { bossArt } from '../art';
import type { Creature } from '../api';
import type { CreatureInfo } from '../creature-info';
import { creatureName, getSpecies, speciesName } from '../game';
import { cssVars } from '../css-vars';
import { usePrefersReducedMotion } from '../hooks';
import { SmallCreature } from '../SmallCreature';
import { Nameplate } from '../ui/Nameplate';
import { PinnedAct } from './PinnedAct';
import { SceneFrame, type SceneGeometry } from './SceneFrame';
import { At, CreatureSprite, SpeechBubble, isStill, useTick } from './parts';
import type { Cast, CastPlace } from './place-cast';
import { BAND_ROWS, bandArtBox, bandScale, bandSceneDraw } from './place-scene';
import { useRoamers } from './use-roamers';
import { depthOf } from './valley-logic';
import { placeOf } from './valley-art';
import type { MapName } from './valley-places';

/** The sprite each scene stands its place's art from. */
export const SCENE_ART: Readonly<Record<CastPlace, MapName>> = {
  house: 'house',
  cave: 'cave',
  arena: 'arena',
  fair: 'fairground',
  paddock: 'paddock',
};

/** Roamers step 8 times a second. */
const TICK_MS = 125;

/** The popover's facts of one of the player's own creatures (its name as text, its species' element and role). */
function infoOf(c: Creature): CreatureInfo {
  const species = getSpecies(c.species);
  return {
    name: creatureName(c),
    species: c.species,
    level: c.level,
    element: species?.element ?? 'unknown',
    role: species?.role ?? '',
    shiny: c.shiny,
    creatureId: c.id,
  };
}

/** One creature standing at (`x`, `y`) scene pixels: a button that opens its popover. */
function Stander({
  creature,
  x,
  y,
  flip,
  label,
  g,
}: {
  creature: Creature;
  x: number;
  y: number;
  flip: boolean;
  label: string;
  g: SceneGeometry;
}) {
  const info = infoOf(creature);
  return (
    <At x={g.X(x)} y={g.Y(y)} class="vy-stand" z={depthOf(x, y)}>
      <SmallCreature
        info={info}
        id={`scene-${creature.id}`}
        class="vy-stand-btn"
        label={`${info.name}, level ${String(info.level)}, ${label}`}
      >
        <CreatureSprite creature={creature} scale={g.s} flip={flip} />
      </SmallCreature>
      {/* Always shown under the feet: the level first, in yellow, then the name (text only). */}
      <span class="vy-feet-plate" aria-hidden="true">
        <Nameplate size="sm" level={info.level}>
          {info.name}
        </Nameplate>
      </span>
    </At>
  );
}

/** The paddock's creatures wandering inside the rails. */
function Roamers({
  creatures,
  area,
  g,
}: {
  creatures: readonly Creature[];
  area: { x: number; y: number; width: number; height: number };
  g: SceneGeometry;
}) {
  const reduced = usePrefersReducedMotion();
  const moving = !reduced && !isStill();
  const tick = useTick(TICK_MS, moving);
  const people = useRoamers(creatures, tick, moving, area);
  return (
    <>
      {people.map((p) => (
        <Stander
          key={p.key}
          creature={p.creature}
          x={p.x}
          y={p.y}
          flip={p.flip}
          label="at home in the paddock"
          g={g}
        />
      ))}
    </>
  );
}

export function PlaceScene({ cast, onAct }: { cast: Cast; onAct: () => void }) {
  const art = SCENE_ART[cast.place];
  const bossId = cast.boss?.id ?? null;
  const draw = useMemo(
    () =>
      bandSceneDraw(art, (box) =>
        bossId === null
          ? []
          : [
              {
                sprite: bossArt(bossId).sprite,
                x: box.x + box.width - 6,
                y: box.y + box.height - 30,
              },
            ],
      ),
    [art, bossId],
  );
  const name = placeOf(cast.place).name;
  return (
    <SceneFrame
      id={cast.place}
      label={`${name}, today`}
      draw={draw}
      onLeave={() => undefined}
      scaleFor={bandScale}
      band
      rows={BAND_ROWS}
      act={
        cast.act.kind === 'calm' ? (
          <PinnedAct calm={cast.act.line} />
        ) : (
          <PinnedAct label={cast.act.label} detail={cast.act.detail} onClick={onAct} />
        )
      }
    >
      {(g) => {
        const box = bandArtBox(g, art);
        return (
          <>
            {cast.stands.map((s) => (
              <Stander
                key={s.creature.id}
                creature={s.creature}
                x={box.x + s.x}
                y={box.y + s.y}
                flip={s.flip}
                label={s.where}
                g={g}
              />
            ))}
            {cast.roam !== null && (
              <Roamers
                key={`${String(g.W)}-${String(g.s)}`}
                creatures={cast.roamers}
                area={{
                  x: box.x + cast.roam.x,
                  y: box.y + cast.roam.y,
                  width: cast.roam.width,
                  height: cast.roam.height,
                }}
                g={g}
              />
            )}
            {cast.gate.map((n) => (
              <At
                key={n.id}
                x={g.X(box.x + n.x)}
                y={g.Y(box.y + n.y)}
                class="vy-stand"
                z={depthOf(box.x + n.x, box.y + n.y)}
              >
                <button
                  type="button"
                  class="vy-stand-btn"
                  aria-label={`${speciesName(n.species)} waits at the gate. Choose what to do`}
                  onClick={onAct}
                >
                  <CreatureSprite creature={n} scale={g.s} />
                </button>
              </At>
            ))}
            {cast.gate[0] !== undefined && (
              <At x={g.X(box.x + cast.gate[0].x)} y={g.Y(box.y + cast.gate[0].y)} class="vy-over">
                <span
                  class="vy-region-box"
                  ref={cssVars({ '--pw': `${String(16 * g.s)}px`, '--ph': '0px' })}
                />
                <SpeechBubble
                  glyph="paw"
                  count={cast.gate.length < cast.waiting ? cast.waiting : null}
                />
              </At>
            )}
            {cast.boss !== null && (
              <At
                x={g.X(box.x + box.width - 6)}
                y={g.Y(box.y + box.height - 30)}
                class="vy-region"
                hidden={false}
              >
                <span
                  class="vy-region-box"
                  role="img"
                  aria-label={`This week: ${cast.boss.name}`}
                  ref={cssVars({
                    '--pw': `${String(24 * g.s)}px`,
                    '--ph': `${String(24 * g.s)}px`,
                  })}
                />
              </At>
            )}
          </>
        );
      }}
    </SceneFrame>
  );
}

/**
 * A place's scene above today's page (phase 4, step 3; the five places whose work stays in phase 5): the place's
 * art in its day light under the valley's sky, with the creatures that are really there standing in front of it
 * (who and where come from `place-cast.ts`), one pixel scale for everything, and the scene's one main action
 * under it (`PinnedAct`), which takes you to the part of the page that does it. Tapping a creature opens its
 * popover, as everywhere (`SmallCreature`). The paddock's creatures wander (not with reduced motion).
 */
import type { ComponentChildren } from 'preact';
import { useMemo, useRef, useState } from 'preact/hooks';
import { bossArt } from '../art';
import type { Creature } from '../api';
import type { CreatureInfo } from '../creature-info';
import { creatureName, getSpecies, speciesName } from '../game';
import { cssVars } from '../css-vars';
import { usePrefersReducedMotion } from '../hooks';
import { SmallCreature } from '../SmallCreature';
import { Nameplate } from '../ui/Nameplate';
import { dropPoint, pastThreshold, type Grab } from './creature-drag';
import { PinnedAct } from './PinnedAct';
import { SceneFrame, sceneGeometry, type SceneGeometry } from './SceneFrame';
import { At, CreatureSprite, Pic, SpeechBubble, isStill, useTick } from './parts';
import { CREATURE_PX, type Cast, type CastPlace } from './place-cast';
import { BAND_ROWS, bandArtBox, bandScale, bandSceneDraw } from './place-scene';
import { plateGap, roamPlan, standSpots } from './place-plates';
import { frontProps, propDepth } from './place-props';
import { useRoamers } from './use-roamers';
import { depthOf } from './valley-logic';
import { placeOf, type Rect } from './valley-art';
import type { MapName } from './valley-places';

/** The sprite each scene stands its place's art from. */
export const SCENE_ART: Readonly<Record<CastPlace, MapName>> = {
  house: 'house',
  cave: 'cave',
  arena: 'arena',
  fair: 'fairground',
  paddock: 'paddock',
  signpost: 'road',
};

/** The nameplates' layer: above every creature (`depthOf` stays below it). */
const PLATES_Z = 500000;

/** A creature held by a hand: above every creature, below the nameplates. */
const LIFTED_Z = PLATES_Z - 1;

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

/** What lets a hand move a creature: the meadow it stays in, and where it is held and put down. */
interface Hand {
  area: Rect;
  /** Held right now: drawn above every creature. */
  lifted: boolean;
  onHold: (x: number, y: number) => void;
  onDrop: () => void;
}

/**
 * Wraps a creature so a mouse or a finger can pick it up and put it down anywhere in the meadow. A press that
 * moves less than a few pixels stays a tap (the popover opens as before); a drag swallows the click that ends it.
 * No long press. Pointer capture keeps the drag with the creature when the pointer leaves it.
 */
function Draggable({
  hand,
  x,
  y,
  g,
  children,
}: {
  hand: Hand;
  x: number;
  y: number;
  g: SceneGeometry;
  children: ComponentChildren;
}) {
  const grab = useRef<Grab | null>(null);
  const dragging = useRef(false);
  const swallow = useRef(false);
  const boxOf = (el: HTMLElement): { left: number; top: number } =>
    (el.closest('.vy-scene') ?? el).getBoundingClientRect();
  const end = (e: PointerEvent): void => {
    if (grab.current === null || e.pointerId !== grab.current.id) return;
    grab.current = null;
    if (!dragging.current) return;
    dragging.current = false;
    swallow.current = true;
    setTimeout(() => {
      swallow.current = false;
    }, 0);
    hand.onDrop();
  };
  return (
    <span
      class={`vy-drag${hand.lifted ? ' lifted' : ''}`}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const box = boxOf(e.currentTarget);
        grab.current = {
          id: e.pointerId,
          px: e.clientX,
          py: e.clientY,
          dx: x - (e.clientX - box.left) / g.s,
          dy: y - (e.clientY - box.top) / g.s,
        };
        dragging.current = false;
      }}
      onPointerMove={(e) => {
        const start = grab.current;
        if (start === null || e.pointerId !== start.id) return;
        if (!dragging.current) {
          if (!pastThreshold(start, e.clientX, e.clientY)) return;
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        const to = dropPoint(start, e.clientX, e.clientY, boxOf(e.currentTarget), g.s, hand.area);
        hand.onHold(to.x, to.y);
        e.preventDefault();
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onClickCapture={(e) => {
        if (!swallow.current) return;
        swallow.current = false;
        e.stopPropagation();
        e.preventDefault();
      }}
    >
      {children}
    </span>
  );
}

/** One creature standing at (`x`, `y`) scene pixels: a button that opens its popover. */
export function Stander({
  creature,
  x,
  y,
  flip,
  label,
  g,
  hand,
  gain,
}: {
  creature: Creature;
  x: number;
  y: number;
  flip: boolean;
  label: string;
  g: SceneGeometry;
  /** Given: a hand can move it (the paddock's roamers). */
  hand?: Hand;
  /** The experience it gained this visit, "+N" on its nameplate (the Bonfire's resting creatures). */
  gain?: number;
}) {
  const info = infoOf(creature);
  const button = (
    <SmallCreature
      info={info}
      id={`scene-${creature.id}`}
      class="vy-stand-btn"
      label={`${info.name}, level ${String(info.level)}, ${label}`}
    >
      <CreatureSprite creature={creature} scale={g.s} flip={flip} />
    </SmallCreature>
  );
  return (
    <>
      <At
        x={g.X(x)}
        y={g.Y(y)}
        class="vy-stand"
        z={hand?.lifted === true ? LIFTED_Z : depthOf(x, y)}
      >
        {hand === undefined ? (
          button
        ) : (
          <Draggable hand={hand} x={x} y={y} g={g}>
            {button}
          </Draggable>
        )}
      </At>
      {/* The nameplate, always shown under the feet (level first, in yellow, then the name): on a layer above every creature so a neighbour never hides it, in the creatures' own depth order. */}
      <At
        x={g.X(x + CREATURE_PX / 2)}
        y={g.Y(y + CREATURE_PX) + 2}
        class="vy-feet-plate"
        z={PLATES_Z + depthOf(x, y)}
      >
        <Nameplate size="sm" level={info.level} gain={gain}>
          {info.name}
        </Nameplate>
      </At>
    </>
  );
}

/** The paddock's creatures wandering inside the rails. */
function Roamers({
  creatures,
  area,
  dragArea,
  g,
}: {
  creatures: readonly Creature[];
  area: { x: number; y: number; width: number; height: number };
  /** Where a hand may put a creature down: the whole scene, not only the meadow it wanders. */
  dragArea: Rect;
  g: SceneGeometry;
}) {
  const reduced = usePrefersReducedMotion();
  const moving = !reduced && !isStill();
  const tick = useTick(TICK_MS, moving);
  const [held, setHeld] = useState<{ id: string; x: number; y: number } | null>(null);
  const people = useRoamers(creatures, tick, moving, area, plateGap(g.s), held);
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
          hand={{
            area: dragArea,
            lifted: held?.id === p.key,
            onHold: (x, y) => {
              setHeld({ id: p.key, x, y });
            },
            onDrop: () => {
              setHeld(null);
            },
          }}
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
          // A calm line that would only repeat the picture is empty: then there is nothing under the scene.
          cast.act.line === '' ? null : (
            <PinnedAct calm={cast.act.line} />
          )
        ) : (
          <PinnedAct label={cast.act.label} detail={cast.act.detail} onClick={onAct} />
        )
      }
    >
      {(g) => {
        const box = bandArtBox(g, art);
        // A scene not measured yet (width 0) is laid out as a phone's, so nothing waits for the first measure.
        const lay = g.W > 0 ? g : sceneGeometry(390, BAND_ROWS * g.s, g.s);
        const laid = bandArtBox(lay, art);
        const scene = { W: lay.W, H: lay.H, s: g.s, top: lay.top };
        const gate = cast.gate.map((n) => ({ x: laid.x + n.x, y: laid.y + n.y }));
        const roam = roamPlan(cast, laid, scene);
        return (
          <>
            {/* The place's props (rails, feed box, rim) in the creatures' depth order: by their bottom edge. */}
            {frontProps(art).map((prop) => (
              <At
                key={`${String(prop.x)}-${String(prop.y)}`}
                x={g.X(laid.x + prop.x)}
                y={g.Y(laid.y + prop.y)}
                class="vy-prop"
                z={propDepth(laid.x, laid.y, prop)}
              >
                <Pic sprite={prop.sprite} scale={g.s} />
              </At>
            ))}
            {standSpots(cast.stands, laid, scene, gate).map((spot) => (
              <Stander
                key={spot.stand.creature.id}
                creature={spot.stand.creature}
                x={spot.x}
                y={spot.y}
                flip={spot.stand.flip}
                label={spot.stand.where}
                g={g}
              />
            ))}
            {roam !== null && (
              <Roamers
                key={`${String(g.W)}-${String(g.s)}`}
                creatures={cast.roamers.slice(0, roam.shown)}
                area={roam.area}
                dragArea={roam.drag}
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
            {cast.timing !== null && (
              // When the raid comes, under the boss: the shared label, small; no HP (that stays on the raid page).
              <At
                x={g.X(box.x + box.width - 6 + 12)}
                y={g.Y(box.y + box.height - 30 + 24) + 2}
                class="vy-feet-plate"
                z={PLATES_Z}
                hidden={false}
              >
                <span role="img" aria-label={`Raid: ${cast.timing}`}>
                  <Nameplate size="sm" tone={cast.timing === 'live now' ? 'gold' : 'bone'}>
                    {cast.timing}
                  </Nameplate>
                </span>
              </At>
            )}
          </>
        );
      }}
    </SceneFrame>
  );
}

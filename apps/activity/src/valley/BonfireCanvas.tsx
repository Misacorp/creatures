/**
 * The Bonfire as a canvas (a sample of "A place is a canvas" in `ux-patterns.md`, built after the Forge and the Signpost; not merged): the fire
 * in its meadow fills the view and everything is done by clicking something in it. Nothing scrolls. The place opens straight on this
 * scene (no page under it); the HUD's back leaves for the valley.
 *
 * In the scene: the fire (opens the hearth's project board), the creatures resting round it (each a tap with its plate: level, name and the
 * experience it gained this visit; the tap opens that creature in the right drawer), other players' creatures at the fire (a tap shows
 * their owner's plate, as at the Forge), the helper's seat (a dashed outline while empty, the lamplighter's seat otherwise: the tap picks
 * who helps build), and "+N more" for the resting creatures that did not get a seat (opens the left drawer with everyone resting).
 *
 * What a click opens follows the side rule (`PlaceCanvas`): the right drawer is for the one thing that was clicked (a creature, the
 * helper's seat), the left for the collections that belong to no one spot (the project board, everyone resting). A phone shows the open
 * panel as its own page. The scene keeps one size and place for the whole visit; drawers lie over its edges.
 */
import { useMemo, useState } from 'preact/hooks';
import type { Creature, ValleyVisit } from '../api';
import { creatureName } from '../game';
import { Nameplate } from '../ui/Nameplate';
import { CommonsBoard, type CommonsActions, type CommonsStart } from './CommonsBoard';
import { LampPanel, RestingList, RestingPanel, type HelperPost } from './BonfirePanels';
import { CanvasTarget, PanelBody, PlaceCanvas, type CanvasPanel, type Opener } from './PlaceCanvas';
import { PLATES_Z } from './PlaceScene';
import { SceneFrame, sceneGeometry, type SceneGeometry } from './SceneFrame';
import { At, CreatureSprite, Pic } from './parts';
import {
  atTheFire,
  bonfireCalm,
  fireSpots,
  lamplighterSpot,
  moreCount,
  moreLabel,
  moreSpotWithin,
  MORE_CSS,
  restingOf,
  visitorsOf,
  type FireSpot,
} from './bonfire-cast';
import { bonfireSceneDraw, fireTarget } from './bonfire-canvas';
import { commonsOf, hearthLine, percentFilled, placeOf } from './commons-view';
import { CREATURE_PX } from './place-cast';
import { placeArtBox, placeScale } from './place-scene';
import { scaffoldSteps } from './scaffold';
import { depthOf } from './valley-logic';
import { WARMING_FLAME } from './valley-art';
import { GRAND_LEVEL, bonfireName } from './valley-places';

/** The right drawer: the one thing that was clicked. */
type Right =
  { kind: 'resting'; id: string; from: Opener | null } | { kind: 'lamp'; from: Opener | null };

/** The left drawer: a collection. */
type Left = { kind: 'board' | 'resting'; from: Opener | null };

export function BonfireCanvas({
  creatures,
  visit,
  level,
  commons,
  acorns = 0,
  busy = false,
  start = {},
}: {
  creatures: readonly Creature[];
  visit: ValleyVisit;
  /** The bonfire's place level (1 until the commons grow it). */
  level: number;
  /** The hearth's project board (the commons): its gifts and its helper seat; absent leaves the fire with no project. */
  commons?: CommonsActions | undefined;
  /** The player's Acorns (the `bait` balance). */
  acorns?: number;
  busy?: boolean;
  /** What is open at the start (the workbench and the tests show each). */
  start?: CommonsStart & { sheet?: boolean; resting?: boolean; lamp?: boolean };
}) {
  const [right, setRight] = useState<Right | null>(() =>
    start.lamp === true ? { kind: 'lamp', from: null } : null,
  );
  const [left, setLeft] = useState<Left | null>(() =>
    start.sheet === true || start.view !== undefined
      ? { kind: 'board', from: null }
      : start.resting === true
        ? { kind: 'resting', from: null }
        : null,
  );
  const [peek, setPeek] = useState<string | null>(null);

  const art = bonfireName(level);
  const grand = level >= GRAND_LEVEL;
  const resting = useMemo(() => restingOf(creatures, visit), [creatures, visit]);
  const visitors = useMemo(() => visitorsOf(visit), [visit]);
  const fireside = useMemo(
    () => atTheFire(resting, visitors, visit.settledAt),
    [resting, visitors, visit],
  );
  const block = commonsOf(visit);
  const place = placeOf(block, 'bonfire');
  const hearth = block === null ? null : hearthLine(block.hearthBp);
  const calm = bonfireCalm(resting);
  // The scaffolding rises round the fire as the project fills (V-COM-6).
  const steps = place?.state === 'open' ? scaffoldSteps(percentFilled(place) / 100) : 0;
  const draw = useMemo(() => bonfireSceneDraw(art, steps), [art, steps]);
  const helperId = block?.communal.find((c) => c.place === 'bonfire')?.creatureId ?? null;
  const helper = helperId === null ? undefined : creatures.find((c) => c.id === helperId);
  const post: HelperPost | undefined =
    commons === undefined || place === undefined
      ? undefined
      : { creatureId: helper?.id ?? null, actions: commons };

  const closeTop = (): void => {
    if (right !== null) setRight(null);
    else if (left !== null) setLeft(null);
  };

  // --- The drawers' panels ---

  let rightPanel: CanvasPanel | null = null;
  if (right?.kind === 'resting') {
    const one = resting.find((r) => r.creature.id === right.id);
    if (one !== undefined) {
      rightPanel = {
        title: creatureName(one.creature),
        wizard: true,
        returnFocusTo: right.from,
        backLabel: 'to the fire',
        onClose: () => {
          setRight(null);
        },
        children: (
          <RestingPanel
            key={right.id}
            resting={one}
            helper={post}
            busy={busy}
            onClose={() => {
              setRight(null);
            }}
          />
        ),
      };
    }
  } else if (right?.kind === 'lamp' && post !== undefined) {
    rightPanel = {
      title: 'The hearth',
      wizard: true,
      returnFocusTo: right.from,
      onClose: () => {
        setRight(null);
      },
      children: (
        <LampPanel
          visit={visit}
          creatures={creatures}
          helper={post}
          onClose={() => {
            setRight(null);
          }}
        />
      ),
    };
  }

  let leftPanel: CanvasPanel | null = null;
  if (left !== null) {
    const base = {
      returnFocusTo: left.from,
      onClose: () => {
        setLeft(null);
      },
    };
    if (left.kind === 'board') {
      leftPanel = {
        ...base,
        title: 'Project board',
        children: (
          <PanelBody>
            <div class="fc-hub">
              {hearth !== null && <p class="sp-note">{hearth}</p>}
              {commons !== undefined && (
                <CommonsBoard
                  place="bonfire"
                  host="panel"
                  visit={visit}
                  creatures={creatures}
                  acorns={acorns}
                  busy={busy}
                  actions={commons}
                  {...(start.view === undefined
                    ? {}
                    : {
                        start: {
                          view: start.view,
                          ...(start.row === undefined ? {} : { row: start.row }),
                        },
                      })}
                />
              )}
            </div>
          </PanelBody>
        ),
      };
    } else {
      leftPanel = {
        ...base,
        title: 'Resting by the fire',
        children: (
          <RestingList
            resting={resting}
            onPick={(id) => {
              setRight({ kind: 'resting', id, from: null });
            }}
          />
        ),
      };
    }
  }

  // --- The scene ---

  const scene = (
    <SceneFrame
      key="fire"
      id="bonfire"
      label="Bonfire"
      draw={draw}
      onLeave={closeTop}
      scaleFor={(width, height) => placeScale(width, height, art)}
    >
      {(measured) => {
        // A scene not measured yet (no size) is laid out as a phone's, so the targets are there from the first draw.
        const g =
          measured.W > 0 && measured.H > 0
            ? measured
            : sceneGeometry(390, 640, placeScale(390, 640, art));
        const box = placeArtBox(g, art);
        const seatShown = post !== undefined;
        const options = { grand, lamplighter: seatShown };
        let spots = fireSpots(fireside, box, g, options);
        // "+N more" counts the player's own resting creatures that did not get a seat (a visitor's seat is not one of them).
        const countMore = (): number =>
          moreCount(resting.length, spots.filter((s) => s.owner === undefined).length);
        let more = countMore();
        // With the button showing, the seats leave room for it under the front seat (it is never cut off at the bottom).
        if (more > 0) {
          spots = fireSpots(fireside, box, { ...g, H: g.H - Math.ceil(MORE_CSS / g.s) }, options);
          more = countMore();
        }
        const lamp = lamplighterSpot(box, grand);
        const moreAt = moreSpotWithin(box, g.s, g.H, grand);
        const fire = fireTarget(grand);
        return (
          <BonfireInside
            g={g}
            spots={spots}
            helper={helper}
            lamp={seatShown ? lamp : null}
            fire={{ x: box.x + fire.x, y: box.y + fire.y, w: fire.w, h: fire.h }}
            more={more}
            moreAt={moreAt}
            open={{
              board: left?.kind === 'board',
              resting: left?.kind === 'resting',
              restingId: right?.kind === 'resting' ? right.id : null,
              lamp: right?.kind === 'lamp',
            }}
            hearthOpen={place?.state === 'open'}
            peek={peek}
            busy={busy}
            onPeek={setPeek}
            onCreature={(id, opener) => {
              setRight({ kind: 'resting', id, from: opener });
            }}
            onLamp={(opener) => {
              setRight({ kind: 'lamp', from: opener });
            }}
            onFire={(opener) => {
              setLeft({ kind: 'board', from: opener });
            }}
            onMore={(opener) => {
              setLeft({ kind: 'resting', from: opener });
            }}
          />
        );
      }}
    </SceneFrame>
  );

  return (
    <div class="bc-root">
      <PlaceCanvas label="Bonfire" scene={scene} left={leftPanel} right={rightPanel} />
      {calm !== '' && (
        <p class="visually-hidden" role="status">
          {calm}
        </p>
      )}
    </div>
  );
}

/** What stands in the scene over its canvas: the creatures, the seat, the fire and "+N more", each real button a `CanvasTarget`. */
function BonfireInside({
  g,
  spots,
  helper,
  lamp,
  fire,
  more,
  moreAt,
  open,
  hearthOpen,
  peek,
  busy,
  onPeek,
  onCreature,
  onLamp,
  onFire,
  onMore,
}: {
  g: SceneGeometry;
  spots: readonly FireSpot[];
  helper: Creature | undefined;
  /** The helper's seat (scene pixels), or null when the hearth has no project. */
  lamp: { x: number; y: number } | null;
  fire: { x: number; y: number; w: number; h: number };
  more: number;
  moreAt: { x: number; y: number };
  open: { board: boolean; resting: boolean; restingId: string | null; lamp: boolean };
  hearthOpen: boolean;
  peek: string | null;
  busy: boolean;
  onPeek: (id: string | null) => void;
  onCreature: (id: string, opener: Opener) => void;
  onLamp: (opener: Opener) => void;
  onFire: (opener: Opener) => void;
  onMore: (opener: Opener) => void;
}) {
  const lampFlip = true;
  return (
    <>
      {/* The creatures, then the targets over them: a plate is the one cue that a thing can be clicked. */}
      {spots.map((spot) => (
        <At
          key={spot.creature.id}
          x={g.X(spot.x)}
          y={g.Y(spot.y)}
          class="vy-stand"
          z={depthOf(spot.x, spot.y)}
        >
          <CreatureSprite creature={spot.creature} scale={g.s} flip={spot.flip} />
          {spot.warm && (
            <span class="vy-flame" aria-hidden="true">
              <Pic sprite={WARMING_FLAME} scale={g.s} />
            </span>
          )}
        </At>
      ))}
      {helper !== undefined && lamp !== null && (
        <At x={g.X(lamp.x)} y={g.Y(lamp.y)} class="vy-stand" z={depthOf(lamp.x, lamp.y)}>
          <CreatureSprite creature={helper} scale={g.s} flip={lampFlip} />
        </At>
      )}
      <CanvasTarget
        g={g}
        {...fire}
        label={`The hearth${hearthOpen ? ', its project is open' : ''}. Open the project board`}
        plate="Hearth"
        plateAt={fire.h + 2}
        expanded={open.board}
        onClick={onFire}
      />
      {spots.map((spot) => {
        const name = creatureName(spot.creature);
        const visitor = spot.owner !== undefined;
        const peeking = visitor && peek === spot.creature.id;
        const z = PLATES_Z + depthOf(spot.x, spot.y);
        return (
          <span key={spot.creature.id}>
            <CanvasTarget
              g={g}
              x={spot.x}
              y={spot.y}
              w={CREATURE_PX}
              h={CREATURE_PX}
              z={z}
              label={
                visitor
                  ? `${spot.owner ?? ''}'s ${name}, level ${String(spot.creature.level)}, visiting the fire. Show who`
                  : `${name}, level ${String(spot.creature.level)}, ${spot.where}${spot.warm ? ', warming up' : ''}. Show this creature`
              }
              {...(peeking
                ? {}
                : {
                    plate: visitor ? '' : name,
                    plateMeta: {
                      level: spot.creature.level,
                      ...(spot.owner === undefined ? {} : { owner: spot.owner }),
                      ...(spot.gained > 0 ? { gain: spot.gained } : {}),
                    },
                    plateAt: CREATURE_PX + 1,
                  })}
              expanded={visitor ? peeking : open.restingId === spot.creature.id}
              onClick={(opener) => {
                if (visitor) onPeek(peeking ? null : spot.creature.id);
                else onCreature(spot.creature.id, opener);
              }}
            />
            {peeking && (
              <At
                x={g.X(spot.x + CREATURE_PX / 2)}
                y={g.Y(spot.y + CREATURE_PX) + 2}
                class="vy-feet-plate vy-over"
                z={z}
              >
                <Nameplate size="sm" level={spot.creature.level} owner={spot.owner}>
                  {name}
                </Nameplate>
              </At>
            )}
          </span>
        );
      })}
      {lamp !== null && (
        <CanvasTarget
          g={g}
          x={lamp.x}
          y={lamp.y}
          w={CREATURE_PX}
          h={CREATURE_PX}
          z={PLATES_Z + depthOf(lamp.x, lamp.y)}
          slot={helper === undefined}
          label={
            helper === undefined
              ? 'The helper seat: nobody helps build. Choose a creature'
              : `${creatureName(helper)}, level ${String(helper.level)}, lighting the lanterns, helping build the hearth. Change`
          }
          plate={helper === undefined ? 'Helper' : creatureName(helper)}
          {...(helper === undefined ? {} : { plateMeta: { level: helper.level } })}
          plateAt={CREATURE_PX + 1}
          expanded={open.lamp}
          disabled={busy}
          onClick={onLamp}
        />
      )}
      {more > 0 && (
        <CanvasTarget
          g={g}
          x={moreAt.x - 14}
          y={moreAt.y}
          w={28}
          h={Math.ceil(32 / g.s)}
          z={PLATES_Z}
          label={`${moreLabel(more)}: show everyone resting`}
          plate={moreLabel(more)}
          plateAt={0}
          expanded={open.resting}
          onClick={onMore}
        />
      )}
    </>
  );
}

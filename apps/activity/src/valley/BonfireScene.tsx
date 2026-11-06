/**
 * The Bonfire, open (`VALLEY_SYSTEMS` on; phase 5 step 1, `systems/bonfire.md` V-BON-3): the fire in its scene with a
 * rotating few of the resting creatures sitting round it, each with the experience it gained this visit on its
 * nameplate, and "+N more" for the rest; a tap on it opens every resting creature with its gain in a drawer (the
 * shared creature list, `show` mode). Built from the scene's own parts: `SceneFrame`, the creature `Stander`,
 * `standSpots` for where the plates fit, `PinnedAct` for the one calm line.
 */
import { useMemo, useState } from 'preact/hooks';
import type { Creature, ValleyVisit } from '../api';
import { baseOption } from '../roster-picker';
import { CreatureList } from '../ui/CreatureList';
import { Drawer } from '../ui/Drawer';
import { CommonsBoard, type CommonsActions, type CommonsStart } from './CommonsBoard';
import { PinnedAct } from './PinnedAct';
import { Stander } from './PlaceScene';
import { SceneFrame } from './SceneFrame';
import { At } from './parts';
import {
  atTheFire,
  bonfireCalm,
  fireSpots,
  lamplighterSpot,
  moreSpot,
  moreCount,
  moreLabel,
  restingOf,
  visitorsOf,
} from './bonfire-cast';
import { commonsOf, daysLeft, hearthLine, percentFilled, placeOf } from './commons-view';
import { placeArtBox, placeScale, placeSceneDraw } from './place-scene';
import { scaffoldSteps, scaffoldUp } from './scaffold';
import { GRAND_LEVEL, bonfireName, glowSprite } from './valley-places';

/** One creature's line in the list of everyone resting: its XP this visit, and that it is warming up while it catches up. */
function restingNote(gained: number, warm: boolean): string {
  const xp = gained > 0 ? `+${String(gained)} XP this visit` : 'Resting';
  return warm ? `${xp}, warming up` : xp;
}

/** CSS px at the bottom of the scene the pinned button takes (and, with the calm line above it, both): creatures keep clear of them. */
const ACT_CSS = 72;
const ACT_CSS_TWO = 124;

export function BonfireScene({
  creatures,
  visit,
  level,
  onLeave,
  commons,
  acorns = 0,
  busy = false,
  start = {},
}: {
  creatures: readonly Creature[];
  visit: ValleyVisit;
  /** The bonfire's place level (1 until the commons grow it). */
  level: number;
  onLeave: () => void;
  /** The hearth's project board (the commons): its gifts and its communal seat; absent leaves the scene as it was. */
  commons?: CommonsActions;
  /** The player's Acorns (the `bait` balance). */
  acorns?: number;
  busy?: boolean;
  /** The board's sheet starts open on this (the workbench shows each). */
  start?: CommonsStart & { sheet?: boolean };
}) {
  const [all, setAll] = useState(false);
  const [sheet, setSheet] = useState(start.sheet === true || start.view !== undefined);
  const art = bonfireName(level);
  const resting = useMemo(() => restingOf(creatures, visit), [creatures, visit]);
  const visitors = useMemo(() => visitorsOf(visit), [visit]);
  const fireside = useMemo(
    () => atTheFire(resting, visitors, visit.settledAt),
    [resting, visitors, visit],
  );
  const block = commonsOf(visit);
  const place = placeOf(block, 'bonfire');
  const hearth = block === null ? null : hearthLine(block.hearthBp);
  // The calm line says what the picture does not: the visit's gain, and the hearth's bonus.
  const calm = [
    bonfireCalm(resting),
    hearth === null ? '' : hearth.replace('The hearth adds', 'Hearth adds'),
  ]
    .filter((line) => line !== '')
    .join(' · ');
  // The scaffolding rises round the fire as the project fills (V-COM-6).
  const steps = place?.state === 'open' ? scaffoldSteps(percentFilled(place) / 100) : 0;
  const draw = useMemo(() => {
    const base = placeSceneDraw(art);
    if (steps === 0) return base;
    const sprite = glowSprite(art);
    return (g: Parameters<typeof base>[0]) => {
      const box = placeArtBox(g, art);
      return [...base(g), { sprite: scaffoldUp(sprite, steps), x: box.x, y: box.y }];
    };
  }, [art, steps]);
  const helperId = block?.communal.find((c) => c.place === 'bonfire')?.creatureId ?? null;
  const helper = helperId === null ? undefined : creatures.find((c) => c.id === helperId);
  const act =
    commons === undefined || place === undefined ? null : place.state === 'open' ? (
      <PinnedAct
        label="Help build the hearth"
        detail={`${String(percentFilled(place))}%`}
        onClick={() => {
          setSheet(true);
        }}
      />
    ) : (
      <PinnedAct
        label="The hearth"
        detail={place.state === 'building' ? daysLeft(place.buildDaysLeft) : ''}
        onClick={() => {
          setSheet(true);
        }}
      />
    );
  return (
    <>
      <SceneFrame
        id="bonfire"
        label="Bonfire"
        draw={draw}
        scaleFor={(width, height) => placeScale(width, height, art)}
        onLeave={onLeave}
        act={
          calm === '' && act === null ? null : (
            <>
              {calm !== '' && <PinnedAct calm={calm} />}
              {act}
            </>
          )
        }
      >
        {(g) => {
          const box = placeArtBox(g, art);
          const actCss =
            (calm !== '' ? 1 : 0) + (act === null ? 0 : 1) === 2 ? ACT_CSS_TWO : ACT_CSS;
          const scene = { W: g.W, H: g.H - Math.ceil(actCss / g.s), s: g.s, top: g.top };
          const grand = level >= GRAND_LEVEL;
          const spots = fireSpots(fireside, box, scene, {
            grand,
            lamplighter: helper !== undefined,
          });
          const lamp = lamplighterSpot(box, grand);
          // "+N more" counts the player's own resting creatures that did not get a seat (a visitor's seat is not one of them).
          const more = moreCount(resting.length, spots.filter((s) => s.owner === undefined).length);
          return (
            <>
              {spots.map((spot) => (
                <Stander
                  key={spot.creature.id}
                  creature={spot.creature}
                  x={spot.x}
                  y={spot.y}
                  flip={spot.flip}
                  label={spot.where}
                  g={g}
                  gain={spot.gained}
                  warm={spot.warm}
                  {...(spot.owner === undefined ? {} : { owner: spot.owner })}
                />
              ))}
              {helper !== undefined && (
                <Stander
                  creature={helper}
                  x={lamp.x}
                  y={lamp.y}
                  flip
                  label="lighting the lanterns, helping build the hearth"
                  g={g}
                />
              )}
              {more > 0 && (
                <At
                  x={g.X(moreSpot(box, g.s, grand).x)}
                  y={g.Y(moreSpot(box, g.s, grand).y)}
                  class="vy-more-at vy-stand vy-over"
                  hidden={false}
                >
                  <button
                    type="button"
                    class="vy-more"
                    aria-label={`${moreLabel(more)}: show all ${String(resting.length)} resting creatures`}
                    aria-haspopup="dialog"
                    onClick={() => {
                      setAll(true);
                    }}
                  >
                    {moreLabel(more)}
                  </button>
                </At>
              )}
            </>
          );
        }}
      </SceneFrame>
      <Drawer
        open={all}
        onClose={() => {
          setAll(false);
        }}
        title="Resting by the fire"
        meta={calm === '' ? undefined : calm}
      >
        <CreatureList
          options={resting.map((r) => ({
            ...baseOption(r.creature),
            note: restingNote(r.gained, r.warm),
          }))}
          selection={{ mode: 'show', label: 'Resting creatures' }}
          chips={false}
          class="flat"
        />
      </Drawer>
      {commons !== undefined && place !== undefined && (
        <CommonsBoard
          place="bonfire"
          host="sheet"
          open={sheet}
          onClose={() => {
            setSheet(false);
          }}
          visit={visit}
          creatures={creatures}
          acorns={acorns}
          busy={busy}
          actions={commons}
          {...(start.view === undefined
            ? {}
            : {
                start: { view: start.view, ...(start.row === undefined ? {} : { row: start.row }) },
              })}
        />
      )}
    </>
  );
}

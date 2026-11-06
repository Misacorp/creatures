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
import { PinnedAct } from './PinnedAct';
import { Stander } from './PlaceScene';
import { SceneFrame } from './SceneFrame';
import { At } from './parts';
import {
  atTheFire,
  bonfireCalm,
  fireSpots,
  moreSpot,
  moreCount,
  moreLabel,
  restingOf,
  visitorsOf,
} from './bonfire-cast';
import { placeArtBox, placeScale, placeSceneDraw } from './place-scene';
import { bonfireName } from './valley-places';

/** One creature's line in the list of everyone resting: its XP this visit, and that it is warming up while it catches up. */
function restingNote(gained: number, warm: boolean): string {
  const xp = gained > 0 ? `+${String(gained)} XP this visit` : 'Resting';
  return warm ? `${xp}, warming up` : xp;
}

/** CSS px at the bottom of the scene the pinned line takes: creatures keep clear of it. */
const ACT_CSS = 72;

export function BonfireScene({
  creatures,
  visit,
  level,
  onLeave,
}: {
  creatures: readonly Creature[];
  visit: ValleyVisit;
  /** The bonfire's place level (1 until the commons grow it). */
  level: number;
  onLeave: () => void;
}) {
  const [all, setAll] = useState(false);
  const art = bonfireName(level);
  const resting = useMemo(() => restingOf(creatures, visit), [creatures, visit]);
  const visitors = useMemo(() => visitorsOf(visit), [visit]);
  const fireside = useMemo(
    () => atTheFire(resting, visitors, visit.settledAt),
    [resting, visitors, visit],
  );
  const calm = bonfireCalm(resting);
  const draw = useMemo(() => placeSceneDraw(art), [art]);
  return (
    <>
      <SceneFrame
        id="bonfire"
        label="Bonfire"
        draw={draw}
        scaleFor={(width, height) => placeScale(width, height, art)}
        onLeave={onLeave}
        act={calm === '' ? null : <PinnedAct calm={calm} />}
      >
        {(g) => {
          const box = placeArtBox(g, art);
          const scene = { W: g.W, H: g.H - Math.ceil(ACT_CSS / g.s), s: g.s, top: g.top };
          const spots = fireSpots(fireside, box, scene);
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
              {more > 0 && (
                <At
                  x={g.X(moreSpot(box, g.s).x)}
                  y={g.Y(moreSpot(box, g.s).y)}
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
    </>
  );
}

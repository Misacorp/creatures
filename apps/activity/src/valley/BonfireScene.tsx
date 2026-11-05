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
  bonfireCalm,
  fireSpots,
  moreSpot,
  firesideOf,
  moreCount,
  moreLabel,
  restingOf,
} from './bonfire-cast';
import { placeArtBox, placeScale, placeSceneDraw } from './place-scene';
import { bonfireName } from './valley-places';

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
  const fireside = useMemo(() => firesideOf(resting, visit.settledAt), [resting, visit]);
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
          const more = moreCount(resting.length, spots.length);
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
            note: r.gained > 0 ? `+${String(r.gained)} XP this visit` : 'Resting',
          }))}
          selection={{ mode: 'show', label: 'Resting creatures' }}
          chips={false}
          class="flat"
        />
      </Drawer>
    </>
  );
}

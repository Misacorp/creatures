/**
 * The haul of a trip that came home, as a moment in the valley (round 2): the explorer drops its sack on the
 * road under the signpost, the sack opens in three frames and what it held pops out onto the ground one thing
 * at a time (the gear piece, the blueprints, the Bait, the parts), each a sprite. A short caption names who
 * came home from where and what it brought (the game's count badges; "Rank up!" on its own line), and one big
 * Claim is pinned at the bottom, always in view.
 */
import type { ComponentChildren } from 'preact';
import { glyphOrUnknown } from '../../glyphs';
import { ItemSprite } from '../../GearArt';
import { creatureName } from '../../game';
import { partIcon } from '../../gear-sprites';
import { Sprite } from '../../sprites/Sprite';
import { PACK_ART } from '../../sprites/pack-art';
import type { TripResultView } from '../../trip-result-view';
import { tripResultView } from '../../trip-result-view';
import { ActionButton } from '../../ui/ActionButton';
import { CountBadge } from '../../ui/CountBadge';
import { CreatureIcon } from '../../CreatureIcon';
import { claimTrip, creatureOf, type ProtoWorld } from '../world';
import { At, Pic } from './parts';
import { SACK_FRAMES } from './valley-art';

/** Where the sack lies (valley pixels): on the road at the signpost's foot. */
export const SACK_AT = { x: 28 * 16 + 22, y: 15 * 16 + 10 } as const;
/** Where the found things land round the sack (offsets from it), in the order they pop out. */
export const LAND_AT: readonly { dx: number; dy: number }[] = [
  { dx: -30, dy: -22 },
  { dx: -12, dy: -34 },
  { dx: 8, dy: -38 },
  { dx: 28, dy: -28 },
  { dx: 40, dy: -8 },
  { dx: -40, dy: 2 },
];

/** The frame the haul opens in: 0 sack shut, 1–3 opening, then one more thing out per frame. */
export const HAUL_FRAMES = 3 + LAND_AT.length;

export interface HaulThing {
  key: string;
  /** What it is, for the caption's screen-reader words. */
  name: string;
  art: ComponentChildren;
}

/** The haul's view (the game's own trip-result model) and the things that pop out, in order. */
export function haulOf(
  world: ProtoWorld,
  tripId: string,
): { view: TripResultView; things: HaulThing[] } | null {
  const trip = world.trips.find((t) => t.id === tripId);
  if (trip === undefined) return null;
  const after = claimTrip(world, tripId);
  if (after.haul === null) return null;
  const view = tripResultView({
    result: after.haul,
    trip,
    creature: creatureOf(world, trip.creatureId),
    pending: [],
    creatures: after.creatures,
    settled: {},
  });
  const things: HaulThing[] = [];
  for (const g of view.loot?.gear ?? []) {
    things.push({ key: g.id, name: g.baseId, art: <ItemSprite baseId={g.baseId} scale={2} /> });
  }
  for (const b of (view.loot?.blueprints ?? []).slice(0, 2)) {
    things.push({
      key: `bp-${b.baseId}`,
      name: `Blueprint ${b.baseId}`,
      art: (
        <span class="pv-thing-blueprint">
          <ItemSprite baseId={b.baseId} scale={2} />
        </span>
      ),
    });
  }
  if (view.gifts.some((g) => g.tags.some((t) => t.key === 'bait'))) {
    things.push({
      key: 'bait',
      name: 'Bait',
      art: <Sprite sprite={glyphOrUnknown('bait')} scale={3} />,
    });
  }
  for (const [kind] of Object.entries(view.loot?.parts ?? {}).slice(0, 2)) {
    things.push({
      key: `part-${kind}`,
      name: kind,
      art: <Sprite sprite={partIcon(kind)} scale={3} />,
    });
  }
  return { view, things: things.slice(0, LAND_AT.length) };
}

/** The sack and what came out of it, on the ground (inside the valley's stage). */
export function HaulOnGround({
  things,
  frame,
  X,
  Y,
  s,
}: {
  things: readonly HaulThing[];
  frame: number;
  X: (x: number) => number;
  Y: (y: number) => number;
  s: number;
}) {
  const sack = frame === 0 ? PACK_ART : (SACK_FRAMES[Math.min(frame, 3) - 1] ?? PACK_ART);
  const out = Math.max(0, frame - 3);
  return (
    <>
      <At x={X(SACK_AT.x)} y={Y(SACK_AT.y)} class="pv-haul-sack">
        <Pic sprite={sack} scale={s} />
      </At>
      {things.slice(0, out).map((t, i) => {
        const land = LAND_AT[i] ?? { dx: 0, dy: -20 };
        // The newest one is still in the air (2 px higher) for its first frame.
        const air = i === out - 1 && out < things.length ? 2 : 0;
        return (
          <At
            key={t.key}
            x={X(SACK_AT.x + land.dx)}
            y={Y(SACK_AT.y + land.dy - air)}
            class="pv-haul-thing"
          >
            {t.art}
          </At>
        );
      })}
    </>
  );
}

/** The caption at the top and Claim pinned at the bottom (over the valley, under the HUD). */
export function HaulCaption({
  world,
  tripId,
  view,
  onClaim,
}: {
  world: ProtoWorld;
  tripId: string;
  view: TripResultView;
  onClaim: () => void;
}) {
  const trip = world.trips.find((t) => t.id === tripId);
  const who = trip === undefined ? undefined : creatureOf(world, trip.creatureId);
  const bait = view.gifts.flatMap((g) => g.tags).filter((t) => t.key === 'bait');
  const gear = view.loot?.gear.length ?? 0;
  const blueprints = view.loot?.blueprints.length ?? 0;
  const up = view.xp !== null && view.xp.to > view.xp.from;
  return (
    <>
      <section class="pv-caption" aria-labelledby="pv-haul-title" role="status">
        <h2 id="pv-haul-title" class="pv-caption-title pix">
          {who !== undefined && <CreatureIcon creature={who} />}
          <span>
            {who === undefined ? 'Home' : creatureName(who)} · {view.place?.name ?? ''}
          </span>
        </h2>
        <p class="pv-caption-row">
          {gear > 0 && (
            <CountBadge
              icon={{ kind: 'glyph', id: 'gear-piece' }}
              amount={gear}
              label="Gear"
              name="Gear"
            />
          )}
          {blueprints > 0 && (
            <CountBadge
              icon={{ kind: 'glyph', id: 'blueprint' }}
              amount={blueprints}
              label="Blueprints"
              name="Blueprints"
            />
          )}
          {[...bait, ...view.counts].slice(0, 4).map(({ key, ...badge }) => (
            <CountBadge key={key} {...badge} />
          ))}
        </p>
        {up && <p class="pv-caption-up pix">Rank up! Explorer rank {view.xp?.to}</p>}
      </section>
      <div class="pv-act">
        <ActionButton label="Claim" wide large onClick={onClaim} />
      </div>
    </>
  );
}

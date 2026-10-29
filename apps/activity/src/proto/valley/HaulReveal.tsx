/**
 * The haul of a trip that came home, opened in the valley under the signpost: the sack opens in three
 * frames and what it held rises out of it, as the game's own reward rows (a gear `FindItem`, the
 * `FindBlueprint`s, `CountBadge`s for parts, supplies and Bait, the explorer's `XpGain`), then one gold
 * Claim. Nothing is a page: on a phone it rises from the bottom of the valley, on a desktop it stands at the
 * right with the valley still in view.
 */
import { useEffect, useState } from 'preact/hooks';
import { usePrefersReducedMotion } from '../../hooks';
import { tripResultView } from '../../trip-result-view';
import { CountBadge } from '../../ui/CountBadge';
import { FindBlueprint } from '../../ui/FindBlueprint';
import { FindItem } from '../../ui/FindItem';
import { FindList } from '../../ui/FindRow';
import { ActionButton } from '../../ui/ActionButton';
import { GlossaryTag } from '../../Glossary';
import { XpGain, XpList } from '../../ui/XpGain';
import { creatureName } from '../../game';
import { PACK_ART } from '../../sprites/pack-art';
import { claimTrip, creatureOf, type ProtoWorld } from '../world';
import { CreatureSprite, Pic, isStill } from './parts';
import { SACK_FRAMES } from './valley-art';

export function HaulReveal({
  world,
  tripId,
  onClaim,
}: {
  world: ProtoWorld;
  tripId: string;
  onClaim: () => void;
}) {
  const reduced = usePrefersReducedMotion();
  const still = reduced || isStill();
  const [frame, setFrame] = useState(still ? 3 : 0);
  useEffect(() => {
    if (still || frame >= 3) return undefined;
    const id = window.setTimeout(() => {
      setFrame((f) => f + 1);
    }, frame === 0 ? 300 : 100);
    return () => {
      window.clearTimeout(id);
    };
  }, [frame, still]);

  const after = claimTrip(world, tripId);
  const haul = after.haul;
  const trip = world.trips.find((t) => t.id === tripId);
  if (haul === null || trip === undefined) return null;
  const explorer = creatureOf(world, trip.creatureId);
  const view = tripResultView({
    result: haul,
    trip,
    creature: explorer,
    pending: [],
    creatures: after.creatures,
    settled: {},
  });
  const bait = view.gifts.flatMap((g) => g.tags).filter((t) => t.key === 'bait');
  const gear = view.loot?.gear ?? [];
  const blueprints = view.loot?.blueprints ?? [];
  const open = frame >= 3;
  const sack = frame === 0 ? PACK_ART : (SACK_FRAMES[Math.min(frame, 3) - 1] ?? PACK_ART);
  return (
    <section class="pv-haul" aria-labelledby="pv-haul-title">
      <div class="pv-haul-head">
        <span class={`pv-haul-who${frame === 1 ? ' hop' : ''}`} aria-hidden="true">
          <CreatureSprite creature={explorer} scale={3} />
        </span>
        <span class="pv-haul-sack" aria-hidden="true">
          <Pic sprite={sack} scale={4} />
        </span>
        <h2 id="pv-haul-title" class="pv-haul-title pix">
          {creatureName(explorer)} · {view.place?.name ?? ''}
        </h2>
      </div>
      <div class={`pv-haul-body${open ? ' open' : ''}`}>
        <FindList label="Brought home" class="pv-haul-finds">
          {gear.map((g) => (
            <FindItem key={g.id} baseId={g.baseId} rarity={g.rarity} level={g.itemLevel} motion={!still} scale={3} />
          ))}
          {blueprints.slice(0, 2).map((b) => (
            <FindBlueprint key={b.baseId} baseId={b.baseId} duplicate={b.duplicate} scale={3} />
          ))}
        </FindList>
        <p class="pv-haul-counts">
          {[...bait, ...view.counts].map(({ key, ...badge }) => (
            <CountBadge key={key} {...badge} />
          ))}
        </p>
        {view.xp !== null && (
          <XpList label={`${creatureName(explorer)}'s progress`}>
            <XpGain
              change={view.xp}
              what="Explorer XP"
              label={<GlossaryTag entry="explorer-rank">Explorer</GlossaryTag>}
            />
          </XpList>
        )}
        <ActionButton label="Claim" wide large onClick={onClaim} />
      </div>
    </section>
  );
}

import { useEffect, useRef, useState } from 'preact/hooks';
import { ExperienceGainRow } from '../../ExperienceGainRow';
import { ItemCard } from '../../ItemCard';
import { ItemFrame, ItemSprite } from '../../GearArt';
import { giftTags } from '../../claim-view';
import { creatureName } from '../../game';
import { gearName } from '../../gear-view';
import { glyphOrUnknown } from '../../glyphs';
import { usePrefersReducedMotion } from '../../hooks';
import { Sprite } from '../../sprites/Sprite';
import { creatureSpriteOrFallback } from '../../sprites/creature-sprites';
import { tripResultView } from '../../trip-result-view';
import { ActionButton } from '../../ui/ActionButton';
import { CountBadge } from '../../ui/CountBadge';
import { Popover, popupProps } from '../../ui/Popover';
import { XpList } from '../../ui/XpGain';
import { creatureOf } from '../world';
import type { PartyState } from './party-state';
import { At, PlaceScene } from './PlaceScene';
import { SACK_FRAMES } from './sprites';

const FRAME_MS = 160;
const DROP_MS = 220;

/** Where the n-th find lands on the road, left and right of the sack in turn (scene px). */
export function dropSpot(n: number): { x: number; y: number } {
  const side = n % 2 === 0 ? 1 : -1;
  const step = Math.floor(n / 2) + 1;
  return { x: 58 + side * step * 16, y: 38 + (step % 2) * 4 };
}

/**
 * The haul as a moment in the camp: the explorer by its sack on the road, the sack opening in three steps,
 * the finds popping out one by one onto the road (gear and blueprints, each a picture you can tap), then a
 * strip pinned at the bottom with what else came (counts), the rank up on its own line, the explorer's
 * experience, and one button to put it all in the chest.
 */
export function HaulScene({
  state,
  setState,
}: {
  state: PartyState;
  setState: (change: (s: PartyState) => PartyState) => void;
}) {
  const reduced = usePrefersReducedMotion();
  const haul = state.world.haul;
  const finds =
    haul?.loot === undefined
      ? []
      : [
          ...haul.loot.gear.map((g) => ({ kind: 'gear' as const, g })),
          ...haul.loot.blueprints.map((b) => ({ kind: 'bp' as const, b })),
        ];
  const total = SACK_FRAMES.length - 1 + finds.length;
  const [tick, setTick] = useState(reduced ? total : 0);
  const [card, setCard] = useState(false);
  const gearRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (reduced || tick >= total) return undefined;
    const t = setTimeout(
      () => {
        setTick((n) => n + 1);
      },
      tick < SACK_FRAMES.length - 1 ? FRAME_MS : DROP_MS,
    );
    return () => {
      clearTimeout(t);
    };
  }, [tick, reduced, total]);

  const moment = state.moment;
  if (moment?.kind !== 'haul' || haul === null) return null;
  const creature = creatureOf(state.world, moment.creatureId);
  const name = creatureName(creature);
  const trip = state.world.trips.find((t) => t.result === haul);
  const view = tripResultView({
    result: haul,
    trip,
    creature,
    pending: [],
    creatures: state.world.creatures,
    settled: {},
  });
  const counts = [...(haul.rankGifts ?? []).flatMap((g) => giftTags(g)), ...view.counts];
  const sack = SACK_FRAMES[Math.min(tick, SACK_FRAMES.length - 1)] ?? SACK_FRAMES[0];
  const dropped = Math.max(0, tick - (SACK_FRAMES.length - 1));
  const rank = haul.xp;
  const done = (): void => {
    setState((s) => ({ ...s, moment: null, held: null, said: 'The haul went to the chest.' }));
  };
  const gearItem = state.world.items.find((i) => i.id === haul.loot?.gear[0]?.id);
  return (
    <PlaceScene
      id="haul"
      label={`${name}'s haul from ${view.place?.name ?? 'a trip'}`}
      onBack={done}
      pinnedHeight={230}
      pinned={
        <div class="pp-haul-strip">
          {counts.length > 0 && (
            <p class="pp-haul-counts">
              {counts.map(({ key, ...badge }, i) => (
                <CountBadge key={`${key}-${String(i)}`} {...badge} />
              ))}
            </p>
          )}
          {rank !== undefined && rank.rank > rank.rankBefore && (
            <p class="pp-rank-up">
              <Sprite sprite={glyphOrUnknown('rank')} scale={2} />
              Explorer rank {String(rank.rankBefore)} → {String(rank.rank)}
            </p>
          )}
          {view.growth !== null && (
            <XpList label={`${name}'s experience`}>
              <ExperienceGainRow gain={view.growth} />
            </XpList>
          )}
          <ActionButton label="Into the chest" large onClick={done} />
        </div>
      }
    >
      {(g) => (
        <>
          <At g={g} x={36} y={26}>
            <Sprite
              sprite={creatureSpriteOrFallback(creature.species)}
              scale={g.s}
              alt={name}
              class="pp-hop"
            />
          </At>
          <At g={g} x={56} y={28}>
            {sack !== undefined && <Sprite sprite={sack} scale={g.s} />}
          </At>
          {finds.slice(0, dropped).map((f, i) => {
            const spot = dropSpot(i);
            return (
              <At key={i} g={g} x={spot.x} y={spot.y} class="pp-drop">
                {f.kind === 'gear' ? (
                  <button
                    ref={gearRef}
                    type="button"
                    class="pp-find"
                    aria-label={`${gearName(f.g.baseId)}, ${f.g.rarity}, level ${String(f.g.itemLevel)}`}
                    {...popupProps(card)}
                    onClick={() => {
                      setCard((c) => !c);
                    }}
                  >
                    <ItemFrame
                      rarity={f.g.rarity}
                      baseId={f.g.baseId}
                      {...(f.g.itemLevel === undefined ? {} : { level: f.g.itemLevel })}
                    >
                      <ItemSprite baseId={f.g.baseId} scale={Math.max(2, g.s - 1)} />
                    </ItemFrame>
                  </button>
                ) : (
                  <span
                    class="pp-find"
                    role="img"
                    aria-label={`Blueprint: ${gearName(f.b.baseId)}${f.b.duplicate ? '' : ', new'}`}
                  >
                    <ItemFrame rarity="common" class="blueprint">
                      <ItemSprite baseId={f.b.baseId} scale={Math.max(2, g.s - 1)} />
                    </ItemFrame>
                    {!f.b.duplicate && <span class="pp-bp-new">New</span>}
                  </span>
                )}
              </At>
            );
          })}
          {card && gearItem !== undefined && (
            <Popover
              layer="page"
              anchor={() => gearRef.current}
              label={gearName(gearItem.baseId)}
              onClose={() => {
                setCard(false);
              }}
            >
              <ItemCard item={gearItem} plainRarity />
            </Popover>
          )}
        </>
      )}
    </PlaceScene>
  );
}

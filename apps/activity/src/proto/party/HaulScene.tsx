import { useEffect, useState } from 'preact/hooks';
import { ExperienceGainRow } from '../../ExperienceGainRow';
import { GlossaryTag } from '../../Glossary';
import { LootList } from '../../LootList';
import { giftTags } from '../../claim-view';
import { creatureName } from '../../game';
import { ItemFrame, ItemSprite } from '../../GearArt';
import { GearItemsContext } from '../../gear-items-context';
import { gearName } from '../../gear-view';
import { glyphOrUnknown } from '../../glyphs';
import { usePrefersReducedMotion } from '../../hooks';
import { Sprite } from '../../sprites/Sprite';
import { creatureSpriteOrFallback } from '../../sprites/creature-sprites';
import { tripResultView } from '../../trip-result-view';
import { CountBadge } from '../../ui/CountBadge';
import { XpGain, XpList } from '../../ui/XpGain';
import { creatureOf } from '../world';
import type { PartyState } from './party-state';

/** The sack's frames: tied, split, open (three steps, then the finds come out). */
const SACK_FRAMES = 3;
const FRAME_MS = 140;

/**
 * The haul on the grass: the explorer beside its sack, which splits open in three steps, and what was in
 * it as the game's reward rows (gear and blueprints, the counts, the XP). On a phone it lies over the
 * clearing in front of the camp; on a wide screen it is the side panel.
 */
export function HaulScene({
  state,
  setState,
}: {
  state: PartyState;
  setState: (change: (s: PartyState) => PartyState) => void;
}) {
  const reduced = usePrefersReducedMotion();
  const [frame, setFrame] = useState(reduced ? SACK_FRAMES : 0);
  useEffect(() => {
    if (reduced || frame >= SACK_FRAMES) return undefined;
    const t = setTimeout(() => {
      setFrame((f) => f + 1);
    }, FRAME_MS);
    return () => {
      clearTimeout(t);
    };
  }, [frame, reduced]);

  const moment = state.moment;
  const haul = state.world.haul;
  if (moment?.kind !== 'haul' || haul === null) return null;
  const creature = creatureOf(state.world, moment.creatureId);
  const trip = state.world.trips.find((t) => t.result === haul);
  const view = tripResultView({
    result: haul,
    trip,
    creature,
    pending: [],
    creatures: state.world.creatures,
    settled: {},
  });
  const gifts = (haul.rankGifts ?? []).flatMap((g) => giftTags(g));
  const counts = [...gifts, ...view.counts];
  const open = frame >= SACK_FRAMES;
  const done = (): void => {
    setState((s) => ({ ...s, moment: null, held: null, said: 'The haul went to the chest.' }));
  };
  return (
    <section class="pp-haul pix-panel" aria-label={`${creatureName(creature)}'s haul`}>
      <div class="pp-haul-top" aria-hidden="true">
        <Sprite sprite={creatureSpriteOrFallback(creature.species)} scale={3} class="pp-hop" />
        <span class={`pp-sack pp-sack-${String(Math.min(frame, SACK_FRAMES))}`}>
          <Sprite sprite={glyphOrUnknown('satchel')} scale={4} />
        </span>
        <span class="pp-haul-place">{view.place?.name ?? ''}</span>
      </div>
      {open && (
        <GearItemsContext.Provider value={state.world.items}>
          <div class="pp-haul-finds">
            {view.loot !== null && view.loot.gear.length > 0 && (
              <LootList loot={{ ...view.loot, blueprints: [] }} counted label="Gear" />
            )}
            {(view.loot?.blueprints.length ?? 0) > 0 && (
              <ul class="pp-bps" aria-label="Blueprints">
                {view.loot?.blueprints.map((b) => (
                  <li
                    key={b.baseId}
                    aria-label={`Blueprint: ${gearName(b.baseId)}${b.duplicate ? '' : ', new'}`}
                  >
                    <ItemFrame rarity="common" class="blueprint">
                      <ItemSprite baseId={b.baseId} scale={3} />
                    </ItemFrame>
                    {!b.duplicate && <span class="pp-bp-new">New</span>}
                  </li>
                ))}
              </ul>
            )}
            {counts.length > 0 && (
              <p class="pp-haul-counts">
                {counts.map(({ key, ...badge }, i) => (
                  <CountBadge key={`${key}-${String(i)}`} {...badge} />
                ))}
              </p>
            )}
            <XpList label={`${creatureName(creature)}'s progress`}>
              {view.xp !== null && (
                <XpGain
                  change={view.xp}
                  what="Explorer XP"
                  label={<GlossaryTag entry="explorer-rank">Explorer</GlossaryTag>}
                />
              )}
              {view.growth !== null && <ExperienceGainRow gain={view.growth} />}
            </XpList>
          </div>
          <button type="button" class="pp-done" onClick={done}>
            Into the chest
          </button>
        </GearItemsContext.Provider>
      )}
    </section>
  );
}

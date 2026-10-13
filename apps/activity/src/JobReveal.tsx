import { GLOSSARY_IDS, entryView } from '@creatures/game';
import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { ItemFrame, ItemSprite, RarityTag } from './GearArt';
import type { GearItem, JobResult } from './gear-types';
import { gearName, improveMessage, jobVerb, rarityName } from './gear-view';
import { Sprite } from './sprites/Sprite';
import { supplyKindOf, supplyName } from './trip-view';
import { usePrefersReducedMotion } from './hooks';
import { RevealStage, useRevealFrame } from './Reveal';

/** The words of a claimed job, from its result alone. */
function Outcome({ result, items }: { result: JobResult; items: readonly GearItem[] }) {
  switch (result.kind) {
    case 'craft':
      return (
        <>
          <p>
            <strong class="pix">{gearName(result.baseId)}</strong>{' '}
            <RarityTag rarity={result.rarity} />
          </p>
          <p>It is in your bag now.</p>
          {result.upgraded && (
            <p class="good-note">
              It came out a rarity better than the blueprint ({rarityName(result.rarity)}).
            </p>
          )}
        </>
      );
    case 'improve': {
      const message = improveMessage(result);
      return (
        <>
          <p>
            <strong class="pix">{gearName(result.baseId)}</strong>: extra stat{' '}
            {result.secondaryIndex + 1} re-rolled
          </p>
          <p>{message}</p>
        </>
      );
    }
    case 'supply':
      return (
        <>
          <p>
            <strong class="pix">
              {result.amount > 1 ? `${String(result.amount)} \u00d7 ` : ''}
              {supplyName(result.supplyId)}
            </strong>
          </p>
          <p>
            {result.amount === 1 ? 'It is' : 'They are'} in your supplies now, ready for the next
            trip.
          </p>
        </>
      );
    case 'enchant': {
      const item = items.find((i) => i.id === result.gearId);
      return (
        <>
          <p>
            <strong class="pix">{gearName(result.baseId)}</strong>
            {item === undefined ? '' : ` +${String(item.level)}`} has a new enchant
          </p>
          <p>
            <GlossaryTag entry={GLOSSARY_IDS.enchant(result.enchantId)} look="chip" class="tag">
              {entryView(GLOSSARY_IDS.enchant(result.enchantId))?.title ?? result.enchantId}
            </GlossaryTag>{' '}
            {entryView(GLOSSARY_IDS.enchant(result.enchantId))?.short}
          </p>
        </>
      );
    }
  }
}

/**
 * A claimed job: the same orb that opens in the finale's loot reveal, then what the job made with
 * the item popping in. The real text is in the page from the start (the animation only delays its
 * look), and a player who prefers reduced motion sees the end state at once.
 */
export function JobReveal({
  result,
  items,
  rarity,
  onDismiss,
}: {
  result: JobResult;
  items: readonly GearItem[];
  /** The rarity of the item that was made or worked on, for the frame. */
  rarity: GearItem['rarity'];
  onDismiss: () => void;
}) {
  const reduced = usePrefersReducedMotion();
  const frame = useRevealFrame(0, reduced);
  const done = frame.phase === 'done';
  return (
    <section class="reveal-card job-reveal" role="status" aria-labelledby="job-reveal-heading">
      <h3 id="job-reveal-heading">{jobVerb(result.kind)} finished</h3>
      <RevealStage
        frame={frame}
        opened={
          <ItemFrame rarity={rarity}>
            {result.kind === 'supply' ? (
              <Sprite
                sprite={glyphOrUnknown(supplyKindOf(result.supplyId) ?? 'unknown')}
                scale={10}
              />
            ) : (
              <ItemSprite baseId={result.baseId} scale={8} />
            )}
          </ItemFrame>
        }
      />
      <div class={done ? 'reveal-gear-box done' : 'reveal-gear-box'}>
        <Outcome result={result} items={items} />
        <p class="muted">
          +{result.xp} <GlossaryTag entry="skill-crafting">Crafting</GlossaryTag> XP
          {result.leveledUp && (
            <>
              {' '}
              · <strong>Crafting level {result.skillLevel}!</strong>
            </>
          )}
        </p>
      </div>
      <p>
        <button type="button" class="primary" onClick={onDismiss}>
          Got it
        </button>
      </p>
    </section>
  );
}

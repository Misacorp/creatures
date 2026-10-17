import { experienceText } from './experience';
import { glyphOrUnknown } from './glyphs';
import { ItemFrame, ItemSprite, PartsList, RarityTag } from './GearArt';
import { GlossaryTag } from './Glossary';
import type { GearItem, JobResult } from './gear-types';
import {
  gearName,
  jobVerb,
  marksText,
  partsText,
  rarityName,
  reachName,
  slotName,
} from './gear-view';
import { ItemLines } from './ItemLines';
import { Sprite } from './sprites/Sprite';
import { supplyKindOf, supplyName } from './trip-view';
import { RevealLater, RevealShell, RevealStage, useRevealSequence } from './ui/RevealShell';

/** The words of a claimed job, from its result alone (and the item it made, for its lines). */
function Outcome({ result, items }: { result: JobResult; items: readonly GearItem[] }) {
  switch (result.kind) {
    case 'craft': {
      const item = items.find((i) => i.id === result.gearId);
      return (
        <>
          <p>
            <strong class="pix">{gearName(result.baseId)}</strong>{' '}
            <RarityTag rarity={result.rarity} />
          </p>
          <p class="muted">
            {item === undefined ? '' : `${slotName(item.slot)}, `}item level {result.itemLevel}
          </p>
          {item !== undefined && <ItemLines lines={item.lines} />}
          <p>It is in your bag now.</p>
          {result.reach !== 'none' && <p class="muted">{reachName(result.reach)}.</p>}
          {result.upgraded && (
            <p class="good-note">
              The one-step-up chance paid off: it came out {rarityName(result.rarity)}.
            </p>
          )}
        </>
      );
    }
    case 'dismantle':
      return (
        <>
          <p>
            <strong class="pix">
              {result.items.length === 1 && result.items[0] !== undefined
                ? gearName(result.items[0].baseId)
                : `${String(result.items.length)} items`}
            </strong>{' '}
            taken apart.
          </p>
          <p>
            You got:{' '}
            <strong>
              {[
                ...(partsText(result.parts) === 'nothing' ? [] : [partsText(result.parts)]),
                ...(result.essence > 0 ? [`${String(result.essence)} Essence`] : []),
              ].join(', ') || 'nothing'}
            </strong>
            .
          </p>
          <PartsList parts={result.parts} />
          {result.learned.map((baseId) => (
            <p key={baseId} class="good-note">
              You learned the blueprint of {gearName(baseId)}.
            </p>
          ))}
          {result.marked.map((m) => (
            <p key={m.baseId} class="good-note">
              {gearName(m.baseId)} is well-thumbed {marksText(m.marks)} now.
            </p>
          ))}
        </>
      );
    case 'supply':
      return (
        <>
          <p>
            <strong class="pix">
              {result.amount > 1 ? `${String(result.amount)} × ` : ''}
              {supplyName(result.supplyId)}
            </strong>
          </p>
          <p>
            {result.amount === 1 ? 'It is' : 'They are'} in your supplies now, ready for the next
            trip.
          </p>
        </>
      );
    case 'retired':
      return (
        <>
          <p>
            This {result.was === 'improve' ? 'Improve' : 'Enchant'} job was started before gear
            changed. It is over, and its parts came back:{' '}
            <strong>{partsText(result.refund)}</strong>.
          </p>
          <PartsList parts={result.refund} />
        </>
      );
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
  /** The rarity of the item that was made, for the frame. */
  rarity: GearItem['rarity'];
  onDismiss: () => void;
}) {
  const { frame, done } = useRevealSequence(0);
  const title = result.kind === 'retired' ? 'Old job over' : `${jobVerb(result.kind)} finished`;
  const worked = result.experience === undefined ? null : experienceText(result.experience);
  return (
    <RevealShell
      id="job-reveal-heading"
      title={title}
      class="job-reveal"
      status
      arrive
      onDismiss={onDismiss}
    >
      <RevealStage
        frame={frame}
        opened={
          <ItemFrame
            rarity={rarity}
            {...(result.kind === 'craft' ? { baseId: result.baseId } : {})}
          >
            {result.kind === 'supply' ? (
              <Sprite
                sprite={glyphOrUnknown(supplyKindOf(result.supplyId) ?? 'unknown')}
                scale={10}
              />
            ) : result.kind === 'craft' ? (
              <ItemSprite baseId={result.baseId} scale={8} />
            ) : result.kind === 'dismantle' && result.items[0] !== undefined ? (
              <ItemSprite baseId={result.items[0].baseId} scale={8} />
            ) : (
              <Sprite sprite={glyphOrUnknown('anvil')} scale={8} />
            )}
          </ItemFrame>
        }
      />
      <RevealLater done={done}>
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
        {worked !== null && (
          <p class="muted">
            <GlossaryTag entry="experience">{`The worker: ${worked}`}</GlossaryTag>
          </p>
        )}
      </RevealLater>
    </RevealShell>
  );
}

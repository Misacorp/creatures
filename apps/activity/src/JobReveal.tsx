import { GLOSSARY_IDS } from '@creatures/game';
import type { Creature } from './api';
import { creatureName } from './game';
import { glyphOrUnknown } from './glyphs';
import { essenceCount, partCountItems } from './count-items';
import { ExperienceGainRow } from './ExperienceGainRow';
import { ItemFrame, ItemSprite, ItemThumb, PartsList, RarityTag } from './GearArt';
import { GlossaryTag } from './Glossary';
import type { GearItem, JobResult } from './gear-types';
import { gearName, jobVerb, partsText, rarityName, reachName, slotName } from './gear-view';
import { ItemLines } from './ItemLines';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { supplyKindOf, supplyName } from './trip-view';
import { CountBadgeList, type CountItem } from './ui/CountBadge';
import { FindBlueprint } from './ui/FindBlueprint';
import { FindList } from './ui/FindRow';
import { RevealLater, RevealShell, RevealStage, useRevealSequence } from './ui/RevealShell';
import { XpGain, XpList } from './ui/XpGain';
import { craftingGain, experienceGain } from './xp-gain';

/** What a dismantle gave, as count badges: the parts, then Essence (the same look as the dismantle panel's). */
function gaveItems(result: Extract<JobResult, { kind: 'dismantle' }>): CountItem[] {
  return [
    ...partCountItems(result.parts),
    ...(result.essence > 0 ? [essenceCount(result.essence, { entry: true })] : []),
  ];
}

/** A pixel arrow head pointing right, between what went in and what came out. */
function Chevron() {
  return (
    <svg class="jr-chevron" viewBox="0 0 4 7" aria-hidden="true" shape-rendering="crispEdges">
      <rect x="0" y="0" width="1" height="1" />
      <rect x="1" y="1" width="1" height="1" />
      <rect x="2" y="2" width="1" height="1" />
      <rect x="3" y="3" width="1" height="1" />
      <rect x="2" y="4" width="1" height="1" />
      <rect x="1" y="5" width="1" height="1" />
      <rect x="0" y="6" width="1" height="1" />
    </svg>
  );
}

/** Row 1 of a dismantle: the item or items taken apart, an arrow, and what they became as count badges. */
function DismantleRow({ result }: { result: Extract<JobResult, { kind: 'dismantle' }> }) {
  const gave = gaveItems(result);
  return (
    <div class="jr-row">
      <ul class="jr-items" aria-label="Taken apart">
        {result.items.map((item, index) => (
          <li key={`${item.baseId}-${String(index)}`}>
            <ItemThumb item={item} scale={4} />
          </li>
        ))}
      </ul>
      <Chevron />
      <span class="visually-hidden">became</span>
      {gave.length === 0 ? (
        <p class="muted">Nothing</p>
      ) : (
        <CountBadgeList items={gave} label="Became" class="gives jr-gives" bare />
      )}
    </div>
  );
}

/**
 * Row 2 of a claimed job: who did it (their sprite and name) with two rows of the shared `XpGain`, their
 * experience (gold) and the Crafting skill's (its own colour), each counting up to where it is now. A job
 * from before the worker was recorded has the Crafting row alone.
 */
function Worker({ result, creatures }: { result: JobResult; creatures: readonly Creature[] }) {
  const paid = result.experience;
  const creature = paid === undefined ? undefined : creatures.find((c) => c.id === paid.creatureId);
  const name = creature === undefined ? 'The worker' : creatureName(creature);
  const exp = paid === undefined ? null : experienceGain(paid, name);
  const crafting = craftingGain(result, name);
  return (
    <div class="jr-worker">
      {creature !== undefined && (
        <figure class="jr-who">
          <Sprite sprite={creatureSpriteOrFallback(creature.species)} scale={3} />
          <figcaption class="pix">{name}</figcaption>
        </figure>
      )}
      <XpList label={`${name}'s progress`}>
        {exp !== null && <ExperienceGainRow gain={exp} />}
        <XpGain
          change={crafting}
          what="Crafting XP"
          label={<GlossaryTag entry="skill-crafting">Crafting</GlossaryTag>}
        />
      </XpList>
    </div>
  );
}

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
          {item !== undefined && <p class="muted">{slotName(item.slot)}</p>}
          {item !== undefined && <ItemLines lines={item.lines} />}
          {result.reach !== 'none' && <p class="muted">{reachName(result.reach)}.</p>}
          {result.upgraded && <p class="good-note">Stepped up to {rarityName(result.rarity)}.</p>}
        </>
      );
    }
    case 'dismantle':
      return (
        <>
          {result.tinkered !== undefined && result.tinkered > 0 && (
            <p class="good-note">
              <GlossaryTag entry={GLOSSARY_IDS.gearLine('tinkers-luck')}>
                {"Tinker's luck"}
              </GlossaryTag>
              :{' '}
              {result.tinkered === 1
                ? 'the full craft cost came back.'
                : `${String(result.tinkered)} items gave back their full craft cost.`}
            </p>
          )}
          {(result.learned.length > 0 || result.marked.length > 0) && (
            <FindList label="Blueprints">
              {result.learned.map((baseId) => (
                <FindBlueprint key={baseId} baseId={baseId} />
              ))}
              {result.marked.map((m) => (
                <FindBlueprint key={m.baseId} baseId={m.baseId} duplicate marks={m.marks} />
              ))}
            </FindList>
          )}
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
        </>
      );
    case 'retired':
      return (
        <>
          <p>
            Old {result.was === 'improve' ? 'Improve' : 'Enchant'} job over. Parts back:{' '}
            <strong>{partsText(result.refund)}</strong>.
          </p>
          <PartsList parts={result.refund} />
        </>
      );
  }
}

/**
 * A claimed job: the same orb that opens in the finale's loot reveal, then what the job made with
 * the item popping in, and who did the work with the experience and the Crafting XP it paid. A dismantle
 * is a picture instead of the orb: the item, an arrow, and what it became as count badges. The real text is
 * in the page from the start (the animation only delays its look), and a player who prefers reduced motion
 * sees the end state at once.
 */
export function JobReveal({
  result,
  items,
  rarity,
  creatures,
  onDismiss,
}: {
  result: JobResult;
  items: readonly GearItem[];
  /** The rarity of the item that was made, for the frame. */
  rarity: GearItem['rarity'];
  /** The player's creatures: the one that did the work is found by its experience's `creatureId`. */
  creatures: readonly Creature[];
  onDismiss: () => void;
}) {
  const { frame, done } = useRevealSequence(0);
  const title = result.kind === 'retired' ? 'Old job over' : `${jobVerb(result.kind)} finished`;
  const dismantled = result.kind === 'dismantle';
  return (
    <RevealShell
      id="job-reveal-heading"
      title={title}
      class="job-reveal"
      status
      arrive
      onDismiss={onDismiss}
    >
      {result.kind === 'dismantle' ? (
        <DismantleRow result={result} />
      ) : (
        <RevealStage
          frame={frame}
          opened={
            <ItemFrame
              rarity={rarity}
              {...(result.kind === 'craft'
                ? { baseId: result.baseId, level: result.itemLevel }
                : {})}
            >
              {result.kind === 'supply' ? (
                <Sprite
                  sprite={glyphOrUnknown(supplyKindOf(result.supplyId) ?? 'unknown')}
                  scale={10}
                />
              ) : result.kind === 'craft' ? (
                <ItemSprite baseId={result.baseId} scale={8} />
              ) : (
                <Sprite sprite={glyphOrUnknown('anvil')} scale={8} />
              )}
            </ItemFrame>
          }
        />
      )}
      <RevealLater done={done || dismantled}>
        <Outcome result={result} items={items} />
        <Worker result={result} creatures={creatures} />
      </RevealLater>
    </RevealShell>
  );
}

import { useState } from 'preact/hooks';
import type { Creature } from './api';
import { creatureName, getSpecies, speciesName } from './game';
import { ElementChip } from './sprites/ElementChip';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { TalentChip } from './TalentChip';
import type { ChoiceRequest, DuplicateChoice, PendingCatch } from './talent-types';
import {
  CHOICE_LABEL,
  CHOICE_ORDER,
  choiceHint,
  fuseTargets,
  isOffered,
  recommendedText,
  teachTargets,
} from './talent-view';
import { Tag } from './ui/Tag';

/** What a card's buttons do; the screen that owns the cards supplies it (one action at a time). */
export interface CatchChoiceActions {
  /** Answers one waiting duplicate. */
  choose: (card: PendingCatch, request: ChoiceRequest) => void;
  /** Applies Recommended to every waiting duplicate. */
  chooseAll: () => void;
}

interface Option {
  key: string;
  text: string;
  recommended: boolean;
  request: ChoiceRequest;
}

/** The ways one choice can go (one option for a single target, several for a picker). */
function optionsFor(
  choice: 'teach' | 'fuse',
  card: PendingCatch,
  creatures: readonly Creature[],
): Option[] {
  if (choice === 'fuse') {
    return fuseTargets(card, creatures).map((t) => ({
      key: t.creature.id,
      text: `${creatureName(t.creature)}: fusion ${String(t.after)} / 5`,
      recommended: t.recommended,
      request: { choice: 'fuse', creatureId: t.creature.id },
    }));
  }
  return teachTargets(card, creatures).flatMap((target) =>
    target.slots.map((s) => ({
      key: `${target.creature.id}:${String(s.slot)}`,
      text:
        s.current === null
          ? `${creatureName(target.creature)}: empty slot ${String(s.slot)}`
          : `${creatureName(target.creature)}: slot ${String(s.slot)}, replaces ${s.current.name}`,
      recommended: s.recommended,
      request: { choice: 'teach', creatureId: target.creature.id, slot: s.slot },
    })),
  );
}

/**
 * A duplicate waiting for an answer: the creature and the talent it rolled (golden: shimmering gold title and number), and
 * four buttons, Teach, Fuse, Release and Keep, with the one the server recommends marked. Teach and Fuse go
 * straight through when there is one place to put it, and open a short list when there are several. A
 * choice the server does not offer (Keep, until a line has a second branch) is not drawn. The talent a
 * Teach replaces stays in that creature's Talent Book.
 */
export function DuplicateCard({
  card,
  creatures,
  busy,
  actions,
}: {
  card: PendingCatch;
  creatures: readonly Creature[];
  busy: boolean;
  actions: CatchChoiceActions;
}) {
  const [picking, setPicking] = useState<'teach' | 'fuse' | null>(null);
  const species = getSpecies(card.species);
  const recommended = card.recommended.choice;
  const choices = CHOICE_ORDER.filter((c) => c !== 'keep' || card.offered.keep);

  function press(choice: DuplicateChoice): void {
    if (choice === 'teach' || choice === 'fuse') {
      const options = optionsFor(choice, card, creatures);
      const only = options.length === 1 ? options[0] : undefined;
      if (only !== undefined) {
        setPicking(null);
        actions.choose(card, only.request);
      } else {
        setPicking(picking === choice ? null : choice);
      }
      return;
    }
    actions.choose(card, { choice });
  }

  const list = picking === null ? [] : optionsFor(picking, card, creatures);
  return (
    <li class="dup-card">
      <div class="dup-head">
        <Sprite sprite={creatureSpriteOrFallback(card.species)} scale={3} bob />
        <p>
          <strong class="pix">{speciesName(card.species)}</strong>{' '}
          {species !== undefined && <ElementChip element={species.element} />}{' '}
          <Tag kind="badge" entry="duplicate-choice">
            Duplicate
          </Tag>
          {card.shiny && (
            <>
              {' '}
              <Tag kind="badge" tone="shiny" entry="shiny">
                Shiny!
              </Tag>
            </>
          )}
        </p>
      </div>
      <p class="dup-talent">
        <TalentChip talent={card.talent} about />
      </p>
      <p class="muted dup-rec">Recommended: {recommendedText(card, creatures)}</p>
      <ul class="dup-buttons" aria-label={`What to do with this ${speciesName(card.species)}`}>
        {choices.map((choice) => {
          const isRec = recommended === choice;
          const offered = isOffered(choice, card);
          return (
            <li key={choice}>
              <button
                type="button"
                class={isRec ? 'primary' : ''}
                disabled={busy || !offered}
                aria-expanded={
                  choice === 'teach' || choice === 'fuse' ? picking === choice : undefined
                }
                aria-describedby={`dup-${card.id}-${choice}`}
                onClick={() => {
                  press(choice);
                }}
              >
                {CHOICE_LABEL[choice]}
                {isRec && <span class="rec-mark"> (Recommended)</span>}
              </button>
              <span class="muted dup-hint" id={`dup-${card.id}-${choice}`}>
                {offered ? choiceHint(choice, card) : 'Nothing to teach it to'}
              </span>
            </li>
          );
        })}
      </ul>
      {picking !== null && (
        <ul
          class="dup-picker"
          aria-label={`Choose where to ${CHOICE_LABEL[picking].toLowerCase()} it`}
        >
          {list.map((option) => (
            <li key={option.key}>
              <button
                type="button"
                class={option.recommended ? 'primary' : ''}
                disabled={busy}
                onClick={() => {
                  setPicking(null);
                  actions.choose(card, option.request);
                }}
              >
                {option.text}
                {option.recommended && <span class="rec-mark"> (Recommended)</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

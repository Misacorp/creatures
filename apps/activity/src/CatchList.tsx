import type { ClaimResult, Creature } from './api';
import { DuplicateCard, type CatchChoiceActions } from './DuplicateCard';
import { catchBadgeTags, getSpecies, speciesName } from './game';
import { ElementChip } from './sprites/ElementChip';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { TalentChip } from './TalentChip';
import type { ChoiceResult, PendingCatch } from './talent-types';
import { choiceResultText } from './talent-view';
import { Tag } from './ui/Tag';

/** How many rolls of a trip brought no creature, in words ("No creature this time", "2 rolls found no creature"). */
export function noCatchLine(result: Pick<ClaimResult, 'catches' | 'noCatch'>): string | null {
  const none = result.noCatch ?? 0;
  if (none === 0) return null;
  if (result.catches.length === 0) {
    return none === 1
      ? 'No creature came this time, only a small find.'
      : 'No creature came this time, only small finds.';
  }
  return none === 1 ? '1 roll found no creature.' : `${String(none)} rolls found no creature.`;
}

/** What the server settled by itself because ten catches already waited, one sentence each. */
export function autoSettledLines(
  results: readonly ChoiceResult[] | undefined,
  creatures: readonly Creature[],
): string[] {
  return (results ?? []).map(
    (r) => `An older waiting catch was settled for you. ${choiceResultText(r, creatures)}`,
  );
}

/**
 * The creatures a claim found. A new species shows with the talent it rolled; a duplicate shows its card
 * with the four buttons while it waits (the same card as on the Collection tab), and what became of it once
 * answered. Old claims (from before the duplicate choice) still show as they were.
 */
export function CatchList({
  result,
  pending,
  creatures,
  busy,
  actions,
  settled,
}: {
  result: ClaimResult;
  pending: readonly PendingCatch[];
  creatures: readonly Creature[];
  busy: boolean;
  actions: CatchChoiceActions;
  settled: Readonly<Record<string, string>>;
}) {
  if (result.catches.length === 0) return null;
  return (
    <ul class="reveal-catches" aria-label="Creatures found">
      {result.catches.map((entry, index) => {
        const card =
          entry.pendingId === undefined ? undefined : pending.find((p) => p.id === entry.pendingId);
        if (card !== undefined) {
          return (
            <DuplicateCard
              key={card.id}
              card={card}
              creatures={creatures}
              busy={busy}
              actions={actions}
            />
          );
        }
        const species = getSpecies(entry.species);
        const answered = entry.pendingId === undefined ? undefined : settled[entry.pendingId];
        return (
          <li key={index} class="catch-row">
            <Sprite sprite={creatureSpriteOrFallback(entry.species)} scale={3} bob />
            <span class="catch-text">
              <strong>{speciesName(entry.species)}</strong>{' '}
              {species !== undefined && <ElementChip element={species.element} />}{' '}
              {catchBadgeTags(entry).map((badge) => (
                <Tag
                  key={badge.text}
                  kind="badge"
                  {...(badge.entry === null ? {} : { entry: badge.entry })}
                >
                  {badge.text}
                </Tag>
              ))}
              {entry.talent !== undefined && (
                <span class="catch-talent">
                  <TalentChip talent={entry.talent} />
                </span>
              )}
              {entry.outcome === 'duplicate' && (
                <span class="muted catch-answered">{answered ?? 'Answered.'}</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

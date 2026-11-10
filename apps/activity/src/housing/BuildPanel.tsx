import type { HousePay, HouseView, OwnHouseView } from '@creatures/game';
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { PlaceRow } from '../valley/PlacesList';
import { Alert } from '../ui/Alert';
import { ShortOfLine } from '../ui/CountBadge';
import { GameIcon } from '../ui/GameIcon';
import { PipRow } from '../ui/PipRow';
import { RecipeCard } from '../ui/RecipeCard';
import { lockedParts, partCards, type LockedPart, type PartCard } from './build-view';

export interface BuildPanelProps {
  house: HouseView;
  own: OwnHouseView;
  /** A request is running: every button waits. */
  busy: boolean;
  /** A refusal of the last payment, in words, or null. */
  error: string | null;
  /** "Pay in" was pressed for this part with this payment (what the player holds of each line, up to the price). */
  onPay: (partId: string, pay: HousePay) => void;
  /** The part whose page is open, or null for the list of parts (the host keeps it, so its Back and title follow). */
  open?: string | null | undefined;
  /** A part's row was tapped (its id), or the list asked for (null). */
  onOpen?: ((partId: string | null) => void) | undefined;
  /** A small picture of the part (the scene draws it): `row` for the list, `page` for the part's own page; absent: a glyph. */
  renderPreview?: ((partId: string, size: 'row' | 'page') => ComponentChildren) | undefined;
}

/** The pips of a part's price: one per line, lit when paid. */
function PartPips({ total, paid, name }: { total: number; paid: number; name: string }) {
  return (
    <PipRow
      count={total}
      lit={paid}
      label={`${name}: ${String(paid)} of ${String(total)} lines paid`}
    />
  );
}

/**
 * One part's page: its picture, its pips (a first payment lights one), what is still owed (have / need) and "Pay in", which
 * takes what the player holds up to the price. With nothing to pay in the button gives way to what the player has against
 * what the first line costs.
 */
function PartPage({
  card,
  busy,
  preview,
  onPay,
}: {
  card: PartCard;
  busy: boolean;
  preview: ComponentChildren;
  onPay: () => void;
}) {
  return (
    <section class="hp-part" aria-label={card.name}>
      <p class="hp-part-line">{card.line}</p>
      {preview}
      <PartPips total={card.lines.total} paid={card.lines.paid} name={card.name} />
      {card.short === null ? (
        <RecipeCard
          inputs={card.inputs}
          outputs={[]}
          actionLabel="Pay in"
          busy={busy}
          onStart={onPay}
        />
      ) : (
        <>
          <RecipeCard
            inputs={card.inputs}
            outputs={[]}
            actionLabel="Pay in"
            compact
            onStart={onPay}
          />
          <p class="reason" role="status">
            <ShortOfLine short={card.short} />
          </p>
        </>
      )}
    </section>
  );
}

/** A part that cannot be built yet, as a goal: its picture, what it needs first (in place of "Pay in"), and its price. */
function LockedPage({ part, preview }: { part: LockedPart; preview: ComponentChildren }) {
  return (
    <section class="hp-part" aria-label={part.name}>
      <p class="hp-part-line">{part.line}</p>
      {preview}
      <PartPips total={part.lines} paid={0} name={part.name} />
      <RecipeCard
        inputs={part.inputs}
        outputs={[]}
        actionLabel="Pay in"
        compact
        onStart={() => undefined}
      />
      <p class="reason" role="status">
        {part.reason}
      </p>
    </section>
  );
}

/**
 * The parts of the house as rows (a small picture, the name, a pip per line of the price, lit when paid): a tap opens the
 * part's page with what is still owed on it and "Pay in" (what the player holds of every line, up to the price). The parts
 * that cannot be built yet follow, muted, and open a page too: their picture, their price and what they need first. Data in,
 * callbacks out: it fetches nothing. The open part is the host's (`open`, `onOpen`); without a host it keeps its own.
 */
export function BuildPanel({
  house,
  own,
  busy,
  error,
  onPay,
  open,
  onOpen,
  renderPreview,
}: BuildPanelProps) {
  const [own_open, setOwnOpen] = useState<string | null>(null);
  const shown = open === undefined ? own_open : open;
  const pick = onOpen ?? setOwnOpen;
  const cards = partCards(own);
  const locked = lockedParts(house, own);
  const card = shown === null ? undefined : cards.find((c) => c.id === shown);
  const lockedCard = shown === null ? undefined : locked.find((c) => c.id === shown);
  const picture = (id: string, size: 'row' | 'page'): ComponentChildren =>
    renderPreview?.(id, size) ?? <GameIcon icon={{ kind: 'glyph', id: 'house-nav' }} scale={3} />;
  return (
    <div class="hp-panel hp-build">
      {error !== null && <Alert level="alert">{error}</Alert>}
      {card !== undefined ? (
        <PartPage
          card={card}
          busy={busy}
          preview={picture(card.id, 'page')}
          onPay={() => {
            onPay(card.id, card.pay);
          }}
        />
      ) : lockedCard !== undefined ? (
        <LockedPage part={lockedCard} preview={picture(lockedCard.id, 'page')} />
      ) : (
        <>
          <ul class="vy-rows hp-parts" aria-label="Parts to build">
            {cards.map((part) => (
              <PlaceRow
                key={part.id}
                picture={picture(part.id, 'row')}
                name={part.name}
                aside={
                  <PartPips total={part.lines.total} paid={part.lines.paid} name={part.name} />
                }
                label={`${part.name}, ${String(part.lines.paid)} of ${String(part.lines.total)} lines paid`}
                onClick={() => {
                  pick(part.id);
                }}
              />
            ))}
            {locked.map((part) => (
              <PlaceRow
                key={part.id}
                muted
                picture={picture(part.id, 'row')}
                name={part.name}
                line={part.reason}
                onClick={() => {
                  pick(part.id);
                }}
              />
            ))}
          </ul>
          {cards.length === 0 && locked.length === 0 && (
            <p class="hp-empty" role="status">
              Everything is built.
            </p>
          )}
        </>
      )}
    </div>
  );
}

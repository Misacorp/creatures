import type { HousePay, HouseView, OwnHouseView } from '@creatures/game';
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { PlaceRow } from '../valley/PlacesList';
import { Accordion } from '../ui/Accordion';
import { Alert } from '../ui/Alert';
import { CountBadge } from '../ui/CountBadge';
import { GameIcon } from '../ui/GameIcon';
import { PipRow } from '../ui/PipRow';
import { RecipeCard } from '../ui/RecipeCard';
import { Switch } from '../ui/Switch';
import { lockedParts, partCards, type PartCard } from './build-view';
import { HoldingsStrip } from './HoldingsStrip';

export interface BuildPanelProps {
  house: HouseView;
  own: OwnHouseView;
  /** A request is running: every button waits. */
  busy: boolean;
  /** A refusal of the last payment, in words, or null. */
  error: string | null;
  /** "Pay in" was pressed for this part with this payment (what the player holds of each line that is on). */
  onPay: (partId: string, pay: HousePay) => void;
  /** The part whose page is open, or null for the list of parts (the host keeps it, so its Back and title follow). */
  open?: string | null | undefined;
  /** A part's row was tapped (its id), or the list asked for (null). */
  onOpen?: ((partId: string | null) => void) | undefined;
  /** A small picture of the part (the scene draws it): `row` for the list, `page` for the part's own page; absent: a glyph. */
  renderPreview?: ((partId: string, size: 'row' | 'page') => ComponentChildren) | undefined;
}

/** One part's page: its picture, what is still owed (have / need), "Pay in", and a fold to hold a line back. */
function PartPage({
  card,
  busy,
  preview,
  onToggle,
  onPay,
  own,
}: {
  card: PartCard;
  busy: boolean;
  preview: ComponentChildren;
  onToggle: (key: string, on: boolean) => void;
  onPay: () => void;
  own: OwnHouseView;
}) {
  return (
    <section class="hp-part" aria-label={card.name}>
      <p class="hp-part-line">{card.line}</p>
      {preview}
      <HoldingsStrip own={own} />
      <RecipeCard
        inputs={card.inputs}
        outputs={[]}
        actionLabel="Pay in"
        disabledReason={card.reason}
        busy={busy}
        onStart={onPay}
      />
      {card.switches.length > 1 && (
        <Accordion title="Hold something back" variant="compact" headingLevel={4}>
          <ul class="hp-switches">
            {card.switches.map((line) => (
              <li key={line.key}>
                <Switch
                  on={line.on}
                  label=""
                  spoken={`Pay ${line.item.label ?? line.key}`}
                  onChange={(on) => {
                    onToggle(line.key, on);
                  }}
                >
                  <CountBadge size="inline" {...line.item} />
                </Switch>
              </li>
            ))}
          </ul>
        </Accordion>
      )}
    </section>
  );
}

/**
 * The parts of the house as rows (a small picture, the name, a pip per line of the price, lit when paid): a tap opens the
 * part's page with what is still owed on it and "Pay in" (what the player holds of every line, minus the lines switched off).
 * The parts that cannot be built yet follow, muted, with their reason. Data in, callbacks out: it fetches nothing. The open
 * part is the host's (`open`, `onOpen`); without a host it keeps its own.
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
  const [off, setOff] = useState<Record<string, ReadonlySet<string>>>({});
  const [own_open, setOwnOpen] = useState<string | null>(null);
  const shown = open === undefined ? own_open : open;
  const pick = onOpen ?? setOwnOpen;
  const cards = partCards(own, off);
  const locked = lockedParts(house, own);
  const card = shown === null ? undefined : cards.find((c) => c.id === shown);
  return (
    <div class="hp-panel hp-build">
      {error !== null && <Alert level="alert">{error}</Alert>}
      {card !== undefined ? (
        <PartPage
          card={card}
          own={own}
          busy={busy}
          preview={renderPreview?.(card.id, 'page')}
          onToggle={(key, on) => {
            setOff((prev) => {
              const next = new Set(prev[card.id] ?? []);
              if (on) next.delete(key);
              else next.add(key);
              return { ...prev, [card.id]: next };
            });
          }}
          onPay={() => {
            onPay(card.id, card.pay);
          }}
        />
      ) : (
        <>
          <ul class="vy-rows hp-parts" aria-label="Parts to build">
            {cards.map((part) => (
              <PlaceRow
                key={part.id}
                picture={
                  renderPreview?.(part.id, 'row') ?? (
                    <GameIcon icon={{ kind: 'glyph', id: 'house-nav' }} scale={3} />
                  )
                }
                name={part.name}
                aside={
                  <PipRow
                    count={part.lines.total}
                    lit={part.lines.paid}
                    label={`${String(part.lines.paid)} / ${String(part.lines.total)} lines paid`}
                  />
                }
                label={`${part.name}, ${String(part.lines.paid)} / ${String(part.lines.total)} lines paid`}
                onClick={() => {
                  pick(part.id);
                }}
              />
            ))}
            {locked.map((part) => (
              <li key={part.id} class="vy-row vy-row-muted hp-static">
                <GameIcon icon={{ kind: 'glyph', id: 'house-nav' }} scale={3} />
                <span class="vy-row-name pix">{part.name}</span>
                <span class="vy-row-line">{part.reason}</span>
              </li>
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

import type { HousePay, HouseView, OwnHouseView } from '@creatures/game';
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { Accordion } from '../ui/Accordion';
import { Alert } from '../ui/Alert';
import { CountBadge } from '../ui/CountBadge';
import { PipRow } from '../ui/PipRow';
import { RecipeCard } from '../ui/RecipeCard';
import { Switch } from '../ui/Switch';
import { GameIcon } from '../ui/GameIcon';
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
  /** A small picture of the house with the part built (the scene draws it); absent: none. */
  renderPreview?: ((partId: string) => ComponentChildren) | undefined;
}

function PartSection({
  card,
  busy,
  preview,
  onToggle,
  onPay,
}: {
  card: PartCard;
  busy: boolean;
  preview: ComponentChildren;
  onToggle: (key: string, on: boolean) => void;
  onPay: () => void;
}) {
  return (
    <section class="hp-part" aria-label={card.name}>
      <h3 class="hp-part-name pix">{card.name}</h3>
      <p class="hp-part-line">{card.line}</p>
      {card.started && (
        <p class="hp-part-progress">
          <PipRow
            count={card.lines.total}
            lit={card.lines.paid}
            label={`${String(card.lines.paid)} of ${String(card.lines.total)} lines paid`}
          />
        </p>
      )}
      {preview}
      <RecipeCard
        inputs={card.inputs}
        outputs={[card.output]}
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
 * The parts of the house as recipes: what is still owed on each buildable part (have / need), "Pay in" with what the
 * player holds of every line, a switch per line to hold one back, and the parts that cannot be built yet after them,
 * muted, with their reason. Data in, callbacks out: it fetches nothing.
 */
export function BuildPanel({ house, own, busy, error, onPay, renderPreview }: BuildPanelProps) {
  const [off, setOff] = useState<Record<string, ReadonlySet<string>>>({});
  const cards = partCards(own, off);
  const locked = lockedParts(house, own);
  return (
    <div class="hp-panel hp-build">
      {error !== null && <Alert level="alert">{error}</Alert>}
      <HoldingsStrip own={own} />
      {cards.map((card) => (
        <PartSection
          key={card.id}
          card={card}
          busy={busy}
          preview={renderPreview?.(card.id)}
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
      ))}
      {cards.length === 0 && locked.length === 0 && (
        <p class="hp-empty" role="status">
          Everything is built.
        </p>
      )}
      {locked.length > 0 && (
        <ul class="vy-rows hp-locked" aria-label="Not yet">
          {locked.map((part) => (
            <li key={part.id} class="vy-row vy-row-muted hp-static">
              <GameIcon icon={{ kind: 'glyph', id: 'house-nav' }} scale={3} />
              <span class="vy-row-name pix">{part.name}</span>
              <span class="vy-row-line">{part.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

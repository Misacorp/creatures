import { Tag } from './ui/Tag';
import { useState } from 'preact/hooks';
import type { Creature } from './api';
import { Catalogue } from './Catalogue';
import { destinationCards } from './destination-view';
import type { SendRequest } from './expedition-api';
import type { DestinationsView, ExpeditionLength, Slots, SupplyPick } from './expedition-types';
import { ChoiceMark } from './ExpeditionIcons';
import { ExplorerPicker } from './ExplorerPicker';
import { getSpecies } from './game';
import { HaulStrip } from './HaulStrip';
import { LengthPicker } from './LengthPicker';
import { clampLength, defaultExplorer, explorerOptions, sendBlocker } from './send-view';
import { SupplyPicker } from './SupplyPicker';
import { TreatBox } from './TreatBox';
import { kitChoice, lengthLabel, supplyName } from './trip-view';

/**
 * The send flow: pick a place from the catalogue, who goes, how long and (optionally) supplies, then
 * see the expected haul and send. Everything is shown at once, in that order, so the reason a Send is
 * disabled is always visible. A trip is always free (supplies cannot be bought, they come from stock)
 * and says so. The server does the work; this only collects the choice.
 */
export function SendTrip({
  creatures,
  slots,
  stock,
  bait,
  busy,
  view,
  viewFailed,
  timezone,
  onRetry,
  onSend,
  onOpenWorkshop,
}: {
  creatures: readonly Creature[];
  slots: Slots;
  stock: Readonly<Record<string, number>>;
  /** The player's Bait: a treat costs some of it. */
  bait: number;
  busy: boolean;
  /** The destinations the server listed; null while loading or when it failed. */
  view: DestinationsView | null;
  viewFailed: boolean;
  timezone: string | null;
  onRetry: () => void;
  /** Sends the trip; resolves true when it started (the supplies are then put down). */
  onSend: (request: SendRequest) => Promise<boolean>;
  /** Opens the Workshop, where supplies are crafted. */
  onOpenWorkshop?: () => void;
}) {
  const [placeIndex, setPlaceIndex] = useState(0);
  const [creatureId, setCreatureId] = useState<string | null>(null);
  const [length, setLength] = useState<ExpeditionLength>('long');
  const [picks, setPicks] = useState<SupplyPick[]>([]);
  // A treat for this one trip (never kept for the next: it costs Bait each time).
  const [treat, setTreat] = useState(false);

  if (view === null) {
    return viewFailed ? (
      <section class="send">
        <p class="error" role="alert">
          The places could not be loaded.
        </p>
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      </section>
    ) : (
      <p class="muted">Looking at the map...</p>
    );
  }

  // The cards depend on who goes (its stars and rank gate) and who can go depends on the place's rank
  // gate, so the place is looked up first without an explorer.
  const places = destinationCards(view, undefined, timezone);
  const index = Math.min(placeIndex, Math.max(0, places.length - 1));
  const options = explorerOptions(creatures, places[index], view);
  const explorer = defaultExplorer(options, creatureId);
  const cards = destinationCards(view, explorer?.creature, timezone);
  const place = cards[index];
  const rank = explorer?.rank ?? 1;
  const duration = clampLength(length, rank);
  const species = explorer === undefined ? undefined : getSpecies(explorer.creature.species);
  const shardElement = place?.element ?? species?.element ?? null;

  const blocker = sendBlocker({
    slots,
    explorer,
    place,
    length: duration,
    picks,
    stock,
  });
  const choice = kitChoice(picks);
  const names = picks.map((p) => supplyName(p.id));
  const treatCost = explorer?.creature.treatCost ?? 0;
  // A treat the Bait no longer covers (the explorer changed, or Bait was spent) is not packed.
  const packing = treat && explorer !== undefined && bait >= treatCost;

  return (
    <section class="send" aria-labelledby="send-title">
      <h3 id="send-title">Send an explorer</h3>

      <h4 class="step">
        <span class="step-n">1</span> Where to
      </h4>
      <Catalogue cards={cards} index={index} onIndex={setPlaceIndex} />

      <h4 class="step">
        <span class="step-n">2</span> Who goes
      </h4>
      <ExplorerPicker
        name="send-explorer"
        options={options}
        value={explorer?.creature.id ?? null}
        onChange={setCreatureId}
      />

      <h4 class="step">
        <span class="step-n">3</span> How long
      </h4>
      <LengthPicker name="send-length" rank={rank} value={duration} onChange={setLength} />

      <h4 class="step">
        <span class="step-n">4</span> Supplies
      </h4>
      <SupplyPicker
        picks={picks}
        stock={stock}
        onChange={setPicks}
        {...(onOpenWorkshop === undefined ? {} : { onOpenWorkshop })}
      />

      <div class="send-summary">
        {explorer !== undefined && (
          <TreatBox
            cost={treatCost}
            bait={bait}
            checked={packing}
            disabled={busy}
            who={explorer.name}
            onChange={setTreat}
          />
        )}
        <p class="cost-line" aria-live="polite">
          {packing ? (
            <>
              <Tag kind="badge">Treat</Tag>{' '}
              {`This trip costs ${String(treatCost)} Bait for the treat`}
              {picks.length === 0 ? '.' : `, and takes ${names.join(' and ')} from your stock.`}
            </>
          ) : (
            <>
              <Tag kind="badge" tone="free">
                Free
              </Tag>{' '}
              {picks.length === 0
                ? 'This trip costs nothing.'
                : `Taking ${names.join(' and ')} from your stock.`}
            </>
          )}
        </p>
        {choice !== 'none' && (
          <p class="choice-line">
            <ChoiceMark choice={choice} />
          </p>
        )}
        <HaulStrip length={duration} element={shardElement} kit={picks.map((p) => p.id)} />
        {blocker !== null && (
          <p class="reason" role="status">
            {blocker}
          </p>
        )}
        <button
          type="button"
          class="primary send-button"
          disabled={busy || blocker !== null || explorer === undefined || place === undefined}
          onClick={() => {
            if (explorer === undefined || place === undefined) return;
            void onSend({
              creatureId: explorer.creature.id,
              destination: place.id,
              duration,
              supplies: picks,
              ...(packing ? { treat: true } : {}),
            }).then((started) => {
              if (started) {
                setPicks([]);
                setTreat(false);
              }
            });
          }}
        >
          {explorer === undefined || place === undefined
            ? 'Send'
            : `Send ${explorer.name} to ${place.name} for ${lengthLabel(duration)}`}
        </button>
      </div>
    </section>
  );
}

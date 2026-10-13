import { useState } from 'preact/hooks';
import type { Creature } from './api';
import { Catalogue } from './Catalogue';
import { destinationCards } from './destination-view';
import type { SendRequest } from './expedition-api';
import type { DestinationsView, ExpeditionLength, Slots, SupplyPick } from './expedition-types';
import { ChoiceMark } from './ExpeditionIcons';
import { ExplorerPicker } from './ExplorerPicker';
import { getSpecies } from './game';
import { GlossaryTag } from './Glossary';
import { LengthPicker } from './LengthPicker';
import { clampLength, defaultExplorer, explorerOptions, sendBlocker } from './send-view';
import { SupplyPicker } from './SupplyPicker';
import { kitChoice, kitCost, lengthLabel, supplyName } from './trip-view';

/**
 * The send flow: pick a place from the catalogue, who goes, how long and (optionally) supplies, then
 * send. Everything is shown at once, in that order, so the cost and the reason a Send is disabled are
 * always visible. A trip without supplies is free and says so. The server does the spending; this only
 * collects the choice.
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
}: {
  creatures: readonly Creature[];
  slots: Slots;
  stock: Readonly<Record<string, number>>;
  bait: number;
  busy: boolean;
  /** The destinations the server listed; null while loading or when it failed. */
  view: DestinationsView | null;
  viewFailed: boolean;
  timezone: string | null;
  onRetry: () => void;
  /** Sends the trip; resolves true when it started (the supplies are then put down). */
  onSend: (request: SendRequest) => Promise<boolean>;
}) {
  const [placeIndex, setPlaceIndex] = useState(0);
  const [creatureId, setCreatureId] = useState<string | null>(null);
  const [length, setLength] = useState<ExpeditionLength>('long');
  const [picks, setPicks] = useState<SupplyPick[]>([]);

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
    bait,
  });
  const cost = kitCost(picks);
  const choice = kitChoice(picks);
  const names = picks.map((p) => supplyName(p.id));

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
      <LengthPicker
        name="send-length"
        rank={rank}
        value={duration}
        element={shardElement}
        onChange={setLength}
      />

      <h4 class="step">
        <span class="step-n">4</span> Supplies
      </h4>
      <SupplyPicker picks={picks} stock={stock} bait={bait} onChange={setPicks} />

      <div class="send-summary">
        <p class="cost-line" aria-live="polite">
          {cost === 0 ? (
            <>
              <span class="badge free">Free</span>{' '}
              {picks.length === 0
                ? 'This trip costs nothing.'
                : `Only supplies you already have: ${names.join(' and ')}.`}
            </>
          ) : (
            <>
              <strong>{cost}</strong> <GlossaryTag entry="bait">Bait</GlossaryTag> for{' '}
              {names.join(' and ')}
            </>
          )}
        </p>
        {choice !== 'none' && (
          <p class="choice-line">
            <ChoiceMark choice={choice} />
          </p>
        )}
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
            }).then((started) => {
              if (started) setPicks([]);
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

import { tripMs } from '@creatures/game';
import { useState } from 'preact/hooks';
import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { Sprite } from './sprites/Sprite';
import { TripSummary } from './TripSummary';
import type { Forecast } from './weather-types';
import type { Creature } from './api';
import { Catalogue } from './Catalogue';
import type { TripContext } from './boost-view';
import { getSpecies } from './game';
import { destinationCards } from './destination-view';
import type { SendRequest } from './expedition-api';
import type { DestinationsView, ExpeditionLength, Slots, SupplyPick } from './expedition-types';
import { ExplorerPicker } from './ExplorerPicker';
import { HaulStrip } from './HaulStrip';
import { LengthPicker } from './LengthPicker';
import { clampLength, defaultExplorer, explorerOptions, sendBlocker } from './send-view';
import { SupplyPicker } from './SupplyPicker';
import { TreatBox } from './TreatBox';
import { baitCount } from './count-items';
import { CountBadge } from './ui/CountBadge';
import { lengthLabel } from './trip-view';

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
  forecast = null,
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
  /** The valley sky; today's Boon and Omen show in the summary when they touch trips. */
  forecast?: Forecast | null;
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
  const shardElement = place?.element ?? null;

  const blocker = sendBlocker({
    slots,
    explorer,
    place,
    length: duration,
    picks,
    stock,
  });
  // What the haul strip works the boost brackets out for (recomputed on every change).
  const trip: TripContext = {
    length: duration,
    place: place?.id ?? null,
    role: explorer === undefined ? null : (getSpecies(explorer.creature.species)?.role ?? null),
    stars: explorer?.stars ?? 0,
    twist: place !== undefined && view.special.destination === place.id ? view.special.twist : null,
  };
  // The time the summary says the trip would be back, if sent right now.
  const now = Date.now();
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

      <div class="step-row">
        <h4 class="step">
          <span class="step-n">4</span> Supplies <GlossaryTag entry="supplies" look="help" />
        </h4>
        {onOpenWorkshop !== undefined && (
          <button
            type="button"
            class="step-craft"
            aria-label="Craft supplies in the Workshop"
            onClick={onOpenWorkshop}
          >
            <Sprite sprite={glyphOrUnknown('anvil')} scale={2} />
            Craft
          </button>
        )}
      </div>
      <SupplyPicker picks={picks} stock={stock} onChange={setPicks} />

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
        <HaulStrip
          length={duration}
          element={shardElement}
          kit={picks.map((p) => p.id)}
          trip={trip}
          rank={explorer === undefined ? null : rank}
          summary={
            <TripSummary
              duration={lengthLabel(duration)}
              place={place?.name ?? null}
              explorer={explorer?.name ?? null}
              supplies={picks.map((p) => p.id)}
              treat={packing}
              now={now}
              endsAt={now + tripMs(duration, rank)}
              timezone={timezone}
              boon={forecast?.today?.boon ?? null}
              omen={forecast?.today?.omen ?? null}
              twist={place?.twist ?? null}
            />
          }
        />
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
          <span>
            {explorer === undefined || place === undefined
              ? 'Send'
              : `Send ${explorer.name} to ${place.name} for ${lengthLabel(duration)}`}
          </span>
          {/* A packed treat's Bait, on the button that spends it (the trip itself is free). */}
          {packing && <CountBadge {...baitCount(treatCost)} label="Bait" />}
        </button>
      </div>
    </section>
  );
}

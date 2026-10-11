import { expeditionCost, recallCatches } from '@creatures/game';
import { useState } from 'preact/hooks';
import type { ClaimResult, Creature, DurationId, Expedition, GameState, SuppliesId } from './api';
import {
  DURATION_OPTIONS,
  SUPPLIES_OPTIONS,
  catchBadges,
  creatureName,
  durationLabel,
  formatCountdown,
  speciesName,
} from './game';
import { useNow } from './hooks';

export interface SendRequest {
  creatureId: string;
  duration: DurationId;
  supplies: SuppliesId;
}

interface Props {
  state: GameState;
  /** Server clock minus local clock, in ms. */
  offset: number;
  busy: boolean;
  reveal: ClaimResult | null;
  onSend: (request: SendRequest) => void;
  onClaim: (expedition: Expedition) => void;
  onDismissReveal: () => void;
}

function SendForm({
  slot,
  available,
  bait,
  busy,
  onSend,
}: {
  slot: number;
  available: Creature[];
  bait: number;
  busy: boolean;
  onSend: Props['onSend'];
}) {
  const [creatureId, setCreatureId] = useState('');
  const [duration, setDuration] = useState<DurationId>('short');
  const [supplies, setSupplies] = useState<SuppliesId>('basic');
  const explorer = available.find((c) => c.id === creatureId) ?? available[0];
  const cost = expeditionCost(duration, supplies);
  const prefix = `slot-${String(slot)}`;

  if (explorer === undefined) {
    return <p class="muted">No creature is free to send.</p>;
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSend({ creatureId: explorer.id, duration, supplies });
      }}
    >
      <label for={`${prefix}-creature`}>Explorer</label>
      <select
        id={`${prefix}-creature`}
        value={explorer.id}
        onChange={(event) => {
          setCreatureId(event.currentTarget.value);
        }}
      >
        {available.map((c) => (
          <option key={c.id} value={c.id}>
            {creatureName(c)} (level {c.level})
          </option>
        ))}
      </select>
      <label for={`${prefix}-duration`}>Duration</label>
      <select
        id={`${prefix}-duration`}
        value={duration}
        onChange={(event) => {
          setDuration(event.currentTarget.value as DurationId);
        }}
      >
        {DURATION_OPTIONS.map((d) => (
          <option key={d.id} value={d.id}>
            {d.label}
          </option>
        ))}
      </select>
      <label for={`${prefix}-supplies`}>Supplies</label>
      <select
        id={`${prefix}-supplies`}
        value={supplies}
        onChange={(event) => {
          setSupplies(event.currentTarget.value as SuppliesId);
        }}
      >
        {SUPPLIES_OPTIONS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      <p>
        Total: <strong>{cost} Bait</strong>
        {cost > bait && <span class="error"> Not enough Bait</span>}
      </p>
      <button type="submit" class="primary" disabled={busy || cost > bait}>
        Send
      </button>
    </form>
  );
}

function ActiveSlot({
  expedition,
  explorer,
  serverNow,
  busy,
  onClaim,
}: {
  expedition: Expedition;
  explorer: Creature | undefined;
  serverNow: number;
  busy: boolean;
  onClaim: Props['onClaim'];
}) {
  const remaining = expedition.endsAt - serverNow;
  const finished = remaining <= 0;
  const keeps = recallCatches(expedition.rolls, expedition.startedAt, expedition.endsAt, serverNow);
  return (
    <>
      <p>
        <strong>{explorer === undefined ? 'Explorer' : creatureName(explorer)}</strong> is away
      </p>
      <p class="muted">
        {durationLabel(expedition.duration)}, {expedition.supplies} supplies
      </p>
      <p aria-live="off">{finished ? 'Finished' : `Back in ${formatCountdown(remaining)}`}</p>
      <button
        type="button"
        class={finished ? 'primary' : ''}
        disabled={busy}
        onClick={() => {
          onClaim(expedition);
        }}
      >
        {finished
          ? 'Claim'
          : `Recall (keeps ${String(keeps)} ${keeps === 1 ? 'catch' : 'catches'})`}
      </button>
    </>
  );
}

function Reveal({ result, onDismiss }: { result: ClaimResult; onDismiss: () => void }) {
  return (
    <section class="reveal" aria-live="polite" aria-labelledby="reveal-heading">
      <h3 id="reveal-heading">{result.recalled ? 'Expedition recalled' : 'Expedition complete'}</h3>
      {result.catches.length === 0 ? (
        <p>Nothing came back this time.</p>
      ) : (
        <ul>
          {result.catches.map((entry, index) => (
            <li key={index}>
              <strong>{speciesName(entry.species)}</strong>{' '}
              {catchBadges(entry).map((badge) => (
                <span key={badge} class="badge">
                  {badge}
                </span>
              ))}
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={onDismiss}>
        Close
      </button>
    </section>
  );
}

export function Expeditions({
  state,
  offset,
  busy,
  reveal,
  onSend,
  onClaim,
  onDismissReveal,
}: Props) {
  const active = state.expeditions.filter((e) => e.status === 'active');
  const now = useNow(active.length > 0);
  const available = state.creatures.filter((c) => !c.away);
  const emptySlots = Math.max(0, state.slots.total - active.length);
  const panels: (Expedition | null)[] = [
    ...active,
    ...Array.from({ length: emptySlots }, () => null),
  ];

  return (
    <>
      {reveal !== null && <Reveal result={reveal} onDismiss={onDismissReveal} />}
      <ul class="cards">
        {panels.map((panel, index) => (
          <li key={index} class="card-item slot">
            <h3>Slot {index + 1}</h3>
            {panel === null ? (
              <SendForm
                slot={index + 1}
                available={available}
                bait={state.balances.bait}
                busy={busy}
                onSend={onSend}
              />
            ) : (
              <ActiveSlot
                expedition={panel}
                explorer={state.creatures.find((c) => c.id === panel.creatureId)}
                serverNow={now + offset}
                busy={busy}
                onClaim={onClaim}
              />
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

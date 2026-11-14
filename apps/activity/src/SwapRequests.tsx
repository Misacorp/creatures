import { useState } from 'preact/hooks';
import { incomingText, type GridV2 } from './raid-board-v2';
import type { SettledSwapV2, SwapV2 } from './raid-v2-api';
import { markSwapSeen, seenSwapIds, settledText, unseenSwaps } from './swap-outcome';
import { Alert } from './ui/Alert';

/**
 * How the swap requests you asked went, once each (combat v2, B4): "Mira accepted: Emberkit and Lanternfin swapped places." A note
 * closes with the Alert's X and is not shown again (the screen remembers the ids). Nothing is drawn when there is nothing new.
 */
export function SwapOutcomes({
  settled,
  grid,
}: {
  settled: readonly SettledSwapV2[];
  grid: GridV2;
}) {
  const [seen, setSeen] = useState(() => seenSwapIds());
  const unseen = unseenSwaps(settled, seen);
  if (unseen.length === 0) return null;
  return (
    <section class="swap-requests" aria-label="Swap answers">
      {unseen.map((request) => (
        <Alert
          key={request.id}
          level={request.status === 'accepted' ? 'success' : 'info'}
          onDismiss={() => {
            markSwapSeen(request.id);
            setSeen((now) => new Set(now).add(request.id));
          }}
        >
          {settledText(request, grid)}
        </Alert>
      ))}
    </section>
  );
}

/**
 * The swap requests other players have asked of you (combat v2, R19), at the top of the Raid tab, where Home's notice row leads:
 * one note per request that says who asks and which creatures ("Mira asks to swap Lanternfin for Emberkit."), with Accept and
 * Decline. An accepted request moves both creatures at once; the server refuses one whose creatures moved since (the screen then
 * says so and reloads). Names are the players' and creatures' own, drawn as text only. Nothing is drawn without a request.
 */
export function SwapRequests({
  requests,
  grid,
  busy,
  onAnswer,
}: {
  requests: readonly SwapV2[];
  grid: GridV2;
  /** An answer is on its way: the buttons are off until it lands. */
  busy: boolean;
  onAnswer: (id: string, answer: 'accept' | 'decline') => void;
}) {
  if (requests.length === 0) return null;
  return (
    <section class="swap-requests" aria-label="Swap requests">
      {requests.map((request) => (
        <Alert key={request.id} level="info" layout="stacked">
          <span class="swap-text">{incomingText(request, grid)}</span>
          <span class="swap-buttons">
            <button
              type="button"
              class="primary"
              disabled={busy}
              onClick={() => {
                onAnswer(request.id, 'accept');
              }}
            >
              Accept
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                onAnswer(request.id, 'decline');
              }}
            >
              Decline
            </button>
          </span>
        </Alert>
      ))}
    </section>
  );
}

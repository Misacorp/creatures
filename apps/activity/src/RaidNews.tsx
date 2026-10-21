import { useRef, useState } from 'preact/hooks';
import { errorText } from './game';
import {
  fetchRaidChannel,
  raidNewsCard,
  setRaidChannel,
  type RaidChannelAction,
  type RaidChannelState,
} from './raid-channel';
import { useLoaded } from './use-loaded';
import { Alert } from './ui/Alert';

/**
 * Lets a server admin choose the channel the bot posts raid news to. Asks the server once when the
 * Raid tab opens; stays out of the way (renders nothing) for everyone else and when the check fails.
 */
export function RaidNews() {
  const loaded = useLoaded(fetchRaidChannel, []);
  // What the admin's own change answered replaces what the first read said.
  const [changed, setChanged] = useState<RaidChannelState | null>(null);
  const state = changed ?? loaded.value;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const card = state === null ? null : raidNewsCard(state);
  if (card === null) return null;

  function change(action: RaidChannelAction): void {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setRaidChannel(action).then(
      (answer) => {
        inFlight.current = false;
        setBusy(false);
        setChanged(answer);
      },
      (err: unknown) => {
        inFlight.current = false;
        setBusy(false);
        setError(errorText(err));
      },
    );
  }

  return (
    <section class="raid-section" aria-labelledby="raid-news-heading">
      <h3 id="raid-news-heading">{card.title}</h3>
      <p>
        <strong>{card.status}</strong>
      </p>
      <p class="button-row">
        {card.buttons.map((button) => (
          <button
            key={button.action}
            type="button"
            disabled={busy}
            onClick={() => {
              change(button.action);
            }}
          >
            {button.label}
          </button>
        ))}
      </p>
      <p class="muted">{card.help}</p>
      {error !== null && <Alert level="alert">{error}</Alert>}
    </section>
  );
}

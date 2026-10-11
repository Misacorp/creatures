import { useEffect, useRef, useState } from 'preact/hooks';
import { errorText } from './game';
import {
  fetchRaidChannel,
  raidNewsCard,
  setRaidChannel,
  type RaidChannelAction,
  type RaidChannelState,
} from './raid-channel';

/**
 * Lets a server admin choose the channel the bot posts raid news to. Asks the server once when the
 * Raid tab opens; stays out of the way (renders nothing) for everyone else and when the check fails.
 */
export function RaidNews() {
  const [state, setState] = useState<RaidChannelState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetchRaidChannel().then(
      (answer) => {
        if (!cancelled) setState(answer);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, []);

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
        setState(answer);
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
      {error !== null && (
        <p class="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

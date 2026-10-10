import { DiscordSDK } from '@discord/embedded-app-sdk';
import { useEffect, useState } from 'preact/hooks';
import {
  ApiError,
  createSession,
  fetchConfig,
  fetchHealth,
  fetchLedger,
  fetchMe,
  type AppConfig,
  type LedgerEntry,
  type Me,
} from './api';
import { describeEntry } from './ledger-text';

type Status<T> =
  { state: 'loading' } | { state: 'error'; message: string } | { state: 'ok'; value: T };

interface Boot {
  config: AppConfig;
  /** Null when running outside Discord (no sign-in possible). */
  me: Me | null;
  recent: LedgerEntry[];
}

// Discord adds frame_id (among others) to the URL when it launches an Activity.
const insideDiscord = new URLSearchParams(window.location.search).has('frame_id');

async function boot(): Promise<Boot> {
  const config = await fetchConfig();
  if (!insideDiscord) {
    return { config, me: null, recent: [] };
  }
  const sdk = new DiscordSDK(config.discordClientId);
  await sdk.ready();
  const { code } = await sdk.commands.authorize({
    client_id: config.discordClientId,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify'],
  });
  // The server decides the guild and verifies the player; the client only passes the code and the
  // instance id.
  const session = await createSession(code, sdk.instanceId);
  // Discord requires authenticate() with the access token to unlock the rest of the SDK.
  await sdk.commands.authenticate({ access_token: session.accessToken });
  // /api/me runs the leet sync first, so fetch the history after it.
  const me = await fetchMe();
  // The balance matters more than the list: a failing history request must not block sign-in.
  const recent = await fetchLedger(10).catch((): LedgerEntry[] => []);
  return { config, me, recent };
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError && err.code === 'guild_required') {
    return 'Launch Leet Creatures from a server channel, not a DM.';
  }
  return err instanceof Error ? err.message : String(err);
}

function useAsync<T>(load: () => Promise<T>): Status<T> {
  const [status, setStatus] = useState<Status<T>>({ state: 'loading' });
  useEffect(() => {
    let cancelled = false;
    load().then(
      (value) => {
        if (!cancelled) setStatus({ state: 'ok', value });
      },
      (err: unknown) => {
        if (!cancelled) setStatus({ state: 'error', message: errorMessage(err) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return status;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div class="row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function App() {
  const bootStatus = useAsync(boot);
  const healthStatus = useAsync(fetchHealth);

  const healthText =
    healthStatus.state === 'loading'
      ? 'checking...'
      : healthStatus.state === 'error'
        ? `error (${healthStatus.message})`
        : healthStatus.value.ok
          ? 'ok'
          : 'not ok';

  return (
    <main class="card">
      <h1>Leet Creatures</h1>

      {bootStatus.state === 'loading' && <p>Loading...</p>}
      {bootStatus.state === 'error' && <p class="error">Failed to start: {bootStatus.message}</p>}
      {bootStatus.state === 'ok' && (
        <>
          {bootStatus.value.me === null ? (
            <p>This is a Discord Activity. Launch it from Discord to play.</p>
          ) : (
            <>
              <p class="hello">Signed in as {bootStatus.value.me.user.displayName}</p>
              <p class="bait" aria-label="Bait balance">
                <span class="bait-amount">{bootStatus.value.me.balances.bait}</span> Bait
              </p>
              {bootStatus.value.config.leetSource === 'mock' && (
                <p class="note">Leet points are simulated until the leet bot API is live</p>
              )}
              <h2>Recent</h2>
              {bootStatus.value.recent.length === 0 ? (
                <p class="muted">Nothing yet.</p>
              ) : (
                <ul class="recent">
                  {bootStatus.value.recent.map((entry) => (
                    <li key={entry.id}>{describeEntry(entry)}</li>
                  ))}
                </ul>
              )}
            </>
          )}
          <dl>
            <Row label="Environment" value={bootStatus.value.config.environment} />
            <Row label="Server version" value={bootStatus.value.config.version} />
            {bootStatus.value.me !== null && (
              <Row label="Guild ID" value={bootStatus.value.me.guildId} />
            )}
          </dl>
        </>
      )}

      <dl>
        <Row label="API health" value={healthText} />
      </dl>
    </main>
  );
}

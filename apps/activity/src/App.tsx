import { DiscordSDK } from '@discord/embedded-app-sdk';
import { useEffect, useState } from 'preact/hooks';
import { fetchConfig, fetchHealth, type AppConfig } from './api';

interface DiscordInfo {
  guildId: string | null;
  channelId: string | null;
  instanceId: string;
}

type Status<T> =
  { state: 'loading' } | { state: 'error'; message: string } | { state: 'ok'; value: T };

interface Boot {
  config: AppConfig;
  discord: DiscordInfo | null;
}

// Discord adds frame_id (among others) to the URL when it launches an Activity.
const insideDiscord = new URLSearchParams(window.location.search).has('frame_id');

async function boot(): Promise<Boot> {
  const config = await fetchConfig();
  if (!insideDiscord) {
    return { config, discord: null };
  }
  const sdk = new DiscordSDK(config.discordClientId);
  await sdk.ready();
  return {
    config,
    discord: { guildId: sdk.guildId, channelId: sdk.channelId, instanceId: sdk.instanceId },
  };
}

function errorMessage(err: unknown): string {
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
          <p class="hello">Hello from {bootStatus.value.config.environment}</p>
          {bootStatus.value.discord === null && (
            <p>This is a Discord Activity. Launch it from Discord to play.</p>
          )}
          <dl>
            <Row label="Server version" value={bootStatus.value.config.version} />
            {bootStatus.value.discord !== null && (
              <>
                <Row label="Guild ID" value={bootStatus.value.discord.guildId ?? '(none)'} />
                <Row label="Channel ID" value={bootStatus.value.discord.channelId ?? '(none)'} />
                <Row label="Instance ID" value={bootStatus.value.discord.instanceId} />
              </>
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

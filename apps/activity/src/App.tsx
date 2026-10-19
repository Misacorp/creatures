import type { GlossarySection } from '@creatures/game';
import { DiscordSDK } from '@discord/embedded-app-sdk';
import { setExternalLinkOpener } from './external-link';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  ApiError,
  createSession,
  fetchConfig,
  fetchHealth,
  fetchMe,
  fetchState,
  setReauthenticator,
  type AppConfig,
  type GameState,
  type LeetSyncStatus,
  type Me,
} from './api';
import { AppHead } from './AppHead';
import { Game } from './Game';
import { aloneParticipants, discordParticipants, type ParticipantSource } from './participants';
import { PopoverHost } from './PopoverHost';
import { HowToPlay } from './HowToPlay';
import { leetStatusLine } from './leet-status';
import { RecentActivity } from './RecentActivity';
import { DataTable } from './ui/DataTable';
import { footerRows } from './footer-rows';

type Status<T> =
  { state: 'loading' } | { state: 'error'; message: string } | { state: 'ok'; value: T };

interface Boot {
  config: AppConfig;
  /** Null when running outside Discord (no sign-in possible). */
  me: Me | null;
  game: GameState | null;
  /** Who has the Activity open (for the living room); just the player when the SDK fails. */
  participants: ParticipantSource;
}

// Discord adds frame_id (among others) to the URL when it launches an Activity.
const insideDiscord = new URLSearchParams(window.location.search).has('frame_id');

async function boot(): Promise<Boot> {
  const config = await fetchConfig();
  if (!insideDiscord) {
    // Nobody to show: with no sign-in there is no game and no room.
    return { config, me: null, game: null, participants: aloneParticipants('', 'none') };
  }
  const sdk = new DiscordSDK(config.discordClientId);
  await sdk.ready();
  // Links that leave the Activity (the dev panel's workbench link) go through Discord.
  setExternalLinkOpener(async (url) => {
    await sdk.commands.openExternalLink({ url });
  });
  const signIn = async (): Promise<void> => {
    const { code } = await sdk.commands.authorize({
      client_id: config.discordClientId,
      response_type: 'code',
      state: '',
      prompt: 'none',
      scope: ['identify'],
    });
    // The server decides the guild and verifies the player; the client only passes the code and
    // the instance id.
    const session = await createSession(code, sdk.instanceId);
    // Discord requires authenticate() with the access token to unlock the rest of the SDK.
    await sdk.commands.authenticate({ access_token: session.accessToken });
  };
  await signIn();
  // Sessions idle out after an hour but expeditions last longer: sign in again silently.
  setReauthenticator(signIn);
  // Both requests run the (throttled) leet sync first, so the Bait balance is fresh.
  const me = await fetchMe();
  const game = await fetchState();
  // After authenticate(), which unlocks the participants calls; a failure leaves just the player.
  const participants = await discordParticipants(sdk, me.user.id);
  return { config, me, game, participants };
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

/** The newest known sync status: from polling, else the state call, else the /api/me call. */
function shownLeetSync(boot: Boot, polled: LeetSyncStatus | null): LeetSyncStatus | null {
  return polled ?? boot.game?.leetSync ?? boot.me?.leetSync ?? null;
}

/** One line about the leet sync; text only. A failed sync is a warning players can report. */
function LeetStatus({ status }: { status: LeetSyncStatus | null }) {
  if (status === null) return null;
  const line = leetStatusLine(status, Date.now());
  return (
    <p class={line.tone === 'warning' ? 'small error' : 'small'} role="status">
      {line.text}
    </p>
  );
}

export function App() {
  const bootStatus = useAsync(boot);
  // The footer's sync status; refreshed by the game while the first sync is still running.
  const [leetSync, setLeetSync] = useState<LeetSyncStatus | null>(null);
  const healthStatus = useAsync(fetchHealth);
  // The How to play page: closed (null), or open at a section (null section: the top).
  const [howTo, setHowTo] = useState<{ section: GlossarySection | null; nonce: number } | null>(
    null,
  );
  const mainRef = useRef<HTMLElement>(null);
  const helpButton = useRef<HTMLButtonElement>(null);

  // While the page is open nothing behind it can be reached with the keyboard or a screen reader.
  const wasOpen = useRef(false);
  useEffect(() => {
    const open = howTo !== null;
    mainRef.current?.toggleAttribute('inert', open);
    // Closing the page puts focus back on the "?" button (the page may have been opened by a tag's link).
    if (wasOpen.current && !open) helpButton.current?.focus();
    wasOpen.current = open;
  }, [howTo !== null]);

  const openHowTo = (): void => {
    setHowTo((open) => ({ section: null, nonce: (open?.nonce ?? 0) + 1 }));
  };
  const loadedBoot = bootStatus.state === 'ok' ? bootStatus.value : null;
  // With a game on screen, the game draws the head (over the living room).
  const gameLoaded = loadedBoot !== null && loadedBoot.me !== null && loadedBoot.game !== null;

  const healthText =
    healthStatus.state === 'loading'
      ? 'checking...'
      : healthStatus.state === 'error'
        ? `error (${healthStatus.message})`
        : healthStatus.value.ok
          ? 'ok'
          : 'not ok';

  return (
    <PopoverHost
      onOpenHowTo={(section) => {
        setHowTo((open) => ({ section, nonce: (open?.nonce ?? 0) + 1 }));
      }}
    >
      <main class="card" ref={mainRef}>
        {!gameLoaded && <AppHead helpRef={helpButton} onHelp={openHowTo} />}

        {bootStatus.state === 'loading' && <p>Loading...</p>}
        {bootStatus.state === 'error' && <p class="error">Failed to start: {bootStatus.message}</p>}
        {bootStatus.state === 'ok' && (
          <>
            {bootStatus.value.me === null || bootStatus.value.game === null ? (
              <p>This is a Discord Activity. Launch it from Discord to play.</p>
            ) : (
              <>
                <Game
                  initial={bootStatus.value.game}
                  user={bootStatus.value.me.user}
                  participants={bootStatus.value.participants}
                  helpRef={helpButton}
                  onHelp={openHowTo}
                  onLeetSync={setLeetSync}
                  allowance={bootStatus.value.me.allowance}
                  showPractice={bootStatus.value.config.environment !== 'production'}
                  devTools={bootStatus.value.config.devTools || bootStatus.value.me.devTools}
                  loungeLive={bootStatus.value.config.loungeLive}
                />
                {bootStatus.value.config.leetSource === 'mock' && (
                  <p class="note">Leet points are simulated until the leet bot API is live</p>
                )}
                <RecentActivity
                  refreshKey={shownLeetSync(bootStatus.value, leetSync)?.lastSyncedAt ?? null}
                />
              </>
            )}
          </>
        )}

        <footer>
          {bootStatus.state === 'ok' && bootStatus.value.me !== null && (
            <p class="small">Signed in as {bootStatus.value.me.user.displayName}</p>
          )}
          {bootStatus.state === 'ok' && bootStatus.value.me !== null && (
            <LeetStatus status={shownLeetSync(bootStatus.value, leetSync)} />
          )}
          <DataTable
            rows={footerRows(
              bootStatus.state === 'ok'
                ? {
                    environment: bootStatus.value.config.environment,
                    version: bootStatus.value.config.version,
                    branch: bootStatus.value.config.branch,
                    guildId: bootStatus.value.me?.guildId ?? null,
                  }
                : null,
              healthText,
            )}
          />
        </footer>
      </main>
      {howTo !== null && (
        <HowToPlay
          section={howTo.section}
          nonce={howTo.nonce}
          onClose={() => {
            setHowTo(null);
          }}
        />
      )}
    </PopoverHost>
  );
}

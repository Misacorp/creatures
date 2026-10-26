import { DiscordSDK } from '@discord/embedded-app-sdk';
import { setExternalLinkOpener } from './external-link';
import { setFinaleLiveOffered, setRaidLiveOffered } from './live-flags';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  ApiError,
  createSession,
  fetchConfig,
  fetchMe,
  fetchState,
  setReauthenticator,
  type AppConfig,
  type GameState,
  type Me,
} from './api';
import { AppHead } from './AppHead';
import { Game } from './Game';
import { aloneParticipants, discordParticipants, type ParticipantSource } from './participants';
import { PopoverHost } from './PopoverHost';
import { HowToPlay } from './HowToPlay';
import { useHowTo } from './use-how-to';
import { publishBuildInfo } from './build-info';

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
  // The deployed branch and commit live in the page's meta tags (no visible footer).
  publishBuildInfo(document, config);
  // The finale screen reads this when it opens (it polls as before while it is off).
  setFinaleLiveOffered(config.finaleLive);
  setRaidLiveOffered(config.raidLive);
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

export function App() {
  const bootStatus = useAsync(boot);
  const mainRef = useRef<HTMLElement>(null);
  const helpButton = useRef<HTMLButtonElement>(null);
  // The How to play page: closed (null), or open at a section (null section: the top).
  const { howTo, open, close } = useHowTo(mainRef, helpButton);
  const openHowTo = (): void => {
    open(null);
  };
  const loadedBoot = bootStatus.state === 'ok' ? bootStatus.value : null;
  // With a game on screen, the game draws the head (over the living room).
  const gameLoaded = loadedBoot !== null && loadedBoot.me !== null && loadedBoot.game !== null;

  return (
    <PopoverHost onOpenHowTo={open}>
      <main class="card" ref={mainRef} tabIndex={-1}>
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
                  allowance={bootStatus.value.me.allowance}
                  showPractice={bootStatus.value.config.environment !== 'production'}
                  devTools={bootStatus.value.config.devTools || bootStatus.value.me.devTools}
                  loungeLive={bootStatus.value.config.loungeLive}
                />
                {bootStatus.value.config.leetSource === 'mock' && (
                  <p class="note">Leet points are simulated until the leet bot API is live</p>
                )}
              </>
            )}
          </>
        )}
      </main>
      {howTo !== null && <HowToPlay section={howTo.section} nonce={howTo.nonce} onClose={close} />}
    </PopoverHost>
  );
}

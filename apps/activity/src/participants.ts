/**
 * Who has the Activity open in this activity instance, as the living room needs to know it: a small
 * source of Discord user ids with a change subscription. The Discord Embedded App SDK pushes joins
 * and leaves to every client, so nothing here asks the server anything. Outside Discord, or when the
 * SDK call fails, the source is just the player's own id. Pure apart from the SDK it is handed (so
 * tests and the workbench use a fake).
 */

/** The Discord event that fires on every join and leave. */
const PARTICIPANTS_EVENT = 'ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE';

/** How long to wait for Discord's answer at start-up before showing just the player. */
const START_TIMEOUT_MS = 3000;

/** A Discord user id is a snowflake: digits only. The server insists on the same. */
const SNOWFLAKE = /^\d{1,20}$/;

export interface ParticipantSource {
  /** The activity instance id; part of the spot assignment, so everyone in it sees the same room. */
  instanceId: string;
  /** The user ids present now (always including the player's own), without repeats. */
  ids(): readonly string[];
  /** Calls `callback` after every change of `ids()`. Returns the function that stops it. */
  subscribe(callback: () => void): () => void;
}

/** The part of a participant record the room reads. */
interface ParticipantRecord {
  id: string;
  bot?: boolean;
}

/** The part of the Discord SDK that `discordParticipants` uses. */
export interface ParticipantSdk {
  instanceId: string;
  commands: {
    getInstanceConnectedParticipants(): Promise<{ participants: readonly ParticipantRecord[] }>;
  };
  subscribe(
    event: typeof PARTICIPANTS_EVENT,
    listener: (event: { participants: readonly ParticipantRecord[] }) => unknown,
  ): Promise<unknown>;
  unsubscribe(
    event: typeof PARTICIPANTS_EVENT,
    listener: (event: { participants: readonly ParticipantRecord[] }) => unknown,
  ): Promise<unknown>;
}

/**
 * The ids to ask about: the player first, then every other human participant once. Bots and anything
 * that is not a snowflake are dropped, so a strange payload cannot make a request the server refuses.
 */
export function participantIds(
  participants: readonly ParticipantRecord[],
  selfId: string,
): string[] {
  const ids = new Set<string>([selfId]);
  for (const participant of participants) {
    if (participant.bot === true) continue;
    if (typeof participant.id === 'string' && SNOWFLAKE.test(participant.id)) {
      ids.add(participant.id);
    }
  }
  return [...ids];
}

/** A room with only the player in it (outside Discord, and the fallback when the SDK fails). */
export function aloneParticipants(selfId: string, instanceId: string): ParticipantSource {
  const ids = [selfId];
  return {
    instanceId,
    ids: () => ids,
    subscribe: () => () => undefined,
  };
}

/**
 * A source backed by the SDK: reads the participants once, then follows
 * `ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE` while somebody is subscribed. A failing call keeps the
 * last known list (at first: just the player).
 */
export async function discordParticipants(
  sdk: ParticipantSdk,
  selfId: string,
): Promise<ParticipantSource> {
  let current: readonly string[] = [selfId];
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const answer = await Promise.race([
      sdk.commands.getInstanceConnectedParticipants(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error('participants timed out'));
        }, START_TIMEOUT_MS);
      }),
    ]);
    current = participantIds(answer.participants, selfId);
  } catch {
    // Keep just the player.
  } finally {
    clearTimeout(timeout);
  }
  const listeners = new Set<() => void>();
  const onUpdate = (event: { participants: readonly ParticipantRecord[] }): void => {
    current = participantIds(event.participants, selfId);
    for (const listener of [...listeners]) listener();
  };
  let following = false;
  return {
    instanceId: sdk.instanceId,
    ids: () => current,
    subscribe(callback) {
      listeners.add(callback);
      if (!following) {
        following = true;
        void Promise.resolve()
          .then(() => sdk.subscribe(PARTICIPANTS_EVENT, onUpdate))
          .catch(() => undefined);
      }
      return () => {
        listeners.delete(callback);
        if (listeners.size === 0 && following) {
          following = false;
          void Promise.resolve()
            .then(() => sdk.unsubscribe(PARTICIPANTS_EVENT, onUpdate))
            .catch(() => undefined);
        }
      };
    },
  };
}

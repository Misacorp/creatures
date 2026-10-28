import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameState, LoungeXpPush } from './api';
import { parseLiveMessage } from './api';
import { LivingRoom, sceneOf } from './LivingRoom';
import type { ParticipantSource } from './participants';
import { PopoverHost } from './PopoverHost';
import { LOUNGE_REFRESH_MS, ROOM_POLL_MS } from './room-data';
import { byRole, createPage, find, type FakeElement, type Page } from './test-dom';
import { useLoungePresence } from './use-lounge-presence';

// The server is a stand-in: the room asks `fetchRoom` about the others, and nothing else is reached.
const fetchRoom = vi.fn<(ids: readonly string[]) => Promise<never[]>>(() => Promise.resolve([]));
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  fetchRoom: (ids: readonly string[]) => fetchRoom(ids),
}));

// The live socket is a stand-in too: the test plays the server's side through the deps it was opened with.
let socketDeps: Parameters<typeof import('./live-socket').createLiveSocket>[0] | null = null;
vi.mock('./live-socket', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./live-socket')>()),
  createLiveSocket: (deps: NonNullable<typeof socketDeps>) => {
    socketDeps = deps;
    return { start: () => undefined, stop: () => undefined, state: () => 'idle' as const };
  },
}));

let page: Page | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  fetchRoom.mockClear();
  socketDeps = null;
});

afterEach(() => {
  page?.unmount();
  page = null;
  vi.useRealTimers();
});

const SELF = '100000000000000001';
const OTHER = '100000000000000002';

function livingRoom(root: FakeElement): FakeElement[] {
  return find(root, (el) => el.getAttribute('aria-label') === 'Living room');
}

/** A fake Discord: the player and one other have the Activity open. */
const watching: ParticipantSource = {
  instanceId: 'test',
  ids: () => [SELF, OTHER],
  subscribe: () => () => undefined,
};
const lounging: Pick<GameState, 'loungerId' | 'loungeXp'> = { loungerId: 'c1', loungeXp: {} };

/**
 * The game screen's part of the room: presence always runs, and the room is drawn only on the Home page of a
 * phone or in a wide window's band (`drawn`).
 */
function Screen({
  drawn,
  refresh,
  loungeLive = false,
  onLoungeXp,
}: {
  drawn: boolean;
  refresh: () => void;
  loungeLive?: boolean;
  onLoungeXp?: (push: LoungeXpPush) => void;
}) {
  const room = useLoungePresence(
    {
      enabled: true,
      participants: watching,
      selfId: SELF,
      selfName: 'You',
      state: { creatures: [], loungerId: 'c1', loungeSpot: null, serverFirsts: [] },
      craftingLevels: new Map(),
      loungeLive,
      ...(onLoungeXp === undefined ? {} : { onLoungeXp }),
    },
    lounging,
    refresh,
  );
  return (
    <PopoverHost onOpenHowTo={() => undefined}>
      {drawn && (
        <LivingRoom
          residents={room.residents}
          selfId={SELF}
          instanceId="test"
          scene={sceneOf('night')}
        />
      )}
    </PopoverHost>
  );
}

describe('presence while the room is not drawn (any other page on a phone)', () => {
  it('still looks up the others, polls them and reloads your state once per XP, with nothing drawn', async () => {
    page = createPage();
    const refresh = vi.fn();
    page.draw(<Screen drawn={false} refresh={refresh} />);
    expect(livingRoom(page.root)).toHaveLength(0);

    // The first look at who else is here.
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchRoom).toHaveBeenCalledWith([OTHER]);

    // The slow poll goes on, and your lounger's XP is reloaded, while the room is not on screen.
    fetchRoom.mockClear();
    await vi.advanceTimersByTimeAsync(ROOM_POLL_MS);
    expect(fetchRoom).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(Math.floor(ROOM_POLL_MS / LOUNGE_REFRESH_MS));
    expect(byRole(page.root, 'dialog')).toHaveLength(0);
  });

  it('is the same with the room drawn and hidden again (going Home and away): it starts and stops nothing', async () => {
    page = createPage();
    const refresh = vi.fn();
    page.draw(<Screen drawn={false} refresh={refresh} />);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchRoom).toHaveBeenCalledTimes(1);

    page.draw(<Screen drawn refresh={refresh} />);
    expect(livingRoom(page.root)).toHaveLength(1);
    page.draw(<Screen drawn={false} refresh={refresh} />);
    await vi.advanceTimersByTimeAsync(0);
    // Not looked up again, and the timers kept their rhythm.
    expect(fetchRoom).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(LOUNGE_REFRESH_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("your lounger's XP with the live socket", () => {
  const push = {
    v: 1,
    type: 'lounge-xp',
    creatureId: 'c1',
    paid: 1,
    level: 3,
    exp: 4,
    waiting: false,
  };

  it('reloads the state only while the socket is not delivering, and takes pushes while it is', async () => {
    page = createPage();
    const refresh = vi.fn();
    const onLoungeXp = vi.fn();
    page.draw(<Screen drawn={false} refresh={refresh} loungeLive onLoungeXp={onLoungeXp} />);
    await vi.advanceTimersByTimeAsync(0);
    expect(socketDeps).not.toBeNull();

    // Not live yet (connecting): the fallback reload runs.
    await vi.advanceTimersByTimeAsync(LOUNGE_REFRESH_MS);
    expect(refresh).toHaveBeenCalledTimes(1);

    // Live: no reloads at all, and a pushed payment reaches the screen.
    socketDeps?.onLive(true);
    await vi.advanceTimersByTimeAsync(0);
    refresh.mockClear();
    await vi.advanceTimersByTimeAsync(5 * LOUNGE_REFRESH_MS);
    expect(refresh).not.toHaveBeenCalled();
    const message = parseLiveMessage(JSON.stringify(push));
    if (message === null || message.type === 'hello') throw new Error('push not read');
    socketDeps?.onMessage(message);
    expect(onLoungeXp).toHaveBeenCalledWith(expect.objectContaining({ creatureId: 'c1', paid: 1 }));

    // Dropped (reconnecting): the fallback takes over again.
    socketDeps?.onLive(false);
    await vi.advanceTimersByTimeAsync(LOUNGE_REFRESH_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('keeps reloading when the server does not offer the socket', async () => {
    page = createPage();
    const refresh = vi.fn();
    page.draw(<Screen drawn={false} refresh={refresh} />);
    await vi.advanceTimersByTimeAsync(3 * LOUNGE_REFRESH_MS);
    expect(socketDeps).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(3);
  });
});

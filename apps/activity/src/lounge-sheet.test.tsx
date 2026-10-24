import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameState } from './api';
import { LoungeSheet } from './LoungeSheet';
import { sceneOf } from './LivingRoom';
import type { ParticipantSource } from './participants';
import { PopoverHost } from './PopoverHost';
import { LOUNGE_REFRESH_MS, ROOM_POLL_MS, type Resident } from './room-data';
import { byClass, byName, byRole, createPage, find, type FakeElement, type Page } from './test-dom';
import { useLoungePresence } from './use-lounge-presence';

// The server is a stand-in: the room asks `fetchRoom` about the others, and nothing else is reached.
const fetchRoom = vi.fn<(ids: readonly string[]) => Promise<never[]>>(() => Promise.resolve([]));
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  fetchRoom: (ids: readonly string[]) => fetchRoom(ids),
}));

let page: Page | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  fetchRoom.mockClear();
});

afterEach(() => {
  page?.unmount();
  page = null;
  vi.useRealTimers();
});

const SELF = '100000000000000001';
const OTHER = '100000000000000002';

const noResidents: readonly Resident[] = [];

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

function livingRoom(root: FakeElement): FakeElement[] {
  return find(root, (el) => el.getAttribute('aria-label') === 'Living room');
}

function sheet(open: boolean, onClose: () => void = () => undefined) {
  return (
    <PopoverHost onOpenHowTo={() => undefined}>
      <LoungeSheet
        open={open}
        onClose={onClose}
        room={{ residents: noResidents, selfId: SELF, instanceId: 'test', scene: sceneOf('night') }}
      />
    </PopoverHost>
  );
}

describe('LoungeSheet', () => {
  it('draws nothing while it is shut', () => {
    page = createPage();
    page.draw(sheet(false));
    expect(byRole(page.root, 'dialog')).toHaveLength(0);
    expect(livingRoom(page.root)).toHaveLength(0);
  });

  it('opens as a modal sheet named Lounge with the living room in it and a close button', () => {
    page = createPage();
    page.draw(sheet(true));
    const dialog = first(byRole(page.root, 'dialog'));
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('class')).toContain('lounge-sheet');
    expect(byName(page.root, 'h2', 'Lounge')).toHaveLength(1);
    expect(livingRoom(page.root)).toHaveLength(1);
    expect(byName(page.root, 'button', 'Close')).toHaveLength(1);
  });

  it('closes with the close button, with Escape and with a tap on the backdrop', () => {
    page = createPage();
    const onClose = vi.fn();
    page.draw(sheet(true, onClose));
    page.click(first(byName(page.root, 'button', 'Close')));
    expect(onClose).toHaveBeenCalledTimes(1);

    page.key(first(byRole(page.root, 'dialog')), 'Escape');
    expect(onClose).toHaveBeenCalledTimes(2);

    page.click(first(byClass(page.root, 'drawer-backdrop')));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});

/** A fake Discord: the player and one other have the Activity open. */
function participants(): ParticipantSource {
  return {
    instanceId: 'test',
    ids: () => [SELF, OTHER],
    subscribe: () => () => undefined,
  };
}

const watching = participants();
const lounging: Pick<GameState, 'loungerId' | 'loungeXp'> = { loungerId: 'c1', loungeXp: {} };

/** The game screen's part of the room: presence, with the sheet open or shut as `open` says. */
function Screen({ open, refresh }: { open: boolean; refresh: () => void }) {
  const room = useLoungePresence(
    {
      enabled: true,
      participants: watching,
      selfId: SELF,
      selfName: 'You',
      state: { creatures: [], loungerId: 'c1', loungeSpot: null },
      craftingLevels: new Map(),
    },
    lounging,
    refresh,
  );
  return (
    <PopoverHost onOpenHowTo={() => undefined}>
      <LoungeSheet
        open={open}
        onClose={() => undefined}
        room={{
          residents: room.residents,
          selfId: SELF,
          instanceId: 'test',
          scene: sceneOf('night'),
        }}
      />
    </PopoverHost>
  );
}

describe('presence with the sheet shut', () => {
  it('still looks up the others, polls them and reloads your state once per XP, with nothing drawn', async () => {
    page = createPage();
    const refresh = vi.fn();
    page.draw(<Screen open={false} refresh={refresh} />);
    expect(byRole(page.root, 'dialog')).toHaveLength(0);

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

  it('is the same with the sheet opened and shut again: it starts and stops nothing', async () => {
    page = createPage();
    const refresh = vi.fn();
    page.draw(<Screen open={false} refresh={refresh} />);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchRoom).toHaveBeenCalledTimes(1);

    page.draw(<Screen open refresh={refresh} />);
    expect(byRole(page.root, 'dialog')).toHaveLength(1);
    page.draw(<Screen open={false} refresh={refresh} />);
    await vi.advanceTimersByTimeAsync(0);
    // Not looked up again, and the timers kept their rhythm.
    expect(fetchRoom).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(LOUNGE_REFRESH_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { completeSets, type OwnHouseView, type RoomView } from '@creatures/game';
import { housing } from '@creatures/game/housing-content';
import { ApiError } from '../api';
import { createPage, type Page } from '../test-dom';
import { sampleHouse, sampleOwn } from './house-sample';
import { finishesSet, useHouse, type OwnHouse, type UseHouse } from './use-house';

/** The `useHouse` hook with the network a stand-in: loading, the actions' folds, stale reloads and the idempotency keys. */

const api = vi.hoisted(() => ({
  fetchOwnHouse: vi.fn(),
  placePiece: vi.fn(),
  collectMail: vi.fn(),
  craftItem: vi.fn(),
  buildPart: vi.fn(),
  setHousemate: vi.fn(),
  setSkin: vi.fn(),
  markSeen: vi.fn(),
}));

vi.mock('./housing-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./housing-api')>()),
  ...api,
}));

let page: Page | null = null;
let hook: UseHouse;

function Probe() {
  hook = useHouse(true);
  return null;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  page?.update(() => undefined);
}

function startingState(): OwnHouse {
  return { house: sampleHouse(), own: sampleOwn('rich') };
}

async function mount(): Promise<void> {
  api.fetchOwnHouse.mockResolvedValue(startingState());
  page = createPage();
  page.draw(<Probe />);
  await flush();
}

/** The answer of a place request: the room with the spot set, the free copies, the housemates. */
function placed(roomId: string, spotId: string, pieceId: string | null, extra = {}) {
  const room: RoomView = {
    ...(sampleHouse().rooms.find((r) => r.id === roomId) as RoomView),
  };
  room.spots = { ...room.spots, [spotId]: pieceId };
  return { room, from: null, own: { free: { 'cosy-rug': 3 } }, housemates: [], ...extra };
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.markSeen.mockResolvedValue(undefined);
});

afterEach(() => {
  page?.unmount();
  page = null;
});

describe('useHouse', () => {
  it('loads the house when it is enabled', async () => {
    await mount();
    expect(hook.state?.house.owner.userId).toBe(sampleHouse().owner.userId);
    expect(hook.failed).toBe(false);
  });

  it('moves a piece with one request that names both spots, and folds in the answer', async () => {
    await mount();
    const room = (hook.state as OwnHouse).house.rooms[0] as RoomView;
    const [from, to] = Object.keys(room.spots);
    const mate = (hook.state as OwnHouse).house.housemates[0];
    api.placePiece.mockResolvedValue(
      placed(room.id, to as string, 'cosy-chair', {
        from: null,
        housemates: mate === undefined ? [] : [{ ...mate, roomId: room.id, spotId: to as string }],
      }),
    );
    const done = await hook.actions.move(
      { roomId: room.id, spotId: from as string },
      { roomId: room.id, spotId: to as string },
      'cosy-chair',
    );
    await flush();
    expect(done).toBe(true);
    expect(api.placePiece).toHaveBeenCalledTimes(1);
    expect(api.placePiece).toHaveBeenCalledWith(room.id, to, 'cosy-chair', {
      roomId: room.id,
      spotId: from,
    });
    expect((hook.state as OwnHouse).house.rooms[0]?.spots[to as string]).toBe('cosy-chair');
    if (mate !== undefined) {
      expect((hook.state as OwnHouse).house.housemates[0]).toMatchObject({ spotId: to });
    }
  });

  it('a stale 409 or 404 shows the refusal and loads the house again', async () => {
    await mount();
    expect(api.fetchOwnHouse).toHaveBeenCalledTimes(1);
    api.placePiece.mockRejectedValue(new ApiError(409, 'spot_mismatch'));
    expect(await hook.actions.place('hut:hearth', 'rug-a', 'cosy-rug')).toBe(false);
    await flush();
    expect(hook.error).toBe('That does not fit there.');
    expect(api.fetchOwnHouse).toHaveBeenCalledTimes(2);
    api.placePiece.mockRejectedValue(new ApiError(404, 'not_found'));
    await hook.actions.place('hut:hearth', 'rug-a', 'cosy-rug');
    await flush();
    expect(api.fetchOwnHouse).toHaveBeenCalledTimes(3);
    // A server error is no news about the screen: no reload.
    api.placePiece.mockRejectedValue(new ApiError(500, null));
    await hook.actions.place('hut:hearth', 'rug-a', 'cosy-rug');
    await flush();
    expect(api.fetchOwnHouse).toHaveBeenCalledTimes(3);
  });

  it('an action answer outranks a load that is still running', async () => {
    await mount();
    const room = (hook.state as OwnHouse).house.rooms[0] as RoomView;
    const spot = Object.keys(room.spots)[0] as string;
    let finish: (state: OwnHouse) => void = () => undefined;
    api.fetchOwnHouse.mockReturnValue(
      new Promise<OwnHouse>((resolve) => {
        finish = resolve;
      }),
    );
    hook.reload();
    api.placePiece.mockResolvedValue(placed(room.id, spot, 'cosy-lamp'));
    await hook.actions.place(room.id, spot, 'cosy-lamp');
    await flush();
    // The slow load answers with the old house; it must not undo the placement.
    finish(startingState());
    await flush();
    expect((hook.state as OwnHouse).house.rooms[0]?.spots[spot]).toBe('cosy-lamp');
  });

  it('reuses the key of a collect whose outcome is unknown, and uses a new one after the house is loaded again', async () => {
    await mount();
    const keys: string[] = [];
    api.collectMail.mockImplementation((key: string) => {
      keys.push(key);
      return keys.length < 3
        ? Promise.reject(new ApiError(503, null))
        : Promise.resolve({ collected: 10, balance: 99 });
    });
    expect(await hook.actions.collect()).toBe(false);
    expect(await hook.actions.collect()).toBe(false);
    // The same tap, retried: the same key (the server answers a repeat with the stored result).
    expect(keys[1]).toBe(keys[0]);
    // The house is read again (the player reopened it): whatever happened to the first tap, this is another collect.
    hook.reload();
    await flush();
    await hook.actions.collect();
    expect(keys[2]).not.toBe(keys[0]);
    // And after an answer the next tap is new again, even with the same mailbox.
    keys.length = 2;
    api.collectMail.mockResolvedValue({ collected: 10, balance: 99 });
    await hook.actions.collect();
    await hook.actions.collect();
    expect(api.collectMail.mock.calls.at(-1)?.[0]).not.toBe(api.collectMail.mock.calls.at(-2)?.[0]);
  });

  it('loads the house again when a craft finishes a set, and not when it does not', async () => {
    const set = housing.sets.find(
      (s) => s.tier !== 0 && housing.pieces.some((p) => p.set === s.id),
    );
    const pieces = housing.pieces.filter((p) => p.set === set?.id);
    const last = pieces[pieces.length - 1];
    if (set === undefined || last === undefined) throw new Error('no set to finish');
    const held: Record<string, number> = {};
    for (const p of pieces.slice(0, -1)) held[p.id] = 1;
    const own: OwnHouseView = sampleOwn('rich');
    const state: OwnHouse = {
      house: {
        ...sampleHouse(),
        setsComplete: completeSets(housing, new Map(Object.entries(held))),
      },
      own: { ...own, items: { ...own.items, pieces: held } },
    };
    const answer = (itemId: string, count: number) => ({
      itemId,
      kind: 'piece' as const,
      count,
      purse: own.purse,
      materials: {},
    });
    expect(finishesSet(state, answer(last.id, 1))).toBe(true);
    expect(finishesSet(state, answer(pieces[0]?.id as string, 2))).toBe(false);

    api.fetchOwnHouse.mockResolvedValue(state);
    page = createPage();
    page.draw(<Probe />);
    await flush();
    api.craftItem.mockResolvedValue(answer(pieces[0]?.id as string, 2));
    await hook.actions.craft(pieces[0]?.id as string);
    await flush();
    expect(api.fetchOwnHouse).toHaveBeenCalledTimes(1);
    api.craftItem.mockResolvedValue(answer(last.id, 1));
    await hook.actions.craft(last.id);
    await flush();
    expect(api.fetchOwnHouse).toHaveBeenCalledTimes(2);
  });
});

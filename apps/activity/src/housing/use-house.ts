/**
 * The own house on the game screen: loads `GET /api/house` when the House opens, runs every action through the action runner
 * (one action at a time, one idempotency key per spend until the server has answered, `actions.ts`), and folds each answer into
 * what is on screen with the pure functions below, so no action needs a second request. A definite refusal that says the screen
 * was out of date (404, 409) loads the house again. Nothing here polls.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type {
  HousePay,
  HouseView,
  HousemateView,
  OwnHouseView,
  PartProgressView,
  RoomView,
} from '@creatures/game';
import { errorText } from '../game';
import { useActionRunner } from '../use-action-runner';
import {
  buildPart,
  collectMail,
  craftItem,
  fetchOwnHouse,
  HOUSE_ERRORS,
  markSeen,
  placePiece,
  setHousemate,
  setSkin,
  type BuildAnswer,
  type CollectAnswer,
  type CraftAnswer,
  type PlaceAnswer,
  type SkinAnswer,
  type SkinBody,
} from './housing-api';

/** The names of the keyed actions: one intent, one key (`actions.ts` explains why the name carries what makes it this action). */
export const HouseActionIds = {
  /** The same part with the same offer is the same payment (another offer is another action). */
  build: (partId: string, pay: HousePay): string => `house-build:${partId}:${stableJson(pay)}`,
  /** The next copy of a piece is another craft: how many were held makes it this one. */
  craft: (itemId: string, held: number): string => `house-craft:${itemId}:${String(held)}`,
  /** What the mailbox held makes the collect this one. */
  collect: (gifts: number, acorns: number): string =>
    `house-collect:${String(gifts)}:${String(acorns)}`,
  /** One gift to one house; the server allows one a day, so the key is dropped on any definite answer. */
  gift: (userId: string): string => `house-gift:${userId}`,
};

/** JSON with the keys in order, so two offers of the same lines are the same action. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export interface OwnHouse {
  house: HouseView;
  own: OwnHouseView;
}

// ---------------------------------------------------------------------------------------------
// Folding an answer into the view (pure)

/** Materials changed by an answer replace the held ones; the rest stay. */
function withMaterials(
  own: OwnHouseView,
  changed: OwnHouseView['materials'],
): OwnHouseView['materials'] {
  const materials = { ...own.materials };
  for (const [id, m] of Object.entries(changed)) {
    if (m.have > 0 || m.fresh > 0) materials[id] = m;
    else delete materials[id];
  }
  return materials;
}

/**
 * A payment: the part's progress, the purse and the changed materials replace what is on screen. A part that was finished also
 * leaves the progress list and brings its rooms, displays, blueprints and the new buildable list.
 */
export function afterBuild(state: OwnHouse, answer: BuildAnswer): OwnHouse {
  const others = state.own.progress.filter((p) => p.partId !== answer.part.partId);
  const progress: PartProgressView[] = answer.built ? others : [...others, answer.part];
  const own: OwnHouseView = {
    ...state.own,
    progress,
    purse: answer.purse,
    materials: withMaterials(state.own, answer.materials),
  };
  const grown = answer.grown;
  if (!answer.built || grown === undefined) return { house: state.house, own };
  const newRooms = new Set(grown.rooms.map((r) => r.id));
  const roomIds = new Set(state.house.rooms.map((r) => r.id));
  const rooms = [
    ...state.house.rooms.map((r) => grown.rooms.find((n) => n.id === r.id) ?? r),
    ...grown.rooms.filter((r) => !roomIds.has(r.id)),
  ];
  return {
    house: {
      ...state.house,
      built: [...grown.parts],
      rooms,
      displays: [...state.house.displays.filter((d) => !newRooms.has(d.roomId)), ...grown.displays],
    },
    own: {
      ...own,
      buildable: [...grown.buildable],
      items: {
        ...own.items,
        blueprints: [...new Set([...own.items.blueprints, ...grown.learned])],
      },
    },
  };
}

/** A piece or a skin was made: its new count, the purse and the changed materials. */
export function afterCraft(state: OwnHouse, answer: CraftAnswer): OwnHouse {
  const { items, free } = state.own;
  const made =
    answer.kind === 'piece'
      ? {
          items: { ...items, pieces: { ...items.pieces, [answer.itemId]: answer.count } },
          // One more copy, and it is not placed.
          free: { ...free, [answer.itemId]: (free[answer.itemId] ?? 0) + 1 },
        }
      : {
          items: {
            ...items,
            skins: items.skins.includes(answer.itemId)
              ? items.skins
              : [...items.skins, answer.itemId],
          },
          free,
        };
  return {
    house: state.house,
    own: {
      ...state.own,
      ...made,
      purse: answer.purse,
      materials: withMaterials(state.own, answer.materials),
    },
  };
}

/** A piece was placed or taken away: the room and the free copies are replaced. */
export function afterPlace(state: OwnHouse, answer: PlaceAnswer): OwnHouse {
  const exists = state.house.rooms.some((r) => r.id === answer.room.id);
  const rooms: RoomView[] = exists
    ? state.house.rooms.map((r) => (r.id === answer.room.id ? answer.room : r))
    : [...state.house.rooms, answer.room];
  return {
    house: { ...state.house, rooms },
    own: { ...state.own, free: answer.own.free },
  };
}

/** A room's wallpaper and floor, or the exterior's roof and walls, changed. */
export function afterSkin(state: OwnHouse, answer: SkinAnswer): OwnHouse {
  if (answer.target === 'exterior') {
    return { house: { ...state.house, exterior: answer.exterior }, own: state.own };
  }
  const rooms = state.house.rooms.map((r) => (r.id === answer.room.id ? answer.room : r));
  return { house: { ...state.house, rooms }, own: state.own };
}

export function afterHousemate(state: OwnHouse, housemates: readonly HousemateView[]): OwnHouse {
  return { house: { ...state.house, housemates: [...housemates] }, own: state.own };
}

/** The mailbox was emptied into the purse. */
export function afterCollect(state: OwnHouse, answer: CollectAnswer): OwnHouse {
  return {
    house: state.house,
    own: {
      ...state.own,
      mailbox: { gifts: 0, acorns: 0, from: [] },
      purse: { ...state.own.purse, bait: answer.balance },
    },
  };
}

/** The "+N" on the materials was seen. */
export function afterSeen(state: OwnHouse): OwnHouse {
  const materials = Object.fromEntries(
    Object.entries(state.own.materials).map(([id, m]) => [id, { have: m.have, fresh: 0 }]),
  );
  return { house: state.house, own: { ...state.own, materials } };
}

/** True when some material grew since the player last looked. */
export function hasFresh(own: OwnHouseView): boolean {
  return Object.values(own.materials).some((m) => m.fresh > 0);
}

// ---------------------------------------------------------------------------------------------

/** What the screen can do to the house; each returns true when the server accepted it. */
export interface HouseActions {
  build: (partId: string, pay: HousePay) => Promise<boolean>;
  craft: (itemId: string) => Promise<boolean>;
  place: (roomId: string, spotId: string, pieceId: string | null) => Promise<boolean>;
  /**
   * A piece with every copy placed goes to another spot: the server refuses to place a piece with no free copy, so the spot it
   * stands in is emptied first and the piece placed in the new one, as one action for the player.
   */
  move: (
    from: { roomId: string; spotId: string },
    to: { roomId: string; spotId: string },
    pieceId: string,
  ) => Promise<boolean>;
  skin: (body: SkinBody) => Promise<boolean>;
  housemate: (roomId: string, spotId: string, creatureId: string | null) => Promise<boolean>;
  collect: () => Promise<boolean>;
  /** Tells the server the new materials were seen, once; the "+N" goes away. */
  seen: () => void;
}

export interface UseHouse {
  state: OwnHouse | null;
  failed: boolean;
  busy: boolean;
  error: string | null;
  clearError: () => void;
  reload: () => void;
  actions: HouseActions;
}

/**
 * The own house. `enabled` loads it (the House place is open). `onSpent` runs after an answer changed the player's purse (a
 * payment, a craft, a collect) so the game screen reloads its balances.
 */
export function useHouse(enabled: boolean, onSpent?: () => void): UseHouse {
  const [state, setState] = useState<OwnHouse | null>(null);
  const [failed, setFailed] = useState(false);
  const latest = useRef<OwnHouse | null>(null);
  latest.current = state;
  const seq = useRef(0);
  const spent = useRef(onSpent);
  spent.current = onSpent;

  const load = async (): Promise<void> => {
    const mine = ++seq.current;
    try {
      const answer = await fetchOwnHouse();
      if (mine !== seq.current) return;
      setState(answer);
      setFailed(false);
    } catch {
      if (mine === seq.current) setFailed(true);
    }
  };

  const { busy, error, setError, run, runKeyed } = useActionRunner({
    errorText: (err) => errorText(err, undefined, HOUSE_ERRORS),
    onStale: load,
  });

  useEffect(() => {
    if (enabled) void load();
  }, [enabled]);

  /** Folds an answer in; an action's answer outranks a load still running. */
  const take = (next: OwnHouse, purse = false): void => {
    seq.current += 1;
    // At once, not at the next render: an action that follows straight on (a move) must start from this answer.
    latest.current = next;
    setState(next);
    if (purse) spent.current?.();
  };
  const current = (): OwnHouse | null => latest.current;

  const actions: HouseActions = {
    build: async (partId, pay) => {
      const at = current();
      if (at === null) return false;
      const answer = await runKeyed(HouseActionIds.build(partId, pay), (key) =>
        buildPart(partId, pay, key),
      );
      if (answer === undefined) return false;
      take(afterBuild(latest.current ?? at, answer), true);
      return true;
    },
    craft: async (itemId) => {
      const at = current();
      if (at === null) return false;
      const held = at.own.items.pieces[itemId] ?? 0;
      const answer = await runKeyed(HouseActionIds.craft(itemId, held), (key) =>
        craftItem(itemId, key),
      );
      if (answer === undefined) return false;
      take(afterCraft(latest.current ?? at, answer), true);
      return true;
    },
    place: async (roomId, spotId, pieceId) => {
      const at = current();
      if (at === null) return false;
      const answer = await run(() => placePiece(roomId, spotId, pieceId));
      if (answer === undefined) return false;
      take(afterPlace(latest.current ?? at, answer));
      return true;
    },
    move: async (from, to, pieceId) => {
      if (!(await actions.place(from.roomId, from.spotId, null))) return false;
      // A refusal leaves the piece unplaced (in the bag) and says why; the screen has reloaded the house by then.
      return actions.place(to.roomId, to.spotId, pieceId);
    },
    skin: async (body) => {
      const at = current();
      if (at === null) return false;
      const answer = await run(() => setSkin(body));
      if (answer === undefined) return false;
      take(afterSkin(latest.current ?? at, answer));
      return true;
    },
    housemate: async (roomId, spotId, creatureId) => {
      const at = current();
      if (at === null) return false;
      const answer = await run(() => setHousemate(roomId, spotId, creatureId));
      if (answer === undefined) return false;
      take(afterHousemate(latest.current ?? at, answer.housemates));
      return true;
    },
    collect: async () => {
      const at = current();
      if (at === null) return false;
      const { gifts, acorns } = at.own.mailbox;
      const answer = await runKeyed(HouseActionIds.collect(gifts, acorns), (key) =>
        collectMail(key),
      );
      if (answer === undefined) return false;
      take(afterCollect(latest.current ?? at, answer), true);
      return true;
    },
    seen: () => {
      const at = current();
      if (at === null || !hasFresh(at.own)) return;
      take(afterSeen(at));
      void markSeen().catch(() => undefined);
    },
  };

  return {
    state,
    failed,
    busy,
    error,
    clearError: () => {
      setError(null);
    },
    reload: () => {
      void load();
    },
    actions,
  };
}

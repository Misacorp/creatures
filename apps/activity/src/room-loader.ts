/**
 * Keeps the living room's other residents up to date with as few requests as the design allows (see
 * `docs/design/living-room.md`, "Server load"): everyone present once when the game opens, only the
 * newcomers after a join (debounced), nothing for a leave, and a full refetch on a tab switch only
 * when the data is over a minute old. While somebody else is here and the page is visible, one
 * `setTimeout` chain refetches everyone every 45 s (so others' moves show up); alone or hidden, no
 * timer waits at all. Failures are ignored quietly (the old data stays). While the lounge's live socket
 * delivers (`setLive(true)`, see `lounge-socket.ts`) the poll waits too, and pushed residents arrive
 * through `applyResident`; when the socket drops the poll takes over again. Framework-free;
 * `use-room.ts` wires it to Preact.
 */
import type { RoomResident } from './api';
import {
  ROOM_CHUNK,
  ROOM_DEBOUNCE_MS,
  chunk,
  dropAbsent,
  idsToFetch,
  isStale,
  mergeResidents,
  nextPollDelay,
  onVisibleAction,
  othersOf,
  shouldPoll,
  type Resident,
} from './room-data';

export interface RoomLoaderDeps {
  selfId: string;
  /** Asks the server about up to `ROOM_CHUNK` ids. */
  fetch: (ids: readonly string[]) => Promise<RoomResident[]>;
  /** Called with the new map of known others after every change. */
  onChange: (known: ReadonlyMap<string, Resident>) => void;
  now?: () => number;
  /** True while the page is hidden (the poll waits); `document.hidden` when left out. */
  isHidden?: () => boolean;
  /** Replaceable for tests. */
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface RoomLoader {
  /** The first look at the room: asks about everyone present except the player. */
  start(present: readonly string[]): void;
  /** Participants changed: leavers drop at once, newcomers are asked about after a short wait. */
  update(present: readonly string[]): void;
  /** Refetches everyone present, but only when the last full fetch is over a minute old. */
  refreshIfStale(): void;
  /**
   * The page was hidden or shown. Hiding stops the poll; showing refetches at once when the data is
   * over 45 s old, then the poll goes on.
   */
  setHidden(hidden: boolean): void;
  /**
   * The live socket started or stopped delivering. Live: the poll stops and everyone is fetched once
   * (a push missed while connecting is never replayed). Not live: the poll goes on as before.
   */
  setLive(live: boolean): void;
  /** A resident the live socket pushed: replaces what is known, for a player who is present. */
  applyResident(resident: RoomResident): void;
  /** Stops everything; answers that arrive later are dropped. */
  dispose(): void;
}

export function createRoomLoader(deps: RoomLoaderDeps): RoomLoader {
  const now = deps.now ?? Date.now;
  const setTimer = deps.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const isHidden = deps.isHidden ?? (() => typeof document !== 'undefined' && document.hidden);
  let present: readonly string[] = [];
  let known = new Map<string, Resident>();
  let lastFullAt: number | null = null;
  /** When a full fetch last started or ended (failures included): the poll counts from here. */
  let lastAttemptAt: number | null = null;
  let fullInFlight = false;
  let timer: unknown = null;
  /** The one timer of the poll chain. */
  let pollTimer: unknown = null;
  let hidden = isHidden();
  let disposed = false;
  /** True while the live socket delivers: the slow poll is not needed. */
  let live = false;
  /** Ids a request is on its way for, so two triggers never ask twice. */
  const pending = new Set<string>();

  const publish = (next: Map<string, Resident>): void => {
    known = next;
    deps.onChange(known);
  };

  /** Asks about `ids` in chunks; each answer is merged when it arrives. Resolves true if all worked. */
  async function ask(ids: readonly string[]): Promise<boolean> {
    for (const id of ids) pending.add(id);
    const results = await Promise.all(
      chunk(ids, ROOM_CHUNK).map(async (piece) => {
        try {
          const answer = await deps.fetch(piece);
          if (!disposed) publish(mergeResidents(known, answer, present));
          return true;
        } catch {
          return false;
        } finally {
          for (const id of piece) pending.delete(id);
        }
      }),
    );
    return results.every(Boolean);
  }

  /** Makes sure exactly one poll is waiting when polling is wanted, and none when it is not. */
  function syncPoll(): void {
    if (disposed || live || !shouldPoll(present, deps.selfId, hidden)) {
      stopPoll();
      return;
    }
    if (pollTimer !== null) return;
    pollTimer = setTimer(
      () => {
        pollTimer = null;
        void poll();
      },
      nextPollDelay(lastAttemptAt, now()),
    );
  }

  function stopPoll(): void {
    if (pollTimer !== null) clearTimer(pollTimer);
    pollTimer = null;
  }

  async function poll(): Promise<void> {
    if (disposed || live || !shouldPoll(present, deps.selfId, hidden)) return;
    // A fetch already on its way counts as this poll's.
    if (!fullInFlight) await fetchAll();
    syncPoll();
  }

  async function fetchAll(): Promise<void> {
    const ids = othersOf(present, deps.selfId);
    const before = lastFullAt;
    lastFullAt = now();
    lastAttemptAt = lastFullAt;
    // Any full fetch pushes the next poll a whole interval away.
    stopPoll();
    if (ids.length === 0) {
      syncPoll();
      return;
    }
    fullInFlight = true;
    const ok = await ask(ids);
    fullInFlight = false;
    // The next poll counts from when this one ended, so a slow request never makes it fire at once.
    lastAttemptAt = now();
    // A failed fetch does not count as fresh: the next tab switch or visit tries again.
    if (!ok) lastFullAt = before;
    syncPoll();
  }

  function fetchNewcomers(): void {
    const ids = idsToFetch(present, known, deps.selfId, pending);
    if (ids.length > 0) void ask(ids);
  }

  return {
    start(ids) {
      present = ids;
      void fetchAll();
    },
    update(ids) {
      present = ids;
      const kept = dropAbsent(known, present);
      if (kept.size !== known.size) publish(kept);
      // A poll chain that starts now (somebody joined an empty room) counts its first interval from
      // here, so it does not fire ahead of the joins' own debounced request.
      if (pollTimer === null && shouldPoll(present, deps.selfId, hidden)) lastAttemptAt = now();
      syncPoll();
      if (idsToFetch(present, known, deps.selfId, pending).length === 0) return;
      if (timer !== null) clearTimer(timer);
      timer = setTimer(() => {
        timer = null;
        if (!disposed) fetchNewcomers();
      }, ROOM_DEBOUNCE_MS);
    },
    refreshIfStale() {
      // Live data is never stale: the socket pushes every change.
      if (disposed || live || fullInFlight || !isStale(lastFullAt, now())) return;
      void fetchAll();
    },
    setLive(next) {
      if (disposed || live === next) return;
      live = next;
      if (live) {
        stopPoll();
        if (!fullInFlight) void fetchAll();
        return;
      }
      syncPoll();
    },
    applyResident(resident) {
      if (disposed || resident.userId === deps.selfId || !present.includes(resident.userId)) return;
      publish(mergeResidents(known, [resident], present));
    },
    setHidden(next) {
      if (disposed || hidden === next) return;
      hidden = next;
      if (hidden) {
        stopPoll();
        return;
      }
      if (!fullInFlight && onVisibleAction(lastFullAt, now()) === 'refresh') {
        void fetchAll();
        return;
      }
      syncPoll();
    },
    dispose() {
      disposed = true;
      if (timer !== null) clearTimer(timer);
      timer = null;
      stopPoll();
    },
  };
}

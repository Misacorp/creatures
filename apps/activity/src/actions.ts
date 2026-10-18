import { ApiError } from './api';
import type { DungeonAct } from './dungeon-types';
import type { SendRequest } from './expedition-api';
import type { StartJobRequest } from './gear-types';
import type { ChoiceRequest } from './talent-types';

/**
 * Idempotency keys for user actions. An action gets one key (`crypto.randomUUID()`), created the
 * first time it is tried. If the request fails in a way that leaves the outcome unknown (network
 * error, server error, rate limit), the same key is reused on the retry so the server can tell it
 * is a repeat. Once the server has given a definite answer, the key is dropped.
 */
export interface KeyStore {
  /** The key for this action, created if there is none yet. */
  keyFor(action: string): string;
  /** Call when an attempt is over: `err` is the failure, or undefined on success. */
  settle(action: string, err?: unknown): void;
}

/** True when the request might have reached the server, so a retry must reuse the key. */
export function outcomeUnknown(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true;
  return err.status >= 500 || err.status === 429;
}

export function createKeyStore(generate: () => string = () => crypto.randomUUID()): KeyStore {
  const pending = new Map<string, string>();
  return {
    keyFor(action) {
      let key = pending.get(action);
      if (key === undefined) {
        key = generate();
        pending.set(action, key);
      }
      return key;
    },
    settle(action, err) {
      if (err === undefined || !outcomeUnknown(err)) pending.delete(action);
    },
  };
}

/**
 * True when a definite "no" says the screen was out of date (the thing is gone, or already
 * changed), so the view should be loaded again.
 */
export function isStaleError(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 409);
}

/** The name an action has in the key store. One name is one intent, and one intent keeps one key. */
export type ActionId = string;

/** A job start without its key: what decides which action it is. */
export type JobStart = StartJobRequest extends infer R
  ? R extends StartJobRequest
    ? Omit<R, 'idempotencyKey'>
    : never
  : never;

/**
 * Every keyed action's name, built in one place. The prefixes are all different, so two intents can
 * never share a key. Actions without a key (equip, rename, push on, claim, raid placement) have no
 * name: nothing is stored for them.
 */
export const ActionIds = {
  starter: (species: string): ActionId => `starter:${species}`,
  /** Earning the ribbon a creature waits for: one creature, one ribbon at a time. */
  ribbon: (creatureId: string): ActionId => `ribbon:${creatureId}`,
  evolve: (creatureId: string): ActionId => `evolve:${creatureId}`,
  /** The same creature, place, length, supplies (in any order) and treat is the same trip. */
  send: (
    request: Pick<SendRequest, 'creatureId' | 'destination' | 'duration' | 'supplies' | 'treat'>,
  ): ActionId => {
    const picks = request.supplies.map((p) => `${p.source}:${p.id}`).sort();
    const treat = request.treat === true ? ':treat' : '';
    return `send:${request.creatureId}:${request.destination}:${request.duration}:${picks.join(',')}${treat}`;
  },
  /** One answer to one waiting duplicate (the same card answered another way is another action). */
  catchChoice: (pendingId: string, request: ChoiceRequest): ActionId => {
    const target = 'creatureId' in request ? request.creatureId : '';
    const slot = 'slot' in request ? String(request.slot) : '';
    return `catch:${pendingId}:${request.choice}:${target}:${slot}`;
  },
  /** "Apply Recommended to all": one action at a time, so one key. */
  catchAll: (): ActionId => 'catch-all',
  /** The same talent into the same slot of the same creature is the same slotting. */
  talentSlot: (creatureId: string, talentId: string, golden: boolean, slot: number): ActionId =>
    `talent-slot:${creatureId}:${talentId}:${golden ? 'g' : 'n'}:${String(slot)}`,
  claimJob: (jobId: string): ActionId => `claim-job:${jobId}`,
  /** The same job on the same creature is the same action (a craft aimed differently, or other items, is another). */
  job: (request: JobStart): ActionId => {
    switch (request.kind) {
      case 'craft':
        return `job:craft:${request.creatureId}:${request.blueprintId}:${request.reach}${treatSuffix(request)}`;
      case 'dismantle':
        return `job:dismantle:${request.creatureId}:${[...request.itemIds].sort().join(',')}${treatSuffix(request)}`;
      case 'supply':
        return `job:supply:${request.creatureId}:${request.supplyId}${treatSuffix(request)}`;
    }
  },
  /** The same three creatures in the same order are the same run; other picks get their own key. */
  dungeonStart: (
    team: readonly [string, string, string],
    treats: readonly string[] = [],
  ): ActionId =>
    `dungeon-start:${JSON.stringify(team)}${treats.length === 0 ? '' : `:treats:${[...treats].sort().join(',')}`}`,
  /**
   * One step of an open run: the run, the step it stands at and the act. The step moves on with every
   * accepted act, so a key is only ever kept for a retry of the same act at the same step; another act
   * at that step (another room, the other option) is another action.
   */
  dungeonAct: (runId: string, step: number, act: DungeonAct): ActionId =>
    `dungeon-act:${runId}:${String(step)}:${dungeonActKey(act)}`,
};

/** What makes one dungeon act different from another, in a string. */
function dungeonActKey(act: DungeonAct): string {
  switch (act.type) {
    case 'move':
      return `move:${act.node}`;
    case 'event':
      return `event:${String(act.option)}`;
    case 'camp':
      return [
        'camp',
        act.choice,
        act.order?.join(',') ?? '',
        act.out ?? '',
        act.in ?? '',
        act.keepsake ?? '',
      ].join(':');
    case 'home':
      return 'home';
  }
}

/** A treat makes a job another action (the same job without one is not the same request). */
function treatSuffix(request: { treat?: boolean | undefined }): string {
  return request.treat === true ? ':treat' : '';
}

/**
 * The Discord DM settings (`GET` and `PUT /api/notifications`, `apps/worker/src/dm-routes.ts`). These are
 * the server's, per player and per server, unlike the board settings kept on the device. An answer that
 * is not the expected shape is an error.
 */
import { apiFetch, jsonRequest } from './api';
import { isBool, isRecord } from './parse-core';

export const DM_KINDS = ['trip', 'job', 'finale', 'stall'] as const;
export type DmKind = (typeof DM_KINDS)[number];

export interface Notifications {
  kinds: Record<DmKind, boolean>;
  /** Discord refused the bot's DM: the player must allow DMs from server members, then flip a setting. */
  blocked: boolean;
  /** False when this server cannot send DMs at all (the section is hidden). */
  available: boolean;
}

export function parseNotifications(raw: unknown): Notifications {
  const kinds = isRecord(raw) ? raw['kinds'] : undefined;
  if (
    !isRecord(raw) ||
    !isRecord(kinds) ||
    !DM_KINDS.every((k) => isBool(kinds[k])) ||
    !isBool(raw['blocked']) ||
    !isBool(raw['available'])
  ) {
    throw new Error('The Discord DM settings are not what the game expected.');
  }
  return {
    kinds: {
      trip: kinds['trip'] === true,
      job: kinds['job'] === true,
      finale: kinds['finale'] === true,
      stall: kinds['stall'] === true,
    },
    blocked: raw['blocked'],
    available: raw['available'],
  };
}

export async function fetchNotifications(): Promise<Notifications> {
  return parseNotifications(await apiFetch('/api/notifications'));
}

/** Turns the given kinds on or off; answers the settings as they are now. */
export async function saveNotifications(
  kinds: Partial<Record<DmKind, boolean>>,
): Promise<Notifications> {
  return parseNotifications(await apiFetch('/api/notifications', jsonRequest('PUT', { kinds })));
}

/** What the settings page needs to show and change them (tests and the workbench pass fakes). */
export interface NotificationsApi {
  load: () => Promise<Notifications>;
  save: (kinds: Partial<Record<DmKind, boolean>>) => Promise<Notifications>;
}

export const serverNotifications: NotificationsApi = {
  load: fetchNotifications,
  save: saveNotifications,
};

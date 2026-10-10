import type { LeetSyncStatus } from './api';

/** Short plain-English reasons for the error kinds the server stores. Unknown kinds get a fallback. */
const ERROR_PHRASES = new Map<string, string>(
  Object.entries({
    unauthorized: "the game's key for the leet bot was rejected",
    not_found: "the leet bot doesn't know this server",
    timeout: "the leet bot didn't answer",
    network: "the leet bot didn't answer",
    upstream: "the leet bot didn't answer",
    invalid_response: "the leet bot sent data the game didn't understand",
    disabled: 'leet points are switched off',
  }),
);

export function leetErrorPhrase(kind: string): string {
  return ERROR_PHRASES.get(kind) ?? 'unknown error';
}

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago". Never negative. */
export function relativeTime(then: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - then) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${String(minutes)} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${String(days)} day${days === 1 ? '' : 's'} ago`;
}

/** How often the Activity re-asks the server while the first sync is still running. */
export const SYNC_POLL_INTERVAL_MS = 3000;
export const SYNC_POLL_MAX_ATTEMPTS = 5;

/** An attempt exists, nothing has synced yet and nothing has failed: the first sync is running. */
export function isSyncing(status: LeetSyncStatus): boolean {
  return status.lastAttemptAt !== null && status.lastSyncedAt === null && status.lastError === null;
}

/** Whether to refetch the state: only while syncing, and at most `SYNC_POLL_MAX_ATTEMPTS` times. */
export function shouldRefetchLeet(status: LeetSyncStatus | null, attemptsDone: number): boolean {
  return status !== null && isSyncing(status) && attemptsDone < SYNC_POLL_MAX_ATTEMPTS;
}

export interface LeetStatusLine {
  /** `warning` is shown as an error, `info` as a quiet note. */
  tone: 'info' | 'warning';
  text: string;
}

/** The footer line describing the leet sync, as plain text. */
export function leetStatusLine(status: LeetSyncStatus, now: number): LeetStatusLine {
  if (status.lastError !== null) {
    return {
      tone: 'warning',
      text: `Leet points couldn't be loaded (${status.lastError}): ${leetErrorPhrase(status.lastError)}. Tell the game admin.`,
    };
  }
  if (status.lastAttemptAt === null) {
    return { tone: 'info', text: 'Leet points: not synced yet' };
  }
  if (isSyncing(status)) {
    return { tone: 'info', text: 'Leet points: syncing' };
  }
  if (status.lastSyncedAt === null) {
    return { tone: 'info', text: 'Leet points: not synced yet' };
  }
  const days = status.lastDays;
  const suffix = days === null ? '' : ` (${String(days)} day${days === 1 ? '' : 's'})`;
  return {
    tone: 'info',
    text: `Leet points synced ${relativeTime(status.lastSyncedAt, now)}${suffix}`,
  };
}

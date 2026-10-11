/**
 * The "Raid news" card: which channel the bot posts raid news to. The server decides everything
 * (who may change it, which channel is "here"); the client shows the state it is told and sends
 * the intent `pin` or `unpin`. Channel ids never reach the client.
 */
import { apiFetch } from './api';
import { isBool, isRecord } from './raid-api';

/** The answer of `GET /api/raid/channel` and `POST /api/raid/channel`. */
export interface RaidChannelState {
  /** A channel is pinned for raid news. */
  pinned: boolean;
  /** The pinned channel is the one this Activity was opened in. */
  here: boolean;
  /** The player may pin and unpin (owner, Administrator or Manage Server). */
  canManage: boolean;
}

export type RaidChannelAction = 'pin' | 'unpin';

export function parseRaidChannel(data: unknown): RaidChannelState {
  if (
    !isRecord(data) ||
    !isBool(data['pinned']) ||
    !isBool(data['here']) ||
    !isBool(data['canManage'])
  ) {
    throw new Error('the server returned an unexpected raid news state');
  }
  return { pinned: data['pinned'], here: data['here'], canManage: data['canManage'] };
}

export const RAID_NEWS_HELP = 'The bot needs View Channel and Send Messages in this channel.';

export interface RaidNewsButton {
  action: RaidChannelAction;
  label: string;
}

export interface RaidNewsCard {
  title: string;
  /** What is true now, in one line. */
  status: string;
  buttons: RaidNewsButton[];
  help: string;
}

const PIN_BUTTON: RaidNewsButton = { action: 'pin', label: 'Post raid news in this channel' };
const UNPIN_BUTTON: RaidNewsButton = { action: 'unpin', label: 'Stop pinning' };

/** The card to show, or null when the player may not change the channel (then nothing is shown). */
export function raidNewsCard(state: RaidChannelState): RaidNewsCard | null {
  if (!state.canManage) return null;
  if (!state.pinned) {
    return {
      title: 'Raid news',
      status: 'Raid news goes to the channel the game was opened in most recently.',
      buttons: [PIN_BUTTON],
      help: RAID_NEWS_HELP,
    };
  }
  if (state.here) {
    return {
      title: 'Raid news',
      status: 'Raid news posts here',
      buttons: [UNPIN_BUTTON],
      help: RAID_NEWS_HELP,
    };
  }
  return {
    title: 'Raid news',
    status: 'Raid news goes to another channel',
    buttons: [PIN_BUTTON, UNPIN_BUTTON],
    help: RAID_NEWS_HELP,
  };
}

export async function fetchRaidChannel(): Promise<RaidChannelState> {
  return parseRaidChannel(await apiFetch('/api/raid/channel'));
}

export async function setRaidChannel(action: RaidChannelAction): Promise<RaidChannelState> {
  return parseRaidChannel(
    await apiFetch('/api/raid/channel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    }),
  );
}

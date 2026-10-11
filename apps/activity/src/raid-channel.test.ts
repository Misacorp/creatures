import { beforeEach, describe, expect, it, vi } from 'vitest';
import raidChannel from './fixtures/raid-channel.json';
import requestBodies from './fixtures/request-bodies.json';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  apiFetch,
}));

import { ApiError } from './api';
import { errorText } from './game';
import {
  RAID_NEWS_HELP,
  fetchRaidChannel,
  parseRaidChannel,
  raidNewsCard,
  setRaidChannel,
} from './raid-channel';

describe('parseRaidChannel', () => {
  it('reads the server answer (the saved fixture)', () => {
    expect(parseRaidChannel(raidChannel)).toEqual({ pinned: true, here: true, canManage: true });
  });

  it('keeps only the three flags', () => {
    expect(
      parseRaidChannel({ pinned: false, here: false, canManage: false, channelId: '1234' }),
    ).toEqual({ pinned: false, here: false, canManage: false });
  });

  it('refuses anything else', () => {
    const bad: unknown[] = [
      null,
      'x',
      [],
      {},
      { pinned: true, here: true },
      { pinned: true, here: true, canManage: null },
      { pinned: 'yes', here: true, canManage: true },
      { pinned: 1, here: 0, canManage: 1 },
    ];
    for (const value of bad) {
      expect(() => parseRaidChannel(value), JSON.stringify(value)).toThrow(/unexpected/);
    }
  });
});

describe('raidNewsCard', () => {
  it('shows nothing to people who cannot manage the server', () => {
    for (const [pinned, here] of [
      [false, false],
      [true, true],
      [true, false],
    ] as const) {
      expect(raidNewsCard({ pinned, here, canManage: false })).toBeNull();
    }
  });

  it('offers to pin when nothing is pinned', () => {
    const card = raidNewsCard({ pinned: false, here: false, canManage: true });
    expect(card?.buttons).toEqual([{ action: 'pin', label: 'Post raid news in this channel' }]);
    expect(card?.status).toContain('most recently');
  });

  it('says the news posts here, and offers to stop', () => {
    const card = raidNewsCard({ pinned: true, here: true, canManage: true });
    expect(card?.status).toBe('Raid news posts here');
    expect(card?.buttons).toEqual([{ action: 'unpin', label: 'Stop pinning' }]);
  });

  it('says the news goes to another channel, and offers to pin here or stop', () => {
    const card = raidNewsCard({ pinned: true, here: false, canManage: true });
    expect(card?.status).toBe('Raid news goes to another channel');
    expect(card?.buttons).toEqual([
      { action: 'pin', label: 'Post raid news in this channel' },
      { action: 'unpin', label: 'Stop pinning' },
    ]);
  });

  it('always explains what the bot needs, in plain words', () => {
    expect(RAID_NEWS_HELP).toBe('The bot needs View Channel and Send Messages in this channel.');
    for (const [pinned, here] of [
      [false, false],
      [true, true],
      [true, false],
    ] as const) {
      expect(raidNewsCard({ pinned, here, canManage: true })?.help).toBe(RAID_NEWS_HELP);
    }
  });
});

describe('the requests', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('reads the state with a plain GET', async () => {
    apiFetch.mockResolvedValue(raidChannel);
    expect(await fetchRaidChannel()).toEqual({ pinned: true, here: true, canManage: true });
    expect(apiFetch).toHaveBeenCalledWith('/api/raid/channel');
  });

  it('sends only the action: the server decides the channel (fixtures/request-bodies.json)', async () => {
    apiFetch.mockResolvedValue(raidChannel);
    for (const action of ['pin', 'unpin'] as const) {
      apiFetch.mockClear();
      await setRaidChannel(action);
      const [path, init] = apiFetch.mock.calls[0] as [string, RequestInit];
      const expected = requestBodies[action === 'pin' ? 'channel-pin' : 'channel-unpin'];
      const body: unknown = JSON.parse(init.body as string);
      expect({ path, method: init.method, body }).toEqual(expected);
      expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    }
  });

  it('rejects a reply of the wrong shape', async () => {
    apiFetch.mockResolvedValue({ ok: true });
    await expect(setRaidChannel('pin')).rejects.toThrow(/unexpected/);
  });
});

describe('error texts', () => {
  it('has plain words for what the channel routes can refuse', () => {
    for (const [status, code] of [
      [403, 'forbidden'],
      [503, 'discord_unavailable'],
      [409, 'channel_unknown'],
      [429, 'rate_limited'],
    ] as const) {
      const text = errorText(new ApiError(status, code));
      expect(text, code).not.toMatch(/^Something went wrong/);
    }
    expect(errorText(new ApiError(403, 'forbidden'))).toContain('manage the server');
  });
});

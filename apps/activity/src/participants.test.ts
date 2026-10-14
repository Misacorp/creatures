import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  aloneParticipants,
  discordParticipants,
  participantIds,
  type ParticipantSdk,
} from './participants';

describe('participantIds', () => {
  it('puts the player first and lists each human once', () => {
    expect(
      participantIds([{ id: '22' }, { id: '11' }, { id: '22' }, { id: '33', bot: false }], '11'),
    ).toEqual(['11', '22', '33']);
  });

  it('adds the player even when Discord does not list them', () => {
    expect(participantIds([{ id: '22' }], '11')).toEqual(['11', '22']);
  });

  it('drops bots and anything that is not a snowflake', () => {
    expect(
      participantIds([{ id: '44', bot: true }, { id: 'abc' }, { id: '' }, { id: '12 34' }], '11'),
    ).toEqual(['11']);
  });
});

describe('aloneParticipants', () => {
  it('is just the player and never changes', () => {
    const source = aloneParticipants('11', 'i1');
    expect(source.ids()).toEqual(['11']);
    expect(source.instanceId).toBe('i1');
    expect(() => source.subscribe(() => undefined)()).not.toThrow();
  });
});

type Listener = (event: { participants: { id: string; bot?: boolean }[] }) => unknown;

function fakeSdk(first: () => Promise<{ participants: { id: string; bot?: boolean }[] }>) {
  const listeners = new Set<Listener>();
  const calls = { subscribe: 0, unsubscribe: 0 };
  const sdk: ParticipantSdk = {
    instanceId: 'instance-1',
    commands: { getInstanceConnectedParticipants: first },
    subscribe: (_event, listener) => {
      calls.subscribe += 1;
      listeners.add(listener);
      return Promise.resolve();
    },
    unsubscribe: (_event, listener) => {
      calls.unsubscribe += 1;
      listeners.delete(listener);
      return Promise.resolve();
    },
  };
  return {
    sdk,
    calls,
    emit: (participants: { id: string; bot?: boolean }[]) => {
      for (const l of [...listeners]) l({ participants });
    },
    count: () => listeners.size,
  };
}

describe('discordParticipants', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads the participants once and exposes the instance id', async () => {
    const { sdk } = fakeSdk(() => Promise.resolve({ participants: [{ id: '22' }, { id: '11' }] }));
    const source = await discordParticipants(sdk, '11');
    expect(source.ids()).toEqual(['11', '22']);
    expect(source.instanceId).toBe('instance-1');
  });

  it('falls back to just the player when the call fails', async () => {
    const { sdk } = fakeSdk(() => Promise.reject(new Error('no')));
    const source = await discordParticipants(sdk, '11');
    expect(source.ids()).toEqual(['11']);
  });

  it('falls back to just the player when Discord does not answer in time', async () => {
    const { sdk } = fakeSdk(() => new Promise(() => undefined));
    const pending = discordParticipants(sdk, '11');
    await vi.advanceTimersByTimeAsync(3000);
    expect((await pending).ids()).toEqual(['11']);
  });

  it('follows updates while subscribed and stops when the last subscriber leaves', async () => {
    const fake = fakeSdk(() => Promise.resolve({ participants: [{ id: '11' }] }));
    const source = await discordParticipants(fake.sdk, '11');
    const seen: string[][] = [];
    const stop = source.subscribe(() => {
      seen.push([...source.ids()]);
    });
    const stopSecond = source.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.calls.subscribe).toBe(1);

    fake.emit([{ id: '11' }, { id: '22' }, { id: '33', bot: true }]);
    expect(seen).toEqual([['11', '22']]);

    stop();
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.calls.unsubscribe).toBe(0);
    stopSecond();
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.calls.unsubscribe).toBe(1);
    expect(fake.count()).toBe(0);
  });

  it('survives a subscribe that fails', async () => {
    const fake = fakeSdk(() => Promise.resolve({ participants: [{ id: '11' }] }));
    fake.sdk.subscribe = () => Promise.reject(new Error('denied'));
    const source = await discordParticipants(fake.sdk, '11');
    expect(() => source.subscribe(() => undefined)()).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);
    expect(source.ids()).toEqual(['11']);
  });
});

import { describe, expect, it } from 'vitest';
import { createReauth } from './reauth';

class Expired extends Error {}
const isSessionExpired = (err: unknown): boolean => err instanceof Expired;

/** A fake "server": calls fail with Expired until a re-auth has happened. */
function setup(reauthResult: 'ok' | 'fail' = 'ok') {
  const state = { signedIn: false, reauths: 0, calls: 0 };
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reauth = createReauth({
    isSessionExpired,
    reauthenticate: async () => {
      state.reauths++;
      await gate;
      if (reauthResult === 'fail') throw new Error('authorize failed');
      state.signedIn = true;
    },
  });
  const task = () => {
    state.calls++;
    return state.signedIn ? Promise.resolve('done') : Promise.reject(new Expired('expired'));
  };
  return { state, reauth, task, release };
}

describe('createReauth', () => {
  it('passes through success without signing in', async () => {
    const { reauth, state } = setup();
    expect(await reauth.run(() => Promise.resolve(1))).toBe(1);
    expect(state.reauths).toBe(0);
  });

  it('does not retry other errors', async () => {
    const { reauth, state } = setup();
    let calls = 0;
    await expect(
      reauth.run(() => {
        calls++;
        return Promise.reject(new Error('conflict'));
      }),
    ).rejects.toThrow('conflict');
    expect(calls).toBe(1);
    expect(state.reauths).toBe(0);
  });

  it('signs in again and retries once on an expired session', async () => {
    const { reauth, state, task, release } = setup();
    release();
    expect(await reauth.run(task)).toBe('done');
    expect(state.reauths).toBe(1);
    expect(state.calls).toBe(2);
  });

  it('retries the same closure, so it keeps its idempotency key', async () => {
    const { reauth, state, release } = setup();
    release();
    const keys: string[] = [];
    const key = 'key-1';
    const result = await reauth.run(() => {
      keys.push(key);
      return state.signedIn ? Promise.resolve('ok') : Promise.reject(new Expired('x'));
    });
    expect(result).toBe('ok');
    expect(keys).toEqual(['key-1', 'key-1']);
  });

  it('shares one sign-in between concurrent requests', async () => {
    const { reauth, state, task, release } = setup();
    const all = Promise.all([reauth.run(task), reauth.run(task), reauth.run(task)]);
    await Promise.resolve();
    release();
    expect(await all).toEqual(['done', 'done', 'done']);
    expect(state.reauths).toBe(1);
    expect(state.calls).toBe(6);
  });

  it('does not sign in again for a request that failed on the old session', async () => {
    const { reauth, state, task, release } = setup();
    release();
    let resolveSlow: (value: string) => void = () => undefined;
    let slowCalls = 0;
    const slow = () => {
      slowCalls++;
      if (slowCalls === 1) {
        return new Promise<string>((_, reject) => {
          resolveSlow = () => {
            reject(new Expired('old session'));
          };
        });
      }
      return Promise.resolve('slow done');
    };
    const slowRun = reauth.run(slow);
    // Another request fails and signs in again while the slow one is still on the old session.
    expect(await reauth.run(task)).toBe('done');
    expect(state.reauths).toBe(1);
    resolveSlow('');
    expect(await slowRun).toBe('slow done');
    expect(state.reauths).toBe(1);
  });

  it('retries at most once per request', async () => {
    const { reauth, state, release } = setup();
    release();
    let calls = 0;
    await expect(
      reauth.run(() => {
        calls++;
        return Promise.reject(new Expired('still expired'));
      }),
    ).rejects.toBeInstanceOf(Expired);
    expect(calls).toBe(2);
    expect(state.reauths).toBe(1);
  });

  it('throws the original error when signing in fails, and allows a later attempt', async () => {
    const { reauth, state, task, release } = setup('fail');
    release();
    await expect(reauth.run(task)).rejects.toThrow('expired');
    expect(state.calls).toBe(1);
    await expect(reauth.run(task)).rejects.toThrow('expired');
    expect(state.reauths).toBe(2);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import { createKeyStore, isStaleError } from './actions';
import { createActionRunner, type ActionRunnerConfig } from './action-runner';
import { errorText } from './game';

/** The runner with numbered keys, and a log of what it showed on the screen. */
function setup(overrides: Partial<ActionRunnerConfig> = {}) {
  let n = 0;
  const generated: string[] = [];
  const keys = createKeyStore(() => {
    const key = `key-${String(++n)}`;
    generated.push(key);
    return key;
  });
  const log: string[] = [];
  const mounted = { current: true };
  const runner = createActionRunner(() => ({
    keys,
    errorText,
    isStale: isStaleError,
    setBusy: (busy) => log.push(`busy:${String(busy)}`),
    setError: (text) => log.push(`error:${String(text)}`),
    setNotice: (text) => log.push(`notice:${String(text)}`),
    isMounted: () => mounted.current,
    ...overrides,
  }));
  return { runner, keys, log, generated, mounted };
}

/** A task that sees the key it was given and then fails or succeeds as told. */
function recorder() {
  const seen: string[] = [];
  const attempt =
    (outcome: () => unknown) =>
    (key: string): Promise<string> => {
      seen.push(key);
      return Promise.resolve().then(() => String(outcome()));
    };
  return { seen, attempt };
}

const fail = (err: unknown) => () => {
  throw err;
};

describe('idempotency keys of the runner', () => {
  it('reuses the key when the outcome is unknown, and drops it after any definite answer', async () => {
    const { runner } = setup();
    const { seen, attempt } = recorder();
    await runner.runKeyed('train:c1', attempt(fail(new TypeError('network')))); // no answer at all
    await runner.runKeyed('train:c1', attempt(fail(new ApiError(500, 'internal_error'))));
    await runner.runKeyed('train:c1', attempt(fail(new ApiError(429, 'rate_limited'))));
    await runner.runKeyed(
      'train:c1',
      attempt(() => 'ok'),
    ); // succeeds with the same key
    await runner.runKeyed('train:c1', attempt(fail(new ApiError(409, 'insufficient_funds')))); // new intent
    await runner.runKeyed('train:c1', attempt(fail(new ApiError(400, 'invalid_body')))); // definite no: dropped
    await runner.runKeyed(
      'train:c1',
      attempt(() => 'ok'),
    );
    expect(seen).toEqual(['key-1', 'key-1', 'key-1', 'key-1', 'key-2', 'key-3', 'key-4']);
  });

  it('gives a new key after a success, so the next tap is a new intent', async () => {
    const { runner } = setup();
    const { seen, attempt } = recorder();
    await runner.runKeyed(
      'upgrade:g',
      attempt(() => 'ok'),
    );
    await runner.runKeyed(
      'upgrade:g',
      attempt(() => 'ok'),
    );
    expect(seen).toEqual(['key-1', 'key-2']);
  });

  it('keeps a different key for a different intent, and never hands one key to two intents', async () => {
    const { runner } = setup();
    const { seen, attempt } = recorder();
    // Both are left with an unknown outcome, so both keys stay in the store.
    await runner.runKeyed('send:c1:meadow', attempt(fail(new TypeError('network'))));
    await runner.runKeyed('send:c2:meadow', attempt(fail(new TypeError('network'))));
    await runner.runKeyed(
      'send:c1:meadow',
      attempt(() => 'ok'),
    );
    await runner.runKeyed(
      'send:c2:meadow',
      attempt(() => 'ok'),
    );
    expect(seen).toEqual(['key-1', 'key-2', 'key-1', 'key-2']);
  });

  it('turns a second action away while one runs, without making a key for it', async () => {
    const { runner, generated } = setup();
    let finish: (value: string) => void = () => undefined;
    const slow = runner.runKeyed(
      'train:c1',
      () => new Promise<string>((resolve) => (finish = resolve)),
    );
    expect(runner.inFlight()).toBe(true);
    const task = vi.fn(() => Promise.resolve('never'));
    expect(await runner.runKeyed('train:c2', task)).toBeUndefined();
    expect(await runner.run(task)).toBeUndefined();
    expect(task).not.toHaveBeenCalled();
    expect(generated).toEqual(['key-1']);
    finish('done');
    expect(await slow).toBe('done');
    expect(runner.inFlight()).toBe(false);
  });

  it('keeps no key for an action without one', async () => {
    const { runner, generated, keys } = setup();
    const spy = vi.spyOn(keys, 'keyFor');
    expect(await runner.run(() => Promise.resolve('ok'))).toBe('ok');
    await runner.run(() => Promise.reject(new TypeError('network')));
    expect(spy).not.toHaveBeenCalled();
    expect(generated).toEqual([]);
  });

  it('makes the key only when the task starts', async () => {
    const { runner } = setup();
    const { seen, attempt } = recorder();
    await runner.runKeyed(
      'claim-job:j',
      attempt(() => 'ok'),
    );
    expect(seen).toEqual(['key-1']);
  });
});

describe('what the runner shows', () => {
  it('turns busy on and clears the error and notice while it runs, and busy off at the end', async () => {
    const { runner, log } = setup();
    expect(await runner.run(() => Promise.resolve(7))).toBe(7);
    expect(log).toEqual(['busy:true', 'error:null', 'notice:null', 'busy:false']);
  });

  it('shows the words of the failure, with the currency that ran out', async () => {
    const { runner, log } = setup();
    expect(await runner.run(fail(new ApiError(409, 'insufficient_funds')))).toBeUndefined();
    await runner.run(fail(new ApiError(409, 'insufficient_funds')), { currency: 'Essence' });
    await runner.run(fail(new TypeError('Failed to fetch')));
    expect(log.filter((line) => line.startsWith('error:') && line !== 'error:null')).toEqual([
      'error:Not enough Bait.',
      'error:Not enough Essence.',
      'error:Could not reach the server. Check your connection and try again.',
    ]);
  });

  it('uses the words the screen gives it', async () => {
    const { runner, log } = setup({ errorText: () => 'custom words' });
    await runner.run(fail(new Error('x')));
    expect(log).toContain('error:custom words');
  });

  it('runs onStart when a run starts, before busy', async () => {
    const onStart = vi.fn();
    const { runner } = setup({ onStart });
    await runner.run(() => Promise.resolve(1));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('does not run onStart for a turned-away action', async () => {
    const onStart = vi.fn();
    const { runner } = setup({ onStart });
    let finish: () => void = () => undefined;
    const slow = runner.run(() => new Promise<void>((resolve) => (finish = resolve)));
    await runner.run(() => Promise.resolve(1));
    finish();
    await slow;
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});

describe('the reload after a stale "no"', () => {
  it('reloads after a 404 or 409, with busy still on, and shows the error first', async () => {
    const order: string[] = [];
    const onStale = vi.fn(async () => {
      order.push('reload start');
      await Promise.resolve();
      order.push('reload end');
    });
    const { runner } = setup({
      onStale,
      setBusy: (busy) => order.push(`busy:${String(busy)}`),
      setError: (text) => order.push(`error:${String(text)}`),
    });
    await runner.run(fail(new ApiError(404, 'not_found')));
    expect(order).toEqual([
      'busy:true',
      'error:null',
      'error:That no longer exists. The page was refreshed.',
      'reload start',
      'reload end',
      'busy:false',
    ]);
    await runner.run(fail(new ApiError(409, 'slot_taken')));
    expect(onStale).toHaveBeenCalledTimes(2);
  });

  it('does not reload after other failures, or after a success', async () => {
    const onStale = vi.fn();
    const { runner } = setup({ onStale });
    await runner.run(fail(new ApiError(400, 'invalid_body')));
    await runner.run(fail(new ApiError(500, 'internal_error')));
    await runner.run(fail(new TypeError('offline')));
    await runner.run(() => Promise.resolve(1));
    expect(onStale).not.toHaveBeenCalled();
  });

  it('keeps the error and ends the run when the reload itself fails', async () => {
    const { runner, log } = setup({ onStale: () => Promise.reject(new Error('offline')) });
    expect(await runner.run(fail(new ApiError(409, 'locked')))).toBeUndefined();
    expect(log.at(-1)).toBe('busy:false');
    expect(runner.inFlight()).toBe(false);
  });

  it('can be turned off for one run', async () => {
    const onStale = vi.fn();
    const { runner } = setup({ onStale });
    await runner.run(fail(new ApiError(404, 'not_found')), { reload: false });
    expect(onStale).not.toHaveBeenCalled();
  });

  it('asks the screen what stale means', async () => {
    const onStale = vi.fn();
    const isStale = (err: unknown) => err instanceof ApiError && err.code === 'already_run';
    const { runner } = setup({ onStale, isStale });
    await runner.run(fail(new ApiError(409, 'key_conflict')));
    expect(onStale).not.toHaveBeenCalled();
    await runner.run(fail(new ApiError(409, 'already_run')));
    expect(onStale).toHaveBeenCalledTimes(1);
  });

  it('calls onFail after the error is shown, and still settles the key', async () => {
    const order: string[] = [];
    const { runner } = setup({
      setError: (text) => order.push(`error:${String(text)}`),
      onFail: () => order.push('fail'),
    });
    const { seen, attempt } = recorder();
    await runner.runKeyed('train:c1', attempt(fail(new ApiError(409, 'level_cap'))));
    await runner.runKeyed(
      'train:c1',
      attempt(() => 'ok'),
    );
    expect(order).toEqual([
      'error:null',
      'error:That creature is at its level cap.',
      'fail',
      'error:null',
    ]);
    expect(seen).toEqual(['key-1', 'key-2']);
  });
});

describe('a screen that is gone', () => {
  it('sets nothing on it and does not reload, but still settles the key', async () => {
    const onStale = vi.fn();
    const onFail = vi.fn();
    const { runner, log, mounted } = setup({ onStale, onFail });
    const { seen, attempt } = recorder();
    const run = runner.runKeyed('dungeon-run:x', async (key) => {
      mounted.current = false;
      return attempt(fail(new ApiError(409, 'already_run')))(key);
    });
    await run;
    expect(log).toEqual(['busy:true', 'error:null', 'notice:null']);
    expect(onStale).not.toHaveBeenCalled();
    expect(onFail).not.toHaveBeenCalled();
    await runner.runKeyed(
      'dungeon-run:x',
      attempt(() => 'ok'),
    );
    expect(seen).toEqual(['key-1', 'key-2']);
    expect(runner.inFlight()).toBe(false);
  });
});

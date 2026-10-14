import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import { createKeyStore } from './actions';
import { createActionRunner } from './action-runner';
import { errorText } from './game';
import { createGearActions } from './gear-actions';
import type { GearAction } from './gear-api';

/** The real runner (as `Game` uses it) with a key store that hands out numbered keys. */
function setup(ids: string[] = ['key-1', 'key-2', 'key-3']) {
  const queue = [...ids];
  const keys = createKeyStore(() => queue.shift() ?? 'out-of-keys');
  const applied: unknown[] = [];
  const runner = createActionRunner(() => ({
    keys,
    errorText,
    isStale: () => false,
    setBusy: () => undefined,
    setError: () => undefined,
    setNotice: () => undefined,
    isMounted: () => true,
  }));
  const answer = (result: unknown) =>
    ({
      result,
      gear: { marker: 'gear' },
      state: { marker: 'state' },
    }) as unknown as GearAction<never>;
  const server = {
    equipGear: vi.fn(),
    upgradeGear: vi.fn(),
    dismantleGear: vi.fn(),
    startJob: vi.fn(),
    claimJob: vi.fn(),
  };
  const actions = createGearActions({
    run: runner.run,
    runKeyed: runner.runKeyed,
    apply: (views) => applied.push(views),
    server,
  });
  return { actions, server, applied, answer };
}

describe('gear actions', () => {
  it('applies the gear view and the collection of an answer and returns the result', async () => {
    const { actions, server, applied, answer } = setup();
    server.upgradeGear.mockResolvedValue(answer({ gearId: 'g', level: 2 }));
    expect(await actions.upgrade('g')).toEqual({ gearId: 'g', level: 2 });
    expect(applied).toEqual([
      { result: { gearId: 'g', level: 2 }, gear: { marker: 'gear' }, state: { marker: 'state' } },
    ]);
  });

  it('applies nothing and returns nothing when the server says no', async () => {
    const { actions, server, applied } = setup();
    server.dismantleGear.mockRejectedValue(new ApiError(409, 'item_busy'));
    expect(await actions.dismantle('g')).toBeUndefined();
    expect(applied).toEqual([]);
  });

  it('sends the same key again after an unknown outcome, and a new one after a definite answer', async () => {
    const { actions, server, answer } = setup();
    server.upgradeGear
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(answer({ gearId: 'g', level: 1 }))
      .mockRejectedValueOnce(new ApiError(409, 'insufficient_funds'))
      .mockResolvedValue(answer({ gearId: 'g', level: 2 }));
    await actions.upgrade('g'); // network error: unknown outcome
    await actions.upgrade('g'); // retry: same key, succeeds
    await actions.upgrade('g'); // next upgrade: a new key, refused
    await actions.upgrade('g'); // refused is definite: a new key again
    const keysSent = server.upgradeGear.mock.calls.map((call) => call[1] as string);
    expect(keysSent).toEqual(['key-1', 'key-1', 'key-2', 'key-3']);
  });

  it('keeps one key per job until the server answers, and a different one for another job', async () => {
    const { actions, server, answer } = setup();
    server.startJob
      .mockRejectedValueOnce(new ApiError(500, 'internal_error'))
      .mockResolvedValue(answer({ jobId: 'j' }));
    const craft = { kind: 'craft', creatureId: 'c1', blueprintId: 'wave-band' } as const;
    await actions.startJob(craft);
    await actions.startJob(craft);
    await actions.startJob({ ...craft, creatureId: 'c2' });
    const sent = server.startJob.mock.calls.map((call) => call[0] as Record<string, unknown>);
    expect(sent.map((r) => r['idempotencyKey'])).toEqual(['key-1', 'key-1', 'key-2']);
    expect(sent[0]).toEqual({ ...craft, idempotencyKey: 'key-1' });
  });

  it('claims a job and dismantles with their own keys', async () => {
    const { actions, server, answer } = setup();
    server.claimJob.mockResolvedValue(answer({ kind: 'enchant' }));
    server.dismantleGear.mockResolvedValue(answer({ gearId: 'g' }));
    await actions.claimJob('job-1');
    await actions.dismantle('g');
    expect(server.claimJob).toHaveBeenCalledWith('job-1', 'key-1');
    expect(server.dismantleGear).toHaveBeenCalledWith('g', 'key-2');
  });

  it('equips without a key, and takes off with null', async () => {
    const { actions, server, answer } = setup();
    server.equipGear.mockResolvedValue(answer({}));
    await actions.equip('g', 'c');
    await actions.equip('g', null);
    expect(server.equipGear.mock.calls).toEqual([
      ['g', 'c'],
      ['g', null],
    ]);
  });

  it('says Essence when an upgrade is refused for money', async () => {
    const seen: (string | undefined)[] = [];
    const actions = createGearActions({
      run: () => Promise.resolve(undefined),
      runKeyed: (_action, _task, options) => {
        seen.push(options?.currency);
        return Promise.resolve(undefined);
      },
      apply: () => undefined,
    });
    await actions.upgrade('g');
    await actions.dismantle('g');
    expect(seen).toEqual(['Essence', undefined]);
  });

  it('turns a second action away while one runs, and applies nothing for it', async () => {
    const { actions, server, applied, answer } = setup();
    let finish: (value: GearAction<never>) => void = () => undefined;
    server.upgradeGear.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const first = actions.upgrade('g');
    expect(await actions.dismantle('g')).toBeUndefined();
    expect(server.dismantleGear).not.toHaveBeenCalled();
    finish(answer({ gearId: 'g', level: 2 }));
    await first;
    expect(applied).toHaveLength(1);
  });
});

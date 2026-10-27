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
    equipBestGear: vi.fn(),
    checkDismantle: vi.fn(),
    dismantlePile: vi.fn(),
    dismissGearNotice: vi.fn(),
    startJob: vi.fn(),
    claimJob: vi.fn(),
    previewCraft: vi.fn(),
    previewDismantle: vi.fn(),
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
  const dismantle = {
    kind: 'supply',
    creatureId: 'c1',
    supplyId: 'trail-snack',
  } as const;

  it('applies the gear view and the collection of an answer and returns the result', async () => {
    const { actions, server, applied, answer } = setup();
    server.startJob.mockResolvedValue(answer({ jobId: 'j' }));
    expect(await actions.startJob(dismantle)).toEqual({ jobId: 'j' });
    expect(applied).toEqual([
      {
        result: { jobId: 'j' },
        gear: { marker: 'gear' },
        state: { marker: 'state' },
      },
    ]);
  });

  it('applies nothing and returns nothing when the server says no', async () => {
    const { actions, server, applied } = setup();
    server.startJob.mockRejectedValue(new ApiError(409, 'creature_on_job'));
    expect(await actions.startJob(dismantle)).toBeUndefined();
    expect(applied).toEqual([]);
  });

  it('sends the same key again after an unknown outcome, and a new one after a definite answer', async () => {
    const { actions, server, answer } = setup();
    server.startJob
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(answer({ jobId: 'j' }))
      .mockRejectedValueOnce(new ApiError(409, 'workshop_full'))
      .mockResolvedValue(answer({ jobId: 'j' }));
    await actions.startJob(dismantle); // network error: unknown outcome
    await actions.startJob(dismantle); // retry: same key, succeeds
    await actions.startJob(dismantle); // next job: a new key, refused
    await actions.startJob(dismantle); // refused is definite: a new key again
    const keysSent = server.startJob.mock.calls.map(
      (call) => (call[0] as Record<string, unknown>)['idempotencyKey'],
    );
    expect(keysSent).toEqual(['key-1', 'key-1', 'key-2', 'key-3']);
  });

  it('keeps one key per job until the server answers, and a different one for another job', async () => {
    const { actions, server, answer } = setup();
    server.startJob
      .mockRejectedValueOnce(new ApiError(500, 'internal_error'))
      .mockResolvedValue(answer({ jobId: 'j' }));
    const craft = {
      kind: 'craft',
      creatureId: 'c1',
      blueprintId: 'wave-band',
      reach: 'none',
    } as const;
    await actions.startJob(craft);
    await actions.startJob(craft);
    await actions.startJob({ ...craft, creatureId: 'c2' });
    // The same craft aimed at a Rare is a different intent: it never reuses the plain craft's key.
    await actions.startJob({ ...craft, creatureId: 'c2', reach: 'rare' });
    const sent = server.startJob.mock.calls.map((call) => call[0] as Record<string, unknown>);
    expect(sent.map((r) => r['idempotencyKey'])).toEqual(['key-1', 'key-1', 'key-2', 'key-3']);
    expect(sent[0]).toEqual({ ...craft, idempotencyKey: 'key-1' });
  });

  it('claims a job and starts another with their own keys', async () => {
    const { actions, server, answer } = setup();
    server.claimJob.mockResolvedValue(answer({ kind: 'craft' }));
    server.startJob.mockResolvedValue(answer({ jobId: 'j' }));
    await actions.claimJob('job-1');
    await actions.startJob(dismantle);
    expect(server.claimJob).toHaveBeenCalledWith('job-1', 'key-1');
    expect(server.startJob).toHaveBeenCalledWith({ ...dismantle, idempotencyKey: 'key-2' });
  });

  it('asks for a preview without a key and applies nothing', async () => {
    const { actions, server, applied } = setup();
    server.previewCraft.mockResolvedValue({ kind: 'craft' });
    server.previewDismantle.mockResolvedValue({ kind: 'dismantle' });
    expect(await actions.previewCraft('c1', 'kelp-cap')).toEqual({ kind: 'craft' });
    expect(await actions.previewDismantle('c1', ['a', 'b'])).toEqual({ kind: 'dismantle' });
    expect(server.previewCraft).toHaveBeenCalledWith('c1', 'kelp-cap');
    expect(server.previewDismantle).toHaveBeenCalledWith('c1', ['a', 'b']);
    expect(applied).toEqual([]);
  });

  it('asks which items cannot go without a key and applies nothing', async () => {
    const { actions, server, applied } = setup();
    server.checkDismantle.mockResolvedValue({
      locked: [{ itemId: 'a', creatureId: 'c1', reason: 'trip' }],
    });
    expect(await actions.checkDismantle(['a', 'b'])).toEqual({
      locked: [{ itemId: 'a', creatureId: 'c1', reason: 'trip' }],
    });
    expect(server.checkDismantle).toHaveBeenCalledWith(['a', 'b']);
    expect(applied).toEqual([]);
  });

  it('dismantles the pile with a key per pile: kept after an unknown outcome, new after a definite answer', async () => {
    const { actions, server, answer } = setup();
    server.dismantlePile
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(answer({ kind: 'dismantle' }))
      .mockRejectedValueOnce(new ApiError(409, 'marks_changed'))
      .mockResolvedValue(answer({ kind: 'dismantle' }));
    await actions.dismantlePile('c1', ['b', 'a']); // network error: unknown outcome
    await actions.dismantlePile('c1', ['a', 'b']); // the same pile in another order: same key
    await actions.dismantlePile('c1', ['a', 'b']); // refused: a definite answer
    await actions.dismantlePile('c1', ['a', 'b']); // a new key
    expect(server.dismantlePile.mock.calls.map((c) => c[2] as string)).toEqual([
      'key-1',
      'key-1',
      'key-2',
      'key-3',
    ]);
    expect(server.dismantlePile.mock.calls[0]?.slice(0, 2)).toEqual(['c1', ['b', 'a']]);
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

  it('asks Equip best for the creatures it is given, and dismisses the notice, without keys', async () => {
    const { actions, server, answer } = setup();
    server.equipBestGear.mockResolvedValue(answer({ changes: [], skipped: [] }));
    server.dismissGearNotice.mockResolvedValue(answer({ dismissed: true }));
    expect(await actions.equipBest(['c1', 'c2'])).toEqual({ changes: [], skipped: [] });
    expect(await actions.dismissNotice()).toEqual({ dismissed: true });
    expect(server.equipBestGear).toHaveBeenCalledWith(['c1', 'c2']);
    expect(server.dismissGearNotice).toHaveBeenCalledOnce();
  });

  it('turns a second action away while one runs, and applies nothing for it', async () => {
    const { actions, server, applied, answer } = setup();
    let finish: (value: GearAction<never>) => void = () => undefined;
    server.startJob.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const first = actions.startJob(dismantle);
    expect(await actions.equipBest(['c'])).toBeUndefined();
    expect(server.equipBestGear).not.toHaveBeenCalled();
    finish(answer({ jobId: 'j' }));
    await first;
    expect(applied).toHaveLength(1);
  });
});

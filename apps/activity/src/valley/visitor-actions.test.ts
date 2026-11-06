import { describe, expect, it, vi } from 'vitest';
import { createKeyStore } from '../actions';
import { createActionRunner } from '../action-runner';
import { ApiError, type VisitorState } from '../api';
import { errorText } from '../game';
import type { GearItem } from '../gear-types';
import { createVisitorActions, isAway, type VisitorDeps } from './visitor-actions';
import { SAMPLE_GEAR, rerolled, sampleVisitor } from './visitor-sample';

const items = SAMPLE_GEAR.items;
const found = items.find((i) => i.baseId === 'emberkeepers-crown');
if (found === undefined) throw new Error('fixture');
const hat: GearItem = found;

/** The real runner (as `Game` uses it) with numbered keys, and a screen that remembers what it was told. */
function setup(ids: string[] = ['key-1', 'key-2', 'key-3']) {
  const queue = [...ids];
  const keys = createKeyStore(() => queue.shift() ?? 'out-of-keys');
  const errors: (string | null)[] = [];
  const runner = createActionRunner(() => ({
    keys,
    errorText,
    isStale: () => false,
    setBusy: () => undefined,
    setError: (text) => errors.push(text),
    setNotice: () => undefined,
    isMounted: () => true,
  }));
  const screen = {
    visitor: sampleVisitor() as VisitorState | null,
    gear: [] as unknown[],
    valley: 0,
    errors: [] as (string | null)[],
  };
  const rerolled1 = rerolled(hat);
  const server = {
    fetchVisitor: vi.fn(),
    rerollWithVisitor: vi.fn(),
    buyVisitorBlueprint: vi.fn(),
    fetchGear: vi.fn(),
  };
  const deps: VisitorDeps = {
    run: runner.run,
    runKeyed: runner.runKeyed,
    items: () => items,
    rerolls: () => (screen.visitor?.here === true ? screen.visitor.rerolls : 0),
    takeValley: () => {
      screen.valley += 1;
      return true;
    },
    replaceGear: (gear) => screen.gear.push(gear),
    setVisitor: (update) => {
      screen.visitor = update(screen.visitor);
    },
    setError: (text) => screen.errors.push(text),
    server,
  };
  return { actions: createVisitorActions(deps), server, screen, errors, rerolled1 };
}

/** The idempotency key of each call a mock got. */
const keysOf = (mock: { mock: { calls: unknown[][] } }): string[] =>
  mock.mock.calls.map((call) => (call[0] as { idempotencyKey: string }).idempotencyKey);

const gearWith = (after: unknown) => ({
  ...SAMPLE_GEAR,
  items: items.map((i) => (i.id === hat.id ? after : i)),
});

describe('the visitor`s read', () => {
  it('answers the piece`s price and odds, and costs nothing', async () => {
    const { actions, server } = setup();
    const view = sampleVisitor({ item: hat });
    server.fetchVisitor.mockResolvedValue(view);
    expect(await actions.look(hat.id)).toBe(view);
    expect(server.fetchVisitor).toHaveBeenCalledWith(hat.id);
  });

  it('turns to away when the answer says he left, and answers nothing', async () => {
    const { actions, server, screen } = setup();
    server.fetchVisitor.mockResolvedValue({ here: false });
    expect(await actions.look(hat.id)).toBeUndefined();
    expect(screen.visitor).toEqual({ here: false });
  });

  it('turns to away on a 409 visitor_away, and says a failed read in a line', async () => {
    const { actions, server, screen } = setup();
    server.fetchVisitor.mockRejectedValueOnce(new ApiError(409, 'visitor_away'));
    expect(await actions.look(hat.id)).toBeUndefined();
    expect(screen.visitor).toEqual({ here: false });
    server.fetchVisitor.mockRejectedValueOnce(new Error('network'));
    await actions.look(hat.id);
    expect(screen.errors).toEqual(['Could not read his price. Try again.']);
  });
});

describe('a reroll', () => {
  it('is a keyed spend: the key goes to the server, the fresh gear replaces the bag, the answer has before and after', async () => {
    const { actions, server, screen, rerolled1 } = setup();
    server.rerollWithVisitor.mockResolvedValue({
      valley: {},
      state: {},
      reroll: {
        itemId: hat.id,
        before: [],
        after: [],
        paid: { acorns: 60, scrap: 400 },
        rerolls: 1,
        next: { acorns: 90, scrap: 600 },
      },
    });
    server.fetchGear.mockResolvedValue(gearWith(rerolled1));
    const done = await actions.reroll(hat.id);
    expect(server.rerollWithVisitor).toHaveBeenCalledWith({
      itemId: hat.id,
      idempotencyKey: 'key-1',
    });
    expect(done?.before).toBe(hat);
    expect(done?.after).toBe(rerolled1);
    expect(done?.paid).toEqual({ acorns: 60, scrap: 400 });
    expect(done?.next).toEqual({ acorns: 90, scrap: 600 });
    expect(screen.valley).toBe(1);
    expect(screen.gear).toHaveLength(1);
    // His view counts the reroll, so the next one is another action with its own key.
    expect(screen.visitor).toMatchObject({ here: true, rerolls: 1 });
  });

  it('keeps its key when the outcome is unknown, so a retry cannot spend twice', async () => {
    const { actions, server } = setup();
    server.rerollWithVisitor.mockRejectedValueOnce(new ApiError(500, null));
    expect(await actions.reroll(hat.id)).toBeUndefined();
    server.rerollWithVisitor.mockRejectedValueOnce(new ApiError(500, null));
    await actions.reroll(hat.id);
    const keysUsed = keysOf(server.rerollWithVisitor);
    expect(keysUsed).toEqual(['key-1', 'key-1']);
  });

  it('takes a fresh key after a definite refusal, and turns him away when he has left', async () => {
    const { actions, server } = setup();
    server.rerollWithVisitor.mockRejectedValueOnce(new ApiError(409, 'insufficient_funds'));
    await actions.reroll(hat.id);
    server.rerollWithVisitor.mockRejectedValueOnce(new ApiError(409, 'visitor_away'));
    await actions.reroll(hat.id);
    const keysUsed = keysOf(server.rerollWithVisitor);
    expect(keysUsed).toEqual(['key-1', 'key-2']);
    expect(isAway(new ApiError(409, 'visitor_away'))).toBe(true);
    expect(isAway(new ApiError(409, 'already_bought'))).toBe(false);
    expect(isAway(new Error('x'))).toBe(false);
  });

  it('does nothing for a piece the screen does not hold', async () => {
    const { actions, server } = setup();
    expect(await actions.reroll('not-a-piece')).toBeUndefined();
    expect(server.rerollWithVisitor).not.toHaveBeenCalled();
  });
});

describe('the week`s blueprint', () => {
  it('is a keyed spend that marks it bought and reloads the gear (a blueprint was learned)', async () => {
    const { actions, server, screen } = setup();
    server.buyVisitorBlueprint.mockResolvedValue({
      valley: {},
      state: {},
      blueprint: {
        baseId: 'thundercap',
        duplicate: true,
        marks: 3,
        paid: { acorns: 40, shards: 50 },
      },
    });
    server.fetchGear.mockResolvedValue(SAMPLE_GEAR);
    const done = await actions.buy();
    expect(server.buyVisitorBlueprint).toHaveBeenCalledWith('key-1');
    expect(done).toEqual({ baseId: 'thundercap', duplicate: true, marks: 3 });
    expect(screen.gear).toHaveLength(1);
    expect(screen.visitor).toMatchObject({ here: true, blueprint: { bought: true } });
  });

  it('says nothing and takes nothing when the server refuses', async () => {
    const { actions, server, screen } = setup();
    server.buyVisitorBlueprint.mockRejectedValue(new ApiError(409, 'already_bought'));
    expect(await actions.buy()).toBeUndefined();
    expect(screen.gear).toHaveLength(0);
    expect(errorText(new ApiError(409, 'already_bought'))).toMatch(/already/);
    expect(errorText(new ApiError(409, 'visitor_away'))).toMatch(/Back Thursday/);
  });
});

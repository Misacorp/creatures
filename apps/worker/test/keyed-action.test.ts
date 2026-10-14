import { createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { payOnce } from '../src/gear-grants';
import { keyTaken, runKeyed, settleSpend } from '../src/keyed-action';
import { credit, spend } from '../src/ledger';
import { GameError, atomically } from '../src/outcome';
import { OTHER_USER_ID, USER_ID, runCore, type CoreContext } from './helpers';

const KEY = 'keyed-0001-test';

const action = (
  over: Partial<{ userId: string; key: string; kind: string; fingerprint: string }>,
) => ({
  userId: USER_ID,
  key: KEY,
  kind: 'upgrade',
  fingerprint: 'item-1',
  ...over,
});

const actionRows = (ctx: CoreContext): number =>
  ctx.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM gear_actions').one().n;
const ledgerRows = (ctx: CoreContext): number =>
  ctx.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM ledger').one().n;

/** Runs `fn` as a game action: its thrown `GameError` becomes the error code, and rolls back. */
function answer<T>(ctx: CoreContext, fn: () => T): T | string {
  const outcome = atomically(ctx.storage, fn);
  return outcome.ok ? outcome.value : outcome.error;
}

describe('runKeyed', () => {
  it('runs once and returns the stored result on a repeat', async () => {
    await runCore('730000000000000001', (ctx) => {
      let runs = 0;
      const act = () =>
        runKeyed(
          ctx.sql,
          () => ctx.clock.t,
          action({}),
          () => {
            runs += 1;
            return { level: runs };
          },
        );
      expect(answer(ctx, act)).toEqual({ level: 1 });
      expect(answer(ctx, act)).toEqual({ level: 1 });
      expect(runs).toBe(1);
      expect(actionRows(ctx)).toBe(1);
    });
  });

  it('stores the key as given, with the kind and fingerprint', async () => {
    await runCore('730000000000000002', (ctx) => {
      answer(ctx, () =>
        runKeyed(
          ctx.sql,
          () => ctx.clock.t,
          action({}),
          () => 'done',
        ),
      );
      const row = ctx.sql
        .exec<{ user_id: string; key: string; kind: string; fingerprint: string }>(
          'SELECT user_id, key, kind, fingerprint FROM gear_actions',
        )
        .one();
      expect(row).toEqual({ user_id: USER_ID, key: KEY, kind: 'upgrade', fingerprint: 'item-1' });
    });
  });

  it('refuses the same key for another kind or another subject, and does not run', async () => {
    await runCore('730000000000000003', (ctx) => {
      answer(ctx, () =>
        runKeyed(
          ctx.sql,
          () => ctx.clock.t,
          action({}),
          () => 1,
        ),
      );
      let ran = false;
      const other = (over: Parameters<typeof action>[0]) =>
        answer(ctx, () =>
          runKeyed(
            ctx.sql,
            () => ctx.clock.t,
            action(over),
            () => {
              ran = true;
              return 2;
            },
          ),
        );
      expect(other({ kind: 'dismantle' })).toBe('key_conflict');
      expect(other({ fingerprint: 'item-2' })).toBe('key_conflict');
      expect(ran).toBe(false);
      expect(actionRows(ctx)).toBe(1);
    });
  });

  it('refuses a key already used by a ledger entry', async () => {
    await runCore('730000000000000004', (ctx) => {
      credit(
        ctx.storage,
        { userId: USER_ID, currency: 'bait', amount: 5, source: 'test', idempotencyKey: KEY },
        ctx.clock.t,
      );
      let ran = false;
      const result = answer(ctx, () =>
        runKeyed(
          ctx.sql,
          () => ctx.clock.t,
          action({}),
          () => {
            ran = true;
            return 1;
          },
        ),
      );
      expect(result).toBe('key_conflict');
      expect(ran).toBe(false);
      expect(actionRows(ctx)).toBe(0);
    });
  });

  it('keeps keys per player', async () => {
    await runCore('730000000000000005', (ctx) => {
      expect(
        answer(ctx, () =>
          runKeyed(
            ctx.sql,
            () => ctx.clock.t,
            action({}),
            () => 'mine',
          ),
        ),
      ).toBe('mine');
      expect(
        answer(ctx, () =>
          runKeyed(
            ctx.sql,
            () => ctx.clock.t,
            action({ userId: OTHER_USER_ID, kind: 'dismantle' }),
            () => 'theirs',
          ),
        ),
      ).toBe('theirs');
      expect(actionRows(ctx)).toBe(2);
    });
  });

  it('writes nothing when the action throws, including what it did before throwing', async () => {
    await runCore('730000000000000006', (ctx) => {
      const result = answer(ctx, () =>
        runKeyed(
          ctx.sql,
          () => ctx.clock.t,
          action({}),
          () => {
            credit(
              ctx.storage,
              {
                userId: USER_ID,
                currency: 'bait',
                amount: 5,
                source: 'test',
                idempotencyKey: 'side:1',
              },
              ctx.clock.t,
            );
            throw new GameError(409, 'nope');
          },
        ),
      );
      expect(result).toBe('nope');
      expect(actionRows(ctx)).toBe(0);
      expect(ledgerRows(ctx)).toBe(0);
      expect(ctx.core.balances(USER_ID).bait).toBe(0);
      // The key is free again: a later attempt runs.
      expect(
        answer(ctx, () =>
          runKeyed(
            ctx.sql,
            () => ctx.clock.t,
            action({}),
            () => 'ok',
          ),
        ),
      ).toBe('ok');
    });
  });

  it('rethrows an error that is not a GameError, and stores nothing', async () => {
    await runCore('730000000000000007', (ctx) => {
      expect(() =>
        atomically(ctx.storage, () =>
          runKeyed(
            ctx.sql,
            () => ctx.clock.t,
            action({}),
            () => {
              throw new Error('bug');
            },
          ),
        ),
      ).toThrow('bug');
      expect(actionRows(ctx)).toBe(0);
    });
  });
});

describe('keyTaken', () => {
  it('looks in the tables it is asked about, for the one player', async () => {
    await runCore('730000000000000008', (ctx) => {
      const both = ['ledger', 'gear_actions'] as const;
      expect(keyTaken(ctx.sql, USER_ID, KEY, both)).toBe(false);
      answer(ctx, () =>
        runKeyed(
          ctx.sql,
          () => ctx.clock.t,
          action({}),
          () => 1,
        ),
      );
      expect(keyTaken(ctx.sql, USER_ID, KEY, ['gear_actions'])).toBe(true);
      expect(keyTaken(ctx.sql, USER_ID, KEY, ['ledger'])).toBe(false);
      expect(keyTaken(ctx.sql, OTHER_USER_ID, KEY, both)).toBe(false);
      credit(
        ctx.storage,
        {
          userId: USER_ID,
          currency: 'bait',
          amount: 5,
          source: 'test',
          idempotencyKey: 'other-key-1',
        },
        ctx.clock.t,
      );
      expect(keyTaken(ctx.sql, USER_ID, 'other-key-1', ['ledger'])).toBe(true);
      expect(keyTaken(ctx.sql, USER_ID, 'other-key-1', ['gear_actions'])).toBe(false);
      expect(keyTaken(ctx.sql, USER_ID, 'other-key-1', both)).toBe(true);
    });
  });
});

describe('settleSpend', () => {
  it('returns the result of a first spend', () => {
    expect(settleSpend({ status: 'ok', result: 7 })).toBe(7);
  });

  it('refuses a replay unless the stored result is accepted', () => {
    const replay = { status: 'replayed', result: { creatureId: 'c1' } } as const;
    expect(() => settleSpend(replay)).toThrow(GameError);
    expect(() => settleSpend(replay, () => false)).toThrow(GameError);
    expect(settleSpend(replay, (stored) => stored.creatureId === 'c1')).toEqual({
      creatureId: 'c1',
    });
  });

  it('answers key_conflict and insufficient_funds with their codes', () => {
    const code = (spent: Parameters<typeof settleSpend>[0]): string | undefined => {
      try {
        settleSpend(spent);
      } catch (err) {
        return err instanceof GameError ? `${String(err.status)} ${err.code}` : undefined;
      }
      return undefined;
    };
    expect(code({ status: 'key_conflict' })).toBe('409 key_conflict');
    expect(code({ status: 'insufficient_funds', balance: 0 })).toBe('409 insufficient_funds');
    expect(code({ status: 'replayed', result: 1 })).toBe('409 key_conflict');
  });

  it('works on a real replay of a ledger spend', async () => {
    await runCore('730000000000000009', (ctx) => {
      credit(
        ctx.storage,
        { userId: USER_ID, currency: 'bait', amount: 50, source: 'test', idempotencyKey: 'seed:1' },
        ctx.clock.t,
      );
      const pay = () =>
        spend(
          ctx.storage,
          {
            userId: USER_ID,
            currency: 'bait',
            amount: 10,
            purpose: 'training',
            idempotencyKey: KEY,
            apply: () => ({ level: 2 }),
          },
          ctx.clock.t,
        );
      expect(settleSpend(pay())).toEqual({ level: 2 });
      expect(() => settleSpend(pay())).toThrow(GameError);
      expect(settleSpend(pay(), () => true)).toEqual({ level: 2 });
      expect(ctx.core.balances(USER_ID).bait).toBe(40);
    });
  });
});

describe('payOnce', () => {
  const draft = () => ({ gear: [], parts: { scrap: 3 }, blueprints: [] });

  it('credits under `<key>:<currency>` and grants under `<key>`, once', async () => {
    await runCore('730000000000000010', (ctx) => {
      const deps = { storage: ctx.storage, now: () => ctx.clock.t, rng: createSeededRng('pay') };
      const pay = () =>
        payOnce(deps, USER_ID, 'dungeon:2027-01-15:1', {
          source: 'dungeon',
          draw: draft,
          credits: { bait: 12, essence: 3, meta: { day: '2027-01-15' } },
        });
      expect(pay().parts).toEqual({ scrap: 3 });
      expect(pay().parts).toEqual({ scrap: 3 });
      const keys = ctx.sql
        .exec<{ idempotency_key: string }>('SELECT idempotency_key FROM ledger ORDER BY id')
        .toArray()
        .map((r) => r.idempotency_key);
      expect(keys).toEqual(['dungeon:2027-01-15:1:bait', 'dungeon:2027-01-15:1:essence']);
      expect(
        ctx.sql
          .exec<{ key: string }>('SELECT key FROM gear_grants')
          .toArray()
          .map((r) => r.key),
      ).toEqual(['dungeon:2027-01-15:1']);
      expect(ctx.core.balances(USER_ID)).toEqual({ bait: 12, essence: 3 });
    });
  });

  it('pays no credit for a zero or missing amount', async () => {
    await runCore('730000000000000011', (ctx) => {
      const deps = { storage: ctx.storage, now: () => ctx.clock.t, rng: createSeededRng('pay') };
      payOnce(deps, USER_ID, 'dungeon:2027-01-15:streak', {
        source: 'dungeon',
        draw: draft,
        credits: { bait: 0 },
      });
      expect(ledgerRows(ctx)).toBe(0);
    });
  });
});

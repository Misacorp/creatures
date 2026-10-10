import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { GuildCore } from '../src/guild-core';
import { OTHER_USER_ID, T0, USER_ID, runCore } from './helpers';

const KEY_A = 'a1b2c3d4-0000-4000-8000-000000000001';
const KEY_B = 'a1b2c3d4-0000-4000-8000-000000000002';
const KEY_C = 'a1b2c3d4-0000-4000-8000-000000000003';

function seed(core: GuildCore, amount: number, userId = USER_ID, key = 'seed:1'): void {
  core.credit({
    userId,
    currency: 'bait',
    amount,
    source: 'test',
    idempotencyKey: key,
  });
}

function ledgerRows(sql: SqlStorage): number {
  return sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM ledger').one().n;
}

describe('ledger credit', () => {
  it('applies once even when called twice with the same key', async () => {
    await runCore('710000000000000001', ({ core, sql }) => {
      const input = {
        userId: USER_ID,
        currency: 'bait',
        amount: 30,
        source: 'leet',
        idempotencyKey: 'leet:1:2026-10-09',
        meta: { date: '2026-10-09', participants: 3, points: 3 },
      } as const;
      expect(core.credit(input)).toEqual({ applied: true });
      expect(core.credit(input)).toEqual({ applied: false });
      expect(core.balances(USER_ID)).toEqual({ bait: 30, essence: 0 });
      expect(ledgerRows(sql)).toBe(1);
    });
  });

  it('keeps keys per user and sums different credits', async () => {
    await runCore('710000000000000002', ({ core }) => {
      seed(core, 10, USER_ID, 'k:1');
      seed(core, 10, USER_ID, 'k:2');
      seed(core, 5, OTHER_USER_ID, 'k:1');
      expect(core.balances(USER_ID).bait).toBe(20);
      expect(core.balances(OTHER_USER_ID).bait).toBe(5);
    });
  });

  it('credits users who have no player row yet', async () => {
    await runCore('710000000000000003', ({ core, sql }) => {
      seed(core, 20, '999999999999999999');
      expect(core.balances('999999999999999999').bait).toBe(20);
      expect(sql.exec('SELECT * FROM players').toArray()).toHaveLength(0);
    });
  });

  it('rejects amounts that are not positive safe integers', async () => {
    await runCore('710000000000000004', ({ core, sql }) => {
      for (const amount of [0, -5, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1, Infinity]) {
        expect(() =>
          core.credit({
            userId: USER_ID,
            currency: 'bait',
            amount,
            source: 'test',
            idempotencyKey: 'k:1',
          }),
        ).toThrow();
      }
      expect(ledgerRows(sql)).toBe(0);
    });
  });

  it('rejects unknown currencies and bad keys', async () => {
    await runCore('710000000000000005', ({ core }) => {
      const base = { userId: USER_ID, amount: 1, source: 'test', idempotencyKey: 'k:1' };
      expect(() => core.credit({ ...base, currency: 'gold' as 'bait' })).toThrow();
      expect(() => core.credit({ ...base, currency: 'bait', idempotencyKey: '' })).toThrow();
      expect(() => core.credit({ ...base, currency: 'bait', idempotencyKey: 'a b' })).toThrow();
      expect(() => core.credit({ ...base, currency: 'bait', source: '' })).toThrow();
    });
  });
});

describe('ledger spend', () => {
  function withGrants(sql: SqlStorage): void {
    sql.exec('CREATE TABLE IF NOT EXISTS test_grants (id INTEGER PRIMARY KEY, what TEXT NOT NULL)');
  }
  const grants = (sql: SqlStorage) =>
    sql.exec<{ what: string }>('SELECT what FROM test_grants').toArray();

  it('charges, runs apply and stores the result', async () => {
    await runCore('710000000000000010', ({ core, sql }) => {
      withGrants(sql);
      seed(core, 100);
      const res = core.spend({
        userId: USER_ID,
        currency: 'bait',
        amount: 30,
        purpose: 'training',
        idempotencyKey: KEY_A,
        apply: () => {
          sql.exec("INSERT INTO test_grants (what) VALUES ('xp')");
          return { granted: 'xp', n: 1 };
        },
      });
      expect(res).toEqual({ status: 'ok', result: { granted: 'xp', n: 1 } });
      expect(core.balances(USER_ID).bait).toBe(70);
      expect(grants(sql)).toEqual([{ what: 'xp' }]);
      const row = sql
        .exec<{ amount: number; source: string; result: string }>(
          'SELECT amount, source, result FROM ledger WHERE idempotency_key = ?',
          KEY_A,
        )
        .one();
      expect(row).toEqual({ amount: -30, source: 'training', result: '{"granted":"xp","n":1}' });
    });
  });

  it('spends exactly the whole balance but not one more', async () => {
    await runCore('710000000000000011', ({ core }) => {
      seed(core, 30);
      const spend = (amount: number, key: string) =>
        core.spend({
          userId: USER_ID,
          currency: 'bait',
          amount,
          purpose: 'test',
          idempotencyKey: key,
          apply: () => 'ok',
        });
      expect(spend(31, KEY_A)).toEqual({ status: 'insufficient_funds', balance: 30 });
      expect(spend(30, KEY_B).status).toBe('ok');
      expect(core.balances(USER_ID).bait).toBe(0);
    });
  });

  it('writes nothing and skips apply when funds are insufficient', async () => {
    await runCore('710000000000000012', ({ core, sql }) => {
      withGrants(sql);
      seed(core, 10);
      let applied = 0;
      const res = core.spend({
        userId: USER_ID,
        currency: 'bait',
        amount: 11,
        purpose: 'test',
        idempotencyKey: KEY_A,
        apply: () => {
          applied++;
          return 1;
        },
      });
      expect(res).toEqual({ status: 'insufficient_funds', balance: 10 });
      expect(applied).toBe(0);
      expect(ledgerRows(sql)).toBe(1); // only the seed credit
      expect(core.balances(USER_ID).bait).toBe(10);
    });
  });

  it('reports insufficient funds for a user with no balance row', async () => {
    await runCore('710000000000000013', ({ core }) => {
      const res = core.spend({
        userId: OTHER_USER_ID,
        currency: 'essence',
        amount: 1,
        purpose: 'test',
        idempotencyKey: KEY_A,
        apply: () => 1,
      });
      expect(res).toEqual({ status: 'insufficient_funds', balance: 0 });
    });
  });

  it('replays the stored result and charges once', async () => {
    await runCore('710000000000000014', ({ core, sql }) => {
      withGrants(sql);
      seed(core, 100);
      let applied = 0;
      const run = () =>
        core.spend({
          userId: USER_ID,
          currency: 'bait',
          amount: 40,
          purpose: 'expedition',
          idempotencyKey: KEY_A,
          apply: () => {
            applied++;
            sql.exec("INSERT INTO test_grants (what) VALUES ('loot')");
            return { loot: applied };
          },
        });
      expect(run()).toEqual({ status: 'ok', result: { loot: 1 } });
      expect(run()).toEqual({ status: 'replayed', result: { loot: 1 } });
      expect(run()).toEqual({ status: 'replayed', result: { loot: 1 } });
      expect(applied).toBe(1);
      expect(grants(sql)).toHaveLength(1);
      expect(core.balances(USER_ID).bait).toBe(60);
    });
  });

  it('replays even after the balance has dropped below the amount', async () => {
    await runCore('710000000000000015', ({ core }) => {
      seed(core, 50);
      const spend = (amount: number, key: string) =>
        core.spend({
          userId: USER_ID,
          currency: 'bait',
          amount,
          purpose: 'test',
          idempotencyKey: key,
          apply: () => amount,
        });
      expect(spend(50, KEY_A)).toEqual({ status: 'ok', result: 50 });
      expect(spend(50, KEY_A)).toEqual({ status: 'replayed', result: 50 });
    });
  });

  it('stores a null result for apply functions that return nothing', async () => {
    await runCore('710000000000000016', ({ core }) => {
      seed(core, 10);
      const spend = () =>
        core.spend({
          userId: USER_ID,
          currency: 'bait',
          amount: 5,
          purpose: 'test',
          idempotencyKey: KEY_A,
          apply: () => undefined,
        });
      expect(spend().status).toBe('ok');
      expect(spend()).toEqual({ status: 'replayed', result: null });
    });
  });

  it('refuses a reused key for a different spend without charging', async () => {
    await runCore('710000000000000017', ({ core }) => {
      seed(core, 100);
      const spend = (amount: number) =>
        core.spend({
          userId: USER_ID,
          currency: 'bait',
          amount,
          purpose: 'test',
          idempotencyKey: KEY_A,
          apply: () => 'x',
        });
      expect(spend(10).status).toBe('ok');
      expect(spend(20)).toEqual({ status: 'key_conflict' });
      expect(core.balances(USER_ID).bait).toBe(90);
    });
  });

  it('keys are scoped per user', async () => {
    await runCore('710000000000000018', ({ core }) => {
      seed(core, 10, USER_ID, 'seed:1');
      seed(core, 10, OTHER_USER_ID, 'seed:1');
      const spend = (userId: string) =>
        core.spend({
          userId,
          currency: 'bait',
          amount: 10,
          purpose: 'test',
          idempotencyKey: KEY_A,
          apply: () => userId,
        });
      expect(spend(USER_ID)).toEqual({ status: 'ok', result: USER_ID });
      expect(spend(OTHER_USER_ID)).toEqual({ status: 'ok', result: OTHER_USER_ID });
    });
  });

  it('rolls everything back when apply throws', async () => {
    await runCore('710000000000000019', ({ core, sql }) => {
      withGrants(sql);
      seed(core, 100);
      const spend = (fail: boolean) =>
        core.spend({
          userId: USER_ID,
          currency: 'bait',
          amount: 40,
          purpose: 'test',
          idempotencyKey: KEY_A,
          apply: () => {
            sql.exec("INSERT INTO test_grants (what) VALUES ('half')");
            if (fail) throw new Error('boom');
            return 'fine';
          },
        });
      expect(() => spend(true)).toThrow('boom');
      expect(core.balances(USER_ID).bait).toBe(100);
      expect(ledgerRows(sql)).toBe(1);
      expect(grants(sql)).toHaveLength(0);
      // The same key can be retried afterwards because nothing was recorded.
      expect(spend(false)).toEqual({ status: 'ok', result: 'fine' });
      expect(core.balances(USER_ID).bait).toBe(60);
    });
  });

  it('rejects an asynchronous apply and rolls back', async () => {
    await runCore('710000000000000020', ({ core }) => {
      seed(core, 100);
      expect(() =>
        core.spend({
          userId: USER_ID,
          currency: 'bait',
          amount: 10,
          purpose: 'test',
          idempotencyKey: KEY_A,
          apply: () => Promise.resolve(1) as unknown as number,
        }),
      ).toThrow();
      expect(core.balances(USER_ID).bait).toBe(100);
    });
  });

  it('only the first of two spends that together exceed the balance succeeds', async () => {
    await runCore('710000000000000021', ({ core }) => {
      seed(core, 60);
      const spend = (key: string) =>
        core.spend({
          userId: USER_ID,
          currency: 'bait',
          amount: 40,
          purpose: 'test',
          idempotencyKey: key,
          apply: () => key,
        });
      expect(spend(KEY_A)).toEqual({ status: 'ok', result: KEY_A });
      expect(spend(KEY_B)).toEqual({ status: 'insufficient_funds', balance: 20 });
      expect(core.balances(USER_ID).bait).toBe(20);
    });
  });

  it('validates the idempotency key format', async () => {
    await runCore('710000000000000022', ({ core }) => {
      seed(core, 100);
      const bad = ['', 'short', 'has space 12345', 'semi:colon:123', 'a'.repeat(65), 'ümlaut-1234'];
      for (const idempotencyKey of bad) {
        expect(() =>
          core.spend({
            userId: USER_ID,
            currency: 'bait',
            amount: 1,
            purpose: 'test',
            idempotencyKey,
            apply: () => 1,
          }),
        ).toThrow();
      }
      for (const idempotencyKey of ['a'.repeat(8), 'A_b-1'.repeat(12) + 'abcd', KEY_C]) {
        expect(
          core.spend({
            userId: USER_ID,
            currency: 'bait',
            amount: 1,
            purpose: 'test',
            idempotencyKey,
            apply: () => 1,
          }).status,
        ).toBe('ok');
      }
    });
  });

  it('rejects invalid amounts', async () => {
    await runCore('710000000000000023', ({ core }) => {
      seed(core, 100);
      for (const amount of [0, -1, 2.5, Number.NaN]) {
        expect(() =>
          core.spend({
            userId: USER_ID,
            currency: 'bait',
            amount,
            purpose: 'test',
            idempotencyKey: KEY_A,
            apply: () => 1,
          }),
        ).toThrow();
      }
      expect(core.balances(USER_ID).bait).toBe(100);
    });
  });
});

describe('ledger constraints', () => {
  it('a balance can never go negative, even with direct SQL', async () => {
    await runCore('710000000000000030', ({ core, sql }) => {
      seed(core, 10);
      expect(() =>
        sql.exec('UPDATE balances SET amount = amount - 11 WHERE user_id = ?', USER_ID),
      ).toThrow(/CHECK/i);
      expect(() =>
        sql.exec("INSERT INTO balances (user_id, currency, amount) VALUES ('x', 'bait', -1)"),
      ).toThrow(/CHECK/i);
      expect(core.balances(USER_ID).bait).toBe(10);
    });
  });

  it('rejects zero amounts, unknown currencies and duplicate keys in SQL', async () => {
    await runCore('710000000000000031', ({ sql }) => {
      const insert = (currency: string, amount: number, key: string) =>
        sql.exec(
          `INSERT INTO ledger (user_id, currency, amount, source, idempotency_key, created_at)
           VALUES ('u', ?, ?, 's', ?, 1)`,
          currency,
          amount,
          key,
        );
      expect(() => insert('bait', 0, 'k1')).toThrow(/CHECK/i);
      expect(() => insert('gold', 1, 'k2')).toThrow(/CHECK/i);
      insert('bait', 1, 'k3');
      expect(() => insert('bait', 1, 'k3')).toThrow(/UNIQUE/i);
    });
  });
});

describe('ledger concurrency in the real Durable Object', () => {
  const stubFor = (guildId: string) => env.GUILD_WORLD.get(env.GUILD_WORLD.idFromName(guildId));

  /** Runs a GuildCore call inside the guild's Durable Object, like an RPC call would. */
  const inDo = <R>(guildId: string, fn: (core: GuildCore) => R | Promise<R>) =>
    runInDurableObject(stubFor(guildId), async (_instance, state) => {
      const core = new GuildCore(state.storage, () => T0);
      await Promise.resolve(); // yield so concurrent callers interleave
      return fn(core);
    });

  it('parallel spends with different keys never overspend', async () => {
    const guildId = '710000000000000040';
    await inDo(guildId, (core) => seed(core, 100));
    const keys = Array.from({ length: 6 }, (_, i) => `par-key-${String(i)}-aaaa`);
    const results = await Promise.all(
      keys.map((key) =>
        inDo(guildId, (core) =>
          core.spend({
            userId: USER_ID,
            currency: 'bait',
            amount: 30,
            purpose: 'test',
            idempotencyKey: key,
            apply: () => key,
          }),
        ),
      ),
    );
    expect(results.filter((r) => r.status === 'ok')).toHaveLength(3);
    expect(results.filter((r) => r.status === 'insufficient_funds')).toHaveLength(3);
    expect(await inDo(guildId, (core) => core.balances(USER_ID).bait)).toBe(10);
  });

  it('parallel retries with the same key charge once', async () => {
    const guildId = '710000000000000041';
    await inDo(guildId, (core) => seed(core, 100));
    let applied = 0;
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        inDo(guildId, (core) =>
          core.spend({
            userId: USER_ID,
            currency: 'bait',
            amount: 30,
            purpose: 'test',
            idempotencyKey: KEY_A,
            apply: () => {
              applied++;
              return 'granted';
            },
          }),
        ),
      ),
    );
    expect(results.filter((r) => r.status === 'ok')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'replayed')).toHaveLength(4);
    expect(applied).toBe(1);
    expect(await inDo(guildId, (core) => core.balances(USER_ID).bait)).toBe(70);
  });

  it('parallel credits with the same key apply once', async () => {
    const guildId = '710000000000000042';
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        inDo(guildId, (core) =>
          core.credit({
            userId: USER_ID,
            currency: 'bait',
            amount: 20,
            source: 'leet',
            idempotencyKey: 'leet:x',
          }),
        ),
      ),
    );
    expect(results.filter((r) => r.applied)).toHaveLength(1);
    expect(await inDo(guildId, (core) => core.balances(USER_ID).bait)).toBe(20);
  });
});

// The archive is not bound in wrangler.jsonc, so the worker test pool has no binding for it: the tests build the class inside another
// object's storage (`new SettlerArchive(state, env)`), which is the same code a binding would run.
import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { ArchiveReceiptSchema, type SettlersRecord } from '../../src/reset/record-schema';
import { MAX_RECORD_CHARS, SettlerArchive } from '../../src/reset/settler-archive';
import { buildSettlersRecord } from '../../src/reset/settlers-record';
import { runCore } from '../helpers';
import { HELSINKI, nextGuild } from '../raid-helpers';
import { HOSTILE, KEY, seedWorld } from './world';
import * as v from 'valibot';

async function recordOf(): Promise<SettlersRecord> {
  return await runCore(nextGuild(), async (ctx) => {
    seedWorld(ctx);
    return await buildSettlersRecord(ctx.sql, { tz: HELSINKI, now: ctx.clock.t, hmacKey: KEY });
  });
}

async function withArchive<T>(fn: (archive: SettlerArchive) => Promise<T> | T): Promise<T> {
  const stub = env.GUILD_WORLD.get(
    env.GUILD_WORLD.idFromName(`archive-test-${crypto.randomUUID()}`),
  );
  return await runInDurableObject(stub, (_i, state) => fn(new SettlerArchive(state, env)));
}

const message = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
  } catch (err) {
    return err instanceof Error ? err.message : 'error';
  }
  return 'no error';
};

describe('the settler archive', () => {
  it('puts a record and answers a receipt; get returns it as it was, hostile text untouched', async () => {
    const record = await recordOf();
    await withArchive(async (archive) => {
      expect(archive.list()).toEqual([]);
      expect(archive.get(record.archiveKey)).toBeNull();
      const receipt = await archive.put(record.archiveKey, record);
      expect(v.safeParse(ArchiveReceiptSchema, receipt).success).toBe(true);
      expect(receipt).toMatchObject({ archiveKey: record.archiveKey, settlers: 3, creatures: 8 });
      expect(archive.get(record.archiveKey)).toEqual(record);
      // Player text is kept as stored: the archive never interprets it.
      expect(JSON.stringify(archive.get(record.archiveKey))).toContain(
        JSON.stringify(HOSTILE).slice(1, -1),
      );
      expect(archive.list()).toEqual([
        {
          archiveKey: record.archiveKey,
          createdAt: record.createdAt,
          settlers: 3,
          creatures: 8,
          storedAt: receipt.storedAt,
        },
      ]);
    });
  });

  it('is idempotent by key: a retry answers the stored receipt, a different record under the key is refused', async () => {
    const record = await recordOf();
    await withArchive(async (archive) => {
      const first = await archive.put(record.archiveKey, record);
      const again = await archive.put(record.archiveKey, structuredClone(record));
      expect(again).toEqual(first);
      expect(archive.list()).toHaveLength(1);
      const changed = structuredClone(record);
      const settler = changed.settlers[0];
      if (settler === undefined) throw new Error('no settler');
      settler.name = 'Someone else';
      expect(await message(archive.put(record.archiveKey, changed))).toBe('archive_key_conflict');
      // The stored record is the first one.
      expect(archive.get(record.archiveKey)?.settlers[0]?.name).toBe('Ann');
    });
  });

  it('keeps several servers apart', async () => {
    const [a, b] = [await recordOf(), await recordOf()];
    await withArchive(async (archive) => {
      await archive.put(a.archiveKey, a);
      await archive.put(b.archiveKey, b);
      expect(
        archive
          .list()
          .map((s) => s.archiveKey)
          .sort(),
      ).toEqual([a.archiveKey, b.archiveKey].sort());
      expect(archive.get(a.archiveKey)?.archiveKey).toBe(a.archiveKey);
      expect(archive.get('no-such-key')).toBeNull();
    });
  });

  it('refuses a record that does not match the schema, the key, or the size limit, and stores nothing', async () => {
    const record = await recordOf();
    await withArchive(async (archive) => {
      expect(await message(archive.put(record.archiveKey, { ...record, extra: 1 }))).toBe(
        'invalid_record',
      );
      expect(await message(archive.put(record.archiveKey, { ...record, version: 2 }))).toBe(
        'invalid_record',
      );
      expect(await message(archive.put(record.archiveKey, null))).toBe('invalid_record');
      expect(await message(archive.put('another-key', record))).toBe('archive_key_mismatch');
      const big = structuredClone(record);
      const settler = big.settlers[0];
      if (settler === undefined) throw new Error('no settler');
      const creature = settler.creatures[0];
      if (creature === undefined) throw new Error('no creature');
      // Many settlers with long (but valid) nicknames.
      big.settlers = Array.from({ length: 2000 }, () => ({
        ...settler,
        creatures: Array.from({ length: 8 }, () => ({ ...creature, nickname: 'n'.repeat(200) })),
      }));
      expect(JSON.stringify(big).length).toBeGreaterThan(MAX_RECORD_CHARS);
      expect(await message(archive.put(record.archiveKey, big))).toBe('record_too_large');
      expect(archive.list()).toEqual([]);
    });
  });
});

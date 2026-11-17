/**
 * The settlers' archive (`docs/design/reset.md`, section 2): one Durable Object that holds every server's record, written by each
 * server just before its wipe. **Inert for now:** the class is not exported from the Worker's entry, not bound in `wrangler.jsonc` and has
 * no Durable Object migration, so it does not exist in production. The release PR adds those three (`docs/design/reset-build.md`).
 *
 * `ArchiveStore` holds the logic over a `SqlStorage`; `SettlerArchive` is the thin Durable Object around it. The record is stored as the
 * JSON text it was validated as, next to a SHA-256 digest of that text; the digest is the receipt's proof.
 *
 * - `put(archiveKey, record) -> receipt`: idempotent by key. A repeat of the same record answers the stored receipt; a different record
 *   under a stored key is refused (`archive_key_conflict`), so a stored record is never replaced.
 * - `get(archiveKey) -> record | null`, `list() -> summaries` (key, time, counts; never the records).
 * The record is checked against its strict schema on the way in and on the way out. Nothing here reads a secret or a request.
 */
import { DurableObject } from 'cloudflare:workers';
import * as v from 'valibot';
import {
  ArchiveReceiptSchema,
  SettlersRecordSchema,
  type ArchiveReceipt,
  type SettlersRecord,
} from './record-schema';

/** One SQLite row holds up to 2 MB; a record this large is refused rather than risked (a 15 player server is a few hundred KB). */
export const MAX_RECORD_CHARS = 1_500_000;
/** The archive is one object: every caller addresses it by this fixed name. */
export const SETTLER_ARCHIVE_NAME = 'settler-archive';

export interface ArchiveSummary {
  archiveKey: string;
  createdAt: number;
  settlers: number;
  creatures: number;
  storedAt: number;
}

type Row = {
  archive_key: string;
  json: string;
  digest: string;
  settlers: number;
  creatures: number;
  created_at: number;
  stored_at: number;
};

async function sha256Hex(text: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
  );
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export class ArchiveStore {
  constructor(
    private readonly sql: SqlStorage,
    private readonly now: () => number,
  ) {
    sql.exec(`CREATE TABLE IF NOT EXISTS settler_records (
      archive_key TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      digest TEXT NOT NULL,
      settlers INTEGER NOT NULL,
      creatures INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      stored_at INTEGER NOT NULL
    )`);
  }

  private receiptOf(row: Row): ArchiveReceipt {
    return {
      archiveKey: row.archive_key,
      digest: row.digest,
      settlers: row.settlers,
      creatures: row.creatures,
      storedAt: row.stored_at,
    };
  }

  private row(archiveKey: string): Row | undefined {
    return this.sql
      .exec<Row>('SELECT * FROM settler_records WHERE archive_key = ?', archiveKey)
      .toArray()[0];
  }

  async put(archiveKey: string, record: unknown): Promise<ArchiveReceipt> {
    const parsed = v.safeParse(SettlersRecordSchema, record);
    if (!parsed.success) throw new Error('invalid_record');
    if (parsed.output.archiveKey !== archiveKey) throw new Error('archive_key_mismatch');
    const json = JSON.stringify(parsed.output);
    if (json.length > MAX_RECORD_CHARS) throw new Error('record_too_large');
    const digest = await sha256Hex(json);
    const stored = this.row(archiveKey);
    if (stored !== undefined) {
      if (stored.digest !== digest) throw new Error('archive_key_conflict');
      return this.receiptOf(stored);
    }
    const settlers = parsed.output.settlers.length;
    const creatures = parsed.output.settlers.reduce((n, s) => n + s.creatures.length, 0);
    const storedAt = this.now();
    this.sql.exec(
      'INSERT INTO settler_records (archive_key, json, digest, settlers, creatures, created_at, stored_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      archiveKey,
      json,
      digest,
      settlers,
      creatures,
      parsed.output.createdAt,
      storedAt,
    );
    const receipt = { archiveKey, digest, settlers, creatures, storedAt };
    return v.parse(ArchiveReceiptSchema, receipt);
  }

  get(archiveKey: string): SettlersRecord | null {
    const stored = this.row(archiveKey);
    if (stored === undefined) return null;
    return v.parse(SettlersRecordSchema, JSON.parse(stored.json));
  }

  list(): ArchiveSummary[] {
    return this.sql
      .exec<Omit<Row, 'json'>>(
        'SELECT archive_key, digest, settlers, creatures, created_at, stored_at FROM settler_records ORDER BY stored_at, archive_key',
      )
      .toArray()
      .map((r) => ({
        archiveKey: r.archive_key,
        createdAt: r.created_at,
        settlers: r.settlers,
        creatures: r.creatures,
        storedAt: r.stored_at,
      }));
  }
}

/** The Durable Object. Not bound anywhere yet. */
export class SettlerArchive extends DurableObject<Env> {
  private readonly store: ArchiveStore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new ArchiveStore(ctx.storage.sql, () => Date.now());
  }

  put(archiveKey: string, record: unknown): Promise<ArchiveReceipt> {
    return this.store.put(archiveKey, record);
  }

  get(archiveKey: string): SettlersRecord | null {
    return this.store.get(archiveKey);
  }

  list(): ArchiveSummary[] {
    return this.store.list();
  }
}

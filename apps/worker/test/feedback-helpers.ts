import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { expect, vi } from 'vitest';
import { FEEDBACK_INBOX_NAME } from '../src/feedback-inbox';
import { createHandler } from '../src/index';
import { ORIGIN } from './helpers';

export const OPS = 'ops-token-for-feedback-tests-1f2e3d';
export const READ = 'read-token-for-feedback-tests-9a8b7c';
/** A fixed "now" (UTC epoch ms), moved by `clock.now`. */
export const T0 = 1_900_000_000_000;
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const clock = { now: T0 };

let userCounter = 0;
let guildCounter = 0;
export const nextUser = (): string => String(810000000000000000n + BigInt(++userCounter));
export const nextFeedbackGuild = (): string => String(820000000000000000n + BigInt(++guildCounter));

export function inbox() {
  return env.FEEDBACK_INBOX.getByName(FEEDBACK_INBOX_NAME);
}

/** Empties the inbox, so tests do not share reports or limits. */
export async function clearInbox(): Promise<void> {
  await runInDurableObject(inbox(), (_instance, state) => {
    state.storage.sql.exec('DELETE FROM feedback_shots');
    state.storage.sql.exec('DELETE FROM feedback_reports');
  });
  clock.now = T0;
}

// --- Ed25519 ---

export interface Keys {
  privateKey: CryptoKey;
  publicHex: string;
}

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export async function makeKeys(): Promise<Keys> {
  const pair = (await crypto.subtle.generateKey('Ed25519', true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const raw = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
  return { privateKey: pair.privateKey, publicHex: toHex(raw) };
}

export async function sign(keys: Keys, timestamp: string, body: string): Promise<string> {
  const sig = await crypto.subtle.sign(
    'Ed25519',
    keys.privateKey,
    new TextEncoder().encode(timestamp + body),
  );
  return toHex(new Uint8Array(sig));
}

// --- The Worker ---

/** The JSON of a response, as unknown (so tests state the shape they expect with a cast). */
export async function jsonBody(res: Response): Promise<unknown> {
  return JSON.parse(await res.text());
}

export function makeCtx() {
  const pending: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (p: Promise<unknown>) => {
      pending.push(p);
    },
    passThroughOnException: () => undefined,
    props: {},
  } as unknown as ExecutionContext;
  return { ctx, settle: () => Promise.all(pending).then(() => undefined) };
}

export type FakeFetch = (url: string, init: RequestInit) => Promise<Response>;

export function makeHandler(fetchAttachment?: FakeFetch) {
  const fake = fetchAttachment ?? (() => Promise.reject(new Error('no network in tests')));
  return createHandler({ now: () => clock.now, fetchAttachment: fake });
}

export function workerEnv(overrides: Partial<Record<string, string | undefined>> = {}): Env {
  return {
    ...env,
    OPS_TOKEN: OPS,
    FEEDBACK_READ_TOKEN: READ,
    ...overrides,
  };
}

export interface Sent {
  keys: Keys;
  body: unknown;
  /** Seconds, as Discord sends it. Default: the current test clock. */
  timestamp?: string;
  raw?: string;
  /** Signs this instead of the body that is sent. */
  signedBody?: string;
  /** Signs this timestamp instead of the one that is sent. */
  signedTimestamp?: string;
  signature?: string | null;
  omitTimestamp?: boolean;
  method?: string;
}

export async function interact(
  handler: ReturnType<typeof createHandler>,
  sent: Sent,
  environment: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const body = sent.raw ?? JSON.stringify(sent.body);
  const timestamp = sent.timestamp ?? String(Math.floor(clock.now / 1000));
  const headers: Record<string, string> = {};
  const signature =
    sent.signature === undefined
      ? await sign(sent.keys, sent.signedTimestamp ?? timestamp, sent.signedBody ?? body)
      : sent.signature;
  if (signature !== null) headers['X-Signature-Ed25519'] = signature;
  if (sent.omitTimestamp !== true) headers['X-Signature-Timestamp'] = timestamp;
  const request = new Request(`${ORIGIN}/api/discord/interactions`, {
    method: sent.method ?? 'POST',
    headers,
    ...((sent.method ?? 'POST') === 'POST' ? { body } : {}),
  });
  if (handler.fetch === undefined) throw new Error('no fetch');
  return handler.fetch(request as Request<unknown, IncomingRequestCfProperties>, environment, ctx);
}

export function ops(
  handler: ReturnType<typeof createHandler>,
  path: string,
  options: { token?: string | null; method?: string; body?: unknown; env?: Env } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  const token = options.token === undefined ? OPS : options.token;
  if (token !== null) headers['Authorization'] = `Bearer ${token}`;
  const method = options.method ?? 'GET';
  const request = new Request(`${ORIGIN}${path}`, {
    method,
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  if (handler.fetch === undefined) throw new Error('no fetch');
  return Promise.resolve(
    handler.fetch(
      request as Request<unknown, IncomingRequestCfProperties>,
      options.env ?? workerEnv(),
      makeCtx().ctx,
    ),
  );
}

// --- Discord payloads ---

export interface ModalInput {
  userId: string;
  guildId?: string | null;
  kind?: string | null;
  text?: string;
  /** The file upload's attachment ids. */
  files?: string[];
  attachments?: Record<string, unknown>;
  /** Wrap in old-style Action Rows instead of Labels. */
  actionRows?: boolean;
  customId?: string;
}

export function modalSubmit(input: ModalInput): unknown {
  const parts: unknown[] = [];
  if (input.kind !== null) {
    parts.push({ type: 3, custom_id: 'kind', values: [input.kind ?? 'bug'] });
  }
  parts.push({
    type: 4,
    custom_id: 'text',
    value: input.text ?? 'The boss fight froze on my phone.',
  });
  if (input.files !== undefined) parts.push({ type: 19, custom_id: 'shot', values: input.files });
  const components = parts.map((component, i) =>
    input.actionRows === true
      ? { type: 1, components: [component] }
      : { type: 18, id: i + 1, component },
  );
  return {
    type: 5,
    id: '900000000000000001',
    token: 'interaction-token-not-used',
    ...(input.guildId === null ? {} : { guild_id: input.guildId ?? '820000000000000099' }),
    member: { user: { id: input.userId, username: 'someone' }, roles: [] },
    data: {
      custom_id: input.customId ?? 'feedback',
      components,
      ...(input.attachments === undefined ? {} : { resolved: { attachments: input.attachments } }),
    },
  };
}

export const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Bytes that start like a PNG and are `size` long in total. */
export function pngBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set(PNG_HEAD);
  for (let i = PNG_HEAD.length; i < size; i++) bytes[i] = (i * 31) % 251;
  return bytes;
}

/**
 * Asserts two byte arrays are the same. Vitest's `toEqual` takes ~20 s on a few MiB of bytes; a plain
 * loop takes milliseconds and names the first byte that differs.
 */
export function expectSameBytes(actual: Uint8Array | undefined, expected: Uint8Array): void {
  if (actual === undefined) throw new Error('expected bytes, got undefined');
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i]) {
      throw new Error(
        `bytes differ at index ${String(i)}: ${String(actual[i])} !== ${String(expected[i])}`,
      );
    }
  }
}

export function attachment(
  id: string,
  extra: Partial<{ url: string; size: number; filename: string }> = {},
): Record<string, unknown> {
  return {
    [id]: {
      id,
      filename: extra.filename ?? 'shot.png',
      content_type: 'image/png',
      size: extra.size ?? 1000,
      url: extra.url ?? `https://cdn.discordapp.com/attachments/1/${id}/shot.png?ex=1&hm=2`,
    },
  };
}

export const ATTACHMENT_ID = '830000000000000001';

export function fakeFetch(
  respond: (url: string, init: RequestInit) => Response | Promise<Response>,
) {
  return vi.fn<FakeFetch>((url, init) => Promise.resolve(respond(url, init)));
}

export interface Reply {
  type: number;
  data: { content: string; flags: number; allowed_mentions: { parse: unknown[] } };
}

/** Sends a modal submit and returns the reply, after the screenshot copy (if any) has finished. */
export async function submitReport(
  handler: ReturnType<typeof createHandler>,
  keys: Keys,
  input: ModalInput,
  environment: Env,
): Promise<Reply> {
  const { ctx, settle } = makeCtx();
  const res = await interact(handler, { keys, body: modalSubmit(input) }, environment, ctx);
  const reply = (await jsonBody(res)) as Reply;
  await settle();
  return reply;
}

export function reportsEnv(keys: Keys): Env {
  return workerEnv({ DISCORD_PUBLIC_KEY: keys.publicHex });
}

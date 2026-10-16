import { MAX_SHOT_BYTES, type ShotType } from './feedback-inbox';

const FETCH_TIMEOUT_MS = 10_000;
/** Discord's own CDN hosts: the only places a screenshot is ever fetched from. */
const ALLOWED_HOSTS: readonly string[] = ['cdn.discordapp.com', 'media.discordapp.net'];
const ALLOWED_EXTENSIONS: readonly string[] = ['.png', '.jpg', '.jpeg', '.webp'];

export type FetchAttachment = (url: string, init: RequestInit) => Promise<Response>;

/** Why a screenshot was not copied. Only these fixed names are ever logged. */
export type CopyFailure = 'bad_url' | 'fetch' | 'status' | 'too_big' | 'bad_type' | 'empty';

export class CopyError extends Error {
  constructor(readonly kind: CopyFailure) {
    super(`feedback_screenshot_${kind}`);
    this.name = 'CopyError';
  }
}

/** True for `https://cdn.discordapp.com/...` and `https://media.discordapp.net/...` and nothing else. */
export function isAllowedShotUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    ALLOWED_HOSTS.includes(url.hostname) &&
    url.port === '' &&
    url.username === '' &&
    url.password === ''
  );
}

/** True when the file name (if there is one) ends in an allowed image extension. */
export function hasAllowedExtension(filename: string | undefined): boolean {
  if (filename === undefined) return true;
  const lower = filename.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** The image type from the file's first bytes (never from a label), or null. */
export function sniffImageType(bytes: Uint8Array): ShotType | null {
  const startsWith = (offset: number, expected: readonly number[]): boolean =>
    bytes.byteLength >= offset + expected.length &&
    expected.every((b, i) => bytes[offset + i] === b);
  if (startsWith(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  // WebP: "RIFF", four size bytes, then "WEBP".
  if (startsWith(0, [0x52, 0x49, 0x46, 0x46]) && startsWith(8, [0x57, 0x45, 0x42, 0x50])) {
    return 'image/webp';
  }
  return null;
}

/** Reads the body, giving up once it passes `MAX_SHOT_BYTES`. */
async function readCapped(body: ReadableStream): Promise<Uint8Array> {
  const reader = body.getReader() as ReadableStreamDefaultReader<Uint8Array>;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_SHOT_BYTES) {
      await reader.cancel();
      throw new CopyError('too_big');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * Downloads a screenshot from Discord's CDN and checks it: allowed host, 10 s timeout, no redirects,
 * 2xx only, at most 8 MiB, and PNG, JPEG or WebP by its first bytes. Throws a `CopyError`.
 */
export async function downloadScreenshot(
  url: string,
  fetchAttachment: FetchAttachment,
): Promise<{ type: ShotType; bytes: Uint8Array }> {
  if (!isAllowedShotUrl(url)) throw new CopyError('bad_url');
  let res: Response;
  try {
    res = await fetchAttachment(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    // Network error or timeout. Details are dropped on purpose.
    throw new CopyError('fetch');
  }
  if (res.status < 200 || res.status > 299 || res.body === null) {
    await res.body?.cancel().catch(() => undefined);
    throw new CopyError('status');
  }
  const declared = res.headers.get('Content-Length');
  if (declared !== null && Number(declared) > MAX_SHOT_BYTES) {
    await res.body.cancel().catch(() => undefined);
    throw new CopyError('too_big');
  }
  let bytes: Uint8Array;
  try {
    bytes = await readCapped(res.body);
  } catch (err) {
    throw err instanceof CopyError ? err : new CopyError('fetch');
  }
  if (bytes.byteLength === 0) throw new CopyError('empty');
  const type = sniffImageType(bytes);
  if (type === null) throw new CopyError('bad_type');
  return { type, bytes };
}

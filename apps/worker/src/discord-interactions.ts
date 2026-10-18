/**
 * `POST /api/discord/interactions`: Discord's interactions endpoint, used for the `/feedback` command
 * (design in `docs/design/feedback.md`).
 *
 * - Every request must carry a valid Ed25519 signature (`X-Signature-Ed25519` over
 *   `X-Signature-Timestamp` plus the raw body) made with the app's public key. A missing or bad
 *   signature, or a timestamp more than 5 minutes from now, is a 401 before any JSON is parsed.
 * - With no public key configured (`DISCORD_PUBLIC_KEY` empty or not 64 hex characters) the route is a 404.
 * - The body is capped at 64 KiB. Discord's payloads are parsed loosely (Discord adds fields), but every
 *   field that is read is checked.
 * - The Activity's entry point command and the lounge message's button are answered with LAUNCH_ACTIVITY.
 * - Replies to a player are private ("ephemeral") with `allowed_mentions: { parse: [] }`.
 */
import * as v from 'valibot';
import { shownBranch } from './branch';
import { FEEDBACK_INBOX_NAME, MAX_SHOT_BYTES, type FeedbackKind } from './feedback-inbox';
import { reporterHash } from './feedback-reporter';
import {
  CopyError,
  downloadScreenshot,
  hasAllowedExtension,
  isAllowedShotUrl,
  type FetchAttachment,
} from './feedback-screenshot';
import {
  MAX_FEEDBACK_CODE_POINTS,
  MIN_FEEDBACK_CODE_POINTS,
  cleanFeedbackText,
  codePointLength,
} from './feedback-text';
import {
  errorResponse,
  json,
  methodNotAllowed,
  notFound,
  parseJsonObject,
  readLimitedText,
} from './http';
import { LOUNGE_BUTTON_ID } from './lounge';
import { SNOWFLAKE_RE } from './schemas';

export const INTERACTIONS_PATH = '/api/discord/interactions';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;
const PUBLIC_KEY_RE = /^[0-9a-f]{64}$/i;
const SIGNATURE_RE = /^[0-9a-f]{128}$/i;
const TIMESTAMP_RE = /^\d{1,12}$/;

export const FEEDBACK_COMMAND = 'feedback';
export const FEEDBACK_MODAL_ID = 'feedback';
const KIND_ID = 'kind';
const TEXT_ID = 'text';
const SHOT_ID = 'shot';

const PING = 1;
const APPLICATION_COMMAND = 2;
const MESSAGE_COMPONENT = 3;
const MODAL_SUBMIT = 5;
const PONG_RESPONSE = 1;
const MESSAGE_RESPONSE = 4;
const MODAL_RESPONSE = 9;
const LAUNCH_ACTIVITY_RESPONSE = 12;
/** Application command type of the Activity's entry point command (PRIMARY_ENTRY_POINT). */
const PRIMARY_ENTRY_POINT = 4;
const LAUNCH_COMMAND = 'launch';
const EPHEMERAL = 64;

export interface InteractionDeps {
  now(): number;
  fetchAttachment: FetchAttachment;
}

// --- Signature ---

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

let cachedPublicKey: { hex: string; key: Promise<CryptoKey> } | null = null;

function importPublicKey(hex: string): Promise<CryptoKey> {
  if (cachedPublicKey?.hex === hex) return cachedPublicKey.key;
  const key = crypto.subtle.importKey('raw', hexToBytes(hex), { name: 'Ed25519' }, false, [
    'verify',
  ]);
  const entry = { hex, key };
  cachedPublicKey = entry;
  key.catch(() => {
    if (cachedPublicKey === entry) cachedPublicKey = null;
  });
  return key;
}

async function signatureValid(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  body: string,
): Promise<boolean> {
  try {
    const key = await importPublicKey(publicKeyHex);
    return await crypto.subtle.verify(
      'Ed25519',
      key,
      hexToBytes(signatureHex),
      new TextEncoder().encode(timestamp + body),
    );
  } catch {
    return false;
  }
}

// --- Discord payloads (loose: Discord adds fields) ---

const snowflake = v.pipe(v.string(), v.regex(SNOWFLAKE_RE));

const TypeOnlySchema = v.object({ type: v.pipe(v.number(), v.integer()) });

const CommandSchema = v.object({
  guild_id: v.optional(snowflake),
  data: v.object({
    name: v.pipe(v.string(), v.maxLength(64)),
    type: v.optional(v.pipe(v.number(), v.integer())),
  }),
});

const ButtonSchema = v.object({
  data: v.object({ custom_id: v.pipe(v.string(), v.maxLength(100)) }),
});

const ComponentSchema = v.object({
  type: v.pipe(v.number(), v.integer()),
  custom_id: v.pipe(v.string(), v.maxLength(100)),
  value: v.optional(v.pipe(v.string(), v.maxLength(10_000))),
  values: v.optional(v.pipe(v.array(v.pipe(v.string(), v.maxLength(100))), v.maxLength(25))),
});
type Component = v.InferOutput<typeof ComponentSchema>;

/** A Label wraps one `component`; an Action Row (older shape) wraps up to 5 in `components`. */
const WrapperSchema = v.object({
  type: v.pipe(v.number(), v.integer()),
  component: v.optional(ComponentSchema),
  components: v.optional(v.pipe(v.array(ComponentSchema), v.maxLength(5))),
});

const ModalSubmitSchema = v.object({
  guild_id: v.optional(snowflake),
  member: v.optional(v.object({ user: v.object({ id: snowflake }) })),
  data: v.object({
    custom_id: v.pipe(v.string(), v.maxLength(100)),
    components: v.pipe(v.array(v.unknown()), v.maxLength(10)),
    resolved: v.optional(v.object({ attachments: v.optional(v.record(v.string(), v.unknown())) })),
  }),
});

const AttachmentSchema = v.object({
  url: v.pipe(v.string(), v.maxLength(2048)),
  size: v.pipe(v.number(), v.integer(), v.minValue(0)),
  filename: v.optional(v.pipe(v.string(), v.maxLength(300))),
});

/** The components of a modal by `custom_id`, found inside Label (and Action Row) wrappers. */
function collectComponents(items: readonly unknown[]): Map<string, Component> {
  const found = new Map<string, Component>();
  for (const item of items) {
    const wrapper = v.safeParse(WrapperSchema, item);
    if (!wrapper.success) continue;
    const inner = [
      ...(wrapper.output.component === undefined ? [] : [wrapper.output.component]),
      ...(wrapper.output.components ?? []),
    ];
    for (const component of inner) {
      if (!found.has(component.custom_id)) found.set(component.custom_id, component);
    }
  }
  return found;
}

// --- Replies ---

function message(content: string): Response {
  return json({
    type: MESSAGE_RESPONSE,
    data: { content, flags: EPHEMERAL, allowed_mentions: { parse: [] } },
  });
}

const REPLIES = {
  unavailable: "That command isn't available here.",
  badForm: "That form isn't available here.",
  pickKind: 'Please pick what kind of feedback it is, then send it again.',
  length: `Your message needs to be ${String(MIN_FEEDBACK_CODE_POINTS)} to ${String(MAX_FEEDBACK_CODE_POINTS)} characters long. Please try again.`,
  thanks:
    "Thank you, your feedback is in. It may show on the game's public GitHub page, without your name.",
  tooBig: ' Your screenshot was too big (the limit is 8 MB), so it was left out.',
  badType: " Your file wasn't a PNG, JPEG or WebP image, so it was left out.",
  reporterLimit: "You've sent a few reports already today. Please try again tomorrow.",
  guildLimit: 'Your server has sent a lot of feedback today. Please try again tomorrow.',
  inboxFull: 'The feedback inbox is full right now. Please try again a little later.',
  failed: 'Something went wrong saving that. Please try again in a little while.',
} as const;

const MODAL_BODY = {
  type: MODAL_RESPONSE,
  data: {
    custom_id: FEEDBACK_MODAL_ID,
    title: 'Send feedback',
    components: [
      {
        type: 18,
        label: 'What is it?',
        component: {
          type: 3,
          custom_id: KIND_ID,
          required: true,
          min_values: 1,
          max_values: 1,
          options: [
            { label: 'Something is broken', value: 'bug' },
            { label: 'An idea', value: 'idea' },
            { label: 'Something else', value: 'other' },
          ],
        },
      },
      {
        type: 18,
        label: 'Tell us more',
        description: "Your words may appear on the game's public GitHub page, without your name.",
        component: {
          type: 4,
          custom_id: TEXT_ID,
          style: 2,
          required: true,
          min_length: MIN_FEEDBACK_CODE_POINTS,
          max_length: MAX_FEEDBACK_CODE_POINTS,
        },
      },
      {
        type: 18,
        label: 'Screenshot (optional)',
        component: {
          type: 19,
          custom_id: SHOT_ID,
          required: false,
          min_values: 0,
          max_values: 1,
          file_types: ['.png', '.jpg', '.jpeg', '.webp'],
        },
      },
    ],
  },
} as const;

// --- Handling ---

function isKind(value: string | undefined): value is FeedbackKind {
  return value === 'bug' || value === 'idea' || value === 'other';
}

/** Where a screenshot would be fetched from, or why it is left out. */
type ShotPlan = { kind: 'none' } | { kind: 'copy'; url: string } | { kind: 'skip'; note: string };

function planScreenshot(
  fileValues: readonly string[] | undefined,
  attachments: Record<string, unknown> | undefined,
): ShotPlan {
  if (fileValues === undefined || fileValues.length === 0) return { kind: 'none' };
  const id = fileValues[0];
  if (fileValues.length !== 1 || id === undefined) return { kind: 'skip', note: REPLIES.badType };
  const entry =
    attachments !== undefined && Object.hasOwn(attachments, id) ? attachments[id] : undefined;
  const parsed = v.safeParse(AttachmentSchema, entry);
  if (!parsed.success) return { kind: 'skip', note: REPLIES.badType };
  const { url, size, filename } = parsed.output;
  if (size > MAX_SHOT_BYTES) return { kind: 'skip', note: REPLIES.tooBig };
  if (size === 0 || !hasAllowedExtension(filename) || !isAllowedShotUrl(url)) {
    return { kind: 'skip', note: REPLIES.badType };
  }
  return { kind: 'copy', url };
}

async function copyScreenshot(
  env: Env,
  deps: InteractionDeps,
  reportId: number,
  url: string,
): Promise<void> {
  const inbox = env.FEEDBACK_INBOX.getByName(FEEDBACK_INBOX_NAME);
  try {
    const { type, bytes } = await downloadScreenshot(url, deps.fetchAttachment);
    if (!(await inbox.storeShot(reportId, type, bytes))) await inbox.failShot(reportId);
  } catch (err) {
    // Only a fixed error kind is logged: never a URL, a file or a message.
    console.error(
      'feedback screenshot not copied',
      err instanceof CopyError ? err.kind : err instanceof Error ? err.name : 'unknown',
    );
    try {
      await inbox.failShot(reportId);
    } catch {
      // The inbox shows the screenshot as failed anyway once it has been pending for 10 minutes.
    }
  }
}

async function handleModalSubmit(
  payload: unknown,
  env: Env,
  ctx: ExecutionContext,
  deps: InteractionDeps,
): Promise<Response> {
  const parsed = v.safeParse(ModalSubmitSchema, payload);
  if (!parsed.success) return errorResponse('invalid_interaction', 400);
  const { guild_id: guildId, member, data } = parsed.output;
  if (data.custom_id !== FEEDBACK_MODAL_ID) return message(REPLIES.badForm);
  if (guildId === undefined || member === undefined) return message(REPLIES.unavailable);

  const components = collectComponents(data.components);
  const kind = components.get(KIND_ID)?.values?.[0];
  if (!isKind(kind)) return message(REPLIES.pickKind);
  const text = cleanFeedbackText(components.get(TEXT_ID)?.value ?? '');
  const length = codePointLength(text);
  if (length < MIN_FEEDBACK_CODE_POINTS || length > MAX_FEEDBACK_CODE_POINTS) {
    return message(REPLIES.length);
  }
  const plan = planScreenshot(components.get(SHOT_ID)?.values, data.resolved?.attachments);

  try {
    const inbox = env.FEEDBACK_INBOX.getByName(FEEDBACK_INBOX_NAME);
    const result = await inbox.submit({
      kind,
      text,
      guildId,
      reporterHash: await reporterHash(env.DISCORD_CLIENT_SECRET, member.user.id),
      version: env.VERSION,
      branch: shownBranch(env.BRANCH) ?? null,
      shot: plan.kind === 'copy' ? 'pending' : 'none',
      now: deps.now(),
    });
    if (!result.ok) {
      if (result.reason === 'reporter_limit') return message(REPLIES.reporterLimit);
      if (result.reason === 'guild_limit') return message(REPLIES.guildLimit);
      return message(REPLIES.inboxFull);
    }
    // The player's answer goes out first; the copy runs after it (Discord's links expire in about a day).
    if (plan.kind === 'copy') ctx.waitUntil(copyScreenshot(env, deps, result.id, plan.url));
    return message(REPLIES.thanks + (plan.kind === 'skip' ? plan.note : ''));
  } catch (err) {
    console.error('feedback not saved', err instanceof Error ? err.name : 'unknown');
    return message(REPLIES.failed);
  }
}

/** Launches the Activity and posts nothing (the game's lounge message is kept by the game itself). */
const launchActivity = (): Response => json({ type: LAUNCH_ACTIVITY_RESPONSE });

function handleButton(payload: unknown): Response {
  const parsed = v.safeParse(ButtonSchema, payload);
  if (!parsed.success) return errorResponse('invalid_interaction', 400);
  return parsed.output.data.custom_id === LOUNGE_BUTTON_ID
    ? launchActivity()
    : message(REPLIES.unavailable);
}

function handleCommand(payload: unknown): Response {
  const parsed = v.safeParse(CommandSchema, payload);
  if (!parsed.success) return errorResponse('invalid_interaction', 400);
  const { data } = parsed.output;
  if (data.type === PRIMARY_ENTRY_POINT || data.name === LAUNCH_COMMAND) return launchActivity();
  if (parsed.output.data.name !== FEEDBACK_COMMAND || parsed.output.guild_id === undefined) {
    return message(REPLIES.unavailable);
  }
  return json(MODAL_BODY);
}

export async function handleInteraction(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  deps: InteractionDeps,
): Promise<Response> {
  const publicKey = env.DISCORD_PUBLIC_KEY;
  if (typeof publicKey !== 'string' || !PUBLIC_KEY_RE.test(publicKey)) return notFound();
  if (request.method !== 'POST') return methodNotAllowed('POST');

  const signature = request.headers.get('X-Signature-Ed25519');
  const timestamp = request.headers.get('X-Signature-Timestamp');
  if (
    signature === null ||
    timestamp === null ||
    !SIGNATURE_RE.test(signature) ||
    !TIMESTAMP_RE.test(timestamp) ||
    Math.abs(Number(timestamp) * 1000 - deps.now()) > MAX_TIMESTAMP_SKEW_MS
  ) {
    return errorResponse('invalid_signature', 401);
  }
  const body = await readLimitedText(request, MAX_BODY_BYTES);
  if (body === null) return errorResponse('payload_too_large', 413);
  if (!(await signatureValid(publicKey, signature, timestamp, body))) {
    return errorResponse('invalid_signature', 401);
  }

  const payload = parseJsonObject(body);
  const kind = v.safeParse(TypeOnlySchema, payload);
  if (!kind.success) return errorResponse('invalid_interaction', 400);
  switch (kind.output.type) {
    case PING:
      return json({ type: PONG_RESPONSE });
    case APPLICATION_COMMAND:
      return handleCommand(payload);
    case MESSAGE_COMPONENT:
      return handleButton(payload);
    case MODAL_SUBMIT:
      return handleModalSubmit(payload, env, ctx, deps);
    default:
      return errorResponse('invalid_interaction', 400);
  }
}

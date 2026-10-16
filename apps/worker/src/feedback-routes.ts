/**
 * The feedback ops routes (design in `docs/design/feedback.md`):
 *
 * - `GET  /api/ops/feedback/pending`: up to 20 new reports, for the export workflow. Bearer `OPS_TOKEN`.
 * - `POST /api/ops/feedback/exported` `{ id, issue }`: marks a report as exported. Bearer `OPS_TOKEN`.
 * - `GET  /api/ops/feedback/report?id=`: one report. Bearer `FEEDBACK_READ_TOKEN`.
 * - `GET  /api/ops/feedback/screenshot?id=`: its screenshot. Bearer `FEEDBACK_READ_TOKEN`.
 *
 * As with `/api/ops/report`: an unset or empty token, a wrong token or a wrong method all answer the
 * same plain 404; tokens are compared in constant time after hashing; requests are rate-limited per
 * caller (a hash of the connecting IP); session tokens are never read. The public output holds no user
 * id, no guild id and no reporter hash: a server shows as a stable alias (`g-` plus 6 hex characters).
 */
import * as v from 'valibot';
import { FEEDBACK_INBOX_NAME, type StoredReport } from './feedback-inbox';
import { API_HEADERS, errorResponse, json, notFound, parseBody } from './http';
import { bearerToken, guildAliases, limiterKey, tokenMatches } from './ops-report';
import type { TokenBucketLimiter } from './ratelimit';

export const FEEDBACK_PENDING_PATH = '/api/ops/feedback/pending';
export const FEEDBACK_EXPORTED_PATH = '/api/ops/feedback/exported';
export const FEEDBACK_REPORT_PATH = '/api/ops/feedback/report';
export const FEEDBACK_SCREENSHOT_PATH = '/api/ops/feedback/screenshot';

type TokenName = 'OPS_TOKEN' | 'FEEDBACK_READ_TOKEN';

const ROUTES: Record<string, { method: 'GET' | 'POST'; token: TokenName }> = {
  [FEEDBACK_PENDING_PATH]: { method: 'GET', token: 'OPS_TOKEN' },
  [FEEDBACK_EXPORTED_PATH]: { method: 'POST', token: 'OPS_TOKEN' },
  [FEEDBACK_REPORT_PATH]: { method: 'GET', token: 'FEEDBACK_READ_TOKEN' },
  [FEEDBACK_SCREENSHOT_PATH]: { method: 'GET', token: 'FEEDBACK_READ_TOKEN' },
};

export function isFeedbackOpsPath(pathname: string): boolean {
  return Object.hasOwn(ROUTES, pathname);
}

export interface FeedbackRouteDeps {
  limiter: TokenBucketLimiter;
  now(): number;
}

const ID_RE = /^\d{1,15}$/;
const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as const;

const positiveInt = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(Number.MAX_SAFE_INTEGER),
);
const ExportedSchema = v.strictObject({ id: positiveInt, issue: positiveInt });

/** The id of `?id=`, or null when it is missing or not 1 to 15 digits (and at least 1). */
function queryId(url: URL): number | null {
  const raw = url.searchParams.get('id');
  if (raw === null || !ID_RE.test(raw)) return null;
  const id = Number(raw);
  return id >= 1 ? id : null;
}

function publicReport(report: StoredReport, alias: string) {
  return {
    id: report.id,
    kind: report.kind,
    text: report.text,
    createdAt: report.createdAt,
    guildAlias: alias,
    version: report.version,
    branch: report.branch,
    screenshot: report.shot,
  };
}

async function aliasesOf(env: Env, reports: readonly StoredReport[]): Promise<Map<string, string>> {
  return guildAliases(env.DISCORD_CLIENT_SECRET, [...new Set(reports.map((r) => r.guildId))]);
}

export async function handleFeedbackRoute(
  pathname: string,
  request: Request,
  env: Env,
  deps: FeedbackRouteDeps,
): Promise<Response> {
  const route = Object.hasOwn(ROUTES, pathname) ? ROUTES[pathname] : undefined;
  if (route === undefined || request.method !== route.method) return notFound();
  const expected = env[route.token];
  if (expected === undefined || expected === '') return notFound();

  const limit = deps.limiter.take(await limiterKey(request));
  if (!limit.allowed) {
    return errorResponse('rate_limited', 429, { 'Retry-After': String(limit.retryAfterSeconds) });
  }
  const presented = bearerToken(request);
  if (presented === null || !(await tokenMatches(presented, expected))) return notFound();

  const inbox = env.FEEDBACK_INBOX.getByName(FEEDBACK_INBOX_NAME);
  const url = new URL(request.url);

  switch (pathname) {
    case FEEDBACK_PENDING_PATH: {
      const reports = await inbox.pending(deps.now());
      const aliases = await aliasesOf(env, reports);
      return json({
        reports: reports.flatMap((r) => {
          const alias = aliases.get(r.guildId);
          return alias === undefined ? [] : [publicReport(r, alias)];
        }),
      });
    }
    case FEEDBACK_EXPORTED_PATH: {
      const body = await parseBody(request, ExportedSchema);
      if (body === undefined) return errorResponse('invalid_body', 400);
      const result = await inbox.markExported(body.id, body.issue, deps.now());
      if (result === 'not_found') return notFound();
      if (result === 'conflict') return errorResponse('conflict', 409);
      return json({ ok: true });
    }
    case FEEDBACK_REPORT_PATH: {
      const id = queryId(url);
      if (id === null) return errorResponse('invalid_query', 400);
      const report = await inbox.report(id, deps.now());
      if (report === null) return notFound();
      const alias = (await aliasesOf(env, [report])).get(report.guildId);
      if (alias === undefined) return notFound();
      return json({ ...publicReport(report, alias), issue: report.issue });
    }
    default: {
      const id = queryId(url);
      if (id === null) return errorResponse('invalid_query', 400);
      const shot = await inbox.shot(id);
      if (shot === null) return notFound();
      return new Response(shot.bytes, {
        status: 200,
        headers: {
          ...API_HEADERS,
          'Content-Type': shot.type,
          'Content-Disposition': `attachment; filename="report-${String(id)}.${EXTENSIONS[shot.type]}"`,
        },
      });
    }
  }
}

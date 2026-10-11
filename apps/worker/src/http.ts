export const API_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
} as const;

export function json(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...API_HEADERS, ...extraHeaders },
  });
}

export function errorResponse(
  error: string,
  status: number,
  extraHeaders: Record<string, string> = {},
): Response {
  return json({ error }, status, extraHeaders);
}

export type Handler<C> = (request: Request, ctx: C) => Response | Promise<Response>;

/** Route table: path -> method -> handler. */
export type Routes<C> = Record<string, Record<string, Handler<C>>>;

export type RouteMatch<C> =
  | { kind: 'ok'; handler: Handler<C> }
  | { kind: 'not_found' }
  | { kind: 'method_not_allowed'; allow: string };

/** Own-property lookups only, so paths like `/constructor` never hit Object.prototype. */
export function matchRoute<C>(routes: Routes<C>, pathname: string, method: string): RouteMatch<C> {
  const route = Object.hasOwn(routes, pathname) ? routes[pathname] : undefined;
  if (route === undefined) {
    return { kind: 'not_found' };
  }
  const handler = Object.hasOwn(route, method) ? route[method] : undefined;
  if (handler === undefined) {
    return { kind: 'method_not_allowed', allow: Object.keys(route).join(', ') };
  }
  return { kind: 'ok', handler };
}

export function methodNotAllowed(allow: string): Response {
  return errorResponse('method_not_allowed', 405, { Allow: allow });
}

export function notFound(): Response {
  return errorResponse('not_found', 404);
}

/** Dispatch through a route table with the standard 404 / 405 responses. */
export function dispatch<C>(
  routes: Routes<C>,
  request: Request,
  pathname: string,
  ctx: C,
): Response | Promise<Response> {
  const match = matchRoute(routes, pathname, request.method);
  switch (match.kind) {
    case 'ok':
      return match.handler(request, ctx);
    case 'not_found':
      return notFound();
    case 'method_not_allowed':
      return methodNotAllowed(match.allow);
  }
}

/** Reads the body as UTF-8 text, giving up (null) once it exceeds `maxBytes`. */
export async function readLimitedText(request: Request, maxBytes: number): Promise<string | null> {
  const declared = request.headers.get('Content-Length');
  if (declared !== null && Number(declared) > maxBytes) return null;
  if (request.body === null) return '';
  const reader = request.body.getReader() as ReadableStreamDefaultReader<Uint8Array>;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Parses JSON text that must be an object. Returns `undefined` for anything else: invalid JSON,
 * arrays, null and primitives. valibot's `object`/`strictObject` accept an array when every key is
 * optional (for example `[]` for `{}`), so this check lives here once instead of in every route.
 */
export function parseJsonObject(text: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
  return parsed;
}

/**
 * Reads a small JSON object body. Returns `undefined` when it is too large, not UTF-8, not JSON or
 * not a JSON object (arrays are rejected).
 */
export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const text = await readLimitedText(request, maxBytes);
  if (text === null) return undefined;
  return parseJsonObject(text);
}

export interface TemplateMatch {
  /** The matching route key, for example `/api/creatures/:id/train`. */
  template: string;
  params: Record<string, string>;
}

/**
 * Finds the template route (segments starting with `:` match exactly one non-empty segment) that
 * fits `pathname`. Only keys containing a `:` segment are considered; exact routes are matched by
 * `matchRoute`. Parameter values are returned raw: validate them with a schema before use.
 */
export function matchTemplate(
  routeKeys: readonly string[],
  pathname: string,
): TemplateMatch | null {
  const parts = pathname.split('/');
  for (const template of routeKeys) {
    const templateParts = template.split('/');
    if (templateParts.length !== parts.length || !templateParts.some((p) => p.startsWith(':'))) {
      continue;
    }
    const params: Record<string, string> = Object.create(null) as Record<string, string>;
    let matched = true;
    for (let i = 0; i < parts.length; i++) {
      const expected = templateParts[i];
      const actual = parts[i];
      if (expected === undefined || actual === undefined) {
        matched = false;
        break;
      }
      if (expected.startsWith(':')) {
        if (actual === '') {
          matched = false;
          break;
        }
        params[expected.slice(1)] = actual;
      } else if (expected !== actual) {
        matched = false;
        break;
      }
    }
    if (matched) return { template, params };
  }
  return null;
}

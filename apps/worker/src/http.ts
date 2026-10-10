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

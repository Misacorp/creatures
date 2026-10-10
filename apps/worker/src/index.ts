type Handler = (request: Request, env: Env) => Response | Promise<Response>;

/** Route table: path -> method -> handler. M1 adds routes by adding entries here. */
type RouteTable = Record<string, Record<string, Handler>>;

const API_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
} as const;

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...API_HEADERS, ...extraHeaders },
  });
}

const routes: RouteTable = {
  '/api/health': {
    GET: () => json({ ok: true }),
  },
  '/api/config': {
    GET: (_request, env) =>
      json({
        discordClientId: env.DISCORD_CLIENT_ID,
        environment: env.ENVIRONMENT,
        version: env.VERSION,
      }),
  },
};

function handleApi(request: Request, env: Env, pathname: string): Response | Promise<Response> {
  const route = Object.hasOwn(routes, pathname) ? routes[pathname] : undefined;
  if (route === undefined) {
    return json({ error: 'not_found' }, 404);
  }
  const handler = Object.hasOwn(route, request.method) ? route[request.method] : undefined;
  if (handler === undefined) {
    return json({ error: 'method_not_allowed' }, 405, { Allow: Object.keys(route).join(', ') });
  }
  return handler(request, env);
}

export default {
  fetch(request, env): Response | Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return handleApi(request, env, pathname);
    }
    // Only reached if run_worker_first is widened; static assets are normally served directly.
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

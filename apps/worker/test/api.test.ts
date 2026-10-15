import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const ORIGIN = 'https://creatures.test';

function call(path: string, method = 'GET'): Promise<Response> {
  return exports.default.fetch(new Request(`${ORIGIN}${path}`, { method }));
}

function expectApiHeaders(res: Response): void {
  expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
  expect(res.headers.get('Cache-Control')).toBe('no-store');
  expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
  expect(res.headers.has('Access-Control-Allow-Origin')).toBe(false);
}

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const res = await call('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expectApiHeaders(res);
  });
});

describe('GET /api/config', () => {
  it('returns public config from env vars', async () => {
    const res = await call('/api/config');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      discordClientId: '000000000000000000',
      environment: 'local',
      version: 'dev',
      branch: 'dev',
      leetSource: 'mock',
    });
    expectApiHeaders(res);
  });
});

describe('non-public API routes', () => {
  // Everything that is not a public route needs a session; 404 only happens after authentication.
  it.each(['/api/nope', '/api/health/', '/api', '/api/constructor', '/api/me'])(
    '401s without a session on %s',
    async (path) => {
      const res = await call(path);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'invalid_session' });
      expectApiHeaders(res);
    },
  );
});

describe('method handling', () => {
  it.each(['POST', 'PUT', 'DELETE', 'PATCH'])('405s on %s /api/health', async (method) => {
    const res = await call('/api/health', method);
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('GET');
    expect(await res.json()).toEqual({ error: 'method_not_allowed' });
    expectApiHeaders(res);
  });

  it('405s on POST /api/config', async () => {
    const res = await call('/api/config', 'POST');
    expect(res.status).toBe(405);
    expectApiHeaders(res);
  });
});

import { describe, expect, it } from 'vitest';
import { matchTemplate, readJsonBody } from '../src/http';

const KEYS = ['/api/state', '/api/creatures/:id', '/api/creatures/:id/train', '/api/a/:x/b/:y'];

describe('matchTemplate', () => {
  it('matches template routes and returns raw params', () => {
    expect(matchTemplate(KEYS, '/api/creatures/abc')).toEqual({
      template: '/api/creatures/:id',
      params: { id: 'abc' },
    });
    expect(matchTemplate(KEYS, '/api/creatures/abc/train')?.template).toBe(
      '/api/creatures/:id/train',
    );
    expect(matchTemplate(KEYS, '/api/a/1/b/2')?.params).toEqual({ x: '1', y: '2' });
  });

  it('does not match exact routes, other lengths, empty segments or other literals', () => {
    for (const path of [
      '/api/state',
      '/api/creatures',
      '/api/creatures/',
      '/api/creatures/abc/untrain',
      '/api/creatures/abc/train/more',
      '/api/other/abc',
      '/api/a//b/2',
    ]) {
      expect(matchTemplate(KEYS, path), path).toBeNull();
    }
  });

  it('keeps hostile parameter values as plain strings', () => {
    const match = matchTemplate(KEYS, '/api/creatures/__proto__');
    expect(match?.params['id']).toBe('__proto__');
    expect(Object.getPrototypeOf(match?.params)).toBeNull();
  });
});

describe('readJsonBody', () => {
  const post = (body: BodyInit | null) => new Request('https://x.test/', { method: 'POST', body });

  it('parses JSON within the limit', async () => {
    expect(await readJsonBody(post('{"a":1}'), 100)).toEqual({ a: 1 });
  });

  it('returns undefined for oversized, empty, invalid or non-UTF-8 bodies', async () => {
    expect(await readJsonBody(post('{"a":"' + 'x'.repeat(200) + '"}'), 100)).toBeUndefined();
    expect(await readJsonBody(post(null), 100)).toBeUndefined();
    expect(await readJsonBody(post('nope'), 100)).toBeUndefined();
    expect(await readJsonBody(post(new Uint8Array([0xff, 0xfe])), 100)).toBeUndefined();
  });

  it('returns undefined unless the body is a JSON object (arrays, null and primitives)', async () => {
    // valibot's strictObject({}) accepts [], so the body helper must refuse it first.
    for (const body of ['[]', '[1]', 'null', '7', '"text"', 'true']) {
      expect(await readJsonBody(post(body), 100), body).toBeUndefined();
    }
    expect(await readJsonBody(post('{}'), 100)).toEqual({});
  });
});

import { describe, expect, it } from 'vitest';
import { jsonRequest } from './api';

describe('jsonRequest', () => {
  it('sends the body as JSON with one content type', () => {
    expect(jsonRequest('POST', { a: 1, b: ['x'] })).toEqual({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"a":1,"b":["x"]}',
    });
  });

  it('keeps the method the route wants', () => {
    expect(jsonRequest('PUT', {}).method).toBe('PUT');
    expect(jsonRequest('PATCH', { nickname: 'Bo' }).method).toBe('PATCH');
    expect(jsonRequest('DELETE', { creatureId: 'c1' }).body).toBe('{"creatureId":"c1"}');
  });

  it('encodes a null body as the JSON null, like the old helpers did', () => {
    expect(jsonRequest('POST', null).body).toBe('null');
  });
});

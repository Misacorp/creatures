import { describe, expect, it } from 'vitest';
import { PROTOTYPE_URL } from './prototype-link';

describe('the prototype link of the dev panel', () => {
  it('is the staging page, over https', () => {
    const url = new URL(PROTOTYPE_URL);
    expect(url.protocol).toBe('https:');
    expect(url.hostname).toBe('creatures-staging.misacorp.dev');
    expect(url.pathname).toBe('/prototype.html');
  });
});

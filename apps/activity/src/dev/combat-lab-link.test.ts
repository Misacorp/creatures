import { describe, expect, it } from 'vitest';
import { COMBAT_LAB_URL } from './combat-lab-link';

describe('the combat lab link of the dev panel', () => {
  it('is the staging page, over https', () => {
    const url = new URL(COMBAT_LAB_URL);
    expect(url.protocol).toBe('https:');
    expect(url.hostname).toBe('creatures-staging.misacorp.dev');
    expect(url.pathname).toBe('/combat-lab.html');
  });
});

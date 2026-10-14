import { describe, expect, it } from 'vitest';
import { WORKBENCH_URL } from './workbench-link';

describe('the workbench link of the dev panel', () => {
  it('is the staging page, over https', () => {
    const url = new URL(WORKBENCH_URL);
    expect(url.protocol).toBe('https:');
    expect(url.hostname).toBe('creatures-staging.misacorp.dev');
    expect(url.pathname).toBe('/workbench.html');
  });
});

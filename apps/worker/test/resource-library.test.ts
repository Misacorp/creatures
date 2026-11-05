import { resource } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { CURRENCIES } from '../src/ledger';

describe('the resource library covers the ledger', () => {
  it('has a currency entry for every ledger currency', () => {
    for (const currency of CURRENCIES) expect(resource(currency)?.kind, currency).toBe('currency');
  });
});

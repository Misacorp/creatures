import { describe, expect, it } from 'vitest';
import { footerRows } from './footer-rows';

const labels = (rows: { label: unknown }[]): unknown[] => rows.map((r) => r.label);

describe('footerRows', () => {
  it('lists the environment, version, branch and guild, then the health', () => {
    const rows = footerRows(
      { environment: 'staging', version: '1.2.3', branch: 'night/polish', guildId: '42' },
      'ok',
    );
    expect(labels(rows)).toEqual([
      'Environment',
      'Server version',
      'Branch',
      'Guild ID',
      'API health',
    ]);
    expect(rows.map((r) => r.value)).toEqual(['staging', '1.2.3', 'night/polish', '42', 'ok']);
  });

  it('leaves out the branch and the guild when there are none (production, outside Discord)', () => {
    const rows = footerRows(
      { environment: 'production', version: '1.2.3', branch: null, guildId: null },
      'ok',
    );
    expect(labels(rows)).toEqual(['Environment', 'Server version', 'API health']);
  });

  it('shows only the health before the boot call has answered', () => {
    expect(footerRows(null, 'checking...')).toEqual([
      { label: 'API health', value: 'checking...' },
    ]);
  });
});

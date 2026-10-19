import type { DataRow } from './ui/DataTable';

/** What the footer says about where the game runs. Null while the boot call has not answered (or failed). */
export interface FooterInfo {
  environment: string;
  version: string;
  /** The deployed branch (staging shows it), or null. */
  branch: string | null;
  /** The signed-in player's server, or null outside Discord. */
  guildId: string | null;
}

/** The footer's table: environment, version, branch and guild when known, then the API's health. */
export function footerRows(info: FooterInfo | null, healthText: string): DataRow[] {
  const rows: DataRow[] = [];
  if (info !== null) {
    rows.push({ label: 'Environment', value: info.environment });
    rows.push({ label: 'Server version', value: info.version });
    if (info.branch !== null) rows.push({ label: 'Branch', value: info.branch });
    if (info.guildId !== null) rows.push({ label: 'Guild ID', value: info.guildId });
  }
  rows.push({ label: 'API health', value: healthText });
  return rows;
}

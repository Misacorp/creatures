import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseReport, type Report, type Row } from '../src/live-report';

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'live-report.json');

/** The synthetic fixture report (no real data), as text. */
export function fixtureText(): string {
  return readFileSync(FIXTURE, 'utf8');
}

export function fixtureReport(): Report {
  return parseReport(fixtureText());
}

/** A row without the boilerplate. */
export function row(metric: string, value: number, dims: Row['dims'] = {}): Row {
  return { metric, dims, value };
}

/** A small report around `totals`, for threshold tests. */
export function makeReport(totals: Row[], overrides: Partial<Report> = {}): Report {
  return {
    version: 1,
    from: '2026-10-06',
    to: '2026-10-12',
    days: 7,
    rolledDays: 7,
    totals,
    guilds: { known: 1, reporting: 1 },
    daily: {},
    byGuild: {},
    ...overrides,
  };
}

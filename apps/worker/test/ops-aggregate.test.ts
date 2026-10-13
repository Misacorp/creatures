import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  MAX_REPORT_DAYS,
  buildPeriod,
  parseOpsQuery,
  parseRow,
  type RawRow,
} from '../src/ops-aggregate';
import { guildAliases } from '../src/ops-report';

const raw = (
  day: string,
  metric: string,
  dims: unknown,
  value: number,
  dimsJson = JSON.stringify(dims),
): RawRow => ({ day, metric, dimsJson, value });

const query = (qs: string) => parseOpsQuery(new URL(`https://x.test/api/ops/report?${qs}`));

describe('parseRow', () => {
  it('accepts a metric with id-like dims and an integer value', () => {
    expect(
      parseRow(raw('2027-01-14', 'flow', { currency: 'bait', dir: 'sink', rank: 3 }, 9)),
    ).toEqual({
      metric: 'flow',
      dims: { currency: 'bait', dir: 'sink', rank: 3 },
      value: 9,
    });
    expect(parseRow(raw('2027-01-14', 'dau', {}, 0))).toEqual({
      metric: 'dau',
      dims: {},
      value: 0,
    });
  });

  it('refuses anything that could carry a hash, a name or free text', () => {
    const bad: RawRow[] = [
      raw('d', 'flow', { label: 'a'.repeat(32) }, 1),
      raw('d', 'flow', { label: `x${'0123456789abcdef'.repeat(4)}` }, 1),
      raw('d', 'flow', { label: '123456789012345' }, 1),
      raw('d', 'flow', { label: '700000000000000000' }, 1),
      raw('d', 'flow', { label: '123e4567-e89b-12d3-a456-426614174000' }, 1),
      raw('d', 'flow', { label: '123e4567e89b12d3a456426614174000' }, 1),
      raw('d', 'flow', { label: '123E4567-E89B-12D3-A456-426614174000' }, 1),
      raw('d', 'flow', { label: 'Misa the Mighty' }, 1),
      raw('d', 'flow', { label: '<b>hi</b>' }, 1),
      raw('d', 'flow', { label: 'x'.repeat(49) }, 1),
      raw('d', 'flow', { label: ['a'] }, 1),
      raw('d', 'flow', { label: { a: 1 } }, 1),
      raw('d', 'flow', { label: null }, 1),
      raw('d', 'flow', { Label: 'a' }, 1),
      raw('d', 'flow', { label: -1 }, 1),
      raw('d', 'flow', { label: 1.5 }, 1),
      raw('d', 'flow', {}, -1),
      raw('d', 'flow', {}, 1.5),
      raw('d', 'Flow', {}, 1),
      raw('d', 'flow;drop', {}, 1),
      raw('d', 'flow', {}, 1, 'not json'),
      raw('d', 'flow', {}, 1, '[1]'),
      raw('d', 'flow', {}, 1, 'null'),
      raw('d', 'flow', { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1 }, 1),
    ];
    for (const row of bad) expect(parseRow(row), JSON.stringify(row)).toBeNull();
  });
});

describe('buildPeriod', () => {
  it('sums over guilds and days, keeps per-guild totals under aliases and counts rolled days', () => {
    const { period, daily, byGuild } = buildPeriod('2027-01-13', '2027-01-15', [
      {
        alias: 'g-aaaaaa',
        rows: [
          raw('2027-01-13', 'rolled', {}, 1),
          raw('2027-01-14', 'rolled', {}, 1),
          raw('2027-01-13', 'dau', {}, 3),
          raw('2027-01-14', 'dau', {}, 4),
          raw('2027-01-14', 'raid.phase', { win: 1, phase: 'finale' }, 2),
          raw('2027-01-12', 'dau', {}, 99), // before the range
          raw('2027-01-16', 'dau', {}, 99), // after the range
          raw('2027-01-14', 'dau', { x: 'a'.repeat(32) }, 5), // invalid row
        ],
      },
      {
        alias: 'g-bbbbbb',
        rows: [raw('2027-01-14', 'rolled', {}, 1), raw('2027-01-14', 'dau', {}, 2)],
      },
    ]);
    expect(period).toMatchObject({ from: '2027-01-13', to: '2027-01-15', days: 3, rolledDays: 3 });
    expect(period.totals.find((r) => r.metric === 'dau')?.value).toBe(9);
    expect(period.totals.some((r) => r.metric === 'rolled')).toBe(false);
    expect(Object.keys(daily)).toEqual(['2027-01-13', '2027-01-14']);
    expect(daily['2027-01-14']?.find((r) => r.metric === 'dau')?.value).toBe(6);
    expect(Object.keys(byGuild)).toEqual(['g-aaaaaa', 'g-bbbbbb']);
    expect(byGuild['g-bbbbbb']).toEqual([{ metric: 'dau', dims: {}, value: 2 }]);
  });

  it('only gives a per-day series to the series metrics', () => {
    const { daily } = buildPeriod('2027-01-14', '2027-01-14', [
      {
        alias: 'g-aaaaaa',
        rows: [raw('2027-01-14', 'dau', {}, 1), raw('2027-01-14', 'gear.upgrade', { to: 2 }, 1)],
      },
    ]);
    expect(daily['2027-01-14']?.map((r) => r.metric)).toEqual(['dau']);
  });
});

describe('parseOpsQuery', () => {
  it('accepts a range and defaults to json', () => {
    expect(query('from=2027-01-01&to=2027-01-07')).toEqual({
      ok: true,
      from: '2027-01-01',
      to: '2027-01-07',
      format: 'json',
      compare: null,
      byGuild: false,
    });
    expect(query('from=2027-01-01&to=2027-01-01&format=md')).toMatchObject({
      ok: true,
      format: 'md',
    });
  });

  it('allows byGuild=1 only, and only once', () => {
    expect(query('from=2027-01-01&to=2027-01-07&byGuild=1')).toMatchObject({
      ok: true,
      byGuild: true,
    });
    for (const value of ['0', '', 'true', 'yes', '2', '01']) {
      expect(query(`from=2027-01-01&to=2027-01-07&byGuild=${value}`).ok, value).toBe(false);
    }
    expect(query('from=2027-01-01&to=2027-01-07&byGuild=1&byGuild=1').ok).toBe(false);
  });

  it('accepts short digit runs in labels', () => {
    // 14 digits is not a snowflake.
    expect(parseRow(raw('d', 'flow', { label: '12345678901234' }, 1))).not.toBeNull();
  });

  it('accepts exactly the longest range and refuses one day more', () => {
    // 2027-01-01 plus 91 days is the 92nd day.
    expect(query('from=2027-01-01&to=2027-04-02').ok).toBe(true);
    expect(MAX_REPORT_DAYS).toBe(92);
    expect(query('from=2027-01-01&to=2027-04-03').ok).toBe(false);
  });

  it('refuses bad parameters', () => {
    const bad = [
      '',
      'from=2027-01-01',
      'to=2027-01-01',
      'from=2027-1-1&to=2027-01-02',
      'from=2027-02-30&to=2027-03-01',
      'from=2027-13-01&to=2027-13-02',
      'from=2027-01-05&to=2027-01-04',
      'from=2027-01-01&to=2027-01-02&format=xml',
      'from=2027-01-01&to=2027-01-02&format=',
      'from=2027-01-01&to=2027-01-02&extra=1',
      'from=2027-01-01&from=2027-01-02&to=2027-01-03',
      'from=2027-01-01&to=2027-01-02&weekly=2',
      'from=2027-01-01&to=2027-01-02&weekly=true',
      'from=2027-01-01&to=2027-01-02&compareFrom=2026-12-01',
      'from=2027-01-01&to=2027-01-02&compareTo=2026-12-01',
      'from=2027-01-01&to=2027-01-02&weekly=1&compareFrom=2026-12-01&compareTo=2026-12-02',
      'from=2027-01-01&to=2027-01-02&compareFrom=2026-12-05&compareTo=2026-12-01',
      'from=2027-01-01&to=2027-01-02&compareFrom=2026-01-01&compareTo=2026-12-01',
      'from=%00&to=2027-01-02',
      "from=2027-01-01'--&to=2027-01-02",
    ];
    for (const qs of bad) expect(query(qs).ok, qs).toBe(false);
  });

  it('computes the previous period of the same length for weekly=1', () => {
    expect(query('from=2027-01-11&to=2027-01-17&weekly=1')).toMatchObject({
      ok: true,
      compare: { from: '2027-01-04', to: '2027-01-10' },
    });
    expect(query('from=2027-01-01&to=2027-01-01&weekly=1')).toMatchObject({
      compare: { from: '2026-12-31', to: '2026-12-31' },
    });
  });

  it('accepts an explicit comparison range', () => {
    expect(
      query('from=2027-01-11&to=2027-01-17&compareFrom=2026-12-01&compareTo=2026-12-31'),
    ).toMatchObject({ ok: true, compare: { from: '2026-12-01', to: '2026-12-31' } });
  });
});

describe('guildAliases', () => {
  const ids = Array.from({ length: 300 }, (_, i) => String(700000000000000000n + BigInt(i)));

  it('gives every guild a stable, unique g- alias that does not contain the id', async () => {
    const first = await guildAliases(env.DISCORD_CLIENT_SECRET, ids);
    const second = await guildAliases(env.DISCORD_CLIENT_SECRET, [...ids].reverse());
    expect(first.size).toBe(ids.length);
    expect(new Set(first.values()).size).toBe(ids.length);
    for (const id of ids) {
      const alias = first.get(id) ?? '';
      expect(alias).toMatch(/^g-[0-9a-f]{6,16}$/);
      expect(alias).not.toContain(id);
    }
    // Most are the short form: a longer prefix only appears on a collision (and may then differ
    // by which other guilds are listed, so only the short ones are required to be stable).
    const short = [...first.values()].filter((a) => a.length === 8).length;
    expect(short).toBeGreaterThan(ids.length - 5);
    for (const id of ids) {
      const alias = first.get(id) ?? '';
      if (alias.length === 8) expect(second.get(id)).toBe(alias);
    }
  });

  it('depends on the secret', async () => {
    const a = await guildAliases('secret-one', ids.slice(0, 5));
    const b = await guildAliases('secret-two', ids.slice(0, 5));
    expect([...a.values()]).not.toEqual([...b.values()]);
  });
});

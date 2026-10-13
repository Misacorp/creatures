/**
 * Renders a `LiveAnalysis` as the Markdown of `docs/balance/live-YYYY-MM-DD.md`. Plain English first,
 * tables after. A pure function: the same analysis always gives the same text. Every id is shown in a
 * code span (the report schema only lets `[a-z0-9_.:-]` through, so nothing can break out of it).
 */
import {
  EVERYBODY_SHARE,
  FINALE_BAND,
  MIN_N,
  MIN_PLAYER_DAYS,
  OPEN_GROUP_ROWS,
  PILE_RATIO,
  WALL_DROP_PTS,
  WATCH_FLOOR_N,
  WATERFALL_ROWS,
  fmt,
  pct,
  type Flag,
  type LabelAmount,
  type LiveAnalysis,
  type PickGroup,
  type ResourceFlow,
} from './live-analyze';

const one = (n: number): string => (Math.round(n * 10) / 10).toFixed(1);
const signed = (n: number): string => `${n >= 0 ? '+' : '-'}${fmt(Math.abs(n))}`;
const code = (value: string | number): string => `\`${String(value)}\``;
const pctOrNa = (value: number | null): string => (value === null ? 'n/a' : pct(value));
const perDay = (value: number | null): string =>
  value === null ? 'n/a' : `${value >= 0 ? '+' : '-'}${one(Math.abs(value))}`;

function change(value: number | null): string {
  if (value === null) return '';
  if (value === 0) return ' (no change)';
  return value > 0 ? ` (up ${String(value)}%)` : ` (down ${String(-value)}%)`;
}

/** True when a cell looks like a number (so its column is right-aligned). */
const NUMERIC_CELL = /^[-+=*]*[\d,.]+%?\**$/;

function table(header: readonly string[], body: readonly (readonly string[])[]): string[] {
  if (body.length === 0) return ['_No data._', ''];
  const right = header.map((_, i) => {
    const cells = body.map((row) => row[i] ?? '').filter((c) => c !== '');
    return cells.length > 0 && cells.every((c) => NUMERIC_CELL.test(c));
  });
  return [
    `| ${header.join(' | ')} |`,
    `| ${right.map((r) => (r ? '---:' : '---')).join(' | ')} |`,
    ...body.map((row) => `| ${row.join(' | ')} |`),
    '',
  ];
}

function fold(list: readonly LabelAmount[]): LabelAmount[] {
  if (list.length <= WATERFALL_ROWS) return [...list];
  const rest = list.slice(WATERFALL_ROWS);
  const amount = rest.reduce((s, l) => s + l.amount, 0);
  const share = rest.reduce((s, l) => s + l.share, 0);
  return [
    ...list.slice(0, WATERFALL_ROWS),
    { label: `other (${String(rest.length)})`, amount, share: Math.round(share * 10_000) / 10_000 },
  ];
}

function words(f: ResourceFlow): string {
  const top = (list: readonly LabelAmount[]): string =>
    list.length === 0
      ? 'nothing'
      : list
          .slice(0, 3)
          .map((l) => `${code(l.label)} ${String(Math.round(l.share * 100))}%`)
          .join(', ');
  return `${code(f.currency)}: ${fmt(f.sources)} came in (mostly ${top(f.sourceLabels)}) and ${fmt(f.sinks)} went out (mostly ${top(f.sinkLabels)}); net ${signed(f.net)}${
    f.netPerPlayerDay === null ? '' : `, ${perDay(f.netPerPlayerDay)} per active player per day`
  }.`;
}

function resourcesSection(a: LiveAnalysis): string[] {
  const out = ['## Resources', ''];
  if (a.resources.length === 0) {
    return [...out, '_No resource flow was recorded in this range._', ''];
  }
  out.push(
    `Where each currency comes from and where it goes. "Net per active player per day" divides the net by the daily active players added up over the range. A currency is flagged as piling up when at least ${String(PILE_RATIO)} times more comes in than goes out and the net per player per day is high; it is flagged as running dry when more goes out than comes in.`,
    '',
  );
  for (const f of a.resources) out.push(`- ${words(f)}`);
  out.push('');
  for (const f of a.resources) {
    out.push(
      `### ${code(f.currency)}`,
      '',
      `In ${fmt(f.sources)}${change(f.sourcesChangePct)}, out ${fmt(f.sinks)}${change(f.sinksChangePct)}, net ${signed(f.net)}. Changes compare the per-day amounts with the previous period${a.hasPrevious ? '' : ' (none in this report)'}.`,
      '',
    );
    const body: string[][] = [
      ...fold(f.sourceLabels).map((l) => ['+', code(l.label), fmt(l.amount), pct(l.share)]),
      ...fold(f.sinkLabels).map((l) => ['-', code(l.label), `-${fmt(l.amount)}`, pct(l.share)]),
      ['=', '**net**', `**${signed(f.net)}**`, ''],
    ];
    out.push(...table(['', 'Flow', 'Amount', 'Share of its side'], body));
  }
  return out;
}

function flagsSection(flags: readonly Flag[]): string[] {
  const out = [
    '## Anomaly flags',
    '',
    `A **flag** rests on at least ${String(MIN_N)} samples (${String(MIN_PLAYER_DAYS)} active player-days for resources). A **watch** has fewer, so treat it as a hint. Under ${String(WATCH_FLOOR_N)} samples nothing is raised. Thresholds are constants in \`packages/sim/src/live-analyze.ts\`.`,
    '',
  ];
  if (flags.length === 0) return [...out, 'None.', ''];
  out.push(
    ...table(
      ['Level', 'Area', 'What', 'n', 'Why'],
      flags.map((f) => [f.level, f.area, f.subject, String(f.n), f.message]),
    ),
  );
  return out;
}

function engagementSection(a: LiveAnalysis): string[] {
  const e = a.engagement;
  const out = [
    '## Engagement',
    '',
    `- Daily active players: **${one(e.dauPerDay)}** per day, summed over servers${change(e.dauChangePct)} (n=${fmt(e.playerDays)} player-days).`,
    `- Sessions: **${fmt(e.sessions)}**, ${e.sessionsPerDau === null ? 'n/a' : one(e.sessionsPerDau)} per active player-day.`,
    `- New players: **${fmt(e.newPlayers)}**.`,
    '',
    'Share of active player-days that used each feature:',
    '',
    ...table(
      ['Feature', 'Share of player-days'],
      e.featureUserShare.map((f) => [code(f.feature), pct(f.share)]),
    ),
  ];
  return out;
}

function pickTable(g: PickGroup): string[] {
  const shown = g.curated ? g.rows : g.rows.slice(0, OPEN_GROUP_ROWS);
  const hasOffered = shown.some((r) => r.offered !== undefined);
  const out = [
    `### ${g.title}`,
    '',
    g.total === 0
      ? `No ${g.unit} in this range.`
      : `${fmt(g.total)} ${g.unit} (n=${fmt(g.total)}), ${String(g.rows.length)} options seen or known${
          g.curated
            ? ''
            : `; the ${String(Math.min(OPEN_GROUP_ROWS, g.rows.length))} most used are shown`
        }.`,
    '',
  ];
  if (g.total === 0) return out;
  out.push(
    ...table(
      hasOffered ? ['Option', 'Picks', 'Share', 'Offered'] : ['Option', 'Picks', 'Share'],
      shown.map((r) => [
        code(r.option),
        fmt(r.picks),
        pct(r.share),
        ...(hasOffered ? [r.offered === undefined ? '' : fmt(r.offered)] : []),
      ]),
    ),
  );
  return out;
}

function picksSection(a: LiveAnalysis): string[] {
  return [
    '## Pick rates',
    '',
    `"Nobody picks" means a known option with no picks in a group with plenty of picks; "everybody picks" means one option above ${String(Math.round(EVERYBODY_SHARE * 100))}% in a group of 4 or more options. Locked options (for example a trip length that needs a rank) can look like "nobody" early on.`,
    '',
    ...a.picks.flatMap(pickTable),
  ];
}

function dungeonSection(a: LiveAnalysis): string[] {
  const d = a.dungeon;
  return [
    '## Dungeon',
    '',
    `Runs: ${fmt(d.runs)} (n), cleared ${fmt(d.clears)} (${pctOrNa(d.clearRate)}), retries ${pctOrNa(d.retryShare)} of runs. A depth wall is a drop of more than ${String(WALL_DROP_PTS)} points in the clear rate between two depths.`,
    '',
    ...table(
      ['Depth', 'Runs (n)', 'Share of runs', 'Cleared', 'Clear rate'],
      d.depths.map((r) => [
        String(r.depth),
        fmt(r.runs),
        pct(r.share),
        fmt(r.cleared),
        pctOrNa(r.clearRate),
      ]),
    ),
  ];
}

function raidSection(a: LiveAnalysis): string[] {
  const r = a.raid;
  const out = ['## Raid', ''];
  out.push(
    `Clear rate by phase and Boss Rank. The finale should win ${String(FINALE_BAND.min)}-${String(FINALE_BAND.max)}% of the time at each rank (Festival weeks are eased and are not checked against this).`,
    '',
  );
  for (const p of r.phases) {
    out.push(`### ${code(p.phase)}`, '');
    out.push(
      ...table(
        ['Rank', 'Fights (n)', 'Won', 'Win rate'],
        [...p.rows, p.overall].map((x) => [x.label, fmt(x.total), fmt(x.wins), pctOrNa(x.rate)]),
      ),
    );
  }
  out.push(
    `Finale abilities, by hand against Auto (n=${fmt(r.abilityModes.reduce((s, m) => s + m.count, 0))} abilities): hand-fired ${pctOrNa(r.handFiredShare)}.`,
    '',
    ...table(
      ['How it fired', 'Abilities', 'Share'],
      r.abilityModes.map((m) => [
        m.mode === 'fired'
          ? 'by hand (`fired`)'
          : m.mode === 'held'
            ? 'held (`held`)'
            : 'Auto (`default`)',
        fmt(m.count),
        pct(m.share),
      ]),
    ),
    `Finale roster places: ${fmt(r.rosterPlaces)}; players who joined the live finale: ${fmt(r.liveWatchers)}.`,
    '',
  );
  return out;
}

function targetsSection(a: LiveAnalysis): string[] {
  const label: Record<string, string> = {
    in_band: 'in band',
    outside: '**outside**',
    not_comparable: 'not comparable',
    no_data: 'no data',
  };
  return [
    '## Live against the sim targets',
    '',
    'Only targets with a clean live equivalent are mapped (the map is `LIVE_TARGETS` in `packages/sim/src/live-analyze.ts`). The others need data the rollups do not carry.',
    '',
    ...table(
      ['Target', 'Live value', 'Band', 'n', 'Status'],
      a.targets.map((t) => [
        `${code(t.targetId)} ${t.live}`,
        t.display,
        t.band,
        fmt(t.n),
        `${label[t.status] ?? t.status}${t.note === '' ? '' : ` (${t.note})`}`,
      ]),
    ),
  ];
}

function logSection(a: LiveAnalysis): string[] {
  return [
    '## Open balance log entries',
    '',
    ...(a.openLogEntries.length === 0
      ? ['None, or the log was not available.', '']
      : [
          'Entries in `docs/balance/log.md` with no Outcome yet. Check this report for their measured effect.',
          '',
          ...a.openLogEntries.map(
            (e) => `- ${code(e.id)} ${e.title.replace(/[`\r\n]/g, ' ')} (opened ${e.opened})`,
          ),
          '',
        ]),
  ];
}

/** The whole live report as Markdown. */
export function renderLive(a: LiveAnalysis): string {
  const flagCount = a.flags.filter((f) => f.level === 'flag').length;
  const watchCount = a.flags.length - flagCount;
  return [
    `# Live balance report: ${a.to}`,
    '',
    `Range ${a.from} to ${a.to} (${String(a.days)} days). Servers answering: ${String(a.servers.reporting)} of ${String(a.servers.known)}. Rolled-up server days: ${fmt(a.rolledDays)}. ${
      a.hasPrevious
        ? 'Compared with the previous period in the report.'
        : 'No previous period in the report, so no changes are shown.'
    }`,
    '',
    `**${String(flagCount)} flags and ${String(watchCount)} watches** (see Anomaly flags). Every rate shows its sample size n. This is generated from counts only; read it as hints about where to look, not as proof.`,
    '',
    ...resourcesSection(a),
    ...flagsSection(a.flags),
    ...engagementSection(a),
    ...picksSection(a),
    ...dungeonSection(a),
    ...raidSection(a),
    ...targetsSection(a),
    ...logSection(a),
    '## Not available yet',
    '',
    'Gini, median and p90 holdings are not available from rollups yet (they need per-player balances, which reports never carry).',
    '',
  ].join('\n');
}

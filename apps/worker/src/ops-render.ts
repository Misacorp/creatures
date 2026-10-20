/**
 * Renders the ops report (`Report`, see `ops-aggregate.ts`) as Markdown. A pure function of the
 * report: no I/O, no clock. The report holds counts and content ids only, and every id is shown in
 * a code span, so nothing here can carry a name, an id of a player or free text.
 *
 * Order: Resources first (where players spend and earn), then a one-screen summary, then one section
 * per feature, then alerts. With a `previous` period every figure that has one also shows its change.
 */
import { expeditionContent } from '@creatures/game';
import type { DimValue, Period, Report, Row } from './ops-aggregate';

/** The finale win rate band the balance targets aim for, in percent. */
export const FINALE_BAND = { min: 40, max: 60 } as const;
/** Samples needed before a rate can raise an alert. */
const MIN_SAMPLE = 5;
/** Resources shown in this order; others that appear follow alphabetically. */
const RESOURCE_ORDER = [
  'bait',
  'essence',
  'scrap',
  'tide-shard',
  'ember-shard',
  'grove-shard',
  'spark-shard',
  'mire-shard',
  'shard-any',
  'glimmer',
  'supplies',
] as const;
const TOP_LABELS = 3;
/** A currency is "piling up" when sources are at least this many times the sinks (and big enough). */
const PILE_RATIO = 3;
const PILE_MIN = 50;

// --- Number formatting ---

const fmt = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const one = (n: number): string => (Math.round(n * 10) / 10).toFixed(1);
const rate = (a: number, b: number): number | null => (b === 0 ? null : (a * 100) / b);
const pctText = (value: number | null): string => (value === null ? 'n/a' : `${one(value)}%`);
const code = (value: DimValue): string => `\`${String(value)}\``;

/** " (up 12%)" for a count against the previous period, or "" when there is nothing to compare. */
function change(current: number, previous: number | null): string {
  if (previous === null) return '';
  if (previous === 0) return current === 0 ? ' (no change)' : ' (↑ new)';
  const delta = Math.round(((current - previous) * 100) / previous);
  if (delta === 0) return ' (→ 0%)';
  return delta > 0 ? ` (↑ +${String(delta)}%)` : ` (↓ ${String(delta)}%)`;
}

/** " (up 3.0 pts)" for a rate against the previous period's rate. */
function changePts(current: number | null, previous: number | null | undefined): string {
  if (current === null || previous === undefined || previous === null) return '';
  const delta = Math.round((current - previous) * 10) / 10;
  if (delta === 0) return ' (→ 0 pts)';
  return delta > 0 ? ` (↑ +${one(delta)} pts)` : ` (↓ ${one(delta)} pts)`;
}

// --- Querying rows ---

type Where = Readonly<Record<string, DimValue>>;

class Rows {
  constructor(private readonly rows: readonly Row[]) {}

  private matching(metric: string, where: Where): Row[] {
    return this.rows.filter(
      (r) => r.metric === metric && Object.entries(where).every(([k, v]) => r.dims[k] === v),
    );
  }

  /** The sum of a metric over the rows that match `where`. */
  total(metric: string, where: Where = {}): number {
    return this.matching(metric, where).reduce((sum, r) => sum + r.value, 0);
  }

  /** The sum per value of one dim, biggest first (ties by name). */
  by(metric: string, key: string, where: Where = {}): [string, number][] {
    const sums = new Map<string, number>();
    for (const r of this.matching(metric, where)) {
      const label = String(r.dims[key] ?? 'unknown');
      sums.set(label, (sums.get(label) ?? 0) + r.value);
    }
    return [...sums].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }

  /** The sum per combination of dims, in the order of the first dim's values. */
  byKeys(metric: string, keys: readonly string[], where: Where = {}): Map<string, number> {
    const sums = new Map<string, number>();
    for (const r of this.matching(metric, where)) {
      const label = keys.map((k) => String(r.dims[k] ?? 'unknown')).join('\u0000');
      sums.set(label, (sums.get(label) ?? 0) + r.value);
    }
    return sums;
  }
}

/** A Markdown table. Cells are plain text built by this module (ids are already in code spans). */
function table(header: readonly string[], body: readonly (readonly string[])[]): string[] {
  if (body.length === 0) return ['_No data._', ''];
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map((_, i) => (i === 0 ? '---' : '---:')).join(' | ')} |`,
    ...body.map((row) => `| ${row.join(' | ')} |`),
    '',
  ];
}

const numeric = (a: string, b: string): number => Number(a) - Number(b);

// --- Sections ---

interface Flow {
  currency: string;
  sources: number;
  sinks: number;
  topSources: [string, number][];
  topSinks: [string, number][];
}

function flows(rows: Rows): Flow[] {
  const currencies = new Set(rows.by('flow', 'currency').map(([c]) => c));
  const ordered = [
    ...RESOURCE_ORDER.filter((c) => currencies.has(c)),
    ...[...currencies]
      .filter((c) => !(RESOURCE_ORDER as readonly string[]).includes(c))
      .sort((a, b) => a.localeCompare(b)),
  ];
  return ordered.map((currency) => ({
    currency,
    sources: rows.total('flow', { currency, dir: 'source' }),
    sinks: rows.total('flow', { currency, dir: 'sink' }),
    topSources: rows.by('flow', 'label', { currency, dir: 'source' }),
    topSinks: rows.by('flow', 'label', { currency, dir: 'sink' }),
  }));
}

function shares(list: readonly [string, number][], total: number): string {
  if (list.length === 0 || total === 0) return 'nothing';
  return list
    .slice(0, TOP_LABELS)
    .map(([label, n]) => `${code(label)} ${String(Math.round((n * 100) / total))}%`)
    .join(', ');
}

function resourcesSection(rows: Rows, prior: Rows | null): string[] {
  const out = ['## Resources', ''];
  const list = flows(rows);
  if (list.length === 0) return [...out, '_No resource flow recorded in this range._', ''];
  const before = prior === null ? null : flows(prior);
  out.push(
    ...table(
      ['Resource', 'In', 'Out', 'Net'],
      list.map((f) => {
        const old = before?.find((b) => b.currency === f.currency);
        const prevIn = prior === null ? null : (old?.sources ?? 0);
        const prevOut = prior === null ? null : (old?.sinks ?? 0);
        return [
          code(f.currency),
          `${fmt(f.sources)}${change(f.sources, prevIn)}`,
          `${fmt(f.sinks)}${change(f.sinks, prevOut)}`,
          `${f.sources - f.sinks >= 0 ? '+' : '-'}${fmt(Math.abs(f.sources - f.sinks))}`,
        ];
      }),
    ),
  );
  for (const f of list) {
    out.push(
      `- ${code(f.currency)}: comes from ${shares(f.topSources, f.sources)}; goes to ${shares(f.topSinks, f.sinks)}.`,
    );
  }
  out.push('');
  return out;
}

interface Totals {
  days: number;
  dau: number;
  sessions: number;
  newPlayers: number;
  phaseWins: number;
  phases: number;
  finaleWins: number;
  finales: number;
  dungeonRuns: number;
}

function totalsOf(period: Period, rows: Rows): Totals {
  return {
    days: Math.max(1, period.days),
    dau: rows.total('dau'),
    sessions: rows.total('sessions'),
    newPlayers: rows.total('new_players'),
    phaseWins: rows.total('raid.phase', { win: 1 }),
    phases: rows.total('raid.phase'),
    finaleWins: rows.total('raid.phase', { phase: 'finale', win: 1 }),
    finales: rows.total('raid.phase', { phase: 'finale' }),
    dungeonRuns: rows.total('dungeon.run'),
  };
}

function summarySection(report: Report, rows: Rows, prior: Rows | null): string[] {
  const t = totalsOf(report, rows);
  const p =
    report.previous === undefined || prior === null ? null : totalsOf(report.previous, prior);
  const avg = (n: number, days: number): number => n / days;
  const prevAvgDau = p === null ? null : avg(p.dau, p.days);
  const clear = rate(t.phaseWins, t.phases);
  const finale = rate(t.finaleWins, t.finales);
  return [
    '## Summary',
    '',
    `- Daily active players (average per day, summed over servers): **${one(avg(t.dau, t.days))}**${
      prevAvgDau === null ? '' : change(avg(t.dau, t.days), prevAvgDau)
    }`,
    `- Sessions: **${fmt(t.sessions)}**${change(t.sessions, p?.sessions ?? null)}`,
    `- New players: **${fmt(t.newPlayers)}**${change(t.newPlayers, p?.newPlayers ?? null)}`,
    `- Raid clear rate (all stages): **${pctText(clear)}** of ${fmt(t.phases)}${changePts(
      clear,
      p === null ? undefined : rate(p.phaseWins, p.phases),
    )}`,
    `- Finale win rate: **${pctText(finale)}** of ${fmt(t.finales)}${changePts(
      finale,
      p === null ? undefined : rate(p.finaleWins, p.finales),
    )}`,
    `- Dungeon runs: **${fmt(t.dungeonRuns)}**${change(t.dungeonRuns, p?.dungeonRuns ?? null)}`,
    '',
  ];
}

function workshopSection(rows: Rows): string[] {
  const kinds = new Set([
    ...rows.by('workshop.job_start', 'job').map(([k]) => k),
    ...rows.by('workshop.job_claim', 'job').map(([k]) => k),
  ]);
  const out = ['## Workshop', ''];
  out.push(
    ...table(
      ['Job', 'Started', 'Claimed'],
      [...kinds]
        .sort()
        .map((job) => [
          code(job),
          fmt(rows.total('workshop.job_start', { job })),
          fmt(rows.total('workshop.job_claim', { job })),
        ]),
    ),
  );
  const levels = rows.by('workshop.skill_level', 'level').sort((a, b) => numeric(a[0], b[0]));
  if (levels.length > 0) {
    out.push('Crafting level at claim:', '');
    out.push(
      ...table(
        ['Level', 'Claims'],
        levels.map(([l, n]) => [l, fmt(n)]),
      ),
    );
    out.push(
      `Level-ups: ${fmt(rows.total('workshop.level_up'))}. Crafts that came out a rarity higher: ${fmt(
        rows.total('workshop.craft_upgraded'),
      )}.`,
      '',
    );
  }
  return out;
}

function expeditionsSection(rows: Rows): string[] {
  const out = ['## Expeditions', ''];
  const sends = rows.byKeys('expedition.send', ['destination', 'length']);
  const destinations = rows.by('expedition.send', 'destination');
  out.push(
    ...table(
      ['Destination', 'Sent', 'Claimed', 'Recalled', 'Short / Medium / Long'],
      destinations.map(([destination, n]) => [
        code(destination),
        fmt(n),
        fmt(rows.total('expedition.claim', { destination })),
        fmt(rows.total('expedition.recall', { destination })),
        ['short', 'medium', 'long']
          .map((length) => fmt(sends.get(`${destination}\u0000${length}`) ?? 0))
          .join(' / '),
      ]),
    ),
  );
  const supplies = rows.by('expedition.supply_used', 'supply');
  const suppliesTotal = supplies.reduce((sum, [, n]) => sum + n, 0);
  out.push('Supplies carried:', '');
  out.push(
    ...table(
      ['Supply', 'Used', 'Share'],
      supplies.map(([id, n]) => [code(id), fmt(n), pctText(rate(n, suppliesTotal))]),
    ),
  );
  const offered = rows.total('pushon.offered');
  const chosen = rows.total('pushon.chosen');
  out.push(
    `Push-on: offered ${fmt(offered)} times (${fmt(rows.total('pushon.offer_empty'))} rolled empty), chosen ${fmt(chosen)} times (${pctText(rate(chosen, offered))}).`,
    '',
  );
  const results = rows.byKeys('pushon.result', ['risk', 'outcome']);
  const risks = [...new Set(rows.by('pushon.result', 'risk').map(([r]) => r))].sort();
  out.push(
    ...table(
      ['Risk', 'Worked', 'Failed', 'Declined'],
      risks.map((risk) => [
        code(risk),
        ...['worked', 'failed', 'declined'].map((o) => fmt(results.get(`${risk}\u0000${o}`) ?? 0)),
      ]),
    ),
  );
  out.push(
    `Journal finds: ${fmt(rows.total('journal.find'))}, sets completed: ${fmt(rows.total('journal.set_complete'))}. Familiarity stars earned: ${fmt(rows.total('expedition.stars'))}. Slot unlocks: ${fmt(rows.total('expedition.slots'))}.`,
    '',
  );
  const ranks = rows.by('explorer.send_rank', 'rank').sort((a, b) => numeric(a[0], b[0]));
  out.push('Explorer rank when sent:', '');
  out.push(
    ...table(
      ['Rank', 'Trips', 'Rank-ups reached'],
      ranks.map(([rank, n]) => [
        rank,
        fmt(n),
        fmt(rows.total('explorer.rank_up', { rank: Number(rank) })),
      ]),
    ),
  );
  const catches = rows.byKeys('expedition.catch', ['rarity', 'result']);
  const rarities = [...new Set(rows.by('expedition.catch', 'rarity').map(([r]) => r))].sort();
  out.push('Catches:', '');
  out.push(
    ...table(
      ['Rarity', 'New', 'Duplicate', 'Fused', 'Converted'],
      rarities.map((rarity) => [
        code(rarity),
        ...['new', 'duplicate', 'fused', 'converted'].map((r) =>
          fmt(catches.get(`${rarity}\u0000${r}`) ?? 0),
        ),
      ]),
    ),
  );
  return out;
}

function dungeonSection(rows: Rows): string[] {
  const out = ['## Dungeon', ''];
  const runs = rows.total('dungeon.run');
  const clears = rows.total('dungeon.run', { cleared: 1 });
  const retries = rows.total('dungeon.run', { attempt: 2 });
  out.push(
    `Runs: ${fmt(runs)}, cleared: ${fmt(clears)} (${pctText(rate(clears, runs))}), retries: ${fmt(retries)}, streak bonuses paid: ${fmt(rows.total('dungeon.streak_bonus'))}.`,
    '',
  );
  const depths = rows.by('dungeon.depth', 'depth').sort((a, b) => numeric(a[0], b[0]));
  out.push(
    ...table(
      ['Depth', 'Runs', 'Cleared', 'Clear rate'],
      depths.map(([depth, n]) => {
        const cleared = rows.total('dungeon.clear_depth', { depth: Number(depth) });
        return [depth, fmt(n), fmt(cleared), pctText(rate(cleared, n))];
      }),
    ),
  );
  const modifiers = rows.by('dungeon.modifier', 'modifier').slice(0, 5);
  if (modifiers.length > 0) {
    out.push(
      `Most common room modifiers: ${modifiers.map(([m, n]) => `${code(m)} ${fmt(n)}`).join(', ')}.`,
      '',
    );
  }
  const roles = rows.by('dungeon.team_role', 'role');
  if (roles.length > 0) {
    out.push(`Team roles: ${roles.map(([r, n]) => `${code(r)} ${fmt(n)}`).join(', ')}.`, '');
  }
  return out;
}

function gearSection(rows: Rows): string[] {
  const out = ['## Gear', ''];
  const drops = rows.byKeys('gear.drop', ['source', 'rarity']);
  const sources = rows.by('gear.drop', 'source');
  const rarities = [...new Set(rows.by('gear.drop', 'rarity').map(([r]) => r))].sort();
  out.push(
    ...table(
      ['Source', ...rarities.map(code), 'Total'],
      sources.map(([source, n]) => [
        code(source),
        ...rarities.map((r) => fmt(drops.get(`${source}\u0000${r}`) ?? 0)),
        fmt(n),
      ]),
    ),
  );
  out.push(
    `Equipped: ${fmt(rows.total('gear.equip', { action: 'equip' }))}, taken off: ${fmt(rows.total('gear.equip', { action: 'unequip' }))}, upgrades: ${fmt(rows.total('gear.upgrade'))}, dismantled: ${fmt(rows.total('gear.dismantle'))}, blueprints learned: ${fmt(rows.total('gear.blueprint', { duplicate: 0 }))} (${fmt(rows.total('gear.blueprint', { duplicate: 1 }))} duplicates).`,
    '',
  );
  return out;
}

interface StageRate {
  label: string;
  wins: number;
  total: number;
}

/** Win rates of a phase by Boss Rank (and Festival weeks apart). */
function stageRates(rows: Rows, phase: string): StageRate[] {
  const all = rows.byKeys('raid.phase', ['rank', 'festival'], { phase });
  const wins = rows.byKeys('raid.phase', ['rank', 'festival'], { phase, win: 1 });
  return [...all]
    .map(([key, total]) => {
      const [rank = '0', festival = '0'] = key.split('\u0000');
      return {
        rank: Number(rank),
        festival: festival === '1',
        total,
        wins: wins.get(key) ?? 0,
      };
    })
    .sort((a, b) => a.rank - b.rank || Number(a.festival) - Number(b.festival))
    .map((r) => ({
      label: `rank ${String(r.rank)}${r.festival ? ' (Festival)' : ''}`,
      wins: r.wins,
      total: r.total,
    }));
}

function raidSection(rows: Rows): string[] {
  const out = ['## Raid', ''];
  for (const phase of ['phase1', 'phase2', 'finale']) {
    const list = stageRates(rows, phase);
    if (list.length === 0) continue;
    out.push(`${code(phase)} clear rate by Boss Rank:`, '');
    out.push(
      ...table(
        ['Rank', 'Fights', 'Won', 'Win rate'],
        list.map((r) => [r.label, fmt(r.total), fmt(r.wins), pctText(rate(r.wins, r.total))]),
      ),
    );
  }
  const members = rows.total('raid.finale_members', { practice: 0 });
  const watchers = rows.total('raid.live_watchers');
  const abilities = rows.by('raid.finale_ability', 'mode', { practice: 0 });
  const abilityTotal = abilities.reduce((sum, [, n]) => sum + n, 0);
  out.push(
    `Finale attendance: ${fmt(rows.total('raid.finale_fights', { practice: 0 }))} fights, ${fmt(members)} roster places, ${fmt(watchers)} players joined live (${pctText(rate(watchers, members))} of the roster).`,
    '',
  );
  out.push('Finale abilities, hand-fired against Auto:', '');
  out.push(
    ...table(
      ['How it fired', 'Abilities', 'Share'],
      abilities.map(([mode, n]) => [
        mode === 'fired'
          ? 'by hand (`fired`)'
          : mode === 'held'
            ? 'held (`held`)'
            : 'Auto (`default`)',
        fmt(n),
        pctText(rate(n, abilityTotal)),
      ]),
    ),
  );
  const timing = rows.by('raid.hand_fire', 'timing', { practice: 0 });
  if (timing.length > 0) {
    out.push(`Hand-fire timing: ${timing.map(([t, n]) => `${code(t)} ${fmt(n)}`).join(', ')}.`, '');
  }
  const off = rows.total('raid.autofire_toggle', { on: 0 });
  out.push(
    `Auto fire switched off ${fmt(off)} times, on again ${fmt(rows.total('raid.autofire_toggle', { on: 1 }))} times.`,
    '',
  );
  const moves = rows.by('raid.rank_change', 'direction');
  if (moves.length > 0) {
    out.push(`Boss Rank moves: ${moves.map(([d, n]) => `${code(d)} ${fmt(n)}`).join(', ')}.`, '');
  }
  return out;
}

function alertsSection(report: Report, rows: Rows, prior: Rows | null): string[] {
  const alerts: string[] = [];
  if (report.rolledDays === 0) {
    alerts.push('No rolled-up days in this range yet: there is nothing to report.');
  }
  if (report.guilds.reporting < report.guilds.known) {
    alerts.push(
      `${String(report.guilds.known - report.guilds.reporting)} of ${String(report.guilds.known)} servers did not answer, so the numbers are partial.`,
    );
  }
  for (const f of flows(rows)) {
    if (f.sources > 0 && f.sinks === 0) {
      alerts.push(
        `${code(f.currency)}: ${fmt(f.sources)} came in and nothing was spent, so it only piles up.`,
      );
    } else if (f.sinks > 0 && f.sources === 0) {
      alerts.push(`${code(f.currency)}: ${fmt(f.sinks)} was spent but nothing came in.`);
    } else if (f.sources >= PILE_MIN && f.sources >= PILE_RATIO * f.sinks) {
      alerts.push(
        `${code(f.currency)}: in ${fmt(f.sources)}, out ${fmt(f.sinks)}: it is piling up (sinks are under a third of sources).`,
      );
    }
  }
  for (const r of stageRates(rows, 'finale')) {
    const value = rate(r.wins, r.total);
    if (
      r.total >= MIN_SAMPLE &&
      value !== null &&
      (value < FINALE_BAND.min || value > FINALE_BAND.max)
    ) {
      alerts.push(
        `Finale win rate at ${r.label} is ${pctText(value)} over ${fmt(r.total)} fights, outside ${String(FINALE_BAND.min)}-${String(FINALE_BAND.max)}%.`,
      );
    }
  }
  for (const [depth, runs] of rows.by('dungeon.depth', 'depth')) {
    if (runs >= MIN_SAMPLE && rows.total('dungeon.clear_depth', { depth: Number(depth) }) === 0) {
      alerts.push(`Dungeon depth ${depth}: ${fmt(runs)} runs and none cleared (a wall).`);
    }
  }
  const sends = rows.total('expedition.send');
  if (sends >= 2 * MIN_SAMPLE) {
    for (const d of expeditionContent.destinations) {
      if (rows.total('expedition.send', { destination: d.id }) === 0) {
        alerts.push(`Nobody sent an expedition to ${code(d.id)} (${fmt(sends)} trips in total).`);
      }
    }
  }
  const used = rows.total('expedition.supply_used');
  if (used >= 2 * MIN_SAMPLE) {
    for (const s of expeditionContent.supplies) {
      if (rows.total('expedition.supply_used', { supply: s.id }) === 0) {
        alerts.push(`Nobody carried ${code(s.id)} (${fmt(used)} supplies carried in total).`);
      }
    }
  }
  const failedPosts = rows.total('post.result', { result: 'failed' });
  if (failedPosts > 0) alerts.push(`${fmt(failedPosts)} Discord posts failed for good.`);
  if (report.previous !== undefined && prior !== null) {
    const now = rows.total('dau') / Math.max(1, report.days);
    const then = prior.total('dau') / Math.max(1, report.previous.days);
    if (then >= 1 && now < then * 0.7) {
      alerts.push(
        `Daily active players fell from ${one(then)} to ${one(now)} (more than 30% down).`,
      );
    }
  }
  return ['## Alerts', '', ...(alerts.length === 0 ? ['None.'] : alerts.map((a) => `- ${a}`)), ''];
}

/** The whole report as Markdown. */
export function renderMarkdown(report: Report): string {
  const rows = new Rows(report.totals);
  const prior = report.previous === undefined ? null : new Rows(report.previous.totals);
  const lines = [
    '# Leet Creatures report',
    '',
    `Range: ${report.from} to ${report.to} (${String(report.days)} days). Servers answering: ${String(report.guilds.reporting)} of ${String(report.guilds.known)}. Rolled-up server days: ${fmt(report.rolledDays)}.`,
  ];
  if (report.previous !== undefined) {
    lines.push(
      `Compared with ${report.previous.from} to ${report.previous.to} (${String(report.previous.days)} days, ${fmt(report.previous.rolledDays)} rolled-up server days). Counts are shown with the change against that period.`,
    );
  }
  lines.push('');
  return [
    ...lines,
    ...resourcesSection(rows, prior),
    ...summarySection(report, rows, prior),
    ...workshopSection(rows),
    ...expeditionsSection(rows),
    ...dungeonSection(rows),
    ...gearSection(rows),
    ...raidSection(rows),
    ...alertsSection(report, rows, prior),
  ].join('\n');
}

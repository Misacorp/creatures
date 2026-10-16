import type { JourneyReport, PresetSummary, Spread } from './journey-report';

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const line = (cells: readonly string[]): string => `| ${cells.join(' | ')} |`;
  return [line(header), line(header.map(() => '---')), ...rows.map(line)].join('\n');
}

const num = (x: number | null | undefined, digits = 0): string =>
  x === null || x === undefined ? '-' : x.toFixed(digits);
const pct = (x: number | null | undefined): string =>
  x === null || x === undefined ? '-' : `${String(Math.round(x * 100))}%`;
const spread = (s: Spread | null | undefined, digits = 0): string =>
  s === null || s === undefined
    ? '-'
    : `${num(s.median, digits)} (${num(s.p25, digits)}-${num(s.p75, digits)})`;

/** Weeks of a run shown in the week tables: 1, 2, 4, 6, 8, 10, 12 and the last. */
function shownWeeks(weeks: number): number[] {
  return [...new Set([1, 2, 3, 4, 6, 8, 10, 12, weeks].filter((w) => w >= 1 && w <= weeks))].sort(
    (a, b) => a - b,
  );
}

const MILESTONES_SHOWN = [
  'catch_rare',
  'catch_epic',
  'first_evolution',
  'level_10',
  'level_15',
  'level_20',
  'level_25',
  'level_30',
  'fusion_1',
  'fusion_3',
  'fusion_5',
  'gear_rare',
  'gear_epic',
  'gear_ilvl10',
  'dungeon_depth_10',
  'dungeon_landmark_14',
  'expedition_slot_3',
  'expedition_slot_5',
  'raid_stage_cleared',
  'raid_finale_won',
  'first_jackpot',
];

/** A short Markdown summary of a journey report, for reading in the morning. */
export function journeyMarkdown(report: JourneyReport): string {
  const s = report.settings;
  const presets: PresetSummary[] = Object.values(report.presets);
  const out: string[] = [];
  out.push(`# Player journey simulation`);
  out.push(
    `Income model **${s.income}**, server mix **${s.mix}** (${Object.entries(s.mixCounts)
      .map(([k, v]) => `${String(v)} ${k}`)
      .join(
        ', ',
      )}), ${String(s.weeks)} weeks, ${String(s.servers)} servers, seed "${s.seed}"${s.noise ? ', noisy dials' : ''}. Medians, with the first and third quartile in brackets. The raid is the current shipped boss rules.`,
  );

  out.push(`## Raid team power by week`);
  out.push(
    table(
      ['Week', ...presets.map((p) => p.label)],
      shownWeeks(s.weeks).map((w) => [
        String(w),
        ...presets.map((p) => spread(p.weeks[w - 1]?.power)),
      ]),
    ),
  );

  out.push(`## Raid team fight-scored power by week`);
  out.push(
    `Damage per finale round the three strongest creatures deal against the four bosses at the server's rank, before they fall (\`fightPower\`). It sees crits, reactions and modifiers; the table above is the older Attack + HP score.`,
  );
  out.push(
    table(
      ['Week', ...presets.map((p) => p.label)],
      shownWeeks(s.weeks).map((w) => [
        String(w),
        ...presets.map((p) => spread(p.weeks[w - 1]?.fightPower)),
      ]),
    ),
  );

  out.push(`## Gear's share of the fight-scored power by week`);
  out.push(
    `The share of the damage the team deals that its worn gear gives: the team's fight-scored power with its gear, against the same team without it (percent). The design targets are in \`docs/design/gear-and-creatures-v2.md\` section 4.`,
  );
  out.push(
    table(
      ['Week', ...presets.map((p) => p.label)],
      shownWeeks(s.weeks).map((w) => [
        String(w),
        ...presets.map((p) => spread(p.weeks[w - 1]?.fightGearShare, 1)),
      ]),
    ),
  );

  const last = s.weeks;
  out.push(`## What the power is made of at week ${String(last)} (median of each part)`);
  out.push(
    table(
      ['Profile', 'Total', 'First stage, level 1', 'Levels', 'Evolution', 'Fusion', 'Gear'],
      presets.map((p) => {
        const w = p.weeks[last - 1];
        return [
          p.label,
          num(w?.power?.median),
          num(w?.split.base),
          num(w?.split.levels),
          num(w?.split.evolution),
          num(w?.split.fusion),
          num(w?.split.gear),
        ];
      }),
    ),
  );

  out.push(`## When the milestones land (median day since joining; share who reach it)`);
  out.push(
    table(
      ['Milestone', ...presets.map((p) => p.label)],
      MILESTONES_SHOWN.map((id) => [
        id,
        ...presets.map((p) => {
          const m = p.milestones[id];
          if (m === undefined || m.days === null) return `never (${pct(m?.reached)})`;
          return `${num(m.days.median)}${m.reached < 0.995 ? ` (${pct(m.reached)})` : ''}`;
        }),
      ]),
    ),
  );

  out.push(`## What holds players back`);
  out.push(
    `A wait is a run of days with the same binding limit; for Bait it is the stretch between two trainings. Days per player over the whole run, and the longest single wait.`,
  );
  for (const p of presets) {
    const rows = Object.entries(p.waits)
      .sort((a, b) => b[1].totalDaysMean - a[1].totalDaysMean)
      .map(([cause, w]) => [
        cause,
        w.track,
        pct(w.playersWaiting),
        num(w.totalDaysMean, 1),
        num(w.longestMedian, 0),
        num(w.longestMax, 0),
      ]);
    out.push(`### ${p.label}`);
    out.push(
      table(
        ['Limit', 'Path', 'Players', 'Days a player', 'Longest (median)', 'Longest (max)'],
        rows,
      ),
    );
    const binding = Object.entries(p.bindingShare)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k, v]) => `${k} ${pct(v)}`)
      .join(', ');
    out.push(`Binding limit, share of days: ${binding}.`);
  }

  out.push(`## Currencies held (median)`);
  const currencyWeeks = shownWeeks(s.weeks).filter((w) => [2, 4, 8, 12, last].includes(w));
  out.push(
    table(
      ['Profile', 'Week', 'Bait', 'Essence', 'Scrap', 'Glimmer', 'Shards', 'Supplies in stock'],
      presets.flatMap((p) =>
        currencyWeeks.map((w) => {
          const x = p.weeks[w - 1];
          return [
            p.label,
            String(w),
            num(x?.bait?.median),
            num(x?.essence?.median),
            num(x?.scrap?.median),
            num(x?.glimmer?.median, 1),
            num(x?.shards?.median),
            num(x?.suppliesOwned?.median, 1),
          ];
        }),
      ),
    ),
  );

  out.push(`## The raid`);
  out.push(
    table(
      [
        'Week',
        'Finale won (servers)',
        'Boss rank',
        'Signed up',
        ...presets.map((p) => `${p.label}: signed up / server won`),
      ],
      shownWeeks(s.weeks).map((w) => {
        const sv = report.servers[w - 1];
        return [
          String(w),
          pct(sv?.finaleWonShare),
          num(sv?.rank?.median, 1),
          num(sv?.signedUp?.median, 1),
          ...presets.map((p) => {
            const x = p.weeks[w - 1];
            return `${pct(x?.signedUpShare)} / ${pct(x?.finaleWonShare)}`;
          }),
        ];
      }),
    ),
  );
  return `${out.join('\n\n')}\n`;
}

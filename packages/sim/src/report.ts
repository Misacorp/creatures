import { RULES, content } from '@creatures/game';
import { ARCHETYPES, ARCHETYPE_CONFIG, DEFAULT_MIX, DEFAULT_SERVER_SIZE } from './archetypes';
import type { Analysis } from './analysis';
import { POLICY } from './policy';
import { PITY_WEEKS, bossName, describeMix, type RunOutput } from './run';
import { describeRequirement, formatValue, type TargetResult } from './targets';
import { round } from './util';

const pct = (x: number | null, digits = 1): string =>
  x === null ? 'n/a' : `${(x * 100).toFixed(digits)}%`;
const num = (x: number | null, digits = 1): string => (x === null ? 'n/a' : x.toFixed(digits));

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const line = (cells: readonly string[]): string => `| ${cells.join(' | ')} |`;
  return [line(header), line(header.map(() => '---')), ...rows.map(line)].join('\n');
}

const MARK = { pass: '✅', fail: '❌', not_measured: '—' } as const;

function statusCounts(evaluation: readonly TargetResult[]): {
  pass: number;
  fail: number;
  notMeasured: number;
} {
  return {
    pass: evaluation.filter((t) => t.status === 'pass').length,
    fail: evaluation.filter((t) => t.status === 'fail').length,
    notMeasured: evaluation.filter((t) => t.status === 'not_measured').length,
  };
}

function targetsTable(evaluation: readonly TargetResult[]): string {
  return table(
    ['', 'Target', 'Measured', 'Requirement', 'Metric'],
    evaluation.map((t) => [
      MARK[t.status],
      t.description,
      t.measured === null ? 'not measured' : formatValue(t.measured, t.unit),
      describeRequirement(t),
      `\`${t.metric}\``,
    ]),
  );
}

function bossSection(a: Analysis): string {
  const parts: string[] = [];
  for (const boss of content.bosses) {
    const cells = a.cells.filter((c) => c.boss === boss.id);
    if (cells.length === 0) continue;
    const typical = a.typicalByBoss.find((t) => t.boss === boss.id);
    parts.push(`### ${boss.name} (${boss.element})`);
    parts.push(
      table(
        [
          'Players',
          'Runs',
          'Avg signed up',
          'Phase 1 clear',
          'Phase 2 clear',
          'Finale win',
          'Pool lost P1 / P2 / finale',
          'Reactions per round',
          'Median top share',
        ],
        cells.map((c) => [
          String(c.count),
          String(c.runs),
          num(c.avgSignedUp),
          pct(c.phase1ClearRate),
          pct(c.phase2ClearRate),
          pct(c.finaleWinRate),
          `${pct(c.avgLoss.phase1, 0)} / ${pct(c.avgLoss.phase2, 0)} / ${pct(c.avgLoss.finale, 0)}`,
          num(c.reactionsPerRound, 2),
          pct(c.topShareMedian),
        ]),
      ),
    );
    if (typical !== undefined) {
      parts.push(
        `Typical group (5-10 signed up, ${typical.runs} runs): Phase 1 ${pct(typical.phase1ClearRate)}, Phase 2 ${pct(typical.phase2ClearRate)}, finale ${pct(typical.finaleWinRate)}.`,
      );
    } else {
      parts.push('No typical-group runs for this boss.');
    }
  }
  return parts.join('\n\n');
}

function progressionSection(a: Analysis): string {
  const parts: string[] = [];
  for (const id of ARCHETYPES) {
    const rows = a.progression[id];
    if (rows.length === 0) continue;
    parts.push(`### ${ARCHETYPE_CONFIG[id].label}`);
    parts.push(
      table(
        [
          'Week',
          'Players',
          'Bait earned',
          'Bait from duplicates',
          'Spent on expeditions',
          'Spent on training',
          'Species owned',
          'Top-3 power',
          'Top level',
          'Evolved',
          'Essence earned',
          'Essence held',
          'Jackpots (total)',
          'Pity',
        ],
        rows.map((r) => [
          String(r.week),
          String(r.players),
          num(r.baitEarned, 0),
          num(r.baitConverted, 0),
          num(r.baitSpentExpeditions, 0),
          num(r.baitSpentTraining, 0),
          num(r.speciesOwned),
          num(r.top3Power, 0),
          num(r.maxLevel),
          num(r.evolved),
          num(r.essenceEarned),
          num(r.essence),
          num(r.jackpots, 2),
          num(r.pity),
        ]),
      ),
    );
  }
  return parts.join('\n\n');
}

function outlierList(title: string, items: readonly string[]): string {
  return items.length === 0 ? `- ${title}: none.` : `- ${title}: ${items.join('; ')}.`;
}

function outliersSection(a: Analysis): string {
  const o = a.outliers;
  return [
    outlierList(
      'Dominant creatures (contribution above 1.6x the median of their rarity)',
      o.dominantCreatures,
    ),
    outlierList('Weak creatures (below 0.6x)', o.weakCreatures),
    outlierList('Dead elements (picked in under 10% of raid slots)', o.deadElements),
    outlierList(
      'Unbeatable bosses (typical group never wins the finale)',
      o.unbeatableBosses.map(bossName),
    ),
    outlierList(
      'Trivial bosses (typical group always wins the finale)',
      o.trivialBosses.map(bossName),
    ),
    outlierList('Boss and group size combinations at 0% or 100% finale wins', o.extremeCells),
  ].join('\n');
}

const POLICY_TEXT = `
- **Leet credit:** each day, every player who leets earns \`baitForDay(n)\` (n = players who leeted that day). Casuals leet on 2 random days a week, dailies on 6, top earners on all 7, and the newcomer like a daily from week 4.
- **Starter:** the starter whose element the server owns least (ties in content order). The first expedition brings a Zipmouse (game rule).
- **Check-ins:** casuals check in once on each leet day; everyone else twice a day (morning and evening, 12 hours apart, so a Long expedition always finishes in time).
- **At a check-in:** claim expeditions (game \`rollCatches\`, fusion and conversion rules), evolve creatures that are at level 15 when there is enough Essence, plan expeditions, train, then send the planned expeditions.
- **Expeditions:** up to 3, one per creature. The budget is ${POLICY.expeditionShareBp / 100}% of the Bait held (all of it when nothing can be trained). Each free slot gets an equal share of the remaining budget and buys the option with the highest value that fits. Value = rolls x expected rarity score of a roll (common ${POLICY.rarityScore.common}, rare ${POLICY.rarityScore.rare}, epic ${POLICY.rarityScore.epic}). Explorers are creatures whose element has the most unowned catchable species. A player whose collection is complete (every catchable species owned with 5 fusions) stops sending expeditions.
- **Training:** the rest of the Bait goes to the weakest of the 3 strongest trainable creatures (not at their level cap), at the game's training cost with the catch-up discount. The median top level is computed across the simulated players.
- **Raids:** everyone active signs up (casuals with 70% probability) and brings their 3 highest-power creatures. Sign-up order is shuffled each week; \`autoPlace\` builds the row in that order; \`fillWithGuests\` fills it to ${RULES.combat.guestRowSize} slots with fewer than 3 players. Phase 1 runs on Friday, Phase 2 on Saturday (with the adaptation Phase 1 suggested) and the finale on Sunday; the boss HP pool carries across them. Finale abilities are picked round-robin over the four types and fire at their default rounds. Bosses rotate in content order.
- **Rewards:** Essence from \`essenceForStage\` for every cleared stage, weighted by the stage's contribution. Jackpots from \`rollJackpot\` on a finale win. The pity counter advances on every raid a player takes part in without a jackpot, win or loss (the counter counts participation). Set PITY_COUNTS_LOSSES in packages/sim/src/raid.ts to false to count only finale wins.
- **Evolution:** at level 15 (stage 1 level cap) when the player has the Essence from the content; the species switches to its stage 2 form and keeps its fusion count.
- **Team power** = sum over the top 3 creatures of \`atk + hp / 10\`, using \`effectiveStats\` (fusion included).
- **Typical group:** a raid week with 5 to 10 signed-up players, on rosters from the end of week 4 or 8.
`.trim();

export function buildReportMarkdown(out: RunOutput): string {
  const { settings: s, analysis: a, evaluation } = out;
  const counts = statusCounts(evaluation);
  const lines: string[] = [];
  lines.push('# Balance simulator report', '');
  lines.push(
    table(
      ['Setting', 'Value'],
      [
        ['Seed', `\`${s.seed}\``],
        ['Run size', s.mode],
        ['Weeks per economy sim', String(s.weeks)],
        ['Raid weeks per player count and boss', String(s.runsPerCell)],
        ['Economy sims per player count', String(s.economySims)],
        ['20-week economy sims for jackpot and pity', `${s.pitySims} (${PITY_WEEKS} weeks each)`],
        ['Player counts in the sweep', s.counts.join(', ')],
        ['Default server', `${DEFAULT_SERVER_SIZE} players (${describeMix()})`],
        ['Roster snapshots', 'end of weeks 4 and 8 (or the last week if the run is shorter)'],
        ['Bosses', content.bosses.map((b) => b.name).join(', ')],
      ],
    ),
    '',
  );
  lines.push('## Summary', '');
  lines.push(
    `${counts.pass} passed, ${counts.fail} failed, ${counts.notMeasured} not measured.`,
    '',
  );
  lines.push(targetsTable(evaluation), '');
  lines.push('## Bosses', '', bossSection(a), '');
  lines.push('## Fairness and contribution', '');
  lines.push(
    table(
      [
        'Archetype',
        'Average share of contribution (groups of 5+)',
        'Average Essence per raid week',
      ],
      a.archetypeShares.map((x) => [
        ARCHETYPE_CONFIG[x.archetype].label,
        pct(x.avgShare),
        num(x.avgEssence),
      ]),
    ),
    '',
  );
  lines.push(
    '## Archetype progression',
    '',
    `Averages over the ${s.economySims} default-server sims (${DEFAULT_SERVER_SIZE} players each).`,
    '',
    progressionSection(a),
    '',
  );
  lines.push('## Elements', '');
  lines.push(
    table(
      ['Element', 'Raid slots', 'Pick rate'],
      a.elements.map((e) => [e.element, String(e.picks), pct(e.pickRate)]),
    ),
    '',
  );
  lines.push('## Creatures', '');
  lines.push(
    table(
      [
        'Creature',
        'Rarity',
        'Element',
        'Role',
        'Picks',
        'Pick rate',
        'Average level',
        'Average contribution',
        'Relative to rarity median',
      ],
      a.creatures.map((c) => [
        c.name,
        c.rarity,
        c.element,
        c.role,
        String(c.appearances),
        pct(c.pickRate),
        num(c.avgLevel),
        num(c.avgContribution, 0),
        c.ratio === null ? 'n/a' : `${c.ratio.toFixed(2)}x`,
      ]),
    ),
    '',
  );
  lines.push('## Essence and jackpots', '');
  lines.push(
    table(
      ['Players', 'Player-weeks', 'Mean Essence', 'P10', 'Median', 'P90', 'Max'],
      a.essence.map((e) => [
        String(e.count),
        String(e.samples),
        num(e.mean),
        String(e.p10),
        String(e.p50),
        String(e.p90),
        String(e.max),
      ]),
    ),
    '',
  );
  lines.push(
    table(
      ['Source', 'Finale-win rolls', 'Jackpots', 'Rate', 'Guaranteed by hard pity'],
      a.jackpots.map((j) => [
        j.source,
        String(j.rolls),
        String(j.hits),
        pct(j.rate),
        String(j.guaranteed),
      ]),
    ),
    '',
  );
  lines.push('## Outliers', '', outliersSection(a), '');
  lines.push('## Example fight', '');
  if (out.example === null) {
    lines.push('No example fight was recorded.', '');
  } else {
    lines.push(
      `${out.example.boss} finale, ${out.example.count}-player server on a week ${out.example.snapshotWeek} roster (${out.example.won ? 'won' : 'lost'}). First ${out.example.lines.length} events:`,
      '',
      ...out.example.lines.map((l, i) => `${i + 1}. ${l}`),
      '',
    );
  }
  lines.push('## Method', '', POLICY_TEXT, '');
  lines.push(
    `Default mix: ${ARCHETYPES.map((id) => `${DEFAULT_MIX[id]} ${id}`).join(', ')}. Other server sizes use the same mix scaled by largest remainder.`,
    '',
  );
  return lines.join('\n');
}

function roundDeep(value: unknown): unknown {
  if (typeof value === 'number') return Number.isInteger(value) ? value : round(value, 4);
  if (Array.isArray(value)) return value.map(roundDeep);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, roundDeep(v)]));
  }
  return value;
}

/** The raw metrics as a JSON string (stable: same inputs, same text; no clock or git state). */
export function buildReportJson(out: RunOutput): string {
  const { settings, analysis, evaluation, example } = out;
  const doc = {
    settings,
    summary: statusCounts(evaluation),
    targets: evaluation,
    metrics: analysis.metrics,
    bosses: analysis.cells,
    typicalByBoss: analysis.typicalByBoss,
    archetypeShares: analysis.archetypeShares,
    progression: analysis.progression,
    elements: analysis.elements,
    creatures: analysis.creatures,
    essence: analysis.essence,
    jackpots: analysis.jackpots,
    outliers: analysis.outliers,
    exampleFight: example,
  };
  return `${JSON.stringify(roundDeep(doc), null, 2)}\n`;
}

export { statusCounts };

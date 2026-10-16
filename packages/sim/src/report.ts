import { RULES, content } from '@creatures/game';
import { ARCHETYPES, ARCHETYPE_CONFIG, DEFAULT_MIX, DEFAULT_SERVER_SIZE } from './archetypes';
import type { Analysis } from './analysis';
import { curveMarkdown } from './curve-study';
import { gearShareMarkdown } from './gear-study';
import { suppliesMarkdown } from './supplies-study';
import { WIN_RATE_MAX_DEPTH } from './dungeon-analysis';
import { ROLE_STUDY_HP_BP, ROLE_STUDY_RUNS_FACTOR } from './roles';
import { SETUP_RANK_OFFSETS } from './setup-study';
import { TRIP_POLICY } from './trips';
import { LONG_RUN_WEEKS, LOSS_STREAK_LIMIT } from './ladder';
import { PITY_WEEKS, bossName, describeMix, type RunOutput } from './run';
import { TARGETS, describeRequirement, formatValue, type TargetResult } from './targets';
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

function gearSection(a: Analysis): string {
  const parts: string[] = [];
  parts.push(
    'Gear power is the power the worn items add to the top 3 creatures (`applyGear`, floored like the fight slots), and the share is that power over the top-3 power (gear included). The "today" columns are the same sims and seeds played without gear.',
  );
  for (const id of ARCHETYPES) {
    const rows = a.progression[id];
    if (rows.length === 0) continue;
    parts.push(`### ${ARCHETYPE_CONFIG[id].label}`);
    parts.push(
      table(
        [
          'Week',
          'Gear power',
          'Gear share',
          'Item levels (team)',
          'Crafts claimed',
          'Crafting level (best)',
          'Essence held',
          'Scrap held',
        ],
        rows.map((r) => [
          String(r.week),
          num(r.gearPower),
          pct(r.gearShare),
          num(r.gearLevels),
          num(r.crafted),
          num(r.skillLevel),
          num(r.essence, 0),
          num(r.scrap),
        ]),
      ),
    );
  }
  if (a.gearComparison.length > 0) {
    parts.push('### Daily players with gear and without (today)');
    parts.push(
      table(
        ['Week', 'Essence held', 'Essence held today', 'Top-3 power', 'Top-3 power today'],
        a.gearComparison.map((r) => [
          String(r.week),
          num(r.essenceWithGear, 0),
          num(r.essenceToday, 0),
          num(r.top3PowerWithGear, 0),
          num(r.top3PowerToday, 0),
        ]),
      ),
    );
  }
  if (a.worn.length > 0) {
    parts.push(`### What the team wears (end of week ${String(a.worn[0]?.week ?? 0)})`);
    parts.push(
      table(
        [
          'Archetype',
          'Common',
          'Rare',
          'Epic',
          'Festival',
          'Average item level',
          'Power added per item',
          'Bag',
          'Blueprints',
          'Scrap',
          'Shards',
          'Glimmer',
        ],
        a.worn.map((r) => [
          ARCHETYPE_CONFIG[r.archetype].label,
          pct(r.rarity.common, 0),
          pct(r.rarity.rare, 0),
          pct(r.rarity.epic, 0),
          pct(r.rarity.festival, 0),
          num(r.level),
          num(r.power),
          num(r.bag),
          num(r.blueprints),
          num(r.scrap, 0),
          num(r.shards, 0),
          num(r.glimmer),
        ]),
      ),
    );
  }
  return parts.join('\n\n');
}

function dungeonSection(a: Analysis): string {
  const d = a.dungeon;
  const parts: string[] = [];
  parts.push(
    `Every player with 3 creatures runs the dungeon once on each day they check in (casuals on their leet days), with their 3 strongest creatures. Depth ${String(1)} to ${String(WIN_RATE_MAX_DEPTH)} are listed; a run is cleared when all ${String(RULES.dungeon.rooms)} rooms are.`,
  );
  parts.push('### Clear rate by depth');
  const shown = Array.from({ length: WIN_RATE_MAX_DEPTH }, (_, k) => k + 1);
  parts.push(
    table(
      ['Depth', 'Casual', 'Daily', 'Top earner'],
      shown.map((depth) => [
        String(depth),
        ...(['casual', 'daily', 'top'] as const).map((id) => {
          const row = d.winRates[id].find((r) => r.depth === depth);
          return row === undefined || row.runs === 0
            ? '-'
            : `${pct(row.clears / row.runs, 0)} (${String(row.runs)})`;
        }),
      ]),
    ),
  );
  parts.push(
    'Runs in brackets. Players stop at the depth where they win about a fifth of their runs.',
  );
  parts.push('### Depth after N weeks (median, quartiles)');
  const weeksShown = [1, 2, 4, 6, 8, 10, 12];
  parts.push(
    table(
      ['Week', ...ARCHETYPES.map((id) => ARCHETYPE_CONFIG[id].label)],
      weeksShown.map((week) => [
        String(week),
        ...ARCHETYPES.map((id) => {
          const row = d.depthAfter[id].find((r) => r.week === week);
          return row === undefined
            ? '-'
            : `${num(row.median, 0)} (${num(row.p25, 0)} to ${num(row.p75, 0)})`;
        }),
      ]),
    ),
  );
  parts.push('### Reward flow per player and week');
  parts.push(
    table(
      ['Archetype', 'Runs', 'Cleared', 'Bait', 'Essence', 'Scrap', 'Gear items'],
      ARCHETYPES.map((id) => {
        const f = d.flow[id];
        return [
          ARCHETYPE_CONFIG[id].label,
          num(f.runs, 2),
          num(f.clears, 2),
          num(f.bait),
          num(f.essence, 2),
          num(f.scrap),
          num(f.items, 2),
        ];
      }),
    ),
  );
  parts.push(
    `Dungeon Essence is ${pct(d.dailyEssenceShare)} of a daily player's Essence income. Gear's share of a daily player's raid-team power at week 8 is ${pct(d.gearShareWeek8.with)} with the dungeon and ${pct(d.gearShareWeek8.without)} without it (the same sims and seeds).`,
  );
  return parts.join('\n\n');
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

function finaleSection(a: Analysis): string {
  const f = a.finale;
  if (f === null) return 'Not measured.';
  return [
    `Typical groups (5-10 signed up, ${f.runs} raid weeks). A cleared phase leaves its floor (Phase 1: ${pct(1 - (RULES.raid.phases[0]?.clearAtLossBp ?? 0) / 10_000, 0)} of the boss's HP, Phase 2: ${pct(1 - (RULES.raid.phases[1]?.clearAtLossBp ?? 0) / 10_000, 0)}), so a finale that follows a cleared Phase 2 starts at the Phase 2 floor. Enrage: ${String(RULES.raid.enrage.rounds)} rounds at ${pct(RULES.raid.enrage.powerBp / 10_000, 0)} of the boss's Attack on every creature, after the finale's own rounds.`,
    '',
    table(
      ['Measure', 'Value'],
      [
        ['Phase 1 clear rate', pct(f.phase1ClearRate)],
        ['Phase 2 clear rate', pct(f.phase2ClearRate)],
        ['Finale win rate', pct(f.finaleWinRate)],
        ['Boss HP left when the finale began (mean share of the maximum)', pct(f.startShare)],
        ['Finale win rate when it began at the Phase 2 floor', pct(f.winRateFromFloor)],
        ['Finale win rate when Phase 2 fell short of its floor', pct(f.winRateOthers)],
        ['Finales that reached the enrage rounds', pct(f.enrageShare)],
        [
          'Win rate inside the enrage rounds (of the finales that reached them)',
          pct(f.enrageWinRate),
        ],
        [
          'Enrage rounds played before the row was wiped (finales that reached enrage and were lost, mean)',
          num(f.enrageLossRounds, 2),
        ],
        ['Creatures knocked out in the finale', pct(f.koShare)],
        [
          'Barrage volleys that broke the no-repeat rule (hit a creature the previous volley of the same barrage hit although enough others stood)',
          `${pct(f.repeatShare, 2)} of ${String(f.volleys)} volleys`,
        ],
        [
          'Barrage volleys that repeated a victim because too few other creatures were left standing (the rule allows it)',
          pct(f.forcedRepeatShare, 2),
        ],
      ],
    ),
  ].join('\n');
}

function rolesSection(a: Analysis): string {
  const r = a.roles;
  if (r === null) return 'Not measured.';
  const rows = (population: 'normal' | 'both'): string[][] =>
    r.arms
      .filter((x) => x.population === population)
      .map((x) => [
        x.label,
        String(x.runs),
        pct(x.winRate),
        x.deltaPoints === null
          ? 'n/a'
          : `${x.deltaPoints > 0 ? '+' : ''}${x.deltaPoints.toFixed(1)}`,
        pct(x.koShare),
      ]);
  const header = [
    'Switched off',
    'Raid weeks',
    'Finale win rate',
    'Points vs everything on',
    'Creatures knocked out',
  ];
  return [
    `The same raid weeks played again with a role switched off (Guard: no extra HP, no intercept, no cover; Support: no buff and no element effect; one element: only that Support effect), with the same rosters, sign-ups and dice. Guards are spread through the row (evenly spaced), the formation in which they show; the sim's default formation clumps them in front. The bosses' HP pool is ${pct(ROLE_STUDY_HP_BP / 10_000 - 1, 0)} bigger than in the raid sweep, so the reference wins about 70% of its weeks and a role has room to show (at the sweep's own difficulty a spread row wins about 95% and hides what a Guard saves). Typical groups only (5-10 signed up), ${String(ROLE_STUDY_RUNS_FACTOR)} times the sweep's weeks per cell. The Guard value of the targets is the first table's "Guard off" row, as win points lost. One standard error of a difference is about 1 point; differences under 2 points are noise. Grove has no Support species yet, so its Mend has nothing to switch off (0.0 is expected).`,
    '',
    "### Players bring their 3 strongest creatures (the sim's rule)",
    '',
    table(header, rows('normal')),
    '',
    '### Every player brings a Guard and a Support when they own one',
    '',
    'A Support is only 1 to 3% of the creatures in the first table, so its effects hardly show there. This population shows what a Support is worth when one is present.',
    '',
    table(header, rows('both')),
    '',
    `Guard value (the target): ${num(r.guardValue)} win points.`,
  ].join('\n');
}

function setupsSection(out: RunOutput): string {
  const rows = out.setups.setups;
  const points = (x: number | null): string =>
    x === null ? 'n/a' : `${x > 0 ? '+' : ''}${x.toFixed(1)}`;
  return [
    "The same raid weeks (rosters, sign-ups and dice of the sweep) played with the row arranged three ways. **Default** is the sim's own row (`autoPlace`: Guards in front, payoffs at the back, Supports in the middle). **Greedy** packs setters and payoffs for the most reactions a round and puts Guards and Supports where they cost the fewest, at the edges. **Protected** puts every payoff beside a Guard where it can (adjacency stops at zone edges), Supports between payoffs, and takes whatever reactions remain. The two setups are the best arrangement a seeded hill-climb finds for their own score (`formations.ts`). Typical groups only (5-10 signed up). \"+N ranks\" plays the same weeks against a boss N Boss Ranks above the sweep's (the curve's HP and Attack for that rank): at +0 a typical group wins about 93% and there is little left to lose, +1 and +2 are what a server that keeps winning meets next. **Swing** is the standard deviation of the win rate over the cells (server size, boss, roster week) and of the knock-out share from finale to finale, in points; one standard error of a win rate is about 1.5 points at +0 and 2 points at +1.",
    '',
    ...SETUP_RANK_OFFSETS.flatMap((offset) => [
      `### ${offset === 0 ? 'The shipped bosses (+0 ranks)' : `+${String(offset)} rank${offset === 1 ? '' : 's'}`}`,
      '',
      table(
        [
          'Row',
          'Finales',
          'Win rate',
          'Points vs default',
          'Phase 1 cleared',
          'Boss HP left at the finale',
          'Reactions a round',
          'Payoffs beside a Guard',
          'Knocked out',
          'Knocked out in wins',
          'Lost with over half the row down',
          'Won with over half the row down',
          'Swing: win rate by cell (points)',
          'Swing: knock-out share (points)',
        ],
        rows
          .filter((r) => r.rankOffset === offset)
          .map((r) => [
            r.label,
            String(r.runs),
            pct(r.winRate),
            points(r.deltaPoints),
            pct(r.phase1ClearRate),
            pct(r.finaleStartShare),
            num(r.reactionsPerRound, 2),
            pct(r.guardedPayoffShare, 0),
            pct(r.koShare),
            pct(r.koShareWon),
            pct(r.lostMajorityDownShare, 0),
            pct(r.wonMajorityDownShare, 1),
            num(r.cellWinRateSd),
            num(r.koShareSd),
          ]),
      ),
      '',
    ]),
  ].join('\n');
}

function suppliesSection(out: RunOutput): string {
  // The study's own Markdown, with its title dropped and its headings one level down.
  const body = suppliesMarkdown([out.supplies], [1, 4, 8, out.settings.weeks])
    .split('\n')
    .slice(2)
    .join('\n');
  return body.replace(/^## /gm, '### ');
}

function gearShareSection(out: RunOutput): string {
  if (out.gear === null) return 'The gear share study was skipped in this run.';
  const ranges: Record<string, readonly [number, number]> = {};
  for (const t of TARGETS) {
    if (t.metric.startsWith('gear.share.') && typeof t.value !== 'number') {
      ranges[t.metric] = t.value;
    }
  }
  return gearShareMarkdown(out.gear, ranges);
}

function curveSection(out: RunOutput): string {
  // The study's own Markdown, with its title dropped and its headings one level down.
  const body = curveMarkdown(out.curve).split('\n').slice(2).join('\n');
  return body.replace(/^## /gm, '### ');
}

function ranksSection(out: RunOutput): string {
  const rows = out.ranks.rows;
  return [
    "Typical groups (5-10 signed up) on the sweep's rosters of week 4 and week 8, against every boss at Boss Ranks 1, 3, 5, 7, 9 and 11 with the shipped rank curve (`RULES.raid.curve`; the rank is forced, whatever the roster would have been placed at). It shows where wins collapse for a roster that has stopped growing, not what a server at that rank looks like (a server that reaches rank 9 has been winning, so its creatures are stronger than these).",
    '',
    table(
      [
        'Boss Rank',
        'Roster week',
        'Finales',
        'Phase 1 cleared',
        'Phase 2 cleared',
        'Finale win rate',
        'Boss HP left at the finale',
        'Knocked out',
        'Reached enrage',
      ],
      rows.map((r) => [
        String(r.rank),
        String(r.rosterWeek),
        String(r.runs),
        pct(r.phase1ClearRate),
        pct(r.phase2ClearRate),
        pct(r.winRate),
        pct(r.finaleStartShare),
        pct(r.koShare),
        pct(r.enrageShare),
      ]),
    ),
  ].join('\n');
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

function abilitySection(a: Analysis): string {
  if (a.abilityShares.length === 0) return 'Not measured.';
  return [
    `What abilities add to the damage dealt in the finale, measured by replaying each finale three times against a boss that cannot fall (every ability, only the basic ones, none) so all ${content.bosses[0]?.finaleRounds ?? 12} rounds are played. Creature share = (all - basic only) / all; basic share = (basic only - none) / all. Creature abilities need creature level ${RULES.abilities.unlockLevel}. Informational: the aim is a creature share of about 10-25% for a week-8 roster, not a target.`,
    '',
    table(
      [
        'Roster week',
        'Group',
        'Raids',
        'Creature abilities per raid',
        'Creature share',
        'Basic share',
      ],
      a.abilityShares.map((r) => [
        String(r.snapshotWeek),
        r.group,
        String(r.runs),
        num(r.creatureAbilities, 1),
        pct(r.creatureShare),
        pct(r.basicShare),
      ]),
    ),
  ].join('\n');
}

function longRunSection(a: Analysis, longRunSims: number): string {
  if (a.longRun.length === 0) return 'Not measured.';
  const week = (rows: (number | null)[], w: number): string => num(rows[w - 1] ?? null);
  const checkpoints = [1, 5, 10, 15, 20, 25, LONG_RUN_WEEKS];
  return [
    `${longRunSims} servers per size, ${LONG_RUN_WEEKS} weeks each (${LONG_RUN_WEEKS / RULES.progression.seasonWeeks} seasons of ${RULES.progression.seasonWeeks - 1} normal weeks and a Festival), with the Boss Rank ladder: placement at the first raid week, a normal finale win +${RULES.progression.winRankUp} rank, a loss keeps the rank, a Festival boss fights ${RULES.progression.festivalEaseRanks} ranks lower and the rank eases ${RULES.progression.seasonResetRanks} after it. Every server starts at a random point of the 5-week calendar. A rank-up is a week that raised the rank.`,
    '',
    table(
      [
        'Server',
        'Servers',
        'Finale win rate (mean per server)',
        'Per server p10 to p90',
        'Normal weeks',
        'Festival weeks',
        'Weeks 1-10',
        'Weeks 11+',
        `Median weeks between rank-ups (p10 to p90)`,
        `Servers with a loss streak over ${LOSS_STREAK_LIMIT}`,
        'Median longest loss streak',
      ],
      a.longRun.map((g) => [
        g.label,
        String(g.servers),
        pct(g.winRate),
        `${pct(g.winRateP10, 0)} to ${pct(g.winRateP90, 0)}`,
        pct(g.normalWinRate),
        pct(g.festivalWinRate),
        pct(g.winRateEarly),
        pct(g.winRateLate),
        `${num(g.medianRankUpGap)} (${num(g.rankUpGapP10, 0)} to ${num(g.rankUpGapP90, 0)})`,
        pct(g.lossStreakShare),
        num(g.longestLossStreak, 0),
      ]),
    ),
    '',
    'Median server rank at the start of each week (the Festival boss fights at an eased rank):',
    '',
    table(
      [
        'Server',
        'Placement',
        ...checkpoints.map((w) => `Week ${w}`),
        'Rank after the last week (p10 to p90)',
      ],
      a.longRun.map((g) => [
        g.label,
        num(g.placementRank),
        ...checkpoints.map((w) => week(g.medianRankByWeek, w)),
        `${num(g.finalRankMedian)} (${num(g.finalRankP10, 0)} to ${num(g.finalRankP90, 0)})`,
      ]),
    ),
    '',
    `Rank spread between the typical and the 15-player server after week ${LONG_RUN_WEEKS} (informational, no target): ${num(a.metrics['longrun.rankSpreadTypicalVsFifteen'] ?? null)} ranks.`,
  ].join('\n');
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
- **Income:** each day, every player who opens the game earns the daily allowance (\`dailyAllowance()\`) and every leeter the leet bonus on top (\`leetBonusForDay(n)\`, n = players who leeted that day); \`--income current\` plays the old leet-only pay (\`baitForDay(n)\`) instead. Casuals open the game and leet on 2 random days a week, dailies open it every day and leet on 6, top earners leet on all 7, and the newcomer plays like a daily from week 4.
- **Starter:** the starter whose element the server owns least (ties in content order). The first expedition brings a Zipmouse (game rule).
- **Check-ins:** casuals check in once on each leet day (every few days); everyone else twice a day (09:00 and 20:00).
- **At a check-in:** claim trips (and take an end-of-trip goal), claim jobs, evolve creatures that are at level 15 when there is enough Essence, train, manage gear, send trips into the free slots, start workshop jobs.
- **Trips (expeditions v2):** slots come from the sum of the explorer ranks above 1 (\`slotsFor\`); a trip is free and supplies cannot be bought. Each free slot sends the idle creature of the highest explorer rank, to the open place (rank, night and Festival gates) where the most unowned species can be found (rarer ones count more, the weekly special place a little extra), for the length that pays the most per hour until the next check-in claims it (casuals: the longest they may). Supplies: those in stock that help (found on trips, dropped by the dungeon, crafted, or a rank gift); at most 2, never two of a kind. When a trip has ended it rolls its end-of-trip offer; a goal is taken when its extra hours (counted from the end of the trip) are over already (no waiting) and its worth ratio is at least ${TRIP_POLICY.minGoalRatioBp / 100}%. The workshop makes supplies when the stock is low.
- **Training:** the rest of the Bait goes to one creature at a time, at the game's training cost with the catch-up discount: of the 3 strongest trainable creatures (not at their level cap), the furthest-along one that still has to reach its evolution level (players push one creature to its evolution before starting the next); if none of the three is working towards an evolution, the weakest of them. The median top level is computed across the simulated players.
- **Raids:** everyone active signs up (casuals with 70% probability) and brings their 3 highest-power creatures. Sign-up order is shuffled each week; \`autoPlace\` builds the row in that order; \`fillWithGuests\` fills it to ${RULES.combat.guestRowSize} slots with fewer than 3 players. Phase 1 runs on Friday, Phase 2 on Saturday (with the adaptation Phase 1 suggested) and the finale on Sunday; the boss HP pool carries across them. In the finale each player brings their basic ability (round-robin over the four) plus the creature ability of each team creature at level ${RULES.abilities.unlockLevel} or above; every ability fires at its default round. Bosses rotate in content order by the global week index. Crits are on (5% for +50%, players and boss). The raid sweep fights each boss at the rank the old per-level rule would have chosen for the roster (\`placementRank\`), which is what the boss HP and the head-count exponents are calibrated at; the long-run servers (below) use the ladder.
- **Boss Rank ladder (long-run servers):** a new server is placed once at its first raid week, a finale win in a normal week adds ${RULES.progression.winRankUp} rank, a loss changes nothing, every ${RULES.progression.seasonWeeks}th week of the global calendar is a Festival (boss ${RULES.progression.festivalEaseRanks} ranks lower, +${RULES.progression.festivalEssenceBp / 100}% Essence, a win grants each participant the season's Festival creature through the duplicate rules) and the rank eases ${RULES.progression.seasonResetRanks} after every Festival. Each long-run server starts at a random point of the 5-week calendar.
- **Rewards:** Essence from \`essenceForStage\` for every cleared stage, weighted by the stage's contribution and scaled by the server's rank and the Festival bonus (\`essenceMultiplierBp\`). Jackpots from \`rollJackpot\` on a finale win. The pity counter advances only on a finale win without a jackpot; a lost finale changes nothing (soft pity from raid ${RULES.raid.jackpot.softPityFromRaid}, hard pity at raid ${RULES.raid.jackpot.hardPityRaid}).
- **Evolution:** at level 15 (stage 1 level cap) when the player has the Essence from the content; the species switches to its stage 2 form and keeps its fusion count.
- **Team power** = sum over the top 3 creatures of \`atk + hp / 10\`, using \`effectiveStats\` (fusion and the worn gear included, like the worker's \`power\`).
- **Gear drops** follow the worker: the welcome kit when a player joins (a Common Trail Cap at item level 1, a blueprint and scrap), phase scrap for every participant of a cleared Phase 1 or 2, one reward per participant of a won finale at the server's rank (a gear piece of the boss's element at item level 3 + Boss Rank, or a blueprint they do not know yet; and the Festival piece in a Festival week), the dungeon's gear chance, and the loot of every claimed expedition (scrap, a shard, a glimmer, a blueprint; a blueprint the player knows is a well-thumbed mark, scrap at the most marks) and of a push-on gear find. All rolls use the game's pure functions (\`rollFinaleReward\`, \`rollFestivalItem\`, \`rollDungeonItem\`, \`expeditionLoot\`, \`rollExpeditionItem\`, \`rollWelcomeKit\`, \`rollCraft\`) with a seeded stream of their own.
- **Gear policy**, at every check-in after the claims: claim finished jobs; Equip best (the game's \`planEquipBest\` over the 3 strongest creatures by power without gear, the bag and what they wear, under the wear rule: a Hat from creature level 1, a Scarf from 7, a Charm from 13, an item level at most the creature's level, a role-locked Charm only on its role); keep the 3 best unworn items as spares; then start jobs in the free workshop slots on creatures that are not exploring (the one with the most Crafting XP first): the first job crafts (a supply when fewer than 4 are in stock, a first craft before any supply, else the blueprint whose plain item adds the most to a team creature, aimed with the biggest Reach the creature's level, the parts and the Essence above 40 allow), the second takes apart the extras (a bundle of up to 5 Commons once 3 wait, or an Epic, Festival or Rare piece alone) as a dismantle job, which pays its refund range, Essence and a blueprint chance when it is claimed. Items fold into the fight slots with \`applyGear\` (stats, crit, the modifier sheet, and the trip and Workshop lines the sim also reads: Quick feet, Trail XP, Lucky find, Keen nose, Packer, Busy paws, Apprentice). A creature on a job does not explore (one busy state) but still fights.
- **Daily dungeon** (\`docs/design/daily-dungeon.md\`): every player with at least 3 creatures runs it once on each day they check in (casuals on their leet days); on the first day they ever ran, a lost run may be tried once more. The team is the 3 strongest creatures by power (gear included), stood in one row by the game's rule for it (\`dungeonRowOrder\`: the order that sets off the most reactions left to right, ties by setters and supports left, a Guard in the middle, payoffs right); there is no basic ability, and every unlocked creature ability fires at its default round. The day's three room modifiers are shared by the whole server and come from a seed of the day, the foes from the run's seed, and a full clear moves the depth up by 1. Rewards follow the worker: Bait, Essence and scrap for each cleared room, a shard from the boss room, a gear chance on a full clear (certain at a landmark depth), and the streak bonus on the first run of a day, through \`dungeonPayout\`, \`rollDungeonLoot\` and \`streakBonus\`.
- **Time** for jobs: check-ins at 09:00 and 20:00 (casuals at 09:00 on their leet days); a job is claimed at the first check-in after \`jobDuration\` (the crafter's skill included) has passed.
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
        [
          'Long-run server sims (5, 10 and 15 players)',
          `${s.longRunSims} each (${LONG_RUN_WEEKS} weeks each)`,
        ],
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
  lines.push('## Finale structure (phase floors and enrage)', '', finaleSection(a), '');
  lines.push('## Roles (Guard and Support ablation)', '', rolesSection(a), '');
  lines.push('## Setups (greedy and protected rows)', '', setupsSection(out), '');
  lines.push('## High Boss Ranks', '', ranksSection(out), '');
  lines.push('## Raid curve by Boss Rank (journey servers)', '', curveSection(out), '');
  lines.push('## Supplies (journey servers)', '', suppliesSection(out), '');
  lines.push(
    '## Gear share of fight-scored power (journey servers)',
    '',
    gearShareSection(out),
    '',
  );
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
  lines.push('## Gear and crafting', '', gearSection(a), '');
  lines.push('## Daily dungeon', '', dungeonSection(a), '');
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
        c.festival ? `${c.name} (Festival)` : c.name,
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
  lines.push('## Ability damage share (informational)', '', abilitySection(a), '');
  lines.push(
    '## Long-running servers (ladder, Festivals, seasons)',
    '',
    longRunSection(a, s.longRunSims),
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
    gearComparison: analysis.gearComparison,
    worn: analysis.worn,
    dungeon: analysis.dungeon,
    elements: analysis.elements,
    creatures: analysis.creatures,
    essence: analysis.essence,
    abilityShares: analysis.abilityShares,
    longRun: analysis.longRun,
    finale: analysis.finale,
    roles: analysis.roles,
    setups: out.setups.setups,
    ranks: out.ranks.rows,
    curve: { mixes: out.curve.mixes },
    supplies: out.supplies.profiles,
    gear: out.gear,
    jackpots: analysis.jackpots,
    outliers: analysis.outliers,
    exampleFight: example,
  };
  return `${JSON.stringify(roundDeep(doc), null, 2)}\n`;
}

export { statusCounts };

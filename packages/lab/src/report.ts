/**
 * The lab report: scenarios from the design library, whether each card's intended answers work,
 * the best-team search per rule card, species diversity, Knack usage, a casual roster and a raid
 * weekend with attrition. Written to docs/design/combat/lab-report.md by
 * `pnpm --filter @creatures/lab report`.
 */
import { createSeededRng } from '@creatures/game';
import { CARDS, labBoss } from './cards';
import { weekend } from './fight';
import { KEYWORDS } from './keywords';
import { FAMILIES, FORM_KNACKS, KNACKS } from './knacks';
import { planBosses, type BossSections } from './bossReport';
import type { JobResults, JobSpec, Plan } from './jobs';
import { planTalents, type TalentSection } from './talentReport';
import type { TeamInputs } from './teamShareReport';
import { CASUAL_CARDS, casualRosters, searchOptions } from './teams';
import { LINE_POOLS, TALENTS, talentPool } from './talents';
import { LAB_RULES } from './rules';
import { ELEMENTS, formStats, triggers } from './species';
import {
  CLASSIC_LINE,
  GAUNTLET,
  LEVEL,
  RAID,
  bossFor,
  classicFor,
  evaluate,
  lineKey,
  poolOf,
  search,
  toPlacements,
  type Mode,
  type Pick,
  type Ranked,
} from './search';

const P = (s: string): Pick => {
  const [formId, knack] = s.split('/');
  return { formId: formId ?? '', knack: knack ?? 'none' };
};
const line = (s: string) => s.split(' ').map(P);
const r0 = (n: number) => Math.round(n);
const pct = (v: number, base: number) =>
  base ? `${v >= base ? '+' : ''}${Math.round((v / base - 1) * 100)}%` : 'n/a';
const knackName = (k: string) => (k === 'none' ? 'no Knack' : (KNACKS[k]?.name ?? k));
const name = (p: Pick) => `${p.formId} (${knackName(p.knack)})`;

/** Lines from the design library, tried on every card. */
export const SCENARIOS: Readonly<Record<string, string>> = {
  'Classic: Tidewing, Tempestray Detonate, Thornbuck':
    'tidewing/steady-mark tempestray/detonate thornbuck/wide-reach',
  'Classic with no Knacks': 'tidewing/none tempestray/none thornbuck/none',
  'Two Setters into Detonate': 'splashet/lead-the-way tidewing/steady-mark tempestray/detonate',
  'Double Mark into a Grove Detonate':
    'voltaro/double-mark bloomback/detonate thornbuck/wide-reach',
  'Chain: Overload leaves Charged for Bloomback':
    'tidewing/steady-mark tempestray/leave-a-trail bloomback/none',
  'No Setter: Ready the Mark feeds Geyserpup':
    'kilnmole/draw-fire geyserpup/none magmole/ready-the-mark',
  'No Setter: Puddle Maker': 'kilnmole/draw-fire geyserpup/puddle-maker magmole/tunnel-through',
  'All at Once on two Setters': 'wickat/double-mark solmane/none geyserpup/all-at-once',
  'Twin Strike': 'tidewing/steady-mark tempestray/twin-strike thornbuck/wide-reach',
  'Dodge tank: Zigzag beside a Guard': 'voltaro/zigzag ohmouse/catch-the-bolts tempestray/none',
  'Mire: Mud Wall and Squelch Song': 'bogwarden/mud-wall tempestray/none croakmire/squelch-song',
  'No reactions: plain hitters': 'tempestray/twin-strike magmole/tunnel-through kilnmole/draw-fire',
  "Guard's Shadow: Pyrelynx beside Kilnmole":
    'ancientshell/steady-mark pyrelynx/guards-shadow kilnmole/draw-fire',
  'Crown of Embers into a Territorial Coralynx':
    'solmane/crown-of-embers coralynx/territorial kilnmole/draw-fire',
  'Starlight across the row': 'tidewing/steady-mark aurorix/starlight tempestray/none',
  'Drizzle across the row': 'tidewing/steady-mark drizzlewt/drizzle tempestray/none',
  'Carry Them: Gaiadrake guards its Setter':
    'voltaro/zoom gaiadrake/carry-them thornbuck/wide-reach',
};

/** Each card's intended answers (the Knacks its icon would point at, P-08), as a line to test. */
export const ANSWERS: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  'thick-hide': [
    [
      'Tunnel Through beside the Payoff',
      'tidewing/steady-mark tempestray/none magmole/tunnel-through',
    ],
    ['All at Once on two Setters', 'wickat/double-mark solmane/none geyserpup/all-at-once'],
  ],
  'stone-skin': [
    ['Twin Strike', 'tidewing/steady-mark tempestray/twin-strike thornbuck/wide-reach'],
  ],
  'clean-scales': [
    ['Steady Mark (Seal)', 'tidewing/steady-mark tempestray/none thornbuck/wide-reach'],
  ],
  'reflective-hide': [
    ['Circle Round', 'tidewing/circle-round tempestray/none thornbuck/wide-reach'],
    ['Clear the Air', 'tidewing/steady-mark tempestray/none halcyray/clear-the-air'],
  ],
  elusive: [['Clear Skies', 'tidewing/steady-mark tempestray/none halcyray/clear-skies']],
  slippery: [
    [
      'Clear Skies beside both hitters',
      'tidewing/steady-mark halcyray/clear-skies tempestray/none',
    ],
    [
      'All at Once (marks are never dodged)',
      'tidewing/steady-mark tempestray/all-at-once thornbuck/wide-reach',
    ],
  ],
  'lucky-strike': [
    ['Cool Head in the middle', 'tidewing/steady-mark thornbuck/cool-head tempestray/none'],
    ['Hide in Mist', 'tidewing/steady-mark fogwyrm/hide-in-mist tempestray/none'],
  ],
  'bramble-bind': [
    ['Setter in the middle', 'thornbuck/wide-reach tidewing/steady-mark tempestray/none'],
    ['Lantern Glow in the middle', 'tidewing/steady-mark lanternfin/lantern-glow tempestray/none'],
  ],
  wither: [['Draw Fire (prevention)', 'tidewing/steady-mark tempestray/none kilnmole/draw-fire']],
  'payoff-hunter': [
    ['Guard beside the Payoff', 'tidewing/steady-mark tempestray/none thornbuck/wide-reach'],
  ],
  grudge: [['Draw Fire', 'tidewing/steady-mark tempestray/none kilnmole/draw-fire']],
  'great-wave': [
    ['Night Watch', 'tidewing/steady-mark tempestray/none thornbuck/night-watch'],
    ['Keep the Heat In', 'tidewing/steady-mark tempestray/none kilnmole/keep-the-heat-in'],
    ['Living Shelter', 'pyrelynx/none ancientshell/living-shelter thornbuck/wide-reach'],
  ],
  swarm: [
    ['Zoom', 'voltaro/zoom tempestray/none thornbuck/wide-reach'],
    ['Hide in Mist', 'tidewing/steady-mark fogwyrm/hide-in-mist tempestray/none'],
  ],
  crusher: [
    ['Guard beside the Payoff', 'tidewing/steady-mark tempestray/none thornbuck/wide-reach'],
    ['Hearth', 'tidewing/steady-mark tempestray/none hearthshell/hearth'],
  ],
};

export interface Report {
  readonly markdown: string;
  readonly data: unknown;
}

/** A Leave a Trail pick only counts when another Payoff in the line can cash the trail's mark. */
function usefulKnacks(l: readonly Pick[]): Set<string> {
  const out = new Set<string>();
  for (const p of l) {
    if (p.knack === 'leave-a-trail') {
      const el = formStats(p.formId, LEVEL).element;
      const partner = l.some((o) => {
        const st = formStats(o.formId, LEVEL);
        return o !== p && st.role === 'payoff' && triggers(st.element, el);
      });
      if (!partner) continue;
    }
    out.add(p.knack);
  }
  return out;
}

/** Job ids of the report's own pieces (the talent section's team share reads the searches). */
const scenId = (card: string) => `report:scenarios:${card}`;
const answersId = (card: string) => `report:answers:${card}`;
const bestId = (mode: string, card: string) => `report:best:${mode}:${card}`;
const casualId = (roster: number, card: string) => `report:casual:${roster}:${card}`;
const WEEKEND_ID = 'report:weekend';

/** One card's column of the scenario table: a cell for each scenario, in the order of `SCENARIOS`. */
export interface ScenarioColumn {
  readonly cells: string[];
  readonly row: Record<string, { damage: number; ko: number }>;
}

/** Every scenario on one card (the first one is the classic line the others are read against). */
export function reportScenarios(cardId: string, quick: boolean): ScenarioColumn {
  const seeds = quick ? 4 : 24;
  const cells: string[] = [];
  const row: Record<string, { damage: number; ko: number }> = {};
  let base = 0;
  for (const [label, spec] of Object.entries(SCENARIOS)) {
    const s = evaluate(bossFor(GAUNTLET, [cardId]), line(spec), GAUNTLET, seeds, `scen:${cardId}`);
    const classic = label.startsWith('Classic:');
    if (classic) base = s.damage;
    cells.push(
      classic
        ? `${r0(s.damage)} (KO ${s.knockouts.toFixed(1)})`
        : `${pct(s.damage, base)} (KO ${s.knockouts.toFixed(1)})`,
    );
    row[label] = { damage: r0(s.damage), ko: s.knockouts };
  }
  return { cells, row };
}

/** One card's intended answers against the classic line: the table rows, and how many of them beat it. */
export interface AnswerRows {
  readonly rows: string[];
  readonly answers: number;
  readonly working: number;
}

export function reportAnswers(cardId: string, quick: boolean): AnswerRows {
  const seeds = quick ? 4 : 24;
  const card = CARDS.find((c) => c.id === cardId);
  const rows: string[] = [];
  let working = 0,
    answers = 0;
  for (const [label, spec] of ANSWERS[cardId] ?? []) {
    const boss = bossFor(GAUNTLET, [cardId]);
    const a = evaluate(boss, line(spec), GAUNTLET, seeds, `ans:${cardId}`);
    const cl = evaluate(boss, CLASSIC_LINE, GAUNTLET, seeds, `ans:${cardId}`);
    answers++;
    if (a.score > cl.score) working++;
    rows.push(
      `| ${card?.name ?? cardId} | ${label} | ${pct(a.score, cl.score)} | ${a.knockouts.toFixed(1)} / ${cl.knockouts.toFixed(1)} |`,
    );
  }
  return { rows, answers, working };
}

/** One search of the best-teams section: the best line and the scores the table reads. */
export interface BestResult {
  readonly bestLine: readonly Pick[];
  readonly bestScore: number;
  readonly classicScore: number;
  /** The top 5 lines (the Knack usage table counts their picks). */
  readonly top: (readonly Pick[])[];
  /** The best score of the classic species with their best Knacks (gauntlet only). */
  readonly classicSpeciesScore: number | undefined;
}

/** The best line for a card in a mode (undefined when the search finds none, or loses the classic line). */
export function reportBest(
  modeId: 'gauntlet' | 'raid',
  cardId: string,
  quick: boolean,
): BestResult | undefined {
  const { gauntlet: sopts, raid: ropts } = searchOptions(quick);
  const mode = modeId === 'raid' ? RAID : GAUNTLET;
  const boss = bossFor(mode, [cardId]);
  const classic = classicFor(mode);
  const ranked = search(boss, mode, {
    seed: `${mode.id}:${cardId}`,
    ...(mode.id === 'raid' ? ropts : sopts),
    include: [classic],
  });
  const best = ranked[0];
  const cl = ranked.find((r) => lineKey(r.line) === lineKey(classic));
  if (!best || !cl) return undefined;
  const cs =
    mode.id === 'gauntlet'
      ? search(boss, mode, {
          seed: `cs:${cardId}`,
          ...sopts,
          pool: poolOf(['tidewing', 'tempestray', 'thornbuck']),
          starts: 60,
          include: [classic],
        })[0]
      : undefined;
  return {
    bestLine: best.line,
    bestScore: best.score.score,
    classicScore: cl.score.score,
    top: ranked.slice(0, 5).map((r) => r.line),
    classicSpeciesScore: cs?.score.score,
  };
}

/** One casual roster on one card: its best gauntlet line, and the scores the table reads. */
export interface CasualResult {
  readonly bestLine: readonly Pick[] | undefined;
  readonly bestScore: number;
  readonly plainScore: number;
  readonly top3Score: number;
}

export function reportCasual(roster: number, cardId: string, quick: boolean): CasualResult {
  const { gauntlet: sopts } = searchOptions(quick);
  const rosters = casualRosters(quick);
  const { pool, top3Line } = rosters[roster] as (typeof rosters)[number];
  const boss = bossFor(GAUNTLET, [cardId]);
  const best = search(boss, GAUNTLET, {
    seed: `casual:${roster}:${cardId}`,
    ...sopts,
    pool,
    include: [top3Line],
  })[0];
  const t3 = evaluate(
    boss,
    top3Line,
    GAUNTLET,
    sopts.freshSeeds,
    `fresh:casual:${roster}:${cardId}`,
  );
  const plainBest = search(boss, GAUNTLET, {
    seed: `casual-plain:${roster}:${cardId}`,
    ...sopts,
    starts: 60,
    pool: pool.filter((p) => p.knack === 'none'),
    include: [top3Line],
  })[0];
  return {
    bestLine: best?.line,
    bestScore: best?.score.score ?? 0,
    plainScore: plainBest?.score.score ?? 0,
    top3Score: t3.score,
  };
}

/** The rows of the raid weekend table. */
export function reportWeekend(quick: boolean): string[] {
  const rows: string[] = [];
  const party = classicFor(RAID);
  const bench = [0, 1, 2, 3].map((i) => ({
    owner: `p${i + 1}`,
    formId: 'kilnmole',
    level: LEVEL,
    knack: 'draw-fire',
    row: 0,
    col: 0,
  }));
  for (const c of ['plain', 'payoff-hunter', 'crusher', 'wither']) {
    let wins = 0,
      reps = 0;
    const kos: number[][] = [];
    const n = quick ? 3 : 10;
    for (let i = 0; i < n; i++) {
      const boss = labBoss({ rows: 3, cols: 4, cards: [c], hp: 30_000, atk: 120, rounds: 8 });
      const w = weekend(boss, toPlacements(party, RAID), bench, {
        rng: createSeededRng(`weekend:${c}:${i}`),
      });
      if (w.won) wins++;
      reps += w.replacements;
      kos.push(w.stages.map((s) => s.knockouts));
    }
    const avg = [0, 1, 2]
      .map((st) => (kos.reduce((a, k) => a + (k[st] ?? 0), 0) / n).toFixed(1))
      .join(' / ');
    rows.push(
      `| ${c} | four classic trios, a Kilnmole each on the bench | ${wins} / ${n} | ${(reps / n).toFixed(1)} | ${avg} |`,
    );
  }
  return rows;
}

/** The best and casual teams the searches found, as the team share reads them (by the same loops the report prints). */
export function teamInputsOf(get: (id: string) => unknown, quick: boolean): TeamInputs {
  const cards = CARDS.filter((c) => !c.raidOnly);
  const maps = {
    gauntlet: new Map<string, readonly Pick[]>(),
    raid: new Map<string, readonly Pick[]>(),
  };
  for (const mode of ['gauntlet', 'raid'] as const)
    for (const c of cards) {
      const b = get(bestId(mode, c.id)) as BestResult | undefined;
      if (b) maps[mode].set(c.id, b.bestLine);
    }
  const casual: { cardId: string; line: readonly Pick[] }[] = [];
  for (const roster of casualRosters(quick))
    for (const cid of CASUAL_CARDS) {
      const r = get(casualId(roster.index, cid)) as CasualResult | undefined;
      if (r?.bestLine) casual.push({ cardId: cid, line: r.bestLine });
    }
  return { ...maps, casual };
}

/**
 * The whole report as jobs. The talent section's team share reads the best-team searches (`teamInputsOf`); everything
 * else is independent, so the order of the list is only a priority (the longest pieces first).
 */
export function planReport(opts: { quick?: boolean } = {}): Plan<Report> {
  const quick = opts.quick ?? false;
  const cards = CARDS.filter((c) => !c.raidOnly);
  const bosses = planBosses({ quick });
  const best: JobSpec[] = (['raid', 'gauntlet'] as const).flatMap((mode) =>
    cards.map((c): JobSpec => ({
      id: bestId(mode, c.id),
      section: 'Best teams per card',
      kind: 'report-best',
      args: { mode, card: c.id, quick },
      needs: [],
    })),
  );
  const casual: JobSpec[] = casualRosters(quick).flatMap((roster) =>
    CASUAL_CARDS.map((cid): JobSpec => ({
      id: casualId(roster.index, cid),
      section: 'A casual roster',
      kind: 'report-casual',
      args: { roster: roster.index, card: cid, quick },
      needs: [],
    })),
  );
  const talents = planTalents({
    cards,
    quick,
    teamNeeds: [...best, ...casual].map((j) => j.id),
  });
  const own: JobSpec[] = [
    ...cards.map((c): JobSpec => ({
      id: scenId(c.id),
      section: 'Scenarios',
      kind: 'report-scenarios',
      args: { card: c.id, quick },
      needs: [],
    })),
    ...cards.map((c): JobSpec => ({
      id: answersId(c.id),
      section: 'Intended answers',
      kind: 'report-answers',
      args: { card: c.id, quick },
      needs: [],
    })),
    ...best,
    ...casual,
    {
      id: WEEKEND_ID,
      section: 'Raid weekend with attrition',
      kind: 'report-weekend',
      args: { quick },
      needs: [],
    },
  ];
  return {
    jobs: [...bosses.jobs, ...talents.jobs, ...own],
    assemble: (results) => assembleReport(quick, results, talents.assemble, bosses.assemble),
  };
}

function assembleReport(
  quick: boolean,
  results: JobResults,
  talentsOf: (results: JobResults) => TalentSection,
  bossesOf: (results: JobResults) => BossSections,
): Report {
  const seeds = quick ? 4 : 24;
  const md: string[] = [];
  const data: Record<string, unknown> = {};
  const cards = CARDS.filter((c) => !c.raidOnly);
  md.push('# Combat v2 lab report', '');
  md.push(
    `Generated by \`pnpm --filter @creatures/lab report${quick ? ' -- --quick' : ''}\`. A prototype of the draft rules (\`packages/lab\`), not the shipped engine. Level ${LEVEL} creatures (stage 1 forms at their cap), a neutral boss with huge HP: damage over 10 rounds, and a wipe ends the fight. Teams are ranked by damage weighted by how many creatures still stand (a wipe counts half). Top lines are re-scored on fresh seeds. Knobs: Payoff x${LAB_RULES.payoffMultBp / 10_000}, armour per species (\`src/armour.ts\`, Guards highest), boss armour 20.`,
    '',
  );

  // 1. Scenarios.
  md.push(
    '## Scenarios (gauntlet: one row of three)',
    '',
    `Mean damage over ${seeds} seeds. Percent is against the classic line on the same card; KO is knockouts per fight.`,
    '',
  );
  md.push(
    `| Line | ${cards.map((c) => c.name).join(' | ')} |`,
    `| --- | ${cards.map(() => '---:').join(' | ')} |`,
  );
  const columns = cards.map((c) => results.get(scenId(c.id)) as ScenarioColumn);
  const scen: Record<string, Record<string, unknown>> = {};
  Object.keys(SCENARIOS).forEach((label, i) => {
    const row: Record<string, unknown> = {};
    cards.forEach((c, k) => (row[c.id] = columns[k]?.row[label]));
    scen[label] = row;
    md.push(`| ${label} | ${columns.map((col) => col?.cells[i]).join(' | ')} |`);
  });
  data['scenarios'] = scen;
  md.push('');

  // 2. Do the intended answers work?
  md.push(
    "## Do each card's intended answers work? (gauntlet)",
    '',
    'An answer works when it beats the classic line on its own card. If it does not, its icon would point a player at a losing pick (P-08): retune it or do not show the icon.',
    '',
    '| Card | Answer | vs classic | KO (answer / classic) |',
    '| --- | --- | ---: | --- |',
  );
  let working = 0,
    answers = 0;
  for (const c of cards) {
    const a = results.get(answersId(c.id)) as AnswerRows;
    md.push(...a.rows);
    working += a.working;
    answers += a.answers;
  }
  md.push(
    '',
    `**${working} of ${answers} intended answers beat the classic line on their card.**`,
    '',
    `No intended answer yet: ${cards
      .filter((c) => c.id !== 'plain' && !(ANSWERS[c.id]?.length ?? 0))
      .map((c) => c.name)
      .join(
        ', ',
      )}. Shake It Off only costs a debuff build something (Mired x5 is -15% boss damage, and Mire has no Setter or Payoff yet), so the classic line is not hurt by it and no Mire team beats the classic line on it; its answer is a team that does not lean on a debuff.`,
    '',
  );

  // 3. Best teams per card.
  // Knack picks per creature in the top lines (Leave a Trail only with a Payoff to cash its trail).
  const appear = new Map<string, number>(
    [...Object.keys(KNACKS), 'none'].map((k) => [k, 0] as [string, number]),
  );
  let picks = 0;
  let classicBeaten = 0,
    classicSpeciesBeaten = 0;
  const bestSpecies = new Map<string, number>();
  const perCard: Record<string, unknown> = {};
  for (const mode of [GAUNTLET, RAID] as Mode[]) {
    md.push(
      `## Best teams per card: ${mode.id === 'gauntlet' ? 'gauntlet (one row of three)' : 'raid (3 rows x 4, four players)'}`,
      '',
    );
    md.push(
      mode.id === 'gauntlet'
        ? '| Card | Best line | Score | Classic | Classic species, best Knacks |\n| --- | --- | ---: | ---: | ---: |'
        : '| Card | Best line | Score | Classic |\n| --- | --- | ---: | ---: |',
    );
    for (const c of cards) {
      const found = results.get(bestId(mode.id, c.id)) as BestResult | undefined;
      if (!found) continue;
      for (const top of found.top) {
        const useful = usefulKnacks(top);
        for (const p of top) {
          picks++;
          if (useful.has(p.knack)) appear.set(p.knack, (appear.get(p.knack) ?? 0) + 1);
        }
      }
      let extra = '';
      if (mode.id === 'gauntlet') {
        for (const p of found.bestLine)
          bestSpecies.set(p.formId, (bestSpecies.get(p.formId) ?? 0) + 1);
        const cs = found.classicSpeciesScore;
        if (found.classicScore < found.bestScore * 0.9) classicBeaten++;
        if (cs !== undefined && cs < found.bestScore * 0.9) classicSpeciesBeaten++;
        extra = ` | ${cs !== undefined ? pct(cs, found.bestScore) : 'n/a'}`;
      }
      const shown =
        mode.id === 'gauntlet' ? found.bestLine.map(name).join(', ') : summarise(found.bestLine);
      md.push(
        `| ${c.name} | ${shown} | ${r0(found.bestScore)} | ${pct(found.classicScore, found.bestScore)}${extra} |`,
      );
      perCard[`${mode.id}:${c.id}`] = {
        best: found.bestLine,
        score: r0(found.bestScore),
        classic: r0(found.classicScore),
      };
    }
    md.push('');
  }
  data['perCard'] = perCard;
  md.push(
    `**The classic line is more than 10% behind the best gauntlet line on ${classicBeaten} of ${cards.length} cards; the classic species with their best Knacks and order on ${classicSpeciesBeaten} of ${cards.length}.** (Target: at least half.)`,
    '',
  );

  // 4. Diversity.
  const species = [...bestSpecies.entries()].sort((a, b) => b[1] - a[1]);
  md.push(
    '## Diversity of the best gauntlet lines',
    '',
    `${species.length} different forms appear across the ${cards.length} best lines. Most common: ${species
      .slice(0, 5)
      .map(([f, n]) => `${f} (${n})`)
      .join(', ')}. A form in nearly every best line is a new "top three" (P-11).`,
    '',
  );
  data['diversity'] = Object.fromEntries(species);

  // 5. Knack usage.
  const pool = poolOf();
  const poolShare = (k: string) => pool.filter((p) => p.knack === k).length / pool.length;
  const rows = [...appear.entries()]
    .map(([k, n]) => ({ k, n, ratio: n / Math.max(1, picks) / poolShare(k) }))
    .sort((a, b) => b.ratio - a.ratio);
  md.push(
    '## Knack usage in the top 5 teams of every search (per creature)',
    '',
    `${picks} creatures in the top 5 lines of every search (${cards.length} cards, gauntlet and raid). Ratio is the Knack's share of those picks over its share of the pool of every form and Knack: 1.0 is what random picks would give, above 2 stands out, below 0.3 is rarely chosen. Leave a Trail counts only when another Payoff in the line can cash its mark. Never chosen: rework candidates. Far above the rest: needs a counter card (P-10).`,
    '',
    '| Knack | Forms | Picks | Ratio |',
    '| --- | --- | ---: | ---: |',
  );
  for (const { k, n, ratio } of rows)
    md.push(
      `| ${knackName(k)} | ${
        k === 'none'
          ? 'any'
          : Object.entries(FORM_KNACKS)
              .filter(([, ks]) => ks.includes(k))
              .map(([f]) => f)
              .join(', ')
      } | ${n} | ${ratio.toFixed(1)} |`,
    );
  data['knackUsage'] = Object.fromEntries(
    rows.map((r) => [r.k, { picks: r.n, ratio: Math.round(r.ratio * 100) / 100 }]),
  );
  md.push('');

  // 6. A casual roster: does the best line use creatures beyond the top three by level?
  md.push(
    '## A casual roster (the North Star metric)',
    '',
    'Twelve random forms at random levels (8 to 25, stage 1 forms at their cap), with any of their Knacks. For each card: the best gauntlet line from that roster, the best line from the same roster with no Knacks (what a player who never opens Knacks could bring, P-14), and the three highest levels with no Knack. Scores are absolute. Beyond top 3 is how many of the best line are not among the three highest levels.',
    '',
    '| Roster | Card | Best line | Score | Best, no Knacks | Top 3 by level | Beyond top 3 |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: |',
  );
  let beyond = 0,
    trials = 0;
  for (const roster of casualRosters(quick)) {
    const { index: r, top3 } = roster;
    for (const cid of CASUAL_CARDS) {
      const res = results.get(casualId(r, cid)) as CasualResult;
      if (!res.bestLine) continue;
      const n = res.bestLine.filter((p) => !top3.includes(p.formId)).length;
      beyond += n;
      trials++;
      md.push(
        `| ${r + 1} | ${cid} | ${res.bestLine.map((p) => `${name(p)} L${p.level ?? LEVEL}`).join(', ')} | ${r0(res.bestScore)} | ${r0(res.plainScore)} | ${r0(res.top3Score)} | ${n} |`,
      );
    }
  }
  md.push(
    '',
    `**On average ${(beyond / Math.max(1, trials)).toFixed(1)} of the 3 creatures in the best line are outside the player's top three by level.**`,
    '',
  );

  // 7. Talents: best legal board with the talent against best legal board without it.
  const talentSection = talentsOf(results);
  md.push(...talentSection.md);
  Object.assign(data, talentSection.data);

  // 8. Element coverage (P-12): every element should have the same kinds of tools.
  md.push(
    '## Element coverage (P-12)',
    '',
    'Every element should have a Heavy Prime Setter, a Setter Knack that survives the front row (today only Evasion), and a Payoff with a Detonator. A gap makes another element the default for every Detonator team.',
    '',
    '| Element | Heavy Prime Setters | Evasion Setters | Detonator Payoffs |',
    '| --- | --- | --- | --- |',
  );
  const famForms = (el: string, role: string, fams: readonly string[]) =>
    Object.entries(FORM_KNACKS)
      .filter(([f]) => formStats(f, LEVEL).element === el && formStats(f, LEVEL).role === role)
      .flatMap(([f, ks]) =>
        ks
          .filter((k) => fams.includes(KNACKS[k]?.family ?? ''))
          .map((k) => `${f} (${knackName(k)})`),
      );
  const coverage: Record<string, unknown> = {};
  for (const el of ELEMENTS) {
    const heavy = famForms(el, 'setter', ['Heavy Prime']);
    const survive = famForms(el, 'setter', ['Evasion']);
    const det = famForms(el, 'payoff', ['Detonator']);
    coverage[el] = { heavy, survive, det };
    md.push(
      `| ${el} | ${heavy.join(', ') || '**none**'} | ${survive.join(', ') || '**none**'} | ${det.join(', ') || '**none**'} |`,
    );
  }
  data['coverage'] = coverage;
  md.push('');

  // 9. Text length (P-08): a Knack or talent should fit two lines on a 390 px card.
  const long = [...Object.values(KNACKS), ...Object.values(TALENTS)]
    .map((t) => ({ name: t.name, len: t.text.replace(/[{}]/g, '').length }))
    .filter((t) => t.len > TEXT_BUDGET)
    .sort((a, b) => b.len - a.len);
  md.push(
    '## Texts over the two-line budget',
    '',
    `About ${TEXT_BUDGET} characters fit two lines on a 390 px card (an estimate; check in the workbench). ${long.length ? 'Over it:' : 'None over it.'}`,
    '',
    ...long.map((t) => `- ${t.name}: ${t.len}`),
    '',
  );

  // 10. A raid weekend with attrition.
  md.push(
    '## Raid weekend with attrition (3 stages of 8 rounds, HP carries, knocked-out creatures stay out)',
    '',
    '| Boss card | Party | Won | Replacements | Knockouts per stage |',
    '| --- | --- | ---: | ---: | --- |',
  );
  md.push(...(results.get(WEEKEND_ID) as string[]));
  // 11. The real bosses and foes (after the controlled lab-boss tests above).
  const bossSections = bossesOf(results);
  md.push(...bossSections.md);
  Object.assign(data, bossSections.data);

  md.push(
    '',
    '## What this cannot tell',
    '',
    '- It is a prototype: gear, heal crits on screen and the raid board UI are simplified or missing; talents are measured one at a time in the per-talent table, and as a share of the team result (one talent per creature, never searched with the Knacks).',
    '- Mire has no Setter or Payoff yet, so its reactions never happen here.',
    '- Searches are random plus local improvement; a missing team is not proof that it is weak.',
    '- The raid search uses 3 rows of 4 (four players); real servers place up to 15 per row, first come first served. The real bosses have their own arenas (2 to 4 rows of 4).',
    '- The real bosses and foes are lab data tuned to this report: the best teams and the intended answers are found by seeded searches over a weekend or a run, so a missing team is not proof that it is weak, and the answers are lines written down from those searches. Talent answers are read against the classic party with the same talent.',
    '- Fun is not in the numbers. Use this to find outliers and dead options, then test feel in the game.',
    '',
  );
  return { markdown: md.join('\n'), data };
}

/** The Knack catalogue, generated from the data so the text never drifts from what the lab runs. */
export function buildCatalogue(): string {
  const md: string[] = [
    '# Knack catalogue (generated)',
    '',
    'Generated from `packages/lab/src/knacks.ts` by `pnpm --filter @creatures/lab report`. Do not edit by hand: change the data and regenerate. Keywords in braces are defined in `keywords.md`.',
    '',
  ];
  md.push('## Families', '', '| Family | Rule | Knacks |', '| --- | --- | --- |');
  for (const [fam, rule] of Object.entries(FAMILIES))
    md.push(
      `| ${fam} | ${rule} | ${Object.values(KNACKS)
        .filter((k) => k.family === fam)
        .map((k) => k.name)
        .join(', ')} |`,
    );
  md.push('');
  const byForm = Object.entries(FORM_KNACKS);
  md.push('## By form', '', '| Form | Knacks |', '| --- | --- |');
  for (const [form, ks] of byForm)
    md.push(`| ${form} | ${ks.map((k) => KNACKS[k]?.name ?? k).join(', ')} |`);
  md.push('', '## Knacks', '');
  for (const k of Object.values(KNACKS)) {
    const forms = byForm
      .filter(([, ks]) => ks.includes(k.id))
      .map(([f]) => f)
      .join(', ');
    md.push(
      `### ${k.name}`,
      '',
      `- **Text:** ${k.text}`,
      `- **Family:** ${k.family}`,
      `- **Forms:** ${forms || 'none yet'}`,
      `- **Intent (for contributors, never shown to players):** ${k.intent}`,
      '',
    );
  }
  md.push(
    '## Combat talents',
    '',
    "Generated from `packages/lab/src/talents.ts`. One shared library; each line links to its own pool (branch forms share it). A talent that does nothing for a form's role is idle on it (in brackets). One name per effect; a talent never repeats a Knack's effect.",
    '',
    '| Line | Pool |',
    '| --- | --- |',
  );
  for (const ln of Object.keys(LINE_POOLS))
    md.push(
      `| ${ln} | ${talentPool(ln)
        .map((e) => {
          const nm = TALENTS[e.talent]?.name ?? e.talent;
          return e.roles.length ? nm : `(${nm})`;
        })
        .join(', ')} |`,
    );
  md.push('', '| Talent | Text | Roles | Intent |', '| --- | --- | --- | --- |');
  for (const t of Object.values(TALENTS))
    md.push(`| ${t.name} | ${t.text} | ${t.roles.join(', ')} | ${t.intent} |`);
  md.push('');
  return md.join('\n');
}

/** The keyword reference, generated from `src/keywords.ts` (one definition per keyword). */
export function buildKeywords(): string {
  const md = [
    '# Combat v2 keywords (generated)',
    '',
    "Generated from `packages/lab/src/keywords.ts` by `pnpm --filter @creatures/lab report`; do not edit by hand. A test checks that every `{Keyword}` in a Knack's text exists there. In the game, every keyword opens its definition on tap or hover.",
    '',
    '| Keyword | Means | Does not mean | Rule |',
    '| --- | --- | --- | --- |',
  ];
  for (const [k, v] of Object.entries(KEYWORDS))
    md.push(`| ${k} | ${v.means} | ${v.not} | ${v.step} |`);
  return md.join('\n');
}

/** A raid line in short: counts of form (Knack). */
function summarise(l: readonly Pick[]): string {
  const n = new Map<string, number>();
  for (const p of l) n.set(name(p), (n.get(name(p)) ?? 0) + 1);
  return [...n.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, c]) => `${c}x ${k}`)
    .join(', ');
}

/** The two-line budget for a Knack or talent text, in characters (an estimate). */
const TEXT_BUDGET = 95;

export type { Ranked };

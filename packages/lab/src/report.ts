/**
 * The lab report: scenarios from the design library, whether each card's intended answers work,
 * the best-team search per rule card, species diversity, Knack usage, a casual roster and a raid
 * weekend with attrition. Written to docs/design/combat/lab-report.md by
 * `pnpm --filter @creatures/lab report`.
 */
import { content, createSeededRng, int } from '@creatures/game';
import { CARDS, labBoss } from './cards';
import { weekend } from './fight';
import { KEYWORDS } from './keywords';
import { FAMILIES, FORM_KNACKS, KNACKS } from './knacks';
import {
  SCORE_WEIGHTS,
  bestOnMostCards,
  classicBossHp,
  createMeasurer,
  gainPercent,
  type Cell,
  type FormMeasure,
} from './measure';
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

export function buildReport(opts: { quick?: boolean } = {}): Report {
  const seeds = opts.quick ? 4 : 24;
  const sopts = opts.quick
    ? { starts: 60, keep: 10, rounds: 2, seeds: 3, freshSeeds: 4 }
    : { starts: 400, keep: 40, rounds: 4, seeds: 6, freshSeeds: 24 };
  const ropts = opts.quick
    ? { starts: 30, keep: 6, rounds: 1, seeds: 2, freshSeeds: 2 }
    : { starts: 300, keep: 24, rounds: 5, seeds: 3, freshSeeds: 8 };
  const md: string[] = [];
  const data: Record<string, unknown> = {};
  const cards = CARDS.filter((c) => c.id !== 'adapts');
  md.push('# Combat v2 lab report', '');
  md.push(
    `Generated by \`pnpm --filter @creatures/lab report${opts.quick ? ' -- --quick' : ''}\`. A prototype of the draft rules (\`packages/lab\`), not the shipped engine. Level ${LEVEL} creatures (stage 1 forms at their cap), a neutral boss with huge HP: damage over 10 rounds, and a wipe ends the fight. Teams are ranked by damage weighted by how many creatures still stand (a wipe counts half). Top lines are re-scored on fresh seeds. Knobs: Payoff x${LAB_RULES.payoffMultBp / 10_000}, Guard armour ${LAB_RULES.armourByRole['guard'] ?? 0}, boss armour 20.`,
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
  const base: Record<string, number> = {};
  const scen: Record<string, Record<string, unknown>> = {};
  for (const [label, spec] of Object.entries(SCENARIOS)) {
    const cells: string[] = [];
    const row: Record<string, unknown> = {};
    for (const c of cards) {
      const s = evaluate(bossFor(GAUNTLET, [c.id]), line(spec), GAUNTLET, seeds, `scen:${c.id}`);
      const classic = label.startsWith('Classic:');
      if (classic) base[c.id] = s.damage;
      cells.push(
        classic
          ? `${r0(s.damage)} (KO ${s.knockouts.toFixed(1)})`
          : `${pct(s.damage, base[c.id] ?? 0)} (KO ${s.knockouts.toFixed(1)})`,
      );
      row[c.id] = { damage: r0(s.damage), ko: s.knockouts };
    }
    scen[label] = row;
    md.push(`| ${label} | ${cells.join(' | ')} |`);
  }
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
    for (const [label, spec] of ANSWERS[c.id] ?? []) {
      const boss = bossFor(GAUNTLET, [c.id]);
      const a = evaluate(boss, line(spec), GAUNTLET, seeds, `ans:${c.id}`);
      const cl = evaluate(boss, CLASSIC_LINE, GAUNTLET, seeds, `ans:${c.id}`);
      answers++;
      if (a.score > cl.score) working++;
      md.push(
        `| ${c.name} | ${label} | ${pct(a.score, cl.score)} | ${a.knockouts.toFixed(1)} / ${cl.knockouts.toFixed(1)} |`,
      );
    }
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
  const classicPool = poolOf(['tidewing', 'tempestray', 'thornbuck']);
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
      const boss = bossFor(mode, [c.id]);
      const classic = classicFor(mode);
      const ranked = search(boss, mode, {
        seed: `${mode.id}:${c.id}`,
        ...(mode.id === 'raid' ? ropts : sopts),
        include: [classic],
      });
      const best = ranked[0];
      const cl = ranked.find((r) => lineKey(r.line) === lineKey(classic));
      if (!best || !cl) continue;
      for (const r of ranked.slice(0, 5)) {
        const useful = usefulKnacks(r.line);
        for (const p of r.line) {
          picks++;
          if (useful.has(p.knack)) appear.set(p.knack, (appear.get(p.knack) ?? 0) + 1);
        }
      }
      let extra = '';
      if (mode.id === 'gauntlet') {
        for (const p of best.line) bestSpecies.set(p.formId, (bestSpecies.get(p.formId) ?? 0) + 1);
        const cs = search(boss, mode, {
          seed: `cs:${c.id}`,
          ...sopts,
          pool: classicPool,
          starts: 60,
          include: [classic],
        })[0];
        if (cl.score.score < best.score.score * 0.9) classicBeaten++;
        if (cs && cs.score.score < best.score.score * 0.9) classicSpeciesBeaten++;
        extra = ` | ${cs ? pct(cs.score.score, best.score.score) : 'n/a'}`;
      }
      const shown = mode.id === 'gauntlet' ? best.line.map(name).join(', ') : summarise(best.line);
      md.push(
        `| ${c.name} | ${shown} | ${r0(best.score.score)} | ${pct(cl.score.score, best.score.score)}${extra} |`,
      );
      perCard[`${mode.id}:${c.id}`] = {
        best: best.line,
        score: r0(best.score.score),
        classic: r0(cl.score.score),
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
  const forms = Object.keys(FORM_KNACKS);
  const rng = createSeededRng('casual');
  let beyond = 0,
    trials = 0;
  for (let r = 0; r < (opts.quick ? 1 : 4); r++) {
    const roster = new Map<string, number>();
    while (roster.size < 12)
      roster.set(forms[int(rng, forms.length)] ?? 'tidewing', 8 + int(rng, 18));
    const lv = (f: string) => Math.min(roster.get(f) ?? 1, formStats(f, 30).levelCap);
    const pool = poolOf([...roster.keys()]).map((p) => ({ ...p, level: lv(p.formId) }));
    const top3 = [...roster.keys()].sort((a, b) => lv(b) - lv(a)).slice(0, 3);
    const top3Line = top3.map((f) => ({ formId: f, knack: 'none', level: lv(f) }));
    for (const cid of ['plain', 'thick-hide', 'payoff-hunter', 'elusive']) {
      const boss = bossFor(GAUNTLET, [cid]);
      const best = search(boss, GAUNTLET, {
        seed: `casual:${r}:${cid}`,
        ...sopts,
        pool,
        include: [top3Line],
      })[0];
      const t3 = evaluate(boss, top3Line, GAUNTLET, sopts.freshSeeds, `fresh:casual:${r}:${cid}`);
      const plainBest = search(boss, GAUNTLET, {
        seed: `casual-plain:${r}:${cid}`,
        ...sopts,
        starts: 60,
        pool: pool.filter((p) => p.knack === 'none'),
        include: [top3Line],
      })[0];
      if (!best) continue;
      const n = best.line.filter((p) => !top3.includes(p.formId)).length;
      beyond += n;
      trials++;
      md.push(
        `| ${r + 1} | ${cid} | ${best.line.map((p) => `${name(p)} L${p.level ?? LEVEL}`).join(', ')} | ${r0(best.score.score)} | ${r0(plainBest?.score.score ?? 0)} | ${r0(t3.score)} | ${n} |`,
      );
    }
  }
  md.push(
    '',
    `**On average ${(beyond / Math.max(1, trials)).toFixed(1)} of the 3 creatures in the best line are outside the player's top three by level.**`,
    '',
  );

  // 7. Talents: best legal board with the talent against best legal board without it.
  const talentSeeds = opts.quick ? 2 : 16;
  const bossHp = classicBossHp(TALENT_BOSS_ROUNDS, opts.quick ? 6 : 24);
  const measurer = createMeasurer({
    bossHp,
    cards,
    seeds: talentSeeds,
    rowSeeds: opts.quick ? 6 : 24,
  });
  md.push(
    '## Talents: best board with it against best board without it (gauntlet)',
    '',
    `**The boss.** Its HP is ${bossHp.toLocaleString('en')}, calibrated at report time so that the classic line kills a plain boss in about ${TALENT_BOSS_ROUNDS} of the 10 rounds on average, so the length of the fight matters (the boss of the other sections has a million HP, so fights always last ten rounds there).`,
    '',
    `**The score** of one fight, 0 to 100: ${SCORE_WEIGHTS.damage} for the share of the boss's HP removed, ${SCORE_WEIGHTS.win} for a win, up to ${SCORE_WEIGHTS.speed} for the rounds a win left unused (fewer rounds is better), and up to ${SCORE_WEIGHTS.standing} for the share of the three creatures still standing (a knockout costs ${SCORE_WEIGHTS.standing / 3} points). A talent that saves creatures or ends the fight sooner shows it.`,
    '',
    `**The boards.** Every form whose line's pool has the talent and whose role it fits, with no Knack on the measured form (the Mire talents carry the line's Mire Knack, with and without, because they do nothing without one). The form stands in each of the three slots with two fixed fitting partners in either order, for two partner sets (the natural team's partners, and the classic trio's two other roles with their classic Knacks): up to 12 legal boards. The score is the best board with the talent and the best board without it, each chosen on its own, on every card (${talentSeeds} seeds each, the same seeds for every board), averaged over those forms and cards. Gain is the difference in points; the percentage is against the best score without it and reads n/a when that is under ${MIN_BASE} points. Knockouts are per fight (with / without), on the best board of each. Nothing here forces a board for a talent: a position talent pays for standing where it wants to.`,
    '',
    `**Holds** is the share of fights in which the talent's condition held or its trigger fired at least once, on the form's natural board (every card, no board chosen for it) and in a row 12 wide (the form at a random slot among mixed classic creatures, plain card, a boss with four times the HP; this is the raid rate for position talents). Flat stats always hold. **Best card** is where it gains most. A talent that is top of its role on most cards is flagged "best on most cards" and is a new default pick.`,
    '',
    '| Role | Talent | Best with | Best without | Gain | Gain % | Knockouts with / without | Holds (natural) | Holds (row of 12) | Best card | Flag |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |',
  );
  const talentValue: Record<string, unknown> = {};
  const signed = (x: number, d = 1) => `${x >= 0 ? '+' : ''}${x.toFixed(d)}`;
  const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const topPicks: string[] = [];
  const rangeGains: number[] = [];
  for (const role of ['setter', 'payoff', 'guard', 'support'] as const) {
    const roleForms = Object.keys(FORM_KNACKS).filter((f) => formStats(f, LEVEL).role === role);
    const gains = new Map<string, Map<string, number>>();
    const rows: { tid: string; cells: string[] }[] = [];
    for (const tid of Object.keys(TALENTS).filter((t) => TALENTS[t]?.roles.includes(role))) {
      const forms = roleForms.filter((f) => LINE_POOLS[lineOf(f)]?.includes(tid));
      if (forms.length === 0) continue;
      const ms = forms.map((f) => measurer.measure(tid, f));
      const cell = (m: FormMeasure, cid: string) => ({
        w: m.withTalent.get(cid),
        o: m.without.get(cid),
      });
      const byCard = new Map<string, number>();
      for (const c of cards)
        byCard.set(
          c.id,
          mean(ms.map((m) => (cell(m, c.id).w?.score ?? 0) - (cell(m, c.id).o?.score ?? 0))),
        );
      gains.set(tid, byCard);
      const all = (pick: (c: { w: Cell | undefined; o: Cell | undefined }) => number | undefined) =>
        ms.flatMap((m) => cards.map((c) => pick(cell(m, c.id)) ?? 0));
      const withScore = mean(all((c) => c.w?.score));
      const withoutScore = mean(all((c) => c.o?.score));
      const koWith = mean(all((c) => c.w?.ko));
      const koWithout = mean(all((c) => c.o?.ko));
      const gain = withScore - withoutScore;
      const gainPct = gainPercent(withScore, withoutScore, MIN_BASE);
      rangeGains.push(gain);
      const [bestCard, bestV] = [...byCard.entries()].sort((x, y) => y[1] - x[1])[0] ?? ['', 0];
      const defined = (xs: (number | undefined)[]) =>
        xs.length && xs.every((x) => x !== undefined) ? mean(xs) : undefined;
      const holdsNat = defined(ms.map((m) => m.holdsNatural));
      const holdsRow = defined(ms.map((m) => m.holdsRow));
      const share = (x: number | undefined) =>
        x === undefined ? 'always' : `${Math.round(x * 100)}%`;
      talentValue[`${role}/${tid}`] = {
        forms: forms.length,
        withScore: Math.round(withScore * 10) / 10,
        withoutScore: Math.round(withoutScore * 10) / 10,
        gain: Math.round(gain * 100) / 100,
        gainPercent: gainPct === undefined ? null : Math.round(gainPct * 10) / 10,
        koWith: Math.round(koWith * 100) / 100,
        koWithout: Math.round(koWithout * 100) / 100,
        holdsNatural: holdsNat === undefined ? 'always' : Math.round(holdsNat * 100) / 100,
        holdsRow: holdsRow === undefined ? 'always' : Math.round(holdsRow * 100) / 100,
        best: bestCard,
      };
      rows.push({
        tid,
        cells: [
          role,
          TALENTS[tid]?.name ?? tid,
          withScore.toFixed(1),
          withoutScore.toFixed(1),
          signed(gain),
          gainPct === undefined ? 'n/a' : `${signed(gainPct)}%`,
          `${koWith.toFixed(2)} / ${koWithout.toFixed(2)}`,
          share(holdsNat),
          share(holdsRow),
          bestV > 0.5
            ? `${CARDS.find((c) => c.id === bestCard)?.name ?? bestCard} ${signed(bestV)}`
            : 'none',
        ],
      });
    }
    const tops = new Set(
      bestOnMostCards(
        gains,
        cards.map((c) => c.id),
      ),
    );
    for (const r of rows) {
      md.push(`| ${r.cells.join(' | ')} | ${tops.has(r.tid) ? 'best on most cards' : ''} |`);
      if (tops.has(r.tid)) topPicks.push(`${TALENTS[r.tid]?.name ?? r.tid} (${role})`);
    }
  }
  data['talentValue'] = talentValue;
  data['talentBoss'] = { hp: bossHp, targetRounds: TALENT_BOSS_ROUNDS, seeds: talentSeeds };
  data['talentTopPicks'] = topPicks;
  md.push(
    '',
    `**Talent gain range:** ${signed(Math.min(...rangeGains))} to ${signed(Math.max(...rangeGains))} points of 100. **Best on most cards of its role:** ${topPicks.length ? topPicks.join(', ') : 'none'}.`,
    '',
  );

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
    const n = opts.quick ? 3 : 10;
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
    md.push(
      `| ${c} | four classic trios, a Kilnmole each on the bench | ${wins} / ${n} | ${(reps / n).toFixed(1)} | ${avg} |`,
    );
  }
  md.push(
    '',
    '## What this cannot tell',
    '',
    '- It is a prototype: gear, heal crits on screen and the raid board UI are simplified or missing; talents are measured one at a time, never in the best-team search.',
    '- Mire has no Setter or Payoff yet, so its reactions never happen here.',
    '- Searches are random plus local improvement; a missing team is not proof that it is weak.',
    '- The raid search uses 3 rows of 4 (four players); real servers place up to 15 per row, first come first served.',
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

/** The rounds in which the classic line should kill a plain boss on average, which sets the talent boss's HP. */
const TALENT_BOSS_ROUNDS = 8;

/** A best score without a talent below this many points (of 100) gives no percentage: "n/a". */
const MIN_BASE = 10;

/** The two-line budget for a Knack or talent text, in characters (an estimate). */
const TEXT_BUDGET = 95;

const lineOf = (form: string) => content.creatures.find((c) => c.id === form)?.line ?? form;

export type { Ranked };

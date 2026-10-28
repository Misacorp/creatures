/**
 * The lab report: scenarios from the design library, whether each card's intended answers work,
 * the best-team search per rule card, species diversity, Knack usage, a casual roster and a raid
 * weekend with attrition. Written to docs/design/combat/lab-report.md by
 * `pnpm --filter @creatures/lab report`.
 */
import { content, createSeededRng, int, type Rng } from '@creatures/game';
import { CARDS, labBoss, type CardDef } from './cards';
import { fight, weekend } from './fight';
import { KEYWORDS } from './keywords';
import { FAMILIES, FORM_KNACKS, KNACKS } from './knacks';
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

  // 7. Talents: what one talent on one creature adds.
  md.push(
    '## Talents: what one talent adds (gauntlet)',
    '',
    `Each talent on every form whose line's pool has it and whose role it fits, in a fitting team with the form in its role's natural slot (a Setter or Guard in front, a Payoff after its Setter, a Support in the middle), no Knack on the measured form and the partners' first Knacks. A few talents need a board that shows them (see "Boards" below). Damage and knockouts with the talent against the same team without it, on every card (${seeds} seeds each, the same seed for both), as total damage with it over total damage without, pooled over those forms. **Holds** is the share of fights in which its condition held or its trigger fired at least once (flat stats always hold). **While it holds** is the damage gain in those fights only, so a conditional talent can be read against a flat one: the budget rule says value while on, times how often it is on, should land near the same average (P-10: spiky, not flat). Best card is where it helps most. Near 0% on damage and KO is a dud; far above the rest is a must-roll.`,
    '',
    '| Role | Talent | Damage | KO per fight | Holds | While it holds | Best card |',
    '| --- | --- | ---: | ---: | ---: | ---: | --- |',
  );
  const talentValue: Record<string, unknown> = {};
  // Which talent is best on each card, per role: a talent that is best on most cards is a new "top pick".
  const bestOnCard = new Map<string, Map<string, { tid: string; v: number }>>();
  const signed = (x: number, d = 1) => `${x >= 0 ? '+' : ''}${x.toFixed(d)}`;
  for (const role of ['setter', 'payoff', 'guard', 'support'] as const) {
    const roleForms = Object.keys(FORM_KNACKS).filter((f) => formStats(f, LEVEL).role === role);
    for (const tid of Object.keys(TALENTS).filter((t) => TALENTS[t]?.roles.includes(role))) {
      const forms = roleForms.filter((f) => LINE_POOLS[lineOf(f)]?.includes(tid));
      if (forms.length === 0) continue;
      const m = measureTalent(tid, forms, cards, seeds);
      const [bestCard, bestV] = [...m.byCard.entries()].sort((x, y) => y[1] - x[1])[0] ?? ['', 0];
      if (!TALENT_NO_VALUE.has(tid))
        for (const [cid, v] of m.byCard) {
          const roleBest = bestOnCard.get(role) ?? new Map<string, { tid: string; v: number }>();
          if (v > (roleBest.get(cid)?.v ?? -Infinity)) roleBest.set(cid, { tid, v });
          bestOnCard.set(role, roleBest);
        }
      talentValue[`${role}/${tid}`] = {
        damage: Math.round(m.damage * 1000) / 1000,
        ko: Math.round(m.ko * 100) / 100,
        holds: m.holds === undefined ? 'always' : Math.round(m.holds * 100) / 100,
        whileHolding:
          m.whileHolding === undefined ? null : Math.round(m.whileHolding * 1000) / 1000,
        best: bestCard,
      };
      const none = TALENT_NO_VALUE.has(tid);
      md.push(
        `| ${role} | ${TALENTS[tid]?.name ?? tid} | ${none ? 'n/a' : `${signed(m.damage * 100)}%`} | ${none ? 'n/a' : signed(m.ko, 2)} | ${m.holds === undefined ? 'always' : `${Math.round(m.holds * 100)}%`} | ${none || m.whileHolding === undefined ? '-' : `${signed(m.whileHolding * 100)}%`} | ${none ? 'killing blow' : bestV > 0.005 ? `${CARDS.find((c) => c.id === bestCard)?.name ?? bestCard} ${signed(bestV * 100)}%` : 'none'} |`,
      );
    }
  }
  data['talentValue'] = talentValue;
  // Flag a talent that is best on most cards of its role.
  const topPicks: string[] = [];
  for (const [role, perCard] of bestOnCard) {
    const wins = new Map<string, number>();
    for (const { tid } of perCard.values()) wins.set(tid, (wins.get(tid) ?? 0) + 1);
    const [top, n] = [...wins.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
    if (n * 2 > cards.length)
      topPicks.push(`${TALENTS[top]?.name ?? top} (${role}, ${n} of ${cards.length})`);
  }
  data['talentTopPicks'] = topPicks;
  const values = Object.entries(talentValue as Record<string, { damage: number }>)
    .filter(([k]) => !TALENT_NO_VALUE.has(k.split('/')[1] ?? ''))
    .map(([, v]) => v.damage);
  md.push(
    '',
    `**Talent value range:** ${signed(Math.min(...values) * 100)}% to ${signed(Math.max(...values) * 100)}% damage. **Best on most cards of its role:** ${topPicks.length ? topPicks.join(', ') : 'none'}.`,
    '',
    `Boards: ${Object.entries(BOARD_NOTES)
      .map(([t, note]) => `${TALENTS[t]?.name ?? t} ${note}`)
      .join('; ')}.`,
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

/** Talents with no damage value: they decide who lands the killing blow, not how much damage is done. */
const TALENT_NO_VALUE: ReadonlySet<string> = new Set(['cull']);

/** Effect fields that are plain stats (always on): no condition to count. */
const FLAT_FIELDS: ReadonlySet<string> = new Set(['atkBp', 'hpBp']);

/** Talents measured again with the boss already at 30% of its HP, for the "While it holds" column. */
const ON_BOSS_HP: Readonly<Record<string, number>> = { finisher: 0.3 };

/** The boards that show a talent at work (the default board is the form's natural slot, see `teamFor`). */
const BOARD_NOTES: Readonly<Record<string, string>> = {
  'shoulder-to-shoulder': 'between two creatures of its own element',
  'kindred-boost': 'between two creatures of its own element',
  'lone-wolf': 'alone at the end of the row',
  'edge-walker': 'at the end of the row',
  'flank-guard-left': 'at the right end of the row',
  opportunist: 'after a Setter with Double Mark where the line has one',
  finisher:
    'its "While it holds" is measured with the boss at 30% HP (the boss has 1,000,000 HP, so it never holds otherwise)',
  'heavy-hand': "with the line's Mire Knack (Mud Wall for a Guard, Squelch Song for a Support)",
  clinging: "with the line's Mire Knack (Mud Wall for a Guard, Squelch Song for a Support)",
  cull: 'is not a damage talent (it ends the fight a little early and decides who lands the killing blow), so it has no value here',
};

interface Setup {
  readonly team: Pick[];
  readonly slot: number;
  /** Columns to stand in, by position in `team` (default 0, 1, 2). */
  readonly cols?: number[];
}

/** The board a talent is measured on: the form's natural team, changed where the talent needs it. */
function setupFor(tid: string, form: string): Setup {
  const st = formStats(form, LEVEL);
  const natural = teamFor(form);
  let team = natural.team.map((p) => ({ ...p }));
  let slot = natural.slot;
  let cols: number[] | undefined;
  const me = () => team[slot] as Pick;
  const toEnd = () => {
    const [m] = team.splice(slot, 1);
    team.push(m as Pick);
    slot = team.length - 1;
  };
  switch (tid) {
    case 'heavy-hand':
    case 'clinging':
      team[slot] = { ...me(), knack: st.role === 'guard' ? 'mud-wall' : 'squelch-song' };
      break;
    case 'opportunist': {
      const setter = team[0] as Pick;
      if (FORM_KNACKS[setter.formId]?.includes('double-mark'))
        team[0] = { ...setter, knack: 'double-mark' };
      break;
    }
    case 'edge-walker':
    case 'flank-guard-left':
      toEnd();
      break;
    case 'lone-wolf':
      toEnd();
      cols = [0, 1, 3];
      break;
    case 'shoulder-to-shoulder':
    case 'kindred-boost': {
      const kin = Object.keys(FORM_KNACKS)
        .filter((f) => f !== form && formStats(f, LEVEL).element === st.element)
        .slice(0, 2)
        .map((f): Pick => ({ formId: f, knack: firstKnack(f) }));
      if (kin.length === 2) {
        team = [kin[0] as Pick, me(), kin[1] as Pick];
        slot = 1;
      }
      break;
    }
  }
  return { team, slot, ...(cols ? { cols } : {}) };
}

interface Measured {
  /** Total damage with the talent over total damage without, over the forms and cards, minus 1. */
  readonly damage: number;
  /** Mean knockouts per fight gained. */
  readonly ko: number;
  /** Share of fights in which the talent's condition held or trigger fired; undefined for a flat stat. */
  readonly holds: number | undefined;
  /** Mean damage gain in the fights where it held; undefined for a flat stat. */
  readonly whileHolding: number | undefined;
  readonly byCard: Map<string, number>;
}

const baseline = new Map<string, { damage: number; knockouts: number }>();

/** One talent on every form that can have it, on every card; the same seed with and without it. */
function measureTalent(
  tid: string,
  forms: readonly string[],
  cards: readonly CardDef[],
  seeds: number,
): Measured {
  const keys = Object.keys(TALENTS[tid]?.fx ?? {});
  const flat = keys.every((k) => FLAT_FIELDS.has(k));
  const place = (line: readonly Pick[], cols?: number[]) =>
    toPlacements(line, GAUNTLET).map((p, i) => (cols ? { ...p, col: cols[i] ?? p.col } : p));
  let sumA = 0,
    sumB = 0,
    ko = 0,
    n = 0,
    held = 0,
    fights = 0,
    onGain = 0,
    onFights = 0;
  const cardA = new Map<string, number>();
  const cardB = new Map<string, number>();
  for (const form of forms) {
    const setup = setupFor(tid, form);
    const withT = setup.team.map((p, i) => (i === setup.slot ? { ...p, talents: [tid] } : p));
    for (const c of cards) {
      const boss = bossFor(GAUNTLET, [c.id]);
      // A pass over the seeds: the damage and knockouts with and without, and the fights where it held.
      const pass = (startHp?: number) => {
        let a = 0,
          b = 0,
          koA = 0,
          koB = 0,
          holdN = 0,
          gain = 0;
        for (let i = 0; i < seeds; i++) {
          const opts = (): { rng: Rng; bossHp?: number } => ({
            rng: createSeededRng(`tal:${c.id}:${i}`),
            ...(startHp !== undefined ? { bossHp: startHp } : {}),
          });
          const withRes = fight(boss, place(withT, setup.cols), opts());
          const key = `${JSON.stringify(setup.team)}|${setup.cols}|${c.id}|${i}|${startHp}`;
          let base = baseline.get(key);
          if (!base) {
            const r = fight(boss, place(setup.team, setup.cols), opts());
            base = { damage: r.damage, knockouts: r.knockouts };
            baseline.set(key, base);
          }
          a += withRes.damage;
          b += base.damage;
          koA += withRes.knockouts;
          koB += base.knockouts;
          const fires = keys.reduce(
            (sum, k) => sum + (withRes.fighters[setup.slot]?.fires[k] ?? 0),
            0,
          );
          if (fires > 0 && base.damage > 0) {
            holdN++;
            gain += withRes.damage / base.damage - 1;
          }
        }
        return { a: a / seeds, b: b / seeds, koDelta: (koA - koB) / seeds, holdN, gain };
      };
      const p = pass();
      sumA += p.a;
      sumB += p.b;
      ko += p.koDelta;
      n++;
      cardA.set(c.id, (cardA.get(c.id) ?? 0) + p.a);
      cardB.set(c.id, (cardB.get(c.id) ?? 0) + p.b);
      fights += seeds;
      const hpShare = ON_BOSS_HP[tid];
      const q = hpShare !== undefined ? pass(Math.floor(boss.hp * hpShare)) : p;
      held += p.holdN;
      onGain += q.gain;
      onFights += q.holdN;
    }
  }
  // Damage gains are ratios of totals, so a card where the baseline is almost nothing (Thick Hide)
  // cannot swamp the average; the best card is the one where the ratio is highest.
  const byCard = new Map(
    [...cardA].map(([id, a]) => [id, (cardB.get(id) ?? 0) ? a / (cardB.get(id) ?? 1) - 1 : 0]),
  );
  return {
    damage: sumB ? sumA / sumB - 1 : 0,
    ko: ko / n,
    holds: flat ? undefined : held / Math.max(1, fights),
    whileHolding: flat || onFights === 0 ? undefined : onGain / onFights,
    byCard,
  };
}

/** The two-line budget for a Knack or talent text, in characters (an estimate). */
const TEXT_BUDGET = 95;

const lineOf = (form: string) => content.creatures.find((c) => c.id === form)?.line ?? form;

const firstKnack = (form: string) => FORM_KNACKS[form]?.[0] ?? 'none';

/**
 * A fitting gauntlet team for measuring one form, with the form in its role's natural slot: a
 * Setter in front of a Payoff that cashes its mark, then Thornbuck; a Payoff after a Setter whose
 * mark it cashes, then Thornbuck; a Guard in front of Tidewing and Tempestray; a Support between them.
 */
function teamFor(form: string): { team: Pick[]; slot: number } {
  const st = formStats(form, LEVEL);
  const stage2 = (role: string, ok: (el: string) => boolean) =>
    content.creatures.find((c) => c.role === role && c.stage === 2 && ok(c.element))?.id;
  const P = (f: string): Pick => ({ formId: f, knack: firstKnack(f) });
  const me: Pick = { formId: form, knack: 'none' };
  if (st.role === 'setter') {
    const partner = stage2('payoff', (el) => triggers(el, st.element)) ?? 'tempestray';
    return { team: [me, P(partner), P('thornbuck')], slot: 0 };
  }
  if (st.role === 'payoff') {
    const partner = stage2('setter', (el) => triggers(st.element, el)) ?? 'tidewing';
    return { team: [P(partner), me, P('thornbuck')], slot: 1 };
  }
  if (st.role === 'guard') return { team: [me, P('tidewing'), P('tempestray')], slot: 0 };
  return { team: [P('tidewing'), me, P('tempestray')], slot: 1 };
}

export type { Ranked };

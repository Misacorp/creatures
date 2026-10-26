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
import { FORM_KNACKS, KNACKS } from './knacks';
import { TALENTS, TALENT_LINES, talentPool } from './talents';
import { LAB_RULES } from './rules';
import { formStats, triggers } from './species';
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
  'All at Once on Feed the Marks': 'wickat/double-mark geyserpup/all-at-once kilnmole/baked-shell',
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
    ['All at Once on Double Mark', 'wickat/double-mark geyserpup/all-at-once kilnmole/draw-fire'],
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
    : { starts: 160, keep: 16, rounds: 3, seeds: 3, freshSeeds: 8 };
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
  const appear = new Map<string, number>(
    [...Object.keys(KNACKS), 'none'].map((k) => [k, 0] as [string, number]),
  );
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
      for (const r of ranked.slice(0, 5))
        for (const k of usefulKnacks(r.line)) appear.set(k, (appear.get(k) ?? 0) + 1);
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
  const total = cards.length * 2 * 5;
  const rows = [...appear.entries()].sort((a, b) => b[1] - a[1]);
  md.push(
    '## Knack usage in the top 5 teams of every search',
    '',
    `Out of ${total} top teams (${cards.length} cards, gauntlet and raid, top 5 each). Leave a Trail counts only when another Payoff in the line can cash its mark. Never used: rework candidates. Used almost everywhere: needs a counter card (P-10).`,
    '',
    '| Knack | Forms | Top teams |',
    '| --- | --- | ---: |',
  );
  for (const [k, n] of rows)
    md.push(
      `| ${knackName(k)} | ${
        k === 'none'
          ? 'any'
          : Object.entries(FORM_KNACKS)
              .filter(([, ks]) => ks.includes(k))
              .map(([f]) => f)
              .join(', ')
      } | ${n} |`,
    );
  data['knackUsage'] = Object.fromEntries(rows);
  md.push('');

  // 6. A casual roster: does the best line use creatures beyond the top three by level?
  md.push(
    '## A casual roster (the North Star metric)',
    '',
    'Twelve random forms at random levels (8 to 25, stage 1 forms at their cap), with any of their Knacks. For each card: the best gauntlet line from that roster against "the three highest levels with no Knack" (what a player who never opens Knacks brings). Beyond top 3 is how many of the best line are not among the three highest levels.',
    '',
    '| Roster | Card | Best line | vs top 3 by level | Beyond top 3 |',
    '| --- | --- | --- | ---: | ---: |',
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
      if (!best) continue;
      const n = best.line.filter((p) => !top3.includes(p.formId)).length;
      beyond += n;
      trials++;
      md.push(
        `| ${r + 1} | ${cid} | ${best.line.map((p) => `${name(p)} L${p.level ?? LEVEL}`).join(', ')} | ${pct(best.score.score, t3.score)} | ${n} |`,
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
    `Each talent on one form in a fitting team (the form in the middle slot with no Knack, its partners with their first Knack): its score with the talent against the same team without it, on every card (${seeds} seeds each). Mean is over all cards; Best is the card where it helps most. A talent near 0% everywhere does nothing in that team (some need a partner, such as a healer for Quick Healer); one far above the rest is a must-roll.`,
    '',
    '| Line | Talent | Form | Mean | Best card |',
    '| --- | --- | --- | ---: | --- |',
  );
  const talentCards = cards.map((c) => c.id);
  const talentValue: Record<string, unknown> = {};
  for (const ln of TALENT_LINES) {
    for (const entry of talentPool(ln)) {
      for (const form of formsOf(ln)) {
        if (!entry.roles.includes(formStats(form, LEVEL).role)) continue;
        const team = teamFor(form);
        const withT = team.map((p, i) => (i === 1 ? { ...p, talents: [entry.talent] } : p));
        let sum = 0,
          best = -Infinity,
          bestCard = '';
        for (const cid of talentCards) {
          const boss = bossFor(GAUNTLET, [cid]);
          const a = evaluate(boss, withT, GAUNTLET, seeds, `tal:${cid}`);
          const b = evaluate(boss, team, GAUNTLET, seeds, `tal:${cid}`);
          const v = b.score ? a.score / b.score - 1 : 0;
          sum += v;
          if (v > best) [best, bestCard] = [v, cid];
        }
        const v = sum / talentCards.length;
        const signed = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;
        const cardName = CARDS.find((c) => c.id === bestCard)?.name ?? bestCard;
        talentValue[`${form}/${entry.talent}`] = {
          mean: Math.round(v * 1000) / 1000,
          best: bestCard,
          bestValue: Math.round(best * 1000) / 1000,
        };
        md.push(
          `| ${ln} | ${TALENTS[entry.talent]?.name ?? entry.talent} | ${form} | ${signed(v)} | ${best > 0.005 ? `${cardName} ${signed(best)}` : 'none'} |`,
        );
      }
    }
  }
  data['talentValue'] = talentValue;
  md.push('');

  // 8. A raid weekend with attrition.
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
    "Generated from `packages/lab/src/talents.ts`. A creature rolls talents from its line's pool when found. Each pool has the role talents of its forms' roles (the same effect keeps the same name in every pool) and one flavour talent of its own.",
    '',
    '| Line | Pool (roles) |',
    '| --- | --- |',
  );
  for (const ln of TALENT_LINES)
    md.push(
      `| ${ln} | ${talentPool(ln)
        .map((e) => `${TALENTS[e.talent]?.name ?? e.talent} (${e.roles.join(', ')})`)
        .join('; ')} |`,
    );
  md.push('', '| Talent | Text | Intent |', '| --- | --- | --- |');
  for (const t of Object.values(TALENTS)) md.push(`| ${t.name} | ${t.text} | ${t.intent} |`);
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

/** The forms of a creature line, in content order. */
function formsOf(ln: string): string[] {
  return content.creatures.filter((c) => c.line === ln && FORM_KNACKS[c.id]).map((c) => c.id);
}

const firstKnack = (form: string) => FORM_KNACKS[form]?.[0] ?? 'none';

/**
 * A fitting gauntlet team for measuring one form: the form in the middle (no Knack, so the talent
 * is what changes), a partner on its left that makes its role work (a Payoff that cashes a Setter's
 * mark, a Setter whose mark a Payoff cashes) and Thornbuck on its right; Guards and Supports stand
 * between Tidewing and Tempestray.
 */
function teamFor(form: string): Pick[] {
  const st = formStats(form, LEVEL);
  const stage2 = (role: string, ok: (el: string) => boolean) =>
    content.creatures.find((c) => c.role === role && c.stage === 2 && ok(c.element))?.id;
  let partner: string | undefined;
  if (st.role === 'setter') partner = stage2('payoff', (el) => triggers(el, st.element));
  if (st.role === 'payoff') partner = stage2('setter', (el) => triggers(st.element, el));
  const rest = partner !== undefined ? [partner, 'thornbuck'] : ['tidewing', 'tempestray'];
  const [left, right] = rest.map((f) => ({
    formId: f === form ? 'thornbuck' : f,
    knack: firstKnack(f === form ? 'thornbuck' : f),
  }));
  return [left as Pick, { formId: form, knack: 'none' }, right as Pick];
}

export type { Ranked };

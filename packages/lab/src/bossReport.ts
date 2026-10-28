/**
 * The report's sections on the real bosses (roadmap phase 1): the five raid bosses (arena, moves, the best raid team,
 * the classic party, the intended answers, weekend win rates, escalation steps), the dungeon foes (the best gauntlet
 * team and the classic line at a few depths, runs with and without the camp), Knack usage across all of them and the
 * mechanics that no boss or foe calls for. `pnpm --filter @creatures/lab report -- --bosses` prints only these.
 */
import { BOSS_ANSWERS, answerLine } from './bossAnswers';
import {
  NOT_PORTED,
  RAID_BOSS_IDS,
  RAID_SPECS,
  raidBossOf,
  raidMode,
  weekendScore,
  weekendStats,
} from './bosses';
import { gauntletScore, gauntletStats, runScore, runStats } from './dungeon';
import { DUNGEON_DEPTHS, FOE_IDS, FOE_SPECS, foeAt } from './foes';
import { FORM_KNACKS, KNACKS } from './knacks';
import { coverage } from './mechanics';
import {
  CLASSIC_LINE,
  GAUNTLET,
  classicFor,
  lineKey,
  poolOf,
  search,
  type Pick,
  type Ranked,
} from './search';
import type { BossDef, BossMove, Pattern } from './types';

const knackName = (k: string) => (k === 'none' ? 'no Knack' : (KNACKS[k]?.name ?? k));
const pickName = (p: Pick) =>
  `${p.formId} (${knackName(p.knack)}${p.talents?.length ? `, ${p.talents.join(', ')}` : ''})`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const rows = (line: readonly Pick[], cols: number): string =>
  Array.from({ length: Math.ceil(line.length / cols) }, (_, r) =>
    line
      .slice(r * cols, r * cols + cols)
      .map(pickName)
      .join(', '),
  ).join(' / ');

const ANCHOR: Record<Pattern['anchor'], string> = {
  front: 'the front',
  strongest: 'the strongest',
  payoff: 'the strongest Payoff',
  random: 'random',
  grudge: 'the top hitter',
  back: 'the back',
  weakest: 'the most wounded',
};

/** A move or plain attack in a few words: what it hits and when. */
export function shapeText(p: Pattern): string {
  const a = ANCHOR[p.anchor];
  switch (p.shape) {
    case 'single':
      return `${a}, one slot`;
    case 'line3':
      return `${a} and its row neighbours`;
    case 'row':
      return `row of ${a}`;
    case 'column':
      return `column of ${a}`;
    case 'rowEnds':
      return `row ends`;
    case 'randomRow':
      return 'a random row';
    case 'all':
      return 'everything';
    case 'scatter':
      return `${p.n ?? 1} random creatures`;
    case 'chain':
      return `${a}, then jumps x${p.n ?? 1}`;
    case 'columns':
      return `${p.n ?? 2} columns from ${a}`;
    case 'rows':
      return `${p.n ?? 2} rows from ${a}`;
    case 'cross':
      return `${a} and the slots touching it`;
    case 'checker':
      return `every other slot from ${a}`;
  }
}

const moveText = (m: BossMove): string =>
  `${m.name} (${m.silenceTurns ? `silences ${shapeText(m.pattern)} for ${m.silenceTurns}` : shapeText(m.pattern)}; every ${m.every}${m.charged ? ', Charged' : ''})`;

/** One line about a raid boss: arena, armour, plain attack, moves, cards, escalation. */
export function bossLine(b: BossDef): string {
  const esc = b.escalation;
  const grow = esc
    ? Object.entries(esc.grow)
        .map(([k, v]) => `${k} ${v}`)
        .join(', ')
    : '';
  return (
    `**${b.name}** (${b.element}): ${b.rows} rows of ${b.cols}, armour ${b.armour}, Attack ${b.atk}, HP ${b.hp}; ` +
    `plain: ${shapeText(b.plain.pattern)}${b.plain.hits && b.plain.hits > 1 ? ` x${b.plain.hits}` : ''}; ` +
    `moves: ${[...b.moves, ...(esc?.phase?.moves ?? [])].map(moveText).join('; ')}; ` +
    `cards: ${b.cards.join(', ') || 'none'}` +
    (esc
      ? `; escalation: ${esc.name} (feeds on ${esc.feed}, a step per ${esc.per}${esc.feed === 'hpLost' ? ' bp of HP lost' : ''}, up to ${esc.cap}; each step: ${grow}${esc.phase ? `; ${esc.phase.name} from step ${esc.phase.atStep}` : ''})`
      : '')
  );
}

interface Settings {
  readonly raid: {
    starts: number;
    keep: number;
    rounds: number;
    seeds: number;
    freshSeeds: number;
    weekends: number;
  };
  readonly foe: { starts: number; keep: number; rounds: number; seeds: number; freshSeeds: number; fights: number };
  readonly runs: { search: number; fresh: number; stats: number };
}

export const BOSS_SETTINGS = (quick: boolean): Settings =>
  quick
    ? {
        raid: { starts: 40, keep: 6, rounds: 2, seeds: 3, freshSeeds: 10, weekends: 20 },
        foe: { starts: 40, keep: 6, rounds: 2, seeds: 3, freshSeeds: 10, fights: 16 },
        runs: { search: 3, fresh: 12, stats: 24 },
      }
    : {
        raid: { starts: 300, keep: 24, rounds: 5, seeds: 5, freshSeeds: 40, weekends: 100 },
        foe: { starts: 120, keep: 10, rounds: 3, seeds: 4, freshSeeds: 24, fights: 40 },
        runs: { search: 5, fresh: 40, stats: 80 },
      };

export interface BossSections {
  readonly md: string[];
  readonly data: Record<string, unknown>;
}

export function buildBossSections(opts: { quick?: boolean } = {}): BossSections {
  const quick = opts.quick ?? false;
  const S = BOSS_SETTINGS(quick);
  const md: string[] = [];
  const data: Record<string, unknown> = {};
  /** Every best line of every search here, counted for the Knack usage and form tables. */
  const topLines: (readonly Pick[])[] = [];
  const bestRaidLines: (readonly Pick[])[] = [];
  const bestFoeLines: (readonly Pick[])[] = [];

  // ---------- Raid bosses ----------
  md.push(
    '## Raid bosses',
    '',
    `The five raid bosses of the shipped game, in the combat v2 grammar (\`packages/lab/src/bosses.ts\`). Players know the one boss in advance and build against it, so each is strong and has many attacks, most of them area attacks in varied shapes; a weekend should cost the party creatures. A weekend is three stages of 8 rounds that share the boss's HP; HP carries, knocked-out creatures stay out, four players each keep one Kilnmole on the bench. The arena is four slots wide (one column per player) and as many rows as the boss has. Best team: the team search over a whole weekend (wins first, then the boss's HP removed, then fewer knockouts), ${S.raid.weekends} weekends each. The classic raid party is four players with Tidewing (Steady Mark), Tempestray (Detonate) and Thornbuck (Wide Reach) in order across the rows.`,
    '',
  );
  for (const id of RAID_BOSS_IDS) md.push(`- ${bossLine(raidBossOf(id))}`);
  md.push('');

  const raidRows: string[] = [];
  const answerRows: string[] = [];
  const bestLinesMd: string[] = [];
  const raidData: Record<string, unknown> = {};
  let answers = 0,
    beat = 0;
  for (const spec of RAID_SPECS) {
    const boss = raidBossOf(spec.id);
    const mode = raidMode(boss);
    const classic = classicFor(mode);
    const given = (BOSS_ANSWERS[spec.id] ?? []).map((a) => ({
      ...a,
      picks: answerLine(a.line),
      // A talent answer is read against the classic party with the same talent on every creature.
      baseline: a.talent ? classic.map((p) => ({ ...p, talents: [a.talent as string] })) : classic,
    }));
    const ranked: Ranked[] = search(boss, mode, {
      seed: `raidboss:${spec.id}`,
      ...S.raid,
      include: [classic, ...given.flatMap((g) => [g.picks, g.baseline])],
      score: weekendScore(boss),
    });
    const best = ranked[0];
    const key = (l: readonly Pick[]) => lineKey(l);
    const cl = ranked.find((r) => key(r.line) === key(classic));
    if (!best || !cl) continue;
    bestRaidLines.push(best.line);
    for (const r of ranked.slice(0, 5)) topLines.push(r.line);
    const wb = weekendStats(boss, best.line, S.raid.weekends, `report:${spec.id}:best`);
    const wc = weekendStats(boss, classic, S.raid.weekends, `report:${spec.id}:classic`);
    raidRows.push(
      `| ${boss.name} | ${Math.round(best.score.score)} | ${Math.round(cl.score.score)} | ${pct(wc.winRate)} | ${pct(wb.winRate)} | ${wc.knockoutsTotal.toFixed(1)} | ${wb.knockoutsTotal.toFixed(1)} | ${boss.escalation ? `${wc.steps.toFixed(1)} / ${wb.steps.toFixed(1)} of ${boss.escalation.cap}` : 'none'} |`,
    );
    bestLinesMd.push(`- ${boss.name}: ${rows(best.line, mode.cols)}`);
    const ansData: unknown[] = [];
    for (const g of given) {
      const r = ranked.find((x) => key(x.line) === key(g.picks));
      const base = ranked.find((x) => key(x.line) === key(g.baseline)) ?? cl;
      const w = weekendStats(boss, g.picks, S.raid.weekends, `report:${spec.id}:ans`);
      const wbase = g.talent ? weekendStats(boss, g.baseline, S.raid.weekends, `report:${spec.id}:base`) : wc;
      answers++;
      const wins = r !== undefined && r.score.score > base.score.score;
      if (wins) beat++;
      answerRows.push(
        `| ${boss.name} | ${g.label} (${g.tool}) | ${r ? Math.round(r.score.score) : 'n/a'} vs ${Math.round(base.score.score)}${g.talent ? ` (classic with ${g.talent})` : ''} | ${pct(w.winRate)} vs ${pct(wbase.winRate)} | ${w.knockoutsTotal.toFixed(1)} | ${boss.escalation ? `${w.steps.toFixed(1)} of ${boss.escalation.cap}` : '-'} |`,
      );
      ansData.push({
        label: g.label,
        tool: g.tool,
        score: r ? Math.round(r.score.score) : null,
        winRate: w.winRate,
        beatsClassic: wins,
      });
    }
    raidData[spec.id] = {
      best: best.line,
      score: Math.round(best.score.score),
      classicScore: Math.round(cl.score.score),
      classicWin: wc.winRate,
      bestWin: wb.winRate,
      classicKnockouts: wc.knockoutsTotal,
      bestKnockouts: wb.knockoutsTotal,
      steps: { classic: wc.steps, best: wb.steps },
      answers: ansData,
    };
  }
  md.push(
    '### The best raid team and the classic party',
    '',
    'Score is the search score (win rate x 100, plus 40 x the share of boss HP removed, minus half a point per knockout); the weekend columns are measured on their own seeds. Steps is how far the boss escalated in a weekend, on average, against the classic party and the best team.',
    '',
    '| Boss | Best score | Classic score | Classic weekend win | Best weekend win | Classic knockouts | Best knockouts | Escalation steps (classic / best) |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    ...raidRows,
    '',
    'Best lines (rows front to back):',
    '',
    ...bestLinesMd,
    '',
    '### Intended answers (P-13)',
    '',
    'An answer works when its score beats the classic party’s on the same boss. Each boss has two or more, on different tools.',
    '',
    '| Boss | Answer (tool) | Score vs classic | Weekend win vs classic | Knockouts | Steps |',
    '| --- | --- | ---: | ---: | ---: | --- |',
    ...answerRows,
    '',
    `**${beat} of ${answers} intended answers beat the classic party on their boss.**`,
    '',
  );
  data['raidBosses'] = raidData;
  data['raidAnswers'] = { beat, total: answers };

  // ---------- Dungeon foes ----------
  md.push(
    '## Dungeon foes',
    '',
    `The fifteen foes and floor bosses (\`packages/lab/src/foes.ts\`): one row of three, then the foe. Names, elements and round counts come from the content; every foe asks its own question, and the foes are tough: a dungeon shows its encounters up front but sends many different foes, so it wants an all-round team, and the camp (a rest between rooms) has to matter. HP and Attack follow a depth (the dungeon's curve, gentler in the lab because every creature is at its cap; lab depths are not the shipped depth numbers); a floor boss gains its signature move at a landmark depth (depth 7 here). Each cell is the best team the search finds (win rate in ${S.foe.fights} fights) and the classic line's win rate.`,
    '',
  );
  md.push(
    `| Foe | Asks | ${DUNGEON_DEPTHS.map((d) => `Depth ${d}: best / classic`).join(' | ')} |`,
    `| --- | --- | ${DUNGEON_DEPTHS.map(() => '---:').join(' | ')} |`,
  );
  const foeData: Record<string, unknown> = {};
  const bestAtMid: string[] = [];
  const mid = DUNGEON_DEPTHS[Math.min(2, DUNGEON_DEPTHS.length - 1)] ?? 5;
  for (const id of FOE_IDS) {
    const cells: string[] = [];
    const per: Record<number, unknown> = {};
    let name = id;
    let asksText = '';
    for (const d of DUNGEON_DEPTHS) {
      const foe = foeAt(id, d);
      name = foe.name;
      const ranked = search(foe, GAUNTLET, {
        seed: `foe:${id}:${d}`,
        ...S.foe,
        include: [CLASSIC_LINE],
        score: gauntletScore(foe),
      });
      const best = ranked[0];
      if (!best) continue;
      for (const r of ranked.slice(0, 3)) topLines.push(r.line);
      bestFoeLines.push(best.line);
      const wb = gauntletStats(foe, best.line, S.foe.fights, `foe:${id}:${d}:b`);
      const wc = gauntletStats(foe, CLASSIC_LINE, S.foe.fights, `foe:${id}:${d}:c`);
      cells.push(`${pct(wb.winRate)} / ${pct(wc.winRate)}`);
      per[d] = { best: best.line, bestWin: wb.winRate, classicWin: wc.winRate };
      if (d === mid) bestAtMid.push(`- ${foe.name}: ${best.line.map(pickName).join(', ')}`);
    }
    asksText = FOE_ASKS.get(id) ?? '';
    md.push(`| ${name} | ${asksText} | ${cells.join(' | ')} |`);
    foeData[id] = per;
  }
  md.push('', `Best teams at depth ${mid}:`, '', ...bestAtMid, '');
  data['foes'] = foeData;

  // Runs: the camp must matter, and an all-round team beats the classic line.
  md.push(
    '### Runs and the camp',
    '',
    `A run is two fights, the camp, two fights and the floor boss, with foes drawn without repeats; creatures keep their HP, a knocked-out creature stays out, and the camp's Rest heals the standing creatures by the dungeon's share. The all-round team is the best line the search finds against whole runs at that depth, so it has to answer many foes at once. ${S.runs.stats} seeded runs each; the same routes and dice with and without the camp.`,
    '',
    '| Depth | Team | Win with camp | Win without camp | Rooms cleared (with / without) | Knockouts at the end |',
    '| --- | --- | ---: | ---: | ---: | ---: |',
  );
  const runData: Record<string, unknown> = {};
  for (const d of DUNGEON_DEPTHS) {
    const ranked = search(foeAt('puddle-imp', d), GAUNTLET, {
      seed: `run:${d}`,
      starts: S.foe.starts,
      keep: S.foe.keep,
      rounds: S.foe.rounds,
      seeds: S.runs.search,
      freshSeeds: S.runs.fresh,
      include: [CLASSIC_LINE],
      score: runScore(d),
    });
    const best = ranked[0];
    if (!best) continue;
    bestFoeLines.push(best.line);
    for (const [label, line] of [
      ['Classic line', CLASSIC_LINE],
      ['All-round best', best.line],
    ] as const) {
      const w = runStats(line, d, true, S.runs.stats, `final:${label}`);
      const wo = runStats(line, d, false, S.runs.stats, `final:${label}`);
      md.push(
        `| ${d} | ${label}${label === 'All-round best' ? `: ${line.map(pickName).join(', ')}` : ''} | ${pct(w.winRate)} | ${pct(wo.winRate)} | ${w.cleared.toFixed(1)} / ${wo.cleared.toFixed(1)} | ${w.knockouts.toFixed(1)} |`,
      );
      runData[`${d}:${label}`] = { with: w.winRate, without: wo.winRate };
    }
  }
  md.push('');
  data['runs'] = runData;

  // ---------- Knack usage, forms and mechanics ----------
  const pool = poolOf();
  const poolShare = (k: string) => pool.filter((p) => p.knack === k).length / pool.length;
  const appear = new Map<string, number>(
    [...Object.keys(KNACKS), 'none'].map((k) => [k, 0] as [string, number]),
  );
  let picks = 0;
  for (const l of topLines)
    for (const p of l) {
      picks++;
      appear.set(p.knack, (appear.get(p.knack) ?? 0) + 1);
    }
  const usage = [...appear.entries()]
    .map(([k, n]) => ({ k, n, ratio: n / Math.max(1, picks) / poolShare(k) }))
    .sort((a, b) => b.ratio - a.ratio);
  md.push(
    '## Knack usage across the real bosses (per creature)',
    '',
    `${picks} creatures in the top 5 raid lines of each boss and the top 3 gauntlet lines of each foe at each depth. Ratio is the Knack's share of those picks over its share of the pool of every form and Knack: 1.0 is what random picks would give, above 2 stands out, below 0.3 is rarely chosen.`,
    '',
    '| Knack | Forms | Picks | Ratio |',
    '| --- | --- | ---: | ---: |',
    ...usage.map(
      ({ k, n, ratio }) =>
        `| ${knackName(k)} | ${
          k === 'none'
            ? 'any'
            : Object.entries(FORM_KNACKS)
                .filter(([, ks]) => ks.includes(k))
                .map(([f]) => f)
                .join(', ')
        } | ${n} | ${ratio.toFixed(1)} |`,
    ),
    '',
  );
  data['bossKnackUsage'] = Object.fromEntries(
    usage.map((u) => [u.k, { picks: u.n, ratio: Math.round(u.ratio * 100) / 100 }]),
  );
  const formCount = new Map<string, number>();
  for (const l of [...bestRaidLines, ...bestFoeLines])
    for (const f of new Set(l.map((p) => p.formId))) formCount.set(f, (formCount.get(f) ?? 0) + 1);
  const lines = bestRaidLines.length + bestFoeLines.length;
  const forms = [...formCount.entries()].sort((a, b) => b[1] - a[1]);
  md.push(
    '### Forms in the best teams',
    '',
    `Of the ${lines} best teams (one per raid boss, one per foe and depth, one per run depth), the forms in most of them: ${forms
      .slice(0, 6)
      .map(([f, n]) => `${f} (${n}, ${pct(n / Math.max(1, lines))})`)
      .join(', ')}. A form in most best teams is a new "top three" (P-11).`,
    '',
  );
  data['bossForms'] = Object.fromEntries(forms);

  const everyone: BossDef[] = [
    ...RAID_BOSS_IDS.map((id) => raidBossOf(id)),
    ...FOE_IDS.map((id) => foeAt(id, 7)),
  ];
  const cover = coverage(everyone);
  const missing = cover.filter((c) => c.callers.length === 0);
  md.push(
    '## Mechanics the bosses and foes call for',
    '',
    'Every Knack family, keyword, rule and talent kind should be the answer or the problem for at least one boss or foe. The predicates in `src/mechanics.ts` read each boss’s data (foes at a landmark depth, so their signatures count), so nothing is claimed by hand.',
    '',
    '| Mechanic | Kind | Called for by |',
    '| --- | --- | --- |',
    ...cover.map(
      (c) =>
        `| ${c.mechanic.name} | ${c.mechanic.group} | ${c.callers.length === 0 ? '**none**' : `${c.callers.length}: ${c.callers.slice(0, 4).map((x) => x.name).join(', ')}${c.callers.length > 4 ? ', ...' : ''}`} |`,
    ),
    '',
    missing.length
      ? `**No boss or foe calls for: ${missing.map((m) => `${m.mechanic.name} (${m.mechanic.group})`).join(', ')}.**`
      : '**Every mechanic is called for by at least one boss or foe.**',
    '',
  );
  md.push('## Not ported from the shipped bosses and foes', '', ...NOT_PORTED.map((t) => `- ${t}`), '');
  data['mechanicsMissing'] = missing.map((m) => m.mechanic.id);
  data['mechanicsTotal'] = cover.length;
  return { md, data };
}

/** What each foe asks, from its spec (for the table). */
const FOE_ASKS = new Map(FOE_SPECS.map((s) => [s.id, s.asks]));

/**
 * The report's sections on the real bosses (roadmap phase 1): the five raid bosses (arena, moves, the best raid team,
 * the classic party, the intended answers, weekend win rates, escalation steps), the dungeon foes (the best gauntlet
 * team and the classic line at a few depths, runs with and without the camp), Knack usage across all of them and the
 * mechanics that no boss or foe calls for. `pnpm --filter @creatures/lab report -- --bosses` prints only these.
 */
import { ablate, type Measured } from './ablation';
import { BOSS_ANSWERS, answerLine } from './bossAnswers';
import {
  NOT_PORTED,
  RAID_BOSS_IDS,
  RAID_SPECS,
  raidBossOf,
  raidMode,
  weekendScore,
  weekendStats,
  type WeekendStats,
} from './bosses';
import {
  MARGIN_TARGET,
  RAID_WIDTHS,
  RAID_LINEAR_FROM,
  hpExponentOf,
  marginOf,
  mixedServer,
  widthOf,
  type MixedResult,
  type WidthResult,
} from './raidMeasure';
import { gauntletScore, gauntletStats, runScore, runStats } from './dungeon';
import { DUNGEON_DEPTHS, FOE_IDS, FOE_SPECS, foeAt } from './foes';
import { FORM_KNACKS, KNACKS } from './knacks';
import { MECHANICS, coverage } from './mechanics';
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
import { illegalTalents, legalTalents } from './talents';
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
  weakest: 'the most hurt',
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
  `${m.name} (${m.silenceTurns ? `silences ${shapeText(m.pattern)} for ${m.silenceTurns}` : shapeText(m.pattern)}; every ${m.every}${m.charged ? ', Wind-up' : ''})`;

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
      ? `; escalation: ${esc.name} (feeds on ${esc.feed}, a step per ${esc.per}${esc.feed === 'hpLost' ? ' bp of HP lost' : ''}${esc.perColumns ? ` per ${esc.perColumns} columns` : ''}, up to ${esc.cap}; each step: ${grow}${esc.phase ? `; ${esc.phase.name} from step ${esc.phase.atStep}` : ''})`
      : '')
  );
}

/** One team's HP left per stage and at the weekend's end: "standing creatures' HP (share of creatures standing)". */
export function healthCells(w: WeekendStats): string[] {
  const cell = (hp: number, up: number) => `${pct(hp)} (${pct(up)})`;
  return [
    ...[0, 1, 2].map((k) =>
      (w.played[k] ?? 0) > 0 ? cell(w.hpLeft[k] ?? 0, w.standing[k] ?? 0) : '-',
    ),
    cell(w.hpLeftEnd, w.standingEnd),
  ];
}

interface Settings {
  readonly raid: {
    starts: number;
    keep: number;
    rounds: number;
    seeds: number;
    freshSeeds: number;
    weekends: number;
    /** Weekends for each width and each draw of the mixed server, and the number of casual draws. */
    mixedDraws: number;
    /** Independent from-scratch searches per boss (the best on common fresh seeds is reported). */
    scratchSearches: number;
  };
  readonly foe: {
    starts: number;
    keep: number;
    rounds: number;
    seeds: number;
    freshSeeds: number;
    fights: number;
  };
  readonly runs: {
    starts: number;
    keep: number;
    rounds: number;
    search: number;
    fresh: number;
    stats: number;
  };
}

export const BOSS_SETTINGS = (quick: boolean): Settings =>
  quick
    ? {
        raid: {
          starts: 30,
          keep: 4,
          rounds: 6,
          seeds: 3,
          freshSeeds: 10,
          weekends: 20,
          mixedDraws: 8,
          scratchSearches: 1,
        },
        foe: { starts: 40, keep: 6, rounds: 2, seeds: 3, freshSeeds: 10, fights: 16 },
        runs: { starts: 40, keep: 6, rounds: 2, search: 3, fresh: 12, stats: 24 },
      }
    : {
        // A few starts and many rounds of local improvement: found far better lines than many starts and few rounds.
        raid: {
          starts: 200,
          keep: 6,
          rounds: 40,
          seeds: 5,
          freshSeeds: 40,
          weekends: 100,
          mixedDraws: 40,
          scratchSearches: 2,
        },
        foe: { starts: 120, keep: 10, rounds: 3, seeds: 4, freshSeeds: 24, fights: 40 },
        runs: { starts: 250, keep: 16, rounds: 4, search: 6, fresh: 50, stats: 100 },
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
  const marginRows: string[] = [];
  const healthRows: string[] = [];
  const widthRows: string[] = [];
  const mixedRows: string[] = [];
  const illegalNotes: string[] = [];
  const raidData: Record<string, unknown> = {};
  /** The raid bosses' measured mechanics: name, boss id, and what taking each out of the best line costs (win-rate points). */
  const raidAblation: { id: string; name: string; measured: Measured[] }[] = [];
  let answers = 0,
    beat = 0;
  for (const spec of RAID_SPECS) {
    const boss = raidBossOf(spec.id);
    const mode = raidMode(boss);
    const classic = classicFor(mode);
    // A written answer may carry only legal talents; an illegal one is left out of the searches and reported.
    const given = (BOSS_ANSWERS[spec.id] ?? []).map((a) => {
      const picks = answerLine(a.line);
      const bad = illegalTalents(picks);
      if (bad.length)
        illegalNotes.push(
          `${boss.name} / ${a.label}: ${bad.map((x) => `${x.formId} carries ${x.talent} (${x.why})`).join('; ')}`,
        );
      // A talent answer is read against the classic party with the talent on each creature that may carry it.
      const baseline = a.talent
        ? classic.map((p) =>
            legalTalents(p.formId).includes(a.talent as string)
              ? { ...p, talents: [a.talent as string] }
              : p,
          )
        : classic;
      return { ...a, picks, baseline, legal: bad.length === 0 };
    });
    const legalGiven = given.filter((g) => g.legal);
    const score = weekendScore(boss);
    // Seeded with the written answers (and the classic party), and from scratch: the two are reported apart.
    const ranked: Ranked[] = search(boss, mode, {
      seed: `raidboss:${spec.id}`,
      ...S.raid,
      talents: true,
      include: [classic, ...legalGiven.flatMap((g) => [g.picks, g.baseline])],
      score,
    });
    // From scratch: a few independent searches (a search from nothing is a lottery), judged on the same fresh seeds.
    const fresh = (l: readonly Pick[]) => score(l, S.raid.freshSeeds, `pick:${spec.id}`).score;
    const scratchRanked: Ranked[] = Array.from({ length: S.raid.scratchSearches }, (_, i) =>
      search(boss, mode, {
        seed: `raidboss:${spec.id}:scratch${i === 0 ? '' : `:${i}`}`,
        ...S.raid,
        talents: true,
        score,
      }).slice(0, 5),
    )
      .flat()
      .map((r) => ({ r, f: fresh(r.line) }))
      .sort((a, b) => b.f - a.f)
      .map((x) => x.r);
    const seeded = ranked[0];
    const scratch = scratchRanked[0];
    const key = (l: readonly Pick[]) => lineKey(l);
    const cl = ranked.find((r) => key(r.line) === key(classic));
    if (!seeded || !scratch || !cl) continue;
    // The overall best line is whichever of the two does better on the same fresh seeds.
    const overall = fresh(scratch.line) >= fresh(seeded.line) ? scratch : seeded;
    const overallIs = overall === scratch ? 'from scratch' : 'seeded';
    bestRaidLines.push(scratch.line);
    for (const r of scratchRanked.slice(0, 5)) topLines.push(r.line);
    const wSeeded = weekendStats(boss, seeded.line, S.raid.weekends, `report:${spec.id}:seeded`);
    const wScratch = weekendStats(boss, scratch.line, S.raid.weekends, `report:${spec.id}:scratch`);
    const wc = weekendStats(boss, classic, S.raid.weekends, `report:${spec.id}:classic`);
    // The prepared answer: the first written legal answer, the tool the boss asks for (the mixed server brings it too).
    const prepared = legalGiven[0];
    const wOverall = overall === scratch ? wScratch : wSeeded;
    const wPrep = prepared
      ? weekendStats(boss, prepared.picks, S.raid.weekends, `report:${spec.id}:ans`)
      : undefined;
    raidRows.push(
      `| ${boss.name} | ${pct(wc.winRate)} | ${pct(wSeeded.winRate)} | ${pct(wScratch.winRate)} | ${Math.round(cl.score.score)} / ${Math.round(seeded.score.score)} / ${Math.round(scratch.score.score)} | ${wc.knockoutsTotal.toFixed(1)} / ${wSeeded.knockoutsTotal.toFixed(1)} / ${wScratch.knockoutsTotal.toFixed(1)} | ${boss.escalation ? `${wc.steps.toFixed(1)} / ${wSeeded.steps.toFixed(1)} / ${wScratch.steps.toFixed(1)} of ${boss.escalation.cap}` : 'none'} |`,
    );
    bestLinesMd.push(
      `- ${boss.name}, seeded: ${rows(seeded.line, mode.cols)}`,
      `- ${boss.name}, from scratch: ${rows(scratch.line, mode.cols)}`,
    );
    const ansData: unknown[] = [];
    for (const g of given) {
      if (!g.legal) {
        answerRows.push(
          `| ${boss.name} | ${g.label} (${g.tool}) | **illegal talent, not measured** | - | - | - |`,
        );
        continue;
      }
      const r = ranked.find((x) => key(x.line) === key(g.picks));
      const base = ranked.find((x) => key(x.line) === key(g.baseline)) ?? cl;
      const w = weekendStats(boss, g.picks, S.raid.weekends, `report:${spec.id}:ans`);
      const wbase = g.talent
        ? weekendStats(boss, g.baseline, S.raid.weekends, `report:${spec.id}:base`)
        : wc;
      answers++;
      const wins = r !== undefined && r.score.score > base.score.score;
      if (wins) beat++;
      answerRows.push(
        `| ${boss.name} | ${g.label} (${g.tool}) | ${r ? Math.round(r.score.score) : 'n/a'} vs ${Math.round(base.score.score)}${g.talent ? ` (classic with ${g.talent} where legal)` : ''} | ${pct(w.winRate)} vs ${pct(wbase.winRate)} | ${w.knockoutsTotal.toFixed(1)} | ${boss.escalation ? `${w.steps.toFixed(1)} of ${boss.escalation.cap}` : '-'} |`,
      );
      ansData.push({
        label: g.label,
        tool: g.tool,
        score: r ? Math.round(r.score.score) : null,
        winRate: w.winRate,
        beatsClassic: wins,
      });
    }
    // The margin: the prepared answer and the best line when the boss hits 10% harder, and when it has 10% more HP.
    const mp = prepared
      ? marginOf(boss, prepared.picks, S.raid.weekends, `report:${spec.id}:margin:prepared`)
      : undefined;
    const m = marginOf(boss, overall.line, S.raid.weekends, `report:${spec.id}:margin`);
    if (mp)
      marginRows.push(
        `| ${boss.name} | prepared answer | ${pct(mp.base)} | ${pct(mp.atk10)} | ${pct(mp.hp10)} |`,
      );
    marginRows.push(
      `| ${boss.name} | best searched (${overallIs}) | ${pct(m.base)} | ${pct(m.atk10)} | ${pct(m.hp10)} |`,
    );
    // Other widths: the classic party, and the best line repeated to fill.
    const widths: WidthResult[] = RAID_WIDTHS.map((w) =>
      widthOf(boss, overall.line, w, S.raid.weekends, `report:${spec.id}:w${w}`),
    );
    widthRows.push(
      `| ${boss.name} | ${hpExponentOf(boss)} | ${widths.map((w) => `${pct(w.classicWin)} / ${pct(w.bestWin)}`).join(' | ')} |`,
    );
    // A mixed server: 2 min-maxers, 3 builders, 5 casual players.
    // One answer per boss, the prepared line (the first written answer: the tool the boss asks for, at most two copies of a form).
    // Min-maxers and builders bring its columns; the search's best line is tuned to its own four columns together, and its
    // columns do not carry the tool by name.
    const mixed: MixedResult = mixedServer(
      boss,
      prepared?.picks ?? overall.line,
      prepared ? [prepared.picks] : legalGiven.map((g) => g.picks),
      S.raid.mixedDraws,
      S.raid.weekends,
      `report:${spec.id}:mixed`,
      prepared?.core ?? [],
      prepared ? [prepared.core ?? []] : [],
    );
    mixedRows.push(
      `| ${boss.name} | ${pct(mixed.winRate)} | ${mixed.knockouts.toFixed(1)} | ${healthCells(mixed.weekend).slice(3).join(' ')} |`,
    );
    // HP left (Misa, 2026-10-29): knockouts are not the only cost; creatures standing but low on HP count too.
    const teams: [string, WeekendStats | undefined][] = [
      ['classic party', wc],
      ['prepared answer', wPrep],
      [`best searched (${overallIs})`, wOverall],
      ['mixed server', mixed.weekend],
    ];
    for (const [label, w] of teams)
      if (w)
        healthRows.push(
          `| ${boss.name} | ${label} | ${pct(w.winRate)} | ${w.knockoutsTotal.toFixed(1)} | ${healthCells(w).join(' | ')} |`,
        );
    // Which mechanics the best line really needs: take each out and measure the win rate.
    const measured = ablate(
      overall.line,
      (l) => 100 * weekendStats(boss, l, S.raid.weekends, `report:${spec.id}:abl`).winRate,
    );
    raidAblation.push({ id: spec.id, name: boss.name, measured });
    // The prepared line is a boss's own answer: a tool it cannot do without counts too (the search's best line often has
    // several tools that cover for each other).
    if (prepared)
      raidAblation.push({
        id: `${spec.id}:prepared`,
        name: `${boss.name}, prepared line`,
        measured: ablate(
          prepared.picks,
          (l) => 100 * weekendStats(boss, l, S.raid.weekends, `report:${spec.id}:ablp`).winRate,
        ),
      });
    raidData[spec.id] = {
      seededBest: seeded.line,
      scratchBest: scratch.line,
      overall: overallIs,
      classicWin: wc.winRate,
      seededWin: wSeeded.winRate,
      scratchWin: wScratch.winRate,
      classicKnockouts: wc.knockoutsTotal,
      seededKnockouts: wSeeded.knockoutsTotal,
      scratchKnockouts: wScratch.knockoutsTotal,
      steps: { classic: wc.steps, seeded: wSeeded.steps, scratch: wScratch.steps },
      margin: m,
      preparedMargin: mp,
      health: {
        classic: wc,
        prepared: wPrep,
        best: wOverall,
        mixed: mixed.weekend,
      },
      widths,
      mixed,
      answers: ansData,
    };
  }
  md.push(
    '### The best raid team and the classic party',
    '',
    `The team search over a whole weekend (it also picks a legal talent for each creature) is run per boss **seeded** with the classic party and the written answers, and **from scratch**, with nothing written (the best of ${S.raid.scratchSearches} independent searches, judged on the same fresh seeds: a search from nothing is a lottery). The Knack and form usage tables below count the from-scratch lines only, so they are not skewed by lines written by hand. Score is the search score (win rate x 100, plus 40 x the share of boss HP removed, minus half a point per knockout); the weekend columns are measured on their own seeds, ${S.raid.weekends} weekends each. Steps is how far the boss escalated in a weekend, on average. Cells read classic / seeded best / from-scratch best.`,
    '',
    '| Boss | Classic weekend win | Seeded best win | From-scratch best win | Score (classic / seeded / scratch) | Knockouts | Escalation steps |',
    '| --- | ---: | ---: | ---: | --- | --- | --- |',
    ...raidRows,
    '',
    'Best lines (rows front to back):',
    '',
    ...bestLinesMd,
    '',
    ...(illegalNotes.length
      ? [
          '**Written answers with illegal talents (a creature may carry only a talent of its line pool that works for its role); they are left out of the searches and the tables until fixed:**',
          '',
          ...illegalNotes.map((n) => `- ${n}`),
          '',
        ]
      : []),
    '### Margin',
    '',
    `The weekend win rate of the prepared answer (the first written answer) and of the best searched line on the real boss, with 10% more Attack, and with 10% more HP. Target: a well-prepared team wins about ${pct(MARGIN_TARGET)} or more at +10%, but not always (a boss that is beaten by a mile at +10% has no margin to ask for; one that is lost has none to give).`,
    '',
    '| Boss | Best line | Win | +10% Attack | +10% HP |',
    '| --- | --- | ---: | ---: | ---: |',
    ...marginRows,
    '',
    '### HP left after each stage',
    '',
    `Knockouts are one cost of a weekend; the creatures that stand but are low on HP are another (Misa, 2026-10-29: everyone alive but low is also a result). Each cell reads the standing creatures' HP over their max HP, and in brackets the share of the stage's creatures still standing, at the end of the stage (a mean over the weekends that played it, \`-\` when none did). The last column is the weekend's end: the last stage each weekend played. ${S.raid.weekends} weekends each. The prepared answer is the first written answer; the mixed server is the draw of casual players described below.`,
    '',
    '| Boss | Team | Win | Knockouts | Stage 1 | Stage 2 | Stage 3 | Weekend end |',
    '| --- | --- | ---: | ---: | --- | --- | --- | --- |',
    ...healthRows,
    '',
    '### The raid at other widths',
    '',
    `Each player brings one column, so the arena is as wide as the server's raid: ${RAID_WIDTHS.join(', ')} columns a row. Cells read classic party / best line repeated to fill. The boss's weekend HP grows with the players as (players / 4) ^ e up to ${RAID_LINEAR_FROM} players, where e is the boss's own exponent (the shipped bosses have one too: they answer differently to a bigger raid, and the shipped default is 1.1), and in a straight line past that (a raid of ${RAID_WIDTHS[RAID_WIDTHS.length - 1]} copies of the same three creatures should not walk over it); its Attack does not grow, and its area counts scale with the width (a move's counts, and a Build-up's units per step, can be set per 4 columns, \`perColumns\`).`,
    '',
    `| Boss | HP exponent | ${RAID_WIDTHS.map((w) => `${w} columns`).join(' | ')} |`,
    `| --- | ---: | ${RAID_WIDTHS.map(() => '---:').join(' | ')} |`,
    ...widthRows,
    '',
    '### A mixed server weekend',
    '',
    `Ten players, one column each, side by side: 2 min-maxers and 3 builders (a column each of the prepared line, the first written answer: one answer per boss, at most 2 copies of any form in a column; they have read the boss, so the min-maxers bring the columns with the most of its tool first and the builders take the columns in turn) and 5 casual players (a column of random forms from a random roster of 12, a random Knack each that the form can equip, and a random legal talent). ${S.raid.mixedDraws} different draws of the casual players and the builders' answers, ${S.raid.weekends} weekends in all.`,
    '',
    '| Boss | Weekend win | Knockouts | HP left (standing) at the weekend end |',
    '| --- | ---: | ---: | --- |',
    ...mixedRows,
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
  data['illegalAnswers'] = illegalNotes;

  // ---------- Dungeon foes ----------
  md.push(
    '## Dungeon foes',
    '',
    `The fifteen foes and floor bosses (\`packages/lab/src/foes.ts\`): one row of three, then the foe. Names, elements and round counts come from the content; every foe asks its own question, and the foes are tough: a dungeon shows its encounters up front but sends many different foes, so it wants an all-round team, and the camp (a rest between rooms) has to matter. HP and Attack follow a depth (the dungeon's curve, gentler in the lab because every creature is at its cap; lab depths are not the shipped depth numbers); a floor boss gains its signature move at a landmark depth (depth 7 here). Each cell is the best team the search finds (win rate in ${S.foe.fights} fights, and the share of the team's HP left) against the classic line's.`,
    '',
  );
  md.push(
    `| Foe | Asks | ${DUNGEON_DEPTHS.map((d) => `Depth ${d}: best / classic`).join(' | ')} |`,
    `| --- | --- | ${DUNGEON_DEPTHS.map(() => '---:').join(' | ')} |`,
  );
  const foeData: Record<string, unknown> = {};
  /** The best gauntlet line of each foe at the deepest depth (where floor bosses have their signature), for the measured mechanics. */
  const foeBest = new Map<string, readonly Pick[]>();
  const bestAtMid: string[] = [];
  const mid = DUNGEON_DEPTHS[Math.min(2, DUNGEON_DEPTHS.length - 1)] ?? 5;
  for (const id of FOE_IDS) {
    const cells: string[] = [];
    const per: Record<number, unknown> = {};
    let name = id;
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
      // The usage tables count what the search found, not the classic line it was seeded with.
      for (const r of ranked.slice(0, 3))
        if (lineKey(r.line) !== lineKey(CLASSIC_LINE)) topLines.push(r.line);
      bestFoeLines.push(best.line);
      if (d === DUNGEON_DEPTHS[DUNGEON_DEPTHS.length - 1]) foeBest.set(id, best.line);
      const wb = gauntletStats(foe, best.line, S.foe.fights, `foe:${id}:${d}:b`);
      const wc = gauntletStats(foe, CLASSIC_LINE, S.foe.fights, `foe:${id}:${d}:c`);
      cells.push(
        `${pct(wb.winRate)} (${pct(wb.hpLeft)} HP) / ${pct(wc.winRate)} (${pct(wc.hpLeft)} HP)`,
      );
      per[d] = { best: best.line, bestWin: wb.winRate, classicWin: wc.winRate };
      if (d === mid) bestAtMid.push(`- ${foe.name}: ${best.line.map(pickName).join(', ')}`);
    }
    md.push(`| ${name} | ${FOE_ASKS.get(id) ?? ''} | ${cells.join(' | ')} |`);
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
      starts: S.runs.starts,
      keep: S.runs.keep,
      rounds: S.runs.rounds,
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
    `${picks} creatures in the top 5 from-scratch raid lines of each boss (not the lines written by hand or the classic party) and the top 3 gauntlet lines of each foe at each depth. Ratio is the Knack's share of those picks over its share of the pool of every form and Knack: 1.0 is what random picks would give, above 2 stands out, below 0.3 is rarely chosen.`,
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

  // Which mechanics a boss or foe really calls for: take the mechanic out of its best line and measure what the line loses.
  const RAID_DROP = 10;
  const FOE_DROP = 10;
  const deepest = DUNGEON_DEPTHS[DUNGEON_DEPTHS.length - 1] ?? 7;
  const foeAblation: { id: string; name: string; measured: Measured[] }[] = [];
  for (const id of FOE_IDS) {
    const line = foeBest.get(id);
    if (!line) continue;
    const foe = foeAt(id, deepest);
    const score = gauntletScore(foe);
    foeAblation.push({
      id,
      name: foe.name,
      measured: ablate(line, (l) => score(l, S.foe.fights, `report:foe:${id}:abl`).score),
    });
  }
  const calledBy = (mechanicId: string) => [
    ...raidAblation.flatMap((r) => {
      const m = r.measured.find((x) => x.mechanic.id === mechanicId);
      return m && m.drop >= RAID_DROP ? [{ name: r.name, drop: m.drop, unit: 'pts' }] : [];
    }),
    ...foeAblation.flatMap((r) => {
      const m = r.measured.find((x) => x.mechanic.id === mechanicId);
      return m && m.drop >= FOE_DROP ? [{ name: r.name, drop: m.drop, unit: 'score' }] : [];
    }),
  ];
  const measuredRows = MECHANICS.map((mechanic) => {
    const hasTool = raidAblation[0]?.measured.find((x) => x.mechanic.id === mechanic.id)?.hasTool;
    return { mechanic, hasTool: hasTool ?? false, callers: calledBy(mechanic.id) };
  });
  const bossSide = measuredRows.filter((r) => !r.hasTool);
  const notCalled = measuredRows.filter((r) => r.hasTool && r.callers.length === 0);
  md.push(
    '## Mechanics the bosses and foes call for (measured)',
    '',
    `Every Knack family, keyword, rule and talent kind should be the answer or the problem for at least one boss or foe. A mechanic is **called for** by a raid boss only when taking it out of that boss's best line or of its prepared line, the first written answer (its Knacks become none, its talents are dropped) lowers the weekend win rate by ${RAID_DROP} points or more, on the same seeds (${S.raid.weekends} weekends); a foe, when the best line's score at depth ${deepest} (where floor bosses have their signature) falls by ${FOE_DROP} or more (${S.foe.fights} fights). The drop is measured, not read off the boss's data. A mechanic only a boss has (an escalation feed, Adaptation) has no tool on a line to take out; those are in the features-present list below.`,
    '',
    '| Mechanic | Kind | Called for by (measured drop) |',
    '| --- | --- | --- |',
    ...measuredRows.map(
      ({ mechanic, hasTool, callers }) =>
        `| ${mechanic.name} | ${mechanic.group} | ${
          !hasTool
            ? 'boss-side only (no tool to take out)'
            : callers.length === 0
              ? '**none**'
              : `${callers.length}: ${callers
                  .slice(0, 4)
                  .map((x) => `${x.name} (-${Math.round(x.drop)} ${x.unit})`)
                  .join(', ')}${callers.length > 4 ? ', ...' : ''}`
        } |`,
    ),
    '',
    notCalled.length
      ? `**No boss or foe measurably calls for: ${notCalled.map((m) => `${m.mechanic.name} (${m.mechanic.group})`).join(', ')}.**`
      : '**Every mechanic with a tool is measurably called for by at least one boss or foe.**',
    '',
  );
  // The same table read the other way round: what each raid boss and foe measurably calls for (the aim: at least three each).
  const perBoss = [
    ...RAID_SPECS.map((spec) => {
      const entries = raidAblation.filter(
        (r) => r.id === spec.id || r.id === `${spec.id}:prepared`,
      );
      return {
        id: spec.id,
        name: entries[0]?.name ?? spec.id,
        named: MECHANICS.filter((mech) =>
          entries.some((r) =>
            r.measured.some((x) => x.mechanic.id === mech.id && x.drop >= RAID_DROP),
          ),
        ),
      };
    }),
    ...foeAblation.map((r) => ({
      id: r.id,
      name: r.name,
      named: r.measured.filter((x) => x.drop >= FOE_DROP).map((x) => x.mechanic),
    })),
  ];
  md.push(
    '### What each boss measurably calls for',
    '',
    'The same measure read per boss: the mechanics whose removal from its best line or its prepared line costs the weekend win rate (raid) or the score (foe) the drop above. A boss that names few is one the best lines beat without needing much; the aim is at least three each.',
    '',
    '| Boss or foe | Mechanics named | Which |',
    '| --- | ---: | --- |',
    ...perBoss.map(
      (b) =>
        `| ${b.name} | ${b.named.length} | ${b.named.map((m) => `${m.name} (${m.group})`).join(', ') || '-'} |`,
    ),
    '',
  );
  data['coveragePerBoss'] = Object.fromEntries(
    perBoss.map((b) => [b.id, b.named.map((m) => m.id)]),
  );
  data['mechanicsNotCalled'] = notCalled.map((m) => m.mechanic.id);
  data['mechanicsBossSide'] = bossSide.map((m) => m.mechanic.id);
  data['mechanicsTotal'] = MECHANICS.length;
  data['mechanicsMeasured'] = Object.fromEntries(
    measuredRows.map((r) => [
      r.mechanic.id,
      r.callers.map((c) => ({ ...c, drop: Math.round(c.drop) })),
    ]),
  );

  // The old structural check, kept as a separate list: which boss features exist, whether or not the best line needs them.
  const everyone: BossDef[] = [
    ...RAID_BOSS_IDS.map((id) => raidBossOf(id)),
    ...FOE_IDS.map((id) => foeAt(id, 7)),
  ];
  const cover = coverage(everyone);
  const missing = cover.filter((c) => c.callers.length === 0);
  md.push(
    '### Features present (not measured)',
    '',
    'What the bosses and foes have, read off their data by the predicates in `src/mechanics.ts`: a Knack family, keyword or rule that some boss or foe has a feature for. This does not say a team needs it; the measured table above does.',
    '',
    '| Mechanic | Kind | Present on |',
    '| --- | --- | --- |',
    ...cover.map(
      (c) =>
        `| ${c.mechanic.name} | ${c.mechanic.group} | ${
          c.callers.length === 0
            ? '**none**'
            : `${c.callers.length}: ${c.callers
                .slice(0, 4)
                .map((x) => x.name)
                .join(', ')}${c.callers.length > 4 ? ', ...' : ''}`
        } |`,
    ),
    '',
    missing.length
      ? `**No boss or foe has a feature for: ${missing.map((m) => `${m.mechanic.name} (${m.mechanic.group})`).join(', ')}.**`
      : '**Every mechanic has a feature on at least one boss or foe.**',
    '',
  );
  md.push(
    '## Not ported from the shipped bosses and foes',
    '',
    ...NOT_PORTED.map((t) => `- ${t}`),
    '',
  );
  data['featuresMissing'] = missing.map((m) => m.mechanic.id);
  return { md, data };
}

/** What each foe asks, from its spec (for the table). */
const FOE_ASKS = new Map(FOE_SPECS.map((s) => [s.id, s.asks]));

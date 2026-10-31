/**
 * The talent section of the lab report: the talents' share of a team's result (the target, `teamShareReport.ts`), then
 * best legal board with a talent against best legal board without it (gauntlet), a raid row for the raid-shaped talents,
 * and the check lines that find duds, must-picks and spikes (docs/design/decisions.md, "Talent strength is a share of
 * the team's result").
 */
import { content } from '@creatures/game';
import { CARDS, type CardDef } from './cards';
import { FORM_KNACKS } from './knacks';
import {
  RAID_REACH,
  RAID_SCALE,
  RAID_SHAPED,
  RAID_SLOTS,
  SCORE_WEIGHTS,
  bestOnMostCards,
  classicBossHp,
  createMeasurer,
  createRaidMeasurer,
  gainPercent,
  raidBossHp,
  type FormMeasure,
  type RaidMeasure,
} from './measure';
import { formStats } from './species';
import { LINE_POOLS, TALENTS } from './talents';
import { LEVEL } from './search';
import type { JobResults, JobSpec, Plan } from './jobs';
import type { TeamShareSummary } from './teamShareReport';
import type { Role } from './types';

/** The rounds in which the classic line should kill a plain boss on average, which sets the talent boss's HP. */
export const TALENT_BOSS_ROUNDS = 8;

/** A best score without a talent below this many points (of 100) gives no percentage: "n/a". */
export const MIN_BASE = 10;

/**
 * What the per-talent table checks (decisions.md, 2026-10-28). The strength target itself is the team share
 * (`TEAM_SHARE`); the table finds duds and must-picks. "About" is one point either way in the check lines.
 */
export const GOALS = {
  /** A talent whose best card gains more than this is a soft warning (a spike is fine, a runaway is not). */
  spikeWarn: 50,
  /** A non-plain talent judged below this is a dud. */
  dudBelow: 2,
  /** No must-pick: this many talents of a role in a pool within `mustPickPoints` of its best. */
  alternatives: 2,
  mustPickPoints: 3,
  /** A plain stat talent is the safe fallback. */
  plainMin: 2,
  plainMax: 5,
  /** "About". */
  slack: 1,
} as const;

/** The plain stat talents: small numbers, judged against their own band. */
export const PLAIN_TALENTS: ReadonlySet<string> = new Set(['sharp-claws', 'hardy']);

const ROLES = ['setter', 'payoff', 'guard', 'support'] as const;

export const lineOf = (form: string) => content.creatures.find((c) => c.id === form)?.line ?? form;
const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const signed = (x: number, d = 1) => `${x >= 0 ? '+' : ''}${x.toFixed(d)}`;

/** One talent on one form: what the gauntlet and the raid row measured. */
export interface Measured {
  readonly tid: string;
  readonly form: string;
  readonly line: string;
  readonly role: Role;
  readonly gauntlet: FormMeasure;
  readonly raid: RaidMeasure | undefined;
}

/** A gain in percent of the score without it (undefined when that is under MIN_BASE points). */
const pctOf = (w: number, o: number) => gainPercent(w, o, MIN_BASE);

/** The gauntlet gain of a set of measurements, in percent: mean best-with over mean best-without, on every card. */
export function gauntletPct(
  ms: readonly Measured[],
  cards: readonly CardDef[],
): number | undefined {
  const w = mean(ms.flatMap((m) => cards.map((c) => m.gauntlet.withTalent.get(c.id)?.score ?? 0)));
  const o = mean(ms.flatMap((m) => cards.map((c) => m.gauntlet.without.get(c.id)?.score ?? 0)));
  return pctOf(w, o);
}

/** The raid gain of a set of measurements, in percent at the best slot, scaled to the gauntlet's scale (`RAID_SCALE`). */
export function raidPct(ms: readonly Measured[], which: 'bestPct' | 'randomPct' = 'bestPct') {
  if (ms.length === 0 || ms.some((m) => m.raid === undefined)) return undefined;
  return mean(ms.map((m) => m.raid?.[which] ?? 0)) * RAID_SCALE;
}

/** The number a talent is judged on: the raid gain for a raid-shaped talent, the gauntlet gain for any other. */
export function judgedPct(
  tid: string,
  ms: readonly Measured[],
  cards: readonly CardDef[],
): number | undefined {
  return RAID_SHAPED.has(tid) ? raidPct(ms) : gauntletPct(ms, cards);
}

/** A talent's best card: the card where its gain is the largest share of the score without it (baseline of at least MIN_BASE points). */
export function bestCard(
  ms: readonly Measured[],
  cards: readonly CardDef[],
): { id: string; pct: number; points: number } {
  let best = { id: '', pct: 0, points: 0 };
  for (const c of cards) {
    const w = mean(ms.map((m) => m.gauntlet.withTalent.get(c.id)?.score ?? 0));
    const o = mean(ms.map((m) => m.gauntlet.without.get(c.id)?.score ?? 0));
    const p = pctOf(w, o);
    if (p !== undefined && p > best.pct) best = { id: c.id, pct: p, points: w - o };
  }
  return best;
}

export interface TalentGoals {
  readonly rows: number;
  /** Talent rows (role / talent) whose best card gains more than `GOALS.spikeWarn` percent (soft warning). */
  readonly spikes: readonly string[];
  /** Non-plain talent rows judged under `GOALS.dudBelow` percent (role / talent). */
  readonly duds: readonly string[];
  /** Pools (lines) with no must-pick in any role, and the lines. */
  readonly poolsOk: number;
  readonly pools: number;
  readonly failingPools: readonly string[];
  /** Plain stat talent rows within their band. */
  readonly plainOk: number;
  readonly plainRows: number;
  readonly raidRows: number;
}

/** The cards and settings the talent section runs with (its jobs and its assembly read the same ones). */
export interface TalentOptions {
  readonly cards: readonly CardDef[];
  readonly quick: boolean;
  /**
   * The jobs whose results the team share is measured on (the report's best-team searches). Without them the team
   * share searches for its teams itself, with the same seeds.
   */
  readonly teamNeeds?: readonly string[];
}

export interface TalentSection {
  md: string[];
  data: Record<string, unknown>;
  goals: TalentGoals;
  teamShare: TeamShareSummary;
  /** The team share part of `md` (also inside it), for the tuning loop. */
  teamMd: string[];
}

/** One form's measurements: for every talent of its pool that fits its role, the gauntlet and (raid-shaped talents) the raid row. */
export type FormMeasures = Record<string, { gauntlet: FormMeasure; raid?: RaidMeasure }>;

/** The boss HPs the talent section calibrates at report time (both depend only on the classic line). */
export interface TalentCalibration {
  readonly bossHp: number;
  readonly raidHp: number;
}

/** The talents of a form: those of its line's pool that fit its role. */
export function talentsOfForm(form: string): string[] {
  const role = formStats(form, LEVEL).role;
  return Object.keys(TALENTS).filter(
    (t) => TALENTS[t]?.roles.includes(role) && LINE_POOLS[lineOf(form)]?.includes(t),
  );
}

export const talentCalibrationId = 'talent:calibration';
export const talentFormId = (form: string) => `talent:form:${form}`;
export const talentTeamId = 'talent:team';

/** Calibrates the two bosses' HP: the classic line kills a plain boss in `TALENT_BOSS_ROUNDS`; the raid row loses 90% in ten rounds. */
export function calibrateTalents(quick: boolean): TalentCalibration {
  return {
    bossHp: classicBossHp(TALENT_BOSS_ROUNDS, quick ? 6 : 24),
    raidHp: raidBossHp(quick ? 2 : 6),
  };
}

/** Measures every talent of one form (the best board without a talent is shared by the form's talents, so they run together). */
export function measureForm(
  form: string,
  quick: boolean,
  cards: readonly CardDef[],
  calibration: TalentCalibration,
): FormMeasures {
  const seeds = quick ? 2 : 24;
  const measurer = createMeasurer({
    bossHp: calibration.bossHp,
    cards,
    seeds,
    rowSeeds: quick ? 6 : 24,
  });
  const raidMeasurer = createRaidMeasurer({ hp: calibration.raidHp, seeds });
  const out: FormMeasures = {};
  for (const tid of talentsOfForm(form))
    out[tid] = {
      gauntlet: measurer.measure(tid, form),
      ...(RAID_SHAPED.has(tid) ? { raid: raidMeasurer.measure(tid, form) } : {}),
    };
  return out;
}

/** The talent section as jobs: the calibration, one job per form, and the team share (after the teams it reads). */
export function planTalents(opts: TalentOptions): Plan<TalentSection> {
  const forms = ROLES.flatMap((role) =>
    Object.keys(FORM_KNACKS).filter(
      (f) => formStats(f, LEVEL).role === role && talentsOfForm(f).length > 0,
    ),
  );
  const needs = opts.teamNeeds ?? [];
  const jobs: JobSpec[] = [
    {
      id: talentCalibrationId,
      section: 'Talents: calibration',
      kind: 'talent-calibration',
      args: { quick: opts.quick },
      needs: [],
    },
    ...forms.map((form): JobSpec => ({
      id: talentFormId(form),
      section: 'Talents: per-form measurements',
      kind: 'talent-form',
      args: { form, quick: opts.quick },
      needs: [talentCalibrationId],
    })),
    {
      id: talentTeamId,
      section: 'Talents: team share',
      kind: 'talent-team',
      args: { quick: opts.quick, fromJobs: needs.length > 0 },
      needs,
    },
  ];
  return { jobs, assemble: (results) => assembleTalents(opts, results) };
}

function assembleTalents(opts: TalentOptions, results: JobResults): TalentSection {
  const { cards, quick } = opts;
  const talentSeeds = quick ? 2 : 24;
  const raidSeeds = quick ? 2 : 24;
  const { bossHp, raidHp } = results.get(talentCalibrationId) as TalentCalibration;
  const team = results.get(talentTeamId) as {
    md: string[];
    data: Record<string, unknown>;
    summary: TeamShareSummary;
  };
  const measureOf = (tid: string, form: string) => {
    const m = (results.get(talentFormId(form)) as FormMeasures | undefined)?.[tid];
    if (!m) throw new Error(`no measurement of ${tid} on ${form}`);
    return m;
  };
  const md: string[] = [
    '## Talents: best board with it against best board without it (gauntlet and raid row)',
    '',
    `**The boss.** Its HP is ${bossHp.toLocaleString('en')}, calibrated at report time so that the classic line kills a plain boss in about ${TALENT_BOSS_ROUNDS} of the 10 rounds on average, so the length of the fight matters (the boss of the other sections has a million HP, so fights always last ten rounds there).`,
    '',
    `**The score** of one fight, 0 to 100: ${SCORE_WEIGHTS.damage} for the share of the boss's HP removed, ${SCORE_WEIGHTS.win} for a win, up to ${SCORE_WEIGHTS.speed} for the rounds a win left unused (fewer rounds is better), and up to ${SCORE_WEIGHTS.standing} for the share of the three creatures still standing (a knockout costs ${SCORE_WEIGHTS.standing / 3} points). A talent that saves creatures or ends the fight sooner shows it.`,
    '',
    ...team.md,
    `**The boards.** Every form whose line's pool has the talent and whose role it fits, with no Knack on the measured form (the Mire talents carry the line's Mire Knack, with and without, because they do nothing without one). The form stands in each of the three slots with two fixed fitting partners in either order, for two partner sets (the natural team's partners, and the classic trio's two other roles with their classic Knacks): up to 12 legal boards. The score is the best board with the talent and the best board without it, each chosen on its own, on every card (${talentSeeds} seeds each, the same seeds for every board), averaged over those forms and cards. Gain is the difference in points; the percentage is against the best score without it and reads n/a when that is under ${MIN_BASE} points. Knockouts are per fight (with / without), on the best board of each. Nothing here forces a board for a talent: a position talent pays for standing where it wants to.`,
    '',
    `**Raid gain.** The raid-shaped talents (${[...RAID_SHAPED].map((t) => TALENTS[t]?.name ?? t).join(', ')}) also run on a raid row: 3 rows of 12, the classic trio in order with one slot in four a creature of the form's own element (so neighbour talents have kin to read), and one creature of the form in one slot. The boss has Great Wave (every second round) and Payoff Hunter, and ${raidHp.toLocaleString('en')} HP (the classic row removes 90% of it in ten rounds, so a win never hides a small gain and a Finisher has its last rounds). The form is tried in ${RAID_SLOTS.length} slots (ends, near the ends and the middle, in every row) and one random slot, ${raidSeeds} seeds each, with the talent and without it on the same seeds, so a slot is compared with itself. The score of a fight is the damage of the creature and the creatures within ${RAID_REACH} slots of it in its row, weighted by how many of them still stand: one creature of 36 is too small a share of the raid to read through the noise of a fight. The raid gain is the gain at the best slot for the talent (where it gains most), in percent of the score without it, scaled by ${RAID_SCALE.toFixed(2)} (the five of the neighbourhood over the three of the gauntlet) to read on the gauntlet's scale; the random slot's gain is shown beside it. A raid-shaped talent is judged on the raid gain; the others on the gauntlet gain.`,
    '',
    `**Holds** is the share of fights in which the talent's condition held or its trigger fired at least once, on the form's natural board (every card, no board chosen for it) and in a row 12 wide (the form at a random slot among mixed classic creatures, plain card, a boss with four times the HP; this is the raid rate for position talents). Flat stats always hold. **Best card** is where it gains most, as a share of the score without it. A talent that is top of its role on most cards is flagged "best on most cards" and is a new default pick.`,
    '',
    '| Role | Talent | Best with | Best without | Gain | Gain % | Raid gain | Raid gain (random slot) | Knockouts with / without | Holds (natural) | Holds (row of 12) | Best card | Flag |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |',
  ];
  const talentValue: Record<string, unknown> = {};
  const topPicks: string[] = [];
  const rangeGains: number[] = [];
  const measured: Measured[] = [];
  /** Per role and talent: the judged gain (percent), the gauntlet gain and the best card gain, for the goal checks. */
  const rowsOut: {
    role: Role;
    tid: string;
    judged: number | undefined;
    bestCardPct: number;
  }[] = [];

  for (const role of ROLES) {
    const roleForms = Object.keys(FORM_KNACKS).filter((f) => formStats(f, LEVEL).role === role);
    const gains = new Map<string, Map<string, number>>();
    const rows: { tid: string; cells: string[] }[] = [];
    for (const tid of Object.keys(TALENTS).filter((t) => TALENTS[t]?.roles.includes(role))) {
      const forms = roleForms.filter((f) => LINE_POOLS[lineOf(f)]?.includes(tid));
      if (forms.length === 0) continue;
      const ms: Measured[] = forms.map((f) => ({
        tid,
        form: f,
        line: lineOf(f),
        role,
        gauntlet: measureOf(tid, f).gauntlet,
        raid: measureOf(tid, f).raid,
      }));
      measured.push(...ms);
      const cell = (m: Measured, cid: string) => ({
        w: m.gauntlet.withTalent.get(cid),
        o: m.gauntlet.without.get(cid),
      });
      const byCard = new Map<string, number>();
      for (const c of cards)
        byCard.set(
          c.id,
          mean(ms.map((m) => (cell(m, c.id).w?.score ?? 0) - (cell(m, c.id).o?.score ?? 0))),
        );
      gains.set(tid, byCard);
      const all = (pick: (c: ReturnType<typeof cell>) => number | undefined) =>
        ms.flatMap((m) => cards.map((c) => pick(cell(m, c.id)) ?? 0));
      const withScore = mean(all((c) => c.w?.score));
      const withoutScore = mean(all((c) => c.o?.score));
      const koWith = mean(all((c) => c.w?.ko));
      const koWithout = mean(all((c) => c.o?.ko));
      const gain = withScore - withoutScore;
      const gainPct = gainPercent(withScore, withoutScore, MIN_BASE);
      const raid = raidPct(ms);
      const raidRandom = raidPct(ms, 'randomPct');
      const judged = judgedPct(tid, ms, cards);
      const top = bestCard(ms, cards);
      rangeGains.push(gain);
      const defined = (xs: (number | undefined)[]) =>
        xs.length && xs.every((x) => x !== undefined) ? mean(xs) : undefined;
      const holdsNat = defined(ms.map((m) => m.gauntlet.holdsNatural));
      const holdsRow = defined(ms.map((m) => m.gauntlet.holdsRow));
      const share = (x: number | undefined) =>
        x === undefined ? 'always' : `${Math.round(x * 100)}%`;
      rowsOut.push({ role, tid, judged, bestCardPct: top.pct });
      talentValue[`${role}/${tid}`] = {
        forms: forms.length,
        withScore: Math.round(withScore * 10) / 10,
        withoutScore: Math.round(withoutScore * 10) / 10,
        gain: Math.round(gain * 100) / 100,
        gainPercent: gainPct === undefined ? null : Math.round(gainPct * 10) / 10,
        raidGainPercent: raid === undefined ? null : Math.round(raid * 10) / 10,
        raidRandomPercent: raidRandom === undefined ? null : Math.round(raidRandom * 10) / 10,
        koWith: Math.round(koWith * 100) / 100,
        koWithout: Math.round(koWithout * 100) / 100,
        holdsNatural: holdsNat === undefined ? 'always' : Math.round(holdsNat * 100) / 100,
        holdsRow: holdsRow === undefined ? 'always' : Math.round(holdsRow * 100) / 100,
        best: top.id,
        bestPercent: Math.round(top.pct * 10) / 10,
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
          RAID_SHAPED.has(tid) ? (raid === undefined ? 'n/a' : `${signed(raid)}%`) : '-',
          RAID_SHAPED.has(tid)
            ? raidRandom === undefined
              ? 'n/a'
              : `${signed(raidRandom)}%`
            : '-',
          `${koWith.toFixed(2)} / ${koWithout.toFixed(2)}`,
          share(holdsNat),
          share(holdsRow),
          top.points > 0.5
            ? `${CARDS.find((c) => c.id === top.id)?.name ?? top.id} ${signed(top.points)} (${signed(top.pct, 0)}%)`
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

  const goals = checkGoals(measured, rowsOut, cards);
  md.push(
    '',
    `**Talent gain range:** ${signed(Math.min(...rangeGains))} to ${signed(Math.max(...rangeGains))} points of 100. **Best on most cards of its role:** ${topPicks.length ? topPicks.join(', ') : 'none'}.`,
    '',
    ...goalLines(goals),
    '',
  );
  return {
    md,
    data: {
      talentValue,
      talentBoss: { hp: bossHp, targetRounds: TALENT_BOSS_ROUNDS, seeds: talentSeeds },
      talentRaid: { hp: raidHp, seeds: raidSeeds, scale: RAID_SCALE },
      talentTopPicks: topPicks,
      talentGoals: goals,
      ...team.data,
    },
    goals,
    teamShare: team.summary,
    teamMd: team.md,
  };
}

/** Whether a number is inside a band, with the check lines' one point of slack. */
const within = (x: number | undefined, lo: number, hi: number): boolean =>
  x !== undefined && x >= lo - GOALS.slack && x <= hi + GOALS.slack;

/** Counts how many talents and pools meet the talent strength targets (see `GOALS`). */
export function checkGoals(
  measured: readonly Measured[],
  rows: readonly { role: Role; tid: string; judged: number | undefined; bestCardPct: number }[],
  cards: readonly CardDef[],
): TalentGoals {
  const G = GOALS;
  const label = (r: { role: Role; tid: string }) => `${TALENTS[r.tid]?.name ?? r.tid} (${r.role})`;
  const spikes = rows
    .filter((r) => r.bestCardPct > G.spikeWarn)
    .map((r) => `${label(r)} +${Math.round(r.bestCardPct)}%`);
  const good = rows.filter((r) => !PLAIN_TALENTS.has(r.tid));
  const duds = good
    .filter((r) => r.judged !== undefined && r.judged < G.dudBelow)
    .map((r) => `${label(r)} ${signed(r.judged ?? 0)}%`);
  const plain = rows.filter((r) => PLAIN_TALENTS.has(r.tid));
  const plainOk = plain.filter((r) => within(r.judged, G.plainMin, G.plainMax)).length;
  // Pools: in every line, for every role of the line, at least `alternatives` talents within `mustPickPoints` of the best.
  const failing: string[] = [];
  for (const line of Object.keys(LINE_POOLS)) {
    const roles = [
      ...new Set(content.creatures.filter((c) => c.line === line).map((c) => c.role)),
    ] as Role[];
    const bad: string[] = [];
    for (const role of roles) {
      const gains: { tid: string; g: number }[] = [];
      for (const tid of LINE_POOLS[line] ?? []) {
        const ms = measured.filter((m) => m.line === line && m.role === role && m.tid === tid);
        const g = judgedPct(tid, ms, cards);
        if (ms.length > 0 && g !== undefined) gains.push({ tid, g });
      }
      gains.sort((a, b) => b.g - a.g);
      const top = gains[0]?.g ?? 0;
      const near = gains.filter((x) => x.g >= top - G.mustPickPoints).length;
      if (near < G.alternatives)
        bad.push(
          `${role}: ${gains
            .slice(0, 3)
            .map((x) => `${TALENTS[x.tid]?.name ?? x.tid} ${signed(x.g)}`)
            .join(', ')}`,
        );
    }
    if (bad.length) failing.push(`${line} (${bad.join('; ')})`);
  }
  const pools = Object.keys(LINE_POOLS).length;
  return {
    rows: rows.length,
    spikes,
    duds,
    poolsOk: pools - failing.length,
    pools,
    failingPools: failing,
    plainOk,
    plainRows: plain.length,
    raidRows: rows.filter((r) => RAID_SHAPED.has(r.tid)).length,
  };
}

/** The check lines under the talent table, one per check. */
export function goalLines(g: TalentGoals): string[] {
  const G = GOALS;
  return [
    `**Per-talent checks** (Misa, 2026-10-28; "about" is ${G.slack} point either way; a raid-shaped talent is judged on its raid gain, ${g.raidRows} of ${g.rows} rows). The strength target is the team share at the top of this section; these find duds, must-picks and runaways:`,
    '',
    `- Pools with no must-pick (every role of the line has at least ${G.alternatives} talents within ${G.mustPickPoints} points of its best): ${g.poolsOk} of ${g.pools}${g.failingPools.length ? `. Short: ${g.failingPools.join(', ')}` : ''}.`,
    `- Duds (non-plain talents judged under +${G.dudBelow}%): ${g.duds.length} of ${g.rows - g.plainRows}${g.duds.length ? `: ${g.duds.join(', ')}` : ''}.`,
    `- Plain stat talents (Sharp Claws, Hardy) at +${G.plainMin}% to +${G.plainMax}%: ${g.plainOk} of ${g.plainRows} talent rows.`,
    `- Soft warning, a best card over +${G.spikeWarn}% (a spike on the card a talent fits is fine, a runaway is not): ${g.spikes.length ? g.spikes.join(', ') : 'none'}.`,
    '',
    'A talent may gain more than its average on the card it fits best (a talent that gains 5% overall gains two to three times that on the card where the team does worst, because the same points are a bigger share of a smaller score), as long as no pool has a single must-pick. A counter (Unbothered, Refuse to Fall, Brace) or a discrete effect (Deep Ink adds whole counts) is judged on one number for every card.',
  ];
}

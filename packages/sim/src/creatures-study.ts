import { unlockLadder } from '@creatures/game';
import { DEFAULT_JOURNEY_MIX, PRESET_IDS, type PlayerProfile } from './profiles';
import type { DayRecord, PlayerJourney } from './journey';
import { defaultProfiles, runJourneyServer, type JourneySettings } from './journey-run';
import { mean, median, round } from './util';

/**
 * The creatures study (docs/balance/log.md B-014): plays whole journey servers and reports, per profile
 * and week, what the new catching brings (docs/design/gear-and-creatures-v2.md sections 8 and 9.5):
 * creatures per week, duplicates per week and what each was answered with, species owned and the week
 * the base catalogue was complete, Bait split between levels, lures and talent slots, and the share of
 * fight power the talents give. Creatures B (docs/design/gear-and-creatures-v2.md section 9 and the
 * new-species pity) adds the pace of the levels (the week the best creature and the raid team reached 10, 15,
 * 20 and 30, and the longest stretch without an unlock), the experience by source, treats, ribbons and the
 * pity. Variants differ by tuning overrides (`applyOverrides`); a report per
 * variant is written as JSON and `creaturesMarkdown` lays several side by side.
 */

/** What one profile looked like at the end of one week (means over its players, counts per week). */
export interface WeekMetrics {
  week: number;
  players: number;
  /** Catch rolls, creatures that came, rolls that brought none, and the duplicates among the creatures. */
  rolls: number;
  catches: number;
  empty: number;
  newSpecies: number;
  dupes: number;
  /** What the duplicates were answered with (Recommended). */
  taught: number;
  fused: number;
  released: number;
  /** Golden talents rolled, and talents put into a slot from the book. */
  golden: number;
  slotted: number;
  /** Lures carried and crafted. */
  luresUsed: number;
  luresCrafted: number;
  /** The week's Bait: earned, and spent on treats, lures and talent slots. */
  baitEarned: number;
  baitTreats: number;
  baitLures: number;
  baitSlots: number;
  /** Base species owned at the end of the week. */
  species: number;
  /** Levels gained, and experience earned by source (a treat's doubling included): trips, dungeon, raids, jobs. */
  levelUps: number;
  expTrip: number;
  expDungeon: number;
  expRaid: number;
  expJob: number;
  /** Treats packed and ribbons bought. */
  treats: number;
  ribbons: number;
  /** The best creature's level and the raid team's lowest, at the end of the week (medians). */
  topLevel: number;
  teamMinLevel: number;
  /** Raid team power (Attack + HP score) and the fight-scored power, and the share talents give of it. */
  power: number;
  fightPower: number | null;
  /** `1 - fightPowerNoTalents / fightPower` as a fraction, or null when the week was not scored. */
  talentShare: number | null;
  /** The same for fusion and gear (`1 - without / fightPower`), and the Attack + HP score's split (Shapley) as fractions of the team's power. */
  fusionShare: number | null;
  gearShare: number | null;
  levelsStatShare: number;
  evolutionStatShare: number;
  fusionStatShare: number;
  gearStatShare: number;
  /** The raid team's mean fusion level and how many of its creatures are at the maximum (means). */
  teamFusion: number;
  teamMaxFused: number;
}

/** The levels a profile's players reach: the pace the design asks for (spec 9.2) and the unlock stretches (9.3a). */
export interface PaceMetrics {
  /** Median week (since joining) the best creature first reached each level; null when fewer than half did. */
  best: Record<string, number | null>;
  /** The same for the raid team's lowest creature (the whole trio). */
  trio: Record<string, number | null>;
  /** Median week the first creature evolved. */
  evolution: number | null;
  /** Median over players of the longest stretch, in days, the best creature went without reaching an unlock level. */
  stretchDays: number | null;
  /** The widest gap, in levels, between two neighbouring unlocks of the ladder (a fact of the ladder). */
  stretchLevels: number;
}

export interface ProfileMetrics {
  id: string;
  label: string;
  players: number;
  weeks: WeekMetrics[];
  pace: PaceMetrics;
  /** The median week (since joining) the base catalogue was complete, over the players who completed it. */
  catalogueWeek: number | null;
  /** Share of the players who completed it within the run. */
  catalogueDone: number;
}

export interface CreaturesRun {
  label: string;
  /** The tuning overrides the run was played with (`applyOverrides`), for the record. */
  set: string;
  seed: string;
  seeds: number;
  servers: number;
  weeks: number;
  profiles: ProfileMetrics[];
}

export interface StudySettings {
  seed: string;
  /** Independent seeds; each plays `servers` servers. */
  seeds: number;
  servers: number;
  weeks: number;
  /** Play with the valley's weather (default: on, as shipped). */
  weather?: boolean;
}

type NumberKey = {
  [K in keyof DayRecord]: DayRecord[K] extends number ? K : never;
}[keyof DayRecord];

function field(d: DayRecord | undefined, key: NumberKey): number {
  return d === undefined ? 0 : d[key];
}

function weekEnd(journey: PlayerJourney, week: number): DayRecord | undefined {
  let found: DayRecord | undefined;
  for (const d of journey.days) if (d.week === week) found = d;
  return found;
}

function weekMetrics(week: number, journeys: readonly PlayerJourney[]): WeekMetrics {
  const rows = journeys.flatMap((j) => {
    const end = weekEnd(j, week);
    return end === undefined ? [] : [{ end, before: week > 1 ? weekEnd(j, week - 1) : undefined }];
  });
  type Row = (typeof rows)[number];
  const avg = (f: (r: Row) => number): number => round(mean(rows.map(f)) ?? 0, 2);
  const delta = (key: NumberKey): number => avg((r) => field(r.end, key) - field(r.before, key));
  const held = (key: NumberKey): number => avg((r) => field(r.end, key));
  // The share is over the players whose week was scored (the last day of the week carries the score).
  const scored = rows.filter(
    (r) => r.end.fightPower !== null && r.end.fightPowerNoTalents !== null && r.end.fightPower > 0,
  );
  const share =
    scored.length === 0
      ? null
      : round(
          mean(
            scored.map(
              (r) => 1 - (r.end.fightPowerNoTalents as number) / (r.end.fightPower as number),
            ),
          ) ?? 0,
          4,
        );
  const fights = rows.filter((r) => r.end.fightPower !== null);
  const shareOf = (without: (r: Row) => number | null): number | null => {
    const used = scored.filter((r) => without(r) !== null);
    return used.length === 0
      ? null
      : round(
          mean(used.map((r) => 1 - (without(r) as number) / (r.end.fightPower as number))) ?? 0,
          4,
        );
  };
  const stat = (key: 'levels' | 'evolution' | 'fusion' | 'gear'): number =>
    round(mean(rows.map((r) => (r.end.power > 0 ? r.end[key] / r.end.power : 0))) ?? 0, 4);
  return {
    week,
    players: rows.length,
    rolls: delta('catchRolls'),
    catches: delta('catches'),
    empty: delta('emptyRolls'),
    newSpecies: avg((r) => r.end.speciesOwned - (r.before?.speciesOwned ?? 0)),
    dupes: delta('dupes'),
    taught: delta('dupesTaught'),
    fused: delta('dupesFused'),
    released: delta('dupesReleased'),
    golden: delta('goldenTalents'),
    slotted: delta('talentSlots'),
    luresUsed: delta('luresUsed'),
    luresCrafted: delta('luresCrafted'),
    baitEarned: held('weekBaitEarned'),
    baitTreats: held('weekBaitTreats'),
    baitLures: held('weekBaitLures'),
    baitSlots: held('weekBaitSlots'),
    levelUps: held('levelUps'),
    expTrip: delta('expTrip'),
    expDungeon: delta('expDungeon'),
    expRaid: delta('expRaid'),
    expJob: delta('expJob'),
    treats: delta('treats'),
    ribbons: delta('ribbons'),
    topLevel: round(median(rows.map((r) => r.end.topLevel)) ?? 0, 1),
    teamMinLevel: round(median(rows.map((r) => r.end.teamMinLevel)) ?? 0, 1),
    species: held('speciesOwned'),
    power: held('power'),
    fightPower:
      fights.length === 0
        ? null
        : round(mean(fights.map((r) => r.end.fightPower as number)) ?? 0, 1),
    talentShare: share,
    fusionShare: shareOf((r) => r.end.fightPowerNoFusion),
    gearShare: shareOf((r) => r.end.fightPowerBare),
    levelsStatShare: stat('levels'),
    evolutionStatShare: stat('evolution'),
    fusionStatShare: stat('fusion'),
    gearStatShare: stat('gear'),
    teamFusion: round(mean(rows.map((r) => r.end.teamFusion)) ?? 0, 2),
    teamMaxFused: held('teamMaxFused'),
  };
}

/** The week (1-based, since joining) a journey first held every species a trip can find; null if never. */
export function catalogueWeekOf(journey: PlayerJourney): number | null {
  const day = journey.milestones['catalogue_complete'];
  return day === undefined ? null : Math.ceil(day / 7);
}

/** The levels a profile's pace is reported at. */
export const PACE_LEVELS = [10, 15, 20, 30] as const;

/** The day (since joining, 1-based) a journey's value of `key` first reached `level`; null if never. */
function dayReaching(journey: PlayerJourney, key: 'topLevel' | 'teamMinLevel', level: number) {
  return journey.days.find((d) => d[key] >= level)?.day ?? null;
}

/** The levels of the unlock ladder of a creature that evolves (spec 9.3a), and their widest gap. */
export function ladderLevels(): number[] {
  return [...new Set(unlockLadder('rare', 15).map((u) => u.level))].sort((a, b) => a - b);
}

/** The week (since joining) most players of a group reached something; null when fewer than half did. */
function medianWeek(days: readonly (number | null)[]): number | null {
  const reached = days.flatMap((d) => (d === null ? [] : [Math.ceil(d / 7)]));
  return reached.length * 2 < days.length ? null : median(reached);
}

/** The pace of the levels of a group of journeys (see `PaceMetrics`). */
export function paceOf(journeys: readonly PlayerJourney[]): PaceMetrics {
  const best: Record<string, number | null> = {};
  const trio: Record<string, number | null> = {};
  for (const level of PACE_LEVELS) {
    best[String(level)] = medianWeek(journeys.map((j) => dayReaching(j, 'topLevel', level)));
    trio[String(level)] = medianWeek(journeys.map((j) => dayReaching(j, 'teamMinLevel', level)));
  }
  const evolutionDays = journeys.map((j) => j.milestones['first_evolution'] ?? null);
  const ladder = ladderLevels();
  const stretches = journeys.map((j) => {
    // Day 1 is the first unlock (the Hat); then every ladder level the best creature reached.
    const days = [1, ...ladder.map((level) => dayReaching(j, 'topLevel', level))].flatMap((d) =>
      d === null ? [] : [d],
    );
    let longest = 0;
    for (let i = 1; i < days.length; i++)
      longest = Math.max(longest, (days[i] as number) - (days[i - 1] as number));
    return longest;
  });
  const widest = [1, ...ladder].reduce(
    (w, level, i, all) => (i === 0 ? w : Math.max(w, level - (all[i - 1] as number))),
    0,
  );
  return {
    best,
    trio,
    evolution: medianWeek(evolutionDays),
    stretchDays: median(stretches),
    stretchLevels: widest,
  };
}

/** Plays the servers of every seed and summarises each profile's journeys. */
export function runCreaturesStudy(
  label: string,
  set: string,
  study: StudySettings,
  profiles: readonly PlayerProfile[] = defaultProfiles(),
): CreaturesRun {
  const journeys: PlayerJourney[] = [];
  for (let s = 0; s < study.seeds; s++) {
    const settings: JourneySettings = {
      seed: `${study.seed}-${String(s + 1)}`,
      weeks: study.weeks,
      servers: study.servers,
      income: 'allowance',
      profiles,
      mix: DEFAULT_JOURNEY_MIX,
      mixName: 'default',
      noise: false,
      ...(study.weather === false ? { weather: false } : {}),
    };
    for (let k = 0; k < study.servers; k++)
      journeys.push(...runJourneyServer(settings, k).journeys);
  }
  const out: ProfileMetrics[] = [];
  for (const id of PRESET_IDS) {
    const mine = journeys.filter((j) => j.profile === id);
    if (mine.length === 0) continue;
    const done = mine.flatMap((j) => {
      const w = catalogueWeekOf(j);
      return w === null ? [] : [w];
    });
    out.push({
      id,
      label: profiles.find((p) => p.id === id)?.label ?? id,
      players: mine.length,
      weeks: Array.from({ length: study.weeks }, (_, k) => weekMetrics(k + 1, mine)),
      pace: paceOf(mine),
      catalogueWeek: median(done),
      catalogueDone: round(done.length / mine.length, 3),
    });
  }
  return {
    label,
    set,
    seed: study.seed,
    seeds: study.seeds,
    servers: study.servers,
    weeks: study.weeks,
    profiles: out,
  };
}

/**
 * What the balance targets read from a creatures run (`pnpm sim`, `creatures-*` in `targets.json`), from
 * week `fromWeek` on (the first weeks are the start-up): per profile, the creatures a week
 * (`creatures.<id>.catchesPerWeek`), the duplicates a week (`creatures.<id>.dupesPerWeek`), the weeks to
 * complete the base catalogue (`creatures.<id>.catalogueWeeks`, the run's length plus one when most
 * players never did) and, for the min-maxer, the talents' share of fight power at the end of the run
 * (`creatures.min-maxer.talentShareEnd`) and the share of the Bait that went to lures
 * (`creatures.<id>.lureBaitShare`).
 */
export function creaturesMetrics(run: CreaturesRun, fromWeek = 3): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of run.profiles) {
    const weeks = p.weeks.filter((w) => w.week >= fromWeek);
    if (weeks.length === 0) continue;
    const per = (f: (w: WeekMetrics) => number): number =>
      weeks.reduce((n, w) => n + f(w), 0) / weeks.length;
    out[`creatures.${p.id}.catchesPerWeek`] = round(
      per((w) => w.catches),
      3,
    );
    out[`creatures.${p.id}.dupesPerWeek`] = round(
      per((w) => w.dupes),
      3,
    );
    out[`creatures.${p.id}.catalogueWeeks`] =
      p.catalogueWeek === null || p.catalogueDone < 0.5 ? run.weeks + 1 : p.catalogueWeek;
    const earned = weeks.reduce((n, w) => n + w.baitEarned, 0);
    out[`creatures.${p.id}.lureBaitShare`] =
      earned === 0 ? 0 : round(weeks.reduce((n, w) => n + w.baitLures, 0) / earned, 4);
    for (const level of PACE_LEVELS) {
      const week = p.pace.trio[String(level)];
      out[`creatures.${p.id}.trioLevel${String(level)}Week`] = week ?? run.weeks + 1;
    }
    out[`creatures.${p.id}.stretchLevels`] = p.pace.stretchLevels;
    const last = [...p.weeks].reverse().find((w) => w.talentShare !== null);
    if (last?.talentShare !== null && last?.talentShare !== undefined) {
      out[`creatures.${p.id}.talentShareEnd`] = last.talentShare;
    }
  }
  return out;
}

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const line = (cells: readonly string[]): string => `| ${cells.join(' | ')} |`;
  return [line(header), line(header.map(() => '---')), ...rows.map(line)].join('\n');
}

const f1 = (x: number): string => x.toFixed(1);
const pct = (x: number | null): string => (x === null ? '-' : `${(x * 100).toFixed(1)}%`);

/** Weeks the tables show. */
export const STUDY_WEEKS = [1, 4, 6, 12, 20, 30] as const;

/** Variants side by side, one table per profile and measure, rows are the variants. */
export function creaturesMarkdown(
  runs: readonly CreaturesRun[],
  weeks: readonly number[] = STUDY_WEEKS,
): string {
  const out: string[] = ['# Creatures study', ''];
  for (const r of runs) {
    out.push(
      `- **${r.label}**${r.set === '' ? '' : ` (\`${r.set}\`)`}: ${String(r.seeds)} seeds x ${String(r.servers)} servers x ${String(r.weeks)} weeks, seed "${r.seed}"`,
    );
  }
  const ids = [...new Set(runs.flatMap((r) => r.profiles.map((p) => p.id)))];
  const at = (r: CreaturesRun, id: string, week: number): WeekMetrics | undefined =>
    r.profiles.find((p) => p.id === id)?.weeks[week - 1];
  const measures: { title: string; cell: (m: WeekMetrics) => string }[] = [
    {
      title: 'Catch rolls / creatures / duplicates per week',
      cell: (m) => `${f1(m.rolls)} / ${f1(m.catches)} / ${f1(m.dupes)}`,
    },
    {
      title: 'Duplicates answered per week: taught / fused / released',
      cell: (m) => `${f1(m.taught)} / ${f1(m.fused)} / ${f1(m.released)}`,
    },
    { title: 'New species per week', cell: (m) => f1(m.newSpecies) },
    { title: 'Base species owned', cell: (m) => f1(m.species) },
    {
      title: 'Best creature level / raid team lowest level (median, end of the week)',
      cell: (m) => `${f1(m.topLevel)} / ${f1(m.teamMinLevel)}`,
    },
    {
      title: 'Experience per week: trips / dungeon / raids / jobs',
      cell: (m) =>
        `${m.expTrip.toFixed(0)} / ${m.expDungeon.toFixed(0)} / ${m.expRaid.toFixed(0)} / ${m.expJob.toFixed(0)}`,
    },
    {
      title: 'Levels gained / treats packed / ribbons bought per week',
      cell: (m) => `${f1(m.levelUps)} / ${f1(m.treats)} / ${f1(m.ribbons)}`,
    },
    {
      title: 'Bait per week: earned / treats / lures / talent slots',
      cell: (m) =>
        `${m.baitEarned.toFixed(0)} / ${m.baitTreats.toFixed(0)} / ${m.baitLures.toFixed(0)} / ${m.baitSlots.toFixed(0)}`,
    },
    {
      title: 'Lures carried / crafted per week',
      cell: (m) => `${f1(m.luresUsed)} / ${f1(m.luresCrafted)}`,
    },
    {
      title: 'Golden talents / talents slotted from the book per week',
      cell: (m) => `${f1(m.golden)} / ${f1(m.slotted)}`,
    },
    {
      title: "Talents' share of fight power (weeks that were scored)",
      cell: (m) => pct(m.talentShare),
    },
    {
      title: "Fusion's / gear's share of fight power (weeks that were scored)",
      cell: (m) => `${pct(m.fusionShare)} / ${pct(m.gearShare)}`,
    },
    {
      title: 'Attack + HP split: levels / evolution / fusion / gear',
      cell: (m) =>
        `${pct(m.levelsStatShare)} / ${pct(m.evolutionStatShare)} / ${pct(m.fusionStatShare)} / ${pct(m.gearStatShare)}`,
    },
    {
      title: 'Team mean fusion level / creatures at the maximum',
      cell: (m) => `${m.teamFusion.toFixed(2)} / ${m.teamMaxFused.toFixed(2)}`,
    },
    { title: 'Team power', cell: (m) => m.power.toFixed(0) },
  ];
  for (const id of ids) {
    const label = runs.flatMap((r) => r.profiles).find((p) => p.id === id)?.label ?? id;
    out.push('', `## ${label}`);
    out.push(
      '',
      `Weeks to complete the base catalogue (median; share who did): ${runs
        .map((r) => {
          const p = r.profiles.find((x) => x.id === id);
          return `${r.label} ${p?.catalogueWeek === null || p === undefined ? 'never' : String(p.catalogueWeek)} (${String(Math.round((p?.catalogueDone ?? 0) * 100))}%)`;
        })
        .join(', ')}`,
    );
    const paces = runs.map((r) => ({ r, pace: r.profiles.find((x) => x.id === id)?.pace }));
    out.push(
      '',
      `**Pace: week (since joining) the best creature / the whole raid trio reached a level (median; "-" when fewer than half did)**`,
      '',
      table(
        ['Variant', ...PACE_LEVELS.map((l) => `level ${String(l)}`), 'evolved', 'longest stretch'],
        paces.map(({ r, pace }) => [
          r.label,
          ...PACE_LEVELS.map(
            (l) => `${pace?.best[String(l)] ?? '-'} / ${pace?.trio[String(l)] ?? '-'}`,
          ),
          String(pace?.evolution ?? '-'),
          pace === undefined
            ? '-'
            : `${String(pace.stretchDays ?? '-')} days (ladder gap at most ${String(pace.stretchLevels)} levels)`,
        ]),
      ),
    );
    for (const m of measures) {
      out.push(
        '',
        `**${m.title}**`,
        '',
        table(
          ['Variant', ...weeks.map((w) => `week ${String(w)}`)],
          runs.map((r) => [
            r.label,
            ...weeks.map((w) => {
              const x = at(r, id, w);
              return x === undefined ? '-' : m.cell(x);
            }),
          ]),
        ),
      );
    }
  }
  return `${out.join('\n')}\n`;
}

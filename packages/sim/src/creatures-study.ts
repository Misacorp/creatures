import { DEFAULT_JOURNEY_MIX, PRESET_IDS, type PlayerProfile } from './profiles';
import type { DayRecord, PlayerJourney } from './journey';
import { defaultProfiles, runJourneyServer, type JourneySettings } from './journey-run';
import { mean, median, round } from './util';

/**
 * The creatures study (docs/balance/log.md B-014): plays whole journey servers and reports, per profile
 * and week, what the new catching brings (docs/design/gear-and-creatures-v2.md sections 8 and 9.5):
 * creatures per week, duplicates per week and what each was answered with, species owned and the week
 * the base catalogue was complete, Bait split between levels, lures and talent slots, and the share of
 * fight power the talents give. Variants differ by tuning overrides (`applyOverrides`); a report per
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
  /** The week's Bait: earned, and spent on levels, lures and talent slots. */
  baitEarned: number;
  baitTraining: number;
  baitLures: number;
  baitSlots: number;
  /** Base species owned at the end of the week. */
  species: number;
  /** Raid team power (Attack + HP score) and the fight-scored power, and the share talents give of it. */
  power: number;
  fightPower: number | null;
  /** `1 - fightPowerNoTalents / fightPower` as a fraction, or null when the week was not scored. */
  talentShare: number | null;
}

export interface ProfileMetrics {
  id: string;
  label: string;
  players: number;
  weeks: WeekMetrics[];
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
    baitTraining: held('weekBaitTraining'),
    baitLures: held('weekBaitLures'),
    baitSlots: held('weekBaitSlots'),
    species: held('speciesOwned'),
    power: held('power'),
    fightPower:
      fights.length === 0
        ? null
        : round(mean(fights.map((r) => r.end.fightPower as number)) ?? 0, 1),
    talentShare: share,
  };
}

/** The week (1-based, since joining) a journey first held every species a trip can find; null if never. */
export function catalogueWeekOf(journey: PlayerJourney): number | null {
  const day = journey.milestones['catalogue_complete'];
  return day === undefined ? null : Math.ceil(day / 7);
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
      title: 'Bait per week: earned / levels / lures / talent slots',
      cell: (m) =>
        `${m.baitEarned.toFixed(0)} / ${m.baitTraining.toFixed(0)} / ${m.baitLures.toFixed(0)} / ${m.baitSlots.toFixed(0)}`,
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

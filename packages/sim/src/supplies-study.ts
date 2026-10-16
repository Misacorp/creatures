import { DEFAULT_JOURNEY_MIX, PRESET_IDS, type PlayerProfile } from './profiles';
import type { DayRecord, PlayerJourney } from './journey';
import { defaultProfiles, runJourneyServer, type JourneySettings } from './journey-run';
import { mean, round } from './util';

/**
 * The supplies study (docs/balance/log.md B-011): plays whole journey servers and reports, per profile
 * and week, where supplies come from (found on trips, dropped by the dungeon, crafted, rank gifts),
 * how many are used, and what else moves with them (scrap held, team power, gear levels, the other
 * currencies). Variants differ by tuning overrides (`applyOverrides`); a report per variant is written
 * as JSON and `suppliesMarkdown` lays several side by side.
 */

/** What one profile looked like at the end of one week (means over its players, supplies per week). */
export interface WeekMetrics {
  week: number;
  players: number;
  /** Supplies used on trips during the week, and obtained during it by source. */
  used: number;
  found: number;
  dungeon: number;
  crafted: number;
  /** Of the crafted ones, the good and the great tier. */
  craftedGood: number;
  craftedGreat: number;
  gift: number;
  /** Supplies in stock, and the scrap, Bait, Essence, glimmer and shards held. */
  stock: number;
  scrap: number;
  bait: number;
  essence: number;
  glimmer: number;
  shards: number;
  /** Raid team power and the upgrade levels on the worn items. */
  power: number;
  gearLevels: number;
}

export interface ProfileMetrics {
  id: string;
  label: string;
  players: number;
  weeks: WeekMetrics[];
  /** Share of the player-days on which scrap blocked the gear path. */
  scrapBlockedShare: number;
}

export interface SuppliesRun {
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

/** The numeric fields of a day record. */
type NumberKey = {
  [K in keyof DayRecord]: DayRecord[K] extends number ? K : never;
}[keyof DayRecord];

/** A numeric field of a day record; 0 when there is no record (before the first week). */
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
  const avg = (f: (r: { end: DayRecord; before: DayRecord | undefined }) => number): number =>
    round(mean(rows.map(f)) ?? 0, 2);
  const delta = (key: NumberKey): number => avg((r) => field(r.end, key) - field(r.before, key));
  const held = (key: NumberKey): number => avg((r) => field(r.end, key));
  return {
    week,
    players: rows.length,
    used: delta('suppliesUsed'),
    found: delta('suppliesFound'),
    dungeon: delta('suppliesDungeon'),
    crafted: delta('suppliesCrafted'),
    craftedGood: delta('suppliesCraftedGood'),
    craftedGreat: delta('suppliesCraftedGreat'),
    gift: delta('suppliesGift'),
    stock: held('suppliesOwned'),
    scrap: held('scrap'),
    bait: held('bait'),
    essence: held('essence'),
    glimmer: held('glimmer'),
    shards: held('shards'),
    power: held('power'),
    gearLevels: held('gearLevels'),
  };
}

/** Plays the servers of every seed and summarises each profile's journeys. */
export function runSuppliesStudy(
  label: string,
  set: string,
  study: StudySettings,
  profiles: readonly PlayerProfile[] = defaultProfiles(),
): SuppliesRun {
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
    const days = mine.reduce((n, j) => n + j.days.length, 0);
    const scrapBlocked = mine.reduce(
      (n, j) => n + j.days.filter((d) => d.blocked.includes('scrap_for_gear')).length,
      0,
    );
    out.push({
      id,
      label: profiles.find((p) => p.id === id)?.label ?? id,
      players: mine.length,
      weeks: Array.from({ length: study.weeks }, (_, k) => weekMetrics(k + 1, mine)),
      scrapBlockedShare: days === 0 ? 0 : round(scrapBlocked / days, 3),
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
 * What the balance targets read from a supplies run (`pnpm sim`, `supplies-*` in `targets.json`), from
 * week `fromWeek` on (the first weeks are the start-up): per profile, the supplies used a week
 * (`supplies.<id>.usedPerWeek`), the share of the supplies obtained that were crafted
 * (`supplies.<id>.craftedShare`) and, for the min-maxer, the upgrade levels on worn gear at the last
 * week of the run (`supplies.min-maxer.gearLevelsEnd`: making supplies must not starve the gear).
 */
export function suppliesMetrics(run: SuppliesRun, fromWeek = 3): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of run.profiles) {
    const weeks = p.weeks.filter((w) => w.week >= fromWeek);
    if (weeks.length === 0) continue;
    const used = weeks.reduce((n, w) => n + w.used, 0) / weeks.length;
    const crafted = weeks.reduce((n, w) => n + w.crafted, 0);
    const obtained = weeks.reduce((n, w) => n + w.found + w.dungeon + w.crafted + w.gift, 0);
    out[`supplies.${p.id}.usedPerWeek`] = round(used, 3);
    out[`supplies.${p.id}.craftedShare`] = obtained === 0 ? 0 : round(crafted / obtained, 4);
    const last = p.weeks.at(-1);
    if (last !== undefined) out[`supplies.${p.id}.gearLevelsEnd`] = last.gearLevels;
  }
  return out;
}

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const line = (cells: readonly string[]): string => `| ${cells.join(' | ')} |`;
  return [line(header), line(header.map(() => '---')), ...rows.map(line)].join('\n');
}

const f1 = (x: number): string => x.toFixed(1);

/** Weeks the tables show. */
export const STUDY_WEEKS = [1, 4, 6, 12, 20] as const;

/** Variants side by side, one table per profile and measure, rows are the variants. */
export function suppliesMarkdown(
  runs: readonly SuppliesRun[],
  weeks: readonly number[] = STUDY_WEEKS,
): string {
  const out: string[] = ['# Supplies study', ''];
  for (const r of runs) {
    out.push(
      `- **${r.label}**${r.set === '' ? '' : ` (\`${r.set}\`)`}: ${String(r.seeds)} seeds x ${String(r.servers)} servers x ${String(r.weeks)} weeks, seed "${r.seed}"`,
    );
  }
  const ids = [...new Set(runs.flatMap((r) => r.profiles.map((p) => p.id)))];
  const at = (r: SuppliesRun, id: string, week: number): WeekMetrics | undefined =>
    r.profiles.find((p) => p.id === id)?.weeks[week - 1];
  const measures: { title: string; cell: (m: WeekMetrics) => string }[] = [
    { title: 'Supplies used per week', cell: (m) => f1(m.used) },
    {
      title: 'Supplies obtained per week: found / dungeon / crafted / gift',
      cell: (m) => `${f1(m.found)} / ${f1(m.dungeon)} / ${f1(m.crafted)} / ${f1(m.gift)}`,
    },
    {
      title: 'Supplies crafted per week: all / good tier / great tier',
      cell: (m) => `${f1(m.crafted)} / ${f1(m.craftedGood)} / ${f1(m.craftedGreat)}`,
    },
    { title: 'Supplies in stock', cell: (m) => f1(m.stock) },
    { title: 'Scrap held', cell: (m) => m.scrap.toFixed(0) },
    { title: 'Team power', cell: (m) => m.power.toFixed(0) },
    { title: 'Upgrade levels on worn gear', cell: (m) => f1(m.gearLevels) },
    {
      title: 'Bait / Essence / glimmer / shards held',
      cell: (m) =>
        `${m.bait.toFixed(0)} / ${m.essence.toFixed(0)} / ${m.glimmer.toFixed(0)} / ${m.shards.toFixed(0)}`,
    },
  ];
  for (const id of ids) {
    const label = runs.flatMap((r) => r.profiles).find((p) => p.id === id)?.label ?? id;
    out.push('', `## ${label}`);
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
    out.push(
      '',
      `Share of days scrap blocked the gear path: ${runs
        .map(
          (r) =>
            `${r.label} ${String(Math.round((r.profiles.find((p) => p.id === id)?.scrapBlockedShare ?? 0) * 100))}%`,
        )
        .join(', ')}`,
    );
  }
  return `${out.join('\n')}\n`;
}

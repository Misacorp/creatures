import { DEFAULT_JOURNEY_MIX, PRESET_IDS, type PlayerProfile } from './profiles';
import type { PlayerJourney } from './journey';
import { defaultProfiles, runJourneyServer, type JourneySettings } from './journey-run';
import { median, round } from './util';

/**
 * The gear share study (docs/design/gear-and-creatures-v2.md section 4): plays whole journey servers
 * and measures, per profile, how much of the raid team's fight-scored power its worn gear gives at
 * weeks 2, 8, 20 and 30. The share is `1 - bare / full`, where `full` is the fight-scored power of the
 * three strongest creatures (`fightPower`) and `bare` the same three with their gear taken off. The
 * design's targets are ranges per profile and week (`GEAR_SHARE_TARGETS`, and `gear-share-*` in
 * `targets.json`); the study reports where the shipped rules land against them and nothing is tuned
 * to fit.
 */

/** The weeks the design gives targets for. */
export const GEAR_SHARE_WEEKS = [2, 8, 20, 30] as const;

/** One profile's median gear share (0 to 1) at the study's weeks, and how many players it is over. */
export interface GearShareProfile {
  id: string;
  label: string;
  players: number;
  /** Median share by week (`GEAR_SHARE_WEEKS`); null when no player has a record that week. */
  share: Record<string, number | null>;
}

export interface GearShareRun {
  seed: string;
  servers: number;
  weeks: number;
  profiles: GearShareProfile[];
}

export interface GearStudySettings {
  seed: string;
  servers: number;
  /** Play with the valley's weather (default: on, as shipped). */
  weather?: boolean;
}

/** The share one player's week-end record shows, or undefined when it has no fight score. */
function shareAt(journey: PlayerJourney, week: number): number | undefined {
  let end: PlayerJourney['days'][number] | undefined;
  for (const d of journey.days) {
    if (d.week === week && d.fightPower !== null) end = d;
  }
  if (end === undefined || end.fightPower === null || end.fightPowerBare === null) return undefined;
  if (end.fightPower <= 0) return undefined;
  return Math.max(0, (end.fightPower - end.fightPowerBare) / end.fightPower);
}

/** Plays `servers` journey servers of the default mix for 30 weeks and reads each profile's share. */
export function runGearStudy(
  study: GearStudySettings,
  profiles: readonly PlayerProfile[] = defaultProfiles(),
): GearShareRun {
  const weeks = Math.max(...GEAR_SHARE_WEEKS);
  const settings: JourneySettings = {
    seed: study.seed,
    weeks,
    servers: study.servers,
    income: 'allowance',
    profiles,
    mix: DEFAULT_JOURNEY_MIX,
    mixName: 'default',
    noise: false,
    ...(study.weather === false ? { weather: false } : {}),
  };
  const journeys: PlayerJourney[] = [];
  for (let k = 0; k < study.servers; k++) journeys.push(...runJourneyServer(settings, k).journeys);
  const out: GearShareProfile[] = [];
  for (const id of PRESET_IDS) {
    const mine = journeys.filter((j) => j.profile === id);
    if (mine.length === 0) continue;
    const share: Record<string, number | null> = {};
    for (const week of GEAR_SHARE_WEEKS) {
      const values = mine.flatMap((j) => {
        const s = shareAt(j, week);
        return s === undefined ? [] : [s];
      });
      const m = median(values);
      share[String(week)] = m === null ? null : round(m, 4);
    }
    out.push({
      id,
      label: profiles.find((p) => p.id === id)?.label ?? id,
      players: mine.length,
      share,
    });
  }
  return { seed: study.seed, servers: study.servers, weeks, profiles: out };
}

/** The metric a profile's share at a week is stored under (`gear.share.<profile>.week<N>`). */
export function gearShareMetric(profileId: string, week: number): string {
  return `gear.share.${profileId}.week${String(week)}`;
}

/** What the targets read from a study run. */
export function gearShareMetrics(run: GearShareRun): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const p of run.profiles) {
    for (const week of GEAR_SHARE_WEEKS)
      out[gearShareMetric(p.id, week)] = p.share[String(week)] ?? null;
  }
  return out;
}

/** The study as a Markdown table (shares in percent) with the design's ranges beside them. */
export function gearShareMarkdown(
  run: GearShareRun,
  ranges: Readonly<Record<string, readonly [number, number]>>,
): string {
  const pct = (x: number | null | undefined): string =>
    x === null || x === undefined ? '-' : `${(x * 100).toFixed(1)}%`;
  const lines = [
    `${String(run.servers)} servers of the default journey mix, ${String(run.weeks)} weeks, seed "${run.seed}". Each cell is the median share of the team's fight-scored power that its worn gear gives, with the design's range under it.`,
    '',
    `| Profile | Players | ${GEAR_SHARE_WEEKS.map((w) => `Week ${String(w)}`).join(' | ')} |`,
    `| --- | --- | ${GEAR_SHARE_WEEKS.map(() => '---').join(' | ')} |`,
  ];
  for (const p of run.profiles) {
    const cells = GEAR_SHARE_WEEKS.map((w) => {
      const range = ranges[gearShareMetric(p.id, w)];
      const target = range === undefined ? '' : ` (${pct(range[0])} to ${pct(range[1])})`;
      return `${pct(p.share[String(w)])}${target}`;
    });
    lines.push(`| ${p.label} | ${String(p.players)} | ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}

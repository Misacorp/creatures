import { RULES, content, createSeededRng, weatherContent, type WeatherDay } from '@creatures/game';
import { DEFAULT_MIX } from './archetypes';
import { runCurveMix, type CurveStats } from './curve-study';
import { chooseSignUps, runEconomy } from './economy';
import { SERVER_MIXES, type ProfileMix } from './profiles';
import { openRaidWeek, playWholeWeek, summarizeRaid } from './raid';
import { clonePlayer } from './state';
import { mean, round } from './util';
import { forcedDay } from './weather';

/**
 * The weather study (docs/balance/log.md B-017): what the valley's Boons and Omens do to the raid.
 *
 * 1. Per effect: rosters from economy sims (the default archetype mix, snapshotted at weeks 4 and 8) fight
 *    whole raid weeks at one Boss Rank, once with no weather and once under each live Boon and each live
 *    Omen, on all three stages, with the same seeds (the fights differ only by the weather). A Boon or an
 *    Omen on every stage is the strongest a week can be; a real week has a different sky each day.
 * 2. Whole servers: the default journey server plays the same seeds with and without weather
 *    (`runCurveMix`), so the raid numbers can be read both ways.
 */

export interface WeatherStudySettings {
  seed: string;
  /** Economy sims for the rosters of the per-effect study. */
  servers: number;
  /** The Boss Rank the per-effect weeks are fought at. */
  rank: number;
  /** The Boss Rank whose strength the weather has (the table of `RULES.weather.tiers`); absent: the fight's rank. */
  strengthRank?: number;
  /** Servers and weeks of the whole-server comparison (0 servers skips it). */
  curveServers: number;
  curveWeeks: number;
}

type Kind = 'none' | 'boon' | 'omen';

/** What one weather did to raid weeks, against no weather, on the same seeds. */
export interface EffectRow {
  id: string;
  name: string;
  kind: Kind;
  weeks: number;
  /** Rates, 0 to 1. */
  phase1: number;
  phase2: number;
  finale: number;
  /** Mean share of the boss pool lost by the end of the week. */
  loss: number;
  /** Differences to no weather (rates and pool share, as fractions: 0.05 is 5 points). */
  phase1Delta: number;
  phase2Delta: number;
  finaleDelta: number;
  lossDelta: number;
}

export interface ServerComparison {
  off: CurveStats;
  on: CurveStats;
  weeks: number;
  count: number;
}

export interface WeatherStudy {
  settings: WeatherStudySettings;
  effects: EffectRow[];
  /** The default journey server with and without weather; null when skipped. */
  servers: ServerComparison | null;
}

interface Played {
  phase1: boolean;
  phase2: boolean;
  finale: boolean;
  loss: number;
}

/** The weathers of the per-effect study: none, then every live Boon alone and every live Omen alone. */
export function studyWeathers(): { id: string; name: string; kind: Kind }[] {
  return [
    { id: 'none', name: 'No weather', kind: 'none' },
    ...weatherContent
      .filter((d) => d.status === 'live')
      .map((d) => ({ id: d.id, name: d.name, kind: d.kind })),
  ];
}

function dayOf(entry: { id: string; kind: Kind }, rank: number): WeatherDay | null {
  if (entry.kind === 'none') return null;
  return entry.kind === 'boon'
    ? forcedDay(entry.id, null, rank)
    : forcedDay('none', entry.id, rank);
}

function stats(rows: readonly Played[]): {
  weeks: number;
  phase1: number;
  phase2: number;
  finale: number;
  loss: number;
} {
  const rate = (f: (p: Played) => boolean): number =>
    rows.length === 0 ? 0 : rows.filter(f).length / rows.length;
  return {
    weeks: rows.length,
    phase1: rate((p) => p.phase1),
    phase2: rate((p) => p.phase2),
    finale: rate((p) => p.finale),
    loss: mean(rows.map((p) => p.loss)) ?? 0,
  };
}

/** Plays the per-effect study: the same signed-up rosters, bosses and seeds under every weather. */
export function runEffectStudy(settings: WeatherStudySettings): EffectRow[] {
  const weathers = studyWeathers();
  const played = new Map<string, Played[]>(weathers.map((w) => [w.id, []]));
  for (let k = 0; k < settings.servers; k++) {
    const econ = runEconomy({
      seed: `${settings.seed}:econ:${String(k)}`,
      weeks: 8,
      mix: DEFAULT_MIX,
      snapshotWeeks: [4, 8],
      weather: false,
    });
    for (const snap of econ.snapshots) {
      for (const boss of content.bosses) {
        const base = `${settings.seed}:raid:${String(k)}:${String(snap.week)}:${boss.id}`;
        for (const w of weathers) {
          const signed = chooseSignUps(
            snap.players.map(clonePlayer),
            createSeededRng(`${base}:signup`),
            createSeededRng(`${base}:order`),
          );
          if (signed.length === 0) continue;
          const day = dayOf(w, settings.strengthRank ?? settings.rank);
          const week = openRaidWeek(boss, signed, {
            rank: settings.rank,
            luck: RULES.combat.luck,
            weather: { phase1: day, phase2: day, finale: day },
          });
          playWholeWeek(week, createSeededRng(`${base}:fight`), createSeededRng(`${base}:loot`));
          const s = summarizeRaid(week);
          played.get(w.id)?.push({
            phase1: s.phase1Cleared,
            phase2: s.phase2Cleared,
            finale: s.finaleWon,
            loss: s.lossAfter.finale,
          });
        }
      }
    }
  }
  const none = stats(played.get('none') ?? []);
  return weathers.map((w) => {
    const s = stats(played.get(w.id) ?? []);
    return {
      ...w,
      weeks: s.weeks,
      phase1: round(s.phase1, 4),
      phase2: round(s.phase2, 4),
      finale: round(s.finale, 4),
      loss: round(s.loss, 4),
      phase1Delta: round(s.phase1 - none.phase1, 4),
      phase2Delta: round(s.phase2 - none.phase2, 4),
      finaleDelta: round(s.finale - none.finale, 4),
      lossDelta: round(s.loss - none.loss, 4),
    };
  });
}

/** The default journey server's raid weeks with and without weather (the same seeds, so the weeks pair up). */
export function runServerComparison(settings: WeatherStudySettings): ServerComparison {
  const mix = SERVER_MIXES['default'] as ProfileMix;
  const common = {
    seed: `${settings.seed}:servers`,
    weeks: settings.curveWeeks,
    servers: settings.curveServers,
    income: 'allowance' as const,
  };
  const off = runCurveMix({ ...common, weather: false }, 'default', mix);
  const on = runCurveMix(common, 'default', mix);
  return {
    off: off.normal,
    on: on.normal,
    weeks: settings.curveWeeks,
    count: settings.curveServers,
  };
}

export function runWeatherStudy(settings: WeatherStudySettings): WeatherStudy {
  return {
    settings,
    effects: runEffectStudy(settings),
    servers: settings.curveServers > 0 ? runServerComparison(settings) : null,
  };
}

const pct = (x: number | null): string => (x === null ? 'n/a' : `${(x * 100).toFixed(1)}%`);
const pts = (x: number): string => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}`;

/** The study as Markdown: one table of effects, one of the servers. */
export function weatherMarkdown(study: WeatherStudy): string {
  const { settings } = study;
  const lines = [
    '# Weather: what Boons and Omens do to the raid',
    '',
    `Seed "${settings.seed}", ${String(settings.servers)} roster sims, Boss Rank ${String(settings.rank)}${settings.strengthRank === undefined ? '' : `, weather at the strength of rank ${String(settings.strengthRank)}`}. Every row plays the same raid weeks (the same rosters, bosses and seeds) with that one weather on all three stages, which is the strongest a week can be (a real week has a different sky each day). Deltas are points against no weather.`,
    '',
    '| Weather | Kind | Weeks | Phase 1 | Phase 2 | Finale won | Finale delta | Pool lost | Pool delta |',
    '| ------- | ---- | ----- | ------- | ------- | ---------- | ------------ | --------- | ---------- |',
    ...study.effects.map(
      (e) =>
        `| ${e.name} | ${e.kind} | ${String(e.weeks)} | ${pct(e.phase1)} | ${pct(e.phase2)} | ${pct(e.finale)} | ${e.kind === 'none' ? '' : pts(e.finaleDelta)} | ${pct(e.loss)} | ${e.kind === 'none' ? '' : pts(e.lossDelta)} |`,
    ),
    '',
  ];
  if (study.servers !== null) {
    const { off, on } = study.servers;
    lines.push(
      `Whole servers (the default journey server, ${String(study.servers.count)} servers of ${String(study.servers.weeks)} weeks, same seeds, normal weeks):`,
      '',
      '| | Raids | Phase 1 | Phase 2 | Finale won | Knocked out | Overtime |',
      '| - | ----- | ------- | ------- | ---------- | ----------- | -------- |',
      `| No weather | ${String(off.raids)} | ${pct(off.phase1)} | ${pct(off.phase2)} | ${pct(off.finale)} | ${pct(off.ko)} | ${pct(off.overtime)} |`,
      `| Weather | ${String(on.raids)} | ${pct(on.phase1)} | ${pct(on.phase2)} | ${pct(on.finale)} | ${pct(on.ko)} | ${pct(on.overtime)} |`,
      '',
    );
  }
  return lines.join('\n');
}

import { runEconomy, type EconomyResult } from './economy';
import type { IncomeModelId } from './income';
import { JourneyRecorder, type PlayerJourney } from './journey';
import {
  PRESETS,
  PRESET_IDS,
  rosterProfiles,
  type PlayerProfile,
  type ProfileMix,
} from './profiles';

/** Everything that decides a journey run's result (no clock, no git state). */
export interface JourneySettings {
  seed: string;
  /** Weeks each server plays. */
  weeks: number;
  /** Servers simulated; the report's medians are over their players. */
  servers: number;
  income: IncomeModelId;
  /** The profiles the mix may name (presets, or a file's). */
  profiles: readonly PlayerProfile[];
  /** The server's mix, and the name it goes by in the report. */
  mix: ProfileMix;
  mixName: string;
  /** Draw every player's dials from a range around their profile (`noisyProfile`). */
  noise: boolean;
  /** Play with the valley's weather (default: on, as shipped); `false` plays the journeys without it. */
  weather?: boolean;
}

export function defaultProfiles(): PlayerProfile[] {
  return PRESET_IDS.map((id) => PRESETS[id]);
}

/** One simulated server: the economy it played and the journey of every player. */
export interface ServerRun {
  economy: EconomyResult;
  journeys: PlayerJourney[];
}

/** The seed of server `k`: the same for every income model and server mix of the same size, so runs pair up. */
export function serverSeed(settings: JourneySettings, k: number): string {
  return `${settings.seed}:journey:${settings.mixName}:${String(k)}`;
}

/** Plays server `k` (0-based) of a journey run through the real rules, recording every player's journey. */
export function runJourneyServer(settings: JourneySettings, k: number): ServerRun {
  const seed = serverSeed(settings, k);
  const profiles = rosterProfiles(
    settings.mix,
    settings.profiles,
    settings.noise ? `${seed}:noise` : undefined,
  );
  if (profiles.length === 0) throw new Error('the server mix has no players');
  const recorder = new JourneyRecorder();
  const economy = runEconomy({
    seed,
    weeks: settings.weeks,
    roster: profiles.map((profile) => ({ profile })),
    income: settings.income,
    observer: recorder,
    snapshotWeeks: [],
    ...(settings.weather === false ? { weather: false } : {}),
  });
  return { economy, journeys: recorder.journeys };
}

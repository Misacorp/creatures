import { RULES, type Rules } from './rules';
import { ALL_SERVERS, type ServerConfig } from './servers';
import { runServer, type PlayerRun, type ServerRun } from './sim';

/** One server run over several seeds (model.md: "each scenario over several seeds (example: 20)"). */
export interface ScenarioResult {
  config: ServerConfig;
  runs: ServerRun[];
}

export const DEFAULT_SEEDS = 20;

/** The seeds the report runs the variants of the mixed server of 8 with: half of the main servers' (the speed budget). */
/** The broker and Market variants (a study of one question) run with this share of the variants' seeds, to stay inside the speed budget. */
export const isStudyVariant = (id: string): boolean =>
  id.includes('-market') || id.endsWith('-nobroker');
export const studySeedsFor = (variantSeeds: number): number =>
  Math.max(1, Math.round(variantSeeds * 0.6));

export const variantSeedsFor = (seeds: number): number => Math.max(1, Math.ceil(seeds / 2));

export function runScenario(
  config: ServerConfig,
  seeds: number,
  rules: Rules = RULES,
): ScenarioResult {
  const runs: ServerRun[] = [];
  for (let seed = 1; seed <= seeds; seed++) runs.push(runServer(config, seed, rules));
  return { config, runs };
}

export type Results = Readonly<Record<string, ScenarioResult>>;

export function runAll(seeds: number, rules: Rules = RULES, only?: readonly string[]): Results {
  const out: Record<string, ScenarioResult> = {};
  for (const config of ALL_SERVERS) {
    if (only && !only.includes(config.id)) continue;
    out[config.id] = runScenario(config, seeds, rules);
  }
  return out;
}

/** Every run of one profile (optionally under one policy) in a scenario, across seeds. */
export function playersOf(
  result: ScenarioResult | undefined,
  profile: string,
  policy?: string,
): PlayerRun[] {
  if (!result) return [];
  return result.runs
    .flatMap((r) => r.players)
    .filter((p) => p.profile === profile && (policy === undefined || p.policy === policy));
}

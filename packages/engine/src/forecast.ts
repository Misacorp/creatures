import { RULES, type Forecast, type Rng } from '@creatures/game';
import { simulateFight } from './fight';
import type { AbilityChoice, FightInput } from './types';

/** Total damage of the hit events of a fight. */
function hitDamage(input: FightInput, rng: Rng): number {
  let total = 0;
  for (const e of simulateFight(input, rng).events) if (e.t === 'hit') total += e.damage;
  return total;
}

/**
 * Forecast of a fight for the readiness band: the mean damage the row deals over `samples` runs
 * (default `RULES.progression.readiness.samples`) against the boss HP left, with every ability at
 * its default round (a forecast is made before anybody has fired anything). Each run draws fresh
 * dice from `rng`, which must not be the stored seed of the real fight: the forecast never reveals
 * or depends on it.
 *
 * The damage is measured against a boss that cannot fall, so all rounds are played and a result far
 * above the HP left still shows how far above. Nothing here changes the input.
 */
export function forecastFinale(
  input: FightInput,
  rng: Rng,
  samples: number = RULES.progression.readiness.samples,
): Forecast {
  if (!Number.isInteger(samples) || samples < 1 || samples > 50) {
    throw new RangeError('samples must be an integer from 1 to 50');
  }
  const unbeatable = { max: 1_000_000_000_000, current: 1_000_000_000_000 };
  const abilities: AbilityChoice[] = input.finaleAbilities.map((a) => {
    const copy = { ...a };
    delete copy.fireAtRound;
    return copy;
  });
  const probe: FightInput = { ...input, bossHpPool: unbeatable, finaleAbilities: abilities };
  let total = 0;
  for (let i = 0; i < samples; i++) total += hitDamage(probe, rng);
  return { damage: Math.floor(total / samples), hpLeft: input.bossHpPool.current };
}

/** The three stages of a week, each as a fight input with the pool the week starts with. */
export interface WeekForecastInputs {
  phase1: FightInput;
  phase2: FightInput;
  finale: FightInput;
}

/**
 * Forecast from the start of the week, before any stage has resolved: the same quantity as
 * `forecastFinale` ("finale damage over the boss HP left"), with the HP left at the finale
 * estimated as the full pool minus the mean damage of Phase 1 and Phase 2. Every sample plays Phase 1
 * first and gives Phase 2 and the finale the adaptation that Phase 1 suggests, as a real week does,
 * so the band means the same thing on Monday as after Saturday (the same thresholds apply). All three
 * inputs must carry the full pool; the adaptation they carry is ignored. Abilities at default rounds.
 */
export function forecastWeek(
  inputs: WeekForecastInputs,
  rng: Rng,
  samples: number = RULES.progression.readiness.samples,
): Forecast {
  if (!Number.isInteger(samples) || samples < 1 || samples > 50) {
    throw new RangeError('samples must be an integer from 1 to 50');
  }
  const unbeatable = { max: 1_000_000_000_000, current: 1_000_000_000_000 };
  const strip = (input: FightInput): FightInput => ({
    ...input,
    bossHpPool: unbeatable,
    finaleAbilities: input.finaleAbilities.map((a) => {
      const copy = { ...a };
      delete copy.fireAtRound;
      return copy;
    }),
  });
  const p1 = strip(inputs.phase1);
  const p2 = strip(inputs.phase2);
  const fin = strip(inputs.finale);
  let early = 0;
  let finale = 0;
  for (let i = 0; i < samples; i++) {
    const first = simulateFight(p1, rng);
    let damage = 0;
    for (const e of first.events) if (e.t === 'hit') damage += e.damage;
    const s = first.adaptationSuggestion;
    const adaptation = s !== null && s.target !== null ? { rule: s.rule, target: s.target } : null;
    early += damage + hitDamage({ ...p2, adaptation }, rng);
    finale += hitDamage({ ...fin, adaptation }, rng);
  }
  const full = inputs.finale.bossHpPool.max;
  return {
    damage: Math.floor(finale / samples),
    hpLeft: Math.max(1, full - Math.floor(early / samples)),
  };
}

/**
 * Building an entrant (no level in the Games: the species' base strengths and the gear's chance and
 * trigger lines), the aptitude the simulator checks, and the "Good fit" badge the picker shows.
 */
import {
  RULES,
  content,
  dodgeChanceBp,
  gamesIsSmall,
  type CreatureSpecies,
  type GamesEventDef,
  type LuckConfig,
} from '@creatures/game';
import { creatureCritStats } from '../fight';
import { fillAptitude } from './fill';
import { kiteAptitude } from './kite';
import { BP, absCurveBp, isqrt, mulBp } from './math';
import { stackAptitude } from './stack';
import type { GamesEntrant, GamesMods } from './types';

const MOD_LINES = [
  'sidestepBp',
  'stubborn',
  'secondWindBp',
  'echoBp',
  'paybackBp',
  'lastStandBp',
  'momentumBp',
  'riposteBp',
  'warmHeartBp',
] as const satisfies readonly (keyof GamesMods)[];

/** What the Games read of a species: its current form's base strengths, element, role, size and crit. */
export type GamesSpecies = Pick<
  CreatureSpecies,
  'id' | 'element' | 'role' | 'stage' | 'evolvesTo' | 'baseStats' | 'crit'
>;

/**
 * A creature as the Games see it. There is no level, no fusion and no gear stat line here on purpose
 * (Misa, 2026-10-23: "no level in the Games"): two creatures of one species are equal apart from the
 * gear's chance and trigger lines.
 */
export interface GamesCreatureInput {
  id: string;
  playerId: string;
  /** Absent: the player's own team (`playerId`). */
  teamId?: string;
  name: string;
  /** The creature's current species (its current form). */
  species: GamesSpecies;
  /**
   * The gear sheet (`GearMods` or `SlotMods`); only the Games' chance and trigger lines are read
   * (`GamesMods`). Stat lines, flat dodge and crit lines are ignored.
   */
  mods?: GamesMods | undefined;
  shiny?: boolean;
  bot?: boolean;
}

/**
 * The entrant of a creature: HP, Attack and Speed are its species' base stats (the level-1 stats of
 * its current form: no growth, no fusion bonus, no gear); dodge from that Speed alone (`dodgeChanceBp`);
 * crit chance and damage from `luck` (default the shipped `RULES.combat.luck`) and the species' own
 * crit bonus (no gear crit); size from `gamesIsSmall` (a single-stage line counts as grown); and the
 * gear's chance and trigger lines the Games read. The worker and the simulator both build entrants with this.
 */
export function gamesEntrantFrom(
  c: GamesCreatureInput,
  luck: LuckConfig = RULES.combat.luck,
): GamesEntrant {
  const crit = creatureCritStats(luck, c.species.crit);
  const base = c.species.baseStats;
  const e: GamesEntrant = {
    id: c.id,
    playerId: c.playerId,
    teamId: c.teamId ?? c.playerId,
    name: c.name,
    speciesId: c.species.id,
    element: c.species.element,
    role: c.species.role,
    // Size (`gamesIsSmall`): only a young creature that still has growing to do is small; a line
    // with one stage is full grown at stage 1, so it counts as big.
    stage: gamesIsSmall(c.species) ? 1 : 2,
    hp: base.hp,
    atk: base.atk,
    spd: base.spd,
    dodgeBp: dodgeChanceBp(base.spd, 0),
    critBp: crit.chanceBp,
    critDmgBp: crit.damageBp,
  };
  const mods: GamesMods = {};
  for (const line of MOD_LINES) {
    const v = c.mods?.[line];
    if (v !== undefined && v > 0) (mods as Record<string, number>)[line] = v;
  }
  if (Object.keys(mods).length > 0) e.mods = mods;
  if (c.shiny === true) e.shiny = true;
  if (c.bot === true) e.bot = true;
  return e;
}

/** Typical base stats of a species (about the median of the shipped species): the aptitude's reference points. */
const REF = { hp: 168, atk: 36, spd: 37 } as const;

/**
 * How well a creature fits an event, as a whole number (about 1000 for a typical species that the
 * event neither favours nor punishes). Deterministic, no field: the server turns it into the binary
 * "Good fit" badge (`gamesGoodFit`); the simulator checks it lines up with results. It reads the same
 * things the kind does: the key stat on a square-root curve, the element, role and size multipliers,
 * dodge and crit where they count, and the gear lines.
 */
export function gamesAptitude(def: GamesEventDef, e: GamesEntrant): number {
  const role = def.roleBp?.[e.role] ?? BP;
  const elem = def.elementBp[e.element];
  const small = e.stage === 1 ? (def.smallBp ?? BP) : BP;
  const m = e.mods ?? {};
  const weight = (curve: number): number => BP + mulBp(curve - BP, def.params.statBp);
  const sHp = weight(absCurveBp(e.hp, REF.hp));
  const sAtk = weight(absCurveBp(e.atk, REF.atk));
  const sSpd = weight(absCurveBp(e.spd, REF.spd));
  let f = BP;
  switch (def.kind) {
    case 'endure': {
      const p = def.params;
      f = mulBp(mulBp(sHp, elem), role);
      if (e.role === 'guard' || e.role === 'support') f = mulBp(f, 10_400);
      if (e.element === p.stokeElement && p.stokeBp < 0) f = mulBp(f, 10_300);
      f = mulBp(f, BP + mulBp(mulBp(e.dodgeBp, p.dodgeShareBp), 3_000) + (m.sidestepBp ?? 0) / 4);
      f = mulBp(f, BP + Math.floor((m.secondWindBp ?? 0) / 3) + (m.stubborn === 1 ? 800 : 0));
      break;
    }
    case 'chase': {
      const p = def.params;
      f = mulBp(mulBp(sSpd, elem), role);
      f = mulBp(f, BP + mulBp(mulBp(e.dodgeBp, p.dodgeShareBp), mulBp(p.hopChanceBp, 40_000)));
      f = mulBp(f, BP + (e.stage === 1 ? 900 : 0) + (m.stubborn === 1 ? 900 : 0));
      f = mulBp(
        f,
        BP + Math.floor(((m.sidestepBp ?? 0) + (m.momentumBp ?? 0) + (m.riposteBp ?? 0)) / 8),
      );
      break;
    }
    case 'feast': {
      const p = def.params;
      f = mulBp(mulBp(sHp, elem), role);
      f = mulBp(
        f,
        BP +
          mulBp(mulBp(e.critBp, p.critShareBp), 5_000) +
          mulBp(m.echoBp ?? 0, mulBp(p.echoShareBp, 5_000)),
      );
      if (e.element === p.coolElement) f = mulBp(f, 10_500);
      f = mulBp(f, BP + Math.floor((m.secondWindBp ?? 0) / 3) + (m.stubborn === 1 ? 800 : 0));
      break;
    }
    case 'swim': {
      const p = def.params;
      // Speed most, stamina a little (a fourth root of HP).
      f = mulBp(mulBp(mulBp(sSpd, isqrt(sHp * BP)), elem), role);
      f = mulBp(
        f,
        BP + mulBp(mulBp(e.dodgeBp, p.dodgeShareBp), 5_000) + Math.floor((m.sidestepBp ?? 0) / 2),
      );
      f = mulBp(f, BP + (m.stubborn === 1 ? 700 : 0) + Math.floor((m.secondWindBp ?? 0) / 4));
      break;
    }
    case 'shove': {
      const p = def.params;
      // Grip most (it decides who stays on), push a little: grip^0.75 x push^0.25.
      const grip = mulBp(mulBp(sHp, elem), small);
      const pushGrip = isqrt(isqrt(mulBp(sAtk, role) * grip) * grip);
      f = mulBp(
        pushGrip,
        BP + mulBp(mulBp(e.dodgeBp, p.dodgeShareBp), 3_000) + Math.floor((m.sidestepBp ?? 0) / 3),
      );
      f = mulBp(f, BP + (m.stubborn === 1 ? 1_200 : 0));
      if (e.element === p.meltElement) f = mulBp(f, 9_800);
      break;
    }
    case 'haul': {
      const p = def.params;
      // The key stat (Speed to carry, Attack to push), a steady footing, the roles a team wants.
      f = mulBp(mulBp(p.mode === 'carry' ? sSpd : sAtk, elem), role);
      f = mulBp(
        f,
        BP +
          mulBp(mulBp(e.dodgeBp, p.dodgeShareBp), mulBp(p.wobbleChanceBp, 20_000)) +
          Math.floor((m.sidestepBp ?? 0) / 8) +
          (m.stubborn === 1 ? 500 : 0),
      );
      if (e.role === 'setter') f = mulBp(f, p.leadBp);
      if (e.role === 'guard' || e.role === 'support') f = mulBp(f, 10_300);
      if (e.element === p.zapElement) f = mulBp(f, 10_200);
      break;
    }
    // The at-once team events keep their aptitude next to their rules.
    case 'fill':
      f = fillAptitude(def, e, { hp: sHp, atk: sAtk, spd: sSpd });
      break;
    case 'stack':
      f = stackAptitude(def, e, { hp: sHp, atk: sAtk, spd: sSpd });
      break;
    case 'kite':
      f = kiteAptitude(def, e, { hp: sHp, atk: sAtk, spd: sSpd });
      break;
  }
  // Size counts where the event says so (shove already has it in the grip).
  if (def.kind !== 'shove') f = mulBp(f, small);
  return Math.max(1, Math.floor(f / 10));
}

/** Threshold per event definition (content is fixed at load; the defs are the content's objects). */
const goodFitCache = new WeakMap<GamesEventDef, number>();

/**
 * The aptitude a creature needs for the "Good fit" badge in an event: the aptitude of the species at
 * the top `RULES.games.goodFit.topSpeciesBp` share of all species (`teamTopSpeciesBp` in a team event) (each species once, gearless, as
 * `gamesEntrantFrom` builds it), so the bar is computed per event from the content alone and a new
 * event or species needs no number. The share is calibrated in the simulator (`pnpm sim:games`: about
 * 2 to 4 good fits per event in a typical roster; docs/design/decisions.md, 2026-10-23).
 */
export function gamesGoodFitMin(
  def: GamesEventDef,
  species: readonly GamesSpecies[] = content.creatures,
): number {
  const useCache = species === content.creatures;
  const cached = useCache ? goodFitCache.get(def) : undefined;
  if (cached !== undefined) return cached;
  const apts = species
    .map((sp) =>
      gamesAptitude(def, gamesEntrantFrom({ id: sp.id, playerId: 'p', name: sp.id, species: sp })),
    )
    .sort((a, b) => b - a);
  const { topSpeciesBp, teamTopSpeciesBp } = RULES.games.goodFit;
  const share = def.team === 3 ? teamTopSpeciesBp : topSpeciesBp;
  const take = Math.max(1, Math.ceil((apts.length * share) / BP));
  const min = apts[Math.min(apts.length, take) - 1] ?? 1;
  if (useCache) goodFitCache.set(def, min);
  return min;
}

/** Whether a creature (its entrant: species and gear lines) is a good fit for an event. */
export function gamesGoodFit(def: GamesEventDef, e: GamesEntrant): boolean {
  return gamesAptitude(def, e) >= gamesGoodFitMin(def);
}

/** Building an entrant from the fold the fights use, and the aptitude the client shows as pips. */
import {
  RULES,
  dodgeChanceBp,
  type CreatureSpecies,
  type CritBonus,
  type GamesEventDef,
  type LuckConfig,
  type Stats,
} from '@creatures/game';
import { creatureCritStats } from '../fight';
import { BP, absCurveBp, isqrt, mulBp } from './math';
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

/** A folded creature: what the worker's `TeamCreature` and the simulator's `foldedCreature` give. */
export interface GamesCreatureInput {
  id: string;
  playerId: string;
  /** Absent: the player's own team (`playerId`). */
  teamId?: string;
  name: string;
  species: Pick<CreatureSpecies, 'id' | 'element' | 'role' | 'stage' | 'evolvesTo'>;
  level: number;
  /** The fight's stats (fusion and gear included). */
  stats: Stats;
  crit?: CritBonus | undefined;
  /** The gear sheet (`GearMods` or `SlotMods`); only the Games' lines and the flat dodge are read. */
  mods?: (GamesMods & { dodgeBp?: number }) | undefined;
  shiny?: boolean;
  bot?: boolean;
}

/**
 * The entrant of a folded creature: size from its stage (a single-stage line counts as grown), dodge from Speed plus the sheet's flat dodge (`dodgeChanceBp`),
 * crit chance and damage from `luck` (default the shipped `RULES.combat.luck`) and the creature's bonus,
 * and the gear lines the Games read. The worker and the simulator both build entrants with this.
 */
export function gamesEntrantFrom(
  c: GamesCreatureInput,
  luck: LuckConfig = RULES.combat.luck,
): GamesEntrant {
  const crit = creatureCritStats(luck, c.crit);
  const e: GamesEntrant = {
    id: c.id,
    playerId: c.playerId,
    teamId: c.teamId ?? c.playerId,
    name: c.name,
    speciesId: c.species.id,
    element: c.species.element,
    role: c.species.role,
    // Size: only a young creature that still has growing to do is small. A line with one stage is
    // full grown at stage 1, so it counts as big (it would otherwise be small at any level).
    stage: c.species.stage === 1 && c.species.evolvesTo !== undefined ? 1 : 2,
    level: c.level,
    hp: c.stats.hp,
    atk: c.stats.atk,
    spd: c.stats.spd,
    dodgeBp: dodgeChanceBp(c.stats.spd, c.mods?.dodgeBp ?? 0),
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

/** Typical stats of a mid-game creature: the aptitude's reference points. */
const REF = { hp: 300, atk: 60, spd: 60 } as const;

/**
 * How well a creature fits an event, as a whole number (about 1000 for a typical mid-game creature that
 * the event neither favours nor punishes). Deterministic, no field: the client turns a player's own
 * creatures' numbers into pips; the simulator checks it lines up with results. It reads the same
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
      if (e.role === 'guard' || e.role === 'support')
        f = mulBp(f, def.team === 3 ? 11_500 : 10_400);
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
  }
  // Size counts where the event says so (shove already has it in the grip).
  if (def.kind !== 'shove') f = mulBp(f, small);
  return Math.max(1, Math.floor(f / 10));
}

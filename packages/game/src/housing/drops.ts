/**
 * What a reward moment brings the house (`docs/design/housing.md` 2.3). One pure function; the caller passes the RNG
 * (live crypto on the server, seeded in tests) and what the player already knows, so a drop never repeats a blueprint
 * or a stamp.
 */
import { chance, int, pickWeighted, type Rng } from '../rng';
import type { HouseDrop, HousingMoment } from './hook';
import { HOUSING_RULES } from './rules';
import type { HousingContent, MaterialDef, Sources } from './schema';

const D = HOUSING_RULES.drops;

/** Rolls and percentages a moment uses, resolved from `HOUSING_RULES`. */
interface Plan {
  rolls: number;
  materialPct: number;
  blueprintPct: number;
  stampPct: number;
}

function planFor(moment: HousingMoment): Plan {
  switch (moment.kind) {
    case 'trip':
      return {
        rolls: 1 + Math.floor(moment.ticks / D.trip.ticksPerExtraRoll),
        materialPct: D.trip.materialPct,
        blueprintPct: D.trip.blueprintPct,
        stampPct: D.trip.stampPct,
      };
    case 'scout':
      return {
        rolls: 1 + moment.finds,
        materialPct: D.scout.materialPct,
        blueprintPct: D.scout.blueprintPct,
        stampPct: D.scout.stampPct,
      };
    case 'dungeon':
      return {
        rolls:
          1 +
          Math.floor(moment.depth / D.dungeon.depthPerExtraRoll) +
          (moment.cleared ? D.dungeon.clearedExtraRolls : 0),
        materialPct: D.dungeon.materialPct,
        blueprintPct: moment.cleared ? D.dungeon.blueprintPct : 0,
        stampPct: moment.cleared ? D.dungeon.stampPct : 0,
      };
    case 'raid':
      return {
        rolls: moment.cleared ? D.raid.clearedRolls : D.raid.lostRolls,
        materialPct: D.raid.materialPct,
        blueprintPct: moment.cleared ? D.raid.blueprintPct : 0,
        stampPct: moment.cleared ? D.raid.stampPct : 0,
      };
    case 'games': {
      const medal = moment.medal;
      return {
        rolls: medal === null ? 0 : 1,
        materialPct: medal === null ? 0 : D.games.materialPct[medal],
        blueprintPct: medal === 'gold' ? D.games.blueprintPct : 0,
        stampPct: medal === 'gold' ? D.games.stampPct : 0,
      };
    }
  }
}

/** The materials a roll of this moment may bring. */
function materialPool(content: HousingContent, moment: HousingMoment): MaterialDef[] {
  switch (moment.kind) {
    case 'trip':
    case 'scout':
      return content.materials.filter((m) => m.places.includes(moment.place));
    case 'dungeon':
      return content.materials.filter((m) => m.fights.includes('dungeon'));
    case 'games':
      return content.materials.filter((m) => m.fights.includes('games'));
    case 'raid':
      return content.materials.filter(
        (m) =>
          m.fights.includes('raid') &&
          m.element !== null &&
          (moment.element === undefined || moment.element === null || m.element === moment.element),
      );
  }
}

/** Whether a set's or wild piece's sources include this moment (an empty place or boss list means any). */
function sourceMatches(s: Sources | undefined, moment: HousingMoment): boolean {
  if (s === undefined || !s.moments.includes(moment.kind)) return false;
  if (moment.kind === 'trip' || moment.kind === 'scout') {
    return s.places.length === 0 || s.places.includes(moment.place);
  }
  if (moment.kind === 'raid') return s.bosses.length === 0 || s.bosses.includes(moment.bossId);
  return true;
}

function blueprintPool(
  content: HousingContent,
  moment: HousingMoment,
  known: ReadonlySet<string>,
): string[] {
  const setSources = new Map(content.sets.map((s) => [s.id, s.sources]));
  const festivalSet =
    moment.kind === 'raid' && moment.cleared && moment.festival !== null
      ? D.raid.festivalSet
      : null;
  const ok = (id: string, set: string | null, own: Sources | undefined, drop: boolean): boolean => {
    if (!drop || known.has(id)) return false;
    if (set !== null && set === festivalSet) return true;
    return sourceMatches(set === null ? own : setSources.get(set), moment);
  };
  const out: string[] = [];
  for (const p of content.pieces) {
    if (ok(p.id, p.set, p.sources, p.unlock.kind === 'drop')) out.push(p.id);
  }
  for (const s of content.skins) {
    if (ok(s.id, s.set, undefined, s.unlock.kind === 'drop')) out.push(s.id);
  }
  return out;
}

/**
 * Rolls one moment's drop. The moment says where it happened, the content what drops there, `HOUSING_RULES.drops` how
 * often. Materials: `rolls` chances at `materialPct`, each one material of the pool (rare ones at a quarter weight). One
 * blueprint roll among the blueprints the player does not know whose sources match, one stamp roll among the `drop`
 * stamps the player lacks. A cleared raid also rolls the bonus material, and a cleared Festival finale adds its silk and
 * opens the Festival set's blueprints.
 */
export function rollHouseDrops(
  rng: Rng,
  content: HousingContent,
  moment: HousingMoment,
  known: { blueprints: ReadonlySet<string>; stamps: ReadonlySet<string> },
): HouseDrop {
  const plan = planFor(moment);
  const materials: Record<string, number> = {};
  const add = (id: string, n: number): void => {
    materials[id] = (materials[id] ?? 0) + n;
  };
  const pool = materialPool(content, moment);
  if (pool.length > 0) {
    const weighted = pool.map((m) => ({
      m,
      weight: m.rare ? D.rareWeight : D.commonWeight,
    }));
    for (let i = 0; i < plan.rolls; i++) {
      if (chance(rng, plan.materialPct, 100)) add(pickWeighted(rng, weighted).m.id, 1);
    }
  }
  if (moment.kind === 'raid' && moment.cleared) {
    const has = (id: string): boolean => content.materials.some((m) => m.id === id);
    if (has(D.raid.bonusMaterial) && chance(rng, D.raid.bonusPct, 100)) {
      add(D.raid.bonusMaterial, 1);
    }
    if (moment.festival !== null && has(D.raid.festivalMaterial)) {
      add(D.raid.festivalMaterial, D.raid.festivalAmount);
    }
  }
  let blueprint: string | null = null;
  if (plan.blueprintPct > 0) {
    const candidates = blueprintPool(content, moment, known.blueprints);
    if (candidates.length > 0 && chance(rng, plan.blueprintPct, 100)) {
      blueprint = candidates[int(rng, candidates.length)] ?? null;
    }
  }
  let stamp: string | null = null;
  if (plan.stampPct > 0) {
    const candidates = content.stamps.filter(
      (s) =>
        s.unlock.kind === 'drop' &&
        s.unlock.moments.includes(moment.kind) &&
        !known.stamps.has(s.id),
    );
    if (candidates.length > 0 && chance(rng, plan.stampPct, 100)) {
      stamp = candidates[int(rng, candidates.length)]?.id ?? null;
    }
  }
  return { materials, blueprint, stamp };
}

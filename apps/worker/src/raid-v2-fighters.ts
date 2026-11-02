/**
 * The creatures of a v2 stage: each placed creature as the engine's fighter (docs/design/combat/integration.md, sections 2 and 4).
 *
 * A fighter is made from the creature's form (its species id), level, saved Knack, slotted v2 talents and its worn gear's stat lines:
 * Attack, HP, Speed and crit. The gear's effect lines (the modifier sheet) do nothing under v2 until the gear model is built, and neither
 * do the v1 talents, fusion or weather (the lab measured none of them). The creature's id is its `key`, so the stage carry follows the
 * creature when a swap moves it to another slot.
 */
import { effectiveStats, slotsOpen, type CreatureSpecies } from '@creatures/game';
import { knownKnacks } from '@creatures/game/combat-v2';
import type { FighterSpec } from '@creatures/engine/v2';
import { wornOnCreatures } from './gear-store';
import { foldCreature } from './gear-worn';
import { resolver } from './raid-v2-core';
import { speciesOf } from './species';

/** The most ids one query binds (the object's SQL allows 100 bound values). */
const CHUNK = 50;

/** What a stage needs of a creature row. */
export interface V2CreatureRow {
  id: string;
  userId: string;
  species: string;
  level: number;
  knack: string | null;
}

/** A creature's stat lines from its worn gear, on top of its form's stats (v2's gear: stat lines only). */
export interface GearLines {
  hp: number;
  atk: number;
  spd: number;
  critChanceBp: number;
  critDamageBp: number;
}

/** A creature as a stage reads it: its row, its slotted v2 talents (in slot order) and its gear's stat lines. */
export interface V2Creature extends V2CreatureRow {
  talents: string[];
  gear: GearLines;
}

/** The gear's stat lines of a creature: what the folded numbers have over the plain ones (the modifier sheet is not read). */
export function gearLinesOf(
  species: Pick<
    CreatureSpecies,
    'id' | 'baseStats' | 'growth' | 'levelCap' | 'crit' | 'role' | 'element'
  >,
  level: number,
  worn: Parameters<typeof foldCreature>[1],
): GearLines {
  if (worn === undefined || Object.keys(worn).length === 0) {
    return { hp: 0, atk: 0, spd: 0, critChanceBp: 0, critDamageBp: 0 };
  }
  const plain = effectiveStats(species, level, 0);
  const folded = foldCreature({ species: species.id, level, fusion_count: 0 }, worn);
  return {
    hp: folded.stats.hp - plain.hp,
    atk: folded.stats.atk - plain.atk,
    spd: folded.stats.spd - plain.spd,
    critChanceBp: (folded.crit?.chanceBp ?? 0) - (species.crit?.chanceBp ?? 0),
    critDamageBp: (folded.crit?.damageBp ?? 0) - (species.crit?.damageBp ?? 0),
  };
}

/**
 * The creatures with these ids (any owner), with their slotted talents and gear lines: a few queries however many (chunks of 50).
 * Ids that are not creatures are left out.
 */
export function loadV2Creatures(sql: SqlStorage, ids: readonly string[]): Map<string, V2Creature> {
  const out = new Map<string, V2Creature>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const marks = part.map(() => '?').join(', ');
    const rows = sql
      .exec<{
        id: string;
        user_id: string;
        species: string;
        level: number;
        knack: string | null;
      }>(`SELECT id, user_id, species, level, knack FROM creatures WHERE id IN (${marks})`, ...part)
      .toArray();
    const talents = new Map<string, string[]>();
    for (const t of sql
      .exec<{ creature_id: string; talent_id: string }>(
        `SELECT creature_id, talent_id FROM creature_talents_v2
         WHERE creature_id IN (${marks}) AND slot IS NOT NULL ORDER BY creature_id, slot`,
        ...part,
      )
      .toArray()) {
      const list = talents.get(t.creature_id) ?? [];
      list.push(t.talent_id);
      talents.set(t.creature_id, list);
    }
    const worn = wornOnCreatures(sql, part);
    for (const r of rows) {
      const species = speciesOf(r.species);
      // A slotted talent counts only while its slot is open at the creature's level.
      const open = slotsOpen(species.rarity, r.level);
      out.set(r.id, {
        id: r.id,
        userId: r.user_id,
        species: r.species,
        level: r.level,
        knack: r.knack,
        talents: (talents.get(r.id) ?? []).slice(0, open),
        gear: gearLinesOf(species, r.level, worn.get(r.id)),
      });
    }
  }
  return out;
}

/** The saved Knack the form still knows, or undefined for none (a Knack the form no longer knows counts as none). */
export const knackOf = (c: Pick<V2CreatureRow, 'species' | 'knack'>): string | undefined =>
  c.knack !== null && knownKnacks(c.species).includes(c.knack) ? c.knack : undefined;

/** The engine's fighter for a placed creature: `alias` is its owner's key in the fight, `row` and `col` its place on the grid. */
export function fighterOf(
  c: V2Creature,
  alias: string,
  place: { row: number; col: number },
): FighterSpec {
  const knack = knackOf(c);
  const base = resolver.resolve({
    owner: alias,
    formId: c.species,
    level: c.level,
    ...(knack === undefined ? {} : { knack }),
    talents: c.talents,
    row: place.row,
    col: place.col,
  });
  const { gear } = c;
  return {
    ...base,
    uid: c.id,
    key: c.id,
    maxHp: base.maxHp + gear.hp,
    atk: base.atk + gear.atk,
    spd: base.spd + gear.spd,
    critChanceBp: base.critChanceBp + gear.critChanceBp,
    critDamageBp: base.critDamageBp + gear.critDamageBp,
  };
}

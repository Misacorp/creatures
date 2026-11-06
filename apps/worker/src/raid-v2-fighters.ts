/**
 * The creatures of a v2 stage: each placed creature as the engine's fighter (docs/design/combat/integration.md, sections 2 and 4).
 *
 * A fighter is made from the creature's form (its species id), level, saved Knack, slotted v2 talents and its worn gear's stat lines:
 * Attack, HP, Speed and crit. The gear's effect lines (the modifier sheet) do nothing under v2 until the gear model is built, and neither
 * do the v1 talents, fusion or weather (the lab measured none of them). The creature's id is its `key`, so the stage carry follows the
 * creature when a swap moves it to another slot.
 */
import { effectiveStats, type CreatureSpecies } from '@creatures/game';
import type { FighterSpec } from '@creatures/engine/v2';
import {
  NO_GEAR,
  buildFighter,
  gearStatLines,
  savedKnackOf,
  slottedGolden,
  slottedTalents,
  type GearStats,
} from './fighter-v2';
import { wearerOf, wornItems, wornOnCreatures, type WornBySlot } from './gear-store';
import { speciesOf } from './species';
import type { LearnedTalent } from './talent-v2-store';

/** The most ids one query binds (the object's SQL allows 100 bound values). */
const CHUNK = 50;

/** What a stage needs of a creature row. */
export interface V2CreatureRow {
  id: string;
  userId: string;
  species: string;
  level: number;
  knack: string | null;
  /** The creature's own name for it (null: the species' name). */
  nickname: string | null;
}

/** A creature as a stage reads it: its row, its slotted v2 talents (in slot order) and its gear's stat lines. */
export interface V2Creature extends V2CreatureRow {
  talents: string[];
  /** The ids among `talents` that are golden. */
  goldenTalents: string[];
  gear: GearStats;
}

/**
 * The gear's stat lines of a creature: the shared v2 gear rule (`gearStatLines` of `fighter-v2.ts`, which the dungeon uses as well) over the
 * creature's worn items. The modifier sheet and every effect line are not read.
 */
export function gearLinesOf(
  species: CreatureSpecies,
  level: number,
  fusionCount: number,
  worn: WornBySlot | undefined,
): GearStats {
  const items = wornItems(worn);
  // Nothing worn adds nothing (and the creature's stats need not be worked out: a level above its cap is the page's to show).
  if (items.length === 0) return { ...NO_GEAR, fx: {} };
  return gearStatLines({
    stats: effectiveStats(species, level, fusionCount),
    crit: species.crit,
    wearer: wearerOf(species),
    items,
    talents: [],
  });
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
        fusion_count: number;
        nickname: string | null;
      }>(
        `SELECT id, user_id, species, level, knack, fusion_count, nickname FROM creatures WHERE id IN (${marks})`,
        ...part,
      )
      .toArray();
    const learned = new Map<string, LearnedTalent[]>();
    for (const t of sql
      .exec<{ creature_id: string; talent_id: string; slot: number | null; golden: number }>(
        `SELECT t.creature_id, t.talent_id, t.slot, COALESCE(b.golden, 0) AS golden FROM creature_talents_v2 t
         JOIN creatures c ON c.id = t.creature_id
         LEFT JOIN line_talents b ON b.user_id = c.user_id AND b.line = c.line AND b.talent_id = t.talent_id
         WHERE t.creature_id IN (${marks}) AND t.slot IS NOT NULL ORDER BY t.creature_id, t.slot`,
        ...part,
      )
      .toArray()) {
      const list = learned.get(t.creature_id) ?? [];
      list.push({ talentId: t.talent_id, slot: t.slot, golden: t.golden === 1 });
      learned.set(t.creature_id, list);
    }
    const worn = wornOnCreatures(sql, part);
    for (const r of rows) {
      const species = speciesOf(r.species);
      out.set(r.id, {
        id: r.id,
        userId: r.user_id,
        species: r.species,
        level: r.level,
        knack: r.knack,
        nickname: r.nickname,
        // A slotted talent counts only while its slot is open at the creature's level.
        talents: slottedTalents({ species, level: r.level }, learned.get(r.id) ?? []),
        goldenTalents: slottedGolden({ species, level: r.level }, learned.get(r.id) ?? []),
        gear: gearLinesOf(species, r.level, r.fusion_count, worn.get(r.id)),
      });
    }
  }
  return out;
}

/** The saved Knack the form still knows, or undefined for none (a Knack the form no longer knows counts as none). */
export const knackOf = (c: Pick<V2CreatureRow, 'species' | 'knack'>): string | undefined =>
  savedKnackOf(c.species, c.knack);

/** The engine's fighter for a placed creature: `alias` is its owner's key in the fight, `row` and `col` its place on the grid. */
export function fighterOf(
  c: V2Creature,
  alias: string,
  place: { row: number; col: number },
): FighterSpec {
  return buildFighter({
    id: c.id,
    owner: alias,
    formId: c.species,
    level: c.level,
    knack: c.knack,
    talents: c.talents,
    goldenTalents: c.goldenTalents,
    gear: c.gear,
    row: place.row,
    col: place.col,
  });
}

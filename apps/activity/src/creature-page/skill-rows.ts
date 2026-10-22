import { RULES } from '@creatures/game';
import type { Creature } from '../api';
import { creatureName } from '../game';
import type { GearState } from '../gear-types';
import { explorerXp } from '../trip-view';
import type { XpKind } from '../XpBar';

/** One skill bar under the Experience bar of the creature page: the tag, the bar and the words in it. */
export interface SkillRow {
  kind: Extract<XpKind, 'crafting' | 'explorer'>;
  /** The tag's word before the number ("Craft 2", "Rank 3"). */
  unit: string;
  level: number;
  /** XP into this level or rank, and the span to the next one. */
  value: number;
  max: number;
  /** Full bar and "Max". */
  top: boolean;
  /** The words in the bar: "120 / 400", or "Max". */
  text: string;
  label: string;
  /** The glossary entry the tag opens. */
  entry: string;
}

function words(value: number, max: number, top: boolean): string {
  return top ? 'Max' : `${String(value)} / ${String(max)}`;
}

/**
 * The Explorer and Crafting rows of a creature, in that order, so a player can tell who to send exploring and
 * who to put in the Workshop. The server sends total XP and the next threshold; the bar shows the XP into the
 * current rank or level against the span to the next (the same working as the trip claim card, whose
 * `explorerXp` this reuses; the thresholds are the shared rules). Crafting is left out until the gear view
 * (which carries the skills) has loaded.
 */
export function skillRows(creature: Creature, skills: GearState['skills'] | undefined): SkillRow[] {
  const name = creatureName(creature);
  const { explorer } = creature;
  const bar = explorerXp(explorer);
  const explorerTop = explorer.nextRankXp === null;
  const rows: SkillRow[] = [
    {
      kind: 'explorer',
      unit: 'Rank',
      level: explorer.rank,
      value: bar.value,
      max: bar.max,
      top: explorerTop,
      text: words(bar.value, bar.max, explorerTop),
      label: `${name}'s explorer XP`,
      entry: 'explorer-rank',
    },
  ];
  const skill = skills?.find((s) => s.creatureId === creature.id);
  if (skill !== undefined) {
    const top = skill.nextLevelXp === null;
    const start = RULES.gear.skill.xpForLevel[skill.level - 1] ?? 0;
    const max = top ? 1 : Math.max(1, (skill.nextLevelXp ?? 0) - start);
    const value = top ? 1 : Math.min(max, Math.max(0, skill.xp - start));
    rows.push({
      kind: 'crafting',
      unit: 'Craft',
      level: skill.level,
      value,
      max,
      top,
      text: words(value, max, top),
      label: `${name}'s Crafting XP`,
      entry: 'skill-crafting',
    });
  }
  return rows;
}

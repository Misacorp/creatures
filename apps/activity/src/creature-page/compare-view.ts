/**
 * What the item picker's compare block says: what Equip would change for this creature. The numbers come
 * from the game's own fold (`compareGear`, which runs `applyGear` and `setCounts`, as the server does), fed
 * with the creature's stats, worn items and talents as the client holds them; this file only builds that
 * input and words the result. Pure. It says nothing for an item the creature cannot wear (the picker shows
 * the reason then) and when it cannot work the numbers out (the bag has not listed a worn item).
 */
import {
  activeTalents,
  compareGear,
  effectiveStats,
  formatBp,
  gearBase,
  gearLine,
  gearSet,
  itemOf,
  type GearItem as RulesItem,
  type StatChange,
} from '@creatures/game';
import type { Creature } from '../api';
import { getSpecies } from '../game';
import type { GearItem } from '../gear-types';
import { setCountText, wearReason } from '../gear-view';

/** One line of the block: the words on screen, the words for a screen reader, and which way it goes. */
export interface CompareLine {
  key: string;
  text: string;
  spoken: string;
  kind: 'up' | 'down';
}

export interface ItemCompare {
  stats: CompareLine[];
  sets: CompareLine[];
}

/** An item of the server's gear view as the rules know it (its rolled lines with 0-based tiers). */
export function rulesItemOf(item: GearItem): RulesItem | null {
  if (gearBase(item.baseId) === undefined) return null;
  const lines = item.lines
    .filter((l) => l.source === 'rolled' && gearLine(l.id) !== undefined)
    .map((l) => ({ id: l.id, tier: Math.max(0, (l.tier ?? 1) - 1) }));
  return itemOf(item.baseId, item.rarity, item.itemLevel, lines);
}

const MINUS = '−';

const STAT_NAMES: Record<StatChange['stat'], string> = {
  hp: 'HP',
  atk: 'Attack',
  spd: 'Speed',
  critChance: 'Crit chance',
  critDamage: 'Crit damage',
};

/** "Attack +12", "HP −30", "Crit chance +2.2 pt" (a real minus sign; crit numbers are in points). */
export function statChangeLine(change: StatChange): CompareLine {
  const up = change.delta > 0;
  const crit = change.stat === 'critChance' || change.stat === 'critDamage';
  const amount = crit ? `${formatBp(change.delta)} pt` : String(Math.abs(change.delta));
  const name = STAT_NAMES[change.stat];
  return {
    key: change.stat,
    text: `${name} ${up ? '+' : MINUS}${amount}`,
    spoken: `${name} ${up ? 'plus' : 'minus'} ${amount}`,
    kind: up ? 'up' : 'down',
  };
}

/** The line of a set whose bonus changes: "Forge-Warm Kit 3 / 3: both bonuses" or "Loses Hollow Weave 2 / 3". */
export function setChangeLine(
  setId: string,
  name: string,
  before: number,
  after: number,
): CompareLine {
  if (after > before) {
    const gives = after >= 3 ? 'both bonuses' : '2 piece bonus';
    const text = `${name} ${setCountText(after)}: ${gives}`;
    return { key: setId, text, spoken: `Gains ${text}`, kind: 'up' };
  }
  const text = `Loses ${name} ${setCountText(before)}`;
  return { key: setId, text, spoken: text, kind: 'down' };
}

/**
 * What wearing `candidate` instead of what is worn in its slot would change for `creature`. `bag` is the
 * gear view's items (the worn ones are looked up in it for their lines). Null when there is nothing to
 * compare against: the creature cannot wear it, it already does, or a number is missing.
 */
export function compareItem(
  creature: Creature,
  candidate: GearItem,
  bag: readonly GearItem[],
): ItemCompare | null {
  const species = getSpecies(creature.species);
  if (species === undefined || wearReason(candidate, creature) !== null) return null;
  if (creature.gear.some((w) => w.id === candidate.id)) return null;
  const next = rulesItemOf(candidate);
  if (next === null) return null;
  const worn: RulesItem[] = [];
  for (const w of creature.gear) {
    const item = bag.find((b) => b.id === w.id);
    const rules = item === undefined ? null : rulesItemOf(item);
    if (rules === null) return null;
    worn.push(rules);
  }
  const held = creature.talents.book.map((t) => ({
    talentId: t.id,
    golden: t.golden,
    slot: t.slot,
  }));
  const result = compareGear({
    // The level never passes the cap on a real creature; the clamp only keeps a render from throwing.
    stats: effectiveStats(
      species,
      Math.min(creature.level, species.levelCap),
      creature.fusionCount,
    ),
    crit: species.crit,
    wearer: { role: species.role, element: species.element },
    worn,
    next,
    talents: activeTalents(species.line, species.rarity, creature.level, held),
  });
  return {
    stats: result.stats.map(statChangeLine),
    sets: result.sets.flatMap((change) => {
      const set = gearSet(change.setId);
      return set === undefined
        ? []
        : [setChangeLine(change.setId, set.name, change.before, change.after)];
    }),
  };
}

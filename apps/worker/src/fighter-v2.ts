/**
 * A creature of the player as a combat v2 fighter (docs/design/combat/integration.md, section 2): its form, level,
 * saved Knack and slotted v2 talents resolved by the engine's resolver, with its worn gear's stat lines on top.
 *
 * - **Knack:** the saved one, if its form still knows it (`knownKnacks`); else none.
 * - **Talents:** the learned ones in an open slot (`slotsOpen`), in slot order. The creature's v1 talents are not read.
 * - **Gear (phase 4):** stat lines only. The v1 fold (`applyGear`) is run again over the worn items with no talents and
 *   no place in a row, and only what it gives to Attack, HP, Speed and crit is added; its modifier sheet and its rules
 *   (every effect line, the position lines and the Scarf's rest) are left out. Armour has no v1 line.
 * - **Fusion** is not read: v2 stats come from the form and the level.
 *
 * The fighter's `uid` and `key` are the creature's id, so a carried HP, a board event and a stored result name it
 * the way the rest of the game does. Its place (`row`, `col`) is the caller's.
 */
import { applyGear, content, dungeonContent, slotsOpen } from '@creatures/game';
import { combatV2, knownKnacks } from '@creatures/game/combat-v2';
import { createResolver, type FighterSpec, type Shipped } from '@creatures/engine/v2';
import type { TeamCreature } from './raid-teams';
import type { LearnedTalent } from './talent-v2-store';

/** The shipped species, raid bosses and dungeon foes the resolver reads beside the combat v2 pack. */
export const SHIPPED: Shipped = {
  creatures: content.creatures,
  bosses: content.bosses,
  foes: dungeonContent.foes,
};

/** One resolver for the worker, so the stats of a form at a level are worked out once per isolate. */
const resolver = createResolver(combatV2, SHIPPED);

/** The owner key of a solo fight's team (the engine never shows it). */
const OWNER = 'p1';

/** What a creature's worn gear adds to its fight numbers under v2: the stat lines only. */
export interface GearStats {
  hp: number;
  atk: number;
  spd: number;
  critChanceBp: number;
  critDamageBp: number;
}

/** The stat lines of a creature's worn gear (see the file comment). All zeros without gear. */
export function gearStatLines(kit: TeamCreature['kit']): GearStats {
  if (kit.items.length === 0) return { hp: 0, atk: 0, spd: 0, critChanceBp: 0, critDamageBp: 0 };
  const folded = applyGear(kit.stats, kit.crit, kit.wearer, kit.items, []);
  return {
    hp: folded.stats.hp - kit.stats.hp,
    atk: folded.stats.atk - kit.stats.atk,
    spd: folded.stats.spd - kit.stats.spd,
    critChanceBp: (folded.crit?.chanceBp ?? 0) - (kit.crit?.chanceBp ?? 0),
    critDamageBp: (folded.crit?.damageBp ?? 0) - (kit.crit?.damageBp ?? 0),
  };
}

/** The talents a creature fights with: learned, in a slot that is open at its level, in slot order. */
export function slottedTalents(
  creature: Pick<TeamCreature, 'species' | 'level'>,
  learned: readonly LearnedTalent[],
): string[] {
  const open = slotsOpen(creature.species.rarity, creature.level);
  return learned
    .flatMap((l) => (l.slot !== null && l.slot <= open ? [{ id: l.talentId, slot: l.slot }] : []))
    .filter((t) => Object.hasOwn(combatV2.talents, t.id))
    .sort((a, b) => a.slot - b.slot)
    .map((t) => t.id);
}

/** The creature as the engine's fighter, in no place yet (`row` 0, `col` 0). `learned` is what it has learned from its line's book. */
export function fighterV2(creature: TeamCreature, learned: readonly LearnedTalent[]): FighterSpec {
  const saved = creature.knack;
  const knack =
    saved !== null && knownKnacks(creature.species.id).includes(saved) ? saved : undefined;
  const base = resolver.resolve({
    owner: OWNER,
    formId: creature.species.id,
    level: creature.level,
    ...(knack === undefined ? {} : { knack }),
    talents: slottedTalents(creature, learned),
    row: 0,
    col: 0,
  });
  const gear = gearStatLines(creature.kit);
  return {
    ...base,
    uid: creature.id,
    key: creature.id,
    maxHp: base.maxHp + gear.hp,
    atk: base.atk + gear.atk,
    spd: base.spd + gear.spd,
    critChanceBp: base.critChanceBp + gear.critChanceBp,
    critDamageBp: base.critDamageBp + gear.critDamageBp,
  };
}

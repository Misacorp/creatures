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

/**
 * One resolver for the worker (the raid's and the dungeon's), so the stats of a form at a level are worked out once per isolate. Its
 * memos are only derived data, never state that must last.
 */
export const resolver = createResolver(combatV2, SHIPPED);

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

/** What no gear adds. */
export const NO_GEAR: Readonly<GearStats> = {
  hp: 0,
  atk: 0,
  spd: 0,
  critChanceBp: 0,
  critDamageBp: 0,
};

/** The stat lines of a creature's worn gear (see the file comment). All zeros without gear. */
export function gearStatLines(kit: TeamCreature['kit']): GearStats {
  if (kit.items.length === 0) return { ...NO_GEAR };
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
  return buildFighter({
    id: creature.id,
    owner: OWNER,
    formId: creature.species.id,
    level: creature.level,
    knack: creature.knack,
    talents: slottedTalents(creature, learned),
    gear: gearStatLines(creature.kit),
    row: 0,
    col: 0,
  });
}

/** The saved Knack the form still knows, or undefined for none (a Knack the form no longer knows counts as none). */
export const savedKnackOf = (formId: string, saved: string | null): string | undefined =>
  saved !== null && knownKnacks(formId).includes(saved) ? saved : undefined;

/** What makes a creature a fighter: who and where it is, what it knows and what it wears (the stat lines already worked out). */
export interface FighterBuild {
  /** The creature's id: the fighter's `uid` and `key`. */
  id: string;
  /** The owner's key in the fight. */
  owner: string;
  formId: string;
  level: number;
  /** The saved Knack as stored (a Knack the form does not know counts as none). */
  knack: string | null;
  /** The slotted v2 talents that are open at the level, in slot order (`slottedTalents`). */
  talents: readonly string[];
  gear: GearStats;
  row: number;
  col: number;
}

/**
 * The one place a creature becomes the engine's fighter: the resolver's numbers for its form, level, Knack and talents, with the gear's
 * stat lines added to HP, Attack, Speed and crit. The dungeon (`fighterV2`), the raid (`fighterOf` of `raid-v2-fighters.ts`) and the
 * creature page (`fightNumbers` of the result) all go through it, so the page can never show what the fight does not use.
 */
export function buildFighter(b: FighterBuild): FighterSpec {
  const knack = savedKnackOf(b.formId, b.knack);
  const base = resolver.resolve({
    owner: b.owner,
    formId: b.formId,
    level: b.level,
    ...(knack === undefined ? {} : { knack }),
    talents: [...b.talents],
    row: b.row,
    col: b.col,
  });
  return {
    ...base,
    uid: b.id,
    key: b.id,
    maxHp: base.maxHp + b.gear.hp,
    atk: base.atk + b.gear.atk,
    spd: base.spd + b.gear.spd,
    critChanceBp: base.critChanceBp + b.gear.critChanceBp,
    critDamageBp: base.critDamageBp + b.gear.critDamageBp,
  };
}

/**
 * A fighter's numbers as the fight reads them (the creature page shows these): Max HP, Attack (with the talents' and the Knack's
 * share on top, as the engine's `creature.ts` works it out), Speed, Armour (the engine's `ownArmour`), the chance a hit crits and what
 * a crit multiplies it by (10000 is 1x), both with the base crit of the rules in.
 */
export interface FightNumbers {
  hp: number;
  atk: number;
  spd: number;
  armour: number;
  critChanceBp: number;
  critMultBp: number;
}

export function fightNumbers(f: FighterSpec): FightNumbers {
  const fx = f.fxAll;
  return {
    hp: f.maxHp,
    atk: Math.floor((f.atk * (10_000 + (fx.atkBp ?? 0))) / 10_000),
    spd: f.spd,
    armour: f.baseArmour + (fx.armourBonus ?? 0),
    critChanceBp: combatV2.rules.critChanceBp + f.critChanceBp + (fx.critChanceBp ?? 0),
    critMultBp: combatV2.rules.critBp + f.critDamageBp + (fx.critDamageBp ?? 0),
  };
}

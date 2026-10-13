import { RULES } from '../rules/config';
import { loadDungeon, type DungeonFoeDef, type RoomModifierDef } from './dungeon-schema';
import foesJson from './data/dungeon-foes.json';
import modifiersJson from './data/room-modifiers.json';

/** The shipped dungeon foes and room modifiers, validated at module load. */
export const dungeonContent = loadDungeon(foesJson, modifiersJson, RULES.dungeon.rooms);

const FOES = new Map<string, DungeonFoeDef>(dungeonContent.foes.map((f) => [f.id, f]));
const MODIFIERS = new Map<string, RoomModifierDef>(dungeonContent.modifiers.map((m) => [m.id, m]));

/** A dungeon foe by id, or undefined. */
export function dungeonFoe(id: string): DungeonFoeDef | undefined {
  return FOES.get(id);
}

/** A room modifier by id, or undefined. */
export function roomModifier(id: string): RoomModifierDef | undefined {
  return MODIFIERS.get(id);
}

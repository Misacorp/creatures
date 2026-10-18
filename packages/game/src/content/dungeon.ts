import { RULES } from '../rules/config';
import {
  loadDungeon,
  loadDungeonRun,
  type DungeonEventDef,
  type DungeonFoeDef,
  type KeepsakeDef,
  type RoomModifierDef,
} from './dungeon-schema';
import foesJson from './data/dungeon-foes.json';
import modifiersJson from './data/room-modifiers.json';
import keepsakesJson from './data/dungeon-keepsakes.json';
import eventsJson from './data/dungeon-events.json';

/** The shipped dungeon foes and room modifiers, validated at module load. */
export const dungeonContent = loadDungeon(foesJson, modifiersJson, RULES.dungeon.rooms);

/** The shipped keepsakes and mystery-room events, validated at module load (after the foes and modifiers, whose ids they must not reuse). */
export const dungeonRunContent = loadDungeonRun(keepsakesJson, eventsJson, dungeonContent);

const FOES = new Map<string, DungeonFoeDef>(dungeonContent.foes.map((f) => [f.id, f]));
const MODIFIERS = new Map<string, RoomModifierDef>(dungeonContent.modifiers.map((m) => [m.id, m]));
const KEEPSAKES = new Map<string, KeepsakeDef>(dungeonRunContent.keepsakes.map((k) => [k.id, k]));
const EVENTS = new Map<string, DungeonEventDef>(dungeonRunContent.events.map((e) => [e.id, e]));

/** A dungeon foe by id, or undefined. */
export function dungeonFoe(id: string): DungeonFoeDef | undefined {
  return FOES.get(id);
}

/** A room modifier by id, or undefined. */
export function roomModifier(id: string): RoomModifierDef | undefined {
  return MODIFIERS.get(id);
}

/** A keepsake by id, or undefined. */
export function dungeonKeepsake(id: string): KeepsakeDef | undefined {
  return KEEPSAKES.get(id);
}

/** A mystery-room event by id, or undefined. */
export function dungeonEvent(id: string): DungeonEventDef | undefined {
  return EVENTS.get(id);
}

/** Every keepsake, in content order. */
export const dungeonKeepsakes: readonly KeepsakeDef[] = dungeonRunContent.keepsakes;

/** Every mystery-room event, in content order. */
export const dungeonEvents: readonly DungeonEventDef[] = dungeonRunContent.events;

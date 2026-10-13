/**
 * What the dungeon's playback needs, as pure functions: a stored room turned into what the fight
 * stage draws, the timing of the cards between rooms, and the results card's lines. Nothing here
 * touches the DOM, the network or the clock, and the text it returns is plain text (names can carry
 * what players typed).
 */
import type { EventNames } from '@creatures/engine';
import { partsEntries, partsText } from './gear-view';
import type { GrantLoot } from './gear-types';
import type {
  DungeonReplay,
  DungeonReplayRoom,
  DungeonRewards,
  DungeonRoomSummary,
  DungeonRunSummary,
} from './dungeon-types';
import type { ReplayRowEntry } from './raid-api';
import type { Speed } from './replay';

/** The card "Room 2 · Flooded" stays this long at normal speed, before the room's fight starts. */
export const ROOM_CARD_MS = 2_200;
/** After a room's last beat the final state rests this long (the foe down, or the team down). */
export const ROOM_END_MS = 1_600;

/** A time at the chosen speed: 2x halves everything, the same as the engine's replay pacing. */
export function atSpeed(ms: number, speed: Speed): number {
  return speed === 2 ? Math.round(ms / 2) : ms;
}

/** The fight stage's row for a dungeon replay: the team front to back, every creature the player's own. */
export function stageRow(replay: Pick<DungeonReplay, 'row'>): ReplayRowEntry[] {
  return [...replay.row]
    .sort((a, b) => a.position - b.position)
    .map((r) => ({
      position: r.position,
      id: r.id,
      name: r.name,
      species: r.species,
      element: r.element,
      role: r.role,
      level: r.level,
      owner: 'p1',
    }));
}

/** The creature ids of the row, which are all the player's. */
export function mineIds(row: readonly { id: string }[]): Set<string> {
  return new Set(row.map((r) => r.id));
}

/** The names the stage and the log use for a room (the foe plays the boss). */
export function roomNames(room: Pick<DungeonReplayRoom, 'names'>): EventNames {
  return room.names;
}

/** The stage's boss for a room: the foe's content id and name. */
export function roomBoss(room: Pick<DungeonReplayRoom, 'foe'>): { id: string; name: string } {
  return { id: room.foe.id, name: room.foe.name };
}

/**
 * The room after this one, or null at the end of the run. A lost room is the last one played (the
 * server stores only rooms that were played), so the run ends there.
 */
export function nextRoom(replay: Pick<DungeonReplay, 'rooms'>, index: number): number | null {
  return index + 1 < replay.rooms.length ? index + 1 : null;
}

/** The line under the stage when a room's fight has played out. */
export function roomResultLine(room: Pick<DungeonReplayRoom, 'cleared' | 'foe'>): string {
  return room.cleared ? `${room.foe.name} defeated.` : `Your team could not beat ${room.foe.name}.`;
}

/** How a room ended, for the results card. */
export type RoomOutcome = 'cleared' | 'lost' | 'not reached';

export function roomOutcome(room: Pick<DungeonRoomSummary, 'played' | 'cleared'>): RoomOutcome {
  if (!room.played) return 'not reached';
  return room.cleared ? 'cleared' : 'lost';
}

/** The foe's HP left, as "0 of 351", for a room that was played; null otherwise. */
export function foeHpLine(room: DungeonRoomSummary): string | null {
  return room.played ? `${String(room.foeHpEnd)} of ${String(room.foe.hpMax)} HP left` : null;
}

/** What a creature's HP bar says out loud. */
export function creatureHpLabel(name: string, current: number, max: number): string {
  return current <= 0
    ? `${name} HP: knocked out`
    : `${name} HP: ${String(current)} of ${String(max)}`;
}

/** The rewards as the loot list shows them: gear, bag overflow and parts (the dungeon has no blueprints). */
export function rewardLoot(rewards: DungeonRewards): GrantLoot {
  return {
    gear: rewards.gear,
    converted: rewards.converted,
    parts: rewards.parts,
    blueprints: [],
  };
}

/** The streak bonus as a loot list (its parts), or null when the run paid none. */
export function streakLoot(rewards: DungeonRewards): GrantLoot | null {
  const bonus = rewards.streak;
  if (bonus === null) return null;
  return { gear: [], converted: [], parts: bonus.parts, blueprints: [] };
}

/** True when the run paid nothing at all (a run lost in the first room). */
export function noRewards(rewards: DungeonRewards): boolean {
  return (
    rewards.bait === 0 &&
    rewards.essence === 0 &&
    partsEntries(rewards.parts).length === 0 &&
    rewards.gear.length === 0 &&
    rewards.streak === null
  );
}

/** The streak bonus in words, for the line under the rewards: "Day 3 streak bonus: 1 Scrap". */
export function streakBonusText(rewards: DungeonRewards): string | null {
  const bonus = rewards.streak;
  if (bonus === null) return null;
  const items: string[] = [];
  if (bonus.bait > 0) items.push(`${String(bonus.bait)} Bait`);
  if (bonus.essence > 0) items.push(`${String(bonus.essence)} Essence`);
  const parts = partsEntries(bonus.parts).length === 0 ? '' : partsText(bonus.parts);
  if (parts !== '') items.push(parts);
  return `Day ${String(bonus.day)} streak bonus: ${items.length === 0 ? 'nothing this time' : items.join(', ')}`;
}

/** The whole run in one sentence for a screen reader, and for the summary line on the card. */
export function runSentence(run: DungeonRunSummary): string {
  const rooms = `${String(run.roomsCleared)} of ${String(run.rooms.length)} rooms cleared`;
  return run.cleared
    ? `Cleared at depth ${String(run.depth)}: ${rooms}.`
    : `Not cleared at depth ${String(run.depth)}: ${rooms}.`;
}

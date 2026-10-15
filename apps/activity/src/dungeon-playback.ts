/**
 * What the dungeon's playback needs, as pure functions: a stored room turned into what the fight
 * stage draws, the timing of the cards between rooms, and the results card's lines. Nothing here
 * touches the DOM, the network or the clock, and the text it returns is plain text (names can carry
 * what players typed).
 */
import { roomModifier, type Gimmick } from '@creatures/game';
import { partsEntries, partsText } from './gear-view';
import type { GrantLoot } from './gear-types';
import type {
  DungeonReplay,
  DungeonReplayRoom,
  DungeonRewards,
  DungeonRoomSummary,
  DungeonRunSummary,
  DungeonTeamMember,
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

/**
 * The gimmicks a room's modifier gives its foe (Thorns' reflect), read from the content by the
 * modifier's id. A modifier the content no longer has (an old run's Fog) adds none.
 */
export function modifierGimmicks(room: Pick<DungeonReplayRoom, 'modifier'>): Gimmick[] {
  const effects = roomModifier(room.modifier.id)?.effects ?? [];
  return effects.flatMap((e) => (e.op === 'foe_gimmick' ? [e.gimmick] : []));
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
type RoomOutcome = 'cleared' | 'lost' | 'not reached';

export function roomOutcome(room: Pick<DungeonRoomSummary, 'played' | 'cleared'>): RoomOutcome {
  if (!room.played) return 'not reached';
  return room.cleared ? 'cleared' : 'lost';
}

// --- The end report: the room strip and the team breakdown ---

/** How a room reads in the strip: cleared, failed (DEFEAT), or never reached (locked). */
type RoomState = 'cleared' | 'defeat' | 'locked';

/** The word across a room's panel: CLEARED, DEFEAT, or a muted "Not reached". */
export const ROOM_BANNER: Readonly<Record<RoomState, string>> = {
  cleared: 'CLEARED',
  defeat: 'DEFEAT',
  locked: 'LOCKED',
};

export function roomState(room: Pick<DungeonRoomSummary, 'played' | 'cleared'>): RoomState {
  const outcome = roomOutcome(room);
  return outcome === 'cleared' ? 'cleared' : outcome === 'lost' ? 'defeat' : 'locked';
}

/** One panel of the room strip, in the order of the rooms (left to right, like a comic). */
export interface StripRoom {
  index: number;
  kind: 'foe' | 'boss';
  /** The foe's content id, for its sprite. */
  foeId: string;
  foeName: string;
  state: RoomState;
  banner: string;
  /** "Room 1", or "Room boss" for the last. */
  title: string;
  modifierName: string;
  /** The foe's HP left when the team lost to it ("251 / 351 HP"), otherwise null. */
  foeHp: string | null;
  /** The panel in one sentence for a screen reader. */
  spoken: string;
}

/** The rooms of a run as the strip's panels. Names are plain text (render them as text). */
export function roomStrip(run: Pick<DungeonRunSummary, 'rooms'>): StripRoom[] {
  return [...run.rooms]
    .sort((a, b) => a.index - b.index)
    .map((room) => {
      const state = roomState(room);
      const title = room.kind === 'boss' ? 'Room boss' : `Room ${String(room.index + 1)}`;
      const foeHp =
        state === 'defeat' ? `${String(room.foeHpEnd)} / ${String(room.foe.hpMax)} HP left` : null;
      const result =
        state === 'cleared' ? 'cleared' : state === 'defeat' ? 'defeat' : 'not reached';
      return {
        index: room.index,
        kind: room.kind,
        foeId: room.foe.id,
        foeName: room.foe.name,
        state,
        banner: ROOM_BANNER[state],
        title,
        modifierName: room.modifier.name,
        foeHp,
        spoken: `${title}: ${room.foe.name}, ${room.modifier.name}. ${result}.`,
      };
    });
}

/** A creature's HP under it in the team breakdown: "340 / 391 HP" (0 when it was knocked out). */
export function hpLine(member: Pick<DungeonTeamMember, 'hpEnd' | 'hpMax'>): string {
  const left = Math.max(0, Math.min(member.hpEnd, member.hpMax));
  return `${String(left)} / ${String(member.hpMax)} HP`;
}

/** One creature of the team breakdown. */
export interface TeamEntry {
  id: string;
  name: string;
  speciesId: string;
  element: string;
  role: string;
  level: number;
  hp: string;
  knockedOut: boolean;
  spoken: string;
}

/** The team in its fighting order (left to right) with its HP lines. No role or element chips here. */
export function teamBreakdown(run: Pick<DungeonRunSummary, 'team'>): TeamEntry[] {
  return run.team.map((m) => {
    const hp = hpLine(m);
    const knockedOut = m.hpEnd <= 0;
    return {
      id: m.id,
      name: m.name,
      speciesId: m.speciesId,
      element: m.element,
      role: m.role,
      level: m.level,
      hp,
      knockedOut,
      spoken: `${m.name}, level ${String(m.level)}: ${hp}${knockedOut ? ', knocked out' : ''}.`,
    };
  });
}

/** What the banner over the stage says when a room opens. Names and descriptions are plain text. */
interface RoomIntroView {
  /** "ROOM 2" in big letters, or "ROOM BOSS" for the last room. */
  heading: string;
  /** "2 / 3" (the room's place in the run). */
  place: string;
  boss: boolean;
  foeId: string;
  foeName: string;
  element: string;
  modifierName: string;
  modifierDescription: string;
  /** The whole banner in one status sentence for a screen reader. */
  spoken: string;
}

export function roomIntroView(
  room: Pick<DungeonReplayRoom, 'index' | 'kind' | 'foe' | 'modifier'>,
  total: number,
): RoomIntroView {
  const boss = room.kind === 'boss';
  const place = `${String(room.index + 1)} / ${String(total)}`;
  return {
    heading: boss ? 'ROOM BOSS' : `ROOM ${String(room.index + 1)}`,
    place,
    boss,
    foeId: room.foe.id,
    foeName: room.foe.name,
    element: room.foe.element,
    modifierName: room.modifier.name,
    modifierDescription: room.modifier.description,
    spoken: `Room ${place}${boss ? ', room boss' : ''}: ${room.foe.name}. ${room.modifier.name}: ${room.modifier.description}`,
  };
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
  const rooms = `${String(run.roomsCleared)} / ${String(run.rooms.length)} rooms cleared`;
  return run.cleared
    ? `Cleared at depth ${String(run.depth)}: ${rooms}.`
    : `Not cleared at depth ${String(run.depth)}: ${rooms}.`;
}

/**
 * How the page scrolls to the fight when a run starts: smoothly, or at once for a player who asks
 * for less motion. The fight's top edge goes to the top of the viewport.
 */
export function fightScroll(reducedMotion: boolean): ScrollIntoViewOptions {
  return { behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' };
}

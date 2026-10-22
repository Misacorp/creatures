/**
 * What the dungeon's playback needs, as pure functions: a stored room turned into what the fight
 * stage draws, the timing of the cards between rooms, and the results card's lines. Nothing here
 * touches the DOM, the network or the clock, and the text it returns is plain text (names can carry
 * what players typed).
 */
import { dungeonContent, roomModifier, type Gimmick } from '@creatures/game';
import { groupSupplies } from './claim-view';
import { experienceGain } from './xp-gain';
import type { XpChange } from './xp-change';
import { baitCount, essenceCount, partCountItems } from './count-items';
import { partsEntries } from './gear-view';
import type { CountItem } from './ui/CountBadge';
import type { GrantLoot } from './gear-types';
import type {
  DungeonReplay,
  DungeonReplayRoom,
  DungeonRewards,
  DungeonRoomSummary,
  DungeonRunCreature,
  DungeonRunSummary,
  DungeonStepLog,
  DungeonTeamMember,
} from './dungeon-types';
import { nodeLevel } from './dungeon-map';
import { fierceName, floorLine, nodeFloor, undercroftName } from './dungeon-text';
import type { ReplayRowEntry } from './raid-api';
import { gimmickGlyphKey, gimmickShort } from './raid-text';
import type { Speed } from './replay';

/**
 * The card "Room 2 · Flooded" stays this long at normal speed, before the room's fight starts. It was
 * 2.2 seconds; Misa asked for about 3 seconds more (2026-10-15) so the foe and the room's rule can be
 * read, with a draining outline showing how long is left (`RoomBanner`). The wait is the same with
 * reduced motion.
 */
export const ROOM_CARD_MS = 5_200;
/** After a room's last beat the final state rests this long (the foe down, or the team down). */
export const ROOM_END_MS = 1_600;

/** A time at the chosen speed: 2x halves everything, the same as the engine's replay pacing. */
export function atSpeed(ms: number, speed: Speed): number {
  return speed === 2 ? Math.round(ms / 2) : ms;
}

/**
 * What `DungeonPlayback` plays: the fighting row, the rooms in order and the run's landmark flag.
 * `total` is what the head counts the place against: the rooms of an old three-room run, or the
 * floors of a path.
 */
export interface PlaybackInput {
  row: DungeonReplay['row'];
  rooms: DungeonReplayRoom[];
  landmark: boolean;
  total: number;
  /** The floors of each Undercroft level the run went down into (level 1 first), for the place of its rooms. Absent: none. */
  undercroftFloors?: readonly number[];
}

/** What a room's place is counted against: the floors of its own level (the day's map, or an Undercroft level). */
export function placeTotal(
  input: Pick<PlaybackInput, 'total' | 'undercroftFloors'>,
  room: Pick<DungeonReplayRoom, 'node'>,
): number {
  const level = room.node === undefined ? 0 : nodeLevel(room.node);
  return level > 0 ? (input.undercroftFloors?.[level - 1] ?? input.total) : input.total;
}

/**
 * How many floors a path has. The map says so itself (`DungeonMapView.floors`); the replay of a
 * finished run has no map, so it counts against the same seven (`docs/design/dungeon-paths.md`).
 */
export const PATH_FLOORS = 7;

/** Every room of a stored run, to watch again. A path run counts its places in floors. */
export function replayInput(replay: DungeonReplay): PlaybackInput {
  const path = replay.rooms.some((r) => r.node !== undefined);
  const levels = replay.summary.route?.undercroft;
  return {
    row: replay.row,
    rooms: replay.rooms,
    landmark: replay.summary.landmark,
    total: path ? PATH_FLOORS : replay.rooms.length,
    ...(levels === undefined ? {} : { undercroftFloors: levels.map((m) => m.floors) }),
  };
}

/** The row of a run's creatures as the replay writes it (the position is the place in the row). */
export function rowOfCreatures(team: readonly DungeonRunCreature[]): DungeonReplay['row'] {
  return team.map((c, position) => ({
    position,
    id: c.id,
    name: c.name,
    species: c.speciesId,
    element: c.element,
    role: c.role,
    level: c.level,
  }));
}

/**
 * One fight just played by an open run: the row that fought it (the room's own `row`, else the
 * state's team), the room, and the floors it counts against.
 */
export function roomInput(
  team: readonly DungeonRunCreature[],
  room: DungeonReplayRoom,
  landmark: boolean,
  floors: number,
  undercroft: readonly { floors: number }[] = [],
): PlaybackInput {
  return {
    row: room.row ?? rowOfCreatures(team),
    rooms: [room],
    landmark,
    total: floors,
    ...(undercroft.length === 0 ? {} : { undercroftFloors: undercroft.map((m) => m.floors) }),
  };
}

/**
 * The stage's row for one room: the row that fought it (`room.row`: a camp swap or reorder changes
 * the row in the middle of a path run), else the input's row.
 */
export function roomStageRow(
  input: Pick<PlaybackInput, 'row'>,
  room: Pick<DungeonReplayRoom, 'row'>,
): ReplayRowEntry[] {
  return stageRow({ row: room.row ?? input.row });
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
 * The gimmicks a room gives its foe beyond the foe's own: the one its modifier adds (Thorns'
 * spikes), read from the content by the modifier's id (a modifier the content no longer has, an old
 * run's Fog, adds none), and, in the boss room of a landmark run, the floor boss's signature move.
 */
export function modifierGimmicks(
  room: Pick<DungeonReplayRoom, 'modifier'> & Partial<Pick<DungeonReplayRoom, 'kind' | 'foe'>>,
  landmark = false,
): Gimmick[] {
  const effects = roomModifier(room.modifier.id)?.effects ?? [];
  const added = effects.flatMap((e) => (e.op === 'foe_gimmick' ? [e.gimmick] : []));
  const signature =
    landmark && room.kind === 'boss' && room.foe !== undefined
      ? dungeonContent.foes.find((f) => f.id === room.foe?.id)?.signature
      : undefined;
  return signature === undefined ? added : [...added, signature];
}

/**
 * The trick the room banner names: the floor boss's signature move at a landmark, otherwise the
 * foe's last trick (for a floor boss the pattern it gained, for a foe its only one). Null for a foe
 * with none (the gentle ones) or one the content does not know.
 */
export function roomTrick(
  room: Pick<DungeonReplayRoom, 'kind' | 'foe'>,
  landmark = false,
): Gimmick | null {
  const foe = dungeonContent.foes.find((f) => f.id === room.foe.id);
  if (foe === undefined) return null;
  if (landmark && room.kind === 'boss' && foe.signature !== undefined) return foe.signature;
  return foe.gimmicks[foe.gimmicks.length - 1] ?? null;
}

/** The stage's boss for a room: the foe's content id, name and element. */
export function roomBoss(
  room: Pick<DungeonReplayRoom, 'foe'> & Partial<Pick<DungeonReplayRoom, 'elite'>>,
): {
  id: string;
  name: string;
  element: string;
} {
  return {
    id: room.foe.id,
    name: fierceName(room.foe.name, room.elite),
    element: room.foe.element,
  };
}

/**
 * The room after this one, or null at the end of the run. A lost room is the last one played (the
 * server stores only rooms that were played), so the run ends there.
 */
export function nextRoom(replay: Pick<DungeonReplay, 'rooms'>, index: number): number | null {
  return index + 1 < replay.rooms.length ? index + 1 : null;
}

/** The line under the stage when a room's fight has played out. */
export function roomResultLine(
  room: Pick<DungeonReplayRoom, 'cleared' | 'foe'> & Partial<Pick<DungeonReplayRoom, 'elite'>>,
): string {
  const name = fierceName(room.foe.name, room.elite);
  return room.cleared ? `${name} defeated.` : `Your team could not beat ${name}.`;
}

/** How a room ended, for the results card. */
type RoomOutcome = 'cleared' | 'lost' | 'not reached';

export function roomOutcome(room: Pick<DungeonRoomSummary, 'played' | 'cleared'>): RoomOutcome {
  if (!room.played) return 'not reached';
  return room.cleared ? 'cleared' : 'lost';
}

// --- The end report: the room strip and the team breakdown ---

/** How a room reads in the strip: cleared, failed (DEFEATED), or never reached (locked). */
type RoomState = 'cleared' | 'defeat' | 'locked';

/** The word across a room's panel: CLEARED, DEFEATED, or a muted "Not reached". */
export const ROOM_BANNER: Readonly<Record<RoomState, string>> = {
  cleared: 'CLEARED',
  defeat: 'DEFEATED',
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
  /** The Undercroft level the room was on (0: the day's map). */
  level: number;
  /** An epic fight of the Undercroft. */
  epic: boolean;
  /** The foe's content id, for its sprite. */
  foeId: string;
  foeName: string;
  state: RoomState;
  banner: string;
  /** "Room 1", or "Floor boss" for the last ("Fight 1" and "Elite" on a path run; "Undercroft 1" and "Epic" below). */
  title: string;
  elite: boolean;
  modifierName: string;
  /** The foe's HP left when the team lost to it ("251 / 351 HP"), otherwise null. */
  foeHp: string | null;
  /** The panel in one sentence for a screen reader. */
  spoken: string;
}

/**
 * The rooms of a run as the strip's panels. Names are plain text (render them as text). A path run
 * shows the rooms it actually played, in the order it played them (the rooms it never reached are
 * left out); an old three-room run shows all three, the unreached ones locked.
 */
export function roomStrip(
  run: Pick<DungeonRunSummary, 'rooms'> & Partial<Pick<DungeonRunSummary, 'outcome' | 'route'>>,
): StripRoom[] {
  const sorted = [...run.rooms].sort((a, b) => a.index - b.index);
  const rooms = run.outcome === undefined ? sorted : sorted.filter((r) => r.played);
  const levels = roomLevels(rooms.length, run.route?.history);
  return rooms.map((room, place) => {
    const state = roomState(room);
    const elite = room.elite === true;
    const epic = room.epic === true;
    const level = levels[place] ?? 0;
    const title = epic
      ? 'Epic'
      : room.kind === 'boss'
        ? 'Floor boss'
        : level > 0
          ? elite
            ? 'Undercroft elite'
            : undercroftName(level)
          : elite
            ? 'Elite'
            : run.outcome === undefined
              ? `Room ${String(room.index + 1)}`
              : `Fight ${String(place + 1)}`;
    const name = fierceName(room.foe.name, elite);
    const foeHp =
      state === 'defeat' ? `${String(room.foeHpEnd)} / ${String(room.foe.hpMax)} HP left` : null;
    const result = state === 'cleared' ? 'cleared' : state === 'defeat' ? 'defeat' : 'not reached';
    return {
      index: room.index,
      kind: room.kind,
      level,
      epic,
      foeId: room.foe.id,
      foeName: name,
      state,
      banner: ROOM_BANNER[state],
      title,
      elite,
      modifierName: room.modifier.name,
      foeHp,
      spoken: `${title}: ${name}, ${room.modifier.name}. ${result}.`,
    };
  });
}

/**
 * The Undercroft level of each room a run played, in order: the played rooms are the fights of the route's
 * history in the same order, and a fight's node id says its level. All 0 when there is no route (an older
 * run) or its fights do not match the rooms one for one.
 */
export function roomLevels(
  played: number,
  history: readonly DungeonStepLog[] | undefined,
): number[] {
  const nodes = (history ?? []).flatMap((e) => (e.result === 'fight' ? [e.node] : []));
  return nodes.length === played
    ? nodes.map((n) => nodeLevel(n))
    : Array.from({ length: played }, () => 0);
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
  /**
   * What the run paid this creature as the shared experience row (levels, the bar, "+N" and the multiplier),
   * or null (a run from before experience).
   */
  exp: XpChange | null;
}

/** The team in its fighting order (left to right) with its HP lines. No role or element chips here. */
export function teamBreakdown(run: Pick<DungeonRunSummary, 'team' | 'rewards'>): TeamEntry[] {
  return run.team.map((m) => {
    const paid = run.rewards.experience?.find((e) => e.creatureId === m.id);
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
      exp: paid === undefined ? null : experienceGain(paid, m.name),
    };
  });
}

/** One creature of the experience recap: every creature the run paid, the one sent home at a camp too. */
export interface RecapEntry {
  id: string;
  name: string;
  speciesId: string;
  exp: XpChange;
  /** It was not in the row at the end (sent home at a camp): it keeps what it earned. */
  wentHome: boolean;
}

/**
 * The experience recap of a finished run: a row for every creature that earned experience, in the order
 * the server paid them (the start row first). A run from before the recap lists its team's creatures only.
 */
export function experienceRecap(run: Pick<DungeonRunSummary, 'team' | 'rewards'>): RecapEntry[] {
  const { experience = [], recap = [] } = run.rewards;
  return experience.flatMap((paid) => {
    const member = run.team.find((m) => m.id === paid.creatureId);
    const note = recap.find((r) => r.creatureId === paid.creatureId);
    const name = member?.name ?? note?.name;
    const speciesId = member?.speciesId ?? note?.speciesId;
    if (name === undefined || speciesId === undefined) return [];
    return [
      {
        id: paid.creatureId,
        name,
        speciesId,
        exp: experienceGain(paid, name),
        wentHome: member === undefined,
      },
    ];
  });
}

/** What the banner over the stage says when a room opens. Names and descriptions are plain text. */
interface RoomIntroView {
  /** "ROOM 2" in big letters, "FLOOR BOSS" for the last room, "FIGHT" for a room of a path ("EPIC FIGHT" below). */
  heading: string;
  /** "2 / 3" (the room's place in an old run), "Room 3 / 7" (a room of a path) or "Undercroft 1 · Room 2 / 4". */
  place: string;
  boss: boolean;
  /** A fiercer foe of a path: the banner adds an Elite tag (an epic fight has its own, `epic`). */
  elite: boolean;
  /** An epic fight of the Undercroft: the banner adds an Epic tag instead. */
  epic: boolean;
  /** The Undercroft level the room is on (0: the day's map). */
  level: number;
  foeId: string;
  /** The foe's name, "Fierce ..." for an elite. */
  foeName: string;
  element: string;
  modifierName: string;
  modifierDescription: string;
  /**
   * The foe's trick: the key of its glyph, its name and one line in the dungeon's row wording ("Hits
   * one random creature, every 2 rounds"); null when the foe has none.
   */
  trick: { glyph: string; name: string; line: string } | null;
  /** The whole banner in one status sentence for a screen reader. */
  spoken: string;
}

export function roomIntroView(
  room: Pick<DungeonReplayRoom, 'index' | 'kind' | 'foe' | 'modifier'> &
    Partial<Pick<DungeonReplayRoom, 'elite' | 'epic' | 'node'>>,
  total: number,
  landmark = false,
): RoomIntroView {
  const boss = room.kind === 'boss';
  const epic = room.epic === true;
  const elite = room.elite === true && !epic;
  const level = room.node === undefined ? 0 : nodeLevel(room.node);
  const gimmick = roomTrick(room, landmark);
  const trick =
    gimmick === null
      ? null
      : {
          glyph: gimmickGlyphKey(gimmick),
          name: gimmick.name,
          line: gimmickShort(gimmick, 'row'),
        };
  const floor = room.node === undefined ? null : nodeFloor(room.node);
  const place =
    floor === null
      ? `${String(room.index + 1)} / ${String(total)}`
      : level > 0
        ? `${undercroftName(level)} · ${floorLine(floor, total)}`
        : floorLine(floor, total);
  const heading = boss
    ? 'FLOOR BOSS'
    : epic
      ? 'EPIC FIGHT'
      : floor !== null
        ? 'FIGHT'
        : `ROOM ${String(room.index + 1)}`;
  const foeName = fierceName(room.foe.name, elite || epic);
  const where = floor === null ? `Room ${place}` : place;
  return {
    heading,
    place,
    boss,
    elite,
    epic,
    level,
    foeId: room.foe.id,
    foeName,
    element: room.foe.element,
    modifierName: room.modifier.name,
    modifierDescription: room.modifier.description,
    trick,
    spoken: `${where}${boss ? ', floor boss' : ''}${elite ? ', elite' : ''}${epic ? ', epic fight' : ''}: ${foeName}. ${trick === null ? '' : `${trick.name}: ${trick.line}. `}${room.modifier.name}: ${room.modifier.description}`,
  };
}

/** The rewards as the loot list shows them: gear, bag overflow, blueprints (a rare room's treasure), parts and supplies. */
export function rewardLoot(rewards: DungeonRewards): GrantLoot {
  return {
    gear: rewards.gear,
    converted: rewards.converted,
    parts: rewards.parts,
    blueprints: rewards.blueprints ?? [],
    supplies: rewards.supplies ?? [],
  };
}

/** The supplies the run dropped, counted by id ("2 Plain Lure"), for the count badges. */
export function droppedSupplies(
  rewards: Pick<DungeonRewards, 'supplies'>,
): { id: string; name: string; amount: number }[] {
  return groupSupplies(rewards.supplies ?? []);
}

/**
 * The streak bonus of the day as its own section: the title ("7 Day Streak Bonus") and what it paid as count
 * badges (Bait, Essence, parts). Null when the run paid none. It is apart from the run's own rewards (the
 * server does not add the two), so the player sees what the streak gave.
 */
export function streakBonus(
  rewards: DungeonRewards,
): { title: string; counts: CountItem[] } | null {
  const bonus = rewards.streak;
  if (bonus === null) return null;
  return {
    title: `${String(bonus.day)} Day Streak Bonus`,
    counts: [
      ...(bonus.bait > 0 ? [baitCount(bonus.bait, { entry: true })] : []),
      ...(bonus.essence > 0 ? [essenceCount(bonus.essence, { entry: true })] : []),
      ...partCountItems(bonus.parts),
    ],
  };
}

/** What the results say when a run paid nothing, and the hint under it. */
export const NO_REWARDS_LINE = 'No rewards this time.';
export const NO_REWARDS_HINT = 'Beat at least one room next time.';

/** True when the run paid nothing at all (a run lost in the first room). */
export function noRewards(rewards: DungeonRewards): boolean {
  return (
    rewards.bait === 0 &&
    rewards.essence === 0 &&
    partsEntries(rewards.parts).length === 0 &&
    rewards.gear.length === 0 &&
    (rewards.blueprints ?? []).length === 0 &&
    (rewards.supplies ?? []).length === 0 &&
    rewards.streak === null
  );
}

/**
 * How the page scrolls to the fight arena when a fight starts (a move that played one, or "Watch
 * again"): smoothly, or at once for a player who asks for less motion. The arena's top edge goes to
 * the top of the viewport. (After a fight ends the run's own screen scrolls to the strip with the
 * party instead: `arriveScroll`.)
 */
export function fightScroll(reducedMotion: boolean): ScrollIntoViewOptions {
  return { behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' };
}

/**
 * True when the arena is not wholly on screen, so the page should bring it into view again at the
 * moment the fight starts (the page may have been scrolled, or moved under the banner). `rect` is the
 * arena's box relative to the viewport.
 */
export function arenaOutOfView(
  rect: { top: number; bottom: number },
  viewportHeight: number,
): boolean {
  return rect.top < 0 || rect.bottom > viewportHeight;
}

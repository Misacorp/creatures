/**
 * A room of a dungeon run on combat v2 as the fight stage draws it (docs/design/combat/integration.md, section 6): the foe as the stage's
 * boss, the row as the stage's creatures (all the player's, one row, `col` the place in it), and what the fold needs. The server stores the
 * engine's own events for the room; nothing here is fight maths. Pure: names stay data, drawn as text by the screens.
 */
import type { FightBossV2, FightCreatureV2, FightNamesV2 } from './fight-v2-api';
import { roomBoss } from './dungeon-playback';
import type { DungeonReplayRoomV2 } from './dungeon-types';
import type { ReplayRowEntry } from './raid-api';
import type { BossCardV2 } from './raid-v2-api';

/** The owner key of every creature in a dungeon room: the run is one player's. */
export const DUNGEON_OWNER = 'p1';

/** What the v2 stage is given for a dungeon room. */
export interface RoomFightV2 {
  boss: FightBossV2;
  card: BossCardV2;
  fighters: FightCreatureV2[];
  names: FightNamesV2;
  /** The foe's HP when the room began: the bar's full length (a dungeon room has no stages). */
  hpMax: number;
  /** The foe's round limit, for "Round 3 / 8". */
  rounds: number;
}

/**
 * The room as the stage takes it. `row` is the whole row that stood in the room, a knocked-out creature included (it is in its place
 * with 0 HP, greyed, and its place does not close up); the events name a creature by its id.
 */
export function roomFightV2(
  room: DungeonReplayRoomV2,
  row: readonly ReplayRowEntry[],
): RoomFightV2 {
  const foe = roomBoss(room);
  const fighters = [...row]
    .sort((a, b) => a.position - b.position)
    .map((r): FightCreatureV2 => {
      const maxHp = Math.max(1, room.hpMax[r.id] ?? 1);
      return {
        key: r.id,
        name: r.name,
        species: r.species,
        element: r.element,
        role: r.role,
        level: r.level,
        owner: DUNGEON_OWNER,
        row: 0,
        col: r.position,
        knack: null,
        knackName: room.knacks[r.id] ?? null,
        talents: [],
        maxHp,
        startHp: Math.min(maxHp, room.hpStart[r.id] ?? maxHp),
      };
    });
  return {
    boss: {
      id: foe.id,
      name: foe.name,
      element: foe.element,
      hp: room.foe.hpMax,
      rows: room.arena.rows,
      cols: room.arena.cols,
      rounds: room.arena.rounds,
    },
    card: room.card,
    fighters,
    names: {
      players: { [DUNGEON_OWNER]: 'You' },
      creatures: Object.fromEntries(fighters.map((f) => [f.key, f.name])),
    },
    hpMax: room.foe.hpMax,
    rounds: room.arena.rounds,
  };
}

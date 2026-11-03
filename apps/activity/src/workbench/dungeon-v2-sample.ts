/**
 * Real combat v2 rooms of the daily dungeon for the workbench pages and the tests: a row of three on the foe's one-row arena, the room
 * played by the engine itself (`fightV2` with the log on, a seeded RNG, the foe from `foeAt` at a depth, the HP the row carries in),
 * shaped as the worker's views send them (`DungeonReplayRoomV2`, a v2 run's map with each foe's card). Nothing here is written by hand:
 * every event is the engine's. Fixture data only; no API call.
 */
import { content, createSeededRng, dungeonContent } from '@creatures/game';
import { combatV2, knownKnacks } from '@creatures/game/combat-v2';
import {
  createResolver,
  fightV2,
  foeAt,
  type FighterSpec,
  type FightInputV2,
  type Shipped,
} from '@creatures/engine/v2';
import { cardOfBoss } from './fight-v2-sample';
import { speciesLabel } from './data';
import type { DungeonMapView, DungeonReplayRoomV2, Role } from '../dungeon-types';
import type { ReplayRowEntry } from '../raid-api';
import type { BossCardV2 } from '../raid-v2-api';
import { getSpecies } from '../game';

const SHIPPED: Shipped = {
  creatures: content.creatures,
  bosses: content.bosses,
  foes: dungeonContent.foes,
};
const resolver = createResolver(combatV2, SHIPPED);

/** The three creatures of the sample row, left to right: a Guard, a Payoff and a Setter. */
export const ROW_SPECIES = ['thornbuck', 'pyrelynx', 'tidewing'] as const;

/** The card of a dungeon foe at a depth, as the worker's `foeCardV2` sends it. */
export function foeCard(foeId: string, depth: number, signature = false): BossCardV2 {
  return cardOfBoss(
    foeAt(combatV2, SHIPPED, foeId, depth, signature ? { signature: true } : {}),
    null,
  );
}

/** A day's map as a v2 run sends it: the same rooms, each foe with its card at the depth. */
export function mapV2(map: DungeonMapView, depth: number): DungeonMapView {
  return {
    ...map,
    nodes: map.nodes.map((node) =>
      node.foe === undefined
        ? node
        : {
            ...node,
            foe: {
              ...node.foe,
              card: foeCard(node.foe.id, depth),
            },
          },
    ),
  };
}

export interface RoomSampleOptions {
  /** The foe's content id (`foes.json`). */
  foe: string;
  /** The depth the foe is built at. */
  depth: number;
  /** The creatures' level. */
  level: number;
  seed: string;
  /** The map node the room stands on. */
  node?: string;
  /** The HP each creature comes in with, as a share of its Max HP (0: out since an earlier room); absent: full. */
  carried?: readonly (number | undefined)[];
  /** A fiercer foe: its HP and Attack are scaled up as the worker's elite boost does (a stand-in factor for the sample). */
  elite?: boolean;
  /** The floor boss at a landmark has its signature move. */
  signature?: boolean;
}

/** The row of the sample: its creatures' ids are `c1` to `c3`, in the place they stand in. */
export function sampleRow(): ReplayRowEntry[] {
  return ROW_SPECIES.map((species, position) => ({
    position,
    id: `c${String(position + 1)}`,
    name: speciesLabel(species),
    species,
    element: getSpecies(species)?.element ?? 'tide',
    role: getSpecies(species)?.role ?? 'guard',
    level: 20,
    owner: 'p1',
  }));
}

/** A room played by the engine and sent as the worker sends it (`replayRoomV2`). */
export function sampleRoomV2(o: RoomSampleOptions): {
  room: DungeonReplayRoomV2;
  row: ReplayRowEntry[];
} {
  const row = sampleRow().map((r) => ({ ...r, level: o.level }));
  const fighters: FighterSpec[] = row.map((r, col) => {
    const knack = knownKnacks(r.species)[0];
    return {
      ...resolver.resolve({
        owner: 'p1',
        formId: r.species,
        level: o.level,
        ...(knack === undefined ? {} : { knack }),
        talents: [],
        row: 0,
        col,
      }),
      uid: r.id,
      key: r.id,
      name: r.name,
    };
  });
  const foe = foeAt(
    combatV2,
    SHIPPED,
    o.foe,
    o.depth,
    o.signature === true ? { signature: true } : {},
  );
  const boss =
    o.elite === true
      ? { ...foe, hp: Math.floor(foe.hp * 1.4), atk: Math.floor(foe.atk * 1.4) }
      : foe;
  const hpMax = Object.fromEntries(fighters.map((f) => [f.key ?? f.uid, f.maxHp]));
  const hpStart = Object.fromEntries(
    fighters.map((f, k) => {
      const share = o.carried?.[k];
      const id = f.key ?? f.uid;
      return [id, share === undefined ? f.maxHp : Math.round(f.maxHp * share)];
    }),
  );
  const standing = fighters.filter((f) => (hpStart[f.key ?? f.uid] ?? 0) > 0);
  const input: FightInputV2 = {
    version: 2,
    rules: combatV2.rules,
    elements: content.elements.map((e) => e.id),
    chart: content.elementChart,
    boss,
    fighters: standing,
    options: { log: true, carryHp: new Map(Object.entries(hpStart)) },
  };
  const result = fightV2(input, createSeededRng(o.seed));
  const hpEnd = Object.fromEntries(
    fighters.map((f) => {
      const id = f.key ?? f.uid;
      return [id, (hpStart[id] ?? 0) <= 0 ? 0 : Math.max(0, result.hpLeft.get(id) ?? 0)];
    }),
  );
  const end = [...result.events].reverse().find((e) => e.board?.type === 'end')?.board;
  const info = dungeonContent.foes.find((f) => f.id === o.foe);
  const room: DungeonReplayRoomV2 = {
    rules: 2,
    index: 0,
    kind: info?.kind === 'boss' ? 'boss' : 'foe',
    ...(o.elite === true ? { elite: true } : {}),
    node: o.node ?? 'f1l1',
    row: row.map((r) => ({
      position: r.position,
      id: r.id,
      name: r.name,
      species: r.species,
      element: r.element as DungeonReplayRoomV2['foe']['element'],
      role: r.role as Role,
      level: r.level,
    })),
    foe: {
      id: boss.id,
      name: boss.name,
      element: boss.element as DungeonReplayRoomV2['foe']['element'],
      hpMax: boss.hp,
    },
    modifier: { id: 'flooded', name: 'Flooded', description: 'Tide creatures hit 20% harder.' },
    cleared: result.won,
    rounds: end?.type === 'end' ? end.round : 0,
    hpStart,
    hpEnd,
    hpMax,
    events: [...result.events],
    card: cardOfBoss(boss, null),
    arena: { rows: boss.rows, cols: boss.cols, rounds: boss.rounds },
    knacks: Object.fromEntries(
      fighters.flatMap((f) => {
        const name = f.knack === undefined ? undefined : combatV2.knacks[f.knack]?.name;
        return name === undefined ? [] : [[f.key ?? f.uid, name]];
      }),
    ),
  };
  return { room, row };
}

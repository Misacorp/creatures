/**
 * The rules of a daily dungeon run on the map (docs/design/dungeon-paths.md), as pure functions the
 * worker and the balance simulator both drive: the worker adds storage and live dice, the simulator
 * adds a policy. A run is a walk over a `DungeonMap`: each node is a room (`roomSpecForNode`), loot
 * goes into the pack (`nodeLoot`, `addPack`), a mystery room is an event (`resolveEvent`), the camp
 * offers keepsakes and rest (`campOffers`, `campRest`), and the run ends cleared, home or defeated
 * (`keptOnDefeat`). Randomness is injected: the worker passes its live crypto source for events and
 * camp offers, tests and the simulator pass seeded streams.
 */
import { dungeonEvent, dungeonFoe, dungeonKeepsakes, roomModifier } from '../content/dungeon';
import type {
  DungeonEventDef,
  DungeonFoeDef,
  EventEffect,
  KeepsakeDef,
  PlainEventEffect,
  RoomModifierDef,
} from '../content/dungeon-schema';
import type { Element } from '../content/schema';
import { chance, int, type Rng } from '../rng';
import { RULES } from './config';
import type { DungeonXpSource } from './experience';
import { shardOf } from './gear';
import { landmarkBossId, scaledFoe, undercroftDepth } from './dungeon';
import { mapNode, type DungeonMap, type MapNode, type NodeKind } from './dungeon-map';

// --- Rooms ---

/**
 * One room of a run, with its foe and modifier stored in full so a replay never reads content again.
 * The engine's `DungeonRoomSpec` is this type: it lives here because the rules build it, and the
 * engine (which depends on this package) plays it.
 */
export interface DungeonRoomSpecData {
  index: number;
  foe: DungeonFoeDef;
  modifier: RoomModifierDef;
  /** The foe's HP and Attack at the run's depth, before the modifier (an elite's boost is already in). */
  hp: number;
  atk: number;
  /** An elite room. For display only: the boost is already in `hp` and `atk`. */
  elite?: boolean;
  /** The keepsakes the run holds when the room is fought, folded in after the modifier. Absent: none. */
  keepsakes?: KeepsakeDef[];
  /** An epic fight of the Undercroft (also `elite`, for the display: "Fierce"). The boost is already in `hp` and `atk`. */
  epic?: boolean;
  /** The Undercroft keeper: the floor boss has its landmark signature whatever the depth. Absent: the depth decides. */
  signature?: boolean;
}

/** A bonus on a number given as basis points of itself (14000 is 140%), floored, at least 1. */
function boosted(value: number, bp: number): number {
  return Math.max(1, Math.floor((value * bp) / 10_000));
}

/**
 * The foe a node holds at a depth: its own, except that the boss node holds the landmark boss
 * (`landmarkBossId`) when the depth is a landmark. Undefined for a node with no foe.
 */
export function nodeFoe(node: MapNode, depth: number, level = 0): DungeonFoeDef | undefined {
  if (node.foeId === undefined) return undefined;
  // The Undercroft's keeper is its own floor boss, whatever the depth.
  if (node.kind === 'boss' && level === 0) {
    const landmark = landmarkBossId(depth);
    if (landmark !== null) return dungeonFoe(landmark);
  }
  return dungeonFoe(node.foeId);
}

/**
 * The room of a fight, an elite, an epic fight or the boss, at `depth`, as room number `index` of the
 * run. The foe is scaled to the depth (`scaledFoe`); an elite has `RULES.dungeon.elite` on top and an
 * epic fight `RULES.dungeon.undercroft.epic`. On an Undercroft map (`map.level`) the foes are scaled at
 * `undercroftDepth(depth, level)` and the keeper (the boss node) is its own floor boss with its
 * signature. Foe and modifier are embedded in full. Throws for a node that is not a room with a foe, or
 * one the content does not know.
 */
export function roomSpecForNode(
  map: DungeonMap,
  nodeIdValue: string,
  depth: number,
  index: number,
): DungeonRoomSpecData {
  const node = mapNode(map, nodeIdValue);
  if (node === undefined) throw new RangeError(`no node "${nodeIdValue}" on the map`);
  if (
    node.kind !== 'fight' &&
    node.kind !== 'elite' &&
    node.kind !== 'boss' &&
    node.kind !== 'epic'
  ) {
    throw new RangeError(`node "${nodeIdValue}" is a ${node.kind}, not a fight`);
  }
  const level = map.level ?? 0;
  const foe = nodeFoe(node, depth, level);
  const modifier = node.modifierId === undefined ? undefined : roomModifier(node.modifierId);
  if (foe === undefined || modifier === undefined) {
    throw new RangeError(`node "${nodeIdValue}" holds content that is not known`);
  }
  const scaled = scaledFoe(foe, undercroftDepth(depth, level));
  const boost = roomBoost(node.kind);
  return {
    index,
    foe,
    modifier,
    hp: boost === null ? scaled.hp : boosted(scaled.hp, boost.hpBp),
    atk: boost === null ? scaled.atk : boosted(scaled.atk, boost.atkBp),
    ...(boost === null ? {} : { elite: true }),
    ...(node.kind === 'epic' ? { epic: true } : {}),
    ...(level > 0 && node.kind === 'boss' ? { signature: true } : {}),
  };
}

/** The boost on top of a room's foe: an elite's, an epic fight's, or none. */
function roomBoost(kind: NodeKind): { hpBp: number; atkBp: number } | null {
  if (kind === 'elite') return RULES.dungeon.elite;
  if (kind === 'epic') return RULES.dungeon.undercroft.epic;
  return null;
}

// --- The pack ---

/** The loot a run is carrying and could lose half of. (The run's supply is never in it.) */
export interface DungeonRunPack {
  bait: number;
  essence: number;
  scrap: number;
  /** Shards the rooms dropped, by part kind (`ember-shard`). Absent when none (and in runs stored before shards). */
  shards?: PackShards;
}

/** Shards in a pack, by part kind. */
export type PackShards = Partial<Record<`${Element}-shard`, number>>;

export const emptyPack = (): DungeonRunPack => ({ bait: 0, essence: 0, scrap: 0 });

const addShards = (
  a: PackShards | undefined,
  b: PackShards | undefined,
): PackShards | undefined => {
  if (a === undefined && b === undefined) return undefined;
  const out: PackShards = { ...a };
  for (const [kind, n] of Object.entries(b ?? {}) as [keyof PackShards, number][]) {
    out[kind] = (out[kind] ?? 0) + n;
  }
  return out;
};

/** The shards of a pack in all, over every element. */
export const packShardCount = (pack: Pick<DungeonRunPack, 'shards'>): number =>
  Object.values(pack.shards ?? {}).reduce((sum, n) => sum + n, 0);

export function addPack(a: DungeonRunPack, b: DungeonRunPack): DungeonRunPack {
  const shards = addShards(a.shards, b.shards);
  return {
    bait: a.bait + b.bait,
    essence: a.essence + b.essence,
    scrap: a.scrap + b.scrap,
    ...(shards === undefined ? {} : { shards }),
  };
}

/**
 * The shard a cleared room drops, if any: one shard of its foe's element with chance
 * `RULES.dungeon.shardBp[kind]`. Rooms with no foe (cache, camp, door, mystery) never drop one. Live
 * randomness from the caller's `rng`, drawn only for a room that can drop.
 */
export function rollRoomShard(rng: Rng, kind: NodeKind, element: Element): PackShards | undefined {
  if (kind !== 'fight' && kind !== 'elite' && kind !== 'epic' && kind !== 'boss') return undefined;
  return chance(rng, RULES.dungeon.shardBp[kind], 10_000) ? { [shardOf(element)]: 1 } : undefined;
}

/**
 * What clearing a room of this kind puts in the pack (`RULES.dungeon.loot`). The camp, a carved door and
 * a mystery room give nothing here: a mystery pays by the option the player picks. In the Undercroft
 * (`level` above 0) fights, elites and caches put `lootMultiplier` times as much in the pack, an epic
 * fight pays its own loot, and the keeper (the boss node) pays the Undercroft chest's Essence and scrap.
 */
export function nodeLoot(kind: NodeKind, level = 0): DungeonRunPack {
  const u = RULES.dungeon.undercroft;
  if (level > 0) {
    switch (kind) {
      case 'fight':
      case 'elite':
      case 'cache': {
        const loot = RULES.dungeon.loot[kind];
        return {
          bait: loot.bait * u.lootMultiplier,
          essence: loot.essence * u.lootMultiplier,
          scrap: loot.scrap * u.lootMultiplier,
        };
      }
      case 'epic':
        return { ...u.epic.loot };
      case 'boss':
        return { bait: 0, essence: u.chest.essence, scrap: u.chest.scrap };
      default:
        return emptyPack();
    }
  }
  switch (kind) {
    case 'fight':
    case 'elite':
    case 'cache':
    case 'boss':
      return { ...RULES.dungeon.loot[kind] };
    default:
      return emptyPack();
  }
}

/** What a defeat keeps of the pack: `RULES.dungeon.defeatKeepBp` of each amount, rounded up (1 stays 1, 3 becomes 2). */
export function keptOnDefeat(pack: DungeonRunPack): DungeonRunPack {
  const keep = (n: number): number => Math.floor((n * RULES.dungeon.defeatKeepBp + 9_999) / 10_000);
  const shards = Object.entries(pack.shards ?? {}) as [keyof PackShards, number][];
  return {
    bait: keep(pack.bait),
    essence: keep(pack.essence),
    scrap: keep(pack.scrap),
    ...(shards.length === 0
      ? {}
      : { shards: Object.fromEntries(shards.map(([kind, n]) => [kind, keep(n)])) }),
  };
}

// --- Events ---

/** The team as an event sees it: HP by creature id (0 is knocked out), max HP, and the keepsake ids the run holds. */
export interface EventContext {
  hp: Readonly<Record<string, number>>;
  hpMax: Readonly<Record<string, number>>;
  keepsakes: readonly string[];
}

export interface EventResolution {
  /** The team's HP after the event (a new record). */
  hp: Record<string, number>;
  /** What the event adds to the pack. */
  packDelta: DungeonRunPack;
  /** The experience the event gives, by creature id: every creature standing at the end of the event (empty when it gives none). */
  xp: Record<string, number>;
  /** The keepsake ids the event gave, in order. */
  keepsakesGained: string[];
  /** The result of the option's gamble, or null when it has none. */
  won: boolean | null;
  /** One plain line of what happened, for the map screen. */
  outcome: string;
}

/** `bp` of 10000 as a percentage word: 2500 is "25%", 1250 is "12.5%". */
const percent = (bp: number): string => `${String(bp / 100)}%`;

/** The share of `max` that `bp` is, floored. */
const share = (max: number, bp: number): number => Math.floor((max * bp) / 10_000);

function packLine(e: Extract<PlainEventEffect, { op: 'pack' }>): string {
  const parts: string[] = [];
  if ((e.bait ?? 0) > 0) parts.push(`${String(e.bait)} Bait`);
  if ((e.essence ?? 0) > 0) parts.push(`${String(e.essence)} Essence`);
  if ((e.scrap ?? 0) > 0) parts.push(`${String(e.scrap)} scrap`);
  return `You find ${parts.join(' and ')}.`;
}

/**
 * Plays one option of an event. Effects run in order. `heal` and `hurt` act on standing creatures only
 * (a knocked-out one stays down): heal never goes above a creature's max HP, hurt never takes it below
 * 1. `keepsake` draws one the run does not hold (also not one this event already gave); if none are
 * left it gives nothing. A `gamble` draws once from `rng` (win with `chanceBp` in 10000), then plays
 * its branch. Pure: the context is not changed. `option` is 0 or 1.
 */
export function resolveEvent(
  event: DungeonEventDef,
  option: number,
  ctx: EventContext,
  rng: Rng,
  keepsakePool: readonly KeepsakeDef[] = dungeonKeepsakes,
): EventResolution {
  const chosen = event.options[option];
  if (chosen === undefined)
    throw new RangeError(`event "${event.id}" has no option ${String(option)}`);
  const hp: Record<string, number> = { ...ctx.hp };
  let pack = emptyPack();
  const held = new Set(ctx.keepsakes);
  const gained: string[] = [];
  let won: boolean | null = null;
  /** The experience each standing creature is given (the `xp` effects, added up). */
  let xpEach = 0;
  /** "Lucky!" or "No luck.", when the option has a gamble. */
  let luck = '';
  const lines: string[] = [];

  const apply = (effect: PlainEventEffect): void => {
    switch (effect.op) {
      case 'pack':
        pack = addPack(pack, {
          bait: effect.bait ?? 0,
          essence: effect.essence ?? 0,
          scrap: effect.scrap ?? 0,
        });
        lines.push(packLine(effect));
        break;
      case 'heal':
        for (const [id, now] of Object.entries(hp)) {
          if (now <= 0) continue;
          const max = ctx.hpMax[id] ?? now;
          hp[id] = Math.min(max, now + share(max, effect.bp));
        }
        lines.push(`Every creature heals ${percent(effect.bp)} of its max HP.`);
        break;
      case 'hurt':
        for (const [id, now] of Object.entries(hp)) {
          if (now <= 0) continue;
          const max = ctx.hpMax[id] ?? now;
          hp[id] = Math.max(1, now - share(max, effect.bp));
        }
        lines.push(`Every creature loses ${percent(effect.bp)} of its max HP.`);
        break;
      case 'keepsake': {
        const left = keepsakePool.filter((k) => !held.has(k.id));
        const pick = left[int(rng, left.length || 1)];
        if (pick === undefined) {
          lines.push('There is nothing more to take here.');
          break;
        }
        held.add(pick.id);
        gained.push(pick.id);
        lines.push(`You gain the ${pick.name}.`);
        break;
      }
      case 'xp':
        xpEach += effect.amount;
        lines.push(`Every creature gains ${String(effect.amount)} experience.`);
        break;
      case 'nothing':
        break; // says nothing: an option with no other line reads "Nothing happens."
    }
  };

  const play = (effect: EventEffect): void => {
    if (effect.op !== 'gamble') {
      apply(effect);
      return;
    }
    won = chance(rng, effect.chanceBp, 10_000);
    luck = won ? 'Lucky!' : 'No luck.';
    for (const e of won ? effect.win : effect.lose) apply(e);
  };
  for (const effect of chosen.effects) play(effect);

  const outcome = [luck, ...(lines.length === 0 ? ['Nothing happens.'] : lines)]
    .filter((l) => l !== '')
    .join(' ');
  const xp: Record<string, number> = {};
  if (xpEach > 0) {
    for (const [id, now] of Object.entries(hp)) if (now > 0) xp[id] = xpEach;
  }
  return { hp, packDelta: pack, xp, keepsakesGained: gained, won, outcome };
}

// --- The camp ---

/**
 * The keepsakes a camp offers: `count` different ones (`RULES.dungeon.camp.offers`) the run does not
 * hold, drawn from `rng` (the worker's live source, stored so a reload does not reroll). Fewer if
 * fewer are left, none if the run holds them all.
 */
export function campOffers(
  rng: Rng,
  held: readonly string[],
  pool: readonly KeepsakeDef[] = dungeonKeepsakes,
  count: number = RULES.dungeon.camp.offers,
): string[] {
  const left = pool.filter((k) => !held.includes(k.id)).map((k) => k.id);
  for (let i = left.length - 1; i > 0; i--) {
    const j = int(rng, i + 1);
    [left[i], left[j]] = [left[j] as string, left[i] as string];
  }
  return left.slice(0, count);
}

function recover(
  hp: Readonly<Record<string, number>>,
  hpMax: Readonly<Record<string, number>>,
  bp: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, now] of Object.entries(hp)) {
    const max = hpMax[id] ?? now;
    out[id] = now <= 0 ? now : Math.min(max, now + share(max, bp));
  }
  return out;
}

/** The team's HP after a camp Rest: standing creatures recover `RULES.dungeon.camp.restBp` of max HP, never above max. A new record. */
export function campRest(
  hp: Readonly<Record<string, number>>,
  hpMax: Readonly<Record<string, number>>,
): Record<string, number> {
  return recover(hp, hpMax, RULES.dungeon.camp.restBp);
}

/**
 * The team's HP after the way down into the Undercroft: standing creatures recover `catchBreathBp` of max
 * HP, never above max, and a knocked-out one gets back up at `reviveBp` of its max HP (at least 1 HP). A
 * new record.
 */
export function catchBreath(
  hp: Readonly<Record<string, number>>,
  hpMax: Readonly<Record<string, number>>,
): Record<string, number> {
  const u = RULES.dungeon.undercroft;
  const out = recover(hp, hpMax, u.catchBreathBp);
  for (const [id, now] of Object.entries(hp)) {
    if (now > 0) continue;
    const max = hpMax[id] ?? 0;
    out[id] = Math.min(Math.max(1, max), Math.max(1, share(max, u.reviveBp)));
  }
  return out;
}

// --- Experience ---

/**
 * What a room of this kind pays the creatures that stood in the row for it (`addRoomExperience`), once
 * it is cleared: a fight, an elite, an epic fight, the floor boss (a keeper on an Undercroft level) or a
 * cache. Null for a room that pays nothing by its kind (a camp, a door; a mystery room pays by its event).
 */
export function roomXpSource(kind: NodeKind, level: number): DungeonXpSource | null {
  switch (kind) {
    case 'fight':
    case 'elite':
    case 'epic':
    case 'cache':
      return kind;
    case 'boss':
      return level > 0 ? 'keeper' : 'boss';
    default:
      return null;
  }
}

// --- What the client sees of the map ---

export interface DungeonMapNode {
  id: string;
  floor: number;
  lane: number;
  kind: NodeKind;
  next: string[];
  foe?: {
    id: string;
    name: string;
    element: Element;
    kind: 'foe' | 'boss';
    /** The foe's HP at the viewer's depth, with an elite's boost; a room modifier's change to it is not in this number. */
    hpMax: number;
    elite: boolean;
  };
  modifier?: { id: string; name: string; description: string };
  /** Only the name: the scene and the options appear once the player is in the room. */
  event?: { id: string; name: string };
}

export interface DungeonMapView {
  floors: number;
  nodes: DungeonMapNode[];
  /** An Undercroft level only (absent on the main map): its level, from 1. */
  level?: number;
  /** An Undercroft level only: the band's label ("Undercroft 1"). */
  label?: string;
  /** An Undercroft level only: its floor boss stands on a cracked floor, so beating it opens another floor below. */
  crack?: boolean;
}

/** The label of an Undercroft floor's map: "Undercroft 1", "Undercroft 2". */
export function undercroftLabel(level: number): string {
  return `Undercroft ${String(Math.max(1, level))}`;
}

/** What a carved door is called on the map of a player the Undercroft is not open to. It is not an event: stepping in does nothing. */
export const QUIET_ROOM = { id: 'quiet-room', name: 'Quiet room' } as const;

/**
 * The map as a player at `depth` sees it: each fight's foe with its HP at that depth (an elite's or an
 * epic fight's boost included), the elite flag, the modifier, and a mystery room's name only. At a
 * landmark depth the boss node shows the landmark boss. The map is shown before the run starts, which is
 * safe: it decides what is where, never a fight's dice.
 *
 * An Undercroft map (`map.level`) is shown at `undercroftDepth(depth, level)`, labelled, with its crack.
 * The main map's carved door is shown only to a player whose depth opens the Undercroft; below it the
 * door is a mystery room named "Quiet room" that plays as nothing at all.
 */
export function mapView(map: DungeonMap, depth: number): DungeonMapView {
  const level = map.level ?? 0;
  const open = depth >= RULES.dungeon.undercroft.fromDepth;
  const nodes = map.nodes.map((node): DungeonMapNode => {
    const view: DungeonMapNode = {
      id: node.id,
      floor: node.floor,
      lane: node.lane,
      kind: node.kind === 'door' && !open ? 'mystery' : node.kind,
      next: [...node.next],
    };
    const foe = nodeFoe(node, depth, level);
    if (foe !== undefined) {
      const boost = roomBoost(node.kind);
      const hp = scaledFoe(foe, undercroftDepth(depth, level)).hp;
      view.foe = {
        id: foe.id,
        name: foe.name,
        element: foe.element,
        kind: foe.kind,
        hpMax: boost === null ? hp : boosted(hp, boost.hpBp),
        elite: boost !== null,
      };
    }
    const modifier = node.modifierId === undefined ? undefined : roomModifier(node.modifierId);
    if (modifier !== undefined) {
      view.modifier = { id: modifier.id, name: modifier.name, description: modifier.description };
    }
    const event = node.eventId === undefined ? undefined : dungeonEvent(node.eventId);
    if (event !== undefined) view.event = { id: event.id, name: event.name };
    // A carved door below the Undercroft's depth: a mystery room that is only a quiet room.
    if (node.kind === 'door' && !open) view.event = { id: QUIET_ROOM.id, name: QUIET_ROOM.name };
    return view;
  });
  return {
    floors: map.floors,
    nodes,
    ...(level > 0
      ? { level, label: undercroftLabel(level), ...(map.crack === true ? { crack: true } : {}) }
      : {}),
  };
}

/** The name of a foe in its room: an elite is "Fierce <name>". */
export function foeDisplayName(foe: Pick<DungeonFoeDef, 'name'>, elite: boolean): string {
  return elite ? `Fierce ${foe.name}` : foe.name;
}

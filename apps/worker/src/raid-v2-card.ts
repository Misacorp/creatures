/**
 * What the raid screen's boss card, track strip and move highlights read of a combat v2 week, worked out here so the client loads no
 * content pack and does no fight maths (docs/design/combat/proposals/001-combat-v2.md, "On the board"): the boss's armour, rule cards
 * (a name and the question each asks, never what answers it) and Escalating meter, its plain attack and its moves with their library
 * labels ("Nemesis Lance" under "Deepwater Spear"), and the five bosses of a lap. No boss is marked harder than another and no text says
 * so (R24.8). Pure functions of the boss, the carry and the slot.
 */
import { combatV2, moveLabel, type MoveDef } from '@creatures/game/combat-v2';
import {
  previewMoves,
  startCarry,
  type BossDef,
  type MovePreview,
  type StageCarry,
  type StageInputV2,
} from '@creatures/engine/v2';
import { SHIPPED_V2, V2_WORLD } from './raid-v2-core';

/** One move of the boss as its tile shows it. */
export interface BossMoveView {
  id: string;
  /** The themed name ("Deepwater Spear"). */
  name: string;
  /** The plain label of its behaviour ("Nemesis Lance"). */
  label: string;
  /** The behaviour's shape word, for its icon: the library's shape, `silences` and `oneShot` pick the picture. */
  shape: MoveDef['shape'];
  silences: boolean;
  oneShot: boolean;
  /** Due every this many rounds. */
  every: number;
  /** The boss turn it lands on (0 is after row 1). */
  turn: number;
  /** A Wind-up move: announced at round start, lands on the slots shown. */
  windUp: boolean;
  /** Added by the boss's change of pattern, once it begins. */
  later: boolean;
}

/** The boss card of a v2 week. */
export interface BossCardV2View {
  armour: number;
  /** The boss's rule cards, in the order it has them (the plain baseline is not one), and the strength they all share (bp of the full card). */
  cards: { id: string; name: string; asks: string }[];
  strengthBp: number;
  /** The Escalating meter: its name, how many steps it has and how many it has taken this weekend; null for a boss that does not escalate. */
  escalation: { name: string; cap: number; step: number } | null;
  /** The plain attack: its label and how many hits a turn. */
  plain: { label: string; shape: MoveDef['shape']; hits: number };
  moves: BossMoveView[];
}

/** The bosses of a lap in track order, and where the week's boss stands among them (from 0). */
export interface TrackView {
  order: { id: string; name: string }[];
  index: number;
}

const libraryMove = (id: string): MoveDef | undefined =>
  Object.hasOwn(combatV2.moves, id) ? combatV2.moves[id] : undefined;

/** The card of a boss at the escalation step the carry holds. */
export function bossCardView(boss: BossDef, carry: StageCarry | null): BossCardV2View {
  const last = boss.rows - 1;
  const own = new Set(boss.moves.map((m) => m.id));
  const view = (m: BossDef['moves'][number], later: boolean): BossMoveView => {
    const def = libraryMove(m.id);
    const shape = def?.shape ?? m.pattern.shape;
    const silences = def?.silences ?? m.silenceTurns !== undefined;
    const oneShot = def?.oneShot === true || m.oneShotBp !== undefined;
    return {
      id: m.id,
      name: m.name,
      label: moveLabel({
        shape,
        anchor: def?.anchor ?? m.pattern.anchor,
        silences,
        oneShot,
      }),
      shape,
      silences,
      oneShot,
      every: m.every,
      turn: Math.min(m.turn ?? last, last),
      windUp: m.charged === true,
      later,
    };
  };
  const phase = boss.escalation?.phase?.moves ?? [];
  const cards = boss.cards.flatMap((id) => {
    const card = Object.hasOwn(combatV2.cards, id) ? combatV2.cards[id] : undefined;
    return card === undefined || card.id === 'plain'
      ? []
      : [{ id: card.id, name: card.name, asks: card.asks }];
  });
  const plain = boss.plain.pattern;
  return {
    armour: boss.armour,
    cards,
    strengthBp: boss.strengthBp ?? 10_000,
    escalation:
      boss.escalation === undefined
        ? null
        : {
            name: boss.escalation.name,
            cap: boss.escalation.cap,
            step: Math.min(carry?.escalation?.step ?? 0, boss.escalation.cap),
          },
    plain: {
      label: moveLabel({ shape: plain.shape, anchor: plain.anchor, silences: false }),
      shape: plain.shape,
      hits: boss.plain.hits ?? 1,
    },
    // A phase move with the id of an own move replaces it (the tile stays); the others come after.
    moves: [
      ...boss.moves.map((m) => view(m, false)),
      ...phase.filter((m) => !own.has(m.id)).map((m) => view(m, true)),
    ],
  };
}

/** The lap the week's slot is in: the bosses by their order and the one this slot fights. */
export function trackView(slot: number): TrackView {
  const order = combatV2.raidTrack.order;
  return {
    order: order.map((id) => ({
      id,
      name: SHIPPED_V2.bosses.find((b) => b.id === id)?.name ?? id,
    })),
    index: (Math.max(1, slot) - 1) % order.length,
  };
}

/** The slots the plain attack and each move would hit now (`moves`: null for a move aimed when it is announced). */
export interface MovePreviewView {
  /** The slot the plain attack is aimed at, or null. */
  plain: number | null;
  moves: Record<string, number[] | null>;
}

/**
 * The preview of the party's board as it stands: the engine's own targeting over the creatures standing (`fighters`, built as a stage
 * builds them) at the HP and escalation the carry holds. `slotOf` names the board slot of each creature by its key. Null when nobody
 * stands on the board.
 */
export function movePreviewView(
  boss: BossDef,
  fighters: StageInputV2['fighters'],
  carry: StageCarry | null,
  slotOf: ReadonlyMap<string, number>,
): MovePreviewView | null {
  if (fighters.length === 0) return null;
  const preview: MovePreview = previewMoves(
    { ...V2_WORLD, boss, fighters, options: {} },
    carry ?? startCarry(boss),
  );
  const slots = (keys: readonly string[]): number[] =>
    keys.flatMap((k) => {
      const slot = slotOf.get(k);
      return slot === undefined ? [] : [slot];
    });
  const plainSlot = preview.plain === null ? undefined : slotOf.get(preview.plain);
  return {
    plain: plainSlot ?? null,
    moves: Object.fromEntries(
      Object.entries(preview.moves).map(([id, keys]) => [id, keys === null ? null : slots(keys)]),
    ),
  };
}

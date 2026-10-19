/**
 * The sample creatures, bags and states of the creature page v3 scenes (workbench only). Built from the
 * creature card's own samples (`creature-card-sample.ts`, real server output) with levels, gear, talents
 * and the bag changed one thing at a time. Fixture data only.
 */
import type { Creature, GameState } from '../api';
import { SAMPLE_GEAR, SAMPLE_STATE, sampleCreature, talentView } from '../creature-card-sample';
import type { GearState } from '../gear-types';
import type { CreatureTalents, TalentSlotView } from '../talent-types';
import { OTHER_WEARER, allBagItems, wornFromBag, type WornRows } from './bag-sample';

/** The creature of every v3 scene. */
export const PAGE_SAMPLE_ID = 'v3-cindle';

/** A creature that wears an item in the bag (the picker says "On Pebble" for it). */
const OTHER: Creature = {
  ...sampleCreature('growing'),
  id: OTHER_WEARER,
  nickname: 'Pebble',
  gear: [],
};

/** The shapes of a creature the scenes use. */
export type SceneKind =
  | 'level 2'
  | 'level 8'
  | 'level 15'
  | 'rarities'
  | 'long name'
  | 'talents: golden and locked'
  | 'talents: filled and empty'
  | 'talents: three slots'
  | 'talents: epic'
  | 'ribbon ready'
  | 'ribbon waiting'
  | 'nickname'
  | 'evolve ready'
  | 'set: two pieces'
  | 'set: three pieces'
  | 'set: two pieces and a charm'
  | 'compare: plain gear';

export const SCENE_KINDS: readonly SceneKind[] = [
  'level 2',
  'level 8',
  'level 15',
  'rarities',
  'long name',
  'talents: golden and locked',
  'talents: filled and empty',
  'talents: three slots',
  'talents: epic',
  'ribbon ready',
  'ribbon waiting',
  'nickname',
  'evolve ready',
  'set: two pieces',
  'set: three pieces',
  'set: two pieces and a charm',
  'compare: plain gear',
];

export function sceneKindOf(value: string): SceneKind {
  return SCENE_KINDS.find((k) => k === value) ?? 'level 15';
}

function slotsOf(...parts: readonly Omit<TalentSlotView, 'slot'>[]): TalentSlotView[] {
  return parts.map((part, index) => ({ ...part, slot: index + 1 }));
}

function talentsOf(slots: TalentSlotView[], signature = false): CreatureTalents {
  const inSlots = slots.flatMap((s) => (s.talent === null ? [] : [{ ...s.talent, slot: s.slot }]));
  return {
    signature: signature ? talentView('lights-up-a-room', false) : null,
    slots,
    book: [
      ...inSlots,
      { ...talentView('warm-to-the-touch', false), slot: null },
      { ...talentView('proud-ember', true), slot: null },
      { ...talentView('chases-flickers', false), slot: null },
      { ...talentView('purrs-like-a-campfire', false), slot: null },
    ],
  };
}

const GOLDEN = talentView('quick-to-pounce', true);
const PLAIN = talentView('waits-for-the-moment', false);

interface Shape {
  level: number;
  worn: WornRows;
  talents: CreatureTalents;
  nickname?: string;
  exp: number;
  expNeeded: number | null;
}

function shapeOf(kind: SceneKind): Shape {
  const twoSlots = (first: TalentSlotView['talent'], opens: boolean) =>
    slotsOf({ opensAt: 1, open: true, talent: first }, { opensAt: 20, open: opens, talent: null });
  switch (kind) {
    case 'level 2':
      return {
        level: 2,
        worn: { hat: 13 },
        talents: talentsOf(twoSlots(GOLDEN, false)),
        exp: 40,
        expNeeded: 90,
      };
    case 'level 8':
      return {
        level: 8,
        worn: {},
        talents: talentsOf(twoSlots(null, false)),
        exp: 120,
        expNeeded: 260,
      };
    case 'long name':
      return {
        level: 12,
        worn: { hat: 4, scarf: 0 },
        talents: talentsOf(twoSlots(GOLDEN, false)),
        nickname: 'Sir Fluffington of Emberhollow the Third',
        exp: 90,
        expNeeded: 400,
      };
    case 'talents: golden and locked':
      return {
        level: 12,
        worn: { hat: 4, scarf: 0 },
        talents: talentsOf(twoSlots(GOLDEN, false)),
        exp: 90,
        expNeeded: 400,
      };
    case 'talents: filled and empty':
      return {
        level: 20,
        worn: { hat: 0, scarf: 0, charm: 0 },
        talents: talentsOf(twoSlots(PLAIN, true)),
        exp: 100,
        expNeeded: 1000,
      };
    case 'talents: three slots':
      return {
        level: 20,
        worn: { hat: 0, scarf: 0, charm: 0 },
        talents: talentsOf(
          slotsOf(
            { opensAt: 1, open: true, talent: GOLDEN },
            { opensAt: 20, open: true, talent: null },
            { opensAt: 25, open: false, talent: null },
          ),
        ),
        exp: 100,
        expNeeded: 1000,
      };
    case 'talents: epic':
      return {
        level: 20,
        worn: { hat: 0, scarf: 0, charm: 0 },
        talents: talentsOf(
          slotsOf(
            { opensAt: 1, open: true, talent: GOLDEN },
            { opensAt: 20, open: true, talent: PLAIN },
            { opensAt: 25, open: false, talent: null },
          ),
          true,
        ),
        exp: 100,
        expNeeded: 1000,
      };
    case 'ribbon ready':
    case 'ribbon waiting':
      return {
        level: 10,
        worn: { hat: 7, scarf: 5 },
        talents: talentsOf(twoSlots(GOLDEN, false)),
        exp: 450,
        expNeeded: 450,
      };
    case 'evolve ready':
      return {
        level: 15,
        worn: { hat: 0, scarf: 0 },
        talents: talentsOf(twoSlots(PLAIN, false)),
        exp: 825,
        expNeeded: 825,
      };
    case 'set: two pieces':
      // The Forge-Warm Bonnet and Sash (the last row of the Hat and Scarf tables): two of the Kit's three.
      return {
        level: 20,
        worn: { hat: 19, scarf: 16 },
        talents: talentsOf(twoSlots(GOLDEN, true)),
        exp: 100,
        expNeeded: 1000,
      };
    case 'set: two pieces and a charm':
      // Two pieces of the Forge-Warm Kit and a Crossroads Compass in the Charm slot: the Kit's Charm would complete it.
      return {
        level: 20,
        worn: { hat: 19, scarf: 16, charm: 0 },
        talents: talentsOf(twoSlots(GOLDEN, true)),
        exp: 100,
        expNeeded: 1000,
      };
    case 'set: three pieces':
      return {
        level: 20,
        worn: { hat: 19, scarf: 16, charm: 13 },
        talents: talentsOf(twoSlots(GOLDEN, true)),
        exp: 100,
        expNeeded: 1000,
      };
    case 'compare: plain gear':
      // A plain Kelp Cap and Patch Scarf and no Charm: anything in the bag is a better item or an empty slot.
      return {
        level: 15,
        worn: { hat: 13, scarf: 11 },
        talents: talentsOf(twoSlots(GOLDEN, false)),
        exp: 310,
        expNeeded: 825,
      };
    case 'rarities':
      // A common Hat, a rare Scarf and an epic Charm: one of each, side by side.
      return {
        level: 20,
        worn: { hat: 13, scarf: 0, charm: 11 },
        talents: talentsOf(twoSlots(GOLDEN, true)),
        exp: 100,
        expNeeded: 1000,
      };
    case 'nickname':
      return {
        level: 15,
        worn: { hat: 0, scarf: 0 },
        talents: talentsOf(twoSlots(GOLDEN, false)),
        nickname: 'Sparky',
        exp: 310,
        expNeeded: 825,
      };
    case 'level 15':
      return {
        level: 15,
        worn: { hat: 0, scarf: 0 },
        talents: talentsOf(twoSlots(GOLDEN, false)),
        exp: 310,
        expNeeded: 825,
      };
  }
}

export interface PageScene {
  creature: Creature;
  state: GameState;
  gear: GearState;
}

/** One creature with its bag, the state around it and the gear view the picker reads. */
export function pageScene(kind: SceneKind, options: { bait?: number } = {}): PageScene {
  const shape = shapeOf(kind);
  const items = allBagItems(PAGE_SAMPLE_ID, shape.worn);
  const base = sampleCreature(
    kind === 'ribbon ready'
      ? 'ribbon ready'
      : kind === 'ribbon waiting'
        ? 'ribbon short'
        : kind === 'evolve ready'
          ? 'evolve ready'
          : 'growing',
  );
  const creature: Creature = {
    ...base,
    id: PAGE_SAMPLE_ID,
    level: shape.level,
    exp: shape.exp,
    expNeeded: shape.expNeeded,
    nickname: shape.nickname ?? null,
    gear: wornFromBag(items, PAGE_SAMPLE_ID),
    talents: shape.talents,
    ribbon: kind === 'ribbon ready' || kind === 'ribbon waiting' ? base.ribbon : null,
    waiting: kind === 'ribbon ready' || kind === 'ribbon waiting' || kind === 'evolve ready',
    nextUnlock: null,
    explorer: { rank: 3, xp: 120, nextRankXp: 400, trips: 7 },
    ability:
      base.ability === null
        ? null
        : {
            ...base.ability,
            unlocked: shape.level >= base.ability.unlockLevel,
          },
  };
  const state: GameState = {
    ...SAMPLE_STATE,
    creatures: [creature, OTHER],
    pending: [],
    loungerId: null,
    balances: { ...SAMPLE_STATE.balances, bait: options.bait ?? 100 },
  };
  const gear: GearState = { ...SAMPLE_GEAR, items };
  return { creature, state, gear };
}

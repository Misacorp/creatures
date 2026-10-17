/**
 * The shapes the server sends for gear, the workshop and expedition loot (`apps/worker/src/gear.ts`,
 * `gear-grants.ts`). Types only, with no parsing: the fixtures `gear-*.json`, `workshop-*.json` and
 * `expedition-claim-loot.json` in `fixtures/` are real server output and the Worker's
 * `gear-fixtures.test.ts` fails when the server stops sending these shapes.
 *
 * Every number in the text of a line is the server's own (`lines[].text`); nothing is worked out here.
 */
import type { GearSlot, GearTag, ReachId } from '@creatures/game';
import type { ExperienceView } from './experience';

export type { GearSlot, GearTag, ReachId };

/** Festival is not a rarity: a Festival piece is a base (`GearItem.festival`) of a normal rarity. */
export type GearRarity = 'common' | 'rare' | 'epic';
/** The kinds of base stat: Attack and HP, and the crit stats (in basis points). */
export type StatKind = 'atk' | 'hp' | 'critChance' | 'critDamage';
export type PartKind =
  'scrap' | 'tide-shard' | 'ember-shard' | 'grove-shard' | 'spark-shard' | 'glimmer';
/** Parts by kind; a kind that is absent is 0. */
export type PartsBundle = Partial<Record<PartKind, number>>;
/** The jobs a player can start. Improve and Enchant are gone; jobs started before gear v2 still finish. */
export type JobKind = 'craft' | 'supply' | 'dismantle';

/** An inclusive range of whole numbers. */
export interface Range {
  min: number;
  max: number;
}

/** What dismantling can return, as the server works it out (the same for every creature). */
export interface DismantleRange {
  scrap: Range;
  /** `element` is the kind of the shards, null for a random kind (or no shards). */
  shards: Range & { element: string | null };
  glimmer: Range;
  essence: Range;
}

/** What is kept of an item that went into a dismantle job. */
export interface ItemSnapshot {
  baseId: string;
  rarity: GearRarity;
  itemLevel: number;
}

/** One line of an item as a card shows it. */
export interface GearLine {
  id: string;
  name: string;
  /** "Attack +6%", "Area ward -9%", "Unbothered": the line and its number in words. */
  text: string;
  /** One sentence on what the line does. */
  about: string;
  /** `base` is the line every item of the base has, `fixed` one a base always has, `rolled` one of the item's own. */
  source: 'base' | 'fixed' | 'rolled';
  /** Tier I to V as 1 to 5; null where tiers do not apply. */
  tier: number | null;
  /** The best tier this item level could roll (1 to 5); null where tiers do not apply. */
  bestTier: number | null;
  /** A line of this item only ("+60% Attack (this item)"): it changes the item's own stat, not the creature. */
  local: boolean;
  /** False when the line does nothing for the wearer; null when nobody wears the item. */
  active: boolean | null;
}

/** One of an item's own stats: the number it adds (its local lines counted), and the base type's number. */
export interface GearStat {
  stat: StatKind;
  value: number;
  base: number;
  /** "Attack 35", "Crit chance 4.4 pt". */
  text: string;
}

/** Where an item came from, for its details row. Content ids and numbers only. */
export type ItemOrigin =
  | { kind: 'raid'; boss: string; rank: number }
  | { kind: 'festival'; boss: string; rank: number }
  | { kind: 'dungeon'; depth: number }
  | { kind: 'trip'; place: string; rank: number }
  | { kind: 'craft' }
  | { kind: 'welcome' }
  | { kind: 'converted' };

export interface GearItem {
  id: string;
  baseId: string;
  slot: GearSlot;
  tag: GearTag;
  rarity: GearRarity;
  /** A Festival piece: a unique line, a narrow roll pool and a look of its own (not a rarity). */
  festival: boolean;
  itemLevel: number;
  /** Its own stats, the big numbers on the card (empty for a Charm). */
  stats: GearStat[];
  lines: GearLine[];
  /** What a creature needs to wear it: its level, and the role of a role-locked Charm (null: any role). */
  needs: { level: number; role: string | null };
  /** The creature wearing it, or null. */
  equippedOn: string | null;
  /** What dismantling it can return, as a range. */
  dismantle: DismantleRange;
  source: string;
  createdAt: number;
  /** The creature that made it and when; null for items that were not crafted. */
  madeBy: { name: string; at: number } | null;
  origin: ItemOrigin | null;
}

export interface JobCommon {
  /** Creature experience the job paid its worker (doubled by a treat); absent in older results and for a retired job. */
  experience?: ExperienceView;
  xp: number;
  skillXp: number;
  skillLevel: number;
  leveledUp: boolean;
}

export type JobResult =
  | ({
      kind: 'craft';
      gearId: string;
      baseId: string;
      rarity: GearRarity;
      itemLevel: number;
      /** What the craft was aimed at. */
      reach: ReachId;
      /** The one-step-up chance raised the rarity the Reach drew. */
      upgraded: boolean;
    } & JobCommon)
  /** Items taken apart: what came back, the blueprints learned and the marks added. */
  | ({
      kind: 'dismantle';
      items: ItemSnapshot[];
      parts: PartsBundle;
      essence: number;
      learned: string[];
      marked: { baseId: string; marks: number }[];
    } & JobCommon)
  /** A crafted supply for expeditions: `amount` of `supplyId` went into the stock. */
  | ({ kind: 'supply'; supplyId: string; amount: number } & JobCommon)
  /** An Improve or Enchant job started before gear v2: it paid its XP, and its parts came back. */
  | ({ kind: 'retired'; was: 'improve' | 'enchant'; refund: PartsBundle } & JobCommon);

export interface Job {
  id: string;
  creatureId: string;
  /** `improve` and `enchant` only on jobs started before gear v2. */
  kind: JobKind | 'improve' | 'enchant';
  input: { baseId?: string; supplyId?: string; reach?: ReachId; items?: ItemSnapshot[] };
  /** The parts it cost when it started. */
  cost: PartsBundle;
  /** The Bait it cost when it started (a lure costs Bait; absent on jobs stored before lures did). */
  bait?: number;
  /** A treat was packed for the worker: the job pays double creature experience. */
  treat?: boolean;
  startedAt: number;
  endsAt: number;
  /** `ready` is a finished job that has not been claimed. */
  status: 'running' | 'ready' | 'claimed';
  claimedAt: number | null;
  result: JobResult | null;
}

/** What a grant (a raid phase, a finale, a Festival, an expedition claim, the welcome kit) gave. */
export interface GrantLoot {
  /** Items now in the inventory. `itemLevel` is absent on grants stored before gear v2. */
  gear: { id: string; baseId: string; rarity: GearRarity; itemLevel?: number }[];
  /** Items that did not fit in a full inventory and became parts (already counted in `parts`). */
  converted: { baseId: string; rarity: GearRarity; itemLevel?: number }[];
  parts: PartsBundle;
  /** `marks` is the blueprint's well-thumbed marks after a repeat find added one. */
  blueprints: { baseId: string; duplicate: boolean; marks?: number }[];
  /** Supply ids an expedition found (absent on every other grant and on trips from before supplies). */
  supplies?: string[];
}

/**
 * A stored grant. `key` is `raid:<week>:phase1`, `raid:<week>:phase2`, `raid:<week>:finale`,
 * `festival:<week>`, `expedition:<expedition id>` or `welcome`; the loot reveal of a finale reads
 * `raid:<week>:finale` and `festival:<week>` for the week it shows.
 */
export interface GrantRecord extends GrantLoot {
  key: string;
  source:
    'raid_phase' | 'raid_finale' | 'festival' | 'expedition' | 'welcome' | 'dungeon' | 'rank_gift';
  at: number;
}

/** A worn item the one-time conversion took off its creature, with why. */
export interface UnequippedNote {
  id: string;
  baseId: string;
  slot: GearSlot;
  itemLevel: number;
  reason: 'item_level' | 'slot_locked' | 'role';
  /** The creature level it needs; null for a role. */
  needs: number | null;
}

/** The one-time card about the switch to gear v2, until the player dismisses it. */
export interface ConversionNotice {
  /** Worn items that became new items (including the ones in `unequipped`). */
  converted: number;
  unequipped: UnequippedNote[];
  /** Unworn items that were refunded as parts instead. */
  refundedItems: number;
  /** Everything refunded as parts (items, upgrades, enchants). */
  parts: PartsBundle;
  /** Essence the upgrades cost, returned. */
  essence: number;
  /** Blueprints mapped to the new bases. */
  blueprints: number;
  /** Improve and Enchant jobs that were still running (they finish, and their parts are returned). */
  retiredJobs: number;
}

/** `GET /api/gear` (the first call also gives the welcome kit, once). */
export interface GearState {
  serverNow: number;
  balances: { bait: number; essence: number };
  /** `used` items, plus `reserved` places held by crafts still in the workshop. */
  inventory: { cap: number; used: number; reserved: number };
  items: GearItem[];
  /** The creature level each slot opens at. */
  slotOpens: Record<GearSlot, number>;
  parts: Record<PartKind, number>;
  blueprints: {
    baseId: string;
    learnedAt: number;
    marks: number;
    /** The Crafting level a craft of this base asks for. */
    needsCraftingLevel: number;
  }[];
  /** Open jobs first (soonest end first), then the last few claimed ones. */
  jobs: Job[];
  slots: { total: number; used: number };
  /** The Crafting skill of every creature of the caller. */
  skills: { creatureId: string; xp: number; level: number; nextLevelXp: number | null }[];
  /** Newest first. */
  grants: GrantRecord[];
  notice: ConversionNotice | null;
}

export type EquipResult = { item: GearItem; unequipped: GearItem | null };
export type EquipBestResult = {
  changes: { creatureId: string; slot: GearSlot; itemId: string }[];
  /** Creatures left alone because they are away on a trip or on a Workshop job (their gear is frozen). */
  skipped: { creatureId: string; reason: 'away' | 'job' }[];
};
export type DismissResult = { dismissed: boolean };
export type StartJobResult = { jobId: string };

export type StartJobRequest =
  | {
      kind: 'craft';
      creatureId: string;
      blueprintId: string;
      reach: ReachId;
      /** Pack a treat for the worker (Bait, paid when the job starts): double experience for the job. */
      treat?: boolean | undefined;
      idempotencyKey: string;
    }
  | {
      kind: 'supply';
      creatureId: string;
      supplyId: string;
      treat?: boolean | undefined;
      idempotencyKey: string;
    }
  | {
      kind: 'dismantle';
      creatureId: string;
      itemIds: readonly string[];
      treat?: boolean | undefined;
      idempotencyKey: string;
    };

/** Rarity odds in basis points (they add up to 10,000), as the server works them out. */
export interface CraftOdds {
  common: number;
  rare: number;
  epic: number;
}

/** One way to start a craft: what it takes and gives with this creature. Every number is the server's. */
export interface CraftOption {
  reach: ReachId;
  unlocked: boolean;
  minLevel: number;
  parts: PartsBundle;
  essence: number;
  durationMs: number;
  xp: number;
  oddsBp: CraftOdds;
}

/** `POST /api/workshop/preview` for a craft. */
export interface CraftPreview {
  kind: 'craft';
  blueprintId: string;
  creatureId: string;
  craftingLevel: number;
  itemLevel: number;
  /** The Crafting level this base asks for; `locked` when the creature is below it. */
  needsCraftingLevel: number;
  locked: boolean;
  marks: number;
  marksMax: number;
  stepUpBp: number;
  options: CraftOption[];
}

/** `POST /api/workshop/preview` for a dismantle job. */
export interface DismantlePreview {
  kind: 'dismantle';
  creatureId: string;
  items: { id: string; baseId: string; rarity: GearRarity; itemLevel: number }[];
  range: DismantleRange;
  durationMs: number;
  xp: number;
  /** The chance (basis points) each item that can teach its blueprint does, with this creature; null when none can. */
  learnBp: number | null;
  teachers: number;
}

/** A worn item as a creature card shows it: the slot, the rarity and the item level. */
export interface WornGear {
  id: string;
  baseId: string;
  slot: GearSlot;
  rarity: GearRarity;
  itemLevel: number;
}

/** The gear fields the collection view adds to every creature (`GET /api/state`). */
export interface CreatureGearFields {
  /** The creature's stats with the worn items folded in; equal to `stats` without gear. */
  statsWithGear: { hp: number; atk: number; spd: number };
  /** The items it wears, at most one per slot. */
  gear: WornGear[];
  /** Expedition or job; null when idle. `away` stays true for expeditions only. */
  busy: { kind: 'expedition' | 'job'; id: string } | null;
}

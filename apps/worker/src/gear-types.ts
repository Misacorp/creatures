/**
 * The shapes the gear and workshop routes answer with (items, jobs, results, previews) and the start-job
 * request as the code reads it. Types only; `gear.ts` re-exports them. The client mirrors them by hand in
 * `apps/activity/src/gear-types.ts`, and `test/gear-fixtures.test.ts` checks the captured fixtures.
 */
import type {
  ConversionBundle,
  CraftOdds,
  DismantleRange,
  GearRarity,
  GearSlot,
  GearTag,
  JobKind,
  PartKind,
  PartsBundle,
  ReachId,
  Role,
  XpBoost,
} from '@creatures/game';
import type { ExperienceView } from './creature-exp';
import type { ConversionNotice } from './gear-convert';
import type { GrantRecord } from './gear-grants';
import type { ItemOrigin } from './gear-store';
import type { Currency } from './ledger';

/** One line of an item as a card shows it. The text and the numbers are the server's. */
export interface GearLineView {
  id: string;
  name: string;
  /** "Attack +6%", "Area ward −9%", "Unbothered". */
  text: string;
  about: string;
  source: 'base' | 'fixed' | 'rolled';
  /** Tier I to V as 1 to 5; null for a base line and lines without tiers. */
  tier: number | null;
  /** The best tier this item level could roll (1 to 5); null where tiers do not apply. */
  bestTier: number | null;
  /** A line of this item only ("(this item)"): it changes the item's own stat, not the creature. */
  local: boolean;
  /** False when the line does nothing for the wearer; null when nobody wears the item. */
  active: boolean | null;
}

/**
 * One of the item's own stats for the card (a Hat: Attack, HP, maybe a crit stat; a Scarf: HP, Attack, ...).
 * `value` is what it adds to its wearer, `(base + flat local lines) x (1 + percent local lines)`; `base`
 * is the base type's fixed number, so the card can say "base 5" under a bigger number. Crit stats are in
 * basis points; `text` is the line as written ("Attack 35", "Crit chance 4.4 pt").
 */
export interface GearStatView {
  stat: 'atk' | 'hp' | 'critChance' | 'critDamage';
  value: number;
  base: number;
  text: string;
}

export interface GearItemView {
  id: string;
  baseId: string;
  slot: GearSlot;
  tag: GearTag;
  rarity: GearRarity;
  /** A Festival piece (a base with a unique line, a narrow roll pool and a look of its own, not a rarity). */
  festival: boolean;
  itemLevel: number;
  /** Its own stats in card order (empty for a Charm). */
  stats: GearStatView[];
  lines: GearLineView[];
  /** What a creature needs to wear it: its level (the slot's opening level or the item's, the higher) and the role of a role-locked Charm. */
  needs: { level: number; role: Role | null };
  equippedOn: string | null;
  /** What dismantling it can return, as a range (rolled when the job is claimed). */
  dismantle: DismantleRange;
  source: string;
  createdAt: number;
  /** The creature that made it and when; null for items that were not crafted. */
  madeBy: { name: string; at: number } | null;
  origin: ItemOrigin | null;
}

/** What "Equip best" did: the slots it changed, and the creatures it left alone because they are busy. */
export interface EquipBestResult {
  changes: { creatureId: string; slot: GearSlot; itemId: string }[];
  skipped: { creatureId: string; reason: 'away' | 'job' }[];
}

export interface JobCommon {
  /**
   * Creature experience the job paid its worker (4 an hour of nominal work, doubled by a treat) and what it
   * did to the level. Absent in results stored before training by activity, and for a retired job.
   */
  experience?: ExperienceView;
  /** XP this job gave to the creature's Crafting skill. */
  xp: number;
  /** What added to the Crafting XP (Apprentice) and the total; absent when nothing did (and on older results). */
  xpBoost?: XpBoost;
  /** Total Crafting XP and level after it. */
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
  | ({
      /** Items taken apart: what came back, the blueprints learned and the marks added. */
      kind: 'dismantle';
      items: ItemSnapshot[];
      parts: PartsBundle;
      essence: number;
      learned: string[];
      marked: { baseId: string; marks: number }[];
      /** How many items Tinker's luck refunded in full (absent when none). */
      tinkered?: number;
    } & JobCommon)
  | ({
      /** A crafted supply for expeditions: `amount` of `supplyId` went into the stock. */
      kind: 'supply';
      supplyId: string;
      amount: number;
    } & JobCommon)
  | ({
      /** A refine or recycle: what the recipe took and what went into the stock (supplies by id, parts by kind). */
      kind: 'convert';
      recipeId: string;
      took: ConversionBundle;
      gave: ConversionBundle;
    } & JobCommon)
  | ({
      /** An Improve or Enchant job started before gear v2: it paid its XP, and its parts came back. */
      kind: 'retired';
      was: 'improve' | 'enchant';
      refund: PartsBundle;
    } & JobCommon);

/** What is kept of an item that goes into a dismantle job (the item itself is gone). */
export interface ItemSnapshot {
  baseId: string;
  rarity: GearRarity;
  itemLevel: number;
}

export interface JobView {
  id: string;
  creatureId: string;
  kind: JobKind | 'improve' | 'enchant';
  /** What the job works on: the base crafted (and the Reach), the supply, or the items taken apart. */
  input: {
    baseId?: string;
    supplyId?: string;
    recipeId?: string;
    reach?: ReachId;
    items?: ItemSnapshot[];
  };
  /** The parts it cost when it started. */
  cost: PartsBundle;
  /** The Bait it cost when it started (a lure): 0 for every other job. */
  bait: number;
  /** True when a treat was packed for the worker (the job's creature experience is doubled). */
  treat: boolean;
  startedAt: number;
  endsAt: number;
  status: 'running' | 'ready' | 'claimed';
  claimedAt: number | null;
  result: JobResult | null;
}

export interface SkillView {
  creatureId: string;
  xp: number;
  level: number;
  /** Total XP of the next level, or null at the top. */
  nextLevelXp: number | null;
}

export interface GearState {
  serverNow: number;
  balances: Record<Currency, number>;
  inventory: { cap: number; used: number; reserved: number };
  items: GearItemView[];
  /** The creature level each slot opens at. */
  slotOpens: Record<GearSlot, number>;
  parts: Record<PartKind, number>;
  blueprints: {
    baseId: string;
    learnedAt: number;
    marks: number;
    /** The Crafting level a craft of this base asks for (a better base unlocks at a higher item level). */
    needsCraftingLevel: number;
  }[];
  jobs: JobView[];
  slots: { total: number; used: number };
  skills: SkillView[];
  /** Newest loot first: keys are `raid:<week>:<phase>`, `festival:<week>`, `expedition:<id>` and `welcome`. */
  grants: GrantRecord[];
  /** The one-time card about the conversion to gear v2, until the player dismisses it. */
  notice: ConversionNotice | null;
}

export type StartJobInput =
  | {
      kind: 'craft';
      creatureId: string;
      blueprintId: string;
      reach?: ReachId | undefined;
      /** Pack a treat for the worker (Bait, paid when the job starts): it doubles the job's creature experience. */
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
      itemIds: string[];
      treat?: boolean | undefined;
      idempotencyKey: string;
    }
  | {
      kind: 'convert';
      creatureId: string;
      recipeId: string;
      treat?: boolean | undefined;
      idempotencyKey: string;
    };

/** One way to start a craft, as the screen shows it before the player confirms. All numbers are the server's. */
export interface CraftOption {
  reach: ReachId;
  /** The creature's Crafting level is high enough for it. */
  unlocked: boolean;
  /** The Crafting level it asks for. */
  minLevel: number;
  /** The parts it takes (exact: shards of a base without an element come from the biggest piles). */
  parts: PartsBundle;
  essence: number;
  /** How long it takes this creature, and the nominal hours the XP follows. */
  durationMs: number;
  xp: number;
  /** The exact chances of each rarity, in basis points; they add up to 10,000. */
  oddsBp: CraftOdds;
}

export interface CraftPreview {
  kind: 'craft';
  blueprintId: string;
  creatureId: string;
  craftingLevel: number;
  /** The item level of the result: twice the Crafting level. */
  itemLevel: number;
  /** The Crafting level this base asks for (a better base unlocks at a higher item level); `locked` when the creature is below it. */
  needsCraftingLevel: number;
  locked: boolean;
  marks: number;
  marksMax: number;
  /** The one-step-up chance, in basis points, already counted in the odds. */
  stepUpBp: number;
  options: CraftOption[];
}

export interface DismantlePreview {
  kind: 'dismantle';
  creatureId: string;
  items: { id: string; baseId: string; rarity: GearRarity; itemLevel: number }[];
  /** The refund as a range, the same for any creature. */
  range: DismantleRange;
  durationMs: number;
  xp: number;
  /** The chance (basis points) each item that can teach a blueprint does, with this creature; null when none can. */
  learnBp: number | null;
  /** How many of the items can teach a blueprint (or add a mark). */
  teachers: number;
}

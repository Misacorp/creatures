/**
 * The shapes the server sends for gear, the workshop and expedition loot (`apps/worker/src/gear.ts`,
 * `gear-grants.ts`). Types only, with no parsing: the fixtures `gear-*.json`, `workshop-*.json` and
 * `expedition-claim-loot.json` in `fixtures/` are real server output and the Worker's
 * `gear-fixtures.test.ts` fails when the server stops sending these shapes.
 *
 * Amounts of `atk`, `hp` and `spd` are basis points (400 is +4%); the crit stats are basis points of
 * crit points (100 is +1 point). Everything is an integer.
 */

export type GearRarity = 'common' | 'rare' | 'epic' | 'festival';
export type GearStat = 'atk' | 'hp' | 'spd' | 'critChance' | 'critDamage';
export type PartKind =
  'scrap' | 'tide-shard' | 'ember-shard' | 'grove-shard' | 'spark-shard' | 'glimmer';
/** Parts by kind; a kind that is absent is 0. */
export type PartsBundle = Partial<Record<PartKind, number>>;
export type JobKind = 'craft' | 'improve' | 'enchant';

export interface GearItem {
  id: string;
  baseId: string;
  rarity: GearRarity;
  level: number;
  maxLevel: number;
  /** The main stat now: its roll plus the upgrade steps. */
  primary: { stat: GearStat; bp: number };
  secondaries: { stat: GearStat; bp: number }[];
  enchantId: string | null;
  /** Whether the enchant works for the wearer; null when nobody wears the item or it has no enchant. */
  enchantActive: boolean | null;
  /** The creature wearing it, or null. */
  equippedOn: string | null;
  /** The open workshop job this item is in (improve or enchant), or null. */
  jobId: string | null;
  /** The next upgrade's price, or null at +5. */
  upgradeCost: { essence: number; scrap: number } | null;
  /** What dismantling it would return now. */
  dismantle: PartsBundle;
  source: string;
  createdAt: number;
}

export interface JobCommon {
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
      upgraded: boolean;
    } & JobCommon)
  | ({
      kind: 'improve';
      gearId: string;
      baseId: string;
      secondaryIndex: number;
      from: { stat: GearStat; bp: number };
      to: { stat: GearStat; bp: number };
    } & JobCommon)
  | ({ kind: 'enchant'; gearId: string; baseId: string; enchantId: string } & JobCommon);

export interface Job {
  id: string;
  creatureId: string;
  kind: JobKind;
  input: { baseId?: string; gearId?: string; enchantId?: string; secondaryIndex?: number };
  /** The parts it cost when it started. */
  cost: PartsBundle;
  startedAt: number;
  endsAt: number;
  /** `ready` is a finished job that has not been claimed. */
  status: 'running' | 'ready' | 'claimed';
  claimedAt: number | null;
  result: JobResult | null;
}

/** What a grant (a raid phase, a finale, a Festival, an expedition claim, the welcome kit) gave. */
export interface GrantLoot {
  /** Items now in the inventory. */
  gear: { id: string; baseId: string; rarity: GearRarity }[];
  /** Items that did not fit in a full inventory and became parts (already counted in `parts`). */
  converted: { baseId: string; rarity: GearRarity }[];
  parts: PartsBundle;
  blueprints: { baseId: string; rarity: GearRarity; duplicate: boolean }[];
}

/**
 * A stored grant. `key` is `raid:<week>:phase1`, `raid:<week>:phase2`, `raid:<week>:finale`,
 * `festival:<week>`, `expedition:<expedition id>` or `welcome`; the loot reveal of a finale reads
 * `raid:<week>:finale` and `festival:<week>` for the week it shows.
 */
export interface GrantRecord extends GrantLoot {
  key: string;
  source: 'raid_phase' | 'raid_finale' | 'festival' | 'expedition' | 'welcome' | 'dungeon';
  at: number;
}

/** `GET /api/gear` (the first call also gives the welcome kit, once). */
export interface GearState {
  serverNow: number;
  balances: { bait: number; essence: number };
  /** `used` items, plus `reserved` places held by crafts still in the workshop. */
  inventory: { cap: number; used: number; reserved: number };
  items: GearItem[];
  parts: Record<PartKind, number>;
  blueprints: { baseId: string; rarity: GearRarity; learnedAt: number }[];
  /** Open jobs first (soonest end first), then the last few claimed ones. */
  jobs: Job[];
  slots: { total: number; used: number };
  /** The Crafting skill of every creature of the caller. */
  skills: { creatureId: string; xp: number; level: number; nextLevelXp: number | null }[];
  /** Newest first. */
  grants: GrantRecord[];
}

/** Every gear and workshop action answers `{ result, gear, state }`: the action's own result and both views, fresh. */
export interface GearActionResponse<R> {
  result: R;
  gear: GearState;
  /** The collection (`GET /api/state` without `timezone` and `leetSync`): creature cards carry `gear`, `statsWithGear` and `busy`. */
  state: unknown;
}

export type EquipResult = { item: GearItem; unequipped: GearItem | null };
export type UpgradeResult = { gearId: string; level: number };
export type DismantleResult = {
  gearId: string;
  baseId: string;
  rarity: GearRarity;
  level: number;
  parts: PartsBundle;
  /** The item was worn and has been taken off. */
  unequipped: boolean;
};
export type StartJobResult = { jobId: string };

/** Bodies of the requests (every spend and job action carries a client-generated idempotency key). */
export type EquipRequest = { creatureId: string | null };
export type KeyedRequest = { idempotencyKey: string };
export type StartJobRequest =
  | { kind: 'craft'; creatureId: string; blueprintId: string; idempotencyKey: string }
  | {
      kind: 'improve';
      creatureId: string;
      gearId: string;
      secondaryIndex: number;
      idempotencyKey: string;
    }
  | {
      kind: 'enchant';
      creatureId: string;
      gearId: string;
      enchantId: string;
      idempotencyKey: string;
    };

/** The gear fields the collection view adds to every creature (`GET /api/state`). */
export interface CreatureGearFields {
  /** The creature's stats with the worn item folded in (capped); equal to `stats` without gear. */
  statsWithGear: { hp: number; atk: number; spd: number };
  gear: {
    id: string;
    baseId: string;
    rarity: GearRarity;
    level: number;
    enchantId: string | null;
  } | null;
  /** Expedition or job; null when idle. `away` stays true for expeditions only. */
  busy: { kind: 'expedition' | 'job'; id: string } | null;
}

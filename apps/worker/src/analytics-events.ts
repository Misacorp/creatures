/**
 * The events the analytics log accepts (`docs/design/analytics.md`): one typed shape per kind, so a
 * caller cannot pass a field the log does not know. Types, plus the closed list of gear sources.
 * `analytics.ts` re-exports everything here. Props hold only content ids, enums, integers and
 * booleans, never player-typed text; `analytics-props.ts` re-checks every value on write.
 */
import type {
  ExpeditionLength,
  GearRarity,
  GoalRisk,
  JobKind,
  PartsBundle,
  Rarity,
  Role,
} from '@creatures/game';
import type { DevActionTool } from './dev-schemas';
import type { PostFailureKind } from './discord-posts';
import type { DungeonOutcome } from './dungeon-types';

export type PhaseName = 'phase1' | 'phase2' | 'finale';
/**
 * What a catch came to: `new` (a species the player lacked) or `duplicate` (it waits as a choice). The
 * older `fused` and `converted` stay valid, so events written before Creatures A still read.
 */
export type CatchResult = 'new' | 'duplicate' | 'fused' | 'converted';
/** What became of a push-on choice: it worked, it failed (a risky one), or the player came home instead. */
export type PushOnOutcome = 'worked' | 'failed' | 'declined';
export type FestivalResult = CatchResult;

export type CampChoice = 'rest' | 'swap' | 'keepsake';

/** Where a gear grant came from. */
export const GEAR_SOURCES = [
  'raid_phase',
  'raid_finale',
  'festival',
  'expedition',
  'welcome',
  'dungeon',
  'rank_gift',
  'games',
] as const;
export type GearSource = (typeof GEAR_SOURCES)[number];

export interface CatchProps {
  species: string;
  rarity: Rarity;
  shiny: boolean;
  result: CatchResult;
  /** The talent the catch rolled (a content id) and whether it is golden. Absent in older events. */
  talent?: string;
  golden?: boolean;
}

/** What can be logged. `kind` names the action; the rest are its props. */
export type AnalyticsEvent =
  | { kind: 'session_start'; returning: boolean }
  | { kind: 'starter_chosen'; species: string }
  /** The daily Bait allowance was paid (once per player per game day). */
  | { kind: 'daily_allowance'; amount: number }
  | {
      kind: 'expedition_send';
      species: string;
      duration: ExpeditionLength;
      destination: string;
      /** The supplies carried (content ids). */
      supplies: readonly string[];
      /** The explorer's rank when it left. */
      rank: number;
    }
  | {
      kind: 'expedition_claim';
      duration: ExpeditionLength;
      destination: string;
      supplies: readonly string[];
      /** Whole minutes the finished expedition waited before it was claimed. */
      waitedMin: number;
      catches: readonly CatchProps[];
      /** What became of the push-on choice, if there was one. */
      pushOn: PushOnOutcome | 'none';
      /** Explorer XP gained; 0 when the trip failed. */
      xp: number;
      /** The explorer's stars at this destination after the trip. */
      stars: number;
    }
  | {
      kind: 'expedition_recall';
      duration: ExpeditionLength;
      destination: string;
      supplies: readonly string[];
      /** How much of the expedition had passed, 0 to 100. */
      elapsedPct: number;
      catches: readonly CatchProps[];
    }
  | {
      /** A finished trip rolled an end-of-trip choice: the goals offered (none when the roll came up empty). */
      kind: 'push_on_offer';
      destination: string;
      duration: ExpeditionLength;
      rank: number;
      goals: readonly string[];
    }
  | {
      kind: 'push_on_choose';
      goal: string;
      risk: GoalRisk;
      destination: string;
      duration: ExpeditionLength;
      /** The exact chance (basis points) the player was shown. */
      oddsBp: number;
    }
  | {
      kind: 'push_on_result';
      goal: string;
      risk: GoalRisk;
      outcome: PushOnOutcome;
      destination: string;
      duration: ExpeditionLength;
      oddsBp: number;
    }
  | {
      kind: 'journal_find';
      entry: string;
      place: string;
      set: string | null;
      setComplete: boolean;
    }
  | { kind: 'explorer_rank'; species: string; rank: number }
  | { kind: 'familiarity_star'; destination: string; stars: number }
  | { kind: 'slot_unlock'; slots: number; rankSum: number }
  | { kind: 'train'; species: string; level: number; cost: number }
  | {
      /** An activity paid a creature experience (or a ribbon or evolution spent what it had banked). */
      kind: 'creature_exp';
      source: 'trip' | 'dungeon' | 'raid' | 'job' | 'lounge' | 'games' | 'ribbon' | 'evolve';
      species: string;
      gained: number;
      treat: boolean;
      levelBefore: number;
      level: number;
      waiting: boolean;
    }
  | {
      /** A treat was packed when a trip, a dungeon run or a Workshop job started. */
      kind: 'treat';
      source: 'trip' | 'dungeon' | 'job';
      species: string;
      level: number;
      cost: number;
    }
  | { kind: 'ribbon'; species: string; ribbon: 'bronze' | 'silver' | 'gold' }
  | {
      /**
       * The one-time level reset of a player (levels halved at the switch to training by activity, the
       * Bait they cost refunded). Counts only.
       */
      kind: 'level_reset';
      creatures: number;
      levels: number;
      bait: number;
      unequipped: number;
      talentsToBook: number;
    }
  | {
      /** The pity made a catch roll bring a creature: `new` a species the player lacked, `creature` any. */
      kind: 'catch_pity';
      pity: 'new' | 'creature';
      species: string;
    }
  | { kind: 'evolve'; from: string; to: string; cost: number }
  | {
      /** A catch that fused into a creature the player already had (or paid Bait at the limit). */
      kind: 'fuse';
      species: string;
      rarity: Rarity;
      converted: boolean;
      fusionCount: number;
      bait: number;
    }
  | {
      /** A creature rolled a talent: a new catch, a duplicate's card, or (`backfill`) an existing creature's slot. */
      kind: 'talent_roll';
      species: string;
      talent: string;
      golden: boolean;
      backfill?: boolean;
    }
  | {
      /** A duplicate was settled: what the player (or the server, `auto`) chose and the talent it carried. */
      kind: 'duplicate_choice';
      choice: 'teach' | 'fuse' | 'release' | 'keep';
      auto: boolean;
      species: string;
      rarity: Rarity;
      talent: string;
      golden: boolean;
    }
  | {
      /** A talent was slotted from a creature's Talent Book (Bait). */
      kind: 'talent_slot';
      species: string;
      talent: string;
      golden: boolean;
      slot: number;
    }
  | { kind: 'team_set'; auto: boolean; species: readonly string[] }
  | { kind: 'placement'; action: 'place' | 'unplace'; species: string; slot: number; swap: boolean }
  | { kind: 'ability_pick'; ability: string }
  | { kind: 'autofire_toggle'; target: 'basic' | 'creature'; species: string | null; on: boolean }
  | { kind: 'live_join'; stage: 'lobby' | 'fight'; practice: boolean }
  | {
      kind: 'live_action';
      action: 'fire' | 'hold' | 'unhold';
      ability: string;
      /** Fire: the round it fires in. Hold and unhold: the round the clock was in. */
      round: number;
      /** The round the ability fires in when nobody presses anything. */
      defaultRound: number;
      practice: boolean;
    }
  | {
      kind: 'phase_result';
      phase: PhaseName;
      boss: string;
      rank: number;
      festival: boolean;
      partySize: number;
      win: boolean;
      rounds: number;
      /** The top contributor's share of the party's damage, in basis points. No user is named. */
      topShareBp: number;
    }
  | {
      kind: 'rank_change';
      before: number;
      after: number;
      won: boolean;
      festival: boolean;
      parties: number;
      partiesWon: number;
    }
  | {
      /**
       * An open raid week's numbers were declared again because the difficulty rules changed (see
       * `raid-redeclare.ts`). Guild-level; the ranks are null for a week that had none yet.
       */
      kind: 'raid_week_redeclared';
      boss: string;
      versionBefore: number;
      versionAfter: number;
      rankBefore: number | null;
      rankAfter: number | null;
      effectiveRankBefore: number | null;
      effectiveRankAfter: number | null;
      placedAgain: boolean;
    }
  | { kind: 'festival_grant'; species: string; result: FestivalResult }
  | {
      /** A grant of gear, parts or a blueprint. Content ids and counts only. */
      kind: 'gear_drop';
      source: GearSource;
      gear: readonly {
        base: string;
        rarity: GearRarity;
        /** The item level and the rolled lines (content ids and tiers 0 to 4). */
        level?: number;
        lines?: readonly { id: string; tier: number }[];
      }[];
      /** Items that did not fit in a full inventory and became parts instead. */
      converted: number;
      scrap: number;
      shards: number;
      glimmer: number;
      blueprint: string | null;
      blueprintDuplicate: boolean;
      /** Supplies the grant gave (left out when none). */
      supplies?: number;
      /** All the parts the grant paid, by kind (the per-kind breakdown of `scrap`, `shards` and `glimmer`). */
      parts?: PartsBundle;
    }
  | {
      kind: 'gear_equip';
      base: string;
      rarity: GearRarity;
      /** The item level. */
      level: number;
      slot?: 'hat' | 'scarf' | 'charm';
      /** The species of the creature that got the item (or lost it, for 'unequip'). */
      species: string;
      action: 'equip' | 'unequip';
      /** Another item was taken off to make room. */
      swap: boolean;
    }
  | {
      kind: 'gear_upgrade';
      base: string;
      rarity: GearRarity;
      from: number;
      to: number;
      essence: number;
      scrap: number;
    }
  | {
      kind: 'gear_dismantle';
      base: string;
      rarity: GearRarity;
      level: number;
      scrap: number;
      shards: number;
      glimmer: number;
      unequipped: boolean;
      /** The parts it gave, by kind. */
      parts?: PartsBundle;
      /** A dismantle job: items taken apart, the Essence it gave, blueprints learned and marks added (left out for older events). */
      items?: number;
      essence?: number;
      learned?: number;
      marks?: number;
    }
  | {
      kind: 'job_start';
      job: JobKind;
      /** The base crafted, or the base of the item worked on. */
      base: string;
      rarity: GearRarity;
      species: string;
      hours: number;
      skillLevel: number;
      /** The parts the job cost, by kind. */
      parts?: PartsBundle;
      /** A craft: what it was aimed at, and the Essence it cost. */
      reach?: 'none' | 'rare' | 'epic';
      essence?: number;
      /** A dismantle: how many items went in. */
      items?: number;
      /** The Bait a lure job cost (left out for every other job). */
      bait?: number;
    }
  | {
      kind: 'job_claim';
      job: JobKind;
      base: string;
      /** The rarity that came out (a craft) or the item's rarity. */
      rarity: GearRarity;
      /** A craft that came out one rarity above Common. */
      upgraded: boolean;
      xp: number;
      skillLevel: number;
      leveledUp: boolean;
      /** Supplies a supply job gave (left out for other jobs). */
      yield?: number;
      /** A craft: what it was aimed at. A dismantle: how many items went in. */
      reach?: 'none' | 'rare' | 'epic';
      items?: number;
    }
  | {
      /** A daily dungeon run: how deep, how far it got, what the rooms rolled and who went. */
      kind: 'dungeon_run';
      depth: number;
      /** 1, or 2 for the retry of the first day. */
      attempt: number;
      roomsCleared: number;
      cleared: boolean;
      landmark: boolean;
      /** The room modifiers, by room. */
      modifiers: readonly string[];
      /** The team's species and roles, front to back. */
      team: readonly { species: string; role: Role }[];
      /** How many of the three creatures wore gear. */
      gear: number;
      /**
       * The map runs (docs/design/dungeon-paths.md); absent on events written before them. How it ended,
       * the node kinds of the path taken in order, the keepsake ids held at the end, the camp's choice
       * ('none' when the run never took one), the elites cleared, and the pack's totals (all kinds
       * added together) when it ended and what came home of it.
       */
      outcome?: DungeonOutcome;
      path?: readonly string[];
      keepsakes?: readonly string[];
      campChoice?: CampChoice | 'none';
      elites?: number;
      packFound?: number;
      packKept?: number;
      /**
       * The Undercroft: how many levels the run cleared (its keepers beaten, 0 when it never went down),
       * and the room kinds its carved door added. Absent on events written before it.
       */
      deepest?: number;
      marks?: readonly string[];
    }
  | {
      /** The run went down into an Undercroft level (1 is the first). */
      kind: 'dungeon_descend';
      level: number;
    }
  | {
      /** A mystery room's option was picked: the event's content id, the option (0 or 1), and a gamble's result if it had one. */
      kind: 'dungeon_event';
      event: string;
      option: number;
      won?: boolean;
    }
  | {
      /** The camp's choice. */
      kind: 'dungeon_camp';
      choice: CampChoice;
    }
  | {
      /** What a dungeon run paid. Amounts and content ids only. */
      kind: 'dungeon_reward';
      depth: number;
      bait: number;
      essence: number;
      scrap: number;
      shards: number;
      glimmer: number;
      /** Gear items that dropped (and fit, or became parts). */
      gear: number;
      /** Supplies that dropped. */
      supplies: number;
      landmark: boolean;
      /** The day of the streak cycle whose bonus was paid (3 or 7), or 0. */
      streakBonusDay: number;
    }
  | {
      kind: 'post_result';
      result: 'sent' | 'retry' | 'failed';
      error: PostFailureKind | null;
      attempts: number;
    }
  | {
      /** A player turned one kind of Discord DM on or off (the kind only). */
      kind: 'dm_pref';
      which: 'trip' | 'job' | 'finale' | 'stall';
      on: boolean;
    }
  | {
      /** One delivery attempt of a Discord DM (a guild event: no player), like `post_result`. */
      kind: 'dm_result';
      result: 'sent' | 'retry' | 'failed' | 'blocked';
      error: PostFailureKind | null;
      attempts: number;
    }
  | {
      /** The valley's weather of a game day was drawn, a day ahead (a guild event: no player). */
      kind: 'weather_draw';
      boon: string;
      omen: string | null;
      wild: boolean;
      /** The Boss Rank it was drawn at, whether the day is in a Festival week, and the strengths (10000 is x1). */
      rank: number;
      festival: boolean;
      boonBp: number;
      omenBp: number;
    }
  | {
      /** Something started or fought under a day's weather: a trip, a Workshop job, a dungeon run or a raid stage. */
      kind: 'weather_use';
      where: 'trip' | 'job' | 'dungeon' | 'raid';
      boon: string;
      omen: string | null;
    }
  | {
      /**
       * A staging dev tool was used (`docs/design/dev-tools.md`). Reports must exclude this kind: staging
       * data is never mixed into production numbers, and these events are not player behaviour.
       */
      kind: 'dev_action';
      tool: DevActionTool;
    }
  /** A player set their entry in a Valley Games event (`creatures` 0: cleared it). */
  | { kind: 'games_entry'; event: string; creatures: number }
  /** A Valley Games day locked: its events played, how many creatures and players took part. */
  | { kind: 'games_show'; events: number; skipped: number; entrants: number; players: number }
  /** A purchase at the Valley Games' Prize Stall. */
  | { kind: 'games_buy'; offer: string; price: number };

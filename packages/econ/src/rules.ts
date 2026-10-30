import { RULES as GAME, content } from '@creatures/game';

/**
 * Every rate, cost, cap and odds of the PROPOSED valley, as data (docs/design/valley/economy/model.md). Each group names the
 * rule it comes from (V-POST-10 ...); the numbers are the system docs' example numbers unless a line says
 * `ASSUMPTION:` (the docs leave a gap or disagree: every one is listed in the report's appendix). Change a number here, run
 * `pnpm --filter @creatures/econ report`, read the targets. Times are hours, amounts are per effective hour unless said.
 */

export const ELEMENTS = ['tide', 'ember', 'grove', 'spark', 'mire'] as const;
export type Element = (typeof ELEMENTS)[number];

/** The spendable resources the lab watches (resources.md). Shards are one number here (five elements inside). */
export const RESOURCES = ['acorns', 'scrap', 'shards', 'essence'] as const;
export type Resource = (typeof RESOURCES)[number];

export type KitName = 'lure' | 'lantern' | 'satchel' | 'tongs' | 'loupe';
export type FindFamily = 'scrap' | 'shards' | 'creatures' | 'rare';
export interface Destination {
  readonly id: string;
  readonly element: Element | null;
  /** What the place's profile is rich in (V-SCOUT-2): that family's rate doubles. */
  readonly rich: FindFamily | 'none';
}

/**
 * The lines scouts can find today, from the shipped content (`@creatures/game`): scouts find a line's stage 1, never an evolved form
 * (evolved forms come from evolving at level 15). 14 lines are findable: 8 common, 3 rare and 3 epic (the deeper areas' Solmane,
 * Gaiadrake and Aurorix). The 18 forms of the content that scouts never find are the evolutions and the two festival prizes
 * (Lanternfin and Hearthshell, not catchable). `forms` counts the forms of the line (stage 1 and its evolutions).
 */
const RARITY_INDEX = { common: 0, rare: 1, epic: 2 } as const;
const FIRST_LINES = content.creatures
  .filter((c) => c.stage === 1 && c.catchable)
  .map((c) => ({
    element: c.element,
    rarity: RARITY_INDEX[c.rarity],
    forms: content.creatures.filter((f) => f.line === c.line).length,
  }));

/** What evolving costs by rarity, as a multiple of a common's (shipped: 20 Essence for a common line, 40 for a rare one). */
const evolveCostOf = (rarity: 'common' | 'rare' | 'epic'): number => {
  const cost = (r: string): number =>
    content.creatures.find((c) => c.rarity === r && c.evolvesTo)?.evolvesTo?.essence ?? 0;
  return cost(rarity) > 0 && cost('common') > 0 ? cost(rarity) / cost('common') : 1;
};

export const RULES = {
  /** The horizon: weeks of play simulated. */
  horizon: { weeks: 24 },

  /** V-POST-3, V-BON-1: one idle XP rate everywhere. The level curve is the shipped game's (`@creatures/game`). Levels never stop (Misa dropped the ribbons). */
  xp: {
    idlePerHour: 5,
    maxLevel: GAME.experience.maxLevel,
    /** A first stage waits for its evolution at this level (shipped). */
    evolveLevel: 15,
    // From the content: a line with more than one form evolves at level 15 (so every common line and the rare lines but Coralynx; the
    // epics never evolve); a rare line costs twice a common line (40 Essence against 20).
    evolveCostByRarity: [1, evolveCostOf('rare'), 1],
    /** An evolution costs this much Essence (shipped: every evolving species in creatures.json, 20 Essence at level 15). */
    // TUNED 2026-10-30 (round 15): was 20 (shipped), 30 after the last tuning; the tuner tried 60 and went back to 30.
    evolveEssence: 30,
  },

  /** V-POST-10 away steps: the share of idle gains by hours since the last visit. Curve B is the lead's pick, A the variant. */
  away: {
    A: [
      { until: 24, share: 1 },
      { until: 72, share: 0.85 },
      { until: 168, share: 0.6 },
      { until: 336, share: 0.3 },
      { until: 720, share: 0.1 },
    ],
    B: [
      { until: 48, share: 1 },
      { until: 96, share: 0.85 },
      { until: 168, share: 0.6 },
      { until: 336, share: 0.3 },
      { until: 720, share: 0.1 },
    ],
    // ASSUMPTION: "near zero after about a month" is 2%.
    beyond: 0.02,
  },

  /** V-BON-2 catch-up and V-BON-7 the hearth. */
  bonfire: {
    // Q35 B: the multiplier is fixed at each visit and holds until the next visit (never above the target it was fixed for).
    // ASSUMPTION: catch-up multiplies idle XP only, not what fights pay (V-BON-2 says "XP only, never output"; a sensitivity run applies it to fights too).
    // TUNED 2026-10-30: maxMultiplier was 2 (bonfire.md's example), the tuner took it to 3, then 3.75, then 4.7 (round 15; was 3.75).
    catchUp: { maxMultiplier: 4.7, fullAtGap: 6, appliesToFights: false },
    hearth: { perLevel: 0.04 },
  },

  /** V-POST-4 fit, V-POST-5 stores, V-POST-12 mastery. */
  posts: {
    fitBonus: 0.25,
    // ASSUMPTION: how often a seat's creature happens to fit its post. A set-and-forget player places a creature once and
    // looks at the icon about a third of the time; an optimiser matches almost always.
    fitShare: { setAndForget: 0.3, optimiser: 0.9 },
    storeHours: 72,
    mastery: [
      { hours: 48, bonus: 0.05 },
      { hours: 168, bonus: 0.1 },
      { hours: 504, bonus: 0.15 },
    ],
    // ASSUMPTION: a Master Smith brings 5% more scrap from the player's scouts ("a little more", V-FORGE-7).
    masterSmithScrapPerk: 0.05,
  },

  /**
   * V-TRIAL-1..5 (trials.md, Misa 2026-10-30): honours, never a gate. Each honour has a fight box and a work box, ticked as a creature
   * lives its life; a creature graduates at the daily ceremony once the boxes are ticked and it has the level.
   * Bronze (level 10): a dungeon clear with it in the team, a day at a post, and a find brought home or a day of smithing.
   * Silver (level 20): an Undercroft clear and Expert (7 days) in any work. Gold (level 30): a raid clear and Master (21 days) in any work.
   */
  honours: {
    levels: [10, 20, 30],
    bronzePostHours: 24,
    bronzeSmithHours: 24,
    // ASSUMPTION: combat is not simulated, so this share of dungeon runs counts as an Undercroft clear (or 2+ levels deep).
    undercroftShare: 0.3,
  },

  /** V-POST-2 seats: each player's own seats, bought with Acorns, dearer each time and at a higher place level. */
  seats: {
    // ASSUMPTION: the first seat at each place is free; the rest cost these Acorns (the docs: "about three weeks of Acorn
    // income in all", about 1,000 for the seats a player reaches by week 8).
    // TUNED 2026-10-30: were [0, 120, 200, 300, 420, 560] and [0, 130, 260, 420], then [0, 90, 150, 225, 315, 420] and [0, 98, 195, 315] (round 15: x1.25).
    scoutPrices: [0, 113, 188, 281, 394, 525],
    anvilPrices: [0, 123, 244, 394],
    // ASSUMPTION: an anvil also takes scrap ("own anvils unlocked with their own Acorns and scrap", V-FORGE-6).
    // TUNED 2026-10-30: was [0, 40, 80, 120], then [0, 30, 60, 90] (round 15: x1.25).
    anvilScrap: [0, 38, 75, 113],
    /** Each place level above 1 makes every seat this much dearer. */
    levelSurcharge: 0.15,
    /** Seats allowed by place level 1..5 (posts.md table). */
    scoutByLevel: [2, 3, 4, 5, 6],
    anvilByLevel: [2, 3, 3, 4, 4],
  },

  /** V-POST-11 kit: bought once, kept; a tilt, not a flat bonus. */
  kit: {
    // ASSUMPTION: about a week of Acorn income each (posts.md), any kind.
    // TUNED 2026-10-30: was 350 (about a week of Acorn income).
    price: 875,
    lure: { creatures: 2 },
    lantern: { rare: 1.5 },
    satchel: { scrap: 1.4, shards: 1.4 },
    // ASSUMPTION: tongs make common pieces a third faster ("faster common pieces", no number in the docs).
    tongs: { speed: 1.33 },
    // ASSUMPTION: the loupe is slower and lifts the rare and epic odds.
    loupe: { speed: 0.8, rarityOdds: 1.5 },
    /** Which kit a set-and-forget player buys, in order, with Acorns to spare; an optimiser buys everything in this order. */
    buyOrder: ['satchel', 'tongs', 'lure', 'lantern', 'loupe'] as KitName[],
    setAndForgetBuys: 2,
  },

  /** V-SCOUT-2, V-SCOUT-9, V-SCOUT-10: finds per effective hour of one scout, before fit, mastery and kit. */
  scouts: {
    perHour: {
      // TUNED 2026-10-30: scrap was 0.75 (scouts.md example).
      // TUNED 2026-10-30 (round 15): scrap was 1.425 and shards 0.2 (and 0.75 and 0.2 before the first tuning).
      scrap: 2.11,
      shards: 0.12,
      // ASSUMPTION: 0.75% an hour, not the docs' 2%: with 2% a daily player has all 34 forms by week 8, and posts.md's worked month
      // ("15 creatures by week 4") needs about 0.75%. The two numbers in the docs disagree; this one follows the worked month.
      // TUNED 2026-10-30: was 0.0075.
      creatures: 0.013,
      gear: 0.01,
      blueprints: 0.003,
      pages: 0.004,
      // ASSUMPTION: the "everyday" rare find that fills one socket of a collection (V-COM-12) about every 28 scout-days.
      rareFinds: 0.0015,
    },
    richMultiplier: 2,
    secondScoutCreatures: 0.5,
    // ASSUMPTION: six destinations, profiles picked to cover scrap, shards, creatures and rare finds (places.md lists them).
    destinations: [
      { id: 'tidepools', element: 'tide', rich: 'scrap' },
      { id: 'ember-caves', element: 'ember', rich: 'shards' },
      { id: 'verdant-hollow', element: 'grove', rich: 'creatures' },
      { id: 'storm-ridge', element: 'spark', rich: 'rare' },
      { id: 'sunken-fen', element: 'mire', rich: 'shards' },
      { id: 'old-crossroads', element: null, rich: 'none' },
    ] as readonly Destination[],
    /** V-SCOUT-9: a keystone clock per destination for the whole server: one in about this many days. */
    keystoneMeanDays: 21,
    // ASSUMPTION: a destination whose element a creature has doubles its weight when a new creature arrives (the shipped 2x).
    placeAffinity: 2,
    // The scout pool is LINES (a line's stage 1; evolved forms come from evolving). It starts at the 14 lines the content lets scouts find,
    // then `dropCount` more lines arrive every `dropEveryWeeks` weeks from `dropFromWeek` (Misa: the plan is 100 or more species, with
    // drops from about week 4). Arrivals and duplicates draw from the lines available that week.
    // ASSUMPTION: a content drop adds 12 lines, 6 common, 4 rare and 2 epic (`drop`; the earlier 6/4/2 kept, now counted as lines),
    // with elements cycling through the five; and a line's typical number of forms by rarity is `forms` (a common line 3, as most
    // today; a rare line 2; an epic line 1, as today's epics), so a drop is about 28 forms.
    species: { start: FIRST_LINES.length, dropFromWeek: 4, dropEveryWeeks: 4, dropCount: 12 },
    lines: {
      first: FIRST_LINES,
      drop: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2],
      forms: [3, 2, 1],
    },
    // ASSUMPTION (Q38): arrivals weigh a line by its rarity, so commons come at the "week 4 pace" and rarer lines take months.
    rarity: { weights: [1, 0.15, 0.04] },
    // ASSUMPTION: a lure halves the weight of species the player already owns.
    lureOwnedWeight: 0.5,
    // ASSUMPTION: known blueprints of a pool this size; a known one found again is scrap (shipped: 5).
    blueprintPool: 30,
    duplicateBlueprintScrap: GAME.gear.drops.duplicateBlueprintScrap,
    // ASSUMPTION: a duplicate creature takes the Recommended answer, which pays this much scrap (the docs name no amount).
    duplicateCreatureScrap: 8,
  },

  /** V-FORGE-1..9 and V-GEAR-6: anvils, pieces, tinkering, the bag. */
  forge: {
    pieceHours: 16,
    // TUNED 2026-10-30: scrap was 6 (forge.md example).
    // TUNED 2026-10-30 (round 15): was 18 (6 in forge.md).
    scrap: 36,
    shard: 1,
    /** Reach (shipped prices; hours from forge.md). Odds are [common, rare, epic]. */
    reach: {
      rare: { hours: 32, essence: 25, odds: [0.4, 0.6, 0] },
      epic: { hours: 48, essence: 70, odds: [0.15, 0.55, 0.3] },
    },
    // Q34 B: the Forge's shard exchange: `rate` shards of any one other element for 1 of the element you need.
    // ASSUMPTION: an "exchange crit" gives `critYield` instead of 1 with this chance (Misa's example, 10% for 2).
    exchange: { rate: 3, critChance: 0.1, critYield: 2 },
    // ASSUMPTION: odds of a plain piece's rarity (the shipped game's crafting is 'common' unless reached).
    baseOdds: [0.85, 0.13, 0.02],
    tinkerScrapEveryHours: 12,
    // ASSUMPTION: the floor holds about three days of pieces (V-FORGE-5): ceil(72 / 16) per anvil.
    floorPiecesPerAnvil: 5,
    bag: 200,
    // ASSUMPTION: three gear slots per creature (the shipped game's Hat, Scarf and Charm).
    slotsPerCreature: 3,
    // ASSUMPTION: a slot is "weaker" (so "for my team" makes pieces for it) when its item level is this far below the fire.
    weakMargin: 6,
    // ASSUMPTION: what dismantling a piece gives, from the shipped ranges' middles (scrap is about 40% of the craft's 6).
    dismantle: [
      { scrap: 2.5, shards: 0, essence: 0 },
      { scrap: 3, shards: 1, essence: 5.5 },
      { scrap: 3.5, shards: 1.5, essence: 17.5 },
    ],
    // ASSUMPTION: a set-and-forget player bulk-dismantles when the bag reaches this many; an optimiser every visit.
    tidyAt: 180,
    // ASSUMPTION: scouts' finds and the dungeon's drops carry rarity with the same odds as a plain craft.
    foundGearOdds: [0.85, 0.13, 0.02],
    // ASSUMPTION: a player keeps this much scrap and this many of each shard for the Forge (and the exchange) before giving the rest.
    giveReserveScrap: 72,
    giveReserveShards: 8,
    // ASSUMPTION: an optimiser keeps this much Essence for evolutions before it reaches for rarity.
    reachReserveEssence: 60,
  },

  /** Acorns (resources.md): the allowance building up idly, leets, small moments, the dungeon. */
  acorns: {
    // ASSUMPTION: posts.md says "about 50 a day" for a daily player (the review said 150); split as below so a daily player
    // gets 30 + 10 + 2 + 10 = 52. The allowance builds up idly (away steps apply) in a store of the same size as a post's.
    allowancePerDay: 30,
    leetPerVisitDay: 10,
    smallMomentPerVisitDay: 2,
    // ASSUMPTION: a new player starts with this many Acorns (the shipped welcome kit gives scrap and a blueprint, no Bait amount is in the docs).
    start: 100,
    welcomeScrap: GAME.gear.drops.welcomeScrap,
    starterCreatures: 3,
  },

  /** Combat is not simulated: dungeon and raid pay these (V-POST-7; posts.md example numbers; shipped scrap and Essence). */
  fights: {
    // ASSUMPTION: the three best creatures fight, as in posts.md's worked month ("her best three also run the dungeon and the raid").
    team: 3,
    dungeon: {
      xp: 120,
      // ASSUMPTION: one run a day; passes stack to three (posts.md "dungeon passes").
      maxPasses: 3,
      // ASSUMPTION: what a dungeon run pays besides XP, from the shipped room rewards (a run is about ten rooms: scrap 1 to 4
      // each, a boss's Essence, a landmark's glimmer now and then, a full clear's gear piece about half the time).
      acorns: 10,
      scrap: 10,
      // TUNED 2026-10-30 (round 15): was 1 (then 0.5 in this round's first pass).
      essence: 0.75,
      gearPieces: 0.5,
      /** The dungeon's item level base (shipped: base 1 + depth/3). */
      itemLevel: 10,
    },
    raid: {
      // ASSUMPTION: about 70 XP a day averaged is 490 a week per fighting creature, for visiting between Friday and Sunday.
      xpPerWeek: 490,
      scrap: 7,
      // ASSUMPTION: Essence from a week's raid: a kill pays more than the phases alone (shipped flat 10 + 15 + 25, +30% pool).
      // TUNED 2026-10-30 (round 15): were 70 and 25 (35 and 12.5 in this round's first pass).
      essenceKill: 52.5,
      essencePhases: 18.75,
      gearOnKill: 1,
      bossKillChance: { all: 1, half: 0.5, none: 0 },
    },
  },

  /** V-COM-5, V-COM-10, V-COM-11, V-COM-15: projects. */
  commons: {
    places: ['bonfire', 'forge', 'signpost', 'paddock', 'school'] as readonly string[],
    maxLevel: 5,
    // A project's size in Acorns' worth: the first about two weeks of 8 players' giving (commons.md).
    // TUNED 2026-10-30: was 2000 (commons.md example).
    baseSize: 9000,
    // ASSUMPTION: level 1 to 2 costs 35% of the base (V-COM-15: "small enough to finish in a few days"), then the base, x1.25, x1.25.
    // TUNED 2026-10-30: the first level was 0.35.
    levelFactor: [0.0875, 1, 1.25, 1.5625],
    // ASSUMPTION: cosmetic projects after the max level cost twice the base, repeating.
    cosmeticFactor: 2,
    // ASSUMPTION: size grows with the active weight W as (W / 8) ^ 0.7 ("more slowly than the player count").
    sizeExponent: 0.7,
    referenceWeight: 8,
    buildHours: 72,
    // ASSUMPTION: a player's weight by visit days in the last 7: 0.4 for one day (a weekly player), 1 from four days.
    weight: { oneDay: 0.4, fullAtDays: 4 },
    // ASSUMPTION: what one Acorn, one scrap and one shard are worth toward a project, in Acorns' worth (the project's size unit).
    // Scrap is the plentiful one (a daily player earns about three times more of it than Acorns), so it counts half.
    giftValue: { acorns: 1, scrap: 0.5, shards: 2 },
    // ASSUMPTION (Q33): a project's cost is split by value into an Acorn part, a scrap part and a shard part in these shares.
    costSplit: { acorns: 0.4, scrap: 0.4, shards: 0.2 },
    // ASSUMPTION (Q33): the shard part of a place's project takes shards of this element (a simple tie of element to place); shards of
    // any other element count at the exchange's rate (3 for 1), so one scarce element never holds a project back.
    placeElement: {
      bonfire: 'ember',
      forge: 'ember',
      signpost: 'grove',
      paddock: 'tide',
      school: 'spark',
    } as Record<string, string>,
    // ASSUMPTION: the server's gifts pick an open place by these weights (the guided start overrides at first).
    placeWeights: { bonfire: 2, forge: 3, signpost: 2, paddock: 1, school: 1 } as Record<
      string,
      number
    >,
    // ASSUMPTION: a communal seat's output toward its place's project, per effective hour (commons.md: "a steady trickle").
    communalPerHour: 0.03,
    communalCreaturesPerSeat: 3,
  },

  /**
   * V-COM-12: collections. Each place's board has five sockets, each for one particular find from one source, and at least one
   * socket per board is filled by ordinary idle play ('everyday'). A find fills only its own socket; a spare copy melts.
   * Sources: `keystone:<destination>` (V-SCOUT-9, the server's clock for that destination), `landmark:<n>` (the dungeon's five
   * landmarks), `resident:<n>` (a rare resident's token, found with a creature), `page:<n>` (a journal page of the School's set),
   * `everyday` (a rare find from a scout's ordinary work).
   */
  collections: {
    // ASSUMPTION: which five finds each place's board wants (commons.md examples: the Forge's Heartcoal from each element's place,
    // the Signpost's stones from deeper areas, the bonfire's embers from the dungeon's landmarks, the Paddock's tokens from rare
    // residents, the School's pages of one set), each with one ordinary-play socket as V-COM-12 requires.
    boards: {
      forge: [
        'keystone:tidepools',
        'keystone:ember-caves',
        'keystone:verdant-hollow',
        'keystone:storm-ridge',
        'everyday',
      ],
      signpost: [
        'keystone:sunken-fen',
        'keystone:old-crossroads',
        'keystone:tidepools',
        'keystone:storm-ridge',
        'everyday',
      ],
      bonfire: ['landmark:1', 'landmark:2', 'landmark:3', 'landmark:4', 'everyday'],
      paddock: ['resident:1', 'resident:2', 'resident:3', 'resident:4', 'everyday'],
      school: ['page:1', 'page:2', 'page:3', 'page:4', 'everyday'],
    } as Record<string, readonly string[]>,
    // ASSUMPTION: a dungeon run turns up one of the four landmark embers with this chance (about one a week for 8 daily players).
    landmarkPerRun: 0.02,
    // ASSUMPTION: only this share of the journal pages scouts find belong to the School's set (there are several sets), uniform over its pages.
    pageInSetChance: 0.15,
    // ASSUMPTION: a creature arriving is a rare resident with its token with this chance.
    residentPerArrival: 0.04,
    // ASSUMPTION: a find that no open socket wants melts into this much Essence.
    meltEssence: 5,
  },

  /** V-COM-13, V-GEAR-8, V-GEAR-10: the Forge's fire. */
  fire: {
    start: 10,
    // Q40 B: no time floor under the fire (Misa dropped the clock); building, collections and boss kills drive it. The slow floor of
    // Q37 B (1.875 levels a week) stays as the "slow floor" variants of the report (`SLOW_FLOOR` in servers.ts) for comparison.
    floorPerWeek: 0,
    warmth: {
      // Q37 B: warmth back up from the last tuning's quarter of commons.md's table (3, 5, 4, 2, 1); the tuner took it to half, over the slow floor.
      // TUNED 2026-10-30 (round 15): were 0.75, 1.25, 1, 0.5 and 0.25 after the last tuning; now half of commons.md's table.
      placeLevel: 1.5,
      forgeLevel: 2.5,
      collection: 2,
      bossKill: 1,
      masterTitlesPerPoint: 5,
      cosmetic: 0.5,
    },
    thresholds: [10, 25, 50, 80],
  },
};

export type Rules = typeof RULES;
export type AwayCurve = 'A' | 'B';

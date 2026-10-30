import * as v from 'valibot';
import { ELEMENTS } from './rules';

/** The schema of `RULES` and of the player profiles: strict (no unknown keys), numbers finite, shares inside 0..1. */

const num = v.pipe(v.number(), v.finite(), v.minValue(0));
const pos = v.pipe(v.number(), v.finite(), v.minValue(0.000001));
const share = v.pipe(v.number(), v.minValue(0), v.maxValue(1));
const int = v.pipe(v.number(), v.integer(), v.minValue(0));
const nums = v.array(num);
const stepList = v.pipe(
  v.array(v.strictObject({ until: pos, share })),
  v.minLength(1),
  v.check(
    (steps) => steps.every((s, i) => i === 0 || s.until > (steps[i - 1]?.until ?? 0)),
    'steps must run forward in time',
  ),
  v.check(
    (steps) => steps.every((s, i) => i === 0 || s.share <= (steps[i - 1]?.share ?? 1)),
    'steps must never rise',
  ),
);
const odds = v.pipe(
  v.tuple([share, share, share]),
  v.check((o) => Math.abs(o[0] + o[1] + o[2] - 1) < 1e-9, 'odds must add up to 1'),
);
const rarityRow = v.strictObject({ scrap: num, shards: num, essence: num });

export const RulesSchema = v.strictObject({
  horizon: v.strictObject({
    weeks: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(104)),
  }),
  xp: v.strictObject({
    idlePerHour: pos,
    maxLevel: int,
    ribbons: v.array(v.strictObject({ level: int, scrap: int, shards: int })),
    evolveLevel: int,
    evolveShare: share,
    evolveEssence: int,
  }),
  away: v.strictObject({ A: stepList, B: stepList, beyond: share }),
  bonfire: v.strictObject({
    catchUp: v.strictObject({
      maxMultiplier: pos,
      fullAtGap: pos,
      appliesToFights: v.boolean(),
    }),
    hearth: v.strictObject({ perLevel: num }),
  }),
  posts: v.strictObject({
    fitBonus: num,
    fitShare: v.strictObject({ setAndForget: share, optimiser: share }),
    storeHours: pos,
    mastery: v.array(v.strictObject({ hours: pos, bonus: num })),
    masterSmithScrapPerk: num,
  }),
  seats: v.strictObject({
    scoutPrices: nums,
    anvilPrices: nums,
    anvilScrap: nums,
    levelSurcharge: num,
    scoutByLevel: v.array(int),
    anvilByLevel: v.array(int),
  }),
  kit: v.strictObject({
    price: int,
    lure: v.strictObject({ creatures: pos }),
    lantern: v.strictObject({ rare: pos }),
    satchel: v.strictObject({ scrap: pos, shards: pos }),
    tongs: v.strictObject({ speed: pos }),
    loupe: v.strictObject({ speed: pos, rarityOdds: pos }),
    buyOrder: v.array(v.picklist(['lure', 'lantern', 'satchel', 'tongs', 'loupe'])),
    setAndForgetBuys: int,
  }),
  scouts: v.strictObject({
    perHour: v.strictObject({
      scrap: num,
      shards: share,
      creatures: share,
      gear: share,
      blueprints: share,
      pages: share,
      rareFinds: share,
    }),
    richMultiplier: pos,
    secondScoutCreatures: share,
    destinations: v.array(
      v.strictObject({
        id: v.pipe(v.string(), v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)),
        element: v.nullable(v.picklist(ELEMENTS)),
        rich: v.picklist(['scrap', 'shards', 'creatures', 'rare', 'none']),
      }),
    ),
    keystoneMeanDays: pos,
    placeAffinity: pos,
    species: v.strictObject({ start: int, dropFromWeek: int, dropEveryWeeks: int, dropCount: int }),
    speciesPerElement: v.array(int),
    lureOwnedWeight: num,
    blueprintPool: int,
    duplicateBlueprintScrap: int,
    duplicateCreatureScrap: int,
  }),
  forge: v.strictObject({
    pieceHours: pos,
    scrap: int,
    shard: int,
    reach: v.strictObject({
      rare: v.strictObject({ hours: pos, essence: int, odds }),
      epic: v.strictObject({ hours: pos, essence: int, odds }),
    }),
    exchange: v.strictObject({ rate: pos, critChance: share, critYield: pos }),
    baseOdds: odds,
    tinkerScrapEveryHours: pos,
    floorPiecesPerAnvil: int,
    bag: int,
    slotsPerCreature: int,
    weakMargin: int,
    dismantle: v.tuple([rarityRow, rarityRow, rarityRow]),
    tidyAt: int,
    foundGearOdds: odds,
    giveReserveScrap: int,
    giveReserveShards: int,
    reachReserveEssence: int,
  }),
  acorns: v.strictObject({
    allowancePerDay: num,
    leetPerVisitDay: num,
    smallMomentPerVisitDay: num,
    start: int,
    welcomeScrap: int,
    starterCreatures: int,
  }),
  fights: v.strictObject({
    team: int,
    dungeon: v.strictObject({
      xp: num,
      maxPasses: int,
      acorns: num,
      scrap: num,
      essence: num,
      gearPieces: num,
      itemLevel: int,
    }),
    raid: v.strictObject({
      xpPerWeek: num,
      scrap: num,
      essenceKill: num,
      essencePhases: num,
      gearOnKill: num,
      bossKillChance: v.strictObject({ all: share, half: share, none: share }),
    }),
  }),
  commons: v.strictObject({
    places: v.array(v.string()),
    maxLevel: int,
    baseSize: pos,
    levelFactor: v.array(pos),
    cosmeticFactor: pos,
    sizeExponent: num,
    referenceWeight: pos,
    buildHours: num,
    weight: v.strictObject({ oneDay: share, fullAtDays: pos }),
    giftValue: v.strictObject({ acorns: pos, scrap: pos, shards: pos }),
    costSplit: v.pipe(
      v.strictObject({ acorns: share, scrap: share, shards: share }),
      v.check(
        (s) => Math.abs(s.acorns + s.scrap + s.shards - 1) < 1e-9,
        'the shares of a project must add up to 1',
      ),
    ),
    placeElement: v.record(v.string(), v.picklist(ELEMENTS)),
    placeWeights: v.record(v.string(), pos),
    communalPerHour: num,
    communalCreaturesPerSeat: pos,
  }),
  collections: v.strictObject({
    boards: v.record(
      v.string(),
      v.pipe(
        v.array(v.string()),
        v.length(5),
        v.check((b) => b.includes('everyday'), 'a board needs a socket for ordinary idle play'),
      ),
    ),
    landmarkPerRun: share,
    residentPerArrival: share,
    pageInSetChance: share,
    meltEssence: num,
  }),
  fire: v.strictObject({
    start: int,
    floorPerWeek: num,
    warmth: v.strictObject({
      placeLevel: num,
      forgeLevel: num,
      collection: num,
      bossKill: num,
      masterTitlesPerPoint: pos,
      cosmetic: num,
    }),
    thresholds: v.array(int),
  }),
});

const hour = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(23));

export const ProfileSchema = v.strictObject({
  id: v.pipe(v.string(), v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), v.maxLength(40)),
  label: v.pipe(v.string(), v.minLength(1), v.maxLength(40)),
  /** The first week (1-based) of play. */
  joinWeek: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(104)),
  /** Weekdays (0 = Monday) the player opens the game, or every N days. */
  weekdays: v.array(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(6))),
  everyNDays: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(30)),
  /** Hours of the day (0..23) of the visits on a visiting day. */
  hours: v.pipe(v.array(hour), v.minLength(1)),
  /** Weeks (inclusive) with no visits at all, or null. */
  away: v.nullable(
    v.tuple([
      v.pipe(v.number(), v.integer(), v.minValue(1)),
      v.pipe(v.number(), v.integer(), v.minValue(1)),
    ]),
  ),
  /** Whether the player runs the dungeon and the raid. */
  fights: v.boolean(),
  /** The share of Acorn income (and of spare scrap and shards) given to projects. */
  giveShare: share,
  /** Weeks of saving before giving everything (0: no hoarding). */
  hoardWeeks: int,
  policy: v.picklist(['setAndForget', 'optimiser']),
});
export type PlayerProfile = v.InferOutput<typeof ProfileSchema>;

/**
 * The Valley Games content (`data/games-events.json`; docs/design/valley-games.md): the pool of daily
 * events and the commentary lines the show plays. An event is a `kind` (a rule shape the engine knows:
 * `endure`, `chase`, `feast`, `swim`, `shove`, `haul`, `fill`, `stack`, `kite`) with its own numbers (`params`), an element table and a
 * scene for the client to draw. Skins reuse a kind with other numbers (the Frost Bath is the sauna with
 * the elements flipped), so new events need no engine change.
 *
 * Numbers are integers: basis points (10000 = x1) unless the name says otherwise. Ids are never renamed
 * once shipped (records and medals are stored by event id). Player-facing text is plain text without
 * control, format or line-break characters and the client renders it as text only.
 */
import * as v from 'valibot';
import { ElementSchema, IdSchema } from './schema';

/** Player-facing text: no control, format (bidi, zero-width) or line-break characters. */
const PLAIN_TEXT = /^[^\p{Cc}\p{Cf}\p{Zl}\p{Zp}]*$/u;
const Text = (max: number) =>
  v.pipe(
    v.string(),
    v.minLength(1),
    v.maxLength(max),
    v.regex(PLAIN_TEXT, 'must be plain text without control or format characters'),
  );
const Int = (min: number, max: number) =>
  v.pipe(v.number(), v.integer(), v.minValue(min), v.maxValue(max));
const Bp = Int(0, 10_000);

/** The longest line a favour's note may be (code units; the popover shows it on one or two lines). */
export const MAX_FAVOUR_NOTE = 80;
const Mult = Int(1, 40_000);

export const GAMES_KINDS = [
  'endure',
  'chase',
  'feast',
  'swim',
  'shove',
  'haul',
  'fill',
  'stack',
  'kite',
] as const;
export type GamesKind = (typeof GAMES_KINDS)[number];

/** The scenes the client can draw, and the kinds each one fits. */
export const GAMES_SCENES = {
  sauna: 'endure',
  'frost-bath': 'endure',
  'melon-hill': 'chase',
  'log-trail': 'haul',
  'pumpkin-hill': 'haul',
  'barrel-pond': 'fill',
  'crate-yard': 'stack',
  'kite-hill': 'kite',
  'pepper-table': 'feast',
  'shark-lake': 'swim',
  'ice-floe': 'shove',
} as const satisfies Record<string, GamesKind>;
export type GamesScene = keyof typeof GAMES_SCENES;
const SCENE_IDS = Object.keys(GAMES_SCENES) as GamesScene[];

/** What helps in an event, as tags the client turns into icons (and the element ids). */
export const GAMES_FAVOURS = [
  'hp',
  'atk',
  'spd',
  'dodge',
  'crit',
  'small',
  'big',
  'guard',
  'support',
  'setter',
  'payoff',
  'tide',
  'ember',
  'grove',
  'spark',
  'mire',
] as const;
export type GamesFavour = (typeof GAMES_FAVOURS)[number];

/**
 * Every commentary key the engine can emit, by kind (`say` beats). Content gives each a template;
 * `{a}` and `{b}` are actor names and `{n}` a number. The engine imports this list, so a key it emits
 * always has a template.
 */
export const GAMES_SAY_KEYS = {
  endure: [
    'endure.start',
    'endure.steam',
    'endure.splash',
    'endure.stoke',
    'endure.overload',
    'endure.wildfire',
    'endure.fan',
    'endure.shelter',
    'endure.stubborn',
    'endure.out',
    'endure.out2',
    'endure.half',
    'endure.duel',
    'endure.win',
    'endure.draw',
  ],
  chase: [
    'chase.start',
    'chase.hop',
    'chase.stumble',
    'chase.duck',
    'chase.stubborn',
    'chase.squash',
    'chase.squash2',
    'chase.burst',
    'chase.faster',
    'chase.lead',
    'chase.last',
    'chase.win',
    'chase.draw',
    'chase.finish',
    'chase.smash',
  ],
  feast: [
    'feast.start',
    'feast.gulp',
    'feast.ghost',
    'feast.burst',
    'feast.burst2',
    'feast.scorch',
    'feast.cool',
    'feast.echo',
    'feast.burp',
    'feast.stubborn',
    'feast.encore',
    'feast.lead',
    'feast.duel',
    'feast.win',
    'feast.draw',
  ],
  swim: [
    'swim.start',
    'swim.shark',
    'swim.bite',
    'swim.slip',
    'swim.zap',
    'swim.out',
    'swim.out2',
    'swim.lap',
    'swim.burst',
    'swim.stubborn',
    'swim.finish',
    'swim.lead',
    'swim.win',
    'swim.draw',
    'swim.tag',
  ],
  shove: [
    'shove.start',
    'shove.shove',
    'shove.bounce',
    'shove.dodge',
    'shove.splash',
    'shove.splash2',
    'shove.teeter',
    'shove.melt',
    'shove.shrink',
    'shove.duel',
    'shove.win',
    'shove.draw',
  ],
  haul: [
    'haul.start',
    'haul.drop',
    'haul.catch',
    'haul.steady',
    'haul.dodge',
    'haul.cheer',
    'haul.zap',
    'haul.bump',
    'haul.lead',
    'haul.finish',
    'haul.close',
    'haul.win',
    'haul.draw',
  ],
  fill: [
    'fill.start',
    'fill.pour',
    'fill.spill',
    'fill.splash',
    'fill.steam',
    'fill.help',
    'fill.dodge',
    'fill.catch',
    'fill.lead',
    'fill.half',
    'fill.full',
    'fill.last',
    'fill.win',
    'fill.draw',
  ],
  stack: [
    'stack.start',
    'stack.place',
    'stack.steady',
    'stack.root',
    'stack.topple',
    'stack.knock',
    'stack.dodge',
    'stack.catch',
    'stack.lead',
    'stack.high',
    'stack.last',
    'stack.win',
    'stack.draw',
  ],
  kite: [
    'kite.start',
    'kite.gust',
    'kite.hold',
    'kite.zap',
    'kite.tangle',
    'kite.dodge',
    'kite.catch',
    'kite.lead',
    'kite.high',
    'kite.last',
    'kite.win',
    'kite.draw',
  ],
} as const satisfies Record<GamesKind, readonly string[]>;
export type GamesSayKey = (typeof GAMES_SAY_KEYS)[GamesKind][number];

/** Placeholders a commentary template may use. */
const SAY_PLACEHOLDER = /\{([a-z]+)\}/g;
const SAY_ARGS: ReadonlySet<string> = new Set(['a', 'b', 'n']);

const ElementTable = v.strictObject({
  tide: Mult,
  ember: Mult,
  grove: Mult,
  spark: Mult,
  mire: Mult,
});

/** Numbers every kind reads. */
const COMMON = {
  /** How much the square-root stat curve counts (10000: the whole curve; 0: stats do not matter). */
  statBp: Int(0, 20_000),
  /** Random spread of each tick's roll (plus or minus, in basis points). */
  jitterBp: Int(0, 8_000),
  /** How much of a creature's dodge chance counts in this event (10000: all of it; more: it counts extra). */
  dodgeShareBp: Int(0, 40_000),
};

/**
 * Endure (Sauna Showdown): a rising heat; each creature's meter fills by the heat over its tolerance
 * (HP against the field, element, role). Guards shelter their bench neighbours, Supports fan them. A
 * ladle of water now and then: by a `spikeElement` creature it is a spike for everyone (Steam), else
 * the heat goes up a notch. A `stokeElement` creature sometimes stokes (signed: a negative number
 * soothes the neighbours instead).
 */
export const EndureParamsSchema = v.strictObject({
  ...COMMON,
  /** Heat at the start and its rise per tick (0 to 10000 is 0 to 100 on the thermometer). */
  heatStartBp: Bp,
  heatRiseBp: Int(1, 2_000),
  /** Meter gained per tick at full heat by a creature of tolerance x1 (10000 is a full meter). */
  intakeBp: Int(1, 5_000),
  /** Intake cut per Guard sitting beside it, and the most all shelter can cut. */
  shelterBp: Bp,
  shelterMaxBp: Bp,
  /** Each tick each Support fans a neighbour with this chance, taking `fanBp` off its meter. */
  fanChanceBp: Bp,
  fanBp: Bp,
  /** Ticks between two ladles of water (drawn from min to max). */
  ladleMinTicks: Int(1, 100),
  ladleMaxTicks: Int(1, 100),
  /** A ladle by this element is Steam: every meter gets `steamBp` (over tolerance). */
  spikeElement: ElementSchema,
  steamBp: Bp,
  /** Any other ladle raises the heat itself by this much. */
  splashHeatBp: Bp,
  /** A creature of `spikeElement`'s Steam beside one of `zapElement` also zaps that one's neighbours. */
  zapElement: ElementSchema,
  zapBp: Bp,
  /** A `stokeElement` creature stokes with this chance each tick: the two seats each side get `stokeBp`. */
  stokeElement: ElementSchema,
  stokeChanceBp: Bp,
  stokeBp: Int(-10_000, 10_000),
  /** A stoke beside a `wildfireElement` creature spreads: that one's neighbours get `wildfireBp`. */
  wildfireElement: ElementSchema,
  wildfireBp: Bp,
  /** Where a Stubborn save leaves the meter, and how much a Second Wind takes off. */
  stubbornBackBp: Bp,
  secondWindBp: Bp,
});

/**
 * Chase (Melon Run): a giant melon rolls from the left and speeds up; runners advance by Speed against
 * the field; obstacles are hopped by a dodge roll or stumbled over. Small creatures duck under it once.
 */
export const ChaseParamsSchema = v.strictObject({
  ...COMMON,
  /** A runner's speed at x1, in hundredths of a pixel per tick. */
  runCpx: Int(1, 2_000),
  /** The melon's start (its centre, in px), its first speed and its speed-up (hundredths of a px). */
  melonStartPx: Int(-200, 100),
  melonCpx: Int(1, 2_000),
  melonAccelCpx: Int(0, 200),
  /** Chance per tick that a runner meets an obstacle, and the base chance to hop it (plus its dodge). */
  hopChanceBp: Bp,
  hopBaseBp: Bp,
  /** Ticks lost to a stumble (drawn from min to max). */
  stumbleMinTicks: Int(1, 10),
  stumbleMaxTicks: Int(1, 10),
  /** After a duck or a Stubborn save the runner pops out this far ahead of the melon's front (px). */
  aheadPx: Int(1, 100),
  /** Momentum or Riposte after a hop: that runner's next tick goes this much faster. */
  burstBp: Int(0, 40_000),
  /** The finish line (world x, px): a runner across it is safe; the melon smashes into the arch there. */
  finishPx: Int(100, 2_000),
  /** Metres added to the first finisher's score; one less for each finisher after, at least 1. */
  finishBonusM: Int(1, 100),
});

/**
 * Feast (Pepper Panic): every `roundTicks` everyone eats; heat over tolerance fills the meter; a crit
 * is a double gulp. At a full meter the creature bursts into flames and scorches its neighbours.
 */
export const FeastParamsSchema = v.strictObject({
  ...COMMON,
  roundTicks: Int(1, 20),
  /** Meter added by a mild, hot and ghost pepper at tolerance x1, and their weights. */
  mildBp: Bp,
  hotBp: Bp,
  ghostBp: Bp,
  mildWeight: Int(0, 1_000),
  hotWeight: Int(0, 1_000),
  ghostWeight: Int(0, 1_000),
  /** Each round's peppers are this much hotter than the last round's. */
  rampBp: Int(0, 5_000),
  /** Chance a round is a ghost round (everyone gets a ghost pepper). */
  ghostRoundBp: Bp,
  /** Creatures of `coolElement` cool down by `coolBp` each round. */
  coolElement: ElementSchema,
  coolBp: Bp,
  /** The meter a burst adds to each neighbour (over its tolerance). */
  scorchBp: Bp,
  /** How much of the crit chance counts for a gulp, and of the Echo chance for an extra pepper. */
  critShareBp: Int(0, 40_000),
  echoShareBp: Int(0, 40_000),
  burpChanceBp: Bp,
  stubbornBackBp: Bp,
  secondWindBp: Bp,
});

/**
 * Swim (Shark Derby): laps of an elliptical lake (3600 units a lap). Sharks join over time and bite
 * the nearest swimmers; a dodge slips away, else the swimmer's stamina drops. Spark swimmers zap.
 */
export const SwimParamsSchema = v.strictObject({
  ...COMMON,
  laps: Int(1, 5),
  /** A swimmer's speed at x1, in lap units (3600 a lap) per tick. */
  swimUnits: Int(1, 1_000),
  /** Sharks at the start, ticks between new sharks, the most at once, and their speed (lap units). */
  sharkStart: Int(0, 8),
  sharkEveryTicks: Int(1, 200),
  sharkMax: Int(1, 8),
  sharkUnits: Int(1, 1_000),
  /** Every `biteEveryTicks` each shark bites the nearest swimmer within `biteRangeUnits` of it. */
  biteEveryTicks: Int(1, 50),
  biteRangeUnits: Int(1, 1_800),
  /** Stamina a bite takes at tolerance x1 (10000 is all of it). */
  biteBp: Bp,
  /** A `zapElement` swimmer zaps with this chance each tick: swimmers within `zapRangePx` are stunned. */
  zapElement: ElementSchema,
  zapChanceBp: Bp,
  zapRangePx: Int(1, 64),
  stunTicks: Int(1, 10),
  /** The race ends when this many have finished (or nobody is left swimming). */
  finishers: Int(1, 24),
  burstBp: Int(0, 40_000),
  secondWindBp: Bp,
});

/**
 * Shove (Floe Sumo): everyone on a shrinking floe; a few creatures each tick shove a near neighbour
 * (push from Attack against grip from HP); outside the edge is a splash.
 */
export const ShoveParamsSchema = v.strictObject({
  ...COMMON,
  /** The floe's start and smallest x-radius in px (y-radius is 52% of it), and its shrink per tick (hundredths of a px). */
  floeStartPx: Int(10, 90),
  floeMinPx: Int(4, 90),
  shrinkCpx: Int(0, 500),
  /** Each living `meltElement` creature shrinks the floe this much more per tick (hundredths of a px). */
  meltElement: ElementSchema,
  meltCpx: Int(0, 200),
  /** Shoves per tick: this share of the creatures on the floe, at least one. */
  shoveRateBp: Bp,
  /** A winning shove slides the target `slidePx` times push over grip, at most `maxSlidePx`. */
  slidePx: Int(1, 60),
  maxSlidePx: Int(1, 90),
  /** Creatures waddle back towards the middle this much per tick (hundredths of a px). */
  driftCpx: Int(0, 500),
  /** Once the floe is at its smallest it stops shrinking, and every tick there makes the shoves this much stronger. */
  squeezeBp: Int(0, 5_000),
  /** Creatures closer than this (px) jostle apart, so a crowd fills the floe and the edge ones slip off. */
  spacePx: Int(0, 30),
});

/**
 * Haul (Log Carry, Pumpkin Push), team events only: each team carries or pushes one big object along a
 * course, every lane at once. The team's speed comes from its members' key stat against the field
 * (`carry`: Speed, the slowest member counting most, so a team must match; `push`: Attack, added up
 * with diminishing returns). Now and then a load wobbles: a member keeps it steady with a dodge roll
 * (Guards steady it more), or it drops (the log falls, the pumpkin rolls back) and the team loses a few
 * ticks (Supports cheer them up sooner); a drop can bump the team in the next lane. Setters lead (a
 * little speed). The race ends `graceTicks` after the first team crosses the line, or at `maxTicks`,
 * whatever the field: every lane races at once. Ranking: finish order, then distance.
 */
export const HaulParamsSchema = v.strictObject({
  ...COMMON,
  /** `carry`: Speed, the slowest counts most. `push`: Attack, summed with diminishing returns. */
  mode: v.picklist(['carry', 'push'] as const),
  /** A team's speed at x1, in hundredths of a pixel per tick. */
  runCpx: Int(1, 2_000),
  /** Carry: how much of the team's speed is its slowest member's (the rest is the mean). */
  minWeightBp: Bp,
  /** Push: the share the second and third strongest add (the strongest counts whole). */
  secondBp: Bp,
  thirdBp: Bp,
  /** Speed lost per missing member (a team of fewer than three; push already counts them as 0). */
  shortBp: Bp,
  /** A team with a Setter goes this much faster (x1 = 10000). */
  leadBp: Int(10_000, 20_000),
  /** Chance per tick that a team's load wobbles. */
  wobbleChanceBp: Bp,
  /** A wobbling member's chance to keep it steady before its dodge, and what each Guard adds (at most two). */
  steadyBaseBp: Bp,
  guardSteadyBp: Bp,
  /** Ticks a drop costs (drawn from min to max); each Support in the team takes one off (at least one left). */
  dropMinTicks: Int(1, 20),
  dropMaxTicks: Int(1, 20),
  /** Push: how far the pumpkin rolls back on a drop (px). */
  rollbackPx: Int(0, 40),
  /** A drop bumps a team in the next lane within `bumpRangePx` with this chance; it loses `bumpTicks`. */
  bumpChanceBp: Bp,
  bumpRangePx: Int(1, 64),
  bumpTicks: Int(1, 10),
  /** A `zapElement` member jolts its team forward with this chance per tick (`burstBp` for two ticks). */
  zapElement: ElementSchema,
  zapChanceBp: Bp,
  /** Momentum or Riposte after a steady wobble, and a zap: the team's next ticks go this much faster. */
  burstBp: Int(0, 40_000),
  /** The finish line (world x of the load's centre, px). */
  finishPx: Int(100, 2_000),
  /** The race goes on this many ticks after the first team crosses (then everyone stops). */
  graceTicks: Int(1, 50),
  /** Metres added to the first finisher's score; one less for each finisher after, at least 1. */
  finishBonusM: Int(1, 100),
});

/**
 * Fill (Bucket Brigade), team events only: every team fills its own barrel from the pond in a fixed
 * time (`maxTicks`), all members at once. Each member dips a bucket at the pond (`dipTicks`, one fewer
 * per Support in the team), runs it up to the barrel (Speed against the field, the role and size
 * multipliers) and pours; the element multiplier is how much a bucket holds (Tide carries more). A
 * pour may slip (a dodge roll keeps it steady): only `keepBp` of the bucket goes in, and a big slip
 * can splash `splashBp` of it into a neighbouring barrel. A `steamElement` member pouring may steam a
 * little of a neighbour's water away. Score: the barrel's level in percent (ties share).
 */
export const FillParamsSchema = v.strictObject({
  ...COMMON,
  /** A member's speed with a full bucket at x1, in hundredths of a pixel per tick, and empty-handed. */
  runCpx: Int(1, 2_000),
  returnBp: Int(10_000, 30_000),
  /** Ticks to fill a bucket at the pond; each Support in the team takes `helpTicks` off (at least one left). */
  dipTicks: Int(1, 20),
  helpTicks: Int(0, 10),
  /** A full bucket at x1, in basis points of a barrel (10000 fills it). */
  bucketBp: Int(1, 5_000),
  /** Chance that a pour slips unless steadied (a base chance plus the dodge), and how much of it still goes in. */
  slipChanceBp: Bp,
  steadyBaseBp: Bp,
  keepBp: Bp,
  /** A slip splashes this share of the bucket into a neighbouring barrel, with this chance. */
  splashChanceBp: Bp,
  splashBp: Bp,
  /** A `steamElement` member's pour steams `steamBp` of a barrel off a neighbour, with this chance. */
  steamElement: ElementSchema,
  steamChanceBp: Bp,
  steamBp: Bp,
  /** Momentum or Riposte after a steady pour: the member's next trip goes this much faster. */
  burstBp: Int(0, 40_000),
});

/**
 * Stack (Crate Tower), team events only: every team stacks crates at its own spot in a fixed time.
 * One member climbs and places, one holds the base, one fetches; the team's tempo is its members'
 * mean climb (Speed, faster for a small creature) and its steadiness their mean hold (HP, the element
 * and role multipliers). A crate takes `placeCt` plus `perCrateCt` for every crate already up
 * (hundredths of a tick at x1). After each crate the tower may wobble (`wobbleBaseBp`, plus
 * `wobblePerCrateBp` for each crate over its safe height, `safeCrates` times the steadiness; less by
 * `rootBp` for each `rootElement` member); a failed steady roll topples the top crates, and a toppling
 * tower may knock a neighbour's top crate off. Score: the height at the end (crates); at the same
 * height, the tower that got there first.
 */
export const StackParamsSchema = v.strictObject({
  ...COMMON,
  /** Hundredths of a tick to place a crate at height 0, and more per crate already up (at x1). */
  placeCt: Int(100, 5_000),
  perCrateCt: Int(0, 2_000),
  /** The tallest a tower can get (the art shows this many). */
  maxCrates: Int(3, 12),
  /** A tower is safe up to this many crates at x1 steadiness (the team's HP, element and role, the mean). */
  safeCrates: Int(1, 12),
  /** Chance of a wobble after a crate: always, and more per crate over the safe height. */
  wobbleBaseBp: Bp,
  wobblePerCrateBp: Bp,
  /** A wobble's chance to hold before the base's steadiness (which multiplies it, x1 at the field's median). */
  steadyBaseBp: Bp,
  /** Each `rootElement` member cuts the wobble chance by this share (at most two). */
  rootElement: ElementSchema,
  rootBp: Bp,
  /** Crates a topple takes off the top (drawn from min to max). */
  toppleMin: Int(1, 6),
  toppleMax: Int(1, 6),
  /** A topple knocks a neighbour's top crate off with this chance. */
  knockChanceBp: Bp,
  /** Momentum or Riposte after a steady wobble: the next crate goes this much faster. */
  burstBp: Int(0, 40_000),
});

/**
 * Kite (Kite Flight), team events only: every team runs and flies one kite in a fixed time. Each tick
 * the kite climbs by the team's lift (its members' Speed against the field, with the element and role
 * multipliers: Spark brings wind) and sinks by `dragBp` of its height, so it settles where the lift
 * holds it. A gust may pull it down unless an anchor holds the line (a base chance, `anchorBp` for each
 * Guard or `anchorElement` member); lightning now and then strikes the highest kite of a team with a
 * `boltElement` member; two neighbouring kites close together may tangle on a failed dodge (both drop).
 * Score: the kite's height at the end (metres).
 */
export const KiteParamsSchema = v.strictObject({
  ...COMMON,
  /** Climb per tick at x1 and the share of the height lost per tick (hundredths of a px; basis points). */
  liftCpx: Int(1, 2_000),
  dragBp: Int(1, 5_000),
  /** The highest a kite can fly (px over its start). */
  maxHeightPx: Int(20, 90),
  /** Chance per tick a gust hits a team's kite, and how far it pulls it down (px). */
  gustChanceBp: Bp,
  gustDropPx: Int(0, 60),
  /** The anchor's chance to hold the line: a base, and `anchorBp` for each Guard or `anchorElement` member (at most two). */
  anchorBaseBp: Bp,
  anchorBp: Bp,
  anchorElement: ElementSchema,
  /** Chance per tick of lightning; it strikes the highest kite of a team with a `boltElement` member. */
  boltChanceBp: Bp,
  boltElement: ElementSchema,
  boltDropPx: Int(0, 60),
  /** Two neighbouring kites within `tangleRangePx` tangle with this chance per tick unless one dodges. */
  tangleChanceBp: Bp,
  tangleRangePx: Int(1, 40),
  tangleDropPx: Int(0, 60),
  /** Ticks a tangled or struck kite stops climbing. */
  stunTicks: Int(0, 20),
  /** Momentum or Riposte after a held gust: the kite climbs this much faster for two ticks. */
  burstBp: Int(0, 40_000),
});

const Base = {
  id: IdSchema,
  name: Text(32),
  scene: v.picklist(SCENE_IDS),
  /** 1: one creature per player. 3: a team of up to three creatures per player. */
  team: v.picklist([1, 3] as const),
  /** How a team's score is made from its members' (team events only): the best member's, or the sum. */
  teamScore: v.optional(v.picklist(['best', 'sum'] as const)),
  tickMs: Int(100, 2_000),
  maxTicks: Int(10, 400),
  /** Multiplier on the event's key number by element (tolerance, speed, grip). */
  elementBp: ElementTable,
  /** Multiplier on the same number by role; absent roles are x1. */
  roleBp: v.optional(
    v.partial(v.strictObject({ setter: Mult, payoff: Mult, support: Mult, guard: Mult })),
  ),
  /** Stage-1 creatures' bonus where the kind reads size (shove: grip). Absent: x1. */
  smallBp: v.optional(Mult),
  /** One short teaser sentence. */
  line: Text(120),
  favours: v.pipe(v.array(v.picklist(GAMES_FAVOURS)), v.minLength(1), v.maxLength(5)),
  /**
   * What each favour means in this event, one short line in the Games' voice (the favour icon's
   * popover): every favour has one, and only the favours do.
   */
  favourNotes: v.record(v.string(), Text(MAX_FAVOUR_NOTE)),
  /** Commentary templates that replace the kind's own for this event (a skin's own words). */
  say: v.optional(v.record(v.string(), Text(80))),
};

export const GamesEventDefSchema = v.variant('kind', [
  v.strictObject({ ...Base, kind: v.literal('endure'), params: EndureParamsSchema }),
  v.strictObject({ ...Base, kind: v.literal('chase'), params: ChaseParamsSchema }),
  v.strictObject({ ...Base, kind: v.literal('feast'), params: FeastParamsSchema }),
  v.strictObject({ ...Base, kind: v.literal('swim'), params: SwimParamsSchema }),
  v.strictObject({ ...Base, kind: v.literal('shove'), params: ShoveParamsSchema }),
  v.strictObject({ ...Base, kind: v.literal('haul'), params: HaulParamsSchema }),
  v.strictObject({ ...Base, kind: v.literal('fill'), params: FillParamsSchema }),
  v.strictObject({ ...Base, kind: v.literal('stack'), params: StackParamsSchema }),
  v.strictObject({ ...Base, kind: v.literal('kite'), params: KiteParamsSchema }),
]);
export type GamesEventDef = v.InferOutput<typeof GamesEventDefSchema>;
export type GamesEventOf<K extends GamesKind> = Extract<GamesEventDef, { kind: K }>;

export const GamesPackSchema = v.strictObject({
  events: v.pipe(v.array(GamesEventDefSchema), v.minLength(4), v.maxLength(60)),
  /** Commentary templates by key (`GAMES_SAY_KEYS`). */
  say: v.record(v.string(), Text(80)),
});
export interface GamesPack {
  events: readonly GamesEventDef[];
  say: Readonly<Record<string, string>>;
}

function fail(message: string): never {
  throw new Error(`Invalid games content: ${message}`);
}

function checkTemplate(where: string, key: string, text: string): void {
  for (const m of text.matchAll(SAY_PLACEHOLDER)) {
    if (!SAY_ARGS.has(m[1] ?? ''))
      fail(`${where}: "${key}" uses unknown placeholder {${m[1] ?? ''}}`);
  }
}

/** Every favour of an event has a note, and every note is for one of its favours. */
export function checkFavourNotes(e: Pick<GamesEventDef, 'id' | 'favours' | 'favourNotes'>): void {
  for (const f of e.favours) {
    if (!Object.hasOwn(e.favourNotes, f)) fail(`"${e.id}": favour "${f}" has no note`);
  }
  for (const key of Object.keys(e.favourNotes)) {
    if (!(e.favours as readonly string[]).includes(key)) {
      fail(`"${e.id}": a note for "${key}", which it does not favour`);
    }
  }
}

/**
 * Validates raw Games content (schema first, then cross-references) and returns it typed. Throws an
 * Error naming the first problem. Shipped content is checked at module load.
 */
export function loadGames(raw: unknown): GamesPack {
  const parsed = v.safeParse(GamesPackSchema, raw);
  if (!parsed.success) {
    const first = parsed.issues[0];
    const path = first?.path?.map((p) => String(p.key)).join('.') ?? '';
    throw new Error(`Invalid games schema at "${path}": ${first?.message ?? 'unknown error'}`);
  }
  const { events, say } = parsed.output;
  const allKeys = new Set<string>(Object.values(GAMES_SAY_KEYS).flat());
  for (const key of allKeys) {
    if (say[key] === undefined) fail(`no commentary template for "${key}"`);
  }
  for (const [key, text] of Object.entries(say)) {
    if (!allKeys.has(key)) fail(`commentary "${key}" is not a key the engine emits`);
    checkTemplate('say', key, text);
  }
  const ids = new Set<string>();
  for (const e of events) {
    if (ids.has(e.id)) fail(`duplicate id "${e.id}"`);
    ids.add(e.id);
    if (GAMES_SCENES[e.scene] !== e.kind)
      fail(`"${e.id}": scene "${e.scene}" is not a ${e.kind} scene`);
    if (e.team === 1 && e.teamScore !== undefined) fail(`"${e.id}": teamScore is for team events`);
    if (new Set(e.favours).size !== e.favours.length) fail(`"${e.id}" repeats a favour`);
    checkFavourNotes(e);
    const own = new Set<string>(GAMES_SAY_KEYS[e.kind]);
    for (const [key, text] of Object.entries(e.say ?? {})) {
      if (!own.has(key)) fail(`"${e.id}": commentary "${key}" is not a ${e.kind} key`);
      checkTemplate(e.id, key, text);
    }
    switch (e.kind) {
      case 'endure':
        if (e.params.ladleMinTicks > e.params.ladleMaxTicks)
          fail(`"${e.id}": ladleMinTicks > ladleMaxTicks`);
        if (e.params.shelterBp > e.params.shelterMaxBp) fail(`"${e.id}": shelterBp > shelterMaxBp`);
        break;
      case 'chase':
        if (e.params.stumbleMinTicks > e.params.stumbleMaxTicks) {
          fail(`"${e.id}": stumbleMinTicks > stumbleMaxTicks`);
        }
        break;
      case 'feast':
        if (e.params.mildWeight + e.params.hotWeight + e.params.ghostWeight < 1) {
          fail(`"${e.id}": the pepper weights add up to 0`);
        }
        break;
      case 'swim':
        if (e.params.sharkStart > e.params.sharkMax) fail(`"${e.id}": sharkStart > sharkMax`);
        break;
      case 'shove':
        if (e.params.floeMinPx > e.params.floeStartPx) fail(`"${e.id}": floeMinPx > floeStartPx`);
        if (e.params.slidePx > e.params.maxSlidePx) fail(`"${e.id}": slidePx > maxSlidePx`);
        break;
      case 'haul':
        if (e.team !== 3) fail(`"${e.id}": a haul is a team event`);
        if (e.params.dropMinTicks > e.params.dropMaxTicks) {
          fail(`"${e.id}": dropMinTicks > dropMaxTicks`);
        }
        break;
      case 'fill':
      case 'kite':
        if (e.team !== 3) fail(`"${e.id}": a ${e.kind} is a team event`);
        break;
      case 'stack':
        if (e.team !== 3) fail(`"${e.id}": a stack is a team event`);
        if (e.params.toppleMin > e.params.toppleMax) fail(`"${e.id}": toppleMin > toppleMax`);
        break;
    }
  }
  const kinds = new Set(events.map((e) => e.kind));
  if (kinds.size < 4) fail('the pool needs at least 4 kinds, so a day never repeats a kind');
  if (!events.some((e) => e.team === 3)) fail('the pool needs a team event');
  if (events.filter((e) => e.team === 1).length < 3) fail('the pool needs at least 3 solo events');
  return { events, say };
}

/** The template of a commentary key for an event: the event's own, else the kind's. */
export function gamesSayTemplate(
  pack: Pick<GamesPack, 'say'>,
  def: Pick<GamesEventDef, 'say'>,
  key: string,
): string | undefined {
  return def.say?.[key] ?? pack.say[key];
}

/** A template filled in: `{a}` and `{b}` by names, `{n}` by a number. Plain text in, plain text out. */
export function fillGamesSay(
  template: string,
  args: { a?: string; b?: string; n?: number },
): string {
  return template.replace(SAY_PLACEHOLDER, (whole, name: string) => {
    if (name === 'a') return args.a ?? whole;
    if (name === 'b') return args.b ?? whole;
    if (name === 'n') return args.n === undefined ? whole : String(args.n);
    return whole;
  });
}

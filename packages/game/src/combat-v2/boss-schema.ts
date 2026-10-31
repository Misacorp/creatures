/**
 * Schemas of the combat v2 boss-side content (`cards.json`, `raid-bosses.json`, `foes.json`, `keywords.json`), in the style of
 * `schema.ts`. The shapes of a pattern, a move, a Build-up and a card operation are the engine's (`Pattern`, `BossMove`,
 * `Escalation`, `CardOp` in `packages/engine/src/v2/`): the game cannot import the engine, so each side has its own copy and a
 * type test in the engine (`packages/engine/test/v2-content-types.test.ts`) fails the typecheck when they drift.
 *
 * ## Rule cards (`cards.json`)
 *
 * A card is a list of operations (`ops`) that the engine's `applyCard` runs on a boss at a strength (basis points of the full
 * card: Boss Rank sets it, 10000 is full). A number a card adds or sets is its share at the strength, so a weaker card changes
 * less: a card *asks* for a tool at low strength and *requires* it at high strength (Misa, 2026-10-29). The operations and what
 * each does are documented on `CardOp` in the engine. Each card also has its `asks` (the question it puts to the team; text a
 * player may read) and its `answers`: the Knack families or the talent ids that answer it, so the board only points at tools
 * that work (P-08, P-13). The raid-only cards (`raidOnly`) mean nothing in one fight: the controlled tests and the lab page
 * leave them out.
 *
 * Breakwater's ward: a ward cuts (1 + the card's share of 20000 bp) times as much of the boss's sweeps, x3 at full strength and
 * less at a lower one. Wards cover a whole row whoever owns them, so a prepared player shelters the others; a party with no ward
 * gains nothing. Stone Skin: a weaker card caps higher (at half strength the cap is double) and at 0 there is none. Slippery is a
 * flat dodge that Mired does not lower, so only a hit that cannot be dodged (Clear Skies) gets past it for certain. Lucky Strike is
 * a crit chance on every damaging hit that lands: each crit doubles the hit before cuts and armour (R7.1).
 *
 * ## Raid bosses (`raid-bosses.json`) and foes (`foes.json`)
 *
 * The part of a boss that is not the shipped content's (name, element, base Speed and rounds come from `content.bosses` and
 * `dungeonContent.foes`, so they cannot drift): an arena, an armour, a plain attack, moves, rule cards (by id), a Build-up
 * and, for the report, what the boss asks. A raid boss's numbers are the high rank's; `ranks` gives the lower ranks' HP and
 * Attack (bp of the high rank's) and, optionally, armour. A foe's HP and Attack come from the dungeon's own numbers, scaled by
 * `scale` and the depth `curve`; `hpBp` and `atkBp` tune one foe that asks a hard question. `note` is the content intent that
 * the lab's long tuning history does not say (never shown to players).
 */
import * as v from 'valibot';
import { IdSchema } from '../content/schema';

const Name = v.pipe(v.string(), v.minLength(1), v.maxLength(40));
const Text = v.pipe(v.string(), v.minLength(1), v.maxLength(400));
const Int = v.pipe(v.number(), v.integer());
const Count = v.pipe(Int, v.minValue(1));

/** Where the boss aims: the engine's `Pattern`. */
export const PatternSchema = v.pipe(
  v.strictObject({
    anchor: v.picklist(['front', 'strongest', 'payoff', 'random', 'grudge', 'back', 'weakest']),
    shape: v.picklist([
      'single',
      'line3',
      'row',
      'column',
      'rowEnds',
      'randomRow',
      'all',
      'scatter',
      'chain',
      'columns',
      'rows',
      'cross',
      'checker',
    ]),
    n: v.exactOptional(Count),
    perColumns: v.exactOptional(Count),
    decayBp: v.exactOptional(Int),
    anchors: v.exactOptional(Count),
  }),
  v.readonly(),
);
export type PatternDef = v.InferOutput<typeof PatternSchema>;

/** A boss move: the engine's `BossMove`. */
export const BossMoveSchema = v.pipe(
  v.strictObject({
    id: IdSchema,
    name: Name,
    pattern: PatternSchema,
    powerBp: v.pipe(Int, v.minValue(0)),
    every: Count,
    turn: v.exactOptional(v.pipe(Int, v.minValue(0))),
    silenceTurns: v.exactOptional(Count),
    strengthBp: v.exactOptional(v.pipe(Int, v.minValue(0))),
    oneShotBp: v.exactOptional(Count),
    charged: v.exactOptional(v.boolean()),
  }),
  v.readonly(),
);
export type BossMoveDef = v.InferOutput<typeof BossMoveSchema>;

/** The plain attack: the engine's `BossDef['plain']`. */
export const PlainSchema = v.pipe(
  v.strictObject({
    pattern: PatternSchema,
    powerBp: v.pipe(Int, v.minValue(0)),
    hits: v.exactOptional(Count),
  }),
  v.readonly(),
);
export type PlainDef = v.InferOutput<typeof PlainSchema>;

/** What each Build-up step adds to the boss: the engine's `EscalationGrowth`. */
export const GrowthSchema = v.pipe(
  v.strictObject({
    atkBp: v.exactOptional(Int),
    dodgeBp: v.exactOptional(Int),
    armour: v.exactOptional(Int),
    hits: v.exactOptional(Int),
    jumps: v.exactOptional(Int),
    targets: v.exactOptional(Int),
    area: v.exactOptional(Int),
  }),
  v.readonly(),
);

/** The boss's Build-up, with its optional phase: the engine's `Escalation`. */
export const EscalationSchema = v.pipe(
  v.strictObject({
    name: Name,
    feed: v.picklist(['reactions', 'hpLost', 'rounds', 'crits', 'dodges', 'knockouts', 'shed']),
    per: Count,
    perColumns: v.exactOptional(Count),
    cap: Count,
    grow: GrowthSchema,
    strengthBp: v.exactOptional(v.pipe(Int, v.minValue(0))),
    phase: v.exactOptional(
      v.pipe(
        v.strictObject({
          atStep: Count,
          name: Name,
          moves: v.pipe(v.array(BossMoveSchema), v.readonly()),
        }),
        v.readonly(),
      ),
    ),
  }),
  v.readonly(),
);
export type EscalationDef = v.InferOutput<typeof EscalationSchema>;

/** One operation of a rule card: the engine's `CardOp`. */
export const CardOpSchema = v.union([
  v.pipe(
    v.strictObject({
      op: v.literal('add'),
      stat: v.picklist(['armour', 'spd']),
      value: Int,
    }),
    v.readonly(),
  ),
  v.pipe(
    v.strictObject({
      op: v.literal('set'),
      stat: v.picklist(['dodgeBp', 'critChanceBp']),
      value: Int,
    }),
    v.readonly(),
  ),
  v.pipe(v.strictObject({ op: v.literal('raise'), stat: v.literal('atk'), bp: Int }), v.readonly()),
  v.pipe(
    v.strictObject({
      op: v.literal('flag'),
      mod: v.picklist(['shedMarks', 'reflectFirst', 'fizzle', 'adapts', 'adaptsElement']),
    }),
    v.readonly(),
  ),
  v.pipe(
    v.strictObject({
      op: v.literal('mod'),
      mod: v.picklist(['shakeEvery', 'wardBp', 'healBp']),
      base: Int,
      plus: v.exactOptional(Int),
      minus: v.exactOptional(Int),
    }),
    v.readonly(),
  ),
  v.pipe(v.strictObject({ op: v.literal('cap'), value: Count }), v.readonly()),
  v.pipe(
    v.strictObject({
      op: v.literal('move'),
      move: BossMoveSchema,
      scale: v.picklist(['power', 'gate']),
    }),
    v.readonly(),
  ),
  v.pipe(
    v.strictObject({ op: v.literal('plain'), aim: PatternSchema, raiseBp: Int }),
    v.readonly(),
  ),
  v.pipe(
    v.strictObject({
      op: v.literal('plain'),
      replace: v.pipe(
        v.strictObject({ pattern: PatternSchema, powerBp: v.pipe(Int, v.minValue(0)) }),
        v.readonly(),
      ),
      hits: Count,
    }),
    v.readonly(),
  ),
]);
export type CardOpDef = v.InferOutput<typeof CardOpSchema>;

export const CardSchema = v.pipe(
  v.strictObject({
    id: IdSchema,
    name: Name,
    /** The question it puts to the team. */
    asks: Text,
    /** Only a raid weekend means anything to it. */
    raidOnly: v.exactOptional(v.boolean()),
    ops: v.pipe(v.array(CardOpSchema), v.readonly()),
    /** The Knack families (by name) or talents (by id) that answer it. */
    answers: v.pipe(v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(40))), v.readonly()),
  }),
  v.readonly(),
);
export type CardDef = v.InferOutput<typeof CardSchema>;
export const CardFileSchema = v.array(CardSchema);

/** A lower rank's share of a raid boss's numbers, bp of the high rank's. */
const RankSchema = v.pipe(
  v.strictObject({
    hpBp: Count,
    atkBp: Count,
    /** Replaces the card's share of the armour (half the armour is the hide, the other half the card at the rank's strength). */
    armourBp: v.exactOptional(Count),
  }),
  v.readonly(),
);

export const RaidBossSchema = v.pipe(
  v.strictObject({
    /** A shipped raid boss (`content.bosses`). */
    id: IdSchema,
    rows: Count,
    armour: v.pipe(Int, v.minValue(0)),
    atk: Count,
    /** The weekend's shared HP, at the high rank. */
    hp: Count,
    plain: PlainSchema,
    moves: v.pipe(v.array(BossMoveSchema), v.readonly()),
    /** Rule cards by id, in order. */
    cards: v.pipe(v.array(IdSchema), v.readonly()),
    escalation: v.exactOptional(EscalationSchema),
    ranks: v.exactOptional(
      v.pipe(v.strictObject({ low: RankSchema, mid: RankSchema }), v.readonly()),
    ),
    /** One line for the report: what the boss asks. */
    asks: Text,
    note: v.exactOptional(Text),
  }),
  v.readonly(),
);
export type RaidBossDef = v.InferOutput<typeof RaidBossSchema>;
export const RaidBossFileSchema = v.array(RaidBossSchema);

export const FoeSchema = v.pipe(
  v.strictObject({
    /** A shipped dungeon foe (`dungeonContent.foes`). */
    id: IdSchema,
    armour: v.pipe(Int, v.minValue(0)),
    plain: PlainSchema,
    moves: v.pipe(v.array(BossMoveSchema), v.readonly()),
    /** A floor boss's landmark move: only at a landmark depth, announced at round start. */
    signature: v.exactOptional(BossMoveSchema),
    cards: v.pipe(v.array(IdSchema), v.readonly()),
    escalation: v.exactOptional(EscalationSchema),
    /** The question the foe asks the team (for the report). */
    asks: Text,
    /** A foe that asks a hard question is tuned on its own: HP and Attack in bp of the scaled numbers (10000 is unchanged). */
    hpBp: v.exactOptional(Count),
    atkBp: v.exactOptional(Count),
    /**
     * Set when the classic line fails the foe unless it answers the question: `guard` (a team with no Guard loses a hitter),
     * `ward` (a team with no silence ward loses its Setter and Guard) or `pierce` (a team with nothing to get past its bark makes no dent).
     */
    needs: v.exactOptional(v.picklist(['guard', 'ward', 'pierce'])),
    note: v.exactOptional(Text),
  }),
  v.readonly(),
);
export type FoeDef = v.InferOutput<typeof FoeSchema>;

export const FoeFileSchema = v.strictObject({
  /** The lab scale of a foe's content numbers (bp): the content's HP and Attack were made for the shipped engine. */
  scale: v.strictObject({ hpBp: Count, atkBp: Count }),
  /** The depth curve, in the shape of the dungeon's (`depthFactorBp`: 10000 plus a step per depth above 1 plus a curve per square of them). */
  curve: v.strictObject({
    hpStepBp: v.pipe(Int, v.minValue(0)),
    hpCurveBp: v.pipe(Int, v.minValue(0)),
    atkStepBp: v.pipe(Int, v.minValue(0)),
    atkCurveBp: v.pipe(Int, v.minValue(0)),
  }),
  foes: v.array(FoeSchema),
});
export type FoeScale = v.InferOutput<typeof FoeFileSchema>['scale'];
export type FoeCurve = v.InferOutput<typeof FoeFileSchema>['curve'];

/** A keyword a text may use in braces, `{Taunt}`: what it means, what it does not, and the rules step it comes from. */
export const KeywordSchema = v.pipe(
  v.strictObject({
    name: Name,
    means: v.pipe(v.string(), v.minLength(1), v.maxLength(600)),
    not: Text,
    step: Name,
  }),
  v.readonly(),
);
export type KeywordDef = v.InferOutput<typeof KeywordSchema>;
export const KeywordFileSchema = v.array(KeywordSchema);

/**
 * Schemas of the combat v2 boss-side content (`cards.json`, `raid-bosses.json`, `foes.json`, `keywords.json`), in the style of
 * `schema.ts`. The shapes of a pattern, a move, an escalation and a card operation are the engine's (`Pattern`, `BossMove`,
 * `Escalation`, `CardOp` in `packages/engine/src/v2/`): the game cannot import the engine, so each side has its own copy and a
 * type test in the engine (`packages/engine/test/v2-content-types.test.ts`) fails the typecheck when they drift.
 *
 * ## Moves
 *
 * The files do not hold a move as the engine takes it. A move is a library move (`moves.json`, `moves.ts`: name, shape, anchor,
 * silences) and a boss, foe or card holds a *use* of it: the move's id and its own numbers (`MoveUseSchema`). The loader (`load.ts`)
 * builds the engine's `BossMove` from the pair, so the types below (`BossMoveDef`, `EscalationDef`, `CardOpDef`, `CardDef`,
 * `RaidBossDef`, `FoeDef`) are the resolved ones the pack holds and the engine takes, and the `...FileSchema`s are what the files hold.
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
 * flat dodge that Mired does not lower, so only a hit that cannot be dodged (Clear Skies) gets past it for certain. Double Strike is
 * a crit chance on every damaging hit that lands: each crit doubles the hit before cuts and armour (R7.1).
 *
 * ## Raid bosses (`raid-bosses.json`) and foes (`foes.json`)
 *
 * The part of a boss that is not the shipped content's (name, element, base Speed and rounds come from `content.bosses` and
 * `dungeonContent.foes`, so they cannot drift): an arena, an armour, a plain attack, moves, rule cards (by id), an escalation
 * and, for the report, what the boss asks. A raid boss's numbers are the high rank's; `ranks` gives the lower ranks' HP and
 * Attack (bp of the high rank's) and, optionally, armour. A foe's HP and Attack come from the dungeon's own numbers, scaled by
 * `scale` and the depth `curve`; `hpBp` and `atkBp` tune one foe that asks a hard question. `note` is the content intent that
 * the lab's long tuning history does not say (never shown to players).
 */
import * as v from 'valibot';
import { IdSchema } from '../content/schema';
import { MOVE_ANCHORS, MOVE_SHAPES } from './moves';

const Name = v.pipe(v.string(), v.minLength(1), v.maxLength(40));
const Text = v.pipe(v.string(), v.minLength(1), v.maxLength(400));
const Int = v.pipe(v.number(), v.integer());
const Count = v.pipe(Int, v.minValue(1));

/** Where the boss aims: the engine's `Pattern`. */
export const PatternSchema = v.pipe(
  v.strictObject({
    anchor: v.picklist(MOVE_ANCHORS),
    shape: v.picklist(MOVE_SHAPES),
    n: v.exactOptional(Count),
    perColumns: v.exactOptional(Count),
    decayBp: v.exactOptional(Int),
    anchors: v.exactOptional(Count),
  }),
  v.readonly(),
);
export type PatternDef = v.InferOutput<typeof PatternSchema>;

/**
 * A boss move as the engine takes it: the engine's `BossMove`. The files never hold one: a file's move is a `MoveUseSchema` (a
 * library move by id, with the boss's own numbers) and the loader builds this from it, with the name and the pattern's shape and
 * anchor from the library.
 */
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

/**
 * A boss's, foe's or card's use of a library move: the move's id (`moves.json`) and the numbers that belong to the user, never the
 * name, the shape or the anchor (the library's, so a usage cannot change what a move is). `n`, `perColumns`, `decayBp` and `anchors` are
 * the pattern's counts (`Pattern`); `windUp` is the engine's `charged`.
 */
export const MoveUseSchema = v.pipe(
  v.strictObject({
    /** A move of the library. */
    id: IdSchema,
    every: Count,
    turn: v.exactOptional(v.pipe(Int, v.minValue(0))),
    powerBp: v.pipe(Int, v.minValue(0)),
    n: v.exactOptional(Count),
    perColumns: v.exactOptional(Count),
    decayBp: v.exactOptional(Int),
    anchors: v.exactOptional(Count),
    windUp: v.exactOptional(v.boolean()),
    silenceTurns: v.exactOptional(Count),
    strengthBp: v.exactOptional(v.pipe(Int, v.minValue(0))),
    oneShotBp: v.exactOptional(Count),
  }),
  v.readonly(),
);
export type MoveUseDef = v.InferOutput<typeof MoveUseSchema>;

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

/** What each escalation step adds to the boss: the engine's `EscalationGrowth`. */
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

/**
 * The boss's escalation, with its optional phase: the engine's `Escalation`. A file holds the phase's moves as uses of library moves
 * (`MoveUseSchema`), the pack as the engine's `BossMove`s (`EscalationDef`). A phase move with the id of one of the boss's own moves
 * REPLACES it once the phase begins (Second Bloom's stronger Thorn Rain); any other is added.
 */
const escalationOf = <M extends v.GenericSchema>(move: M) =>
  v.pipe(
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
            moves: v.pipe(v.array(move), v.readonly()),
          }),
          v.readonly(),
        ),
      ),
    }),
    v.readonly(),
  );
/** As a file holds it. */
export const EscalationUseSchema = escalationOf(MoveUseSchema);
export type EscalationUseDef = v.InferOutput<typeof EscalationUseSchema>;
/** As the engine takes it. */
export type EscalationDef = v.InferOutput<ReturnType<typeof escalationOf<typeof BossMoveSchema>>>;

/** One operation of a rule card: the engine's `CardOp`. A file's `move` operation is a use of a library move. */
const cardOpOf = <M extends v.GenericSchema>(move: M) =>
  v.union([
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
    v.pipe(
      v.strictObject({ op: v.literal('raise'), stat: v.literal('atk'), bp: Int }),
      v.readonly(),
    ),
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
        move,
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
export type CardOpDef = v.InferOutput<ReturnType<typeof cardOpOf<typeof BossMoveSchema>>>;

const cardOf = <M extends v.GenericSchema>(move: M) =>
  v.pipe(
    v.strictObject({
      id: IdSchema,
      name: Name,
      /** The question it puts to the team. */
      asks: Text,
      /** Only a raid weekend means anything to it. */
      raidOnly: v.exactOptional(v.boolean()),
      ops: v.pipe(v.array(cardOpOf(move)), v.readonly()),
      /** The Knack families (by name) or talents (by id) that answer it. */
      answers: v.pipe(v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(40))), v.readonly()),
    }),
    v.readonly(),
  );
export type CardDef = v.InferOutput<ReturnType<typeof cardOf<typeof BossMoveSchema>>>;
/** `cards.json` as the file holds it: a card's move is a use of a library move. */
export const CardFileSchema = v.array(cardOf(MoveUseSchema));
export type CardUseDef = v.InferOutput<typeof CardFileSchema>[number];

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

/** The arena piece of one player: `rows` seats in one column (the only shape the engine plays yet). */
export const PieceSchema = v.pipe(v.strictObject({ rows: Count }), v.readonly());
export type PieceDef = v.InferOutput<typeof PieceSchema>;

const raidBossOf = <M extends v.GenericSchema>(move: M) =>
  v.pipe(
    v.strictObject({
      /** A shipped raid boss (`content.bosses`). */
      id: IdSchema,
      rows: Count,
      /**
       * The arena piece one player adds: the shape the board repeats once per player (and one spare) until stage 1 (Misa, 2026-11-03).
       * Today a piece is one full column of the boss's rows, `{ rows }` with `rows` equal to the boss's; the loader refuses any other
       * shape until the engine can play it. A later shape (a seat mask) is another key here, with engine support first.
       */
      piece: PieceSchema,
      armour: v.pipe(Int, v.minValue(0)),
      atk: Count,
      /** The weekend's shared HP, at the high rank. */
      hp: Count,
      plain: PlainSchema,
      moves: v.pipe(v.array(move), v.readonly()),
      /** Rule cards by id, in order. */
      cards: v.pipe(v.array(IdSchema), v.readonly()),
      escalation: v.exactOptional(escalationOf(move)),
      ranks: v.exactOptional(
        v.pipe(v.strictObject({ low: RankSchema, mid: RankSchema }), v.readonly()),
      ),
      /** One line for the report: what the boss asks. */
      asks: Text,
      note: v.exactOptional(Text),
    }),
    v.readonly(),
  );
export type RaidBossDef = v.InferOutput<ReturnType<typeof raidBossOf<typeof BossMoveSchema>>>;
/** `raid-bosses.json` as the file holds it: moves are uses of library moves. */
export const RaidBossFileSchema = v.array(raidBossOf(MoveUseSchema));
export type RaidBossUseDef = v.InferOutput<typeof RaidBossFileSchema>[number];

const foeOf = <M extends v.GenericSchema>(move: M) =>
  v.pipe(
    v.strictObject({
      /** A shipped dungeon foe (`dungeonContent.foes`). */
      id: IdSchema,
      armour: v.pipe(Int, v.minValue(0)),
      plain: PlainSchema,
      moves: v.pipe(v.array(move), v.readonly()),
      /** A floor boss's landmark move: only at a landmark depth, announced at round start. */
      signature: v.exactOptional(move),
      cards: v.pipe(v.array(IdSchema), v.readonly()),
      escalation: v.exactOptional(escalationOf(move)),
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
export type FoeDef = v.InferOutput<ReturnType<typeof foeOf<typeof BossMoveSchema>>>;

/** The lab scale of a foe's content numbers (bp): the content's HP and Attack were made for the shipped engine. */
const FoeScaleSchema = v.strictObject({ hpBp: Count, atkBp: Count });
/** The depth curve, in the shape of the dungeon's (`depthFactorBp`: 10000 plus a step per depth above 1 plus a curve per square of them). */
const FoeCurveSchema = v.strictObject({
  hpStepBp: v.pipe(Int, v.minValue(0)),
  hpCurveBp: v.pipe(Int, v.minValue(0)),
  atkStepBp: v.pipe(Int, v.minValue(0)),
  atkCurveBp: v.pipe(Int, v.minValue(0)),
});
/** `foes.json` as the file holds it: moves are uses of library moves. */
export const FoeFileSchema = v.strictObject({
  scale: FoeScaleSchema,
  curve: FoeCurveSchema,
  foes: v.array(foeOf(MoveUseSchema)),
});
export type FoeUseDef = v.InferOutput<typeof FoeFileSchema>['foes'][number];
export type FoeScale = v.InferOutput<typeof FoeScaleSchema>;
export type FoeCurve = v.InferOutput<typeof FoeCurveSchema>;

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

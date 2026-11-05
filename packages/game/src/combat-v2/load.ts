/**
 * Loads and checks the combat v2 content (docs/design/combat/content-as-data.md, section 3): each file against its
 * schema, then the cross-references. Every failure throws `Invalid combat v2 content: ...` and names the entry.
 */
import * as v from 'valibot';
import {
  CardFileSchema,
  FoeFileSchema,
  KeywordFileSchema,
  RaidBossFileSchema,
  type BossMoveDef,
  type CardDef,
  type EscalationDef,
  type EscalationUseDef,
  type FoeCurve,
  type FoeDef,
  type FoeScale,
  type KeywordDef,
  type MoveUseDef,
  type PatternDef,
  type RaidBossDef,
} from './boss-schema';
import { MoveFileSchema, moveLabel, type MoveDef } from './moves';
import { ADDITIVE_FIELDS } from './fx-schema';
import { RaidTrackSchema, type RaidTrackDef } from './track-schema';
import { RulesSchema, type CombatRules } from './rules-schema';
import {
  FormFileSchema,
  KnackFileSchema,
  POOL_SIZE,
  TalentFileSchema,
  type FormDef,
  type KnackDef,
  type TalentDef,
} from './schema';

/** The raw files, as read from `data/*.json`. */
export interface RawCombatV2 {
  readonly rules: unknown;
  readonly moves: unknown;
  readonly knacks: unknown;
  readonly forms: unknown;
  readonly talents: unknown;
  readonly cards: unknown;
  readonly raidBosses: unknown;
  readonly raidTrack: unknown;
  readonly foes: unknown;
  readonly keywords: unknown;
}

/**
 * The shipped raid bosses and dungeon foes (ids and elements), which the boss-side files must name. A boss or foe uses only the
 * library moves of its own element.
 */
export interface CombatShippedRefs {
  readonly bosses: readonly { readonly id: string; readonly element: string }[];
  readonly foes: readonly { readonly id: string; readonly element: string }[];
  /** The shipped gear lines (ids), which a talent's `gearLine` must name. */
  readonly gearLines: readonly { readonly id: string }[];
}

/** A shipped species, as far as the checks need it. */
export interface CombatSpeciesRef {
  readonly id: string;
  readonly line: string;
}

/**
 * The loaded combat v2 content. The maps keep the order of the files (searches iterate them in order), and
 * the ids are never integer-like, so the order of the keys is the order of the entries.
 */
export interface CombatV2Pack {
  readonly rules: CombatRules;
  /** The move library by id, in the order of the file: each move's name and behaviour (`moves.json`). */
  readonly moves: Readonly<Record<string, MoveDef>>;
  /** Knack family name to its rule. */
  readonly families: Readonly<Record<string, string>>;
  readonly knacks: Readonly<Record<string, KnackDef>>;
  /** By form id: armour, own Knacks and stat changes. */
  readonly forms: Readonly<Record<string, FormDef>>;
  readonly talents: Readonly<Record<string, TalentDef>>;
  /** Line id to its pool: talent ids. */
  readonly pools: Readonly<Record<string, readonly string[]>>;
  /** Rule cards by id, in the order of the file (a card's move is resolved: the engine's `BossMove`). */
  readonly cards: Readonly<Record<string, CardDef>>;
  /** Keywords by name, in the order of the file. */
  readonly keywords: Readonly<Record<string, KeywordDef>>;
  /** Raid bosses by id (the high rank's numbers). */
  readonly raidBosses: Readonly<Record<string, RaidBossDef>>;
  /** The raid boss track: the order of the bosses and, per slot, the numbers and rules of the meeting. */
  readonly raidTrack: RaidTrackDef;
  /** The lab scale of a foe's content numbers and the depth curve of its HP and Attack. */
  readonly foeScale: FoeScale;
  readonly foeCurve: FoeCurve;
  /** The same two for the Undercroft's foes: their own scale and their own depth curve. */
  readonly foeUndercroft: { readonly scale: FoeScale; readonly curve: FoeCurve };
  /** Dungeon foes by id. */
  readonly foes: Readonly<Record<string, FoeDef>>;
}

function fail(message: string): never {
  throw new Error(`Invalid combat v2 content: ${message}`);
}

function parse<S extends v.GenericSchema>(schema: S, raw: unknown, file: string): v.InferOutput<S> {
  const parsed = v.safeParse(schema, raw);
  if (parsed.success) return parsed.output;
  const first = parsed.issues[0];
  const path = first?.path?.map((p) => String(p.key)).join('.') ?? '';
  return fail(`${file} at "${path}": ${first?.message ?? 'unknown error'}`);
}

const ADDITIVE: ReadonlySet<string> = new Set(ADDITIVE_FIELDS);

/** The rounds of a raid stage: the horizon of "at most two damaging moves share a boss turn". */
const STAGE_ROUNDS = 8;

/** The keywords a text uses, `{Like} {This}`. */
const keywordsIn = (text: string): string[] =>
  [...text.matchAll(/\{([^}]+)\}/g)].map((m) => m[1] ?? '');

/** The damaging moves due on one boss turn of one round (a silence and the plain attack are not). */
function damagingDue(moves: readonly BossMoveDef[], rows: number, round: number, turn: number) {
  return moves.filter(
    (m) =>
      m.powerBp > 0 &&
      m.silenceTurns === undefined &&
      round % m.every === 0 &&
      (m.turn ?? rows - 1) === turn,
  ).length;
}

/**
 * The boss's moves once its phase has begun: a phase move with the id of one of its own moves replaces that move (in its place),
 * any other is added at the end. The engine does the same (`withPhase`, `packages/engine/src/v2/escalation.ts`).
 */
function withPhase(base: readonly BossMoveDef[], phase: readonly BossMoveDef[]): BossMoveDef[] {
  const replaced = base.map((m) => phase.find((p) => p.id === m.id) ?? m);
  return [...replaced, ...phase.filter((p) => !base.some((m) => m.id === p.id))];
}

/** The plain label of the behaviour of a resolved move (`moveLabel`). */
const behaviourOf = (m: BossMoveDef): string =>
  moveLabel({
    shape: m.pattern.shape,
    anchor: m.pattern.anchor,
    silences: m.silenceTurns !== undefined,
    oneShot: m.oneShotBp !== undefined,
  });

/** The moves the cards add (`move` operations), in the order of the cards. */
const cardMovesOf = (
  cards: readonly string[],
  known: Readonly<Record<string, CardDef>>,
): BossMoveDef[] =>
  cards.flatMap((c) =>
    (Object.hasOwn(known, c) ? (known[c]?.ops ?? []) : []).flatMap((o) =>
      o.op === 'move' ? [o.move] : [],
    ),
  );

/**
 * One behaviour once: a boss or foe never has two moves with the same label, before its phase or after it (a phase move that
 * replaces an own move leaves one), counting the moves its cards add (a Hush card on a boss that has its own Hush). Merge two such
 * moves into one and let the numbers, or the phase, carry the difference. With one name per behaviour and element in the library
 * (checked on load), the only way to get two is a card's element-less move beside an element's own.
 */
function checkOneBehaviour(
  owner: string,
  base: readonly BossMoveDef[],
  phase: readonly BossMoveDef[],
  cardMoves: readonly BossMoveDef[],
): void {
  for (const state of [base, withPhase(base, phase)]) {
    const byLabel = new Map<string, string>();
    for (const m of [...state, ...cardMoves]) {
      const label = behaviourOf(m);
      const other = byLabel.get(label);
      if (other !== undefined)
        fail(`${owner} has two ${label} moves, "${other}" and "${m.id}": merge them into one`);
      byLabel.set(label, m.id);
    }
  }
}

/**
 * The checks both kinds of boss share: unique move ids (a phase move may repeat the id of an own move: it replaces it), moves on a
 * real boss turn, known cards, one behaviour once. `base` is the boss's own moves (a foe's signature with them), `phase` the
 * escalation's phase moves.
 */
function checkBoss(
  kind: string,
  id: string,
  rows: number,
  base: readonly BossMoveDef[],
  phase: readonly BossMoveDef[],
  cards: readonly string[],
  known: Readonly<Record<string, CardDef>>,
): void {
  for (const moves of [base, phase]) {
    const ids = new Set<string>();
    for (const m of moves) {
      if (ids.has(m.id)) fail(`${kind} "${id}" has two moves "${m.id}"`);
      ids.add(m.id);
    }
  }
  for (const m of [...base, ...phase]) {
    if ((m.turn ?? rows - 1) >= rows)
      fail(
        `${kind} "${id}": move "${m.id}" is on boss turn ${String(m.turn)}, past its ${String(rows)} rows`,
      );
  }
  for (const c of cards) {
    if (!Object.hasOwn(known, c)) fail(`${kind} "${id}" names the unknown card "${c}"`);
  }
  checkOneBehaviour(`${kind} "${id}"`, base, phase, cardMovesOf(cards, known));
}

/**
 * The engine's `BossMove` of a use of a library move: the name and the pattern's shape and anchor are the library's, the numbers
 * the user's. `element` is the user's (a boss's or foe's; `undefined` for a card): it may use only the moves of its element.
 */
function resolveMove(
  use: MoveUseDef,
  library: Readonly<Record<string, MoveDef>>,
  owner: string,
  element: string | undefined,
): BossMoveDef {
  const lib = Object.hasOwn(library, use.id) ? library[use.id] : undefined;
  if (lib === undefined) return fail(`${owner} uses "${use.id}", which is not in the move library`);
  if (lib.element !== element)
    return fail(
      element === undefined
        ? `${owner} adds "${use.id}", a ${String(lib.element)} move: a card adds only moves with no element`
        : `${owner} (${element}) uses "${use.id}", which is ${lib.element === undefined ? 'a card move' : `a ${lib.element} move`}: it uses only moves of its own element`,
    );
  if (lib.silences && use.silenceTurns === undefined)
    return fail(`${owner}: "${use.id}" silences, so its use needs silenceTurns`);
  if (!lib.silences && use.silenceTurns !== undefined)
    return fail(`${owner}: "${use.id}" does not silence, so its use has no silenceTurns`);
  if (lib.oneShot === true && use.oneShotBp === undefined)
    return fail(`${owner}: "${use.id}" is a one-shot, so its use needs oneShotBp`);
  if (lib.oneShot !== true && use.oneShotBp !== undefined)
    return fail(`${owner}: "${use.id}" is not a one-shot, so its use has no oneShotBp`);
  const pattern: PatternDef = {
    anchor: lib.anchor,
    shape: lib.shape,
    ...(use.n === undefined ? {} : { n: use.n }),
    ...(use.perColumns === undefined ? {} : { perColumns: use.perColumns }),
    ...(use.decayBp === undefined ? {} : { decayBp: use.decayBp }),
    ...(use.anchors === undefined ? {} : { anchors: use.anchors }),
  };
  return {
    id: lib.id,
    name: lib.name,
    pattern,
    powerBp: use.powerBp,
    every: use.every,
    ...(use.turn === undefined ? {} : { turn: use.turn }),
    ...(use.silenceTurns === undefined ? {} : { silenceTurns: use.silenceTurns }),
    ...(use.strengthBp === undefined ? {} : { strengthBp: use.strengthBp }),
    ...(use.oneShotBp === undefined ? {} : { oneShotBp: use.oneShotBp }),
    ...(use.windUp === undefined ? {} : { charged: use.windUp }),
  };
}

/** An escalation of a file with its phase's moves resolved. */
function resolveEscalation(
  e: EscalationUseDef,
  resolve: (use: MoveUseDef) => BossMoveDef,
): EscalationDef {
  const { phase, ...rest } = e;
  return phase === undefined
    ? rest
    : { ...rest, phase: { ...phase, moves: phase.moves.map(resolve) } };
}

/**
 * Validates the raw files and returns the typed pack. Throws an Error naming the first problem. Checks: every
 * Knack's family exists; every form is a shipped form and every shipped form has an entry with at least one own
 * Knack; every Knack a form names exists and every Knack is on at least one form; ids are unique; every talent
 * in a pool exists, each pool holds seven talents and each pool is a shipped line's; a talent's `gearLine` is a shipped gear line; a talent's effects use only
 * the additive fields and never Seal; every rules field is present (the schema). The raid track: every boss is a raid boss, slot n
 * is `order[(n - 1) % order.length]`, slots run 1, 2, 3 ... with no gaps, a slot has no more cards than its boss, its extra cards exist
 * and are not the boss's own, strength is 0 to 10000.
 */
export function loadCombatV2(
  raw: RawCombatV2,
  species: readonly CombatSpeciesRef[],
  shipped: CombatShippedRefs,
): CombatV2Pack {
  const rules = parse(RulesSchema, raw.rules, 'rules.json');
  const knackFile = parse(KnackFileSchema, raw.knacks, 'knacks.json');
  const formFile = parse(FormFileSchema, raw.forms, 'forms.json');
  const talentFile = parse(TalentFileSchema, raw.talents, 'talents.json');
  const moveFile = parse(MoveFileSchema, raw.moves, 'moves.json');
  const cardFile = parse(CardFileSchema, raw.cards, 'cards.json');
  const raidFile = parse(RaidBossFileSchema, raw.raidBosses, 'raid-bosses.json');
  const trackFile = parse(RaidTrackSchema, raw.raidTrack, 'raid-track.json');
  const foeFile = parse(FoeFileSchema, raw.foes, 'foes.json');
  const keywordFile = parse(KeywordFileSchema, raw.keywords, 'keywords.json');

  const families: Record<string, string> = {};
  for (const f of knackFile.families) {
    if (Object.hasOwn(families, f.name)) fail(`duplicate Knack family "${f.name}"`);
    families[f.name] = f.text;
  }

  const knacks: Record<string, KnackDef> = {};
  for (const k of knackFile.knacks) {
    if (Object.hasOwn(knacks, k.id)) fail(`duplicate Knack id "${k.id}"`);
    if (!Object.hasOwn(families, k.family))
      fail(`Knack "${k.id}" has the unknown family "${k.family}"`);
    knacks[k.id] = k;
  }

  const shippedForms = new Set(species.map((s) => s.id));
  const forms: Record<string, FormDef> = {};
  const onAForm = new Set<string>();
  for (const f of formFile) {
    if (Object.hasOwn(forms, f.id)) fail(`duplicate form "${f.id}"`);
    if (!shippedForms.has(f.id)) fail(`form "${f.id}" is not a shipped form`);
    for (const k of f.ownKnacks) {
      if (!Object.hasOwn(knacks, k)) fail(`form "${f.id}" names the unknown Knack "${k}"`);
      onAForm.add(k);
    }
    forms[f.id] = f;
  }
  for (const s of species) {
    // The schema already needs one own Knack per entry; this is the missing entry.
    if (!Object.hasOwn(forms, s.id)) fail(`shipped form "${s.id}" has no entry with an own Knack`);
  }
  for (const id of Object.keys(knacks)) {
    if (!onAForm.has(id)) fail(`Knack "${id}" is on no form`);
  }

  const gearLineIds = new Set(shipped.gearLines.map((l) => l.id));
  const talents: Record<string, TalentDef> = {};
  for (const t of talentFile.talents) {
    if (Object.hasOwn(talents, t.id)) fail(`duplicate talent id "${t.id}"`);
    if (t.gearLine !== undefined && !gearLineIds.has(t.gearLine))
      fail(
        `talent "${t.id}" names the gear line "${t.gearLine}", which is not a shipped gear line`,
      );
    if (t.fx.seal !== undefined) fail(`talent "${t.id}" uses seal, which is never a talent`);
    for (const field of Object.keys(t.fx)) {
      if (!ADDITIVE.has(field))
        fail(`talent "${t.id}" uses "${field}", which is not an additive effect field`);
    }
    talents[t.id] = t;
  }

  const lines = new Set(species.map((s) => s.line));
  const pools: Record<string, readonly string[]> = {};
  for (const [line, pool] of Object.entries(talentFile.pools)) {
    if (!lines.has(line)) fail(`a talent pool is for "${line}", which is not a shipped line`);
    if (pool.length !== POOL_SIZE)
      fail(
        `the pool of "${line}" has ${String(pool.length)} talents, expected ${String(POOL_SIZE)}`,
      );
    for (const id of pool) {
      if (!Object.hasOwn(talents, id))
        fail(`the pool of "${line}" names the unknown talent "${id}"`);
    }
    if (new Set(pool).size !== pool.length) fail(`the pool of "${line}" repeats a talent`);
    pools[line] = pool;
  }

  const keywords: Record<string, KeywordDef> = {};
  for (const k of keywordFile) {
    if (Object.hasOwn(keywords, k.name)) fail(`duplicate keyword "${k.name}"`);
    keywords[k.name] = k;
  }
  const checkWords = (owner: string, text: string): void => {
    for (const w of keywordsIn(text)) {
      if (!Object.hasOwn(keywords, w)) fail(`${owner} uses the undefined keyword {${w}}`);
    }
  };
  for (const k of Object.values(knacks)) checkWords(`Knack "${k.id}"`, k.text);
  for (const t of Object.values(talents)) checkWords(`talent "${t.id}"`, t.text);
  for (const k of Object.values(keywords)) {
    checkWords(`keyword "${k.name}"`, k.means);
    checkWords(`keyword "${k.name}"`, k.not);
  }

  // The move library: a name and a behaviour per move.
  const moves: Record<string, MoveDef> = {};
  const moveNames = new Set<string>();
  const behaviours = new Map<string, string>();
  for (const m of moveFile) {
    if (Object.hasOwn(moves, m.id)) fail(`duplicate move id "${m.id}"`);
    const name = m.name.trim().toLowerCase();
    if (moveNames.has(name)) fail(`duplicate move name "${m.name}"`);
    moveNames.add(name);
    // A behaviour has one name per element (a card has no element).
    const behaviour = `${m.element ?? 'a card'}: ${moveLabel(m)}`;
    const named = behaviours.get(behaviour);
    if (named !== undefined)
      fail(
        `moves "${named}" and "${m.id}" share the label ${moveLabel(m)} for ${m.element ?? 'cards'}: a behaviour has one name per element`,
      );
    behaviours.set(behaviour, m.id);
    moves[m.id] = m;
  }

  const cards: Record<string, CardDef> = {};
  for (const c of cardFile) {
    if (Object.hasOwn(cards, c.id)) fail(`duplicate card id "${c.id}"`);
    checkWords(`card "${c.id}"`, c.asks);
    for (const a of c.answers) {
      if (!Object.hasOwn(families, a) && !Object.hasOwn(talents, a))
        fail(`card "${c.id}" has the answer "${a}", which is no Knack family and no talent`);
    }
    if (new Set(c.answers).size !== c.answers.length) fail(`card "${c.id}" repeats an answer`);
    // The baseline has none, and a raid-only card (Reaction and Element Resistance) is answered by the team's make-up, not a tool.
    if (c.id !== 'plain' && c.raidOnly !== true && c.answers.length === 0)
      fail(`card "${c.id}" has no answer`);
    // A card adds only moves with no element: it belongs to no boss, so it takes the plain behaviour label's name.
    const resolveCard = (use: MoveUseDef) => resolveMove(use, moves, `card "${c.id}"`, undefined);
    cards[c.id] = {
      ...c,
      ops: c.ops.map((o) => (o.op === 'move' ? { ...o, move: resolveCard(o.move) } : o)),
    };
  }

  const bossElements = new Map(shipped.bosses.map((b) => [b.id, b.element]));
  const raidBosses: Record<string, RaidBossDef> = {};
  for (const b of raidFile) {
    if (Object.hasOwn(raidBosses, b.id)) fail(`duplicate raid boss "${b.id}"`);
    const element = bossElements.get(b.id);
    if (element === undefined) fail(`raid boss "${b.id}" is not a shipped boss`);
    const resolve = (use: MoveUseDef) => resolveMove(use, moves, `raid boss "${b.id}"`, element);
    // Only a full column is a piece the engine can play (the board repeats it per player); any other shape needs engine support first.
    if (b.piece.rows !== b.rows)
      fail(
        `raid boss "${b.id}": its piece has ${String(b.piece.rows)} rows but the arena has ${String(b.rows)}; the engine plays only one full column per player yet`,
      );
    const { moves: ownUses, escalation: escUse, ...rest } = b;
    const own = ownUses.map(resolve);
    const escalation = escUse === undefined ? undefined : resolveEscalation(escUse, resolve);
    const phase = escalation?.phase?.moves ?? [];
    checkBoss('raid boss', b.id, b.rows, own, phase, b.cards, cards);
    checkWords(`raid boss "${b.id}"`, b.asks);
    // At most two damaging moves share a boss turn, before the phase and after it.
    for (const state of [own, withPhase(own, phase)]) {
      for (let round = 1; round <= STAGE_ROUNDS; round++) {
        for (let turn = 0; turn < b.rows; turn++) {
          if (damagingDue(state, b.rows, round, turn) > 2)
            fail(
              `raid boss "${b.id}" has more than two damaging moves on boss turn ${String(turn)} of round ${String(round)}`,
            );
        }
      }
    }
    raidBosses[b.id] = { ...rest, moves: own, ...(escalation ? { escalation } : {}) };
  }

  for (const id of trackFile.order) {
    if (!Object.hasOwn(raidBosses, id))
      fail(`raid track order names "${id}", which is no raid boss`);
  }
  trackFile.slots.forEach((s, i) => {
    const where = `raid track slot ${String(s.slot)}`;
    if (s.slot !== i + 1)
      fail(`${where} is at place ${String(i + 1)}: slots run 1, 2, 3 ... with no gaps`);
    const boss = raidBosses[s.boss];
    if (boss === undefined) return fail(`${where} names "${s.boss}", which is no raid boss`);
    const want = trackFile.order[i % trackFile.order.length];
    if (s.boss !== want)
      fail(`${where} is "${s.boss}", but the order puts "${String(want)}" there`);
    if (s.cards > boss.cards.length)
      fail(
        `${where} has ${String(s.cards)} cards, but "${s.boss}" has only ${String(boss.cards.length)}`,
      );
    const seen = new Set<string>();
    for (const c of s.extraCards) {
      if (!Object.hasOwn(cards, c)) fail(`${where} adds the unknown card "${c}"`);
      if (boss.cards.includes(c))
        fail(`${where} adds "${c}", which is one of "${s.boss}"'s own cards`);
      if (seen.has(c)) fail(`${where} adds "${c}" twice`);
      seen.add(c);
    }
    // An extra card must not give the boss a second move of a behaviour it has.
    checkOneBehaviour(
      `${where} (${s.boss})`,
      boss.moves,
      boss.escalation?.phase?.moves ?? [],
      cardMovesOf([...boss.cards, ...s.extraCards], cards),
    );
  });

  const foeElements = new Map(shipped.foes.map((f) => [f.id, f.element]));
  const foes: Record<string, FoeDef> = {};
  for (const f of foeFile.foes) {
    if (Object.hasOwn(foes, f.id)) fail(`duplicate foe "${f.id}"`);
    const element = foeElements.get(f.id);
    if (element === undefined) fail(`foe "${f.id}" is not a shipped dungeon foe`);
    const resolve = (use: MoveUseDef) => resolveMove(use, moves, `foe "${f.id}"`, element);
    const { moves: ownUses, signature: signUse, escalation: escUse, ...rest } = f;
    const own = ownUses.map(resolve);
    const signature = signUse === undefined ? undefined : resolve(signUse);
    const escalation = escUse === undefined ? undefined : resolveEscalation(escUse, resolve);
    // A foe is one row of three: one boss turn, the first.
    checkBoss(
      'foe',
      f.id,
      1,
      [...own, ...(signature ? [signature] : [])],
      escalation?.phase?.moves ?? [],
      f.cards,
      cards,
    );
    checkWords(`foe "${f.id}"`, f.asks);
    foes[f.id] = {
      ...rest,
      moves: own,
      ...(signature ? { signature } : {}),
      ...(escalation ? { escalation } : {}),
    };
  }

  return {
    rules,
    moves,
    families,
    knacks,
    forms,
    talents,
    pools,
    cards,
    keywords,
    raidBosses,
    raidTrack: trackFile,
    foeScale: foeFile.scale,
    foeCurve: foeFile.curve,
    foeUndercroft: foeFile.undercroft,
    foes,
  };
}

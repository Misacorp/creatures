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
  type FoeCurve,
  type FoeDef,
  type FoeScale,
  type KeywordDef,
  type RaidBossDef,
} from './boss-schema';
import { ADDITIVE_FIELDS } from './fx-schema';
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
  readonly knacks: unknown;
  readonly forms: unknown;
  readonly talents: unknown;
  readonly cards: unknown;
  readonly raidBosses: unknown;
  readonly foes: unknown;
  readonly keywords: unknown;
}

/** The shipped raid bosses and dungeon foes (ids), which the boss-side files must name. */
export interface CombatShippedRefs {
  readonly bosses: readonly { readonly id: string }[];
  readonly foes: readonly { readonly id: string }[];
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
  /** Knack family name to its rule. */
  readonly families: Readonly<Record<string, string>>;
  readonly knacks: Readonly<Record<string, KnackDef>>;
  /** By form id: armour, own Knacks and stat changes. */
  readonly forms: Readonly<Record<string, FormDef>>;
  readonly talents: Readonly<Record<string, TalentDef>>;
  /** Line id to its pool: talent ids. */
  readonly pools: Readonly<Record<string, readonly string[]>>;
  /** Rule cards by id, in the order of the file. */
  readonly cards: Readonly<Record<string, CardDef>>;
  /** Keywords by name, in the order of the file. */
  readonly keywords: Readonly<Record<string, KeywordDef>>;
  /** Raid bosses by id (the high rank's numbers). */
  readonly raidBosses: Readonly<Record<string, RaidBossDef>>;
  /** The lab scale of a foe's content numbers and the depth curve of its HP and Attack. */
  readonly foeScale: FoeScale;
  readonly foeCurve: FoeCurve;
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

/** The checks both kinds of boss share: unique move ids, moves on a real boss turn, known cards. */
function checkBoss(
  kind: string,
  id: string,
  rows: number,
  moves: readonly BossMoveDef[],
  cards: readonly string[],
  known: Readonly<Record<string, CardDef>>,
): void {
  const ids = new Set<string>();
  for (const m of moves) {
    if (ids.has(m.id)) fail(`${kind} "${id}" has two moves "${m.id}"`);
    ids.add(m.id);
    if ((m.turn ?? rows - 1) >= rows)
      fail(
        `${kind} "${id}": move "${m.id}" is on boss turn ${String(m.turn)}, past its ${String(rows)} rows`,
      );
  }
  for (const c of cards) {
    if (!Object.hasOwn(known, c)) fail(`${kind} "${id}" names the unknown card "${c}"`);
  }
}

/**
 * Validates the raw files and returns the typed pack. Throws an Error naming the first problem. Checks: every
 * Knack's family exists; every form is a shipped form and every shipped form has an entry with at least one own
 * Knack; every Knack a form names exists and every Knack is on at least one form; ids are unique; every talent
 * in a pool exists, each pool holds seven talents and each pool is a shipped line's; a talent's effects use only
 * the additive fields and never Seal; every rules field is present (the schema).
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
  const cardFile = parse(CardFileSchema, raw.cards, 'cards.json');
  const raidFile = parse(RaidBossFileSchema, raw.raidBosses, 'raid-bosses.json');
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

  const talents: Record<string, TalentDef> = {};
  for (const t of talentFile.talents) {
    if (Object.hasOwn(talents, t.id)) fail(`duplicate talent id "${t.id}"`);
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
    cards[c.id] = c;
  }

  const bossIds = new Set(shipped.bosses.map((b) => b.id));
  const raidBosses: Record<string, RaidBossDef> = {};
  for (const b of raidFile) {
    if (Object.hasOwn(raidBosses, b.id)) fail(`duplicate raid boss "${b.id}"`);
    if (!bossIds.has(b.id)) fail(`raid boss "${b.id}" is not a shipped boss`);
    const all = [...b.moves, ...(b.escalation?.phase?.moves ?? [])];
    checkBoss('raid boss', b.id, b.rows, all, b.cards, cards);
    checkWords(`raid boss "${b.id}"`, b.asks);
    for (let round = 1; round <= STAGE_ROUNDS; round++) {
      for (let turn = 0; turn < b.rows; turn++) {
        if (damagingDue(all, b.rows, round, turn) > 2)
          fail(
            `raid boss "${b.id}" has more than two damaging moves on boss turn ${String(turn)} of round ${String(round)}`,
          );
      }
    }
    raidBosses[b.id] = b;
  }

  const foeIds = new Set(shipped.foes.map((f) => f.id));
  const foes: Record<string, FoeDef> = {};
  for (const f of foeFile.foes) {
    if (Object.hasOwn(foes, f.id)) fail(`duplicate foe "${f.id}"`);
    if (!foeIds.has(f.id)) fail(`foe "${f.id}" is not a shipped dungeon foe`);
    // A foe is one row of three: one boss turn, the first.
    const all = [
      ...f.moves,
      ...(f.signature ? [f.signature] : []),
      ...(f.escalation?.phase?.moves ?? []),
    ];
    checkBoss('foe', f.id, 1, all, f.cards, cards);
    checkWords(`foe "${f.id}"`, f.asks);
    foes[f.id] = f;
  }

  return {
    rules,
    families,
    knacks,
    forms,
    talents,
    pools,
    cards,
    keywords,
    raidBosses,
    foeScale: foeFile.scale,
    foeCurve: foeFile.curve,
    foes,
  };
}

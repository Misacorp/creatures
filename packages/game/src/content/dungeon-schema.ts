/**
 * Daily dungeon content (`data/dungeon-foes.json`, `data/room-modifiers.json`): schemas and load-time
 * checks. A foe is a small boss: it reuses the boss pieces (element, gimmicks, crit bonus) and adds a
 * round count and a kind (a normal foe, or a floor boss that closes a run). It has no turn order: every
 * dungeon fight goes left to right, then the foe (`RULES.dungeon.turnOrder`), so content cannot
 * change it. A room modifier is a handful of plain number changes applied to the room's fight input
 * before it runs (team stats, foe stats, crit, a gimmick), so the engine needs no special cases for
 * either. Everything numeric about depth and rewards lives in `RULES.dungeon`.
 *
 * The map redesign (docs/design/dungeon-paths.md) adds two more kinds of content: keepsakes (a buff for
 * the rest of a run, written with the room modifier's own effects) and mystery-room events (a scene
 * with two options, each a short list of plain effects). Both are checked by `loadDungeonRun`.
 */
import * as v from 'valibot';
import { CritBonusSchema, ElementSchema, GimmickSchema, IdSchema, RoleSchema } from './schema';

const Name = v.pipe(v.string(), v.minLength(1), v.maxLength(32));
const Flavor = v.pipe(v.string(), v.minLength(1), v.maxLength(120));
const Description = v.pipe(v.string(), v.minLength(1), v.maxLength(120));
const PositiveInt = v.pipe(v.number(), v.integer(), v.minValue(1));
const NonNegativeInt = v.pipe(v.number(), v.integer(), v.minValue(0));
const SignedBp = v.pipe(v.number(), v.integer(), v.minValue(-5_000), v.maxValue(10_000));

export const DUNGEON_FOE_KINDS = ['foe', 'boss'] as const;
export const DungeonFoeKindSchema = v.picklist(DUNGEON_FOE_KINDS);
export type DungeonFoeKind = v.InferOutput<typeof DungeonFoeKindSchema>;

/** The most rounds one room lasts: a room is a short fight. */
export const MAX_ROOM_ROUNDS = 12;

export const DungeonFoeSchema = v.strictObject({
  id: IdSchema,
  name: Name,
  /** `foe` fills the first rooms of a run; `boss` is the last room. */
  kind: DungeonFoeKindSchema,
  element: ElementSchema,
  /** HP and Attack at depth 1. Depth scales both (`scaledFoe`). */
  baseHp: PositiveInt,
  baseAtk: PositiveInt,
  /** Optional Speed (0 when absent): the base of the foe's dodge chance. Depth does not scale it. */
  baseSpd: v.optional(NonNegativeInt),
  gimmicks: v.pipe(v.array(GimmickSchema), v.maxLength(3)),
  /**
   * A floor boss's landmark signature: a `charge` gimmick it gains only at landmark depths (every
   * `RULES.dungeon.landmarkEvery`-th), announced a round ahead. Floor bosses only.
   */
  signature: v.optional(GimmickSchema),
  /** Rounds in the room's fight (the fight also ends when the foe falls or the team is knocked out). */
  rounds: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_ROOM_ROUNDS)),
  crit: v.optional(CritBonusSchema),
  flavor: Flavor,
});
export type DungeonFoeDef = v.InferOutput<typeof DungeonFoeSchema>;

/**
 * What a room modifier changes. Each effect is a number fold on the room's fight input; none of them
 * needs the engine to know about the dungeon. Amounts are basis points.
 */
const TeamStatEffectSchema = v.strictObject({
  op: v.literal('team_stat'),
  stat: v.picklist(['atk', 'hp', 'spd']),
  bp: SignedBp,
  element: v.optional(ElementSchema),
  role: v.optional(RoleSchema),
});
const FoeStatEffectSchema = v.strictObject({
  op: v.literal('foe_stat'),
  stat: v.picklist(['hp', 'atk']),
  bp: SignedBp,
});
const TeamCritEffectSchema = v.strictObject({
  op: v.literal('team_crit'),
  chanceBp: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(5_000)),
  damageBp: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10_000)),
});
const FoeGimmickEffectSchema = v.strictObject({
  op: v.literal('foe_gimmick'),
  gimmick: GimmickSchema,
});

export const RoomEffectSchema = v.variant('op', [
  /** The team's Attack, HP or speed, for everyone or only one element and/or role. */
  TeamStatEffectSchema,
  /** The foe's HP or Attack. */
  FoeStatEffectSchema,
  /** Extra crit chance and crit damage for every creature of the team (on top of the baseline and caps). */
  TeamCritEffectSchema,
  /** The foe gains a gimmick for this room. */
  FoeGimmickEffectSchema,
]);
export type RoomEffect = v.InferOutput<typeof RoomEffectSchema>;

export const RoomModifierSchema = v.strictObject({
  id: IdSchema,
  name: Name,
  /**
   * One plain line, shown before the run ("Tide creatures hit 20% harder."). A modifier may never
   * change who acts when: the order is `RULES.dungeon.turnOrder` for every room, so there is no
   * effect for it.
   */
  description: Description,
  effects: v.pipe(v.array(RoomEffectSchema), v.minLength(1), v.maxLength(3)),
});
export type RoomModifierDef = v.InferOutput<typeof RoomModifierSchema>;

export const DungeonPackSchema = v.strictObject({
  foes: v.pipe(v.array(DungeonFoeSchema), v.minLength(1), v.maxLength(100)),
  modifiers: v.pipe(v.array(RoomModifierSchema), v.minLength(1), v.maxLength(50)),
});
export type DungeonPack = v.InferOutput<typeof DungeonPackSchema>;

function fail(message: string): never {
  throw new Error(`Invalid dungeon content: ${message}`);
}

/**
 * Validates raw dungeon content (schema first, then cross-references) and returns it typed. Throws an
 * Error naming the first problem. `rooms` is how many rooms a run has (`RULES.dungeon.rooms`): there
 * must be enough different normal foes and modifiers to fill a run without repeats. Shipped content
 * is checked at module load.
 */
export function loadDungeon(rawFoes: unknown, rawModifiers: unknown, rooms: number): DungeonPack {
  const parsed = v.safeParse(DungeonPackSchema, { foes: rawFoes, modifiers: rawModifiers });
  if (!parsed.success) {
    const first = parsed.issues[0];
    const path = first?.path?.map((p) => String(p.key)).join('.') ?? '';
    throw new Error(`Invalid dungeon schema at "${path}": ${first?.message ?? 'unknown error'}`);
  }
  const pack = parsed.output;
  const foeIds = new Set<string>();
  for (const foe of pack.foes) {
    if (foeIds.has(foe.id)) fail(`duplicate foe id "${foe.id}"`);
    foeIds.add(foe.id);
    const gimmickIds = new Set<string>();
    for (const g of foe.gimmicks) {
      if (gimmickIds.has(g.id)) fail(`foe "${foe.id}" has duplicate gimmick id "${g.id}"`);
      gimmickIds.add(g.id);
      // Boss Ranks are a raid idea: a dungeon foe fights with all its moves.
      if (g.fromRank !== undefined)
        fail(`foe "${foe.id}" gimmick "${g.id}" cannot have a fromRank`);
    }
    if (foe.signature?.fromRank !== undefined)
      fail(`foe "${foe.id}" signature cannot have a fromRank`);
  }
  const modifierIds = new Set<string>();
  for (const m of pack.modifiers) {
    if (modifierIds.has(m.id)) fail(`duplicate modifier id "${m.id}"`);
    modifierIds.add(m.id);
    for (const e of m.effects) {
      if (e.op === 'foe_gimmick' && e.gimmick.fromRank !== undefined) {
        fail(`modifier "${m.id}" gimmick cannot have a fromRank`);
      }
    }
    // The same kind of effect on the same thing twice would only be a confusing way to write one.
    const keys = m.effects.map((e) => {
      switch (e.op) {
        case 'team_stat':
          return `${e.op}:${e.stat}:${e.element ?? ''}:${e.role ?? ''}`;
        case 'foe_stat':
          return `${e.op}:${e.stat}`;
        default:
          return e.op;
      }
    });
    if (new Set(keys).size !== keys.length) fail(`modifier "${m.id}" repeats an effect`);
  }
  // A run needs `rooms - 1` different normal foes and one floor boss.
  if (pack.foes.filter((f) => f.kind === 'foe').length < rooms - 1) {
    fail(`needs at least ${String(rooms - 1)} normal foes`);
  }
  if (!pack.foes.some((f) => f.kind === 'boss')) fail('needs at least one floor boss');
  if (pack.modifiers.length < rooms) fail(`needs at least ${String(rooms)} room modifiers`);
  return pack;
}

// --- Keepsakes: run buffs (docs/design/dungeon-paths.md) ---

/**
 * A keepsake's effects are the room modifier's number folds. It has no `foe_gimmick`: a keepsake is a
 * gift, and a new foe move has to be shown before the run (a room modifier's job), not found on the way.
 */
export const KeepsakeEffectSchema = v.variant('op', [
  TeamStatEffectSchema,
  FoeStatEffectSchema,
  TeamCritEffectSchema,
]);
export type KeepsakeEffect = v.InferOutput<typeof KeepsakeEffectSchema>;

/** The longest keepsake id: its glossary entry is `keepsake-<id>` and glossary ids stop at 32. */
const KEEPSAKE_ID_MAX = 23;
/** The longest event id: its glossary entry is `event-<id>`. */
const EVENT_ID_MAX = 26;

export const KeepsakeSchema = v.strictObject({
  id: v.pipe(IdSchema, v.maxLength(KEEPSAKE_ID_MAX)),
  name: Name,
  /** One plain line with the exact effect ("Every creature gets 12% more Attack and HP."). */
  description: v.pipe(v.string(), v.minLength(1), v.maxLength(90)),
  effects: v.pipe(v.array(KeepsakeEffectSchema), v.minLength(1), v.maxLength(3)),
  /**
   * A curse is a keepsake whose effect is a cost: it is held, shown and folded like any keepsake, and the
   * client marks it as a curse. Curses are never drawn as a gift (elite, camp), only given by a room.
   */
  curse: v.optional(v.literal(true)),
});
export type KeepsakeDef = v.InferOutput<typeof KeepsakeSchema>;

// --- Mystery rooms: events with two options ---

/** The most experience one event effect gives each creature (`RULES.experience.dungeon.maxEvent` is the same number, tested). */
export const MAX_EVENT_XP = 60;

/** The treasure tables a `treasure` effect can name: the Blue Chasm's (the default) and the Hungry Door's. */
export const TREASURE_TABLES = ['chasm', 'door'] as const;
export type TreasureTableName = (typeof TREASURE_TABLES)[number];

/**
 * A curse: a keepsake (`curse: true`) whose effect is a run-long change to the foes, written with the foe
 * folds of a room modifier. It is held and shown in the keepsakes like any other (the engine folds it into
 * every later fight of the run); the client marks it as a curse.
 */
export const CurseSchema = v.strictObject({
  id: v.pipe(IdSchema, v.maxLength(KEEPSAKE_ID_MAX)),
  name: Name,
  /** One plain line with the exact effect ("Foes deal 20% more damage for the rest of the run."). */
  description: v.pipe(v.string(), v.minLength(1), v.maxLength(90)),
  effects: v.pipe(v.array(FoeStatEffectSchema), v.minLength(1), v.maxLength(2)),
  curse: v.literal(true),
});
export type CurseDef = v.InferOutput<typeof CurseSchema>;

const PackAmount = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(8));

const PackEffectSchema = v.strictObject({
  op: v.literal('pack'),
  bait: v.optional(PackAmount),
  essence: v.optional(PackAmount),
  scrap: v.optional(PackAmount),
});

/** The effects an event can have inside a gamble's branch: no gamble within a gamble. */
const PLAIN_EFFECTS = [
  /** Loot into the run's pack. */
  PackEffectSchema,
  /** Standing creatures recover this share of their max HP. */
  v.strictObject({
    op: v.literal('heal'),
    bp: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10_000)),
  }),
  /** Standing creatures lose this share of their max HP, never going below 1. */
  v.strictObject({
    op: v.literal('hurt'),
    bp: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(5_000)),
  }),
  /** A random keepsake the run does not hold yet. */
  v.strictObject({ op: v.literal('keepsake') }),
  /** Every standing creature gains this much creature experience (before the treat and the day's multipliers). */
  v.strictObject({
    op: v.literal('xp'),
    amount: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_EVENT_XP)),
  }),
  v.strictObject({ op: v.literal('nothing') }),
  /**
   * The treasure the room rolled when the player came in (`rollTreasure`, shown before the choice) goes
   * into the run's pack: paid at the run's end, lost on a defeat. Only in an event that rolls one.
   */
  v.strictObject({ op: v.literal('treasure'), table: v.optional(v.picklist(TREASURE_TABLES)) }),
  /** A curse the run carries to its end (`CurseSchema`). A cost: it makes the rest of the run harder. */
  v.strictObject({ op: v.literal('curse'), curse: CurseSchema }),
  /**
   * The team's highest-level standing creature goes home, as a camp swap sends one out: it keeps the
   * experience it earned and leaves the row. Not offered when fewer than two creatures stand (the row
   * must never be left empty).
   */
  v.strictObject({ op: v.literal('send_home'), who: v.literal('highest_level') }),
  /** The whole team falls: the run ends as a defeat (it keeps half the pack, `RULES.dungeon.defeatKeepBp`). A cost. */
  v.strictObject({ op: v.literal('fall') }),
  /**
   * The Sealed Vault: the fight rooms the run can step into next are marked (`sealTargets`) and the first one
   * it enters is an epic fight with double rewards (`RULES.dungeon.seal`). A cost: it adds danger.
   */
  v.strictObject({ op: v.literal('seal') }),
] as const;

/** A pack effect that gives nothing is a typo, not a choice. */
const packGives = (e: v.InferOutput<typeof PackEffectSchema>): number =>
  (e.bait ?? 0) + (e.essence ?? 0) + (e.scrap ?? 0);
const GIVES_SOMETHING = 'a pack effect must give something';

export const PlainEventEffectSchema = v.pipe(
  v.variant('op', [...PLAIN_EFFECTS]),
  v.check((e) => e.op !== 'pack' || packGives(e) > 0, GIVES_SOMETHING),
);
export type PlainEventEffect = v.InferOutput<typeof PlainEventEffectSchema>;

const EffectList = v.pipe(v.array(PlainEventEffectSchema), v.minLength(1), v.maxLength(3));

/** What an event can give or take. `gamble` is rolled on the server with live randomness when picked. */
export const EventEffectSchema = v.pipe(
  v.variant('op', [
    ...PLAIN_EFFECTS,
    /** `chanceBp` of the `win` effects, otherwise the `lose` effects. */
    v.strictObject({
      op: v.literal('gamble'),
      chanceBp: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(9_999)),
      win: EffectList,
      lose: EffectList,
    }),
  ]),
  v.check((e) => e.op !== 'pack' || packGives(e) > 0, GIVES_SOMETHING),
);
export type EventEffect = v.InferOutput<typeof EventEffectSchema>;

export const EventOptionSchema = v.strictObject({
  label: v.pipe(v.string(), v.minLength(1), v.maxLength(24)),
  /** The exact outcome and odds in plain words, shown before the player picks ("60%: 2 scrap. 40%: ..."). */
  description: v.pipe(v.string(), v.minLength(1), v.maxLength(90)),
  effects: v.pipe(v.array(EventEffectSchema), v.minLength(1), v.maxLength(3)),
});
export type EventOptionDef = v.InferOutput<typeof EventOptionSchema>;

/**
 * A rare event is not drawn onto a map. Each time a run steps into a mystery room it may take the room's
 * place: with `chanceBp` (basis points, drawn live), from run depth `fromDepth`, at most once a run.
 */
export const RareEventSchema = v.strictObject({
  chanceBp: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10_000)),
  fromDepth: PositiveInt,
});
export type RareEvent = v.InferOutput<typeof RareEventSchema>;

export const DungeonEventSchema = v.strictObject({
  id: v.pipe(IdSchema, v.maxLength(EVENT_ID_MAX)),
  name: Name,
  /** The scene, shown once the player is in the room. */
  text: v.pipe(v.string(), v.minLength(1), v.maxLength(160)),
  /** Absent: a common event, drawn onto the day's map. Present: a rare one (see `RareEventSchema`). */
  rare: v.optional(RareEventSchema),
  options: v.pipe(v.array(EventOptionSchema), v.length(2)),
});
export type DungeonEventDef = v.InferOutput<typeof DungeonEventSchema>;

export const DungeonRunContentSchema = v.strictObject({
  keepsakes: v.pipe(v.array(KeepsakeSchema), v.minLength(1), v.maxLength(50)),
  events: v.pipe(v.array(DungeonEventSchema), v.minLength(1), v.maxLength(50)),
});
export type DungeonRunContent = v.InferOutput<typeof DungeonRunContentSchema>;

/**
 * True when taking the effect can cost the player something: HP, the run (a fall), a harder fight (a seal), a
 * curse, or the chance of any. Sending a creature home costs no HP and no run (it keeps what it earned), so it
 * is not one: the Hungry Door's "Feed it" is its free option.
 */
const COSTLY = new Set<string>(['hurt', 'fall', 'seal', 'curse']);
function effectCosts(e: EventEffect): boolean {
  if (COSTLY.has(e.op)) return true;
  if (e.op === 'gamble') return [...e.win, ...e.lose].some((x) => COSTLY.has(x.op));
  return false;
}

/** True when picking the option can cost HP, the run or a harder fight (a `hurt`, a `fall`, a `seal` or a `curse`, or a gamble with one on a branch). */
export function eventOptionCosts(option: EventOptionDef): boolean {
  return option.effects.some(effectCosts);
}

/**
 * Validates the keepsakes and the events (schema first, then cross-references) and returns them typed.
 * Throws an Error naming the first problem. Ids are unique across both lists and do not clash with a
 * foe or a room modifier. Every event has at least one option that costs nothing (no `hurt` or `fall`, no
 * gamble with one on a branch), so a hurt team can always walk through; an option holds at most
 * one gamble, so "did it win" has one answer. An option holds at most one `treasure` and an event's treasures share one table (the room rolls one prize), and an event holds at most one `curse`. Shipped content is checked at module load.
 */
export function loadDungeonRun(
  rawKeepsakes: unknown,
  rawEvents: unknown,
  dungeon: DungeonPack,
): DungeonRunContent {
  const parsed = v.safeParse(DungeonRunContentSchema, {
    keepsakes: rawKeepsakes,
    events: rawEvents,
  });
  if (!parsed.success) {
    const first = parsed.issues[0];
    const path = first?.path?.map((p) => String(p.key)).join('.') ?? '';
    throw new Error(
      `Invalid dungeon run schema at "${path}": ${first?.message ?? 'unknown error'}`,
    );
  }
  const out = parsed.output;
  const taken = new Set<string>([
    ...dungeon.foes.map((f) => f.id),
    ...dungeon.modifiers.map((m) => m.id),
  ]);
  for (const item of [...out.keepsakes, ...out.events]) {
    if (taken.has(item.id)) fail(`duplicate id "${item.id}"`);
    taken.add(item.id);
  }
  for (const k of out.keepsakes) {
    const keys = k.effects.map((e) =>
      e.op === 'team_stat'
        ? `${e.op}:${e.stat}:${e.element ?? ''}:${e.role ?? ''}`
        : e.op === 'foe_stat'
          ? `${e.op}:${e.stat}`
          : e.op,
    );
    if (new Set(keys).size !== keys.length) fail(`keepsake "${k.id}" repeats an effect`);
  }
  for (const e of out.events) {
    if (!e.options.some((o) => !eventOptionCosts(o))) {
      fail(`event "${e.id}" needs at least one option that costs nothing`);
    }
    const ops = e.options.flatMap((o) =>
      o.effects.flatMap((x) => (x.op === 'gamble' ? [x, ...x.win, ...x.lose] : [x])),
    );
    if (ops.filter((x) => x.op === 'curse').length > 1) {
      fail(`event "${e.id}" has more than one curse`);
    }
    // The room rolls one prize, so an option takes at most one treasure and every option names the same table.
    const tables = new Set<string>();
    for (const o of e.options) {
      const inOption = o.effects.flatMap((x) =>
        x.op === 'gamble' ? [x, ...x.win, ...x.lose] : [x],
      );
      const treasures = inOption.filter((x) => x.op === 'treasure');
      if (treasures.length > 1) fail(`event "${e.id}" has more than one treasure in an option`);
      for (const t of treasures) tables.add(t.table ?? 'chasm');
    }
    if (tables.size > 1) fail(`event "${e.id}" has treasures of different tables`);
    for (const o of e.options) {
      if (o.effects.filter((x) => x.op === 'gamble').length > 1) {
        fail(`event "${e.id}" has an option with more than one gamble`);
      }
    }
  }
  return out;
}

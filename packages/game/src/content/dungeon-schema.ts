/**
 * Daily dungeon content (`data/dungeon-foes.json`, `data/room-modifiers.json`): schemas and load-time
 * checks. A foe is a small boss: it reuses the boss pieces (element, gimmicks, crit bonus) and adds a
 * round count and a kind (a normal foe, or a room boss that closes a run). It has no turn order: every
 * dungeon fight goes left to right, then the foe (`RULES.dungeon.turnOrder`), so content cannot
 * change it. A room modifier is a handful of plain number changes applied to the room's fight input
 * before it runs (team stats, foe stats, crit, a gimmick), so the engine needs no special cases for
 * either. Everything numeric about depth and rewards lives in `RULES.dungeon`.
 */
import * as v from 'valibot';
import { CritBonusSchema, ElementSchema, GimmickSchema, IdSchema, RoleSchema } from './schema';

const Name = v.pipe(v.string(), v.minLength(1), v.maxLength(32));
const Flavor = v.pipe(v.string(), v.minLength(1), v.maxLength(120));
const Description = v.pipe(v.string(), v.minLength(1), v.maxLength(120));
const PositiveInt = v.pipe(v.number(), v.integer(), v.minValue(1));
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
  gimmicks: v.pipe(v.array(GimmickSchema), v.maxLength(3)),
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
export const RoomEffectSchema = v.variant('op', [
  /** The team's Attack, HP or speed, for everyone or only one element and/or role. */
  v.strictObject({
    op: v.literal('team_stat'),
    stat: v.picklist(['atk', 'hp', 'spd']),
    bp: SignedBp,
    element: v.optional(ElementSchema),
    role: v.optional(RoleSchema),
  }),
  /** The foe's HP or Attack. */
  v.strictObject({
    op: v.literal('foe_stat'),
    stat: v.picklist(['hp', 'atk']),
    bp: SignedBp,
  }),
  /** Extra crit chance and crit damage for every creature of the team (on top of the baseline and caps). */
  v.strictObject({
    op: v.literal('team_crit'),
    chanceBp: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(5_000)),
    damageBp: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10_000)),
  }),
  /** The foe gains a gimmick for this room. */
  v.strictObject({ op: v.literal('foe_gimmick'), gimmick: GimmickSchema }),
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
    }
  }
  const modifierIds = new Set<string>();
  for (const m of pack.modifiers) {
    if (modifierIds.has(m.id)) fail(`duplicate modifier id "${m.id}"`);
    modifierIds.add(m.id);
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
  // A run needs `rooms - 1` different normal foes and one room boss.
  if (pack.foes.filter((f) => f.kind === 'foe').length < rooms - 1) {
    fail(`needs at least ${String(rooms - 1)} normal foes`);
  }
  if (!pack.foes.some((f) => f.kind === 'boss')) fail('needs at least one room boss');
  if (pack.modifiers.length < rooms) fail(`needs at least ${String(rooms)} room modifiers`);
  return pack;
}

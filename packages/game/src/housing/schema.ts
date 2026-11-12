/**
 * Housing content shapes and the loader (`docs/design/housing.md` 2.1). All data is schema-validated with strict
 * objects and plain-text names; `loadHousingContent` also checks every cross reference and throws an `Error` naming
 * the first problem, like `loadGamesStall`.
 */
import * as v from 'valibot';
import { ElementSchema, IdSchema } from '../content/schema';
import type { ResourceDef } from '../content/resources-schema';
import { HOUSING_RULES } from './rules';
import { lineKey, piecePrice } from './price';

export const MATERIAL_FAMILIES = ['wood', 'stone', 'metal', 'cloth'] as const;
export const MaterialFamilySchema = v.picklist(MATERIAL_FAMILIES);
export type MaterialFamily = v.InferOutput<typeof MaterialFamilySchema>;

export const SPOT_TYPES = [
  'window',
  'wall-large',
  'wall-small',
  'ceiling',
  'floor-large',
  'floor-small',
  'rug',
  'display',
  'yard-large',
  'yard-small',
  'fence',
  'poolside',
  'water',
  'porch',
] as const;
export const SpotTypeSchema = v.picklist(SPOT_TYPES);
export type SpotType = v.InferOutput<typeof SpotTypeSchema>;

export const DISPLAY_KINDS = [
  'raid-plaques',
  'games-medals',
  'games-badges',
  'festival',
  'keepsakes',
  'journal',
  'dungeon',
  'set-keepsakes',
] as const;
export const DisplayKindSchema = v.picklist(DISPLAY_KINDS);
export type DisplayKind = v.InferOutput<typeof DisplayKindSchema>;

export const MOMENT_KINDS = ['trip', 'scout', 'dungeon', 'raid', 'games'] as const;
export const MomentKindSchema = v.picklist(MOMENT_KINDS);
export type MomentKind = v.InferOutput<typeof MomentKindSchema>;

const Text = (max: number) =>
  v.pipe(
    v.string(),
    v.minLength(1),
    v.maxLength(max),
    v.regex(/^[^\p{Cc}\p{Cf}\p{Zl}\p{Zp}]*$/u, 'must be plain text'),
  );
const Name = Text(40);
const Line = Text(200);
const Int = v.pipe(v.number(), v.integer(), v.minValue(0));
const PosInt = v.pipe(v.number(), v.integer(), v.minValue(1));
const Px = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(2000));
const Ids = v.pipe(v.array(IdSchema), v.maxLength(64));

export const FormDefSchema = v.strictObject({
  id: IdSchema,
  name: Name,
  spot: SpotTypeSchema,
  box: v.strictObject({ w: PosInt, h: PosInt }),
  bed: v.optional(v.literal(true)),
  size: v.picklist(['small', 'large']),
});
export type FormDef = v.InferOutput<typeof FormDefSchema>;

export const PriceLineSchema = v.variant('kind', [
  v.strictObject({ kind: v.literal('bait'), amount: PosInt }),
  v.strictObject({ kind: v.literal('scrap'), amount: PosInt }),
  v.strictObject({ kind: v.literal('shard'), element: ElementSchema, amount: PosInt }),
  v.strictObject({ kind: v.literal('material'), id: IdSchema, amount: PosInt }),
  v.strictObject({ kind: v.literal('family'), family: MaterialFamilySchema, amount: PosInt }),
]);
export type PriceLine = v.InferOutput<typeof PriceLineSchema>;
const Price = v.pipe(v.array(PriceLineSchema), v.maxLength(12));

export const SpotDefSchema = v.strictObject({
  id: IdSchema,
  type: SpotTypeSchema,
  x: Px,
  w: PosInt,
  y: v.optional(Px),
  display: v.optional(DisplayKindSchema),
  layout: v.optional(v.picklist(['one', 'row'])),
});
export type SpotDef = v.InferOutput<typeof SpotDefSchema>;

export const RoomKindDefSchema = v.strictObject({
  id: IdSchema,
  name: Name,
  outdoor: v.boolean(),
  cells: v.strictObject({ w: v.picklist([1, 2, 3]), h: v.literal(1) }),
  spots: v.pipe(v.array(SpotDefSchema), v.minLength(1), v.maxLength(16)),
  fixtures: v.array(v.picklist(['workbench', 'mailbox'])),
  wall: IdSchema,
  floor: IdSchema,
});
export type RoomKindDef = v.InferOutput<typeof RoomKindDefSchema>;

export const PartDefSchema = v.strictObject({
  id: IdSchema,
  name: Name,
  kind: v.picklist(['core', 'wing', 'cellar', 'grounds', 'porch', 'tower', 'balcony']),
  requires: Ids,
  rooms: v.pipe(
    v.array(
      v.strictObject({
        key: IdSchema,
        kind: IdSchema,
        col: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(20)),
        floor: v.pipe(v.number(), v.integer(), v.minValue(-3), v.maxValue(8)),
      }),
    ),
    v.maxLength(8),
  ),
  price: Price,
  side: v.optional(v.picklist(['west', 'east'])),
  unlocks: Ids,
  line: Line,
  order: Int,
});
export type PartDef = v.InferOutput<typeof PartDefSchema>;

export const MaterialDefSchema = v.strictObject({
  id: IdSchema,
  family: MaterialFamilySchema,
  element: v.nullable(ElementSchema),
  rare: v.boolean(),
  places: Ids,
  fights: v.array(v.picklist(['dungeon', 'raid', 'festival', 'games'])),
  line: Line,
  hint: Line,
});
export type MaterialDef = v.InferOutput<typeof MaterialDefSchema>;

export const SetMaterialSchema = v.union([
  v.strictObject({ material: IdSchema }),
  v.strictObject({ family: MaterialFamilySchema }),
]);
export type SetMaterial = v.InferOutput<typeof SetMaterialSchema>;

const SourcesSchema = v.strictObject({
  moments: v.array(MomentKindSchema),
  places: Ids,
  bosses: Ids,
});
export type Sources = v.InferOutput<typeof SourcesSchema>;

export const SetDefSchema = v.strictObject({
  id: IdSchema,
  name: Name,
  element: v.nullable(ElementSchema),
  tier: v.picklist([0, 1, 2]),
  primary: v.nullable(SetMaterialSchema),
  accent: v.nullable(SetMaterialSchema),
  sources: SourcesSchema,
  keepsake: v.strictObject({ name: Name, line: Line }),
  theme: Line,
  line: Line,
});
export type SetDef = v.InferOutput<typeof SetDefSchema>;

const UnlockSchema = v.variant('kind', [
  v.strictObject({ kind: v.literal('starter') }),
  v.strictObject({ kind: v.literal('drop') }),
  v.strictObject({ kind: v.literal('feat'), stamp: IdSchema }),
  v.strictObject({ kind: v.literal('part'), part: IdSchema }),
]);
export type ItemUnlock = v.InferOutput<typeof UnlockSchema>;

export const PieceDefSchema = v.strictObject({
  id: IdSchema,
  name: Name,
  form: IdSchema,
  set: v.nullable(IdSchema),
  unlock: UnlockSchema,
  sources: v.optional(SourcesSchema),
  price: v.optional(Price),
  line: Line,
  hint: Line,
});
export type PieceDef = v.InferOutput<typeof PieceDefSchema>;

/** The kinds of skin: a room's wallpaper, floor, trim and ceiling; the house's roof, walls and frame; an outdoor room's ground. */
export const SKIN_KINDS = [
  'wall',
  'floor',
  'trim',
  'ceiling',
  'roof',
  'walls',
  'frame',
  'ground',
] as const;
export type SkinKind = (typeof SKIN_KINDS)[number];
/** The kinds a skin must be generated for (`gen`): they have no hand-drawn art. */
export const GENERATED_KINDS: ReadonlySet<SkinKind> = new Set(['trim', 'ceiling', 'frame']);

/**
 * A generated skin (`docs/design/housing-interior.md`): a pattern the client's workshop draws in any of `colours`. Owning the skin owns
 * the pattern in every one of its colours; a room stores `<skin id>:<colour>`. `tier` sets its workbench price
 * (`HOUSING_RULES.price.pattern`), `family` the material family a tier 2 or 3 price takes.
 */
export const SkinGenSchema = v.strictObject({
  pattern: IdSchema,
  colours: v.pipe(v.array(IdSchema), v.minLength(1), v.maxLength(16)),
  tier: v.picklist([1, 2, 3]),
  family: v.optional(MaterialFamilySchema),
});
export type SkinGen = v.InferOutput<typeof SkinGenSchema>;

export const SkinDefSchema = v.strictObject({
  id: IdSchema,
  name: Name,
  kind: v.picklist(SKIN_KINDS),
  set: v.nullable(IdSchema),
  unlock: UnlockSchema,
  /** A wild skin's drop sources (a set's skins drop where the set does). */
  sources: v.optional(SourcesSchema),
  price: v.optional(Price),
  gen: v.optional(SkinGenSchema),
  /** A ground skin's room kinds: it may be worn only by an outdoor room of one of these kinds. */
  fits: v.optional(Ids),
  /** The flavour line, once it is owned. */
  line: v.optional(Line),
  hint: Line,
});
export type SkinDef = v.InferOutput<typeof SkinDefSchema>;

export const StampUnlockSchema = v.variant('kind', [
  v.strictObject({ kind: v.literal('starter') }),
  v.strictObject({ kind: v.literal('journal-set'), set: IdSchema }),
  v.strictObject({
    kind: v.literal('stat'),
    stat: v.pipe(v.string(), v.minLength(1), v.maxLength(48)),
    at: PosInt,
  }),
  v.strictObject({ kind: v.literal('raid-boss'), boss: IdSchema }),
  v.strictObject({ kind: v.literal('dungeon-depth'), at: PosInt }),
  v.strictObject({
    kind: v.literal('games-medal'),
    medal: v.picklist(['gold', 'silver', 'bronze']),
    at: PosInt,
  }),
  v.strictObject({ kind: v.literal('house-part'), part: IdSchema }),
  v.strictObject({ kind: v.literal('house-sets'), at: PosInt }),
  v.strictObject({
    kind: v.literal('drop'),
    moments: v.pipe(v.array(MomentKindSchema), v.minLength(1)),
  }),
]);
export type StampUnlock = v.InferOutput<typeof StampUnlockSchema>;

export const StampDefSchema = v.strictObject({
  id: IdSchema,
  name: Name,
  unlock: StampUnlockSchema,
  line: Line,
  hint: Line,
});
export type StampDef = v.InferOutput<typeof StampDefSchema>;

export const StarterSchema = v.strictObject({
  roof: IdSchema,
  walls: IdSchema,
  layout: v.pipe(v.record(IdSchema, IdSchema), v.maxEntries(16)),
});

const list = <T extends v.GenericSchema>(item: T, max: number) =>
  v.pipe(v.array(item), v.minLength(1), v.maxLength(max));

export const HousingContentSchema = v.strictObject({
  forms: list(FormDefSchema, 64),
  rooms: list(RoomKindDefSchema, 32),
  parts: list(PartDefSchema, 32),
  materials: list(MaterialDefSchema, 64),
  sets: list(SetDefSchema, 32),
  pieces: list(PieceDefSchema, 400),
  skins: list(SkinDefSchema, 200),
  stamps: list(StampDefSchema, 100),
  starter: StarterSchema,
});
export type HousingContent = v.InferOutput<typeof HousingContentSchema>;

/** What the loader needs to know about the rest of the game. */
export interface HousingLoadContext {
  journalSets: readonly string[];
  bosses: readonly string[];
  destinations: readonly string[];
}

/** The piece's form, or undefined. */
export function pieceForm(content: HousingContent, pieceId: string): FormDef | undefined {
  const piece = content.pieces.find((p) => p.id === pieceId);
  return piece === undefined ? undefined : content.forms.find((f) => f.id === piece.form);
}

/** Whether a piece of this form fits a spot: same type, and not wider than the spot. Display spots take nothing. */
export function canPlace(
  content: HousingContent,
  roomKind: string,
  spotId: string,
  pieceId: string,
): boolean {
  const room = content.rooms.find((r) => r.id === roomKind);
  const spot = room?.spots.find((s) => s.id === spotId);
  const form = pieceForm(content, pieceId);
  if (spot === undefined || form === undefined) return false;
  if (spot.type === 'display') return false;
  return form.spot === spot.type && form.box.w <= spot.w;
}

function fail(message: string): never {
  throw new Error(`housing content: ${message}`);
}

function uniqueIds(what: string, ids: readonly string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) fail(`${what} id "${id}" appears twice`);
    seen.add(id);
  }
}

/** Parts that share a claim group share one block of columns (a wing and its upper floor), the rest claim alone. */
function claimGroup(part: PartDef): string {
  if (part.side === undefined) return 'core';
  return part.kind === 'wing' ? `${part.side}:wing` : `part:${part.id}`;
}

function checkParts(content: HousingContent): void {
  const partIds = new Set(content.parts.map((p) => p.id));
  const roomIds = new Set(content.rooms.map((r) => r.id));
  const widthOf = (kind: string): number => content.rooms.find((r) => r.id === kind)?.cells.w ?? 1;
  const claimed = new Map<string, string>();
  for (const part of content.parts) {
    for (const req of part.requires) {
      if (!partIds.has(req)) fail(`part "${part.id}" requires unknown part "${req}"`);
    }
    if (
      (part.kind === 'wing' || part.kind === 'grounds' || part.kind === 'balcony') &&
      part.side === undefined
    ) {
      fail(`part "${part.id}" needs a side`);
    }
    const keys = new Set<string>();
    for (const room of part.rooms) {
      if (!roomIds.has(room.kind)) fail(`part "${part.id}" names unknown room kind "${room.kind}"`);
      if (keys.has(room.key)) fail(`part "${part.id}" has room key "${room.key}" twice`);
      keys.add(room.key);
      for (let c = room.col; c < room.col + widthOf(room.kind); c++) {
        const cell = `${claimGroup(part)}@${String(c)},${String(room.floor)}`;
        const other = claimed.get(cell);
        if (other !== undefined) {
          fail(
            `parts "${other}" and "${part.id}" both claim column ${String(c)}, floor ${String(room.floor)}`,
          );
        }
        claimed.set(cell, part.id);
      }
    }
  }
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (id: string, path: string[]): void => {
    const s = state.get(id);
    if (s === 'done') return;
    if (s === 'visiting')
      fail(`parts require each other in a cycle: ${[...path, id].join(' -> ')}`);
    state.set(id, 'visiting');
    const part = content.parts.find((p) => p.id === id);
    for (const req of part?.requires ?? []) visit(req, [...path, id]);
    state.set(id, 'done');
  };
  for (const part of content.parts) visit(part.id, []);
}

function checkRooms(content: HousingContent): void {
  for (const room of content.rooms) {
    uniqueIds(
      `room "${room.id}" spot`,
      room.spots.map((s) => s.id),
    );
    const width = room.cells.w * HOUSING_RULES.cell.w;
    for (const spot of room.spots) {
      if (spot.x + spot.w > width) {
        fail(
          `room "${room.id}" spot "${spot.id}" ends at ${String(spot.x + spot.w)}, past its ${String(width)} px`,
        );
      }
      if (spot.type === 'display' && spot.display === undefined) {
        fail(`room "${room.id}" spot "${spot.id}" is a display spot without a display kind`);
      }
      if (spot.type !== 'display' && (spot.display !== undefined || spot.layout !== undefined)) {
        fail(`room "${room.id}" spot "${spot.id}" has a display kind but is not a display spot`);
      }
    }
    for (const id of [room.wall, room.floor]) {
      const skin = content.skins.find((s) => s.id === id);
      if (skin === undefined) fail(`room "${room.id}" names unknown skin "${id}"`);
      const wanted = (layer: 'wall' | 'floor'): SkinKind => (room.outdoor ? 'ground' : layer);
      const layer = id === room.wall ? 'wall' : 'floor';
      if (skin.kind !== wanted(layer)) {
        fail(
          `room "${room.id}" default ${layer} "${id}" is a ${skin.kind} skin, not ${wanted(layer)}`,
        );
      }
      if (skin.gen !== undefined) fail(`room "${room.id}" default ${layer} "${id}" is generated`);
      if (skin.kind === 'ground' && !(skin.fits ?? []).includes(room.id)) {
        fail(`room "${room.id}" default ${layer} "${id}" does not fit the room`);
      }
    }
  }
}

function checkPrice(
  what: string,
  price: readonly PriceLine[] | undefined,
  materialIds: ReadonlySet<string>,
): void {
  const keys = new Set<string>();
  for (const line of price ?? []) {
    if (line.kind === 'material' && !materialIds.has(line.id)) {
      fail(`${what} price names unknown material "${line.id}"`);
    }
    const key = lineKey(line);
    if (keys.has(key)) fail(`${what} price has the line "${key}" twice`);
    keys.add(key);
  }
}

function checkSources(what: string, s: Sources, ctx: HousingLoadContext): void {
  for (const place of s.places) {
    if (!ctx.destinations.includes(place)) fail(`${what} names unknown place "${place}"`);
  }
  for (const boss of s.bosses) {
    if (!ctx.bosses.includes(boss)) fail(`${what} names unknown boss "${boss}"`);
  }
}

function checkItems(content: HousingContent, ctx: HousingLoadContext): void {
  const formIds = new Set(content.forms.map((f) => f.id));
  const setIds = new Set(content.sets.map((s) => s.id));
  const partIds = new Set(content.parts.map((p) => p.id));
  const stampIds = new Set(content.stamps.map((s) => s.id));
  const materialIds = new Set(content.materials.map((m) => m.id));
  const unlockOk = (what: string, u: ItemUnlock): void => {
    if (u.kind === 'feat' && !stampIds.has(u.stamp)) {
      fail(`${what} unlocks by unknown stamp "${u.stamp}"`);
    }
    if (u.kind === 'part' && !partIds.has(u.part)) {
      fail(`${what} unlocks by unknown part "${u.part}"`);
    }
  };
  for (const set of content.sets) {
    for (const m of [set.primary, set.accent]) {
      if (m !== null && 'material' in m && !materialIds.has(m.material)) {
        fail(`set "${set.id}" names unknown material "${m.material}"`);
      }
    }
    if (set.tier > 0 && set.primary === null) fail(`set "${set.id}" needs a primary material`);
    checkSources(`set "${set.id}"`, set.sources, ctx);
  }
  for (const piece of content.pieces) {
    if (!formIds.has(piece.form)) fail(`piece "${piece.id}" names unknown form "${piece.form}"`);
    if (piece.set !== null && !setIds.has(piece.set)) {
      fail(`piece "${piece.id}" names unknown set "${piece.set}"`);
    }
    unlockOk(`piece "${piece.id}"`, piece.unlock);
    checkPrice(`piece "${piece.id}"`, piece.price, materialIds);
    if (piecePrice(content, piece.id).length === 0) fail(`piece "${piece.id}" has an empty price`);
    if (piece.sources !== undefined) checkSources(`piece "${piece.id}"`, piece.sources, ctx);
  }
  for (const skin of content.skins) {
    if (skin.set !== null && !setIds.has(skin.set)) {
      fail(`skin "${skin.id}" names unknown set "${skin.set}"`);
    }
    unlockOk(`skin "${skin.id}"`, skin.unlock);
    checkPrice(`skin "${skin.id}"`, skin.price, materialIds);
    if (skin.sources !== undefined) checkSources(`skin "${skin.id}"`, skin.sources, ctx);
    checkGen(skin);
    checkFits(content, skin);
  }
  const itemIds = new Set([...content.pieces.map((p) => p.id), ...content.skins.map((s) => s.id)]);
  const hut = freeHut(content);
  for (const part of content.parts) {
    checkPrice(`part "${part.id}"`, part.price, materialIds);
    if (part.price.length === 0 && part !== hut) fail(`part "${part.id}" has an empty price`);
    for (const u of part.unlocks) {
      if (!itemIds.has(u)) fail(`part "${part.id}" unlocks unknown item "${u}"`);
    }
  }
  for (const stamp of content.stamps) {
    const u = stamp.unlock;
    if (u.kind === 'journal-set' && !ctx.journalSets.includes(u.set)) {
      fail(`stamp "${stamp.id}" names unknown journal set "${u.set}"`);
    }
    if (u.kind === 'raid-boss' && !ctx.bosses.includes(u.boss)) {
      fail(`stamp "${stamp.id}" names unknown boss "${u.boss}"`);
    }
    if (u.kind === 'house-part' && !partIds.has(u.part)) {
      fail(`stamp "${stamp.id}" names unknown part "${u.part}"`);
    }
  }
}

/** A ground skin lists the outdoor room kinds it fits (at least one); no other skin lists any. */
function checkFits(content: HousingContent, skin: SkinDef): void {
  const what = `skin "${skin.id}"`;
  if (skin.kind !== 'ground') {
    if (skin.fits !== undefined) fail(`${what} is a ${skin.kind} skin and cannot list room kinds`);
    return;
  }
  if (skin.fits === undefined || skin.fits.length === 0)
    fail(`${what} is a ground skin that fits no room`);
  for (const id of skin.fits) {
    const room = content.rooms.find((r) => r.id === id);
    if (room === undefined) fail(`${what} fits unknown room kind "${id}"`);
    if (!room.outdoor) fail(`${what} fits "${id}", which is not an outdoor room`);
  }
}

/** A generated skin: only the room layers and the frame are generated, its colours are listed once, and a tier above 1 names a family. */
function checkGen(skin: SkinDef): void {
  const what = `skin "${skin.id}"`;
  if (skin.gen === undefined) {
    if (GENERATED_KINDS.has(skin.kind)) fail(`${what} is a ${skin.kind} skin without a pattern`);
    return;
  }
  if (!['wall', 'floor', 'trim', 'ceiling', 'frame'].includes(skin.kind)) {
    fail(`${what} is a ${skin.kind} skin and cannot be generated`);
  }
  if (skin.set !== null) fail(`${what} is generated and cannot belong to a set`);
  if (new Set(skin.gen.colours).size !== skin.gen.colours.length) {
    fail(`${what} lists a colour twice`);
  }
  // A look is stored as `<skin id>:<colour>` in a column value of at most 64 characters (`parseLook`).
  for (const colour of skin.gen.colours) {
    if (skin.id.length + 1 + colour.length > 64) {
      fail(`${what} in colour "${colour}" makes a look longer than 64 characters`);
    }
  }
  if (skin.gen.tier > 1 && skin.gen.family === undefined && skin.unlock.kind !== 'starter') {
    fail(`${what} is tier ${String(skin.gen.tier)} and needs a material family`);
  }
  if (skin.unlock.kind === 'drop' && skin.sources === undefined) {
    fail(`${what} drops but names no sources`);
  }
}

function checkMaterials(
  content: HousingContent,
  resources: readonly ResourceDef[],
  ctx: HousingLoadContext,
): void {
  for (const m of content.materials) {
    const res = resources.find((r) => r.id === m.id);
    if (res === undefined) fail(`material "${m.id}" has no resources.json entry`);
    if (res.kind !== 'luxury') {
      fail(`material "${m.id}" has a resources.json entry of kind "${res.kind}", not "luxury"`);
    }
    for (const place of m.places) {
      if (!ctx.destinations.includes(place))
        fail(`material "${m.id}" names unknown place "${place}"`);
    }
  }
}

/** The hut: the core part that is free and needs nothing (the house's first part). */
export function freeHut(content: HousingContent): PartDef | undefined {
  return content.parts.find(
    (p) => p.kind === 'core' && p.price.length === 0 && p.requires.length === 0,
  );
}

function checkStarter(content: HousingContent): void {
  const skin = (id: string) => content.skins.find((s) => s.id === id);
  if (skin(content.starter.roof)?.kind !== 'roof') {
    fail(`starter roof "${content.starter.roof}" is not a roof skin`);
  }
  if (skin(content.starter.walls)?.kind !== 'walls') {
    fail(`starter walls "${content.starter.walls}" is not a walls skin`);
  }
  const hut = freeHut(content);
  const hearth = hut?.rooms[0];
  if (hearth === undefined) fail('there is no free core part with a first room (the hut)');
  for (const [spotId, pieceId] of Object.entries(content.starter.layout)) {
    if (!content.pieces.some((p) => p.id === pieceId)) {
      fail(`starter layout names unknown piece "${pieceId}"`);
    }
    if (!canPlace(content, hearth.kind, spotId, pieceId)) {
      fail(`starter layout: piece "${pieceId}" does not fit spot "${spotId}" of "${hearth.kind}"`);
    }
  }
}

/**
 * Validates the raw housing files and every cross reference, and returns the content. Throws an `Error` naming the first
 * problem. `resources` is the resource library (every material needs a `luxury` entry); `ctx` names the journal sets,
 * raid bosses and destinations that exist.
 */
export function loadHousingContent(
  raw: unknown,
  resources: readonly ResourceDef[],
  ctx: HousingLoadContext,
): HousingContent {
  const parsed = v.safeParse(HousingContentSchema, raw);
  if (!parsed.success) {
    const issue = parsed.issues[0];
    const path = (issue?.path ?? []).map((p) => String((p as { key: unknown }).key)).join('.');
    fail(`${path === '' ? 'shape' : path}: ${issue?.message ?? 'invalid'}`);
  }
  const content = parsed.output;
  uniqueIds(
    'form',
    content.forms.map((f) => f.id),
  );
  uniqueIds(
    'room kind',
    content.rooms.map((r) => r.id),
  );
  uniqueIds(
    'part',
    content.parts.map((p) => p.id),
  );
  uniqueIds(
    'material',
    content.materials.map((m) => m.id),
  );
  uniqueIds(
    'set',
    content.sets.map((s) => s.id),
  );
  uniqueIds(
    'stamp',
    content.stamps.map((s) => s.id),
  );
  uniqueIds('piece or skin', [
    ...content.pieces.map((p) => p.id),
    ...content.skins.map((s) => s.id),
  ]);
  checkRooms(content);
  checkParts(content);
  checkMaterials(content, resources, ctx);
  checkItems(content, ctx);
  checkStarter(content);
  return content;
}

/**
 * The looks a room or a house wears (`docs/design/housing-interior.md`): which skin a layer shows and, for a generated skin, in which
 * colour. A look value is a skin id (`cosy-wall`, `thatch`) or, for a generated skin, `<skin id>:<colour>` (`paper-damask:rose`). The
 * one place that reads, writes and checks them, for the server's validation and the client's pickers alike. Pure.
 */
import type { HousingContent, SkinDef, SkinKind } from './schema';

/** The layers a room chooses (an outdoor room's `floor` is its ground), and the layers of the whole house. */
export const ROOM_LAYERS = ['wall', 'floor', 'trim', 'ceiling'] as const;
export type RoomLayer = (typeof ROOM_LAYERS)[number];
export const HOUSE_LAYERS = ['roof', 'walls', 'frame'] as const;
export type HouseLayer = (typeof HOUSE_LAYERS)[number];

/** The layers that may be left bare (`null`): the room or house then looks as it was built. */
export const BARE_LAYERS: ReadonlySet<string> = new Set(['trim', 'ceiling', 'frame']);

/** Ids are kebab-case words; a look adds `:colour`. */
const LOOK_RE = /^([a-z][a-z0-9]*(?:-[a-z0-9]+)*)(?::([a-z][a-z0-9]*(?:-[a-z0-9]+)*))?$/;

export interface Look {
  skin: string;
  /** The colour of a generated skin, or null for a drawn one. */
  colour: string | null;
}

/** A look value split into its skin and colour; null when it is not of the shape `<id>` or `<id>:<id>`. */
export function parseLook(value: string): Look | null {
  if (value.length > 64) return null;
  const m = LOOK_RE.exec(value);
  if (m === null || m[1] === undefined) return null;
  return { skin: m[1], colour: m[2] ?? null };
}

/** The value of a skin in a colour (a drawn skin has none). */
export function lookValue(skin: string, colour: string | null): string {
  return colour === null ? skin : `${skin}:${colour}`;
}

/** The skin a look value names, or undefined. */
export function lookSkin(content: Pick<HousingContent, 'skins'>, value: string): SkinDef | undefined {
  const look = parseLook(value);
  return look === null ? undefined : content.skins.find((s) => s.id === look.skin);
}

export type LookProblem = 'not_found' | 'skin_mismatch' | 'bad_colour';

/**
 * Whether a look value may be worn as `kind`: the skin exists and is of that kind; a generated skin names one of its colours and a
 * drawn one names none. Ownership is the caller's check (`ownsSkin`).
 */
export function checkLook(
  content: Pick<HousingContent, 'skins'>,
  value: string,
  kind: SkinKind,
): LookProblem | null {
  const look = parseLook(value);
  if (look === null) return 'not_found';
  const skin = content.skins.find((s) => s.id === look.skin);
  if (skin === undefined) return 'not_found';
  if (skin.kind !== kind) return 'skin_mismatch';
  if (skin.gen === undefined) return look.colour === null ? null : 'bad_colour';
  return look.colour !== null && skin.gen.colours.includes(look.colour) ? null : 'bad_colour';
}

/**
 * Whether a player has a skin: a held row, or a starter (owned by rule, so a house made before a starter was added has it too,
 * with no row written).
 */
export function ownsSkin(skin: Pick<SkinDef, 'unlock'>, held: boolean): boolean {
  return held || skin.unlock.kind === 'starter';
}

/** A generated skin's first colour: what its picture shows in a list. */
export function defaultLook(skin: Pick<SkinDef, 'id' | 'gen'>): string {
  const first = skin.gen?.colours[0];
  return first === undefined ? skin.id : lookValue(skin.id, first);
}

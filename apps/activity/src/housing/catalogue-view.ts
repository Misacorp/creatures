/**
 * The catalogue as plain data (`CataloguePanel.tsx` draws it): everything that exists, by kind, with owned and placed
 * counts; what the player has not found is a silhouette with a one-line hint. Pure.
 */
import { housing, resourceName, type CatalogueView, type SpotType } from '@creatures/game';
import { setName } from './house-names';

export type CatalogueKind = 'furniture' | 'garden' | 'skins' | 'stamps' | 'materials' | 'parts';

/**
 * The kinds the catalogue shows as tabs: four, so they fit one row on a 390 px phone. The garden and pool pieces are the last groups
 * of Furniture; the parts are the Build page's (each part is its own page there).
 */

export const CATALOGUE_KINDS: readonly { id: CatalogueKind; label: string }[] = [
  { id: 'furniture', label: 'Furniture' },
  { id: 'skins', label: 'Skins' },
  { id: 'stamps', label: 'Stamps' },
  { id: 'materials', label: 'Materials' },
];

/** What a tile draws: a house item's art (piece, skin, stamp), or a bundled glyph (a material, a part). */
export type TilePicture = { kind: 'house'; id: string } | { kind: 'glyph'; id: string };

export interface CatalogueTile {
  id: string;
  /** The name, or "Unknown" for something not found yet. */
  name: string;
  /** Not found: drawn as a silhouette, named "Unknown". */
  unknown: boolean;
  picture: TilePicture;
  /** The one line: the hint (where it comes from). */
  hint: string;
  /** The flavour line, once it is owned. */
  line: string | null;
  /** The set's name, for the tag, or null. */
  set: string | null;
  /** How many the player owns (a material: held; a skin, stamp or part: 1 or 0). */
  owned: number;
  /** Placed in the house (furniture only; null elsewhere). */
  placed: number | null;
  /** The count drawn in the tile's corner (0: none): copies of a piece above one, a material held. */
  badge: number;
  /** Known but none owned yet: drawn dimmed. */
  dim: boolean;
  /** The spoken name of the tile's button. */
  label: string;
}

export interface CatalogueGroup {
  id: string;
  title: string;
  tiles: CatalogueTile[];
  /** Found in this group, and its size. */
  found: number;
}

const OUTDOOR: ReadonlySet<SpotType> = new Set([
  'yard-large',
  'yard-small',
  'fence',
  'poolside',
  'water',
]);

/** How many things the player has found out of all that exist (the header's "48 / 196 found"). */
export function catalogueTotals(c: CatalogueView): { found: number; total: number } {
  const found =
    c.pieces.filter((p) => p.owned > 0).length +
    c.skins.filter((s) => s.owned).length +
    c.stamps.filter((s) => s.owned).length +
    c.materials.filter((m) => m.have > 0).length +
    c.parts.filter((p) => p.built).length;
  const total =
    c.pieces.length + c.skins.length + c.stamps.length + c.materials.length + c.parts.length;
  return { found, total };
}

function spokenOf(
  name: string,
  unknown: boolean,
  hint: string,
  owned: number,
  placed: number | null,
): string {
  if (unknown) return `Unknown. ${hint}`;
  const counts =
    placed === null ? `${String(owned)} owned` : `${String(owned)} owned, ${String(placed)} placed`;
  return `${name}, ${counts}`;
}

function group(id: string, title: string, tiles: CatalogueTile[]): CatalogueGroup {
  return { id, title, tiles, found: tiles.filter((t) => !t.unknown && t.owned > 0).length };
}

function pieceTiles(
  c: CatalogueView,
  wanted: (form: string) => boolean,
): Map<string | null, CatalogueTile[]> {
  const bySet = new Map<string | null, CatalogueTile[]>();
  for (const def of housing.pieces) {
    if (!wanted(def.form)) continue;
    const entry = c.pieces.find((p) => p.id === def.id);
    if (entry === undefined) continue;
    const unknown = !entry.known && entry.owned === 0;
    const tile: CatalogueTile = {
      id: def.id,
      name: unknown ? 'Unknown' : def.name,
      unknown,
      picture: { kind: 'house', id: def.id },
      hint: def.hint,
      line: entry.owned > 0 ? def.line : null,
      set: setName(def.set),
      owned: entry.owned,
      placed: entry.placed,
      badge: entry.owned > 1 ? entry.owned : 0,
      dim: !unknown && entry.owned === 0,
      label: spokenOf(def.name, unknown, def.hint, entry.owned, entry.placed),
    };
    bySet.set(def.set, [...(bySet.get(def.set) ?? []), tile]);
  }
  return bySet;
}

function furnitureGroups(c: CatalogueView, outdoor: boolean): CatalogueGroup[] {
  const spots = new Map(housing.forms.map((f) => [f.id, f.spot]));
  const isOutdoor = (form: string) => {
    const spot = spots.get(form);
    return spot !== undefined && OUTDOOR.has(spot);
  };
  const bySet = pieceTiles(c, (form) => isOutdoor(form) === outdoor);
  const out: CatalogueGroup[] = [];
  for (const set of housing.sets) {
    const tiles = bySet.get(set.id);
    if (tiles !== undefined) out.push(group(set.id, setName(set.id) ?? set.id, tiles));
  }
  const loose = bySet.get(null);
  if (loose !== undefined)
    out.push(
      group(outdoor ? 'garden' : 'wild', outdoor ? 'Garden and pool' : 'Wild pieces', loose),
    );
  return out;
}

function skinGroups(c: CatalogueView): CatalogueGroup[] {
  const bySet = new Map<string | null, CatalogueTile[]>();
  for (const def of housing.skins) {
    const entry = c.skins.find((s) => s.id === def.id);
    if (entry === undefined) continue;
    const unknown = !entry.known && !entry.owned;
    const tile: CatalogueTile = {
      id: def.id,
      name: unknown ? 'Unknown' : def.name,
      unknown,
      picture: { kind: 'house', id: def.id },
      hint: def.hint,
      line: null,
      set: setName(def.set),
      owned: entry.owned ? 1 : 0,
      placed: null,
      badge: 0,
      dim: !unknown && !entry.owned,
      label: spokenOf(def.name, unknown, def.hint, entry.owned ? 1 : 0, null),
    };
    bySet.set(def.set, [...(bySet.get(def.set) ?? []), tile]);
  }
  const out: CatalogueGroup[] = [];
  for (const set of housing.sets) {
    const tiles = bySet.get(set.id);
    if (tiles !== undefined) out.push(group(set.id, setName(set.id) ?? set.id, tiles));
  }
  const exterior = bySet.get(null);
  if (exterior !== undefined) out.push(group('exterior', 'Roofs, walls and ground', exterior));
  return out;
}

/** The tiles of one kind, in groups (a set per group for furniture and skins; one group otherwise). */
export function catalogueGroups(c: CatalogueView, kind: CatalogueKind): CatalogueGroup[] {
  switch (kind) {
    case 'furniture':
      return [...furnitureGroups(c, false), ...furnitureGroups(c, true)];
    case 'garden':
      return furnitureGroups(c, true);
    case 'skins':
      return skinGroups(c);
    case 'stamps':
      return [
        group(
          'stamps',
          'Stamps',
          housing.stamps.flatMap((def) => {
            const entry = c.stamps.find((s) => s.id === def.id);
            if (entry === undefined) return [];
            return [
              {
                id: def.id,
                name: entry.owned ? def.name : 'Unknown',
                unknown: !entry.owned,
                picture: { kind: 'house' as const, id: def.id },
                hint: def.hint,
                line: entry.owned ? def.line : null,
                set: null,
                owned: entry.owned ? 1 : 0,
                placed: null,
                badge: 0,
                dim: false,
                label: spokenOf(def.name, !entry.owned, def.hint, 1, null),
              },
            ];
          }),
        ),
      ];
    case 'materials':
      return [
        group(
          'materials',
          'Materials',
          housing.materials.flatMap((def) => {
            const entry = c.materials.find((m) => m.id === def.id);
            if (entry === undefined) return [];
            return [
              {
                id: def.id,
                name: resourceName(def.id),
                unknown: false,
                picture: { kind: 'glyph' as const, id: `lux-${def.id}` },
                hint: def.hint,
                line: def.line,
                set: null,
                owned: entry.have,
                placed: null,
                badge: entry.have,
                dim: entry.have === 0,
                label: `${resourceName(def.id)}, ${String(entry.have)} held`,
              },
            ];
          }),
        ),
      ];
    case 'parts':
      return [
        group(
          'parts',
          'Parts',
          housing.parts.flatMap((def) => {
            const entry = c.parts.find((p) => p.id === def.id);
            if (entry === undefined) return [];
            return [
              {
                id: def.id,
                name: def.name,
                unknown: false,
                picture: { kind: 'glyph' as const, id: 'house-nav' },
                hint: def.line,
                line: null,
                set: null,
                owned: entry.built ? 1 : 0,
                placed: null,
                badge: 0,
                dim: !entry.built,
                label: `${def.name}, ${entry.built ? 'built' : 'not built'}`,
              },
            ];
          }),
        ),
      ];
  }
}

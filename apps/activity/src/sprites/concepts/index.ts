/**
 * The art library: sprites drawn ahead of their content. A concept has a working code (`void-guard`), a
 * kind (which sets its size and rules) and a note, but no name, stats or lore; nothing in the game
 * imports this folder. `scripts/art.mts` draws and lints a set; when the content lands, the sprite
 * moves into `data/` under the species id and the concept is deleted (`docs/design/art-studio.md`).
 * `pnpm art library` writes the catalogue, `docs/art/README.md`, and a sheet per set; `pnpm check`
 * fails when the catalogue is out of date.
 */
import type { SpriteDef } from '../sprite-data';
import type { ArtKind } from '../sprite-lint';
import { VOID_CONCEPTS } from './void';
import { VOID_FOES_CONCEPTS } from './void-foes';
import { VOID_GEAR_CONCEPTS } from './void-gear';
import { VOID_PLACE_CONCEPTS } from './void-place';
import { VALLEY_POSTERS_CONCEPTS } from './valley-posters';
import { VALLEY_NIGHT_CONCEPTS } from './valley-night';
import { VALLEY_LANDMARK_CONCEPTS } from './valley-landmarks';

export interface Concept {
  kind: ArtKind;
  /** For a creature: the role it is drawn for (guard, setter, support, payoff). */
  role?: string;
  /** One line: the idea, what the silhouette should say. */
  note: string;
  sprite: SpriteDef;
  /** Other palettes to compare (a colour direction, a shiny), as palette overrides by name. */
  alts?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** Other whole drawings to compare (an item with its element's flair), by name. */
  variants?: Readonly<Record<string, SpriteDef>>;
  /** Overrides the set's status for this sprite. */
  status?: ConceptStatus;
}

/**
 * `draft`: drawn, Misa has not said yet. `liked`: Misa approved the look; use it when the content
 * comes. `redo`: Misa wants it changed before use (say what in `notes`).
 */
export type ConceptStatus = 'draft' | 'liked' | 'redo';

export interface ConceptSet {
  /** The set's code, also the studio's argument (`art.mts void`). */
  id: string;
  title: string;
  /** The element whose colour family the set is checked against. */
  element?: string;
  /** What Misa asked for, with the date (`2026-10-30: four Void creatures, one per role`). */
  requested: string;
  status: ConceptStatus;
  /** What the content needs to use this art, Misa's feedback, open ideas. One line each. */
  notes?: readonly string[];
  sprites: Readonly<Record<string, Concept>>;
}

export const CONCEPT_SETS: readonly ConceptSet[] = [
  VOID_CONCEPTS,
  VOID_FOES_CONCEPTS,
  VOID_GEAR_CONCEPTS,
  VOID_PLACE_CONCEPTS,
  VALLEY_POSTERS_CONCEPTS,
  VALLEY_NIGHT_CONCEPTS,
  VALLEY_LANDMARK_CONCEPTS,
];

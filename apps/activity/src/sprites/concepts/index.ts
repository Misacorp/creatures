/**
 * Concept art: sprites drawn ahead of their content. A concept has a working code (`void-guard`), a
 * kind (which sets its size and rules) and a note, but no name, stats or lore; nothing in the game
 * imports this folder. `scripts/art.mts` draws and lints a set; when the content lands, the sprite
 * moves into `data/` under the species id and the concept is deleted (`docs/design/art-studio.md`).
 */
import type { SpriteDef } from '../sprite-data';
import type { ArtKind } from '../sprite-lint';
import { VOID_CONCEPTS } from './void';

export interface Concept {
  kind: ArtKind;
  /** For a creature: the role it is drawn for (guard, setter, support, payoff). */
  role?: string;
  /** One line: the idea, what the silhouette should say. */
  note: string;
  sprite: SpriteDef;
  /** Other palettes to compare (a colour direction, a shiny), as palette overrides by name. */
  alts?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export interface ConceptSet {
  /** The set's code, also the studio's argument (`art.mts void`). */
  id: string;
  title: string;
  /** The element whose colour family the set is checked against. */
  element?: string;
  sprites: Readonly<Record<string, Concept>>;
}

export const CONCEPT_SETS: readonly ConceptSet[] = [VOID_CONCEPTS];

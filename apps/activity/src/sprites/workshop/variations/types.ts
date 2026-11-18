import type { PieceArt } from '../../../housing/house-art';
import type { SpriteDef } from '../../sprite-data';
import type { FormId } from '../style';

/**
 * An art option for a shipped set, laid over the set as it ships when the room sheet is drawn with `--variation <id>`
 * (`pnpm housing sheet <set> --room --variation <id>`). A variation never changes the game or the lock.
 */
export interface Variation {
  id: string;
  /** The shipped set it applies to. */
  set: string;
  /** What it is, for the sheet's title. */
  name: string;
  /** A wallpaper and floor tile that replace the set's. */
  wall?: SpriteDef;
  floor?: SpriteDef;
  /** Pieces by form that replace the set's. */
  pieces?: Partial<Record<FormId, PieceArt>>;
}

/**
 * The sets made in the workshop: the shipped ones (each pack file in `sprites/data/house/` exports its `SOURCE`) and
 * the sample styles that are not content. `lockOf` is what `shipped-art.json` records.
 */
import { SOURCE as TIDEPOOL } from '../data/house/tidepool';
import { SOURCE as MOONLIT } from '../data/house/moonlit';
import { SOURCE as EMBERHOLD } from '../data/house/emberhold';
import { SOURCE as ROOTWOOD } from '../data/house/rootwood';
import { SOURCE as STORMGLASS } from '../data/house/stormglass';
import { SOURCE as FENKEEPER } from '../data/house/fenkeeper';
import { SOURCE as ANCIENT } from '../data/house/ancient';
import { SOURCE as LANTERN_NIGHT } from '../data/house/lantern-night';
import { pieceHash } from './compare';
import { makePiece, pieceId, setReport, type SetSource } from './pack';
import { PLAIN_PINE } from './sample/plain-pine';
import { SET_FORMS, type Style } from './style';

export const SHIPPED_SETS: Readonly<Record<string, SetSource>> = {
  tidepool: TIDEPOOL,
  moonlit: MOONLIT,
  emberhold: EMBERHOLD,
  rootwood: ROOTWOOD,
  stormglass: STORMGLASS,
  fenkeeper: FENKEEPER,
  ancient: ANCIENT,
  'lantern-night': LANTERN_NIGHT,
};

export const SAMPLE_STYLES: Readonly<Record<string, Style>> = {
  'plain-pine': PLAIN_PINE,
};

/** Per shipped piece: how it is made and the hash of what ships. */
export function lockOf(): Record<string, { made: string; hash: string }> {
  const lock: Record<string, { made: string; hash: string }> = {};
  for (const source of Object.values(SHIPPED_SETS)) {
    const report = setReport(source);
    for (const [i, form] of SET_FORMS.entries()) {
      lock[pieceId(source.style, form)] = {
        made: report[i]?.made ?? 'generated',
        hash: pieceHash(makePiece(source, form)),
      };
    }
  }
  return lock;
}

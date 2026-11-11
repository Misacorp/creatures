/**
 * The sets made in the workshop: the shipped ones (each pack file in `sprites/data/house/` exports its `SOURCE`) and
 * the sample styles that are not content. `lockOf` is what `shipped-art.json` records.
 */
import { pieceHash } from './compare';
import { makePiece, pieceId, setReport, type SetSource } from './pack';
import { PLAIN_PINE } from './sample/plain-pine';
import { SET_FORMS, type Style } from './style';

export const SHIPPED_SETS: Readonly<Record<string, SetSource>> = {};

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

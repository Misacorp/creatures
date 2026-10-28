import { RULES } from './config';

export type CreatureNoteResult =
  { ok: true; value: string | null } | { ok: false; reason: 'too_long' | 'forbidden_characters' };

/**
 * Validates a player's private note on a creature. Like a nickname nothing is silently stripped:
 * control (Cc, apart from line breaks and tabs), format (Cf: zero-width, bidi), unassigned (Cn),
 * surrogate (Cs) and Unicode line and paragraph separator characters are rejected. The text is
 * NFKC-normalised; line breaks become `\n` and at most one empty line in a row is kept, tabs become
 * spaces, each line loses its trailing spaces and the ends are trimmed. Then it must be at most 256
 * code points. Empty gives `{ ok: true, value: null }`, which means "no note". The result is plain
 * text: render it as text.
 */
export function sanitizeCreatureNote(raw: string): CreatureNoteResult {
  if (raw.length > RULES.creatureNote.maxRawLength) return { ok: false, reason: 'too_long' };
  const normalized = raw.normalize('NFKC').replace(/\r\n?/g, '\n').replace(/\t/g, ' ');
  if (/[\p{Cf}\p{Cn}\p{Cs}\p{Zl}\p{Zp}]|(?!\n)\p{Cc}/u.test(normalized)) {
    return { ok: false, reason: 'forbidden_characters' };
  }
  const value = normalized
    .replace(/[^\S\n]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (value === '') return { ok: true, value: null };
  // Array.from counts code points, so emoji and other astral characters count once.
  if (Array.from(value).length > RULES.creatureNote.maxCodePoints) {
    return { ok: false, reason: 'too_long' };
  }
  return { ok: true, value };
}

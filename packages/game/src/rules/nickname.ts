import { RULES } from './config';

export type NicknameResult =
  | { ok: true; value: string | null }
  | { ok: false; reason: 'too_long' | 'forbidden_characters' | 'no_visible_characters' };

/**
 * Validates a player-chosen creature nickname. Nothing is silently stripped: strings with control
 * (Cc), format (Cf: zero-width, bidi), unassigned (Cn) or surrogate (Cs) characters are rejected.
 * The text is NFKC-normalised, trimmed and whitespace-collapsed, then must be 1 to 20 code points.
 * Empty after trimming gives `{ ok: true, value: null }`, which means "clear the nickname".
 * Strings made only of combining marks are rejected (nothing visible to attach them to).
 * The result is plain text: always render it as text, never as HTML.
 */
export function sanitizeNickname(raw: string): NicknameResult {
  if (raw.length > RULES.nickname.maxRawLength) return { ok: false, reason: 'too_long' };
  const normalized = raw.normalize('NFKC');
  if (/[\p{Cc}\p{Cf}\p{Cn}\p{Cs}]/u.test(normalized)) {
    return { ok: false, reason: 'forbidden_characters' };
  }
  const value = normalized.replace(/\s+/gu, ' ').trim();
  if (value === '') return { ok: true, value: null };
  if (!/[^\p{M}\s]/u.test(value)) return { ok: false, reason: 'no_visible_characters' };
  // Array.from counts code points, so emoji and other astral characters count once.
  if (Array.from(value).length > RULES.nickname.maxCodePoints) {
    return { ok: false, reason: 'too_long' };
  }
  return { ok: true, value };
}

export const MAX_DISPLAY_NAME_CODE_POINTS = 32;
export const FALLBACK_DISPLAY_NAME = 'Player';

/**
 * Cleans a Discord-provided name for storage and display (plain text only).
 * NFKC-normalises, drops control (Cc), format (Cf: zero-width and bidi controls), unassigned (Cn)
 * and lone-surrogate (Cs) characters, collapses whitespace, trims, and truncates to 32 code points.
 * Falls back to "Player" if nothing printable is left (including strings of only combining marks).
 */
export function sanitizeDisplayName(raw: string): string {
  const cleaned = raw
    .normalize('NFKC')
    // Zero-width and bidi characters are Cf, which JS also counts as whitespace (U+FEFF), so drop
    // them before collapsing whitespace.
    .replace(/[\p{Cf}\p{Cn}\p{Cs}]/gu, '')
    // Whitespace before other controls, so "a\nb" becomes "a b" instead of "ab".
    .replace(/\s+/gu, ' ')
    .replace(/\p{Cc}/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  // Array.from iterates by code point, so surrogate pairs are never split.
  const truncated = Array.from(cleaned).slice(0, MAX_DISPLAY_NAME_CODE_POINTS).join('').trim();
  // Only combining marks and spaces: nothing visible to anchor them to.
  if (!/[^\p{M}\s]/u.test(truncated)) {
    return FALLBACK_DISPLAY_NAME;
  }
  return truncated;
}

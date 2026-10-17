export const MIN_FEEDBACK_CODE_POINTS = 10;
export const MAX_FEEDBACK_CODE_POINTS = 1500;

/**
 * Cleans a player's feedback text for storage (plain text only). Line breaks are normalised to `\n`
 * (and so are U+2028 and U+2029); tabs become spaces; every other control (Cc), format (Cf: zero-width
 * and bidi controls), and lone-surrogate (Cs) character is removed. Trailing spaces are cut from each
 * line, three or more line breaks in a row become two, and the ends are trimmed.
 */
export function cleanFeedbackText(raw: string): string {
  return raw
    .replace(/\r\n?|[\u2028\u2029]/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[\p{Cf}\p{Cs}]/gu, '')
    .replace(/(?!\n)\p{Cc}/gu, '')
    .replace(/[^\S\n]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The length in code points, which is what the 10 to 1500 limit counts. */
export function codePointLength(text: string): number {
  return Array.from(text).length;
}

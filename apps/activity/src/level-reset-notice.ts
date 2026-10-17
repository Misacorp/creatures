/**
 * The one-time card about the level reset (decisions.md, 2026-10-17): creatures now grow by doing things,
 * so every level was halved and the Bait those levels cost came back. The server decides everything and
 * sends counts; this only words them. Plain text, short and warm.
 */
import type { LevelResetNotice } from './api';

/** The lines of the card: the headline, then one short line for each side effect that happened. */
export function levelResetLines(notice: LevelResetNotice): string[] {
  const lines = [
    `Creatures now grow by doing things. Every creature's level was halved and you got back the Bait those levels cost: ${String(notice.bait)} Bait.`,
  ];
  if (notice.unequipped > 0) {
    lines.push(
      notice.unequipped === 1
        ? 'One worn item went back to your bag, because its creature is below its level now.'
        : `${String(notice.unequipped)} worn items went back to your bag, because their creatures are below their levels now.`,
    );
  }
  if (notice.talentsToBook > 0) {
    lines.push(
      notice.talentsToBook === 1
        ? 'One talent rests in its Talent Book until its slot opens again.'
        : `${String(notice.talentsToBook)} talents rest in their Talent Books until their slots open again.`,
    );
  }
  return lines;
}

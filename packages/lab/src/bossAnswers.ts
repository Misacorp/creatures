/**
 * The intended answers of each raid boss (P-13: the board only points at answers that work). An answer is a whole raid
 * line, because a raid answer is often a placement (who stands at the row ends, who stands beside a Payoff), not one
 * Knack. Each boss has two or more answers built on different tools: Knacks of different families, a talent, a
 * placement. The lines were found by the report's own team search with the tool required, then written down here as data,
 * so the report can show them winning against the classic party.
 *
 * Line format: forms as `form/knack` or `form/knack+talent`, separated by spaces, rows separated by `|`, one row per
 * arena row (four slots each, one column per player).
 */
import type { Pick } from './search';
import { RAID_COLS, RAID_SPECS } from './bosses';

export interface BossAnswer {
  /** What the player reads: the tool and the idea. */
  readonly label: string;
  /** The tool it is built on: a Knack family, a talent or a placement. */
  readonly tool: string;
  readonly line: string;
  /** Set when the answer is a talent: it is measured against the classic party with the same talent on every creature, not against the bare one. */
  readonly talent?: string;
}

/** A line spec as picks: rows in order, slots left to right. */
export function answerLine(spec: string): Pick[] {
  return spec
    .split('|')
    .flatMap((row) => row.trim().split(/\s+/))
    .filter((t) => t !== '')
    .map((token) => {
      const [form = '', rest = 'none'] = token.split('/');
      const [knack = 'none', ...talents] = rest.split('+');
      return { formId: form, knack, ...(talents.length ? { talents } : {}) };
    });
}

/** The slots a boss's arena holds. */
export const arenaSize = (bossId: string): number =>
  (RAID_SPECS.find((s) => s.id === bossId)?.rows ?? 0) * RAID_COLS;

export const BOSS_ANSWERS: Readonly<Record<string, readonly BossAnswer[]>> = {};

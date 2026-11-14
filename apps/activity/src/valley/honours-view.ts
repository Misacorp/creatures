/**
 * What a creature's honours look like (phase 5 step 9b, `systems/trials.md` V-TRIAL-1 to 3): the title ("Pip, Silver") and the honour's
 * name for the badge, the next trial as pips for its ticked boxes, and the trial's list for the popover a tap opens (a picture and a short
 * line per box, ticked or not). Pure: the server's `valley.creatures[].trial` in, words out. Honours are a badge, a title and a ribbon on
 * the sprite; they are never a stat or a gate (V-TRIAL-1), so nothing here says "locked".
 */
import {
  TRIALS,
  VALLEY_RULES,
  trialLevel,
  type TrialBoxId,
  type ValleyTrialView,
} from '@creatures/game';

/** An honour's name: 1 Bronze, 2 Silver, 3 Gold; null for none. */
export const honourName = (honour: number): string | null =>
  (['Bronze', 'Silver', 'Gold'] as const)[honour - 1] ?? null;

/** The creature's name with its honour: "Pip, Silver"; the plain name with none. */
export function honourTitle(name: string, honour: number): string {
  const word = honourName(honour);
  return word === null ? name : `${name}, ${word}`;
}

/** The picture and the short line of each box of the trials (the glyphs are the game's own). */
const BOX_TEXT: Readonly<Record<TrialBoxId, { glyph: string; label: string }>> = {
  dungeon: { glyph: 'lantern', label: 'Clear a dungeon run' },
  post: { glyph: 'satchel', label: 'A day at a post' },
  home: { glyph: 'gift', label: 'Bring something home, or smith for a day' },
  fire: { glyph: 'sparkle', label: 'A moment at the bonfire' },
  undercroft: { glyph: 'map-keeper', label: 'Beat an Undercroft keeper' },
  craft: { glyph: 'anvil', label: 'Expert at any work, or a Rare piece made' },
  further: { glyph: 'compass', label: 'Go further: a deeper way, or a keystone' },
  raid: { glyph: 'blade', label: 'Help beat a raid boss' },
  master: { glyph: 'gem', label: 'Master at any work, or an Epic piece made' },
  teacher: { glyph: 'hand', label: 'A week at a communal seat' },
};

/** The glyph ids the boxes use (a test checks every one is a real glyph). */
export const BOX_GLYPHS: readonly string[] = Object.values(BOX_TEXT).map((b) => b.glyph);

/** One box of the next trial: what it asks and whether it is ticked. */
export interface TrialRow {
  id: TrialBoxId;
  glyph: string;
  label: string;
  ticked: boolean;
}

/** The next trial as a card shows it: its name, the level it opens at, the boxes and what is ticked; null once Gold is held. */
export interface NextTrial {
  tier: 1 | 2 | 3;
  name: string;
  /** The level the trial opens at (its boxes tick from then on). */
  level: number;
  rows: TrialRow[];
  ticked: number;
  ready: boolean;
}

export function nextTrial(trial: ValleyTrialView | undefined): NextTrial | null {
  if (trial === undefined || trial.tier === null) return null;
  const def = TRIALS[trial.tier - 1];
  if (def === undefined) return null;
  const rows = def.boxes.map((box, i): TrialRow => {
    const text = BOX_TEXT[box.id];
    return { id: box.id, glyph: text.glyph, label: text.label, ticked: trial.boxes[i] === true };
  });
  return {
    tier: trial.tier,
    name: def.name,
    level: trialLevel(trial.tier, VALLEY_RULES),
    rows,
    ticked: rows.filter((r) => r.ticked).length,
    ready: trial.ready,
  };
}

/** The pips' spoken name: "Bronze trial, 2 / 4 boxes ticked", or that it graduates at the next ceremony. */
export function trialLabel(next: NextTrial): string {
  return next.ready
    ? `${next.name} trial, every box ticked: graduates at the next ceremony`
    : `${next.name} trial, ${String(next.ticked)} / ${String(next.rows.length)} boxes ticked`;
}

/** The line under the popover's list: when the trial is ready it graduates, and a creature below the level waits for it. */
export function trialNote(next: NextTrial, creatureLevel: number): string {
  if (next.ready) return 'Every box is ticked. It graduates at the next ceremony.';
  if (creatureLevel < next.level) return `The boxes tick from level ${String(next.level)}.`;
  return 'Boxes tick as it lives its life in the valley.';
}

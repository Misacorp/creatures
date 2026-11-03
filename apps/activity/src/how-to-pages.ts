/**
 * Which sections the How to play page shows: the shipped twelve, or while the server plays combat v2 the six
 * combat v2 sections followed by the shipped sections about everything combat v2 does not change. Pure, so the
 * choice is tested; `HowToPlay.tsx` draws the page.
 */
import {
  howToPlay,
  howToPlayV2,
  type GlossarySection,
  type HowToPlaySection,
  type HowToPlayV2,
} from '@creatures/game';

/** A section of either page: its id, title and lines (a line may carry `{Keyword}` chips). */
export interface PageSection {
  id: GlossarySection;
  title: string;
  lines: readonly string[];
}

/**
 * The shipped sections the combat v2 page keeps, after its own six: the ones about trips, the dungeon, the Valley
 * Games and the gear and Workshop, which combat v2 does not touch. The others (the first week, creatures, combos,
 * the raid week, the finale, ranks and rewards) describe the shipped fights and are replaced by the six.
 */
export const V2_KEPT_SECTIONS: readonly GlossarySection[] = [
  'expeditions',
  'dungeon',
  'games',
  'gear',
  'workshop',
];

/** The sections of the page, in order. */
export function pageSections(
  v2: boolean,
  shipped: readonly HowToPlaySection[] = howToPlay.sections,
  combat: HowToPlayV2 = howToPlayV2,
): PageSection[] {
  if (!v2) return [...shipped];
  return [...combat.sections, ...shipped.filter((s) => V2_KEPT_SECTIONS.includes(s.id))];
}

/**
 * The v2 section that took over the subject of a shipped section the combat v2 page no longer has, so a popover
 * still written for the shipped page ("More in How to play" on a role or an element) lands somewhere useful.
 */
const V2_TAKEOVER: Readonly<Partial<Record<GlossarySection, GlossarySection>>> = {
  creatures: 'v2-knacks',
  combos: 'v2-marks',
  'raid-week': 'v2-weekend',
  finale: 'v2-weekend',
  ranks: 'v2-rank',
  rewards: 'v2-weekend',
};

/**
 * Where a "More in How to play" link leads: the section itself when the page has it, else the v2 section that took
 * over its subject, else the top of the page (null).
 */
export function sectionOnPage(
  section: GlossarySection | null,
  v2: boolean,
  sections: readonly PageSection[] = pageSections(v2),
): GlossarySection | null {
  if (section === null) return null;
  if (sections.some((s) => s.id === section)) return section;
  const takeover = v2 ? V2_TAKEOVER[section] : undefined;
  return takeover !== undefined && sections.some((s) => s.id === takeover) ? takeover : null;
}

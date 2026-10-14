/**
 * The pure parts of the tappable tags: which popover a tag opens, what picture it shows and where
 * "More in How to play" leads. No DOM access besides a duck-typed `closest` check, so all of it is
 * unit-tested; `Glossary.tsx` is the tag button and `PopoverHost.tsx` draws the popover.
 */
import {
  abilityView,
  entryView,
  type GlossarySection,
  type GlossaryView,
  type GlossaryVisual,
} from '@creatures/game';
import { markPalette } from './art';
import { glyphOrUnknown } from './glyphs';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { elementIcon } from './sprites/element-icons';
import type { SpriteDef } from './sprites/sprite-data';

/** What a tag points at: a glossary entry by id, or a finale ability by its content id. */
export type TagRef = { readonly entry: string } | { readonly ability: string };

/** The popover content of a tag, or undefined when the entry or ability is not in the content. */
export function resolveTag(ref: TagRef): GlossaryView | undefined {
  return 'ability' in ref ? abilityView(ref.ability) : entryView(ref.entry);
}

/** A stable key for a tag target, so two tags with the same meaning share a popover title. */
export function tagKey(ref: TagRef): string {
  return 'ability' in ref ? `a:${ref.ability}` : `e:${ref.entry}`;
}

/** The attribute every tag carries, so other code can tell a tag from a draggable thing. */
export const TAG_ATTRIBUTE = 'data-glossary-tag';

/**
 * True when a pointer went down on a tag (or inside one). The drag-and-drop hook ignores such a
 * press, so a tag never starts a drag: it only opens on a tap (the click that follows a press
 * without movement), and a drag that begins elsewhere is unaffected.
 */
export function startsOnTag(target: unknown): boolean {
  if (typeof target !== 'object' || target === null) return false;
  const closest = (target as { closest?: unknown }).closest;
  if (typeof closest !== 'function') return false;
  return (closest as (selector: string) => unknown).call(target, `[${TAG_ATTRIBUTE}]`) != null;
}

/** The DOM id of a How to play section, for the "More" link to scroll to. */
export function sectionDomId(section: GlossarySection): string {
  return `howto-${section}`;
}

/** The label of the link at the bottom of a popover. */
export const MORE_LABEL = 'More in How to play';

/** One piece of a popover's picture: a sprite, or the arrow between two of them. */
type VisualItem =
  | { kind: 'sprite'; sprite: SpriteDef; scale: number; palette?: Readonly<Record<string, string>> }
  | { kind: 'arrow' };

function iconOf(element: string): VisualItem[] {
  const icon = elementIcon(element);
  return icon === undefined ? [] : [{ kind: 'sprite', sprite: icon, scale: 4 }];
}

/**
 * What to draw for a popover's picture, from sprites the game already has. `reactionById` lets the
 * caller look a reaction up (the content has them); an unknown reaction draws nothing.
 */
export function visualPlan(
  visual: GlossaryVisual | undefined,
  reactionById: (id: string) => { markElement: string; triggerElement: string } | undefined,
): VisualItem[] {
  if (visual === undefined) return [];
  switch (visual.kind) {
    case 'element':
      return iconOf(visual.id);
    case 'species':
      return [{ kind: 'sprite', sprite: creatureSpriteOrFallback(visual.id), scale: 4 }];
    case 'glyph':
      return [{ kind: 'sprite', sprite: glyphOrUnknown(visual.id), scale: 4 }];
    case 'mark': {
      const palette = markPalette(visual.id);
      return [
        {
          kind: 'sprite',
          sprite: glyphOrUnknown('mark'),
          scale: 4,
          ...(palette === undefined ? {} : { palette }),
        },
        ...iconOf(visual.id),
      ];
    }
    case 'reaction': {
      const reaction = reactionById(visual.id);
      if (reaction === undefined) return [];
      const palette = markPalette(reaction.markElement);
      return [
        {
          kind: 'sprite',
          sprite: glyphOrUnknown('mark'),
          scale: 3,
          ...(palette === undefined ? {} : { palette }),
        },
        ...iconOf(reaction.markElement),
        { kind: 'arrow' },
        ...iconOf(reaction.triggerElement),
      ];
    }
  }
}

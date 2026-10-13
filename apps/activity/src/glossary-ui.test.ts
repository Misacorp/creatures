import { content, glossary } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { DRAG_THRESHOLD, move, press } from './dnd-core';
import {
  MORE_LABEL,
  TAG_ATTRIBUTE,
  resolveTag,
  sectionDomId,
  startsOnTag,
  tagKey,
  toggleTag,
  visualPlan,
  type ActiveTag,
} from './glossary-ui';
import { glyph } from './glyphs';
import { BUNDLED_CREATURE_SPRITES } from './sprites/creature-sprites';
import { elementIcon } from './sprites/element-icons';

const reaction = (id: string) => content.reactions.find((r) => r.id === id);

describe('what a tag opens', () => {
  it('resolves a glossary entry by id and an ability by its content id', () => {
    const element = resolveTag({ entry: 'element-tide' });
    expect(element?.title).toBe('Tide');
    expect(element?.section).toBe('creatures');
    const ability = resolveTag({ ability: 'flare-strike' });
    expect(ability?.title).toBe('Flare Strike');
    // The popover explains the thing tapped: its own effect line first.
    expect(ability?.short).toContain('220%');
  });

  it('has nothing for ids that are not in the content', () => {
    expect(resolveTag({ entry: 'no-such-entry' })).toBeUndefined();
    expect(resolveTag({ ability: 'no-such-ability' })).toBeUndefined();
  });

  it('opens something for every glossary entry and every ability', () => {
    for (const e of glossary) expect(resolveTag({ entry: e.id }), e.id).toBeDefined();
    for (const a of content.finaleAbilities) {
      expect(resolveTag({ ability: a.id }), a.id).toBeDefined();
    }
  });

  it('keys an entry and an ability with the same id differently', () => {
    expect(tagKey({ entry: 'rally' })).not.toBe(tagKey({ ability: 'rally' }));
    expect(tagKey({ entry: 'bait' })).toBe(tagKey({ entry: 'bait' }));
  });

  it('names the page section a popover links to', () => {
    expect(sectionDomId('combos')).toBe('howto-combos');
    expect(MORE_LABEL).toBe('More in How to play');
  });
});

describe('tapping a tag', () => {
  const anchorA = { id: 'a' };
  const anchorB = { id: 'b' };
  const tag = (entry: string, anchor: { id: string }): ActiveTag<{ id: string }> => ({
    key: tagKey({ entry }),
    ref: { entry },
    anchor,
  });

  it('opens the popover of a tag when nothing is open', () => {
    const next = tag('bait', anchorA);
    expect(toggleTag(null, next)).toBe(next);
  });

  it('closes it when the same tag is tapped again', () => {
    const open = tag('bait', anchorA);
    expect(toggleTag(open, tag('bait', anchorA))).toBeNull();
  });

  it('switches to another tag', () => {
    const open = tag('bait', anchorA);
    const other = tag('essence', anchorB);
    expect(toggleTag(open, other)).toBe(other);
  });

  it('switches when another tag with the same meaning is tapped (another place on the page)', () => {
    const open = tag('bait', anchorA);
    const other = tag('bait', anchorB);
    expect(toggleTag(open, other)).toBe(other);
  });
});

describe('a tag never starts a drag', () => {
  const fakeElement = (insideTag: boolean) => ({
    closest: (selector: string) => (insideTag && selector === `[${TAG_ATTRIBUTE}]` ? {} : null),
  });

  it('is recognised from the element a press started on, or one of its parents', () => {
    expect(TAG_ATTRIBUTE).toBe('data-glossary-tag');
    expect(startsOnTag(fakeElement(true))).toBe(true);
    expect(startsOnTag(fakeElement(false))).toBe(false);
  });

  it('is false for targets that are not elements', () => {
    expect(startsOnTag(null)).toBe(false);
    expect(startsOnTag(undefined)).toBe(false);
    expect(startsOnTag({})).toBe(false);
    expect(startsOnTag('tag')).toBe(false);
    expect(startsOnTag({ closest: 'not a function' })).toBe(false);
  });

  it('leaves a press that moves less than the threshold a tap, so the browser sends a click', () => {
    // The drag code only turns a press into a drag after DRAG_THRESHOLD pixels of movement.
    const down = press('creature', { x: 10, y: 10 });
    const jitter = move(down, { x: 10 + DRAG_THRESHOLD - 1, y: 10 }, null);
    expect(jitter.phase).toBe('pending');
    const dragged = move(down, { x: 10 + DRAG_THRESHOLD, y: 10 }, null);
    expect(dragged.phase).toBe('dragging');
  });
});

describe('the picture of a popover', () => {
  it('has a sprite for every element, species and glyph a glossary entry points at', () => {
    for (const e of glossary) {
      const visual = e.visual;
      if (visual === undefined) continue;
      if (visual.kind === 'element' || visual.kind === 'mark') {
        expect(elementIcon(visual.id), e.id).toBeDefined();
      }
      if (visual.kind === 'species') {
        expect(Object.hasOwn(BUNDLED_CREATURE_SPRITES, visual.id), e.id).toBe(true);
      }
      if (visual.kind === 'glyph') expect(glyph(visual.id), e.id).toBeDefined();
      expect(visualPlan(visual, reaction).length, e.id).toBeGreaterThan(0);
    }
  });

  it('draws nothing without a picture or for a reaction that does not exist', () => {
    expect(visualPlan(undefined, reaction)).toEqual([]);
    expect(visualPlan({ kind: 'reaction', id: 'nothing' }, reaction)).toEqual([]);
  });

  it('draws a reaction as the mark, an arrow and the element that cashes it in', () => {
    const plan = visualPlan({ kind: 'reaction', id: 'overload' }, reaction);
    expect(plan.map((item) => item.kind)).toEqual(['sprite', 'sprite', 'arrow', 'sprite']);
  });

  it('tints the mark with its element and adds the element icon', () => {
    const plan = visualPlan({ kind: 'mark', id: 'tide' }, reaction);
    expect(plan).toHaveLength(2);
    const first = plan[0];
    expect(first?.kind).toBe('sprite');
    expect(first?.kind === 'sprite' ? first.palette?.['m'] : undefined).toBe('#4f8fe6');
  });
});

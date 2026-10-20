import { content } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { elementClass, markPalette } from './art';
import { ELEMENT_OPTIONS } from './creature-find';
import { elementIcon } from './sprites/element-icons';

const styles = import.meta.glob<string>('./styles/**/*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const css = (file: string): string => styles[`./styles/${file}`] ?? '';

/** Every element of the content is drawn with its colour and icon wherever the UI keys on elements. */
describe('every element has its look', () => {
  const ids = content.elements.map((e) => e.id);

  it('has a colour token, an icon and a mark colour', () => {
    const tokens = css('base/tokens.css');
    expect(tokens).not.toBe('');
    for (const id of ids) {
      expect(tokens, id).toContain(`--${id}:`);
      expect(elementIcon(id), id).toBeDefined();
      expect(markPalette(id), id).toBeDefined();
      expect(elementClass(id)).toBe(`el-${id}`);
    }
  });

  it('has the chip, the card colour and the cue colour classes', () => {
    for (const id of ids) {
      expect(css('components/element-chip.css'), id).toContain(`.t-${id} `);
      expect(css('components/creature-card.css'), id).toContain(`.el-${id} `);
      expect(css('components/slot-cue.css'), id).toContain(`.cue-el-${id} `);
    }
  });

  it('is in the Creatures filter chips, in the content order', () => {
    expect(ELEMENT_OPTIONS.map((e) => e.id)).toEqual(ids);
  });

  it('colours both elements of every reaction (Smother and Flare too), so a burst has its colours', () => {
    for (const r of content.reactions) {
      expect(ids, r.id).toContain(r.markElement);
      expect(ids, r.id).toContain(r.triggerElement);
    }
    expect(content.reactions.map((r) => r.id)).toEqual(
      expect.arrayContaining(['smother', 'flare']),
    );
  });
});

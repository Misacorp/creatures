import { describe, expect, it } from 'vitest';

/**
 * The room intro's countdown outline (Misa, 2026-10-15): a yellow outline round the stage that drains
 * toward the bottom over the time the room card is up. It is a CSS animation (`dungeon-banner-motion.css`,
 * with a few big steps for reduced motion, over the same time); the code only adds the layer and sets
 * the duration as a custom property, never an inline `style=`. Components are not rendered in tests,
 * so this reads the JSX of `DungeonPlayback.tsx`. (Vitest does not load stylesheets, so the CSS itself
 * is checked in the browser, with and without reduced motion.)
 */
const files = import.meta.glob<string>('./DungeonPlayback.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const tsx = files['./DungeonPlayback.tsx'] ?? '';

describe('the room intro countdown outline', () => {
  it('finds the source', () => {
    expect(tsx).toContain('RoomBanner');
  });

  it('is a layer of the banner, driven by the banner duration', () => {
    expect(tsx).toContain('class="rb-timer"');
    expect(tsx).toContain("'--fx-ms'");
  });

  it('uses no inline style attribute', () => {
    expect(tsx).not.toMatch(/\bstyle=/);
  });

  it('shows the banner for the same time the wait lasts', () => {
    // Both the wait and the outline take their time from the same constant.
    expect(tsx.match(/atSpeed\(ROOM_CARD_MS, speed\)/g)?.length).toBe(2);
  });
});

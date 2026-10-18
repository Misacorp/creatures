import { afterEach, describe, expect, it } from 'vitest';
import { byClass, createPage, visibleText, type Page } from '../test-dom';
import { XpGain, XpList } from './XpGain';

/** Every kind of XP says "Level up!" the same way when its level went up (Misa, 2026-10-18). */

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
});

function badges(levels: { from: number; to: number }): string[] {
  page = createPage();
  page.draw(
    <XpList>
      <XpGain label="Experience" levels={levels} gain="+8" />
    </XpList>,
  );
  return byClass(page.root, 'badge').map(visibleText);
}

describe('XpGain and a level up', () => {
  it('adds a green Level up! when the level went up', () => {
    expect(badges({ from: 9, to: 10 })).toContain('Level up!');
  });

  it('adds nothing when the level stayed', () => {
    expect(badges({ from: 6, to: 6 })).not.toContain('Level up!');
  });
});

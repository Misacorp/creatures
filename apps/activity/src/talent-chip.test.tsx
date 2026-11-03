import { afterEach, describe, expect, it } from 'vitest';
import { talentView } from './creature-card-sample';
import { TalentInSlot } from './creature-page/PageSlots';
import { TalentChip } from './TalentChip';
import { byClass, createPage, visibleText, type Page } from './test-dom';

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
});

function draw(golden: boolean, id = 'bigger-splash'): Page {
  page = createPage();
  page.draw(<TalentChip talent={talentView(id, golden)} />);
  return page;
}

describe('a golden talent', () => {
  it('shows a star and the word Golden beside the title; the value golden raised is its own gold span', () => {
    const { root } = draw(true);
    expect(byClass(root, 'badge')).toHaveLength(0);
    const mark = byClass(root, 'golden-mark');
    expect(mark).toHaveLength(1);
    expect(visibleText(mark[0] as never)).toBe('Golden');
    expect(byClass(mark[0] as never, 'sprite').length).toBe(1);
    const value = byClass(root, 'gold-shimmer');
    expect(value).toHaveLength(1);
    expect(value[0]?.textContent).toMatch(/^\+\d+(\.\d+)?%$/);
    expect(byClass(root, 'talent-chip')[0]?.getAttribute('class')).toContain('golden');
  });

  it('keeps the title and the phrase whole', () => {
    const { root } = draw(true);
    expect(byClass(root, 'talent-name')[0]?.textContent).toBe('Bigger Splash');
    expect(byClass(root, 'talent-text')[0]?.textContent).toBe(
      talentView('bigger-splash', true).text,
    );
  });
});

describe('a plain talent', () => {
  it('has no gold value and says nothing about golden', () => {
    const { root } = draw(false);
    expect(byClass(root, 'gold-shimmer')).toHaveLength(0);
    expect(byClass(root, 'golden-mark')).toHaveLength(0);
    expect(byClass(root, 'talent-name')[0]?.textContent).toBe('Bigger Splash');
  });
});

describe('a golden talent in a slot', () => {
  it('also shows the star and the word Golden; a plain one does not', () => {
    for (const golden of [true, false]) {
      const page = createPage();
      page.draw(<TalentInSlot talent={talentView('bigger-splash', golden)} />);
      expect(byClass(page.root, 'golden-mark')).toHaveLength(golden ? 1 : 0);
      page.unmount();
    }
  });
});

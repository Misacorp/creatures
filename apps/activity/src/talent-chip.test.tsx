import { afterEach, describe, expect, it } from 'vitest';
import { talentView } from './creature-card-sample';
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
  it('has no Golden badge; the value golden raised is its own gold span', () => {
    const { root } = draw(true);
    expect(byClass(root, 'badge')).toHaveLength(0);
    expect(visibleText(root)).not.toMatch(/Golden/);
    const value = byClass(root, 'gold-shimmer');
    expect(value).toHaveLength(1);
    expect(value[0]?.textContent).toMatch(/^\+\d+(\.\d+)?%$/);
    expect(byClass(root, 'talent-chip')[0]?.getAttribute('class')).toContain('golden');
  });

  it('says golden to screen readers, after the title, and keeps the phrase whole', () => {
    const { root } = draw(true);
    const hidden = byClass(root, 'visually-hidden');
    expect(hidden).toHaveLength(1);
    expect(hidden[0]?.textContent).toBe(' (golden)');
    expect(byClass(root, 'talent-name')[0]?.textContent).toBe('Bigger Splash (golden)');
    expect(byClass(root, 'talent-text')[0]?.textContent).toBe(
      talentView('bigger-splash', true).text,
    );
  });
});

describe('a plain talent', () => {
  it('has no gold value and says nothing about golden', () => {
    const { root } = draw(false);
    expect(byClass(root, 'gold-shimmer')).toHaveLength(0);
    expect(byClass(root, 'visually-hidden')).toHaveLength(0);
    expect(byClass(root, 'talent-name')[0]?.textContent).toBe('Bigger Splash');
  });
});

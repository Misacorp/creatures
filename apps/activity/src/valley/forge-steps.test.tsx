/**
 * Where the item card is drawn decides how much chrome it wears (`CardChrome`): beside the bag (a wide window, the other drawer, whose X,
 * Escape and heading do what the head does and whose list stays in view) it has neither the Back head nor the Prev / Next row; in place of
 * the bag's list (a phone's page) it has both. The card only gets plain switches; it never learns which of the two it is in.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPage, visibleText, type Page } from '../test-dom';
import { sampleValley } from './signpost-sample';
import { homeInput } from '../workbench/home-sample';
import { CARD_BESIDE, CARD_IN_PLACE, useForgeSteps, type ForgeCard } from './forge-steps';
import { StepBody } from './PanelStep';

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  vi.unstubAllGlobals();
  page = null;
});

const visit = sampleValley(homeInput('busy', true).creatures, []);

const card: ForgeCard = {
  title: 'Thundercap',
  onClose: () => undefined,
  dismiss: () => undefined,
  node: (chrome) => (
    <StepBody
      title="Item"
      backLabel="to the bag"
      onBack={() => undefined}
      showHeader={chrome.showHeader}
    >
      {chrome.showPager && <p>PAGER</p>}
      <p>THE CARD</p>
    </StepBody>
  ),
};

function Harness({ list }: { list: string | null }) {
  const steps = useForgeSteps({
    card,
    left: 'bag',
    anvilOpen: false,
    visit: visit as never,
    startFire: false,
  });
  const held = steps.hold('bag', <p>THE LIST</p>);
  return (
    <div>
      <div class="left">{held.children}</div>
      <div class="right">{steps.side?.children}</div>
      {list}
    </div>
  );
}

function draw(wide: boolean): Page {
  vi.stubGlobal('matchMedia', () => ({
    matches: wide,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  const p = createPage();
  page = p;
  p.draw(<Harness list={null} />);
  return p;
}

describe('the item card beside the bag', () => {
  it('names its two switches by what they do', () => {
    expect(CARD_BESIDE).toEqual({ showHeader: false, showPager: false });
    expect(CARD_IN_PLACE).toEqual({ showHeader: true, showPager: true });
  });

  it('a wide window: no Back, no title, no pager; the list stays', () => {
    const p = draw(true);
    const text = visibleText(p.root);
    expect(text).toMatch(/THE CARD/);
    expect(text).toMatch(/THE LIST/);
    expect(text).not.toMatch(/PAGER/);
    expect(text).not.toMatch(/Back/);
    expect(text).not.toMatch(/Item/);
  });

  it('a phone: the card takes the list place, with its Back, its title and the pager', () => {
    const p = draw(false);
    const text = visibleText(p.root);
    expect(text).toMatch(/THE CARD/);
    expect(text).toMatch(/PAGER/);
    expect(text).toMatch(/Back/);
    expect(text).toMatch(/Item/);
  });
});

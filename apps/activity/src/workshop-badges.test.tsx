import { afterEach, describe, expect, it, vi } from 'vitest';
import { BaitCost } from './BaitCost';
import { Blueprints } from './Blueprints';
import { CreaturePicker } from './CreaturePicker';
import { SupplyCrafting } from './SupplyCrafting';
import { TreatBox } from './TreatBox';
import { SAMPLE_GEAR, sampleRoster } from './creature-card-sample';
import { pickerOptions } from './gear-view';
import { byClass, byName, createPage, visibleText, type FakeElement, type Page } from './test-dom';

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
});

function draw(vnode: Parameters<Page['draw']>[0]): FakeElement {
  page = createPage();
  page.draw(vnode);
  return page.root;
}

describe('the Bait cost of a job', () => {
  it('is a Bait badge and what the player has, red when short', () => {
    const enough = draw(<BaitCost cost={12} have={199} />);
    expect(byName(enough, 'span', 'Bait: 12')).toHaveLength(1);
    expect(visibleText(enough)).toBe('12(you have 199)');
    expect(byClass(enough, 'short')).toHaveLength(0);
    page?.unmount();

    const short = draw(<BaitCost cost={12} have={3} />);
    expect(byClass(short, 'short')).toHaveLength(1);
    expect(visibleText(short)).toContain('Not enough Bait.');
  });
});

describe('the treat box', () => {
  it('is one switch whose name says the multiplier and the cost, shown as chips', () => {
    const root = draw(
      <TreatBox cost={11} bait={40} checked={false} onChange={vi.fn()} who="Cindle" />,
    );
    const box = byName(root, 'button', 'Pack a treat for Cindle (2x experience, 11 Bait)');
    expect(box).toHaveLength(1);
    expect(box[0]?.getAttribute('role')).toBe('switch');
    expect(box[0]?.getAttribute('aria-checked')).toBe('false');
    expect(byName(root, 'span', 'Bait: 11')).toHaveLength(1);
    expect(visibleText(root)).toContain('Pack a treat');
    expect(visibleText(root)).toContain('for Cindle');
    expect(visibleText(root)).toContain('2x');
    expect(visibleText(root)).not.toContain('(11 Bait)');
  });

  it('cannot be switched on without the Bait, and says so', () => {
    const onChange = vi.fn();
    const root = draw(
      <TreatBox cost={11} bait={4} checked={false} onChange={onChange} times={3} />,
    );
    const box = byName(root, 'button', 'Pack a treat (3x experience, 11 Bait)');
    expect(box[0]?.getAttribute('disabled')).not.toBeNull();
    expect(visibleText(root)).toContain('Not enough Bait');
  });
});

describe('the worker picker', () => {
  const [free, busy] = sampleRoster(2).map((c, i) => (i === 1 ? { ...c, away: true } : c));

  it('shows a free creature with a clock badge and a busy one with its reason on the right', () => {
    const options = pickerOptions([free!, busy!], SAMPLE_GEAR.skills, () => 3_600_000);
    const root = draw(
      <CreaturePicker name="who" options={options} value={null} onChange={vi.fn()} />,
    );
    const rows = byClass(root, 'pick');
    expect(rows).toHaveLength(2);
    const [first, second] = rows as [FakeElement, FakeElement];
    expect(byName(first, 'span', 'Takes: 1 h')).toHaveLength(1);
    expect(byClass(first, 'pick-reason')).toHaveLength(0);
    expect(visibleText(byClass(first, 'pick-meta')[0] as FakeElement)).toMatch(
      /^Crafting level \d+$/,
    );
    // The busy row names the reason in the right-hand column, in the same words as the other pick lists.
    expect(visibleText(byClass(second, 'pick-reason')[0] as FakeElement)).toBe('Away on a trip');
    expect(byClass(second, 'part-count')).toHaveLength(0);
  });
});

describe('the Workshop lists', () => {
  const creatures = sampleRoster(3);

  it('writes a blueprint time as a clock badge', () => {
    const root = draw(
      <Blueprints
        gear={SAMPLE_GEAR}
        creatures={creatures}
        busy={false}
        loadPreview={vi.fn()}
        onCraft={vi.fn()}
      />,
    );
    expect(SAMPLE_GEAR.blueprints.length).toBeGreaterThan(0);
    expect(visibleText(root)).not.toContain('Takes about');
    expect(byName(root, 'span', /^Takes about: \d+ h$/).length).toBe(SAMPLE_GEAR.blueprints.length);
  });

  it('writes a supply time as a clock badge and its Bait cost as a Bait badge', () => {
    const root = draw(
      <SupplyCrafting
        gear={SAMPLE_GEAR}
        creatures={creatures}
        stock={{}}
        busy={false}
        onCraft={vi.fn()}
      />,
    );
    expect(visibleText(root)).not.toContain('about');
    expect(byName(root, 'span', /^Takes about: /).length).toBeGreaterThan(0);
    expect(visibleText(root)).not.toMatch(/\d+ Bait/);
    expect(byName(root, 'span', /^Bait: \d+$/).length).toBeGreaterThan(0);
  });
});

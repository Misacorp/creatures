import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Creature } from './api';
import { CreatureCard } from './CreatureCard';
import type { CardActions } from './CreaturePage';
import type { PageFocus } from './creature-card-view';
import { SAMPLE_GEAR, SAMPLE_STATE, sampleCreature, type SampleKind } from './creature-card-sample';
import { cardDomId } from './creature-card-view';
import {
  byClass,
  createPage,
  find,
  nameOf,
  visibleText,
  type FakeElement,
  type Page,
} from './test-dom';

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
});

function actionsWith(overrides: Partial<CardActions> = {}): CardActions {
  return {
    onEquip: vi.fn(() => Promise.resolve(true)),
    onRibbon: vi.fn(),
    onEvolve: vi.fn(),
    onRename: vi.fn(),
    onLounge: vi.fn(),
    onSlotTalent: vi.fn(),
    ...overrides,
  };
}

interface Drawn {
  page: Page;
  card: FakeElement;
  actions: CardActions;
  onAnswerCatch: ReturnType<typeof vi.fn>;
  onOpen: ReturnType<typeof vi.fn>;
}

/** Draws one card (the state of the sample asked for) and returns the page and its handlers. */
function draw(
  creature: Creature,
  options: {
    pending?: boolean;
    bait?: number;
    loungerId?: string | null;
    busy?: boolean;
    actions?: Partial<CardActions>;
  } = {},
): Drawn {
  page = createPage();
  const actions = actionsWith(options.actions);
  const onAnswerCatch = vi.fn();
  const onOpen = vi.fn<(focus: PageFocus) => void>();
  const pendingCard = SAMPLE_STATE.pending[0];
  const state = {
    ...SAMPLE_STATE,
    creatures: [creature],
    pending:
      options.pending === true && pendingCard !== undefined
        ? [
            {
              ...pendingCard,
              offered: { ...pendingCard.offered, teach: [creature.id], fuse: [creature.id] },
            },
          ]
        : [],
    balances: { ...SAMPLE_STATE.balances, bait: options.bait ?? 100 },
    loungerId: options.loungerId ?? null,
  };
  page.draw(
    <ul>
      <CreatureCard
        creature={creature}
        state={state}
        gear={SAMPLE_GEAR}
        busy={options.busy ?? false}
        found={false}
        actions={actions}
        onAnswerCatch={onAnswerCatch}
        onOpen={onOpen}
      />
    </ul>,
  );
  const card = find(page.root, (el) => el.getAttribute('id') === cardDomId(creature.id))[0];
  if (card === undefined) throw new Error('the card was not drawn');
  return { page, card, actions, onAnswerCatch, onOpen };
}

const kind = (name: SampleKind): Creature => sampleCreature(name);

describe('the small card', () => {
  it('shows who it is, the level and the bar with its words, and nothing forward-looking', () => {
    const creature = kind('growing');
    const { card } = draw(creature);
    expect(nameOf(find(card, (e) => e.localName === 'h3')[0] as FakeElement)).toBe('Cindle');
    expect(visibleText(card)).toContain('Lv 6');
    const bar = find(card, (e) => e.getAttribute('role') === 'progressbar')[0];
    expect(bar?.getAttribute('aria-valuetext')).toBe('140 / 222');
    expect(byClass(card, 'cc-next')).toHaveLength(0);
    expect(visibleText(card)).not.toContain('Next');
    expect(visibleText(card)).not.toContain('Scarf at 7');
  });

  it('draws the level badge in the pixel font with no "?" (the tap still opens its explanation)', () => {
    const { card } = draw(kind('growing'));
    const badge = byClass(card, 'lvl-tag')[0] as FakeElement;
    const classes = (badge.getAttribute('class') ?? '').split(' ');
    expect(classes).toContain('pix');
    // No popover host in this test, so the tag is plain text; with one it is a button with `gtag-bare`
    // (the "?" of a tag is drawn by `.gtag-chip::after`, which `gtag-bare` turns off).
    expect(visibleText(badge)).toBe('Lv 6');
  });

  it('shows the rarity by the colour of the name, not by a portrait border, and says it aloud', () => {
    const { card } = draw(kind('growing'));
    const portrait = byClass(card, 'portrait')[0] as FakeElement;
    expect(portrait.getAttribute('class')).not.toContain('rarity-');
    const name = find(card, (e) => e.localName === 'h3')[0] as FakeElement;
    const classes = (name.getAttribute('class') ?? '').split(' ');
    expect(classes).toContain('rarity-name');
    expect(classes).toContain('rarity-common');
    const open = find(card, (e) => e.localName === 'button' && /^Open /.test(nameOf(e)))[0];
    expect(nameOf(open as FakeElement)).toBe('Open Cindle, common');
  });

  it('puts the armchair before the Lounging badge', () => {
    const creature = kind('growing');
    const { card } = draw(creature, { loungerId: creature.id });
    const badge = byClass(card, 'badge').find((b) => visibleText(b).includes('Lounging'));
    expect(badge).toBeDefined();
    expect(byClass(badge as FakeElement, 'armchair-icon')).toHaveLength(1);
  });

  it('has the three gear slots as icons and the talents as chips', () => {
    const { card } = draw(kind('ribbon ready'));
    const slots = find(
      card,
      (e) => e.localName === 'button' && e.hasAttribute('aria-label'),
    ).filter((e) => /^(Hat|Scarf|Charm):/.test(nameOf(e)));
    expect(slots.map((s) => nameOf(s).split(':')[0])).toEqual(['Hat', 'Scarf', 'Charm']);
    // The Charm opens at 13: this creature is level 10, so its icon is locked and says when.
    expect(slots[2]?.hasAttribute('disabled')).toBe(true);
    expect(nameOf(slots[2] as FakeElement)).toBe('Charm: opens at level 13');
    const talents = byClass(card, 'cc-talents')[0] as FakeElement;
    expect(nameOf(talents)).toContain('Quick to Pounce (golden)');
    expect(visibleText(talents)).toContain('Quick to Pounce');
    // Slot 2 is closed: the chips say the level it opens at.
    expect(visibleText(byClass(talents, 'locked-slots')[0] as FakeElement)).toBe('20');
  });

  it('is small: no stats, ability text, fusion or buttons other than the gold one', () => {
    const { card } = draw(kind('growing'));
    const text = visibleText(card);
    for (const gone of [
      'Finale ability',
      'Fusion',
      'Equip best',
      'Lounge',
      'Rename',
      'Talent Book',
    ]) {
      expect(text, gone).not.toContain(gone);
    }
    expect(byClass(card, 'creature-page')).toHaveLength(0);
    // No "More" expansion: the page holds what it held.
    expect(find(card, (e) => /\bMore\b/.test(nameOf(e)) && e.localName === 'button')).toHaveLength(
      0,
    );
  });

  it('shows no gold button when nothing is ready', () => {
    const { card } = draw(kind('growing'));
    expect(byClass(card, 'cc-do')).toHaveLength(0);
  });

  it('shows what the creature does now (away, on a job, lounging) and a nickname with its species', () => {
    const named = kind('nickname and badges');
    const { card } = draw(named, { loungerId: named.id });
    const sub = visibleText(byClass(card, 'cc-sub')[0] as FakeElement);
    expect(sub).toContain('Cindle');
    expect(sub).toContain('Away');
    expect(sub).toContain('Lounging');
    expect(nameOf(find(card, (e) => e.localName === 'h3')[0] as FakeElement)).toBe('Ember');
  });

  it('marks the card the finder chose', () => {
    page = createPage();
    const creature = kind('growing');
    page.draw(
      <ul>
        <CreatureCard
          creature={creature}
          state={{ ...SAMPLE_STATE, creatures: [creature], pending: [] }}
          gear={null}
          busy={false}
          found
          actions={actionsWith()}
          onAnswerCatch={() => undefined}
          onOpen={() => undefined}
        />
      </ul>,
    );
    const card = page.document.getElementById(cardDomId(creature.id));
    expect(card?.getAttribute('class')).toContain('found');
  });
});

describe('the one gold button', () => {
  it('earns the ribbon when it is ready, with the cost under it', () => {
    const { card, actions, page: p } = draw(kind('ribbon ready'));
    const [button] = byClass(card, 'cc-do')[0]?.childNodes ?? [];
    const gold = button as FakeElement;
    expect(visibleText(gold)).toContain('Earn Bronze Ribbon');
    expect(visibleText(gold)).toContain('6 scrap and 2 Ember shards');
    p.click(gold);
    expect(actions.onRibbon).toHaveBeenCalledTimes(1);
  });

  it('has no button and no "Next" line while the ribbon is not ready', () => {
    const { card } = draw(kind('ribbon short'));
    expect(byClass(card, 'cc-do')).toHaveLength(0);
    expect(byClass(card, 'cc-next')).toHaveLength(0);
    expect(visibleText(card)).not.toContain('Next');
  });

  it('evolves when evolution is ready', () => {
    const { card, actions, page: p } = draw(kind('evolve ready'));
    const gold = byClass(card, 'cc-do')[0]?.childNodes[0] as FakeElement;
    expect(visibleText(gold)).toContain('Evolve into Pyrelynx');
    expect(visibleText(gold)).toContain('20 Essence');
    p.click(gold);
    expect(actions.onEvolve).toHaveBeenCalledTimes(1);
  });

  it('shows the evolve button disabled with the busy wording while the creature is away', () => {
    const { card, actions, page: p } = draw({ ...kind('evolve ready'), away: true });
    const gold = byClass(card, 'cc-do')[0]?.childNodes[0] as FakeElement;
    expect(gold.hasAttribute('disabled')).toBe(true);
    expect(visibleText(gold)).toContain('Away on an expedition');
    p.click(gold);
    expect(actions.onEvolve).not.toHaveBeenCalled();
  });

  it('takes the player to a waiting catch, and counts the other things that wait', () => {
    const creature = { ...kind('ribbon ready'), ribbon: null, waiting: false };
    const { card, onAnswerCatch, page: p } = draw(creature, { pending: true });
    const gold = byClass(card, 'cc-do')[0]?.childNodes[0] as FakeElement;
    expect(visibleText(gold)).toContain('Answer a waiting catch');
    p.click(gold);
    expect(onAnswerCatch).toHaveBeenCalledTimes(1);

    const both = draw(kind('ribbon ready'), { pending: true });
    const text = visibleText(byClass(both.card, 'cc-do')[0] as FakeElement);
    expect(text).toContain('Earn Bronze Ribbon');
    expect(text).toContain('1 more');
    expect(text).not.toContain('in More');
  });

  it('opens the page on the talents when a slot can be filled', () => {
    const { card, page: p, onOpen } = draw(kind('talent to fill'));
    const gold = byClass(card, 'cc-do')[0]?.childNodes[0] as FakeElement;
    expect(visibleText(gold)).toContain('Fill talent slot 2');
    p.click(gold);
    expect(onOpen).toHaveBeenCalledWith({ part: 'talents' });
  });

  it('does not offer the talent when the Bait is short', () => {
    const { card } = draw(kind('talent to fill'), { bait: 3 });
    expect(byClass(card, 'cc-do')).toHaveLength(0);
  });

  it('is disabled while another action runs', () => {
    const { card } = draw(kind('ribbon ready'), { busy: true });
    const gold = byClass(card, 'cc-do')[0]?.childNodes[0] as FakeElement;
    expect(gold.hasAttribute('disabled')).toBe(true);
  });
});

describe('opening the page', () => {
  it('has the name as a button that opens the page at the top, and an arrow that says so', () => {
    const { card, page: p, onOpen } = draw(kind('growing'));
    const open = find(
      card,
      (e) => e.localName === 'button' && nameOf(e) === 'Open Cindle, common',
    )[0];
    expect(open).toBeDefined();
    // The button is the heading's text, so the heading still reads as the name.
    expect(nameOf(find(card, (e) => e.localName === 'h3')[0] as FakeElement)).toBe('Cindle');
    expect(visibleText(byClass(card, 'cc-chev')[0] as FakeElement)).toBe('\u203a');
    expect(byClass(card, 'cc-chev')[0]?.getAttribute('aria-hidden')).toBe('true');
    p.click(open as FakeElement);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(null);
  });

  it('opens the page on a tap anywhere on the card, but not on its own buttons', () => {
    const { card, page: p, onOpen } = draw(kind('ribbon ready'));
    // The picture, the name block, the experience bar and the card itself are all part of the tap.
    for (const part of [
      byClass(card, 'portrait')[0],
      byClass(card, 'cc-id')[0],
      find(card, (e) => e.getAttribute('role') === 'progressbar')[0],
      card,
    ]) {
      p.click(part as FakeElement);
    }
    expect(onOpen).toHaveBeenCalledTimes(4);
    expect(onOpen).toHaveBeenLastCalledWith(null);
    onOpen.mockClear();

    // The gold button, a gear icon and the talents keep their own actions (the level tag is a button too).
    p.click(byClass(card, 'cc-do')[0]?.childNodes[0] as FakeElement);
    p.click(
      find(card, (e) => e.localName === 'button' && /^Hat:/.test(nameOf(e)))[0] as FakeElement,
    );
    p.click(byClass(card, 'cc-talents')[0] as FakeElement);
    // The gear icon and the talents open the page on their part, once each: no second plain "open".
    expect(onOpen.mock.calls).toEqual([[{ part: 'gear', slot: 'hat' }], [{ part: 'talents' }]]);
    // The name button opens it once too, not twice (it is inside the card).
    onOpen.mockClear();
    p.click(
      find(card, (e) => e.localName === 'button' && /^Open /.test(nameOf(e)))[0] as FakeElement,
    );
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('opens the page on the slot whose gear icon was tapped, and on the talents for the chips', () => {
    const { card, page: p, onOpen } = draw(kind('ribbon ready'));
    const scarf = find(
      card,
      (e) => e.localName === 'button' && /^Scarf:/.test(nameOf(e)),
    )[0] as FakeElement;
    p.click(scarf);
    expect(onOpen).toHaveBeenLastCalledWith({ part: 'gear', slot: 'scarf' });
    p.click(byClass(card, 'cc-talents')[0] as FakeElement);
    expect(onOpen).toHaveBeenLastCalledWith({ part: 'talents' });
  });

  it('does not open the page for a locked gear icon, and the gold button does its own job', () => {
    const { card, page: p, onOpen, actions } = draw(kind('ribbon ready'));
    const charm = find(
      card,
      (e) => e.localName === 'button' && /^Charm:/.test(nameOf(e)),
    )[0] as FakeElement;
    p.click(charm);
    p.click(byClass(card, 'cc-do')[0]?.childNodes[0] as FakeElement);
    expect(onOpen).not.toHaveBeenCalled();
    expect(actions.onRibbon).toHaveBeenCalledTimes(1);
  });
});

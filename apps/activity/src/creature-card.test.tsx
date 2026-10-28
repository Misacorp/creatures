import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Creature, GameState } from './api';
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

/** The card's stylesheet, read as text: the tests' DOM has no layout, so the one-per-row rule is checked there. */
const styles = import.meta.glob<string>('./styles/components/creature-focus.css', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const focusCss = styles['./styles/components/creature-focus.css'] ?? '';

/** The declarations of one rule of a stylesheet (the first block whose selector is exactly `selector`). */
function rule(css: string, selector: string): string {
  const at = css.indexOf(`\n${selector} {`);
  if (at < 0) return '';
  const open = css.indexOf('{', at);
  return css.slice(open + 1, css.indexOf('}', open));
}

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
    onNote: vi.fn(),
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
    loungeXp?: GameState['loungeXp'];
    serverFirsts?: GameState['serverFirsts'];
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
    loungeXp: options.loungeXp ?? {},
    serverFirsts: options.serverFirsts ?? [],
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

  it('has the level tag at the left of the slim bar, across the card, and none at the top right', () => {
    const { card } = draw(kind('growing'));
    const [track] = byClass(card, 'xp-static');
    expect(track).toBeDefined();
    // The bar is the card's own row (a child of the card), not inside the name block.
    expect(track?.parentNode).toBe(card);
    const [level, bar] = (track as FakeElement).childNodes as FakeElement[];
    expect(level?.getAttribute('class')).toContain('xp-lv');
    expect(level?.getAttribute('class')).toContain('pix');
    // No popover host in this test, so the tag is plain text; with one it is a chip button that opens
    // the level's explanation.
    expect(visibleText(level as FakeElement)).toBe('Lv 6');
    expect(bar?.getAttribute('role')).toBe('progressbar');
    expect(visibleText(bar as FakeElement)).toBe('140 / 222');
    expect(bar?.getAttribute('aria-label')).toBe('Experience: 140 / 222 towards level 7');
    // The old corner tag is gone: the name block holds no level.
    expect(byClass(card, 'lvl-tag')).toHaveLength(0);
    expect(visibleText(byClass(card, 'cc-head')[0] as FakeElement)).not.toContain('Lv');
  });

  it('fills the bar at the top level and says so', () => {
    const { card } = draw(kind('top level'));
    const bar = find(card, (e) => e.getAttribute('role') === 'progressbar')[0] as FakeElement;
    expect(visibleText(bar)).toBe('Top level');
    expect(bar.getAttribute('aria-valuetext')).toBe('Top level');
    expect(visibleText(byClass(card, 'xp-lv')[0] as FakeElement)).toBe('Lv 30');
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

  it('has a quiet armchair at the end of the name line that sends a free creature to the lounge', () => {
    const creature = kind('growing');
    const { page: p, card, actions, onOpen } = draw(creature);
    const chair = byClass(card, 'cc-lounge')[0] as FakeElement;
    expect(nameOf(chair)).toBe('Lounge Cindle');
    expect(chair.parentNode).toBe(byClass(card, 'cc-name-row')[0]);
    expect(byClass(chair, 'armchair-icon')).toHaveLength(1);
    // No words on the card: just the picture.
    expect(visibleText(chair)).toBe('');
    p.click(chair);
    expect(actions.onLounge).toHaveBeenCalledWith(creature);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('has no armchair on the lounger, nor on a creature that is away or on a job; a Rested one keeps it', () => {
    const creature = kind('growing');
    expect(byClass(draw(creature, { loungerId: creature.id }).card, 'cc-lounge')).toHaveLength(0);
    const away = { ...creature, away: true, busy: { kind: 'expedition' as const, id: 't' } };
    expect(byClass(draw(away).card, 'cc-lounge')).toHaveLength(0);
    const rested = draw(creature, { loungeXp: { [creature.id]: 60 } }).card;
    expect(byClass(rested, 'cc-lounge')).toHaveLength(1);
    expect(byClass(rested, 'rested').map((b) => visibleText(b))).toEqual(['Rested']);
  });

  it('puts every talent, each empty slot and the closed slots on a row of their own', () => {
    const { card } = draw(kind('talent to fill'));
    const talents = byClass(card, 'cc-talents')[0] as FakeElement;
    const rows = talents.childNodes as FakeElement[];
    expect(rows.map((r) => visibleText(r))).toEqual(['Quick to Pounce', 'Empty', '25']);
    for (const row of rows) expect(row.getAttribute('class')).toContain('cc-chip');
    // One to a row, even when two are short enough to share one (Misa, 2026-10-19).
    const css = rule(focusCss, 'button.cc-talents');
    expect(css).toContain('flex-direction: column');
    expect(css).not.toContain('flex-wrap: wrap');
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

  it('has the tags in words under the name: species of a nickname, element, role, Shiny, what it does now', () => {
    const named = kind('nickname and badges');
    const { card } = draw(named, { loungerId: named.id });
    const [tags] = byClass(card, 'cc-tags');
    // Under the name, in the same block.
    expect(tags?.parentNode).toBe(byClass(card, 'cc-id')[0]);
    const words = ((tags as FakeElement).childNodes as FakeElement[]).map((t) => visibleText(t));
    expect(words).toEqual(['Cindle', 'Ember', 'Payoff', 'Shiny', 'Away', 'Lounging 0 / 60 XP']);
    expect(nameOf(find(card, (e) => e.localName === 'h3')[0] as FakeElement)).toBe('Ember');
  });

  it('names no species for a creature without a nickname, and tags a Festival creature and a server first', () => {
    const plain = kind('growing');
    const words = (c: FakeElement): string[] =>
      ((byClass(c, 'cc-tags')[0] as FakeElement).childNodes as FakeElement[]).map((t) =>
        visibleText(t),
      );
    expect(words(draw(plain).card)).toEqual(['Ember', 'Payoff']);
    const festival: Creature = { ...plain, species: 'lanternfin', line: 'lanternfin' };
    const first = { kind: 'catch' as const, species: 'lanternfin', at: 0, mine: true, holders: [] };
    const tagged = words(draw(festival, { serverFirsts: [first] }).card);
    expect(tagged).toEqual(['Tide', 'Support', 'Festival', 'First on server']);
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

  it('greys the ribbon button with its exact cost while the parts are short, and no "Next" line', () => {
    const { card, actions, page: p } = draw(kind('ribbon short'));
    const button = byClass(card, 'cc-do')[0]?.childNodes[0] as FakeElement;
    expect(visibleText(button)).toContain('Earn Bronze Ribbon');
    expect(visibleText(button)).toContain('6 scrap and 2 Ember shards');
    expect(button.hasAttribute('disabled')).toBe(true);
    p.click(button);
    expect(actions.onRibbon).not.toHaveBeenCalled();
    expect(byClass(card, 'cc-next')).toHaveLength(0);
    expect(visibleText(card)).not.toContain('Next');
  });

  it('says how many trips a ribbon still needs on its greyed button', () => {
    const short = kind('ribbon short');
    const { card } = draw({ ...short, ribbon: { ...short.ribbon!, trips: 3, tripsDone: 1 } });
    const button = byClass(card, 'cc-do')[0]?.childNodes[0] as FakeElement;
    expect(visibleText(button)).toContain('2 more trips');
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('greys the evolve button with the Essence had and the price while it is short', () => {
    const ready = kind('evolve ready');
    const {
      card,
      actions,
      page: p,
    } = draw({
      ...ready,
      evolution: { ...ready.evolution!, available: false },
    });
    const button = byClass(card, 'cc-do')[0]?.childNodes[0] as FakeElement;
    expect(visibleText(button)).toContain('Evolve');
    expect(visibleText(button)).toContain('0 / 20 Essence');
    expect(button.hasAttribute('disabled')).toBe(true);
    p.click(button);
    expect(actions.onEvolve).not.toHaveBeenCalled();
  });

  it('evolves when evolution is ready', () => {
    const { card, actions, page: p } = draw(kind('evolve ready'));
    const gold = byClass(card, 'cc-do')[0]?.childNodes[0] as FakeElement;
    expect(visibleText(gold)).toContain('Evolve');
    expect(visibleText(gold)).toContain('20 Essence');
    p.click(gold);
    expect(actions.onEvolve).toHaveBeenCalledTimes(1);
  });

  it('shows the evolve button disabled with the busy wording while the creature is away', () => {
    const { card, actions, page: p } = draw({ ...kind('evolve ready'), away: true });
    const gold = byClass(card, 'cc-do')[0]?.childNodes[0] as FakeElement;
    expect(gold.hasAttribute('disabled')).toBe(true);
    expect(visibleText(gold)).toContain('Away on a trip');
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
  it('has the name as a button that opens the page at the top, and no arrow', () => {
    const { card, page: p, onOpen } = draw(kind('growing'));
    const open = find(
      card,
      (e) => e.localName === 'button' && nameOf(e) === 'Open Cindle, common',
    )[0];
    expect(open).toBeDefined();
    // The button is the heading's text, so the heading still reads as the name.
    expect(nameOf(find(card, (e) => e.localName === 'h3')[0] as FakeElement)).toBe('Cindle');
    expect(byClass(card, 'cc-chev')).toHaveLength(0);
    expect(visibleText(card)).not.toContain('\u203a');
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

describe('ribbons and medals', () => {
  const honoured = (ribbons: number, medals: Creature['medals']): Creature => ({
    ...kind('growing'),
    ribbons,
    medals,
  });
  const none = { gold: 0, silver: 0, bronze: 0 };

  it('draws nothing for a creature with no ribbon and no medal', () => {
    const { card } = draw(honoured(0, none));
    expect(byClass(card, 'cc-ribbons')).toEqual([]);
    expect(byClass(card, 'cc-medals')).toEqual([]);
    expect(card.classList.contains('has-ribbons')).toBe(false);
  });

  it('hangs the ribbons held behind the card, the highest on the left, hidden from screen readers', () => {
    const { card } = draw(honoured(3, none));
    const strips = byClass(card, 'cc-ribbons');
    expect(strips.map((el) => el.getAttribute('aria-hidden'))).toEqual(['true']);
    expect(byClass(card, 'cc-ribbon').map((el) => el.getAttribute('class'))).toEqual([
      'cc-ribbon is-gold',
      'cc-ribbon is-silver',
      'cc-ribbon is-bronze',
    ]);
    expect(card.classList.contains('has-ribbons')).toBe(true);
  });

  it('hangs only the Bronze Ribbon for a creature that holds one', () => {
    const { card } = draw(honoured(1, none));
    expect(byClass(card, 'cc-ribbon').map((el) => el.getAttribute('class'))).toEqual([
      'cc-ribbon is-bronze',
    ]);
  });

  it('keeps the three medals in place, gold first: a metal not won is a silhouette with no count', () => {
    const { card } = draw(honoured(0, { gold: 0, silver: 0, bronze: 12 }));
    const [medals] = byClass(card, 'cc-medals');
    expect(medals?.getAttribute('aria-hidden')).toBe('true');
    const coins = byClass(card, 'cc-coin');
    expect(coins.map((el) => el.getAttribute('class'))).toEqual([
      'cc-coin is-gold is-none',
      'cc-coin is-silver is-none',
      'cc-coin is-bronze',
    ]);
    expect(coins.map((el) => byClass(el, 'cc-coin-n')[0]?.textContent)).toEqual([
      undefined,
      undefined,
      '12',
    ]);
  });

  it('shows at most 99 on a medal', () => {
    const { card } = draw(honoured(0, { gold: 120, silver: 0, bronze: 0 }));
    expect(byClass(card, 'cc-coin-n').map((el) => el.textContent)).toEqual(['99']);
  });
});

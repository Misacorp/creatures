import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Creature } from './api';
import { CreatureCard } from './CreatureCard';
import type { CardActions } from './CreatureSheet';
import { SAMPLE_GEAR, SAMPLE_STATE, sampleCreature, type SampleKind } from './creature-card-sample';
import { cardDomId } from './creature-card-view';
import {
  byClass,
  byName,
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
    onEquipBest: vi.fn(() => Promise.resolve(undefined)),
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
}

/** Draws one card (the state of the sample asked for) and returns the page and its handlers. */
function draw(
  creature: Creature,
  options: {
    open?: boolean;
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
        initiallyOpen={options.open ?? false}
      />
    </ul>,
  );
  const card = find(page.root, (el) => el.getAttribute('id') === cardDomId(creature.id))[0];
  if (card === undefined) throw new Error('the card was not drawn');
  return { page, card, actions, onAnswerCatch };
}

const kind = (name: SampleKind): Creature => sampleCreature(name);

describe('the small card', () => {
  it('shows who it is, the level, the bar with its words and what comes next', () => {
    const creature = kind('growing');
    const { card } = draw(creature);
    expect(nameOf(find(card, (e) => e.localName === 'h3')[0] as FakeElement)).toBe('Cindle');
    expect(visibleText(card)).toContain('Lv 6');
    const bar = find(card, (e) => e.getAttribute('role') === 'progressbar')[0];
    expect(bar?.getAttribute('aria-valuetext')).toBe('140 / 222');
    expect(visibleText(byClass(card, 'cc-next')[0] as FakeElement)).toBe('Next: Scarf at 7');
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
    expect(nameOf(slots[2] as FakeElement)).toBe('Charm: opens at creature level 13');
    const talents = byClass(card, 'cc-talents')[0] as FakeElement;
    expect(nameOf(talents)).toContain('Quick to Pounce (golden)');
    expect(visibleText(talents)).toContain('Quick to Pounce');
    // Slot 2 is closed: the chips say the level it opens at.
    expect(visibleText(byClass(talents, 'locked-slots')[0] as FakeElement)).toBe('20');
  });

  it('is small: no stats, ability text, fusion or buttons other than the gold one and More', () => {
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
    expect(byClass(card, 'creature-sheet')).toHaveLength(0);
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

  it('says what is missing and has no button while the ribbon is not ready', () => {
    const { card } = draw(kind('ribbon short'));
    expect(byClass(card, 'cc-do')).toHaveLength(0);
    expect(visibleText(byClass(card, 'cc-next')[0] as FakeElement)).toBe(
      'Full: earn the Bronze Ribbon to keep growing. Not enough parts yet.',
    );
  });

  it('evolves when evolution is ready', () => {
    const { card, actions, page: p } = draw(kind('evolve ready'));
    const gold = byClass(card, 'cc-do')[0]?.childNodes[0] as FakeElement;
    expect(visibleText(gold)).toContain('Evolve into Pyrelynx');
    expect(visibleText(gold)).toContain('20 Essence');
    p.click(gold);
    expect(actions.onEvolve).toHaveBeenCalledTimes(1);
  });

  it('takes the player to a waiting catch, and says how many other things wait in More', () => {
    const creature = { ...kind('ribbon ready'), ribbon: null, waiting: false };
    const { card, onAnswerCatch, page: p } = draw(creature, { pending: true });
    const gold = byClass(card, 'cc-do')[0]?.childNodes[0] as FakeElement;
    expect(visibleText(gold)).toContain('Answer a waiting catch');
    p.click(gold);
    expect(onAnswerCatch).toHaveBeenCalledTimes(1);

    const both = draw(kind('ribbon ready'), { pending: true });
    const text = visibleText(byClass(both.card, 'cc-do')[0] as FakeElement);
    expect(text).toContain('Earn Bronze Ribbon');
    expect(text).toContain('1 more in More');
  });

  it('opens the sheet on the talents when a slot can be filled', () => {
    const { card, page: p } = draw(kind('talent to fill'));
    const gold = byClass(card, 'cc-do')[0]?.childNodes[0] as FakeElement;
    expect(visibleText(gold)).toContain('Fill talent slot 2');
    p.click(gold);
    const sheet = byClass(card, 'creature-sheet')[0] as FakeElement;
    expect(sheet).toBeDefined();
    const heading = p.document.getElementById(
      `${cardDomId('a653e00a-457f-4830-9fd7-cfa66c8f86a0')}-sheet-talents`,
    );
    expect(heading?.focused).toBe(1);
    expect(heading?.scrolled).toBe(1);
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

describe('the More sheet', () => {
  it('opens and closes under the card, and the button says which', () => {
    const { card, page: p } = draw(kind('growing'));
    const more = byName(card, 'button', /^More about/)[0] as FakeElement;
    expect(more.getAttribute('aria-expanded')).toBe('false');
    p.click(more);
    const sheet = byClass(card, 'creature-sheet')[0] as FakeElement;
    expect(sheet).toBeDefined();
    const less = byName(card, 'button', /^Less about/)[0] as FakeElement;
    expect(less.getAttribute('aria-expanded')).toBe('true');
    expect(less.getAttribute('aria-controls')).toBe(sheet.getAttribute('id'));
    p.click(less);
    expect(byClass(card, 'creature-sheet')).toHaveLength(0);
  });

  it('closes with "Show less" and gives the focus back to More', () => {
    const { card, page: p } = draw(kind('growing'), { open: true });
    const more = byName(card, 'button', /^Less about/)[0] as FakeElement;
    p.click(byName(card, 'button', 'Show less')[0] as FakeElement);
    expect(byClass(card, 'creature-sheet')).toHaveLength(0);
    expect(more.focused).toBe(1);
  });

  it('holds everything that left the card', () => {
    const { card } = draw(kind('ribbon ready'), { open: true });
    const sheet = byClass(card, 'creature-sheet')[0] as FakeElement;
    const text = visibleText(sheet);
    // Who it is
    expect(text).toContain('Ember');
    expect(text).toContain('Common');
    // Growth: the experience line, the ribbon button (with cost) and the help
    expect(text).toContain('450 / 450 experience, Bronze Ribbon first');
    expect(byName(sheet, 'button', /Bronze Ribbon \(6 scrap and 2 Ember shards\)/)).toHaveLength(1);
    // Stats with the gear's share
    expect(text).toContain('HP');
    expect(text).toContain('Attack');
    expect(text).toContain('Speed');
    // Gear: the three slots, Equip best, the help
    expect(text).toContain('Equip best');
    expect(
      find(sheet, (e) => e.localName === 'button' && /^Hat slot:/.test(nameOf(e))),
    ).toHaveLength(1);
    // Talents: the slots and the book
    expect(text).toContain('Talents');
    expect(text).toContain('Talent Book (');
    // Ability, About, fusion, ribbons, explorer
    expect(text).toContain('Flare Strike');
    expect(text).toContain('Evolves into');
    expect(text).toContain('Fusion');
    expect(text).toContain('0 / 5');
    expect(text).toContain('Ribbons');
    expect(text).toContain('Explorer rank');
    expect(text).toContain('Trips');
    // Lounge and Rename
    expect(byName(sheet, 'button', 'Lounge')).toHaveLength(1);
    expect(
      find(sheet, (e) => e.localName === 'summary' && visibleText(e) === 'Rename'),
    ).toHaveLength(1);
  });

  it('shows the evolution as a button when ready and as a locked line when not', () => {
    const ready = draw(kind('evolve ready'), { open: true });
    expect(byName(ready.card, 'button', /^Evolve into Pyrelynx \(20 Essence\)$/)).toHaveLength(1);
    page?.unmount();
    const locked = draw(
      {
        ...kind('evolve ready'),
        evolution: { toSpecies: 'pyrelynx', level: 15, essence: 20, available: false },
        level: 12,
      },
      { open: true },
    );
    expect(visibleText(locked.card)).toContain('Locked: evolving into Pyrelynx needs level 15');
  });

  it('wears and takes off gear from the sheet, and can use Equip best', async () => {
    const creature = kind('ribbon ready');
    const hat = creature.gear.find((g) => g.slot === 'hat');
    const equipBest = vi.fn(() => Promise.resolve(undefined));
    const equip = vi.fn(() => Promise.resolve(true));
    const { card, page: p } = draw(creature, {
      open: true,
      actions: { onEquipBest: equipBest, onEquip: equip },
    });
    p.click(byName(card, 'button', 'Equip best')[0] as FakeElement);
    expect(equipBest).toHaveBeenCalledWith(creature.id);
    // Tapping the Hat slot opens its picker with "Take off".
    p.click(
      find(card, (e) => e.localName === 'button' && /^Hat slot:/.test(nameOf(e)))[0] as FakeElement,
    );
    const takeOff = byName(card, 'button', /^Take off/)[0] as FakeElement;
    expect(takeOff).toBeDefined();
    p.click(takeOff);
    await Promise.resolve();
    expect(equip).toHaveBeenCalledWith(hat?.id, null);
  });

  it('opens on the slot whose icon was tapped, with its picker open', () => {
    const { card, page: p } = draw(kind('ribbon ready'));
    const icon = find(
      card,
      (e) => e.localName === 'button' && /^Scarf:/.test(nameOf(e)),
    )[0] as FakeElement;
    p.click(icon);
    const sheet = byClass(card, 'creature-sheet')[0] as FakeElement;
    expect(sheet).toBeDefined();
    expect(
      find(sheet, (e) => e.getAttribute('role') === 'group' && /Choose a scarf/.test(nameOf(e))),
    ).toHaveLength(1);
    const heading = p.document.getElementById(`${sheet.getAttribute('id') ?? ''}-gear`);
    expect(heading?.focused).toBe(1);
    expect(heading?.scrolled).toBe(1);
  });

  it('slots a talent from the Talent Book, as before', () => {
    const slot = vi.fn();
    const creature = kind('talent to fill');
    const { card, page: p } = draw(creature, { open: true, actions: { onSlotTalent: slot } });
    const button = byName(card, 'button', /^Put Playful in slot 2/)[0] as FakeElement;
    expect(button).toBeDefined();
    p.click(button);
    expect(slot).toHaveBeenCalledWith(creature, 'playful', false, 2);
  });

  it('renames: a nickname goes to the server, empty clears it', () => {
    const rename = vi.fn();
    const creature = kind('growing');
    const { card, page: p } = draw(creature, { open: true, actions: { onRename: rename } });
    const input = find(card, (e) => e.localName === 'input')[0] as FakeElement;
    p.type(input, 'Sparky');
    const form = find(card, (e) => e.localName === 'form')[0] as FakeElement;
    p.update(() => {
      for (const l of form.listeners.get('submit') ?? []) {
        l.call(form, {
          type: 'submit',
          target: form,
          currentTarget: form,
          defaultPrevented: false,
          preventDefault: () => undefined,
          stopPropagation: () => undefined,
        });
      }
    });
    expect(rename).toHaveBeenCalledWith(creature, 'Sparky');
  });

  it('lounges, unless it is already the lounger or is busy', () => {
    const lounge = vi.fn();
    const creature = kind('growing');
    const { card, page: p } = draw(creature, { open: true, actions: { onLounge: lounge } });
    p.click(byName(card, 'button', 'Lounge')[0] as FakeElement);
    expect(lounge).toHaveBeenCalledWith(creature);
    page?.unmount();
    const already = draw(creature, { open: true, loungerId: creature.id });
    expect(byName(already.card, 'button', 'Lounge')).toHaveLength(0);
    page?.unmount();
    const busy = draw({ ...creature, busy: { kind: 'job', id: 'job-1' } }, { open: true });
    expect(byName(busy.card, 'button', 'Lounge')).toHaveLength(0);
  });

  it('draws names as text, never as markup', () => {
    const creature = { ...kind('growing'), nickname: '<img src=x onerror=alert(1)>' };
    const { card } = draw(creature, { open: true });
    expect(find(card, (e) => e.localName === 'img')).toHaveLength(0);
    expect(visibleText(card)).toContain('<img src=x onerror=alert(1)>');
  });
});

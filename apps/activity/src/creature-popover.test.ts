import { describe, expect, it } from 'vitest';
import { entryView } from '@creatures/game';
import {
  CREATURE_VIEW,
  backLabel,
  canGoBack,
  creatureButtonLabel,
  creatureTags,
  goBack,
  onEscape,
  openTag,
  toggleCreature,
  type ActiveCreature,
  type CreatureInfo,
  type PopView,
} from './creature-popover';

const info: CreatureInfo = {
  name: 'Cindle',
  species: 'cindle',
  level: 7,
  element: 'ember',
  role: 'payoff',
};

describe('the creature popover state machine', () => {
  it('opens on the creature, switches to a tag, and goes back', () => {
    let view: PopView = CREATURE_VIEW;
    expect(view.kind).toBe('creature');
    expect(canGoBack(view)).toBe(false);
    view = openTag('element-ember');
    expect(view).toEqual({ kind: 'tag', entry: 'element-ember' });
    expect(canGoBack(view)).toBe(true);
    view = goBack();
    expect(view).toEqual(CREATURE_VIEW);
  });

  it('Escape goes back from an entry and only then closes', () => {
    const tag = openTag('role-payoff');
    const first = onEscape(tag);
    expect(first).toEqual({ view: CREATURE_VIEW, close: false });
    const second = onEscape(first.view);
    expect(second.close).toBe(true);
  });

  it('shows the other tag after going back, and back always leads to the creature', () => {
    const first = openTag('element-ember');
    expect(first).toEqual({ kind: 'tag', entry: 'element-ember' });
    expect(goBack()).toEqual(CREATURE_VIEW);
    expect(openTag('role-payoff')).toEqual({ kind: 'tag', entry: 'role-payoff' });
    // Whatever entry was open, Escape also leads to the creature before it closes.
    expect(onEscape(openTag('role-payoff')).view).toEqual(CREATURE_VIEW);
  });
});

describe('opening and closing from a tap', () => {
  const next = (key: string, anchor: object) => ({ key, info, anchor });

  it('opens on the creature face', () => {
    const anchor = {};
    const open = toggleCreature<object>(null, next('c1', anchor));
    expect(open?.view).toEqual(CREATURE_VIEW);
    expect(open?.info.name).toBe('Cindle');
  });

  it('a second tap on the same creature closes it, whichever face is showing', () => {
    const anchor = {};
    const open = toggleCreature<object>(null, next('c1', anchor)) as ActiveCreature<object>;
    expect(toggleCreature(open, next('c1', anchor))).toBeNull();
    const onTag: ActiveCreature<object> = { ...open, view: openTag('role-payoff') };
    expect(toggleCreature(onTag, next('c1', anchor))).toBeNull();
  });

  it('tapping another creature switches to it, on its creature face', () => {
    const a = {};
    const b = {};
    const open = toggleCreature<object>(null, next('c1', a)) as ActiveCreature<object>;
    const onTag: ActiveCreature<object> = { ...open, view: openTag('role-payoff') };
    const other = toggleCreature(onTag, next('c2', b));
    expect(other).toMatchObject({ key: 'c2', view: CREATURE_VIEW });
    // The same key at another place (a list that was drawn again) is another creature on screen.
    expect(toggleCreature(onTag, next('c1', b))?.view).toEqual(CREATURE_VIEW);
  });
});

describe('the tags and the labels', () => {
  it('has the element and the role, each with a glossary entry that exists', () => {
    const tags = creatureTags(info);
    expect(tags.map((t) => [t.kind, t.id])).toEqual([
      ['element', 'ember'],
      ['role', 'payoff'],
    ]);
    for (const tag of tags) expect(entryView(tag.entry), tag.entry).toBeDefined();
  });

  it('has a spoken label and a back label that name the creature', () => {
    expect(creatureButtonLabel(info)).toBe('Cindle, level 7. Shows its role and element.');
    expect(backLabel(info)).toBe('Back to Cindle');
  });
});

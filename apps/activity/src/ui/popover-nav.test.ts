import { describe, expect, it } from 'vitest';
import { escapeAction, toggleActive, viewFor } from './popover-nav';

interface Item {
  kind: string;
  key: string;
  anchor: object;
}

const item = (kind: string, key: string, anchor: object): Item => ({ kind, key, anchor });

describe('opening and closing from a tap', () => {
  const anchorA = { id: 'a' };
  const anchorB = { id: 'b' };

  it('opens when nothing is open', () => {
    const next = item('tag', 'e:bait', anchorA);
    expect(toggleActive<Item>(null, next)).toBe(next);
  });

  it('closes when the same trigger is tapped again', () => {
    const open = item('tag', 'e:bait', anchorA);
    expect(toggleActive(open, item('tag', 'e:bait', anchorA))).toBeNull();
  });

  it('switches to another trigger', () => {
    const open = item('tag', 'e:bait', anchorA);
    const other = item('tag', 'e:essence', anchorB);
    expect(toggleActive(open, other)).toBe(other);
  });

  it('switches when another trigger with the same meaning is tapped (another place on the page)', () => {
    const open = item('tag', 'e:bait', anchorA);
    const other = item('tag', 'e:bait', anchorB);
    expect(toggleActive(open, other)).toBe(other);
  });

  it('never takes a creature for a tag or a boss icon with the same key and anchor', () => {
    const open = item('creature', 'x', anchorA);
    const tag = item('tag', 'x', anchorA);
    expect(toggleActive(open, tag)).toBe(tag);
    const custom = item('custom', 'x', anchorA);
    expect(toggleActive(open, custom)).toBe(custom);
  });
});

describe('the faces of one popover', () => {
  // The creature popover: its first face is the creature (null), the others are glossary entries.
  type Face = string | null;
  const root: Face = null;
  const scopeA = {};
  const scopeB = {};

  it('starts on the first face', () => {
    expect(viewFor<Face>(null, root, scopeA)).toBeNull();
  });

  it('shows the face that was opened, for the popover it was opened in', () => {
    const state = { scope: scopeA, view: 'element-ember' };
    expect(viewFor<Face>(state, root, scopeA)).toBe('element-ember');
  });

  it('starts on the first face again when the popover is another one (a tap on another creature)', () => {
    const state = { scope: scopeA, view: 'element-ember' };
    expect(viewFor<Face>(state, root, scopeB)).toBeNull();
  });

  it('shows the first face after going back', () => {
    const state: { scope: object; view: Face } = { scope: scopeA, view: root };
    expect(viewFor<Face>(state, root, scopeA)).toBeNull();
  });
});

describe('what Escape does', () => {
  it('goes back from another face and only then closes', () => {
    expect(escapeAction({ canBack: true })).toBe('back');
    expect(escapeAction({ canBack: false })).toBe('close');
  });

  it('closes a popover that has only one face', () => {
    expect(escapeAction(undefined)).toBe('close');
  });
});

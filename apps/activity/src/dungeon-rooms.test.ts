import { dungeonContent } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import todayFixture from './fixtures/dungeon-today.json';
import { glyph } from './glyphs';
import { LANDMARK_UNLOCKS, depthTrack, modifierIcon, roomPanels } from './dungeon-rooms';
import type { DungeonToday } from './dungeon-types';
import type { IconRef } from './icon-ref';
import { trackNodes } from './progress-track';
import { elementIcon } from './sprites/element-icons';

const today = todayFixture as unknown as DungeonToday;

describe('the room panels of the pre-run screen', () => {
  it('has a panel for room 1, room 2 and the boss, in that order, with the day modifier on each', () => {
    const panels = roomPanels(today.modifiers);
    expect(panels.map((p) => p.title)).toEqual(['Room 1', 'Room 2', 'Boss']);
    expect(panels.map((p) => p.modifier?.id)).toEqual(today.modifiers.map((m) => m.id));
    for (const panel of panels) {
      expect(panel.modifier?.name.length).toBeGreaterThan(0);
      // The spoken text is the room and its modifier, and never a foe (none is known yet).
      expect(panel.spoken).toContain(panel.title);
      expect(panel.spoken).toContain(panel.modifier?.name ?? '?');
    }
  });

  it('matches the modifiers to their room, whatever the order the server listed them in', () => {
    const shuffled = [...today.modifiers].reverse();
    expect(roomPanels(shuffled).map((p) => p.modifier?.id)).toEqual(
      today.modifiers.map((m) => m.id),
    );
  });

  it('always has all three panels, with none for a modifier the server did not send', () => {
    const panels = roomPanels([]);
    expect(panels).toHaveLength(3);
    expect(panels.every((p) => p.modifier === null)).toBe(true);
    expect(panels[2]?.spoken).toBe('Boss.');
  });
});

describe('the icons of the room modifiers', () => {
  const sprite = (icon: IconRef): unknown =>
    icon.kind === 'element'
      ? elementIcon(icon.element)
      : icon.kind === 'glyph'
        ? glyph(icon.id)
        : undefined;

  it('gives every modifier of the content an icon that really exists', () => {
    expect(dungeonContent.modifiers.length).toBeGreaterThan(0);
    for (const m of dungeonContent.modifiers) {
      const icon = modifierIcon(m.id);
      expect(sprite(icon), m.id).toBeDefined();
      expect(icon, m.id).not.toEqual({ kind: 'glyph', id: 'unknown' });
    }
  });

  it('shows the boosted element for an element modifier, and different pictures for different tricks', () => {
    expect(modifierIcon('flooded')).toEqual({ kind: 'element', element: 'tide' });
    expect(modifierIcon('scorched')).toEqual({ kind: 'element', element: 'ember' });
    expect(modifierIcon('dark')).toEqual({ kind: 'glyph', id: 'reticle' });
    // A boost to roles shows the glyph of the first role it names (Guard: the shield).
    expect(modifierIcon('echoing')).toEqual({ kind: 'glyph', id: 'shield' });
    expect(modifierIcon('thorns')).toEqual({ kind: 'glyph', id: 'reflect_first_reaction' });
    expect(modifierIcon('brittle')).toEqual({ kind: 'glyph', id: 'warning' });
  });

  it('falls back to the plain diamond for a modifier it does not know', () => {
    expect(modifierIcon('no-such-modifier')).toEqual({ kind: 'glyph', id: 'unknown' });
  });

  it('draws the retired Fog of an old run as the plain diamond, without failing', () => {
    expect(dungeonContent.modifiers.some((m) => m.id === 'fog')).toBe(false);
    expect(modifierIcon('fog')).toEqual({ kind: 'glyph', id: 'unknown' });
    // Its stored name and text still make a panel (the server sent them with the run).
    const panels = roomPanels([
      {
        room: 0,
        id: 'fog',
        name: 'Fog',
        description: 'Nobody can see: everyone acts in row order.',
      },
    ]);
    expect(panels[0]?.modifier?.name).toBe('Fog');
    expect(panels[0]?.spoken).toContain('Fog');
  });
});

describe('the landmark depth track', () => {
  const labels = (depth: number): string[] =>
    trackNodes(depthTrack(depth).steps, depthTrack(depth).current).map(
      (n) => `${n.role}:${n.label}`,
    );

  it('shows only the next landmark ahead of a new player', () => {
    expect(labels(1)).toEqual(['current:Depth 1', 'next:Depth 7']);
    expect(labels(6)).toEqual(['current:Depth 6', 'next:Depth 7']);
  });

  it('is on the landmark itself at depth 7, with its rewards, and no previous step', () => {
    const track = depthTrack(7);
    expect(labels(7)).toEqual(['current:Depth 7', 'next:Depth 14']);
    expect(track.steps[track.current]?.unlocks).toEqual(LANDMARK_UNLOCKS);
  });

  it('goes from the depth now to the next landmark, with nothing behind it', () => {
    expect(labels(9)).toEqual(['current:Depth 9', 'next:Depth 14']);
    expect(labels(14)).toEqual(['current:Depth 14', 'next:Depth 21']);
    expect(labels(15)).toEqual(['current:Depth 15', 'next:Depth 21']);
    const track = depthTrack(9);
    expect(track.steps[track.current]?.unlocks).toEqual([]);
  });

  it('counts the depths in between for the unlabelled pips (3 to 6 between 2 and 7)', () => {
    expect(depthTrack(2).between).toBe(4);
    expect(depthTrack(1).between).toBe(5);
    expect(depthTrack(6).between).toBe(0);
    // At a landmark the next one is a whole stretch away.
    expect(depthTrack(7).between).toBe(6);
    expect(depthTrack(9).between).toBe(4);
    for (const depth of [1, 2, 6, 7, 8, 13, 14, 50]) {
      const track = depthTrack(depth);
      const [now, next] = track.steps;
      expect(Number(next?.id) - Number(now?.id) - 1, String(depth)).toBe(track.between);
    }
  });

  it('never shows a step past the next landmark, and has no end', () => {
    for (const depth of [1, 7, 8, 13, 14, 50, 700]) {
      const nodes = trackNodes(depthTrack(depth).steps, depthTrack(depth).current);
      expect(nodes.map((n) => n.role)).toEqual(['current', 'next']);
    }
  });

  it('calls the landmark reward a gear drop, not a sure one', () => {
    expect(LANDMARK_UNLOCKS.map((u) => u.text)).toEqual(['Gear drop', 'Bonus Essence']);
  });

  it('treats a depth below 1 as depth 1', () => {
    expect(labels(0)).toEqual(['current:Depth 1', 'next:Depth 7']);
    expect(labels(-3)).toEqual(['current:Depth 1', 'next:Depth 7']);
  });

  it('says what a landmark gives in words, with every icon a real glyph and no number', () => {
    expect(LANDMARK_UNLOCKS.length).toBeGreaterThan(0);
    for (const u of LANDMARK_UNLOCKS) {
      expect(glyph(u.icon), u.icon).toBeDefined();
      expect(u.text).not.toMatch(/\d/);
    }
  });
});

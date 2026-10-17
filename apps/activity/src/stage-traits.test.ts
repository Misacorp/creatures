import { describe, expect, it } from 'vitest';

/**
 * The traits shown during a fight (Misa, 2026-10-15): the room's modifiers as glossary tags in the
 * stage head, the foe's element chip right after its name, and a popover on the foe's picture.
 * Components are not rendered in tests, so this reads the JSX of the pieces and checks they are
 * wired: the content logic itself is in `foe-info.test.ts`.
 */
const files = import.meta.glob<string>(
  ['./Stage.tsx', './DungeonPlayback.tsx', './PopoverHost.tsx', './ui/StageHead.tsx'],
  { query: '?raw', import: 'default', eager: true },
);
const stage = files['./Stage.tsx'] ?? '';
const playback = files['./DungeonPlayback.tsx'] ?? '';
const host = files['./PopoverHost.tsx'] ?? '';
const head = files['./ui/StageHead.tsx'] ?? '';

describe('the traits on the fight stage', () => {
  it('finds the sources', () => {
    for (const source of [stage, playback, host, head]) expect(source.length).toBeGreaterThan(100);
  });

  it('shows each modifier in the head as a glossary tag, after the place and before the controls', () => {
    expect(head).toContain('GLOSSARY_IDS.modifier(m.id)');
    expect(head).toContain('<GlossaryTag');
    const place = head.indexOf('stage-place');
    const tags = head.indexOf('modifiers.map');
    const children = head.indexOf('{children}');
    expect(place).toBeGreaterThan(-1);
    expect(tags).toBeGreaterThan(place);
    expect(children).toBeGreaterThan(tags);
  });

  it("hands the dungeon room's modifier to the stage head", () => {
    expect(playback).toContain('modifiers={[room.modifier]}');
    expect(stage).toContain('{...(modifiers === undefined ? {} : { modifiers })}');
  });

  it("puts the foe's element chip on the same row, right after its name", () => {
    const line = stage.indexOf('class="stage-foe-line"');
    const name = stage.indexOf('class="stage-foe-name pix"');
    const chip = stage.indexOf('<ElementChip element={foe.element} context="boss" />');
    expect(line).toBeGreaterThan(-1);
    expect(name).toBeGreaterThan(line);
    expect(chip).toBeGreaterThan(name);
    // Nothing between the name and the chip but the line's own markup.
    expect(stage.slice(name, chip)).not.toContain('<SegmentBar');
  });

  it("opens the foe's popover from its picture, through the popover host", () => {
    expect(stage).toContain('<FoeFace info={foe}>');
    expect(stage).toContain('host.openFoe(');
    expect(host).toContain('openFoe: (key, info, anchor)');
    expect(host).toContain("open?.kind === 'foe'");
  });

  it('renders the foe popover as text only', () => {
    expect(host).not.toContain('innerHTML');
    expect(stage).not.toContain('innerHTML');
    expect(stage).not.toMatch(/\bstyle=/);
  });
});

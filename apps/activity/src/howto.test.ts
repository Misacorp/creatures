import { RULES, content, dungeonContent, howToPlay } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { bossArt } from './art';
import {
  dungeonRooms,
  evolutionExample,
  exampleSeason,
  exampleSpecies,
  expeditionTrips,
  starterSpecies,
  weekStrip,
} from './howto';

describe('the example creatures', () => {
  it('shows each role with a creature that has it', () => {
    for (const role of ['setter', 'payoff', 'guard', 'support'] as const) {
      const species = exampleSpecies(role);
      expect(species?.role, role).toBe(role);
      expect(species?.stage).toBe(1);
      expect(species?.festival).not.toBe(true);
    }
  });

  it('shows the three starters', () => {
    expect(starterSpecies().map((s) => s.id)).toEqual(['splashet', 'cindle', 'sproutle']);
  });

  it('uses the worked example of the text: a Setter and the creature that cashes it in', () => {
    const { setter, payoff } = howToPlay.example;
    expect(exampleSpecies('setter')?.id).toBe(setter);
    expect(content.creatures.find((c) => c.id === payoff)?.role).toBe('payoff');
  });

  it('shows an evolution with its Essence cost from the content', () => {
    const evolution = evolutionExample();
    expect(evolution).toEqual({ from: 'splashet', to: 'tidewing', essence: 20 });
  });
});

describe('the raid week and the rest of the pictures', () => {
  it('lists the four steps with the weekdays of the schedule', () => {
    expect(weekStrip().map((s) => [s.event, s.day])).toEqual([
      ['weekStart', 'Mon'],
      ['phase1', 'Fri'],
      ['phase2', 'Sat'],
      ['finale', 'Sun'],
    ]);
    expect(weekStrip().map((s) => s.title)).toEqual([
      'Preparation',
      'Phase 1',
      'Phase 2',
      'Finale',
    ]);
  });

  it('follows a changed schedule', () => {
    const moved = { ...RULES.raid.schedule, finale: { weekday: 6, hour: 18, minute: 0 } };
    expect(weekStrip(moved).at(-1)?.day).toBe('Sat');
  });

  it('shows the expedition trips anyone can send, with their hours from the rules', () => {
    expect(expeditionTrips()).toEqual([
      { hours: 2, size: 1 },
      { hours: 6, size: 2 },
      { hours: 12, size: 3 },
    ]);
  });

  it('leaves out the 24 hour trip, which needs explorer rank, and follows the rules', () => {
    expect(expeditionTrips().some((t) => t.hours === 24)).toBe(false);
    const changed = {
      ...RULES.expeditions.lengths,
      medium: { ...RULES.expeditions.lengths.medium, ms: 5 * 3_600_000 },
    };
    expect(expeditionTrips(changed).map((t) => t.hours)).toEqual([2, 5, 12]);
  });

  it('says the same trip lengths in the Expeditions text as the picture shows', () => {
    const section = howToPlay.sections.find((s) => s.id === 'expeditions');
    const text = section?.lines.join(' ') ?? '';
    const hours = expeditionTrips().map((t) => String(t.hours));
    expect(text).toContain(`${hours.slice(0, -1).join(', ')} or ${hours.at(-1) ?? '?'} hours`);
  });

  it('shows a season of five weeks ending in the Festival', () => {
    const pips = exampleSeason();
    expect(pips).toHaveLength(RULES.progression.seasonWeeks);
    expect(pips.map((p) => p.state)).toEqual(['done', 'now', 'ahead', 'ahead', 'ahead']);
    expect(pips.filter((p) => p.festival).map((p) => p.week)).toEqual([5]);
  });
});

describe('the dungeon picture', () => {
  it("shows the rules' rooms: foes of different elements, then a floor boss", () => {
    const rooms = dungeonRooms();
    expect(rooms).toHaveLength(RULES.dungeon.rooms);
    expect(rooms.map((r) => r.boss)).toEqual([false, false, true]);
    const elements = rooms.slice(0, -1).map((r) => r.element);
    expect(new Set(elements).size).toBe(elements.length);
    for (const room of rooms) {
      const def = dungeonContent.foes.find((f) => f.id === room.id);
      expect(def?.kind).toBe(room.boss ? 'boss' : 'foe');
      expect(def?.name).toBe(room.name);
      expect(def?.element).toBe(room.element);
    }
  });

  it('draws every room with real art, not the silhouette', () => {
    const silhouette = bossArt('no-such-foe').sprite;
    for (const room of dungeonRooms())
      expect(bossArt(room.id).sprite, room.id).not.toBe(silhouette);
  });

  it('copes with fewer foes than rooms and with no boss', () => {
    const onlyBosses = dungeonContent.foes.filter((f) => f.kind === 'boss');
    expect(dungeonRooms(3, onlyBosses).map((r) => r.boss)).toEqual([true]);
    expect(dungeonRooms(3, [])).toEqual([]);
  });
});

import { RULES, content, howToPlay } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  evolutionExample,
  exampleSeason,
  exampleSpecies,
  expeditionTrips,
  reactionLoop,
  starterSpecies,
  weekStrip,
} from './howto';

describe('the reaction loop picture', () => {
  it('goes Tide, Spark, Grove, Ember and back to Tide with the shipped content', () => {
    const steps = reactionLoop();
    expect(steps.map((s) => s.from)).toEqual(['tide', 'spark', 'grove', 'ember']);
    expect(steps.map((s) => s.to)).toEqual(['spark', 'grove', 'ember', 'tide']);
    expect(steps.map((s) => s.markName)).toEqual(['Soaked', 'Charged', 'Overgrown', 'Scorched']);
    expect(steps.map((s) => s.reactionName)).toEqual([
      'Overload',
      'Grounding',
      'Wildfire',
      'Steam',
    ]);
  });

  it('has each step end where the next begins, and the last end where the first began', () => {
    const steps = reactionLoop();
    steps.forEach((step, i) => {
      expect(step.to).toBe(steps[(i + 1) % steps.length]?.from);
    });
  });

  it('stops where the content does not close into a loop, and is empty without reactions', () => {
    const open = content.reactions.filter((r) => r.id !== 'steam');
    // Ember's mark has no reaction here, so the loop stops after Grove's arrow.
    expect(reactionLoop(open).map((s) => s.from)).toEqual(['tide', 'spark', 'grove']);
    expect(reactionLoop([])).toEqual([]);
  });
});

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
      'Boss reveal',
      'Phase 1',
      'Phase 2',
      'Finale',
    ]);
  });

  it('follows a changed schedule', () => {
    const moved = { ...RULES.raid.schedule, finale: { weekday: 6, hour: 18, minute: 0 } };
    expect(weekStrip(moved).at(-1)?.day).toBe('Sat');
  });

  it('shows the expedition trips with their hours and catches', () => {
    expect(expeditionTrips()).toEqual([
      { hours: 1, catches: 1 },
      { hours: 6, catches: 2 },
      { hours: 12, catches: 3 },
    ]);
  });

  it('shows a season of five weeks ending in the Festival', () => {
    const pips = exampleSeason();
    expect(pips).toHaveLength(RULES.progression.seasonWeeks);
    expect(pips.map((p) => p.state)).toEqual(['done', 'now', 'ahead', 'ahead', 'ahead']);
    expect(pips.filter((p) => p.festival).map((p) => p.week)).toEqual([5]);
  });
});

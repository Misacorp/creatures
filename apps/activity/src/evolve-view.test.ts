import { describe, expect, it } from 'vitest';
import { effectiveStats, content } from '@creatures/game';
import type { Creature } from './api';
import { sampleCreature } from './creature-card-sample';
import { evolutionText, creatureAbilityText } from './game';
import { abilityDef } from './live';
import { evolveButtonLabel, evolveForms, evolveTargets } from './evolve-view';
import { creatureNeeds } from './creature-needs';
import { SAMPLE_STATE } from './creature-card-sample';

const branching = sampleCreature('evolve choice');
/** A line that grows one way: the sample's evolution without its second form (the game has none left, the code still handles it). */
function oneForm(creature: Creature): Creature {
  const evolution = { ...creature.evolution! };
  delete evolution.alt;
  return { ...creature, evolution };
}

const single = oneForm(sampleCreature('evolve ready'));

describe('the forms of an evolution', () => {
  it('lists the forms of a line that grows two ways and of one that grows one way', () => {
    expect(evolveTargets(branching)).toEqual(['thornbuck', 'sunfawn']);
    expect(evolveTargets(single)).toEqual(['pyrelynx']);
    expect(evolveForms(single).map((f) => f.species)).toEqual(['pyrelynx']);
    expect(evolveTargets({})).toEqual([]);
  });

  it('shows Thornbuck and Sunfawn: role, element, ability and the numbers at its level', () => {
    const [thornbuck, sunfawn] = evolveForms(branching);
    expect(thornbuck).toMatchObject({
      species: 'thornbuck',
      name: 'Thornbuck',
      element: 'grove',
      role: 'guard',
      ability: { name: 'Ironbark Guard' },
    });
    expect(sunfawn).toMatchObject({
      species: 'sunfawn',
      name: 'Sunfawn',
      element: 'grove',
      role: 'support',
      ability: { name: 'Sunny Patch' },
    });
    const species = content.creatures.find((c) => c.id === 'sunfawn');
    expect(sunfawn?.stats).toEqual(effectiveStats(species ?? content.creatures[0]!, 15, 0));
    // The words are the content's, so the numbers in them are the real ones.
    expect(sunfawn?.ability?.text).toBe(abilityDef('sunny-patch')?.description);
    expect(sunfawn?.ability?.text).toContain('6%');
  });

  it('shows Voltaro and Ohmouse for Zipmouse, with the fusions in the numbers', () => {
    const zipmouse = {
      level: 15,
      fusionCount: 2,
      evolution: {
        toSpecies: 'voltaro',
        level: 15,
        essence: 20,
        available: true,
        alt: { toSpecies: 'ohmouse' },
      },
    };
    const [voltaro, ohmouse] = evolveForms(zipmouse);
    expect(voltaro).toMatchObject({ role: 'setter', element: 'spark' });
    expect(ohmouse).toMatchObject({
      role: 'guard',
      element: 'spark',
      ability: { name: 'Static Wall' },
    });
    const fused = content.creatures.find((c) => c.id === 'ohmouse');
    expect(ohmouse?.stats).toEqual(effectiveStats(fused ?? content.creatures[0]!, 15, 2));
    // A guard's HP is the biggest of the two, its speed the smallest.
    expect(ohmouse?.stats.hp).toBeGreaterThan(voltaro?.stats.hp ?? 0);
    expect(ohmouse?.stats.spd).toBeLessThan(voltaro?.stats.spd ?? 0);
  });

  it('leaves out a form the content does not know', () => {
    const odd = {
      ...branching,
      evolution: { ...branching.evolution!, alt: { toSpecies: 'nobody' } },
    };
    expect(evolveForms(odd).map((f) => f.species)).toEqual(['thornbuck']);
  });

  it('labels the button with the form, and asks to pick first', () => {
    const [thornbuck] = evolveForms(branching);
    expect(evolveButtonLabel(thornbuck)).toBe('Evolve into Thornbuck');
    expect(evolveButtonLabel(undefined)).toBe('Pick a form');
  });
});

describe('the words around a line that grows two ways', () => {
  it('says just "Evolve" on the buttons, and names both forms when it is not ready', () => {
    const evolution = branching.evolution!;
    expect(evolutionText(15, evolution, 50)).toEqual({
      available: true,
      label: 'Evolve (20 Essence)',
    });
    expect(evolutionText(10, { ...evolution, available: false }, 50).label).toBe(
      'Evolve into Thornbuck or Sunfawn: needs level 15',
    );
    // A line with one form says the same: the evolve screen names the form.
    expect(evolutionText(15, single.evolution!, 50).label).toBe('Evolve (20 Essence)');
  });

  it('says "Evolve" in the needs of the card, for one form or two', () => {
    const [need] = creatureNeeds(branching, SAMPLE_STATE);
    expect(need).toMatchObject({
      kind: 'evolve',
      label: 'Evolve',
      detail: '20 Essence',
    });
    const [one] = creatureNeeds(single, SAMPLE_STATE);
    expect(one?.label).toBe('Evolve');
  });

  it('teases both forms instead of one ability', () => {
    const text = creatureAbilityText(branching, (id) => abilityDef(id));
    expect(text?.teaser).toBe('Evolves into: Thornbuck or Sunfawn');
    const old = creatureAbilityText(single, (id) => abilityDef(id));
    expect(old?.teaser).toBe('Evolves into: Pyrelynx (Inferno Strike)');
  });
});

describe('the forms of every evolving line', () => {
  const evolving = content.creatures.filter(
    (c) => c.evolvesTo !== undefined && c.altEvolvesTo !== undefined,
  );

  it('shows one form for a line that does not branch (the Mire lines), with its ability', () => {
    const single = content.creatures.filter(
      (c) => c.evolvesTo !== undefined && c.altEvolvesTo === undefined,
    );
    expect(single.map((c) => c.id)).toEqual(['mudlump', 'squelch']);
    for (const line of single) {
      const creature = {
        level: 15,
        fusionCount: 0,
        evolution: {
          toSpecies: line.evolvesTo?.species ?? '',
          level: 15,
          essence: line.evolvesTo?.essence ?? 0,
          available: true,
        },
      };
      const forms = evolveForms(creature);
      expect(forms.map((f) => f.species)).toEqual([line.evolvesTo?.species]);
      expect(forms[0]?.element).toBe('mire');
      expect(forms[0]?.ability?.text).toBeTruthy();
      expect(evolveTargets(creature)).toEqual([line.evolvesTo?.species]);
    }
  });

  it('shows two forms of one element and two roles, each with an ability and a short name', () => {
    expect(evolving).toHaveLength(8);
    for (const line of evolving) {
      const creature = {
        level: 15,
        fusionCount: 0,
        evolution: {
          toSpecies: line.evolvesTo?.species ?? '',
          level: 15,
          essence: line.evolvesTo?.essence ?? 0,
          available: true,
          alt: { toSpecies: line.altEvolvesTo?.species ?? '' },
        },
      };
      const [first, second] = evolveForms(creature);
      expect(first, line.id).toBeDefined();
      expect(second, line.id).toBeDefined();
      if (first === undefined || second === undefined) continue;
      expect(second.element, line.id).toBe(first.element);
      expect(second.role, line.id).not.toBe(first.role);
      expect(first.ability?.text, first.species).toBeTruthy();
      expect(second.ability?.text, second.species).toBeTruthy();
      // The two columns are half a 390 px phone: no name is longer than Ancientshell.
      for (const form of [first, second]) {
        expect(form.name.length, form.name).toBeLessThanOrEqual(12);
      }
      expect(evolveTargets(creature)).toEqual([first.species, second.species]);
    }
  });
});

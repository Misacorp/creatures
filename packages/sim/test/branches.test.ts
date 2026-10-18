import { describe, expect, it } from 'vitest';
import { speciesOf, type OwnedCreature } from '../src/data';
import { evolveCreatures } from '../src/economy';
import { pickBranch } from '../src/policy';
import { PRESETS } from '../src/profiles';
import { createPlayer, type SimPlayer } from '../src/state';

/**
 * The branch pick of the simulated player (`pickBranch` in policy.ts): the form whose role the rest of the
 * team lacks, else the original form. Sproutle grows into Thornbuck (Guard) or Sunfawn (Support), Zipmouse
 * into Voltaro (Setter) or Ohmouse (Guard).
 */

function owned(line: string, level: number, speciesId = line): OwnedCreature {
  return {
    id: `p01/${line}`,
    line,
    speciesId,
    level,
    fusionCount: 0,
    exp: 0,
    ribbons: level > 10 ? 1 : 0,
  };
}

function player(creatures: OwnedCreature[], essence = 100): SimPlayer {
  const p = createPlayer('p01', 'P', 'daily', 1, { ...PRESETS.engaged });
  p.joined = true;
  p.essence = essence;
  p.creatures.push(...creatures);
  return p;
}

describe('which form a branching line grows into', () => {
  it('takes the first form (the original) when the team has no creature of that role', () => {
    // Splashet is a Setter and Cindle a Payoff: no Guard, so Sproutle is a Thornbuck.
    const sproutle = owned('sproutle', 15);
    const team = [owned('splashet', 12), owned('cindle', 12), sproutle];
    expect(pickBranch(team, sproutle)?.species).toBe('thornbuck');
  });

  it('takes the second form when the team already has a creature of the first one’s role', () => {
    // Mistnewt is a Guard: Sproutle's own Guard form would double up, so it takes the Support.
    const sproutle = owned('sproutle', 15);
    const team = [owned('mistnewt', 14), owned('splashet', 12), sproutle];
    expect(pickBranch(team, sproutle)?.species).toBe('sunfawn');
  });

  it('does the same for Zipmouse: a Setter-heavy team grows the Guard', () => {
    const zipmouse = owned('zipmouse', 15);
    const noSetter = [owned('cindle', 12), owned('ashmole', 12), zipmouse];
    expect(pickBranch(noSetter, zipmouse)?.species).toBe('voltaro');
    const hasSetter = [owned('splashet', 14), owned('cindle', 12), zipmouse];
    expect(pickBranch(hasSetter, zipmouse)?.species).toBe('ohmouse');
  });

  it('counts only the three strongest creatures, and not the creature that is growing', () => {
    const sproutle = owned('sproutle', 15);
    // A weak Guard outside the team does not count; the Sproutle's own role does not count either.
    const team = [
      owned('splashet', 14),
      owned('cindle', 14),
      owned('zipmouse', 14),
      owned('mistnewt', 1),
      sproutle,
    ];
    expect(pickBranch(team, sproutle)?.species).toBe('thornbuck');
  });

  it('falls back to the first form when both roles are covered, and has one form for a plain line', () => {
    // A Guard and a Support are already on the team: neither form fills a gap, so the original it is.
    const sproutle = owned('sproutle', 15);
    const covered = [owned('mistnewt', 14), owned('ashmole', 14), sproutle];
    expect(pickBranch(covered, sproutle)?.species).toBe('thornbuck');
    const splashet = owned('splashet', 15);
    expect(pickBranch([splashet], splashet)?.species).toBe('tidewing');
    const tidewing = owned('splashet', 15, 'tidewing');
    expect(pickBranch([tidewing], tidewing)).toBeUndefined();
  });
});

describe('the evolve step of a check-in', () => {
  it('evolves a ready creature into the picked form, pays the one Essence price, and counts it', () => {
    const sproutle = owned('sproutle', 15);
    const p = player([owned('mistnewt', 14), owned('splashet', 12), sproutle], 100);
    evolveCreatures(p);
    // The Guard is already on the team, so the Sproutle took the Support form.
    expect(speciesOf(sproutle.speciesId).id).toBe('sunfawn');
    expect(p.essence).toBe(100 - (speciesOf('sproutle').evolvesTo?.essence ?? 0));
    expect(p.week.evolutions).toBe(1);
  });
});

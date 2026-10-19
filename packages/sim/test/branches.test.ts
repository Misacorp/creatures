import { describe, expect, it } from 'vitest';
import { speciesOf, type OwnedCreature } from '../src/data';
import { evolveCreatures, runEconomy } from '../src/economy';
import { pickBranch, usesRoleBranch } from '../src/policy';
import { BRANCH_STYLES, LEGACY_PROFILES, PRESETS, parseProfile } from '../src/profiles';
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

  it('falls back to the first form when both roles are covered, and has none for an evolved creature', () => {
    // A Guard and a Support are already on the team: neither form fills a gap, so the original it is.
    const sproutle = owned('sproutle', 15);
    const covered = [owned('mistnewt', 14), owned('ashmole', 14), sproutle];
    expect(pickBranch(covered, sproutle)?.species).toBe('thornbuck');
    // Alone on the team, a Splashet takes its first form: no role is taken.
    const splashet = owned('splashet', 15);
    expect(pickBranch([splashet], splashet)?.species).toBe('tidewing');
    const tidewing = owned('splashet', 15, 'tidewing');
    expect(pickBranch([tidewing], tidewing)).toBeUndefined();
  });
});

describe('every evolving line grows two ways', () => {
  // The line, its first form and its second, then the line of a teammate whose role is the first form's.
  const LINES = [
    ['splashet', 'tidewing', 'geyserpup', 'zipmouse'], // Setter
    ['cindle', 'pyrelynx', 'wickat', 'stormray'], // Payoff
    ['sproutle', 'thornbuck', 'sunfawn', 'mistnewt'], // Guard
    ['zipmouse', 'voltaro', 'ohmouse', 'splashet'], // Setter
    ['mistnewt', 'fogwyrm', 'drizzlewt', 'sproutle'], // Guard
    ['ashmole', 'magmole', 'kilnmole', 'aurorix'], // Support
    ['stormray', 'tempestray', 'halcyray', 'cindle'], // Payoff
    ['mossback', 'ancientshell', 'bloomback', 'splashet'], // Setter
  ] as const;

  it.each(LINES)(
    '%s grows into %s, or into %s when the team already has its role',
    (line, first, second, teammateLine) => {
      const creature = owned(line, 15);
      expect(pickBranch([creature], creature)?.species).toBe(first);
      const team = [owned(teammateLine, 14, teammateLine), creature];
      expect(pickBranch(team, creature)?.species).toBe(second);
    },
  );
});

describe('the evolve step of a check-in', () => {
  it('takes the original form by default, whatever the team', () => {
    const sproutle = owned('sproutle', 15);
    const p = player([owned('mistnewt', 14), owned('splashet', 12), sproutle], 100);
    evolveCreatures(p);
    expect(speciesOf(sproutle.speciesId).id).toBe('thornbuck');
  });

  it('evolves a ready creature into the picked form, pays the one Essence price, and counts it', () => {
    const sproutle = owned('sproutle', 15);
    const p = player([owned('mistnewt', 14), owned('splashet', 12), sproutle], 100);
    evolveCreatures(p, pickBranch);
    // The Guard is already on the team, so the Sproutle took the Support form.
    expect(speciesOf(sproutle.speciesId).id).toBe('sunfawn');
    expect(p.essence).toBe(100 - (speciesOf('sproutle').evolvesTo?.essence ?? 0));
    expect(p.week.evolutions).toBe(1);
  });
});

describe('the branch style of a player', () => {
  it('first never picks by role and role always does', () => {
    for (const id of ['p01', 'p02', 'p03']) {
      expect(usesRoleBranch('first', 'seed', id)).toBe(false);
      expect(usesRoleBranch('role', 'seed', id)).toBe(true);
    }
  });

  it('mixed is a repeatable coin per seed and player, about half of the players', () => {
    const ids = Array.from({ length: 200 }, (_, i) => `p${String(i)}`);
    const draw = (seed: string): boolean[] => ids.map((id) => usesRoleBranch('mixed', seed, id));
    expect(draw('leet')).toEqual(draw('leet'));
    expect(draw('leet')).not.toEqual(draw('leet2'));
    const share = draw('leet').filter(Boolean).length / ids.length;
    // 200 fair coins: 0.5 give or take 0.035 per standard deviation, so this is a 4 sigma band.
    expect(share).toBeGreaterThan(0.36);
    expect(share).toBeLessThan(0.64);
  });

  it('is part of every profile, mixed unless written otherwise, and is validated', () => {
    expect(BRANCH_STYLES).toEqual(['first', 'role', 'mixed']);
    for (const profile of [...Object.values(PRESETS), ...Object.values(LEGACY_PROFILES)]) {
      expect(profile.branch).toBe('mixed');
    }
    const old: Partial<typeof PRESETS.engaged> = { ...PRESETS.engaged };
    delete old.branch;
    expect(parseProfile(old).branch).toBe('mixed');
    expect(parseProfile({ ...old, branch: 'role' }).branch).toBe('role');
    expect(() => parseProfile({ ...old, branch: 'both' })).toThrow(/Invalid profile/);
  });

  it('a new player takes the first form unless the economy gave it the role style', () => {
    expect(createPlayer('p01', 'P', 'daily', 1).roleBranch).toBe(false);
    const sproutle = owned('sproutle', 15);
    const p = createPlayer('p01', 'P', 'daily', 1, { ...PRESETS.engaged }, true);
    p.joined = true;
    p.essence = 100;
    p.creatures.push(owned('mistnewt', 14), owned('splashet', 12), sproutle);
    evolveCreatures(p);
    expect(speciesOf(sproutle.speciesId).id).toBe('sunfawn');
  });

  it('the economy hands each roster player its style from the profile and the seed', () => {
    const result = runEconomy({
      seed: 'branch-wiring',
      weeks: 1,
      snapshotWeeks: [1],
      roster: [
        { profile: { ...PRESETS.engaged, branch: 'role' } },
        { profile: { ...PRESETS.engaged, branch: 'first' } },
      ],
    });
    const players = result.snapshots[0]?.players ?? [];
    expect(players.map((p) => p.roleBranch)).toEqual([true, false]);
  });
});

import { RULES, itemOf } from '@creatures/game';
import { afterEach, describe, expect, it } from 'vitest';
import { byPowerDesc, creaturePower, teamPower, type OwnedCreature } from '../src/data';

/**
 * The power score the simulator picks teams by counts dodge (docs/design/speed-and-dodge.md section 7 and
 * `creaturePower` in `@creatures/game`): with dodge on, effective HP is HP / (1 - dodge), so Speed builds
 * (Fleet, Light-footed) are not ignored. With dodge off the score is the old Attack + HP / 10.
 */

const dodge = RULES.combat.dodge as { enabled: boolean };
const shipped = dodge.enabled;
afterEach(() => {
  dodge.enabled = shipped;
});

const base = (line: string): OwnedCreature => ({
  id: `p1/${line}`,
  line,
  speciesId: line,
  level: 20,
  fusionCount: 0,
});
const wearing = (c: OwnedCreature, lineId?: string): OwnedCreature => ({
  ...c,
  items: {
    charm: {
      uid: 1,
      ...itemOf('trail-charm', 'epic', 20, lineId === undefined ? [] : [{ id: lineId, tier: 4 }]),
    },
  },
});

describe('the simulator power score and dodge', () => {
  it('is unchanged by Fleet and Light-footed while dodge is off', () => {
    dodge.enabled = false;
    const plain = wearing(base('pyrelynx'));
    expect(creaturePower(wearing(base('pyrelynx'), 'fleet'))).toBe(creaturePower(plain));
    expect(creaturePower(wearing(base('pyrelynx'), 'light-footed'))).toBe(creaturePower(plain));
  });

  it('counts a Speed line and a flat dodge line once dodge is on', () => {
    dodge.enabled = true;
    const plain = wearing(base('pyrelynx'));
    const fleet = creaturePower(wearing(base('pyrelynx'), 'fleet'));
    const light = creaturePower(wearing(base('pyrelynx'), 'light-footed'));
    expect(fleet).toBeGreaterThan(creaturePower(plain));
    expect(light).toBeGreaterThan(creaturePower(plain));
    // The team score and the ranking follow.
    expect(
      byPowerDesc([plain, wearing(base('thornbuck'), 'light-footed'), wearing(plain, 'fleet')])[0],
    ).toBeDefined();
    expect(teamPower([wearing(plain, 'light-footed')])).toBe(light);
  });
});

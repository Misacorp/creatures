import { content } from '@creatures/game';
import { combatV2 } from '@creatures/game/combat-v2';
import { describe, expect, it } from 'vitest';
import {
  MARK_FIELDS,
  MARK_FIELDS_UNRELATED,
  kitMarks as kitMarksWith,
  partnerWords,
  partnersOf as partnersOfWith,
  reactionPaint,
  type PartnerKit,
} from './reaction-partners';

const kitMarks = (k: PartnerKit) => kitMarksWith(k, combatV2);
const partnersOf = (t: PartnerKit, o: readonly PartnerKit[]) => partnersOfWith(t, o, combatV2);

/** The kit of a shipped species, by id: its role and element from the content. */
function kit(
  id: string,
  species: string,
  extra: Partial<Omit<PartnerKit, 'id' | 'role' | 'element'>> = {},
): PartnerKit {
  const s = content.creatures.find((c) => c.id === species);
  if (s === undefined) throw new Error(`no species ${species}`);
  return { id, role: s.role, element: s.element, ...extra };
}

const names = (m: ReadonlyMap<string, unknown>): string[] => [...m.keys()].sort();

describe('kitMarks', () => {
  it('a Setter sets its own element and cashes nothing', () => {
    const marks = kitMarks(kit('a', 'splashet'));
    expect([...marks.sets]).toEqual(['tide']);
    expect(marks.cashes.size).toBe(0);
  });

  it('a Payoff cashes the marks its element triggers, from the chart, and sets none', () => {
    const marks = kitMarks(kit('a', 'cindle'));
    expect([...marks.cashes].sort()).toEqual(['grove', 'mire']);
    expect(marks.sets.size).toBe(0);
  });

  it('a Guard or a Support with no marking Knack does neither', () => {
    for (const species of ['sproutle', 'ashmole']) {
      const marks = kitMarks(kit('a', species));
      expect(marks.sets.size + marks.cashes.size).toBe(0);
    }
  });

  it('a Knack can make a non-Setter set marks, by its own element or the one it can cash', () => {
    expect([...kitMarks(kit('a', 'ashmole', { knack: 'ready-the-mark' })).sets]).toEqual(['ember']);
    expect([...kitMarks(kit('a', 'sproutle', { knack: 'primed-by-pain' })).sets]).toEqual([
      'grove',
    ]);
    // Puddle Maker marks what the creature itself can cash: Ember cashes Grove first (the content's element order).
    const own = kit('a', 'ashmole', { knack: 'puddle-maker' });
    expect([...kitMarks(own).sets]).toEqual([
      content.elements
        .map((e) => e.id)
        .find((m) =>
          content.elementChart.some(
            (p) => p.attacker === 'ember' && p.defender === m && p.bp === 15_000,
          ),
        ),
    ]);
  });

  it('Leave a Trail makes a Payoff a setter of its own element too', () => {
    const marks = kitMarks(kit('a', 'cindle', { knack: 'leave-a-trail' }));
    expect([...marks.sets]).toEqual(['ember']);
    expect([...marks.cashes].sort()).toEqual(['grove', 'mire']);
  });

  it('a hit that deals no damage cashes nothing, but still marks', () => {
    // Double Mark: a Setter's Knack that gives up its damage.
    const marks = kitMarks(kit('a', 'splashet', { knack: 'double-mark' }));
    expect([...marks.sets]).toEqual(['tide']);
    expect(marks.cashes.size).toBe(0);
  });

  it('worn gear contributes: the three-piece set effect that leaves a trail', () => {
    const ridge = [
      { baseId: 'ridge-copper-cap', slot: 'hat' as const },
      { baseId: 'ridge-copper-scarf', slot: 'scarf' as const },
      { baseId: 'ridge-copper-bead', slot: 'charm' as const },
    ];
    const bare = kitMarks(kit('a', 'tempestray'));
    const worn = kitMarks(kit('a', 'tempestray', { gear: ridge }));
    expect(bare.sets.size).toBe(0);
    expect([...worn.sets]).toEqual(['spark']);
    // Two pieces are not enough, and the effect is for a Spark wearer.
    expect(kitMarks(kit('a', 'tempestray', { gear: ridge.slice(0, 2) })).sets.size).toBe(0);
    expect(kitMarks(kit('a', 'cindle', { gear: ridge })).sets.size).toBe(0);
  });

  it('gear the content no longer has counts for nothing', () => {
    const marks = kitMarks(kit('a', 'cindle', { gear: [{ baseId: 'gone', slot: 'hat' }] }));
    expect([...marks.cashes].sort()).toEqual(['grove', 'mire']);
  });

  it('talents are read from the data: a talent that sets marks counts on any role, as the engine merges every slotted talent', () => {
    const talents = combatV2.talents as Record<string, unknown>;
    talents['zz-test-marker'] = {
      id: 'zz-test-marker',
      name: 'Test',
      text: 'x',
      roles: ['guard'],
      fx: { marksAs: 'own' },
    };
    try {
      expect([...kitMarks(kit('a', 'sproutle', { talents: ['zz-test-marker'] })).sets]).toEqual([
        'grove',
      ]);
      expect([...kitMarks(kit('a', 'ashmole', { talents: ['zz-test-marker'] })).sets]).toEqual([
        'ember',
      ]);
    } finally {
      delete talents['zz-test-marker'];
    }
  });

  it('an unknown Knack or talent adds nothing', () => {
    const marks = kitMarks(kit('a', 'sproutle', { knack: 'nope', talents: ['nope'] }));
    expect(marks.sets.size + marks.cashes.size).toBe(0);
  });
});

describe('without the combat v2 data (a build that does not carry it)', () => {
  it('lights Setters and Payoffs by role and element; Knacks and talents add nothing', () => {
    const setter = kit('s', 'splashet');
    const spark = kit('p', 'tempestray');
    expect(partnersOfWith(setter, [spark], null).get('p')).toEqual({
      as: 'cashes',
      marks: ['tide'],
    });
    const trail = kit('c', 'cindle', { knack: 'leave-a-trail' });
    expect(kitMarksWith(trail, null).sets.size).toBe(0);
    expect(kitMarksWith(trail, combatV2).sets.size).toBe(1);
  });
});

describe('partnersOf', () => {
  const setter = kit('setter', 'splashet'); // sets Tide
  const spark1 = kit('spark1', 'tempestray'); // cashes Tide
  const spark2 = kit('spark2', 'stormray'); // cashes Tide
  const ember = kit('ember', 'cindle'); // cashes Grove and Mire
  const grove = kit('grove', 'mossback'); // sets Grove
  const guard = kit('guard', 'sproutle');

  it('a setter touched lights every Payoff that can cash its mark', () => {
    const found = partnersOf(setter, [setter, spark1, spark2, ember, guard]);
    expect(names(found)).toEqual(['spark1', 'spark2']);
    expect(found.get('spark1')).toEqual({ as: 'cashes', marks: ['tide'] });
  });

  it('a payoff touched lights every setter of a mark it reacts to', () => {
    const found = partnersOf(ember, [setter, spark1, grove, guard]);
    expect(names(found)).toEqual(['grove']);
    expect(found.get('grove')).toEqual({ as: 'sets', marks: ['grove'] });
  });

  it('a creature that does both shows both directions, with the marks of each', () => {
    // Cindle with Leave a Trail sets Ember and cashes Grove and Mire; Coralynx (Tide) cashes Ember.
    const both = kit('both', 'cindle', { knack: 'leave-a-trail' });
    const tide = kit('tide', 'coralynx');
    const found = partnersOf(both, [grove, tide, spark1]);
    expect(names(found)).toEqual(['grove', 'tide']);
    expect(found.get('grove')?.as).toBe('sets');
    expect(found.get('tide')).toEqual({ as: 'cashes', marks: ['ember'] });
    // A creature on both sides of the pair is `both`: a Mire Payoff that trails, beside an Ember one that trails.
    const mire: PartnerKit = {
      id: 'mire',
      role: 'payoff',
      element: 'mire',
      knack: 'leave-a-trail',
    };
    expect(partnersOf(both, [mire]).get('mire')).toEqual({ as: 'both', marks: ['ember', 'mire'] });
  });

  it('never lights the touched creature itself, even when it is listed (or stands twice)', () => {
    expect(partnersOf(setter, [setter, { ...setter }, spark1]).has('setter')).toBe(false);
    const both = kit('both', 'cindle', { knack: 'leave-a-trail' });
    expect(partnersOf(both, [both]).size).toBe(0);
  });

  it('a creature with no marks highlights nothing', () => {
    expect(partnersOf(guard, [setter, spark1, ember, grove]).size).toBe(0);
  });

  it('is decided by the kit alone: a partner is a partner wherever it stands, and a Payoff is not a partner of a Payoff', () => {
    expect(partnersOf(spark1, [spark2, ember]).size).toBe(0);
    expect(partnersOf(setter, [kit('other-setter', 'tidewing')]).size).toBe(0);
  });

  it('a creature whose role is not a Payoff cashes nothing, whatever its element', () => {
    const support: PartnerKit = { id: 's', role: 'support', element: 'spark' };
    expect(partnersOf(setter, [support]).size).toBe(0);
  });
});

describe('the data is all classified', () => {
  const read: ReadonlySet<string> = new Set([...MARK_FIELDS, ...MARK_FIELDS_UNRELATED]);
  it('every Knack and talent effect that names a mark, a trail or a prime is one the helper reads or knows is unrelated', () => {
    const unknown: string[] = [];
    for (const def of [...Object.values(combatV2.knacks), ...Object.values(combatV2.talents)]) {
      for (const [key, value] of Object.entries(def.fx)) {
        if (/mark|trail|prime|nodamage/i.test(key) && !read.has(key))
          unknown.push(`${def.id}.${key}`);
        if (
          key === 'support' &&
          typeof value === 'string' &&
          /mark/i.test(value) &&
          value !== 'readyMark'
        )
          unknown.push(`${def.id}.${key}=${value}`);
      }
    }
    expect(unknown).toEqual([]);
  });
});

describe('reactionPaint', () => {
  const setter = kit('setter', 'splashet');
  const spark = kit('spark', 'tempestray');
  const guard = kit('guard', 'sproutle');
  const partners = partnersOf(setter, [spark, guard]);

  it('the partner and the touched creature carry the marks; the others dim', () => {
    const paint = reactionPaint('setter', partners);
    expect(paint('spark')).toEqual({ partner: { who: 'partner', marks: ['tide'], as: 'cashes' } });
    expect(paint('setter')).toEqual({ partner: { who: 'touched', marks: ['tide'] } });
    expect(paint('guard')).toEqual({ dim: true });
  });

  it('paints nothing when nothing is touched or the touched creature has no partners', () => {
    expect(reactionPaint(null, partners)('guard')).toBeUndefined();
    expect(reactionPaint('guard', partnersOf(guard, [setter, spark]))('setter')).toBeUndefined();
  });

  it('says what it is in words for a screen reader', () => {
    const words = (id: string) => (id === 'tide' ? 'Tide' : id);
    expect(partnerWords({ who: 'partner', marks: ['tide'], as: 'cashes' }, words)).toBe(
      'Reaction partner: cashes the Tide mark.',
    );
    expect(partnerWords({ who: 'touched', marks: ['tide'] }, words)).toBe(
      'Reaction partners are lit, for Tide.',
    );
  });
});

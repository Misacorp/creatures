/**
 * The reaction-partner helper against the real combat v2 engine: small seeded fights over a handful of Knack, talent and gear combinations,
 * and what the engine's log says is compared with `kitMarks`. A creature "sets" when a mark of the element the helper names appears in a
 * fight where it is the only one that could have left it, and "cashes" when it is named in a `reaction` event on a mark of each element in
 * turn. The kits are resolved the way the worker does (`createResolver`, `gearFx`), so a change to the engine's mark rules fails here.
 */
import { content, createSeededRng, gearBase, gearFx, type GearItem } from '@creatures/game';
import { combatV2 } from '@creatures/game/combat-v2';
import {
  createResolver,
  fightV2,
  type BossDef,
  type FighterSpec,
  type FightInputV2,
  type KnackFx,
  type Shipped,
} from '@creatures/engine/v2';
import { describe, expect, it } from 'vitest';
import { kitMarks, type PartnerKit } from './reaction-partners';

const SHIPPED: Shipped = { creatures: content.creatures, bosses: content.bosses, foes: [] };
const resolver = createResolver(combatV2, SHIPPED);
const ELEMENTS = content.elements.map((e) => e.id);

/** A boss that cannot dodge, shed marks or kill the team, and plain-attacks the front creature. */
const BOSS: BossDef = {
  id: 'agreement-golem',
  name: 'Agreement Golem',
  element: 'mire',
  hp: 900_000,
  atk: 30,
  armour: 0,
  spd: 0,
  rounds: 8,
  rows: 1,
  cols: 3,
  plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 10_000 },
  moves: [],
  cards: [],
  mods: {},
};

interface Combo {
  name: string;
  species: string;
  knack?: string;
  talents?: string[];
  /** Worn gear: base ids, joined into effects the way the worker does. */
  gear?: string[];
}

const RIDGE = ['ridge-copper-cap', 'ridge-copper-scarf', 'ridge-copper-bead'];

const COMBOS: Combo[] = [
  { name: 'a plain Setter', species: 'splashet' },
  { name: 'a Setter with Double Mark', species: 'splashet', knack: 'double-mark' },
  { name: 'a Setter with Feed the Marks', species: 'mossback', knack: 'feed-the-marks' },
  { name: 'a plain Payoff', species: 'cindle' },
  { name: 'a Payoff with Leave a Trail', species: 'cindle', knack: 'leave-a-trail' },
  { name: 'a Payoff with the Ridge Copper set', species: 'tempestray', gear: RIDGE },
  { name: 'a Payoff with two Ridge Copper pieces', species: 'tempestray', gear: RIDGE.slice(0, 2) },
  { name: 'a plain Guard', species: 'sproutle' },
  { name: 'a Guard with Primed by Pain', species: 'sproutle', knack: 'primed-by-pain' },
  { name: 'a plain Support', species: 'ashmole' },
  { name: 'a Support with Ready the Mark', species: 'ashmole', knack: 'ready-the-mark' },
  { name: 'a Support with Puddle Maker', species: 'ashmole', knack: 'puddle-maker' },
  { name: 'a Guard with Puddle Maker', species: 'sproutle', knack: 'puddle-maker' },
  { name: 'a Setter with a talent', species: 'splashet', talents: ['crit-damage'] },
];

const specOf = (c: Combo, uid: string, col: number): FighterSpec => {
  const species = content.creatures.find((s) => s.id === c.species);
  if (species === undefined) throw new Error(c.species);
  const items: GearItem[] = (c.gear ?? []).flatMap((id) => {
    const base = gearBase(id);
    return base === undefined
      ? []
      : [
          {
            baseId: id,
            slot: base.slot,
            tag: base.tag,
            rarity: 'common' as const,
            itemLevel: 20,
            lines: [],
          },
        ];
  });
  const gear: KnackFx = gearFx({ role: species.role, element: species.element }, items);
  const resolved = resolver.resolve({
    owner: 'p',
    formId: c.species,
    level: 20,
    ...(c.knack === undefined ? {} : { knack: c.knack }),
    talents: c.talents ?? [],
    gear,
    row: 0,
    col,
  });
  return { ...resolved, uid, key: uid, name: uid };
};

/** A creature that sets and cashes nothing, to stand where a fight needs someone to take the boss's hit. */
const BYSTANDER: Combo = { name: 'a bystander', species: 'drizzlewt' };

const fight = (fighters: FighterSpec[], seed: string) => {
  const input: FightInputV2 = {
    version: 2,
    rules: combatV2.rules,
    elements: ELEMENTS,
    chart: content.elementChart,
    boss: BOSS,
    fighters,
    options: { log: true },
  };
  return fightV2(input, createSeededRng(seed));
};

/** A Setter of `element`, to feed a Payoff a mark of that element (only its element matters). */
const feeder = (element: string, col: number): FighterSpec => {
  const base = specOf({ name: 'feeder', species: 'splashet' }, 'feeder', col);
  return { ...base, element, role: 'setter' };
};

const markElements = (r: ReturnType<typeof fight>, skip?: string): Set<string> =>
  new Set(
    r.events.flatMap((e) =>
      e.board?.type === 'mark' && e.board.element !== skip ? [e.board.element] : [],
    ),
  );

const kitOf = (c: Combo): PartnerKit => {
  const species = content.creatures.find((s) => s.id === c.species);
  if (species === undefined) throw new Error(c.species);
  return {
    id: 'k',
    role: species.role,
    element: species.element,
    knack: c.knack ?? null,
    talents: c.talents ?? [],
    gear: (c.gear ?? []).flatMap((id) => {
      const base = gearBase(id);
      return base === undefined ? [] : [{ baseId: id, slot: base.slot }];
    }),
  };
};

describe('kitMarks agrees with the engine', () => {
  for (const combo of COMBOS) {
    it(`${combo.name}: the marks it sets and cashes are those the fights show`, () => {
      const expected = kitMarks(kitOf(combo), combatV2);

      // Sets: the creature with two bystanders, so a Guard has someone to intercept for and a Support someone to boost. The boss's
      // front-row plain attack lands on the bystander in col 0.
      const alone = fight(
        [
          specOf(BYSTANDER, 'b0', 0),
          specOf(combo, 'k', 1),
          specOf({ ...BYSTANDER, species: 'croakmire' }, 'b2', 2),
        ],
        `sets-${combo.name}`,
      );
      const actualSets = markElements(alone);

      // Cashes: a feeder of each element in turn, and whether the creature is named in a reaction on it. Marks the creature leaves
      // after a reaction (a trail) are of its own element, which the feeder never has.
      const actualCashes = new Set<string>();
      for (const element of ELEMENTS) {
        const r = fight(
          [feeder(element, 0), specOf(combo, 'k', 1), specOf(BYSTANDER, 'b2', 2)],
          `cashes-${combo.name}-${element}`,
        );
        if (
          r.events.some(
            (e) => e.board?.type === 'reaction' && e.board.by === 'k' && e.board.mark === element,
          )
        ) {
          actualCashes.add(element);
        }
        // A trail (after a reaction) is a set the lone fight cannot show: its mark is of the creature's own element.
        const trail = markElements(r, element);
        if (r.reactions > 0) for (const m of trail) actualSets.add(m);
      }

      expect([...actualSets].sort()).toEqual([...expected.sets].sort());
      expect([...actualCashes].sort()).toEqual([...expected.cashes].sort());
    });
  }

  it('is not vacuous: the combos that mark or cash do so in the fights', () => {
    const sets = (name: string) => [
      ...kitMarks(kitOf(COMBOS.find((c) => c.name === name) as Combo), combatV2).sets,
    ];
    expect(sets('a Payoff with Leave a Trail')).toEqual(['ember']);
    expect(sets('a Guard with Primed by Pain')).toEqual(['grove']);
    expect(sets('a Support with Ready the Mark')).toEqual(['ember']);
    expect(sets('a Payoff with the Ridge Copper set')).toEqual(['spark']);
    expect(sets('a plain Guard')).toEqual([]);
    expect([...kitMarks(kitOf(COMBOS[3] as Combo), combatV2).cashes].sort()).toEqual([
      'grove',
      'mire',
    ]);
  });

  it('a talent whose roles leave the creature out still counts: the engine merges every slotted talent, whatever its roles', () => {
    // The helper takes a talent's effects for any role, as the resolver does (`createResolver` never reads `roles`).
    const talents = combatV2.talents as Record<string, unknown>;
    talents['zz-agree'] = {
      id: 'zz-agree',
      name: 'Agree',
      text: 'x',
      roles: ['payoff'],
      fx: { marksAs: 'own' },
    };
    try {
      const combo: Combo = {
        name: 'a Guard with a marking talent',
        species: 'sproutle',
        talents: ['zz-agree'],
      };
      const r = fight(
        [
          specOf(BYSTANDER, 'b0', 0),
          specOf(combo, 'k', 1),
          specOf({ ...BYSTANDER, species: 'croakmire' }, 'b2', 2),
        ],
        'talent-roles',
      );
      expect(markElements(r)).toEqual(new Set(['grove']));
      expect([...kitMarks(kitOf(combo), combatV2).sets]).toEqual(['grove']);
    } finally {
      delete talents['zz-agree'];
    }
  });
});

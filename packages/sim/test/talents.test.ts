import { describe, expect, it } from 'vitest';
import {
  RULES,
  content,
  createSeededRng,
  releaseParts,
  slotsOpen,
  talentDef,
  talentPool,
  type Rng,
} from '@creatures/game';
import {
  activeTalentsOf,
  creaturePower,
  foldedCreature,
  speciesOf,
  withoutTalents,
  type OwnedCreature,
} from '../src/data';
import { fightPower } from '../src/fight-power';
import { slotOfCreature } from '../src/raid';
import { clonePlayer, createPlayer, type SimPlayer } from '../src/state';
import { collect, fillSlots, holdTalent, lineView, newCreature } from '../src/talents';

/** An RNG that gives scripted values first, then a seeded stream (the pool index, then the golden draw). */
function scripted(values: number[], seed = 'sim-talents'): Rng {
  const rest = createSeededRng(seed);
  let i = 0;
  return { nextU32: () => values[i++] ?? rest.nextU32() };
}

const player = (): SimPlayer => {
  const p = createPlayer('p01', 'P', 'daily', 1);
  p.joined = true;
  return p;
};

const species = (id: string) => speciesOf(id);

describe('a new creature', () => {
  it('rolls its first talent into slot 1, from its line pool, with the talent stream', () => {
    const p = player();
    const c = newCreature(p, species('splashet'), scripted([2, 5]));
    expect(c.id).toBe('p01/splashet');
    expect(c.level).toBe(1);
    expect(c.talents?.book).toEqual([{ talentId: 'bigger-splash', golden: false, slot: 1 }]);
    expect(p.stats.golden_talents).toBe(0);
    for (let i = 0; i < 50; i++) {
      const made = newCreature(p, species('cindle'), createSeededRng(`pool-${String(i)}`));
      const first = made.talents?.book[0];
      expect(talentPool('cindle').some((t) => t.id === first?.talentId)).toBe(true);
      expect(first?.slot).toBe(1);
    }
  });

  it('counts a golden one (a draw of 0 on the golden roll)', () => {
    const p = player();
    const c = newCreature(p, species('splashet'), scripted([0, 0]));
    expect(c.talents?.book[0]?.golden).toBe(true);
    expect(p.stats.golden_talents).toBe(1);
  });

  it('is golden about one time in twenty', () => {
    const p = player();
    const rng = createSeededRng('golden-rate');
    const n = 4_000;
    for (let i = 0; i < n; i++) newCreature(p, species('sproutle'), rng);
    expect(p.stats.golden_talents / n).toBeGreaterThan(0.03);
    expect(p.stats.golden_talents / n).toBeLessThan(0.07);
  });
});

describe('the Talent Book of a creature', () => {
  it('keeps the talent a slot gives up in the book, and holds a golden one apart from the plain one', () => {
    const c: OwnedCreature = {
      id: 'p01/splashet',
      line: 'splashet',
      speciesId: 'splashet',
      level: 1,
      fusionCount: 0,
    };
    holdTalent(c, { talentId: 'playful', golden: false }, 1);
    holdTalent(c, { talentId: 'bigger-splash', golden: false }, 1);
    expect(c.talents?.book).toEqual([
      { talentId: 'playful', golden: false, slot: null },
      { talentId: 'bigger-splash', golden: false, slot: 1 },
    ]);
    holdTalent(c, { talentId: 'bigger-splash', golden: true }, 2);
    expect(c.talents?.book).toHaveLength(3);
    // Moving a talent to another slot empties the one it left.
    holdTalent(c, { talentId: 'bigger-splash', golden: false }, 2);
    expect(c.talents?.book.filter((b) => b.slot !== null)).toEqual([
      { talentId: 'bigger-splash', golden: false, slot: 2 },
    ]);
  });

  it('shows a creature to the duplicate choice with its open slots and its whole book', () => {
    const p = player();
    const c = newCreature(p, species('splashet'), scripted([1, 5]));
    const view = lineView(c);
    expect(view.slots).toEqual([{ talentId: 'wet-footprints', golden: false }]);
    expect(view.book).toEqual([{ talentId: 'wet-footprints', golden: false }]);
    expect(view.rarity).toBe('common');
    c.level = 15;
    expect(lineView(c).slots).toHaveLength(slotsOpen('common', 15));
  });
});

describe('a creature that arrives', () => {
  it('is a new creature when the line is not owned (no duplicate counted)', () => {
    const p = player();
    expect(collect(p, species('zipmouse'), scripted([0, 5]), true)).toBe('new');
    expect(p.creatures).toHaveLength(1);
    expect(p.stats.catches).toBe(1);
    expect(p.stats.dupes).toBe(0);
  });

  it('teaches a duplicate talent that is new to the book and better than the slot, else fuses, else releases', () => {
    const p = player();
    p.creatures.push(newCreature(p, species('splashet'), scripted([4, 5]))); // Playful (weak Attack)
    // Wet Footprints (an owner-mark line) is a talent the book lacks.
    expect(collect(p, species('splashet'), scripted([1, 5]), true)).toBe('duplicate');
    const c = p.creatures[0] as OwnedCreature;
    expect(p.stats.dupes).toBe(1);
    expect(p.stats.dupes_taught + p.stats.dupes_fused + p.stats.dupes_released).toBe(1);
    // The same talent again: nothing to teach, so it fuses.
    const before = c.fusionCount;
    for (let i = 0; i < 5; i++) collect(p, species('splashet'), scripted([1, 5]), true);
    expect(c.fusionCount).toBeGreaterThan(before);
    expect(c.fusionCount).toBeLessThanOrEqual(RULES.fusion.maxFusions);
    // Fully fused and nothing to teach: it is released for parts (never Bait).
    c.fusionCount = RULES.fusion.maxFusions;
    const bait = p.bait;
    const scrap = p.gear.parts.scrap;
    collect(p, species('splashet'), scripted([1, 5]), true);
    expect(p.stats.dupes_released).toBeGreaterThan(0);
    expect(p.bait).toBe(bait);
    expect(p.gear.parts.scrap).toBe(scrap + (releaseParts('common', 'tide').scrap ?? 0));
  });

  it('releases for nothing when the simulation tracks no parts, and never touches Bait', () => {
    const p = player();
    p.creatures.push(newCreature(p, species('splashet'), scripted([1, 5])));
    (p.creatures[0] as OwnedCreature).fusionCount = RULES.fusion.maxFusions;
    collect(p, species('splashet'), scripted([1, 5]), false);
    expect(p.gear.parts.scrap).toBe(0);
    expect(p.bait).toBe(0);
    expect(p.stats.dupes_released).toBe(1);
  });

  it('counts every arrival once, and the answers add up to the duplicates', () => {
    const p = player();
    const rng = createSeededRng('arrivals');
    for (let i = 0; i < 60; i++)
      collect(p, species(i % 2 === 0 ? 'splashet' : 'cindle'), rng, true);
    expect(p.stats.catches).toBe(60);
    expect(p.stats.dupes).toBe(58);
    expect(p.stats.dupes_taught + p.stats.dupes_fused + p.stats.dupes_released).toBe(58);
    for (const c of p.creatures) {
      expect(c.fusionCount).toBeLessThanOrEqual(RULES.fusion.maxFusions);
      // A creature holds each talent once per quality, and one talent per slot.
      const slots = (c.talents?.book ?? []).filter((b) => b.slot !== null).map((b) => b.slot);
      expect(new Set(slots).size).toBe(slots.length);
    }
  });
});

describe('filling the open slots from the Talent Book', () => {
  const withBook = (): { p: SimPlayer; c: OwnedCreature } => {
    const p = player();
    const c = newCreature(p, species('tidewing'), scripted([4, 5]));
    c.level = 20;
    holdTalent(c, { talentId: 'bigger-splash', golden: false }, null);
    holdTalent(c, { talentId: 'wet-footprints', golden: true }, null);
    p.creatures.push(c);
    return { p, c };
  };

  it('puts the best talent the book holds into an open empty slot, for the Bait the rules say', () => {
    const { p, c } = withBook();
    p.bait = 100;
    fillSlots(p, p.creatures);
    const slot2 = c.talents?.book.find((b) => b.slot === 2);
    expect(slot2).toBeDefined();
    expect(slot2?.talentId).not.toBe('playful');
    expect(p.bait).toBe(100 - RULES.talents.bookSlotBait);
    expect(p.week.baitSlots).toBe(RULES.talents.bookSlotBait);
    expect(p.stats.talent_slots).toBe(1);
    // Nothing is open and empty any more: a second call changes nothing.
    fillSlots(p, p.creatures);
    expect(p.bait).toBe(100 - RULES.talents.bookSlotBait);
  });

  it('does nothing without the Bait, and leaves a slot that has a talent alone', () => {
    const { p, c } = withBook();
    p.bait = RULES.talents.bookSlotBait - 1;
    fillSlots(p, p.creatures);
    expect(c.talents?.book.some((b) => b.slot === 2)).toBe(false);
    expect(p.bait).toBe(RULES.talents.bookSlotBait - 1);
    const q = player();
    const d = newCreature(q, species('splashet'), scripted([4, 5]));
    holdTalent(d, { talentId: 'bigger-splash', golden: false }, null);
    q.bait = 100;
    fillSlots(q, [d]);
    // A level 1 creature has one slot and it is full.
    expect(q.bait).toBe(100);
  });
});

describe('talents in the numbers a creature fights with', () => {
  it('fold into its stats, its sheet and its power, as the worker folds them', () => {
    const p = player();
    const c = newCreature(p, species('splashet'), scripted([4, 5])); // Playful: Attack
    c.level = 8;
    const plain = withoutTalents(c);
    expect(foldedCreature(c).stats.atk).toBeGreaterThan(foldedCreature(plain).stats.atk);
    expect(creaturePower(c)).toBeGreaterThan(creaturePower(plain));
    const fx = newCreature(player(), species('splashet'), scripted([0, 5])); // Splashes First: the sheet
    fx.level = 8;
    expect(foldedCreature(fx).mods).toBeDefined();
    expect(slotOfCreature(fx, 'p01').mods).toEqual(foldedCreature(fx).mods);
    expect(slotOfCreature(plain, 'p01').mods).toBeUndefined();
  });

  it('count a slot only once the level has opened it, and an epic signature from the start', () => {
    const c: OwnedCreature = {
      id: 'p01/tidewing',
      line: 'splashet',
      speciesId: 'tidewing',
      level: 19,
      fusionCount: 0,
      talents: {
        book: [
          { talentId: 'playful', golden: false, slot: 1 },
          { talentId: 'bigger-splash', golden: false, slot: 2 },
        ],
      },
    };
    expect(activeTalentsOf(c)).toHaveLength(1);
    expect(activeTalentsOf({ ...c, level: 20 })).toHaveLength(2);
    const epic: OwnedCreature = {
      id: 'p01/solmane',
      line: 'solmane',
      speciesId: 'solmane',
      level: 1,
      fusionCount: 0,
    };
    expect(activeTalentsOf(epic).map((t) => t.id)).toEqual(['lights-up-a-room']);
    expect(activeTalentsOf(withoutTalents(epic))).toEqual([]);
  });

  it('moves the fight-scored power of a team, so a talent share can be measured', () => {
    const p = player();
    const team: OwnedCreature[] = ['splashet', 'cindle', 'sproutle'].map((s) => {
      const c = newCreature(p, species(s), scripted([3, 5]));
      c.level = 12;
      return c;
    });
    const full = fightPower(team, 1);
    const bare = fightPower(team.map(withoutTalents), 1);
    expect(full.power).not.toBe(bare.power);
    // Deterministic.
    expect(fightPower(team, 1)).toEqual(full);
  });
});

describe('copying a player keeps the Talent Books apart', () => {
  it('does not share a book between the copy and the original', () => {
    const p = player();
    p.creatures.push(newCreature(p, species('splashet'), scripted([1, 5])));
    const copy = clonePlayer(p);
    const c = copy.creatures[0] as OwnedCreature;
    holdTalent(c, { talentId: 'playful', golden: false }, 1);
    expect(p.creatures[0]?.talents?.book).toEqual([
      { talentId: 'wet-footprints', golden: false, slot: 1 },
    ]);
  });
});

describe('the talent content the sim relies on', () => {
  it('has a pool for every line a sim player can own', () => {
    for (const s of content.creatures) {
      expect(talentPool(s.line).length, s.line).toBeGreaterThanOrEqual(7);
      for (const t of talentPool(s.line)) expect(talentDef(t.id)).toBeDefined();
    }
  });
});

/**
 * Sample creatures for the creature card's workbench page and its tests: real server output (the
 * `creatures-state` and `collection-state` fixtures, parsed the way the app parses them), changed one
 * field at a time to reach a state ("the Bronze Ribbon is ready", "evolution is ready"). Fixture data
 * only; nothing here is used by the game itself.
 */
import { content, talentDef, talentText } from '@creatures/game';
import { parseGameState, type Creature, type GameState } from './api';
import collectionFixture from './fixtures/collection-state.json';
import creaturesFixture from './fixtures/creatures-state.json';
import gearFixture from './fixtures/gear-state.json';
import { parseGearState } from './gear-parse';
import type { GearState } from './gear-types';
import type { TalentView } from './talent-types';

/** Level 8 creatures with a talent each, four waiting duplicates (all of Splashet), 100 Bait. */
export const SAMPLE_STATE: GameState = parseGameState(creaturesFixture);

/** Three creatures with gear, one of them (Cindle) ready to evolve. */
export const GEAR_STATE: GameState = parseGameState(collectionFixture);

export const SAMPLE_GEAR: GearState = parseGearState(gearFixture);

/** The states the card is shown in. */
export const SAMPLE_KINDS = [
  'growing',
  'ribbon ready',
  'ribbon short',
  'evolve ready',
  'evolve choice',
  'talent to fill',
  'talent book',
  'top level',
  'nickname and badges',
] as const;

export type SampleKind = (typeof SAMPLE_KINDS)[number];

export function talentView(id: string, golden: boolean): TalentView {
  const def = talentDef(id);
  if (def === undefined) throw new Error(`the sample needs the talent ${id}`);
  const text = talentText(def, golden);
  return { id, name: def.name, golden, text: text.text, about: text.about, idle: false };
}

function base(): Creature {
  const plain = SAMPLE_STATE.creatures[0];
  const geared = GEAR_STATE.creatures[0];
  if (plain === undefined || geared === undefined) throw new Error('the fixtures have no creature');
  return {
    ...plain,
    gear: geared.gear,
    statsWithGear: geared.statsWithGear,
    busy: null,
    away: false,
    ribbon: null,
    ribbons: 0,
    waiting: false,
    nickname: null,
    shiny: false,
    explorer: { rank: 3, xp: 120, nextRankXp: 400, trips: 7 },
  };
}

const bronze = {
  id: 'bronze',
  level: 10,
  parts: { scrap: 6, 'ember-shard': 2 },
  trips: 0,
  tripsDone: 0,
} as const;

/** The finale ability is unlocked from its level on (the server sends this flag). */
function withAbility(creature: Creature): Creature {
  const { ability } = creature;
  return ability === null
    ? creature
    : { ...creature, ability: { ...ability, unlocked: creature.level >= ability.unlockLevel } };
}

/** One creature in the state asked for. */
export function sampleCreature(kind: SampleKind): Creature {
  return withAbility(sampleOf(kind));
}

function sampleOf(kind: SampleKind): Creature {
  const creature = base();
  switch (kind) {
    case 'growing':
      return {
        ...creature,
        level: 6,
        exp: 140,
        expNeeded: 222,
        nextUnlock: { level: 7, name: 'Scarf' },
        gear: creature.gear.filter((g) => g.slot === 'hat'),
      };
    case 'ribbon ready':
      return {
        ...creature,
        level: 10,
        exp: 450,
        expNeeded: 450,
        waiting: true,
        nextUnlock: { level: 13, name: 'Charm' },
        gear: creature.gear.filter((g) => g.slot !== 'charm'),
        ribbon: { ...bronze, ready: true },
        talents: {
          ...creature.talents,
          slots: creature.talents.slots.map((s) =>
            s.slot === 1 ? { ...s, talent: talentView('quick-to-pounce', true) } : s,
          ),
        },
      };
    case 'ribbon short':
      return {
        ...creature,
        level: 10,
        exp: 450,
        expNeeded: 450,
        waiting: true,
        nextUnlock: { level: 13, name: 'Charm' },
        ribbon: { ...bronze, ready: false },
      };
    case 'evolve ready':
      return {
        ...creature,
        level: 15,
        exp: 825,
        expNeeded: 825,
        waiting: true,
        nextUnlock: { level: 20, name: 'Talent slot 2' },
        // Every evolving line has two forms: the button asks which (Cindle: Pyrelynx or Wickat).
        evolution: {
          toSpecies: 'pyrelynx',
          level: 15,
          essence: 20,
          available: true,
          alt: { toSpecies: 'wickat' },
        },
      };
    case 'evolve choice':
      // A Sproutle: its line grows two ways (Thornbuck or Sunfawn), so the button asks which.
      return {
        ...creature,
        species: 'sproutle',
        line: 'sproutle',
        level: 15,
        exp: 825,
        expNeeded: 825,
        waiting: true,
        nextUnlock: { level: 20, name: 'Talent slot 2' },
        ability: { id: 'bark-guard', unlocked: true, unlockLevel: 10, nextId: 'bark-guard-2' },
        evolution: {
          toSpecies: 'thornbuck',
          level: 15,
          essence: 20,
          available: true,
          alt: { toSpecies: 'sunfawn' },
        },
      };
    case 'talent to fill': {
      const filled = creature.talents.slots[0]?.talent ?? null;
      return {
        ...creature,
        level: 20,
        exp: 100,
        expNeeded: 1_000,
        nextUnlock: { level: 25, name: 'Talent slot 3' },
        talents: {
          signature: null,
          slots: [
            { slot: 1, opensAt: 1, open: true, talent: filled },
            { slot: 2, opensAt: 20, open: true, talent: null },
            { slot: 3, opensAt: 25, open: false, talent: null },
          ],
          book: [
            ...(filled === null ? [] : [{ ...filled, slot: 1 }]),
            { ...talentView('playful', false), slot: null },
          ],
        },
      };
    }
    case 'talent book': {
      // One talent in use, a golden one and a plain one waiting in the book; one open slot.
      const inUse = talentView('quick-to-pounce', false);
      return {
        ...creature,
        talents: {
          ...creature.talents,
          slots: creature.talents.slots.map((s) => (s.slot === 1 ? { ...s, talent: inUse } : s)),
          book: [
            { ...talentView('playful', false), slot: null },
            { ...talentView('bigger-splash', true), slot: null },
            { ...inUse, slot: 1 },
          ],
        },
      };
    }
    case 'top level':
      return { ...creature, level: 30, exp: 0, expNeeded: null, nextUnlock: null, ribbons: 3 };
    case 'nickname and badges':
      return {
        ...creature,
        level: 12,
        exp: 90,
        expNeeded: 400,
        nextUnlock: { level: 13, name: 'Charm' },
        nickname: 'Ember',
        shiny: true,
        away: true,
      };
  }
}

/**
 * A roster of `count` creatures of different species, levels and nicknames (some without). The first
 * waits for a ready Bronze Ribbon and the third can evolve, so "Needs you" has something to find.
 */
export function sampleRoster(count: number): Creature[] {
  const species = content.creatures.filter((c) => !c.festival).slice(0, count);
  const template = base();
  return species.map((s, index) => {
    const creature: Creature = {
      ...template,
      id: `sample-${String(index)}`,
      species: s.id,
      line: s.line,
      level: 3 + index,
      exp: 20 * index,
      expNeeded: 200 + 30 * index,
      nickname: index % 4 === 1 ? `Buddy ${String(index)}` : null,
      gear: index % 3 === 0 ? template.gear : [],
      nextUnlock: { level: 7, name: 'Scarf' },
      talents: {
        ...template.talents,
        slots: template.talents.slots.map((slot) => ({ ...slot, talent: null })),
        book: [],
      },
    };
    if (index === 0) {
      return {
        ...creature,
        level: 10,
        exp: 450,
        expNeeded: 450,
        waiting: true,
        ribbon: { ...bronze, ready: true },
      };
    }
    if (index === 2) {
      return {
        ...creature,
        level: 15,
        exp: 825,
        expNeeded: 825,
        waiting: true,
        evolution: {
          toSpecies: 'pyrelynx',
          level: 15,
          essence: 20,
          available: true,
          alt: { toSpecies: 'wickat' },
        },
      };
    }
    return creature;
  });
}

/** A copy of a creature whose line does not evolve. */
function withoutEvolution(creature: Creature): Creature {
  const copy = { ...creature };
  delete copy.evolution;
  return copy;
}

/** A talent slot of a sample: open with this talent (or empty), or closed until `opensAt`. */
function slotOf(slot: number, opensAt: number, open: boolean, talentId: string | null) {
  return {
    slot,
    opensAt,
    open,
    talent: talentId === null ? null : talentView(talentId, false),
  };
}

/**
 * The cards of Misa's phone screenshot (2026-10-19), the card's hard cases: a new Mistnewt (one talent, a slot at 20), a Festival Lanternfin that is lounging
 * (signature talent and one more, slots at 20 and 25), a 20-letter nickname at level 8 (the charm slot
 * still says "Lv 13"), a level 27 Hearthshell with every gear and talent slot filled (one golden), and
 * a Cindle ready to evolve (the gold button).
 */
export function hardCaseRoster(): Creature[] {
  const template = base();
  const gear = template.gear;
  const mistnewt: Creature = {
    ...template,
    id: 'v-mistnewt',
    species: 'mistnewt',
    line: 'mistnewt',
    level: 1,
    exp: 0,
    expNeeded: 27,
    gear: [],
    nextUnlock: { level: 7, name: 'Scarf' },
    talents: {
      signature: null,
      slots: [slotOf(1, 1, true, 'slow-and-unbothered'), slotOf(2, 20, false, null)],
      book: [{ ...talentView('slow-and-unbothered', false), slot: 1 }],
    },
    evolution: {
      toSpecies: 'fogwyrm',
      level: 15,
      essence: 20,
      available: false,
      alt: { toSpecies: 'drizzlewt' },
    },
  };
  const lanternfin: Creature = {
    ...withoutEvolution(mistnewt),
    id: 'v-lanternfin',
    species: 'lanternfin',
    line: 'lanternfin',
    levelCap: 30,
    talents: {
      signature: talentView('guiding-light', false),
      slots: [
        slotOf(1, 1, true, 'festive'),
        slotOf(2, 20, false, null),
        slotOf(3, 25, false, null),
      ],
      book: [{ ...talentView('festive', false), slot: 1 }],
    },
  };
  const longName: Creature = {
    ...mistnewt,
    id: 'v-long',
    nickname: 'Captain Puddlestomps',
    level: 8,
    exp: 96,
    expNeeded: 328,
    gear: gear.filter((g) => g.slot !== 'charm'),
    nextUnlock: { level: 10, name: 'Bronze Ribbon' },
  };
  const full: Creature = {
    ...withoutEvolution(mistnewt),
    id: 'v-full',
    species: 'hearthshell',
    line: 'hearthshell',
    levelCap: 30,
    level: 27,
    exp: 1_250,
    expNeeded: 2_400,
    gear,
    nextUnlock: null,
    ribbons: 2,
    talents: {
      signature: talentView('fire-that-lasts', false),
      slots: [
        { slot: 1, opensAt: 1, open: true, talent: talentView('calm-and-warm', true) },
        slotOf(2, 20, true, 'banked-embers'),
        slotOf(3, 25, true, 'hosts-friends'),
      ],
      book: [],
    },
  };
  const evolve: Creature = { ...sampleCreature('evolve ready'), id: 'v-evolve' };
  return [mistnewt, lanternfin, longName, full, evolve];
}

/**
 * The lounge sample of the workbench: the five hard cases with Lanternfin lounging (34 of the day's 60 XP),
 * Mistnewt Rested (it had its 60 today) and the evolving one away on a trip.
 */
export function loungeSample(): Pick<GameState, 'creatures' | 'loungerId' | 'loungeXp'> {
  const creatures = hardCaseRoster().map((c) =>
    c.id === 'v-evolve'
      ? { ...c, away: true, busy: { kind: 'expedition' as const, id: 'trip' } }
      : c,
  );
  return {
    creatures,
    loungerId: 'v-lanternfin',
    loungeXp: { 'v-lanternfin': 34, 'v-mistnewt': 60 },
  };
}

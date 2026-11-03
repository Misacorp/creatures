/**
 * Combat v2 on a sample creature (workbench and tests only): what the server adds to a creature while its `COMBAT_V2`
 * flag is on, built from the real content (`@creatures/game/combat-v2`: the Knacks of its form, the pool of its line)
 * and the engine's `formStats`, in the shapes of `apps/worker/src/creature-v2.ts`. Fixture data only; nothing here is
 * shipped in the game's bundle.
 */
import { formStats } from '@creatures/engine/v2';
import { content, slotCount, slotOpensAt, slotsOpen } from '@creatures/game';
import { combatV2, knownKnacks, v2TalentWorksFor } from '@creatures/game/combat-v2';
import type { Creature } from '../api';
import { getSpecies } from '../game';
import type {
  BookTalentV2,
  CreatureTalentsV2,
  KnackView,
  StatsV2,
  TalentSlotV2,
  TalentV2,
} from '../combat-v2-view';

/** What a v2 scene shows of a creature. */
export interface V2Shape {
  /** Which known Knack is saved: its index in the creature's list, or none. */
  knack: number | null;
  /** The talents of the line's book (indexes of the pool) the creature has learned; the first is in slot 1, the second in slot 2. */
  learned: readonly number[];
  /** Which pool indexes are golden. */
  golden?: readonly number[];
}

const BASE_CRIT_CHANCE_BP = combatV2.rules.critChanceBp;
const BASE_CRIT_MULT_BP = combatV2.rules.critBp;

function knackOf(id: string): KnackView {
  const def = combatV2.knacks[id];
  if (def === undefined) throw new Error(`the sample needs the Knack ${id}`);
  return { id: def.id, name: def.name, family: def.family, text: def.text };
}

/** The numbers the page shows for a form at a level, with the given talents' crit and Attack lines folded in. */
export function sampleStatsV2(species: string, level: number, talents: readonly string[]): StatsV2 {
  const form = formStats(combatV2, content, species, level);
  const fx = talents.map((id) => combatV2.talents[id]?.fx ?? {});
  const sum = (key: 'atkBp' | 'hpBp' | 'critChanceBp' | 'critDamageBp' | 'armourBonus'): number =>
    fx.reduce((total, f) => total + (f[key] ?? 0), 0);
  return {
    hp: Math.floor((form.hp * (10_000 + sum('hpBp'))) / 10_000),
    atk: Math.floor((form.atk * (10_000 + sum('atkBp'))) / 10_000),
    spd: form.spd,
    armour: form.armour + sum('armourBonus'),
    critChanceBp: BASE_CRIT_CHANCE_BP + form.critChanceBp + sum('critChanceBp'),
    critMultBp: BASE_CRIT_MULT_BP + form.critDamageBp + sum('critDamageBp'),
  };
}

/** The creature with the fields the server adds under combat v2 (flat on the creature, as in `/api/state`). */
export function withV2(creature: Creature, shape: V2Shape): Creature {
  const species = getSpecies(creature.species);
  if (species === undefined) throw new Error('the sample needs a known species');
  const knacks = knownKnacks(creature.species).map(knackOf);
  const pool = combatV2.pools[species.line] ?? [];
  const open = slotsOpen(species.rarity, creature.level);
  const golden = new Set(shape.golden ?? []);
  const talentAt = (index: number): TalentV2 => {
    const id = pool[index];
    const def = id === undefined ? undefined : combatV2.talents[id];
    if (def === undefined) throw new Error(`the sample needs pool talent ${String(index)}`);
    return {
      id: def.id,
      name: def.name,
      text: def.text,
      golden: golden.has(index),
      idle: !v2TalentWorksFor(def.id, species.role),
    };
  };
  const slotOf = (index: number): number | null => {
    const at = shape.learned.indexOf(index);
    return at === -1 || at + 1 > open ? null : at + 1;
  };
  const book: BookTalentV2[] = pool.map((_, index) => ({
    ...talentAt(index),
    learned: shape.learned.includes(index),
    slot: slotOf(index),
  }));
  const slots: TalentSlotV2[] = [];
  for (let slot = 1; slot <= slotCount(species.rarity); slot++) {
    const holding = book.find((b) => b.slot === slot);
    slots.push({
      slot,
      opensAt: slotOpensAt(species.rarity, slot) ?? 0,
      open: slot <= open,
      talent: holding === undefined ? null : talentAt(book.indexOf(holding)),
    });
  }
  const talentsV2: CreatureTalentsV2 = { slots, book, learnBait: 10 };
  const saved = shape.knack === null ? undefined : knacks[shape.knack];
  return {
    ...creature,
    knack: saved?.id ?? null,
    knownKnacks: knacks,
    talentsV2,
    statsV2: sampleStatsV2(
      creature.species,
      creature.level,
      slots.flatMap((s) => (s.talent === null ? [] : [s.talent.id])),
    ),
  };
}

/** The sample after the creature saved a Knack (the workbench's live pages; `null`: none). */
export function sampleSaveKnack(creature: Creature, knack: string | null): Creature {
  return { ...creature, knack };
}

/** The sample after the creature learned a book talent: learned, in no slot. */
export function sampleLearn(creature: Creature, talentId: string): Creature {
  const v2 = creature.talentsV2;
  if (v2 === undefined) return creature;
  return {
    ...creature,
    talentsV2: {
      ...v2,
      book: v2.book.map((b) => (b.id === talentId ? { ...b, learned: true } : b)),
    },
  };
}

/** The sample after a learned talent went into a slot (or, with `null`, out of its slot); whatever sat there stays learned. */
export function sampleSlot(creature: Creature, talentId: string, slot: number | null): Creature {
  const v2 = creature.talentsV2;
  if (v2 === undefined) return creature;
  const book = v2.book.map((b) => ({
    ...b,
    slot: b.id === talentId ? slot : b.slot === slot ? null : b.slot,
  }));
  const slots = v2.slots.map((s) => {
    const holding = book.find((b) => b.slot === s.slot);
    const talent: TalentV2 | null =
      holding === undefined || !s.open
        ? null
        : {
            id: holding.id,
            name: holding.name,
            text: holding.text,
            golden: holding.golden,
            idle: holding.idle,
          };
    return { ...s, talent };
  });
  return {
    ...creature,
    talentsV2: { ...v2, book, slots },
    statsV2: sampleStatsV2(
      creature.species,
      creature.level,
      slots.flatMap((s) => (s.talent === null ? [] : [s.talent.id])),
    ),
  };
}

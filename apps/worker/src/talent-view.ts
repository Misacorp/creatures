/**
 * How talents are shown to the client: a talent's name, its effect in one phrase, a plain sentence, and
 * whether it does anything for the creature that holds it. Everything is worked out on the server from
 * the content (the client never computes a talent's value), and every string is plain text.
 */
import {
  foldTalent,
  slotOpensAt,
  slotsOpen,
  talentDef,
  talentSignature,
  talentText,
  wornEffects,
  type HeldTalent,
  type TalentRoll,
  type Wearer,
} from '@creatures/game';
import { speciesOf } from './species';

export interface TalentView {
  id: string;
  name: string;
  golden: boolean;
  /** "First pounce +14%". */
  text: string;
  /** One plain sentence about what the effect does. */
  about: string;
  /** True when it does nothing for this creature (a Guard's cover on a Setter). */
  idle: boolean;
}

/** A talent as the client reads it, or null for an id that is no longer in the content. */
export function talentViewOf(roll: TalentRoll, wearer: Wearer | null): TalentView | null {
  const def = talentDef(roll.talentId);
  if (def === undefined) return null;
  const text = talentText(def, roll.golden);
  const idle =
    wearer !== null &&
    wornEffects(wearer, [], [foldTalent(def, roll.golden)]).idleTalents.length > 0;
  return {
    id: def.id,
    name: def.name,
    golden: roll.golden,
    text: text.text,
    about: text.about,
    idle,
  };
}

/** One slot of a creature: open at its level or not, and what is in it. */
export interface TalentSlotView {
  slot: number;
  /** The creature level the slot opens at. */
  opensAt: number;
  open: boolean;
  talent: TalentView | null;
}

/** A creature's talents: its slots, its signature talent (epic species) and its whole Talent Book. */
export interface CreatureTalentsView {
  slots: TalentSlotView[];
  signature: TalentView | null;
  /** Every talent the creature has held, with the slot it sits in now (null: only in the book). */
  book: (TalentView & { slot: number | null })[];
}

export function creatureTalentsView(
  creature: { species: string; level: number },
  held: readonly HeldTalent[],
): CreatureTalentsView {
  const species = speciesOf(creature.species);
  const wearer: Wearer = { role: species.role, element: species.element };
  const open = slotsOpen(species.rarity, creature.level);
  const slots: TalentSlotView[] = [];
  for (let slot = 1; ; slot++) {
    const opensAt = slotOpensAt(species.rarity, slot);
    if (opensAt === null) break;
    const holding = slot <= open ? held.find((h) => h.slot === slot) : undefined;
    slots.push({
      slot,
      opensAt,
      open: slot <= open,
      talent: holding === undefined ? null : talentViewOf(holding, wearer),
    });
  }
  const signatureDef = talentSignature(species.line);
  const book: CreatureTalentsView['book'] = [];
  for (const h of held) {
    const view = talentViewOf(h, wearer);
    if (view !== null) book.push({ ...view, slot: h.slot });
  }
  return {
    slots,
    signature:
      signatureDef === undefined
        ? null
        : talentViewOf({ talentId: signatureDef.id, golden: false }, wearer),
    book,
  };
}

/**
 * What the talent screens say, as plain functions: the choices of a waiting duplicate, what a Talent Book
 * can do, and the words for what happened. The server decides everything (what is offered, what Recommended
 * is, what a slotting costs); these only arrange its answer for the screen. All of it is text.
 */
import { talentDef } from '@creatures/game';
import type { Creature, GameState } from './api';
import { creatureName, speciesName } from './game';
import { partsText } from './gear-view';
import type { ChoiceResult, PendingCatch, TalentSlotView, TalentView } from './talent-types';

/** A creature of the state by id. */
function creatureOf(creatures: readonly Creature[], id: string): Creature | undefined {
  return creatures.find((c) => c.id === id);
}

/** What a settled choice did, in a sentence ("Taught Wet Footprints to Cindle."). */
export function choiceResultText(
  result: ChoiceResult,
  creatures: readonly Creature[],
  talentName: (id: string) => string = (id) => talentDef(id)?.name ?? id,
): string {
  const target =
    result.creatureId === undefined ? undefined : creatureOf(creatures, result.creatureId);
  const who = target === undefined ? 'your creature' : creatureName(target);
  const talent = talentName(result.talent.talentId);
  const lead = result.auto ? 'Recommended: ' : '';
  switch (result.choice) {
    case 'teach':
      // Teach fills the Talent Book; results from before that rule also name the slot it took.
      return result.slot === undefined
        ? `${lead}Taught ${talent}${result.talent.golden ? ' (golden)' : ''} to ${who}: it is in the Talent Book.`
        : `${lead}Taught ${talent}${result.talent.golden ? ' (golden)' : ''} to ${who}, slot ${String(result.slot)}.`;
    case 'fuse':
      return `${lead}Fused ${speciesName(result.species)} into ${who}${result.fusionCount === undefined ? '' : `: fusion ${String(result.fusionCount)} / 5`}.`;
    case 'release':
      return `${lead}Released ${speciesName(result.species)} for ${partsText(result.parts ?? {})}.`;
    case 'keep':
      return `${lead}Kept ${speciesName(result.species)} as a second creature.`;
  }
}

/** One slot of a creature in words: "Slot 1", "Slot 2 opens at level 20". */
export function slotTitle(slot: TalentSlotView): string {
  return slot.open
    ? `Slot ${String(slot.slot)}`
    : `Slot ${String(slot.slot)} opens at level ${String(slot.opensAt)}`;
}

/** A way to put a talent from the Talent Book into a slot. */
export interface BookAction {
  /** The book entry's index in `creature.talents.book`. */
  entry: number;
  slot: number;
}

/** For each book entry that is not in a slot, or not in this one: which open slots it could go to. */
export function bookActions(creature: Creature): BookAction[] {
  const open = creature.talents.slots.filter((s) => s.open);
  const actions: BookAction[] = [];
  creature.talents.book.forEach((entry, index) => {
    for (const slot of open) {
      if (entry.slot !== slot.slot) actions.push({ entry: index, slot: slot.slot });
    }
  });
  return actions;
}

/**
 * Where a Talent Book entry stands: `in-use` (it sits in a slot), `available` (not slotted and an open
 * slot could take it) or `blocked` (not slotted and no open slot to give it).
 */
export type BookRowState = 'in-use' | 'available' | 'blocked';

export interface BookRow {
  /** The entry's index in `creature.talents.book`. */
  index: number;
  entry: Creature['talents']['book'][number];
  state: BookRowState;
  /** The slot it sits in now (in use), else null. */
  slot: number | null;
  /** The open slots it could be put into (never the one it is in). */
  moves: number[];
}

/** The Talent Book as rows: the talents in use first (by slot), then those available, then the rest. */
export function bookRows(creature: Creature): BookRow[] {
  const rows = creature.talents.book.map<BookRow>((entry, index) => {
    const moves = bookActions(creature)
      .filter((a) => a.entry === index)
      .map((a) => a.slot);
    const state: BookRowState =
      entry.slot !== null ? 'in-use' : moves.length > 0 ? 'available' : 'blocked';
    return { index, entry, state, slot: entry.slot, moves };
  });
  const order: Record<BookRowState, number> = { 'in-use': 0, available: 1, blocked: 2 };
  return rows.sort(
    (a, b) => order[a.state] - order[b.state] || (a.slot ?? 0) - (b.slot ?? 0) || a.index - b.index,
  );
}

/** "Quick to Pounce, First pounce +14%": the talent in a row of text (golden is a tag, never only colour). */
export function talentLine(talent: TalentView): string {
  return `${talent.name}: ${talent.text}${talent.golden ? ' (golden)' : ''}`;
}

/** A talent's phrase cut around its number: "First pounce +14%" is "First pounce ", "+14%" and "". */
export interface TalentTextParts {
  before: string;
  /** The signed number with its unit ("+14%", "-4 pt", "+2"); null for a talent without a number. */
  value: string | null;
  after: string;
}

/**
 * Finds the number in a talent's phrase, so a golden talent can draw just that number in gold: the value
 * golden raises. Handles "Name +14%", "Name −4 pt" and the local form "+60% Attack (this item)". The
 * server's words are only cut, never changed, and the three parts joined are always the original text.
 */
export function talentTextParts(text: string): TalentTextParts {
  const match = /[+\u2212-]\d+(?:\.\d+)?(?:%| pt)?/.exec(text);
  if (match === null) return { before: text, value: null, after: '' };
  const at = match.index;
  return {
    before: text.slice(0, at),
    value: match[0],
    after: text.slice(at + match[0].length),
  };
}

/** The waiting cards of a state, or the ones among `ids` (the catches of one claim), oldest first. */
export function cardsFor(
  state: Pick<GameState, 'pending'>,
  ids?: readonly string[],
): PendingCatch[] {
  return ids === undefined ? state.pending : state.pending.filter((c) => ids.includes(c.id));
}

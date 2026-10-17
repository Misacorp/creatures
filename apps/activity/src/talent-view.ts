/**
 * What the talent screens say, as plain functions: the choices of a waiting duplicate, what a Talent Book
 * can do, and the words for what happened. The server decides everything (what is offered, what Recommended
 * is, what a slotting costs); these only arrange its answer for the screen. All of it is text.
 */
import { talentDef } from '@creatures/game';
import type { Creature, GameState } from './api';
import { creatureName, speciesName } from './game';
import { partsText } from './gear-view';
import type {
  ChoiceResult,
  DuplicateChoice,
  PendingCatch,
  TalentSlotView,
  TalentView,
} from './talent-types';

/** The four buttons of a duplicate, in the order they are drawn. */
export const CHOICE_ORDER: readonly DuplicateChoice[] = ['teach', 'fuse', 'release', 'keep'];

export const CHOICE_LABEL: Record<DuplicateChoice, string> = {
  teach: 'Teach',
  fuse: 'Fuse',
  release: 'Release',
  keep: 'Keep',
};

/** One short line under each button: what it does. Release names the parts (never Bait). */
export function choiceHint(choice: DuplicateChoice, card: PendingCatch): string {
  switch (choice) {
    case 'teach':
      return 'Its talent goes to your creature';
    case 'fuse':
      return 'One fusion step for your creature';
    case 'release':
      return `Let it go for ${partsText(card.releases)}`;
    case 'keep':
      return 'A second creature of this line';
  }
}

/** The pending cards a creature of the line could take, in the order the server lists them. */
function creatureOf(creatures: readonly Creature[], id: string): Creature | undefined {
  return creatures.find((c) => c.id === id);
}

/** A slot a talent could be taught into: what sits there now, and whether Recommended picks it. */
export interface TeachSlot {
  slot: number;
  /** The talent in it now; null: empty. */
  current: TalentView | null;
  recommended: boolean;
}

export interface TeachTarget {
  creature: Creature;
  slots: TeachSlot[];
}

/** Where Teach can go: the creatures the server offers and each one's open slots. */
export function teachTargets(card: PendingCatch, creatures: readonly Creature[]): TeachTarget[] {
  const targets: TeachTarget[] = [];
  for (const id of card.offered.teach) {
    const creature = creatureOf(creatures, id);
    if (creature === undefined) continue;
    const slots = creature.talents.slots
      .filter((s) => s.open)
      .map((s) => ({
        slot: s.slot,
        current: s.talent,
        recommended:
          card.recommended.choice === 'teach' &&
          card.recommended.creatureId === id &&
          card.recommended.slot === s.slot,
      }));
    if (slots.length > 0) targets.push({ creature, slots });
  }
  return targets;
}

export interface FuseTarget {
  creature: Creature;
  /** The fusion count after this fusion. */
  after: number;
  recommended: boolean;
}

/** Where Fuse can go: the creatures the server offers (those not fully fused). */
export function fuseTargets(card: PendingCatch, creatures: readonly Creature[]): FuseTarget[] {
  return card.offered.fuse.flatMap((id) => {
    const creature = creatureOf(creatures, id);
    if (creature === undefined) return [];
    return [
      {
        creature,
        after: creature.fusionCount + 1,
        recommended: card.recommended.choice === 'fuse' && card.recommended.creatureId === id,
      },
    ];
  });
}

/** Whether a choice is on offer at all (Teach and Fuse need a creature that can take them). */
export function isOffered(choice: DuplicateChoice, card: PendingCatch): boolean {
  switch (choice) {
    case 'teach':
      return card.offered.teach.length > 0;
    case 'fuse':
      return card.offered.fuse.length > 0;
    case 'release':
      return card.offered.release;
    case 'keep':
      return card.offered.keep;
  }
}

/** "Teach it to Cindle (slot 1)", "Fuse it into Splashet": what Recommended would do, in words. */
export function recommendedText(card: PendingCatch, creatures: readonly Creature[]): string {
  const rec = card.recommended;
  const target = rec.creatureId === undefined ? undefined : creatureOf(creatures, rec.creatureId);
  const who = target === undefined ? 'your creature' : creatureName(target);
  switch (rec.choice) {
    case 'teach':
      return `Teach it to ${who}${rec.slot === undefined ? '' : ` (slot ${String(rec.slot)})`}`;
    case 'fuse':
      return `Fuse it into ${who}`;
    case 'release':
      return `Release it for ${partsText(card.releases)}`;
    case 'keep':
      return 'Keep it as a second creature';
  }
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
      return `${lead}Taught ${talent}${result.talent.golden ? ' (golden)' : ''} to ${who}${result.slot === undefined ? '' : `, slot ${String(result.slot)}`}.`;
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

/** The words of the apply-to-all button. */
export function applyAllText(count: number): string {
  return count === 1 ? 'Apply Recommended' : `Apply Recommended to all ${String(count)}`;
}

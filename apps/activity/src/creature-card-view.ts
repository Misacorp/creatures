/**
 * What the focused creature card says, as plain functions: the line under the XP bar, the talent chips,
 * the status badges and the lines of the creature page. Pure; `CreatureCard.tsx` and `CreaturePage.tsx`
 * draw it. The server decides every number; nothing here computes game rules.
 */
import type { Creature, GameState } from './api';
import { ribbonBlocker, ribbonName } from './experience';
import { speciesName } from './game';
import type { GearSlot } from './gear-types';
import { slotTitle } from './talent-view';

/**
 * Where a creature's page should land when it opens: on one gear slot's picker (a gear icon of the
 * card), on the talents (the chips, or the "fill a slot" button), or (null) at the top.
 */
export type PageFocus = { part: 'gear'; slot: GearSlot } | { part: 'talents' } | null;

/** A piece of the "Next" line; the strong part is the thing to do or to look forward to. */
export interface NextPart {
  text: string;
  strong: boolean;
}

/**
 * The one line under the XP bar: what the creature waits for ("Next: the Bronze Ribbon", with what is
 * missing when it cannot yet), or what its next level brings ("Next: Scarf at 7"). Empty when there is
 * nothing to say.
 */
export function nextParts(creature: Creature): NextPart[] {
  if (creature.expNeeded === null) return [{ text: 'Top level', strong: false }];
  if (creature.waiting) {
    const ribbon = creature.ribbon;
    if (ribbon !== null) {
      const missing = ribbonBlocker(ribbon);
      return [
        { text: 'Next: ', strong: false },
        { text: `the ${ribbonName(ribbon.id)}`, strong: true },
        { text: missing === null ? '' : ` · ${missing}`, strong: false },
      ];
    }
    if (creature.evolution !== undefined) {
      return [
        { text: 'Next: ', strong: false },
        { text: 'evolve', strong: true },
      ];
    }
    return [{ text: 'Waiting', strong: false }];
  }
  return creature.nextUnlock === null
    ? []
    : [
        { text: 'Next: ', strong: false },
        {
          text: `${creature.nextUnlock.name} at ${String(creature.nextUnlock.level)}`,
          strong: true,
        },
      ];
}

/** The text of the line, as one string (for tests and spoken labels). */
export function nextText(creature: Creature): string {
  return nextParts(creature)
    .map((p) => p.text)
    .join('');
}

/** The words drawn over the XP bar: "140 / 222", or "Top level". */
export function xpWords(creature: Creature): string {
  return creature.expNeeded === null
    ? 'Top level'
    : `${String(creature.exp)} / ${String(creature.expNeeded)}`;
}

/** What a portrait says to a screen reader: the name and "(shiny)". The rarity is said with the name (a hidden word after it). */
export function portraitAlt(name: string, shiny: boolean): string {
  return `${name}${shiny ? ' (shiny)' : ''}`;
}

/**
 * Whether a click came from a button inside `boundary` (the card): those do their own thing, while a click
 * anywhere else on the card opens the page. Walks up from the target with plain DOM properties, so it
 * also works on the tests' fake DOM.
 */
export function clickedButton(target: unknown, boundary: unknown): boolean {
  let node: unknown = target;
  while (typeof node === 'object' && node !== null && node !== boundary) {
    if ('localName' in node && node.localName === 'button') return true;
    node = 'parentNode' in node ? node.parentNode : null;
  }
  return false;
}

/** The id of a card's element on the page (the finder scrolls to it); only characters safe for an id. */
export function cardDomId(creatureId: string): string {
  return `creature-card-${creatureId.replace(/[^A-Za-z0-9_-]/g, '')}`;
}

/** One talent chip on the card. */
export interface KitChip {
  key: string;
  kind: 'signature' | 'talent' | 'empty';
  /** The talent's name; "Empty" for an open slot with nothing in it. */
  name: string;
  golden: boolean;
}

export interface TalentKit {
  chips: KitChip[];
  /** The creature levels the closed slots open at, in slot order ("20 · 25" is drawn from these). */
  locked: number[];
  /** What assistive technology says for the whole group. */
  label: string;
}

/** The talents of a card: the signature, each filled slot, "Empty" for open slots, and the closed slots' levels. */
export function talentKit(creature: Creature): TalentKit {
  const { signature, slots } = creature.talents;
  const chips: KitChip[] = [];
  if (signature !== null) {
    chips.push({
      key: 'signature',
      kind: 'signature',
      name: signature.name,
      golden: signature.golden,
    });
  }
  const locked: number[] = [];
  for (const slot of slots) {
    if (!slot.open) {
      locked.push(slot.opensAt);
    } else if (slot.talent === null) {
      chips.push({ key: `slot-${String(slot.slot)}`, kind: 'empty', name: 'Empty', golden: false });
    } else {
      chips.push({
        key: `slot-${String(slot.slot)}`,
        kind: 'talent',
        name: slot.talent.name,
        golden: slot.talent.golden,
      });
    }
  }
  const parts = chips.map((c) =>
    c.kind === 'empty'
      ? 'an empty slot'
      : `${c.name}${c.golden ? ' (golden)' : ''}${c.kind === 'signature' ? ' (signature)' : ''}`,
  );
  const closed = slots.filter((s) => !s.open).map((s) => slotTitle(s).toLowerCase());
  const label = `Talents: ${[...parts, ...closed].join(', ') || 'none'}`;
  return { chips, locked, label };
}

/** "20 · 25": the levels the closed talent slots open at. */
export function lockedText(levels: readonly number[]): string {
  return levels.map(String).join(' · ');
}

/** A status badge of the card or its page. */
export interface Badge {
  text: string;
  tone: 'festival' | 'shiny' | 'away' | 'busy' | 'good' | 'first';
  /** The glossary entry it explains, or null. */
  entry: string | null;
  /** A small pixel picture before the words (`armchair` for Lounging), or none. */
  icon?: 'armchair';
}

/** The badges worth a glance on the card itself: what the creature is doing now (it changes what you can do). */
export function activityBadges(creature: Creature, state: Pick<GameState, 'loungerId'>): Badge[] {
  const badges: Badge[] = [];
  if (creature.away) badges.push({ text: 'Away', tone: 'away', entry: 'away' });
  if (creature.busy?.kind === 'job') {
    badges.push({ text: 'On a job', tone: 'busy', entry: 'workshop' });
  }
  if (creature.id === state.loungerId)
    badges.push({ text: 'Lounging', tone: 'good', entry: null, icon: 'armchair' });
  return badges;
}

/** "Bronze Ribbon, Silver Ribbon" for the ribbons held (0 to 3), or "None yet". */
export function ribbonsHeldText(count: number): string {
  const ids = (['bronze', 'silver', 'gold'] as const).slice(0, Math.max(0, Math.min(3, count)));
  return ids.length === 0 ? 'None yet' : ids.map(ribbonName).join(', ');
}

/** The explorer facts of the page: rank, experience towards the next rank, and trips made. */
export function explorerFacts(explorer: Creature['explorer']): { label: string; value: string }[] {
  return [
    { label: 'Explorer rank', value: String(explorer.rank) },
    {
      label: 'Explorer XP',
      value:
        explorer.nextRankXp === null
          ? `${String(explorer.xp)} (top rank)`
          : `${String(explorer.xp)} / ${String(explorer.nextRankXp)}`,
    },
    { label: 'Trips', value: String(explorer.trips) },
  ];
}

/** "Cindle" when the creature has a nickname (the species is then a second line), else null. */
export function speciesSubtitle(creature: Creature): string | null {
  return creature.nickname === null ? null : speciesName(creature.species);
}

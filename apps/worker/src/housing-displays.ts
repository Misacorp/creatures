/**
 * The display registry of the trophy hall and the mantel (`docs/design/housing.md` 3.5). A display spot of a room kind names a
 * `DisplayKind`; its provider reads a few rows (by primary key or index) and answers the data the client draws. Nothing is placed
 * by the player: the displays fill themselves from what the player already did.
 *
 * Adding a kind: a variant in `DisplayData` (`@creatures/game`, `housing/view.ts`), a provider here, a `display` spot in a room
 * kind, a sprite in the art pack. The registry's type makes a kind without a provider a compile error.
 */
import type { DisplayData, DisplayKind } from '@creatures/game';
import { completedJournalSets, type HouseReads } from './housing-feats';

export interface DisplayCtx {
  reads: HouseReads;
  /** The week's raid boss, or null (the raid's week row: one or two rows). */
  currentBoss: () => string | null;
  /** The ids of the sets the player has finished (worked out from the items already read). */
  setsComplete: readonly string[];
}

export const DISPLAY_PROVIDERS: Record<DisplayKind, (ctx: DisplayCtx) => DisplayData> = {
  'raid-plaques': (ctx) => ({
    kind: 'raid-plaques',
    plaques: ctx.reads
      .trophies('raid')
      .map((t) => ({ bossId: t.ref, best: t.best, wins: t.wins }))
      .sort((a, b) => a.bossId.localeCompare(b.bossId)),
    current: ctx.currentBoss(),
  }),
  'games-medals': (ctx) => ({ kind: 'games-medals', ...ctx.reads.medals() }),
  'games-badges': (ctx) => ({
    kind: 'games-badges',
    events: [...ctx.reads.badges()].sort((a, b) => a.eventId.localeCompare(b.eventId)),
  }),
  festival: (ctx) => ({
    kind: 'festival',
    species: ctx.reads
      .trophies('festival')
      .map((t) => t.ref)
      .sort(),
  }),
  keepsakes: (ctx) => ({
    kind: 'keepsakes',
    places: [...ctx.reads.keepsakes()].sort((a, b) => a.place.localeCompare(b.place)),
  }),
  journal: (ctx) => ({
    kind: 'journal',
    sets: completedJournalSets(ctx.reads),
    pages: ctx.reads.journalPages().size,
  }),
  dungeon: (ctx) => ({ kind: 'dungeon', ...ctx.reads.dungeon() }),
  'set-keepsakes': (ctx) => ({ kind: 'set-keepsakes', sets: [...ctx.setsComplete] }),
};

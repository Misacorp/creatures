/**
 * What scouts bring (phase 5 step 2, docs/design/valley/systems/scouts.md V-SCOUT-2, 3, 12): the live half of the lazy pass.
 *
 * The pure pass (`settle` in `@creatures/game`) says how many effective hours a seat picked up in each stretch and at what rates;
 * everything below is drawn at the moment of settling from live randomness (`crypto`, never a seed a player could compute):
 * - how many creatures, gear pieces, blueprints and journal pages each stretch found (a Poisson draw on its expected count);
 * - which species a creature is, and whether it is shiny. A new line joins the roster at once; a duplicate waits at the Paddock
 *   gate as a pending card that takes today's Recommended answer by itself after a day (`gateAutoHours`);
 * - when a store comes home: the gear pieces' bases, rarity and lines, the blueprints' bases and the journal pages' entries, and the
 *   element of each shard at a mixed place.
 * Scrap and shards are expected values (the pass keeps them as whole numbers with a carry), so no draw is needed for them.
 *
 * Everything here is synchronous and runs inside the pass's transaction.
 */
import {
  RULES,
  VALLEY_RULES,
  chance,
  content,
  dropBase,
  expeditionContent,
  pickSpecies,
  placeProfile,
  poissonDraw,
  rollBlueprint,
  rollItem,
  rollJournal,
  shardElement,
  shardOf,
  type Element,
  type FindableSpecies,
  type GearRarity,
  type PartsBundle,
  type PlaceProfile,
  type Rng,
  type ScoutSpecial,
  type SeatStretch,
} from '@creatures/game';
import type { Analytics } from './analytics';
import type { CatchChoices } from './catch-choices';
import { addPage, foundPages } from './expedition-store';
import { payOnce, type DraftItem } from './gear-grants';
import { creditParts } from './gear-store';
import type { LedgerStorage } from './ledger';
import { recordServerFirst } from './server-firsts';
import { speciesOf } from './species';
import { insertCreature } from './talent-store';

const HOUR_MS = 3_600_000;
const RARITIES = ['common', 'rare', 'epic'] as const;

/** The lines scouts can find: the first stage of every catchable line (evolved forms come from evolving), as the lab models them. */
const FINDABLE = content.creatures
  .filter((c) => c.stage === 1 && c.catchable)
  .map((c) => ({
    id: c.id,
    line: c.line,
    element: c.element,
    rarity: RARITIES.indexOf(c.rarity) as 0 | 1 | 2,
  }));

export interface ScoutDeps {
  readonly storage: LedgerStorage;
  readonly now: () => number;
  /** Live randomness for the counts and the species of finds. */
  readonly rng: Rng;
  /** Live randomness for gear, blueprints and shard elements. */
  readonly gearRng: Rng;
  /** The cosmetic quirk and the first talent of a new creature. */
  readonly quirkRng: Rng;
  readonly talentRng: Rng;
  readonly combatV2: boolean;
  readonly choices: CatchChoices;
  readonly analytics?: Analytics | undefined;
}

/** A seat's waiting finds that are rolled when they come home. */
export interface SeatStore {
  readonly scrap: number;
  readonly shards: number;
  readonly gear: number;
  readonly blueprints: number;
  readonly pages: number;
}

/** What drawing a pass's stretches produced, to write back to the seats. */
export interface DrawnFinds {
  /** Per seat id: the gear, blueprint and page finds to add to the store. */
  readonly stores: Map<string, { gear: number; blueprints: number; pages: number }>;
  /** Creatures that arrived in this pass: new species and duplicates left at the gate. */
  readonly arrivals: { newcomers: number; duplicates: number };
}

export class ValleyFinds {
  constructor(private readonly deps: ScoutDeps) {}

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  /** The player's lines, as the pick needs them (a line is owned once any of its forms is). */
  ownedLines(userId: string): Set<string> {
    return new Set(
      this.sql
        .exec<{ line: string }>('SELECT DISTINCT line FROM creatures WHERE user_id = ?', userId)
        .toArray()
        .map((r) => r.line),
    );
  }

  /**
   * Draws the finds of a pass's stretches in time order. Creatures arrive at once (a newcomer joins the roster, a duplicate waits at
   * the gate); gear, blueprints and pages are counted into the seat's store and rolled when it comes home. `needNew` is the starter's
   * first scout (V-SCOUT-3, plan step 2): when no creature arrived by chance, one new species arrives for sure.
   */
  draw(
    userId: string,
    stretches: readonly SeatStretch[],
    options: { kitOf: (seatId: string) => string | null; guarantee: boolean },
    at: number,
  ): DrawnFinds {
    const rng = this.deps.rng;
    const stores = new Map<string, { gear: number; blueprints: number; pages: number }>();
    const arrivals = { newcomers: 0, duplicates: 0 };
    const owned = this.ownedLines(userId);
    for (const stretch of stretches) {
      const store = stores.get(stretch.seat) ?? { gear: 0, blueprints: 0, pages: 0 };
      store.gear += poissonDraw(rng, stretch.hours * stretch.rates.gear);
      store.blueprints += poissonDraw(rng, stretch.hours * stretch.rates.blueprints);
      store.pages += poissonDraw(rng, stretch.hours * stretch.rates.pages);
      stores.set(stretch.seat, store);
      const creatures = poissonDraw(rng, stretch.hours * stretch.rates.creatures);
      for (let n = 0; n < creatures; n++) {
        this.arrive(userId, stretch.seat, stretch.place, owned, {
          lure: options.kitOf(stretch.seat) === 'lure',
          special: stretch.world.special,
          needNew: false,
          at,
          arrivals,
        });
      }
    }
    const first = stretches[0];
    if (
      options.guarantee &&
      arrivals.newcomers + arrivals.duplicates === 0 &&
      first !== undefined
    ) {
      this.arrive(userId, first.seat, first.place, owned, {
        lure: options.kitOf(first.seat) === 'lure',
        special: first.world.special,
        needNew: true,
        at,
        arrivals,
      });
    }
    return { stores, arrivals };
  }

  private arrive(
    userId: string,
    seatId: string,
    place: PlaceProfile,
    owned: Set<string>,
    o: {
      lure: boolean;
      special: ScoutSpecial | null;
      needNew: boolean;
      at: number;
      arrivals: { newcomers: number; duplicates: number };
    },
  ): void {
    const dest = expeditionContent.destinations.find((d) => d.id === place.id);
    const residents = new Set(dest?.species ?? []);
    const candidates: FindableSpecies[] = FINDABLE.map((s) => ({
      id: s.id,
      element: s.element,
      rarity: s.rarity,
      owned: owned.has(s.line),
      resident: residents.has(s.id),
    }));
    const picked =
      FINDABLE[
        pickSpecies(this.deps.rng, VALLEY_RULES, candidates, place, {
          lure: o.lure,
          special: o.special,
          needNew: o.needNew,
        })
      ];
    if (picked === undefined) return;
    const shiny = chance(
      this.deps.rng,
      RULES.catching.shiny.numerator,
      RULES.catching.shiny.denominator,
    );
    if (!owned.has(picked.line)) {
      owned.add(picked.line);
      recordServerFirst(this.sql, 'catch', picked.id, userId, seatId, o.at);
      insertCreature(
        this.sql,
        {
          quirk: this.deps.quirkRng,
          talent: this.deps.talentRng,
          ...(this.deps.combatV2 ? { combatV2: true } : {}),
        },
        { userId, species: picked.id, origin: 'expedition', shiny, now: o.at },
        this.deps.analytics,
      );
      o.arrivals.newcomers += 1;
      return;
    }
    // A duplicate waits at the Paddock gate; it takes today's Recommended answer by itself after a day (V-SCOUT-3).
    if (shiny) {
      this.sql.exec(
        'UPDATE creatures SET shiny = 1 WHERE user_id = ? AND line = ?',
        userId,
        picked.line,
      );
    }
    this.deps.choices.addPending(
      userId,
      { species: picked.id, shiny },
      { kind: 'expedition', id: seatId },
      undefined,
      o.at + VALLEY_RULES.scouts.gateAutoHours * HOUR_MS,
    );
    o.arrivals.duplicates += 1;
  }

  /**
   * Brings a seat's store home: scrap and shards into the player's parts, then the waiting gear, blueprints and pages rolled now.
   * One grant per (seat, pass time), so a repeat of the same pass draws nothing and pays nothing twice.
   */
  collect(
    userId: string,
    seatId: string,
    place: PlaceProfile,
    store: SeatStore,
    scoutLevel: number,
    at: number,
  ): PartsBundle {
    const parts: PartsBundle = {};
    if (store.scrap > 0) parts.scrap = store.scrap;
    for (let i = 0; i < store.shards; i++) {
      const kind = shardOf(shardElement(this.deps.gearRng, place));
      parts[kind] = (parts[kind] ?? 0) + 1;
    }
    const total = store.gear + store.blueprints;
    if (total > 0) {
      payOnce(
        {
          storage: this.deps.storage,
          now: this.deps.now,
          rng: this.deps.gearRng,
          analytics: this.deps.analytics,
        },
        userId,
        `valley:${seatId}:${String(at)}`,
        {
          source: 'expedition',
          draw: () => ({
            gear: Array.from({ length: store.gear }, () => this.rollGear(place, scoutLevel)),
            parts: {},
            blueprints: Array.from({ length: store.blueprints }, () =>
              rollBlueprint(this.deps.gearRng),
            ),
          }),
        },
      );
    }
    if (store.pages > 0) this.rollPages(userId, place, store.pages, at);
    creditParts(this.sql, userId, parts);
    return parts;
  }

  /** A gear piece of the place's element at the scout's own level (V-SCOUT: found gear starts at the scout's level). */
  private rollGear(place: PlaceProfile, scoutLevel: number): DraftItem {
    const rng = this.deps.gearRng;
    const [commonOdds = 0, rareOdds = 0, epicOdds = 0] = VALLEY_RULES.forge.foundGearOdds;
    const point = (rng.nextU32() / 0x1_0000_0000) * (commonOdds + rareOdds + epicOdds);
    const rarity: GearRarity =
      point < commonOdds ? 'common' : point < commonOdds + rareOdds ? 'rare' : 'epic';
    const element: Element | null = place.element;
    const base = dropBase(rng, element, scoutLevel);
    const item = rollItem(rng, { baseId: base.id, rarity, itemLevel: scoutLevel });
    return { item, origin: { kind: 'trip', place: place.id, rank: Math.max(1, scoutLevel) } };
  }

  /** Journal pages: one roll each, never a repeat, nothing when the book is complete. */
  private rollPages(userId: string, place: PlaceProfile, count: number, at: number): void {
    const entries = expeditionContent.journal.entries;
    const found = foundPages(this.sql, userId);
    for (let i = 0; i < count; i++) {
      const entryId = rollJournal(this.deps.gearRng, entries, place.id, found);
      if (entryId === null) continue;
      if (!addPage(this.sql, userId, entryId, at, null)) continue;
      found.add(entryId);
    }
  }
}

/** The profile of a seat's destination, or undefined when the content no longer has it. */
export const profileOf = (id: string): PlaceProfile | undefined => placeProfile(VALLEY_RULES, id);

/** The species of a creature: its element is what the place's fit asks for (V-POST-4). */
export const elementOfCreature = (species: string): Element => speciesOf(species).element;

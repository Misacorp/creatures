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
  type HousingHook,
} from '@creatures/game';
import type { Analytics } from './analytics';
import type { CatchChoices } from './catch-choices';
import { addPage, foundPages } from './expedition-store';
import { payOnce, type DraftItem, type GrantView } from './gear-grants';
import { creditParts } from './gear-store';
import type { LedgerStorage } from './ledger';
import { paperItem, type PaperRecorder } from './valley-gazette';
import { recordServerFirst } from './server-firsts';
import { speciesOf } from './species';
import { insertCreature } from './talent-store';

const HOUR_MS = 3_600_000;
const uniform = (rng: Rng): number => rng.nextU32() / 0x1_0000_0000;
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
  /** Player housing's reward hook (`HOUSING` on): a drop at the reward moment. Absent: nothing happens. */
  readonly housing?: HousingHook | undefined;
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
  /** Creatures that arrived in this pass: new species and duplicates left at the gate (`residents`: arrivals that were a rare resident with its token, V-COM-12). */
  readonly arrivals: { newcomers: number; duplicates: number; residents: number };
  /** The collection finds this pass's scouting turned up (V-COM-12): everyday rare finds and journal pages that belong to the School's set. */
  readonly collection: { everyday: number; pages: number };
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
    options: {
      kitOf: (seatId: string) => string | null;
      guarantee: boolean;
      /** The Gazette's log of this arrival (V-POST-14), with the creature that stands at each seat; absent: nothing is recorded. */
      paper?: { rec: PaperRecorder; byOf: (seatId: string) => string | null } | undefined;
    },
    at: number,
  ): DrawnFinds {
    const rng = this.deps.rng;
    const stores = new Map<string, { gear: number; blueprints: number; pages: number }>();
    const arrivals = { newcomers: 0, duplicates: 0, residents: 0 };
    const collection = { everyday: 0, pages: 0 };
    const owned = this.ownedLines(userId);
    for (const stretch of stretches) {
      const store = stores.get(stretch.seat) ?? { gear: 0, blueprints: 0, pages: 0 };
      store.gear += poissonDraw(rng, stretch.hours * stretch.rates.gear);
      store.blueprints += poissonDraw(rng, stretch.hours * stretch.rates.blueprints);
      const pages = poissonDraw(rng, stretch.hours * stretch.rates.pages);
      store.pages += pages;
      stores.set(stretch.seat, store);
      // V-COM-12: a share of the pages belongs to the School's set, and an everyday rare find now and then fills a socket of its own.
      for (let n = 0; n < pages; n++) {
        if (uniform(rng) < VALLEY_RULES.collections.pageInSetChance) collection.pages += 1;
      }
      collection.everyday += poissonDraw(rng, stretch.hours * stretch.rates.rareFinds);
      const creatures = poissonDraw(rng, stretch.hours * stretch.rates.creatures);
      for (let n = 0; n < creatures; n++) {
        this.arrive(userId, stretch.seat, stretch.place, owned, {
          lure: options.kitOf(stretch.seat) === 'lure' && !stretch.deep,
          deep: stretch.deep,
          special: stretch.world.special,
          needNew: false,
          at,
          arrivals,
          ...(options.paper === undefined
            ? {}
            : { paper: { rec: options.paper.rec, by: options.paper.byOf(stretch.seat) } }),
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
        lure: options.kitOf(first.seat) === 'lure' && !first.deep,
        deep: first.deep,
        special: first.world.special,
        needNew: true,
        at,
        arrivals,
        ...(options.paper === undefined
          ? {}
          : { paper: { rec: options.paper.rec, by: options.paper.byOf(first.seat) } }),
      });
    }
    return { stores, arrivals, collection };
  }

  private arrive(
    userId: string,
    seatId: string,
    place: PlaceProfile,
    owned: Set<string>,
    o: {
      lure: boolean;
      /** V-SCOUT-6: the scout is deep: the deeper area's residents turn up, and rare and epic species a little more. */
      deep: boolean;
      special: ScoutSpecial | null;
      needNew: boolean;
      at: number;
      arrivals: { newcomers: number; duplicates: number; residents: number };
      paper?: { rec: PaperRecorder; by: string | null };
    },
  ): void {
    // V-COM-12: an arrival is a rare resident with its token now and then (it sets itself into the Paddock's collection).
    if (uniform(this.deps.rng) < VALLEY_RULES.collections.residentPerArrival)
      o.arrivals.residents += 1;
    const dest = expeditionContent.destinations.find((d) => d.id === place.id);
    const residents = new Set(o.deep ? (dest?.deep.species ?? []) : (dest?.species ?? []));
    const rarityUp = o.deep ? 1 + (dest?.deep.rarityUpBp ?? 0) / 10_000 : 1;
    const candidates: FindableSpecies[] = FINDABLE.map((s) => ({
      id: s.id,
      element: s.element,
      rarity: s.rarity,
      owned: owned.has(s.line),
      resident: residents.has(s.id),
      ...(o.deep
        ? {
            weight:
              (residents.has(s.id) ? VALLEY_RULES.scouts.pushOn.residentWeight : 1) *
              (s.rarity > 0 ? rarityUp : 1),
          }
        : {}),
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
      const made = insertCreature(
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
      o.paper?.rec.newcomer(made.id, picked.id, o.paper.by);
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
    o.paper?.rec.duplicate();
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
    paper?: { rec: PaperRecorder; by: string | null },
  ): PartsBundle {
    const parts: PartsBundle = {};
    if (store.scrap > 0) parts.scrap = store.scrap;
    for (let i = 0; i < store.shards; i++) {
      const kind = shardOf(shardElement(this.deps.gearRng, place));
      parts[kind] = (parts[kind] ?? 0) + 1;
    }
    const total = store.gear + store.blueprints;
    const seen: { gear: GrantView['gear']; blueprints: GrantView['blueprints'] } = {
      gear: [],
      blueprints: [],
    };
    if (total > 0) {
      const view = payOnce(
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
      seen.gear = view.gear;
      seen.blueprints = view.blueprints;
    }
    let pages = 0;
    if (store.pages > 0) pages = this.rollPages(userId, place, store.pages, at);
    creditParts(this.sql, userId, parts);
    this.deps.housing?.drop(userId, {
      kind: 'scout',
      key: `scout:${seatId}:${String(at)}`,
      place: place.id,
      element: place.element,
      finds: store.gear + store.blueprints + store.pages,
    });
    if (paper !== undefined) {
      paper.rec.parts(store.scrap, store.shards);
      paper.rec.pages(pages);
      for (const item of seen.gear) paper.rec.gear(paperItem(item), paper.by);
      for (const bp of seen.blueprints) if (!bp.duplicate) paper.rec.blueprint(bp.baseId, paper.by);
    }
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
  private rollPages(userId: string, place: PlaceProfile, count: number, at: number): number {
    let added = 0;
    const entries = expeditionContent.journal.entries;
    const found = foundPages(this.sql, userId);
    for (let i = 0; i < count; i++) {
      const entryId = rollJournal(this.deps.gearRng, entries, place.id, found);
      if (entryId === null) continue;
      if (!addPage(this.sql, userId, entryId, at, null)) continue;
      found.add(entryId);
      added += 1;
    }
    return added;
  }

  /** One live uniform draw in [0, 1) (the small moments' picks, V-BON-9). */
  roll(): number {
    return uniform(this.deps.rng);
  }

  /**
   * V-SCOUT-6: whether an Expert scout found a way into its destination's deeper area during the hours it picked up in this pass: one live
   * draw per scout that may (an Expert, not already deep, at a place with a deeper area), the first to find one wins (at most one decision,
   * V-RET-3). `hours` is each such seat's effective hours; returns the seat id, or null.
   */
  wayDeeper(candidates: readonly { seatId: string; hours: number }[]): string | null {
    const rate = VALLEY_RULES.scouts.pushOn.chancePerHour;
    for (const c of candidates) {
      if (!(c.hours > 0)) continue;
      const p = 1 - Math.pow(1 - rate, c.hours);
      if (uniform(this.deps.rng) < p) return c.seatId;
    }
    return null;
  }
}

/** V-SCOUT-6: the destination has a deeper area to push on into. */
export const hasDeepArea = (id: string): boolean =>
  expeditionContent.destinations.some((d) => d.id === id);

/** The profile of a seat's destination, or undefined when the content no longer has it. */
export const profileOf = (id: string): PlaceProfile | undefined => placeProfile(VALLEY_RULES, id);

/** The species of a creature: its element is what the place's fit asks for (V-POST-4). */
export const elementOfCreature = (species: string): Element => speciesOf(species).element;

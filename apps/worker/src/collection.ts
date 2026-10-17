/**
 * The collection game logic of a guild: starters, creatures, expeditions, training, nicknames and
 * "first on server" records. Everything here is synchronous and runs inside `transactionSync`, so
 * a check and the writes that depend on it can never be interleaved with another request.
 *
 * The user is always an argument supplied from the verified session, never from a request body.
 */
import {
  RULES,
  content,
  effectiveStats,
  expToNext,
  nextUnlock,
  quirkText,
  ribbonNeeded,
  ribbonParts,
  sanitizeNickname,
  treatCost,
  type PartsBundle,
  type PartKind,
  type Rng,
  type Stats,
} from '@creatures/game';
import type { Analytics } from './analytics';
import type { DevFlags } from './dev-state';
import {
  Expeditions,
  type CancelledView,
  type ExpeditionResult,
  type ExpeditionView,
  type ExplorerView,
  type SendInput,
  type SlotsView,
} from './expeditions';
import {
  debitParts,
  equippedByCreature,
  getParts,
  openJobsByCreature,
  wornGearView,
  wornRows,
  type WornBySlot,
  type WornGear,
} from './gear-store';
import { settleExperience, type ExperienceView } from './creature-exp';
import { foldCreature } from './gear-worn';
import { CatchChoices, type PendingView } from './catch-choices';
import { booksByCreature, foldTalentsOf, insertCreature } from './talent-store';
import { creatureTalentsView, type CreatureTalentsView } from './talent-view';
import type { HeldTalent } from '@creatures/game';
import { getBalances, lookupSpend, spend, type Currency, type LedgerStorage } from './ledger';
import { runKeyed, settleSpend } from './keyed-action';
import { dismissLevelReset, pendingLevelReset, type LevelResetNotice } from './level-reset';
import { Lounge, type LoungeSpot } from './lounger';
import { GameError, atomically, type Outcome } from './outcome';
import { recordServerFirst, type ServerFirstKind } from './server-firsts';
import { speciesOf } from './species';

export { speciesOf } from './species';
export type { ErrorStatus, Outcome } from './outcome';
export type { CatchView, ExpeditionResult, ExpeditionView, SendInput } from './expeditions';

type CreatureRow = {
  id: string;
  user_id: string;
  line: string;
  species: string;
  level: number;
  fusion_count: number;
  shiny: number;
  nickname: string | null;
  away_expedition_id: string | null;
  origin: string;
  caught_at: number;
  quirk_id: string | null;
  line_slot: number;
  exp: number;
  ribbons: number;
};

export interface CreatureView {
  id: string;
  species: string;
  line: string;
  level: number;
  levelCap: number;
  fusionCount: number;
  shiny: boolean;
  nickname: string | null;
  away: boolean;
  origin: string;
  caughtAt: number;
  /**
   * The creature's cosmetic personality quirk: an id into the shared lore data (`lore.quirks`),
   * whose text the client looks up. It changes nothing in the game. Null only for an id that is
   * missing or no longer in the data.
   */
  quirk: string | null;
  /**
   * 1, or 2 for the second creature of a branching line that the player Kept (at most two of a line).
   */
  lineSlot: number;
  /** The creature's talents: its slots (open at levels 1, 20 and 25), its signature (epics) and its Talent Book. */
  talents: CreatureTalentsView;
  stats: Stats;
  /**
   * The stats a fight uses: `stats` with the equipped item folded in (capped). Equal to `stats` for a
   * creature without gear. Gear changes nothing else about the creature.
   */
  statsWithGear: Stats;
  /** The items the creature wears, one per slot (Hat, Scarf, Charm). The full items are in the gear view. */
  gear: WornGear[];
  /**
   * What the creature is doing, or null: on an expedition or on a workshop job. A busy creature
   * cannot start the other; it still fights in raids. `away` is true for an expedition only.
   */
  busy: { kind: 'expedition' | 'job'; id: string } | null;
  /** The creature's explorer rank, XP and finished trips (expeditions are about creatures, not the account). */
  explorer: ExplorerView;
  /**
   * Experience banked towards the next level, and what that level needs (null at the top). Levels come
   * from experience (trips, the dungeon, raids, Workshop jobs), never from Bait.
   */
  exp: number;
  expNeeded: number | null;
  /**
   * True when the creature stands at a level it may not leave yet (a ribbon, or its evolution) and holds
   * the whole next level's experience.
   */
  waiting: boolean;
  /** Ribbons held: 0 none, 1 Bronze, 2 Silver, 3 Gold. */
  ribbons: number;
  /** What its next level brings ("Scarf" at 7), or null at the top. */
  nextUnlock: { level: number; name: string } | null;
  /** The ribbon it waits for at its level (with the price and whether the player can pay it now), else null. */
  ribbon: RibbonView | null;
  /** Bait a treat costs for this creature now (3 + half its level, rounded up). */
  treatCost: number;
  /**
   * The evolution this creature could reach. `available` is true when the evolution level is
   * reached and the player holds enough Essence right now.
   */
  evolution?: { toSpecies: string; level: number; essence: number; available: boolean };
  /**
   * The creature's finale ability (null for a species without one). `unlocked` once the creature
   * has reached `unlockLevel`. `nextId` is the stronger ability of the evolved form, if the
   * creature can still evolve into a species that has one.
   */
  ability: { id: string; unlocked: boolean; unlockLevel: number; nextId?: string } | null;
}

/** A ribbon a creature waits for. */
export interface RibbonView {
  id: 'bronze' | 'silver';
  /** The level it waits at. */
  level: number;
  /** The parts it costs (shards of the creature's own element). */
  parts: PartsBundle;
  /** Finished trips of this creature it asks for, and how many it has made. */
  trips: number;
  tripsDone: number;
  /** True when the player holds the parts and the creature has made the trips. */
  ready: boolean;
}

/** What earning a ribbon did. */
export interface RibbonResult {
  creatureId: string;
  ribbon: 'bronze' | 'silver';
  /** The experience the creature had banked, spent now that the way is open. */
  experience: ExperienceView | null;
}

export interface ServerFirstView {
  kind: Exclude<ServerFirstKind, 'jackpot'>;
  species: string;
  at: number;
  /** True if the signed-in player shares this record. */
  mine: boolean;
  /** Display names of everyone who got the species in the first drop. */
  holders: string[];
}

export interface PlayerState {
  serverNow: number;
  balances: Record<Currency, number>;
  starterChosen: boolean;
  /** Species ids the player may pick from; only present until a starter is chosen. */
  starterOptions?: string[];
  creatures: CreatureView[];
  /** Duplicates waiting for Teach, Fuse, Release or Keep, oldest first. */
  pending: PendingView[];
  /** What the book slotting costs, so the client shows the price the server charges. */
  bookSlotBait: number;
  expeditions: ExpeditionView[];
  /** Trips cancelled by the slot wipe when expeditions v2 started (newest first, at most 3). */
  cancelled: CancelledView[];
  /** The one-time level reset card (levels halved, Bait refunded) until the player dismisses it, else null. */
  levelReset: LevelResetNotice | null;
  /** Expedition slots: how many there are, how many are used and what opens the next one. */
  slots: SlotsView;
  /** Supplies in stock: supply id to amount. */
  supplies: Record<string, number>;
  serverFirsts: ServerFirstView[];
  /**
   * The creature that lounges in the living room: an idle creature of the player (re-picked at random
   * when the stored one is busy or gone), or null when every creature is busy or there is none.
   */
  loungerId: string | null;
  /**
   * The spot the player chose in the living room and the server time of the claim, or null when never
   * chosen (or the stored id is no longer a known spot).
   */
  loungeSpot: LoungeSpot | null;
}

export interface CollectionDeps {
  storage: LedgerStorage;
  now: () => number;
  rng: Rng;
  /**
   * Live randomness for the quirk of a new creature. Separate from `rng`, so a quirk never
   * consumes the draws of a catch.
   */
  quirkRng: Rng;
  /**
   * Live randomness for the talent of a new creature and of a duplicate's card. Separate from `rng` and
   * `quirkRng`, so a talent never consumes the draws of a catch or a quirk.
   */
  talentRng: Rng;
  /**
   * Live randomness for the loot of an expedition (parts, blueprints). Separate from `rng`, so loot
   * never consumes the draws of a catch.
   */
  gearRng: Rng;
  /**
   * Live randomness for the end-of-trip choice, push-on results and the journal. Separate from `rng`,
   * so none of them ever consumes the draws of a catch.
   */
  tripRng: Rng;
  /**
   * Live randomness for picking the lounger. Optional: defaults to crypto; tests inject a seeded one.
   * Separate from `rng`, so a pick never consumes the draws of a catch.
   */
  loungerRng?: Rng;
  /** The analytics event log. Optional: without it nothing is logged. */
  analytics?: Analytics;
  /** The dev tools' force flags (staging only); passed on to expeditions. */
  dev?: DevFlags | undefined;
  /** Test seam: the branches of a line, for the Keep choice (default: the shipped content). */
  branchesOf?: ((line: string) => readonly string[]) | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** A stored apply-result is trusted only as far as the fields the replay check reads. */
function storedString(result: unknown, key: string): string | undefined {
  if (!isRecord(result)) return undefined;
  const value = result[key];
  return typeof value === 'string' ? value : undefined;
}

export class Collection {
  /** Expeditions: sending, the end-of-trip choice, claiming and their views. */
  readonly trips: Expeditions;
  /** The living room: the lounger of a player and the room data of a set of players. */
  readonly lounge: Lounge;
  /** The duplicate choice and the Talent Book. */
  readonly choices: CatchChoices;

  constructor(private readonly deps: CollectionDeps) {
    this.lounge = new Lounge({
      storage: deps.storage,
      now: deps.now,
      ...(deps.loungerRng === undefined ? {} : { rng: deps.loungerRng }),
    });
    this.choices = new CatchChoices({
      storage: deps.storage,
      now: deps.now,
      rngs: { talent: deps.talentRng, quirk: deps.quirkRng },
      analytics: deps.analytics,
      branchesOf: deps.branchesOf,
    });
    this.trips = new Expeditions({
      storage: deps.storage,
      now: deps.now,
      rng: deps.rng,
      tripRng: deps.tripRng,
      gearRng: deps.gearRng,
      quirkRng: deps.quirkRng,
      talentRng: deps.talentRng,
      choices: this.choices,
      analytics: deps.analytics,
      dev: deps.dev,
    });
  }

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  private atomically<T>(fn: () => T): Outcome<T> {
    return atomically(this.deps.storage, fn);
  }

  // --- Reads ---

  private creatureRows(userId: string): CreatureRow[] {
    return this.sql
      .exec<CreatureRow>(
        'SELECT * FROM creatures WHERE user_id = ? ORDER BY caught_at, rowid',
        userId,
      )
      .toArray();
  }

  private ownedCreature(userId: string, creatureId: string): CreatureRow {
    const row = this.sql
      .exec<CreatureRow>('SELECT * FROM creatures WHERE id = ? AND user_id = ?', creatureId, userId)
      .toArray()[0];
    // Same answer for "does not exist" and "belongs to someone else".
    if (row === undefined) throw new GameError(404, 'not_found');
    return row;
  }

  private starterSpecies(userId: string): string | null {
    const row = this.sql
      .exec<{
        starter_species: string | null;
      }>('SELECT starter_species FROM player_progress WHERE user_id = ?', userId)
      .toArray()[0];
    return row?.starter_species ?? null;
  }

  /** The ribbon a creature waits for, with its price and whether the player can pay it, or null. */
  private ribbonView(
    row: CreatureRow,
    parts: Readonly<Record<PartKind, number>>,
    trips: number,
  ): RibbonView | null {
    const def = ribbonNeeded(row.level, row.ribbons);
    if (def === null) return null;
    const cost = ribbonParts(def, speciesOf(row.species).element);
    const affordable = (Object.entries(cost) as [PartKind, number][]).every(
      ([kind, need]) => parts[kind] >= need,
    );
    return {
      id: def.id,
      level: def.level,
      parts: cost,
      trips: def.trips,
      tripsDone: trips,
      ready: affordable && trips >= def.trips,
    };
  }

  private creatureView(
    row: CreatureRow,
    essence: number,
    parts: Readonly<Record<PartKind, number>>,
    worn: WornBySlot | undefined,
    jobId: string | undefined,
    explorer: ExplorerView,
    book: readonly HeldTalent[] | undefined,
  ): CreatureView {
    const species = speciesOf(row.species);
    const away = row.away_expedition_id !== null;
    const stats = effectiveStats(species, row.level, row.fusion_count);
    const atTop = row.level >= RULES.experience.maxLevel;
    const ribbon = this.ribbonView(row, parts, explorer.trips);
    const abilityId = species.ability?.id;
    const nextAbilityId =
      species.evolvesTo === undefined
        ? undefined
        : speciesOf(species.evolvesTo.species).ability?.id;
    return {
      id: row.id,
      species: species.id,
      line: species.line,
      level: row.level,
      levelCap: species.levelCap,
      fusionCount: row.fusion_count,
      shiny: row.shiny === 1,
      nickname: row.nickname,
      away,
      origin: row.origin,
      caughtAt: row.caught_at,
      quirk: row.quirk_id !== null && quirkText(row.quirk_id) !== undefined ? row.quirk_id : null,
      lineSlot: row.line_slot,
      talents: creatureTalentsView(row, book ?? []),
      stats,
      statsWithGear: foldCreature(row, worn, foldTalentsOf(row, book)).stats,
      gear: wornRows(worn).map(wornGearView),
      busy: away
        ? { kind: 'expedition', id: row.away_expedition_id as string }
        : jobId === undefined
          ? null
          : { kind: 'job', id: jobId },
      ability:
        abilityId === undefined
          ? null
          : {
              id: abilityId,
              unlocked: row.level >= RULES.abilities.unlockLevel,
              unlockLevel: RULES.abilities.unlockLevel,
              ...(nextAbilityId === undefined ? {} : { nextId: nextAbilityId }),
            },
      explorer,
      exp: row.exp,
      expNeeded: atTop ? null : expToNext(row.level),
      waiting: !atTop && row.exp >= expToNext(row.level),
      ribbons: row.ribbons,
      nextUnlock: nextUnlock(row.level, species.rarity, species.evolvesTo?.level),
      ribbon,
      treatCost: treatCost(row.level),
      ...(species.evolvesTo === undefined
        ? {}
        : {
            evolution: {
              toSpecies: species.evolvesTo.species,
              level: species.evolvesTo.level,
              essence: species.evolvesTo.essence,
              available:
                row.level >= species.evolvesTo.level && essence >= species.evolvesTo.essence,
            },
          }),
    };
  }

  /** The jackpot record is stored but never listed: the jackpot is hidden from players. */
  private serverFirsts(userId: string): ServerFirstView[] {
    const rows = this.sql
      .exec<{
        kind: Exclude<ServerFirstKind, 'jackpot'>;
        species: string;
        user_id: string;
        at: number;
        display_name: string | null;
      }>(
        `SELECT f.kind, f.species, f.user_id, f.at, p.display_name
         FROM server_firsts f LEFT JOIN players p ON p.user_id = f.user_id
         WHERE f.kind != 'jackpot'
         ORDER BY f.at, f.kind, f.species, f.user_id`,
      )
      .toArray();
    const groups = new Map<string, ServerFirstView>();
    for (const row of rows) {
      const key = `${row.kind}:${row.species}`;
      let group = groups.get(key);
      if (group === undefined) {
        group = { kind: row.kind, species: row.species, at: row.at, mine: false, holders: [] };
        groups.set(key, group);
      }
      group.holders.push(row.display_name ?? 'Unknown');
      if (row.user_id === userId) group.mine = true;
    }
    return [...groups.values()];
  }

  /** Everything the Activity needs to draw the player's game. Never includes other players' creatures. */
  state(userId: string): PlayerState {
    const starterChosen = this.starterSpecies(userId) !== null;
    const balances = getBalances(this.sql, userId);
    const parts = getParts(this.sql, userId);
    const trips = this.trips.state(userId);
    const worn = equippedByCreature(this.sql, userId);
    const books = booksByCreature(this.sql, userId);
    const jobs = openJobsByCreature(this.sql, userId);
    const rows = this.creatureRows(userId);
    const explorers = this.trips.explorerViews(
      userId,
      rows.map((row) => row.id),
    );
    return {
      serverNow: this.deps.now(),
      balances,
      starterChosen,
      ...(starterChosen
        ? {}
        : { starterOptions: content.creatures.filter((c) => c.starter).map((c) => c.id) }),
      creatures: rows.map((row) =>
        this.creatureView(
          row,
          balances.essence,
          parts,
          worn.get(row.id),
          jobs.get(row.id),
          explorers.get(row.id) as ExplorerView,
          books.get(row.id),
        ),
      ),
      pending: this.choices.pending(userId),
      bookSlotBait: RULES.talents.bookSlotBait,
      expeditions: trips.expeditions,
      cancelled: trips.cancelled,
      levelReset: pendingLevelReset(this.sql, userId),
      slots: trips.slots,
      supplies: trips.supplies,
      serverFirsts: this.serverFirsts(userId),
      loungerId: this.lounge.resolve(userId),
      loungeSpot: this.lounge.spot(userId),
    };
  }

  /** Dismisses the one-time level reset card (repeats change nothing). */
  dismissLevelReset(userId: string): void {
    dismissLevelReset(this.sql, userId, this.deps.now());
  }

  // --- Starter ---

  /**
   * Picks the starter (once per player). Not a "catch": it does not create a first-on-server
   * record. The caller has already checked that `species` is a starter.
   */
  chooseStarter(userId: string, speciesId: string): Outcome<{ creatureId: string }> {
    return this.atomically(() => {
      const species = speciesOf(speciesId);
      if (!species.starter) throw new GameError(400, 'invalid_species');
      if (this.starterSpecies(userId) !== null) {
        throw new GameError(409, 'starter_already_chosen');
      }
      const { id: creatureId } = insertCreature(
        this.sql,
        { quirk: this.deps.quirkRng, talent: this.deps.talentRng },
        { userId, species: species.id, origin: 'starter', now: this.deps.now() },
        this.deps.analytics,
      );
      this.sql.exec(
        `INSERT INTO player_progress (user_id, starter_species) VALUES (?, ?)
         ON CONFLICT(user_id) DO UPDATE SET starter_species = excluded.starter_species`,
        userId,
        species.id,
      );
      this.deps.analytics?.record({ kind: 'starter_chosen', species: species.id }, userId);
      return { creatureId };
    });
  }

  // --- Expeditions ---

  /** Sends a creature on an expedition (see `Expeditions.send`). */
  startExpedition(userId: string, input: SendInput, timezone: string): Outcome<ExpeditionView> {
    return this.trips.send(userId, input, timezone);
  }

  /** Claims (or recalls) an expedition (see `Expeditions.claim`). */
  claimExpedition(userId: string, expeditionId: string): Outcome<ExpeditionResult> {
    return this.trips.claim(userId, expeditionId);
  }

  /** See `recordServerFirst`. Returns true if this user holds the record now. */
  private recordFirst(
    kind: ServerFirstKind,
    species: string,
    userId: string,
    dropId: string,
    at: number,
  ): boolean {
    return recordServerFirst(this.sql, kind, species, userId, dropId, at);
  }

  // --- Ribbons ---

  /**
   * Earns the ribbon a creature waits for (at level 10 the Bronze Ribbon, at level 20 the Silver Ribbon):
   * the parts are taken, the ribbon is recorded and the experience the creature banked while it waited
   * is spent at once, all in one transaction. Idempotent: a retry with the same key returns the stored
   * result and takes nothing. Materials only: scrap, shards of the creature's element, glimmer and, for
   * Silver, finished trips of the creature itself.
   */
  ribbon(userId: string, creatureId: string, idempotencyKey: string): Outcome<RibbonResult> {
    return this.atomically(() =>
      runKeyed(
        this.sql,
        this.deps.now,
        { userId, key: idempotencyKey, kind: 'ribbon', fingerprint: creatureId },
        () => {
          const creature = this.ownedCreature(userId, creatureId);
          const def = ribbonNeeded(creature.level, creature.ribbons);
          if (def === null) throw new GameError(409, 'ribbon_not_needed');
          const trips = this.trips.explorerView(userId, creature.id).trips;
          if (trips < def.trips) throw new GameError(409, 'ribbon_needs_trips', String(def.trips));
          const cost = ribbonParts(def, speciesOf(creature.species).element);
          if (!debitParts(this.sql, userId, cost)) throw new GameError(409, 'insufficient_parts');
          this.sql.exec('UPDATE creatures SET ribbons = ribbons + 1 WHERE id = ?', creature.id);
          this.deps.analytics?.record(
            { kind: 'ribbon', species: creature.species, ribbon: def.id },
            userId,
          );
          const experience = settleExperience(
            this.sql,
            this.deps.analytics,
            userId,
            creature.id,
            'ribbon',
          );
          return { creatureId: creature.id, ribbon: def.id, experience };
        },
      ),
    );
  }

  // --- Evolution ---

  /**
   * Evolves a stage-1 creature at its evolution level for Essence. The species switches to the
   * stage-2 species; level, fusion, shininess, nickname and quirk stay. The first evolution of a line on
   * the server records "first on server" (kind `evolve`, keyed by the stage-2 species). A retry
   * with the same key returns the stored result and charges nothing.
   */
  evolve(
    userId: string,
    creatureId: string,
    idempotencyKey: string,
  ): Outcome<{ creatureId: string; species: string; firstOnServer: boolean }> {
    return this.atomically(() => {
      const creature = this.ownedCreature(userId, creatureId);
      const prior = lookupSpend(this.sql, userId, idempotencyKey);
      let amount: number;
      let target: string | null = null;
      if (prior === null) {
        const evolvesTo = speciesOf(creature.species).evolvesTo;
        if (evolvesTo === undefined) throw new GameError(409, 'not_evolvable');
        if (creature.level < evolvesTo.level) throw new GameError(409, 'level_too_low');
        amount = evolvesTo.essence;
        target = evolvesTo.species;
      } else {
        // A retry is not re-checked: the creature has already evolved.
        amount = prior.amount;
      }
      const now = this.deps.now();
      const spent = spend(
        this.deps.storage,
        {
          userId,
          currency: 'essence',
          amount,
          purpose: 'evolution',
          idempotencyKey,
          apply: () => {
            if (target === null) throw new Error('evolution without a target');
            this.sql.exec('UPDATE creatures SET species = ? WHERE id = ?', target, creature.id);
            // The higher level cap opens the way: what the creature banked while it waited is spent now.
            settleExperience(this.sql, this.deps.analytics, userId, creature.id, 'evolve');
            const firstOnServer = this.recordFirst(
              'evolve',
              target,
              userId,
              `evolve:${creature.id}`,
              now,
            );
            this.deps.analytics?.record(
              { kind: 'evolve', from: creature.species, to: target, cost: amount },
              userId,
            );
            return { creatureId: creature.id, species: target, firstOnServer };
          },
        },
        now,
      );
      return settleSpend(
        spent,
        (stored) =>
          prior?.purpose === 'evolution' && storedString(stored, 'creatureId') === creature.id,
      );
    });
  }

  // --- Nicknames ---

  /** `null` or empty clears the nickname. Only the sanitised text is stored. */
  setNickname(
    userId: string,
    creatureId: string,
    raw: string | null,
  ): Outcome<{ nickname: string | null }> {
    return this.atomically(() => {
      const creature = this.ownedCreature(userId, creatureId);
      let value: string | null = null;
      if (raw !== null) {
        const clean = sanitizeNickname(raw);
        if (!clean.ok) throw new GameError(400, 'invalid_nickname', clean.reason);
        value = clean.value;
      }
      this.sql.exec('UPDATE creatures SET nickname = ? WHERE id = ?', value, creature.id);
      return { nickname: value };
    });
  }
}

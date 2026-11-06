/**
 * The valley's lazy pass on the server (phase 5 step 1, docs/design/valley/systems/posts.md V-POST-14, bonfire.md V-BON-1, 3): a
 * player's valley is computed from timestamps when the player looks, in one pass, by the pure `settle` of `@creatures/game`. Nothing
 * runs on a timer and nothing here is read for any player but the caller (the caller is always the session's user).
 *
 * What a pass does, for the calling player only, in one transaction:
 * - every creature earns idle XP for the time since the last pass (V-BON-1: at the fire or at a post the rate is the same; the away
 *   steps of V-POST-10 count from the last visit), paid through the game's own `addExperience` (level, bank, cap). With the valley
 *   on the ribbon gates are open (each creature touched holds every ribbon), so only the species' level cap stops a level;
 * - the allowance builds in its store (V-POST-5). There is no collect button: the store comes home on arrival (a new visit, after
 *   `VISIT_GAP_MS` without one), and during a long visit whenever it holds a day's worth, so a client that never closes cannot lose
 *   it to the cap. It is paid to the Bait ledger (the Acorns' internal id) under a key that is unique to the pass;
 * - the player is visiting: `last_visit_at` becomes now, which restarts the away steps (V-POST-10);
 * - scouts (step 2): each seat with a creature picks effective hours up into its store (V-POST-5, V-SCOUT-4) by place profile, fit,
 *   mastery, kit, opening hours and the week's twist (the pure part is `settle` and `seatRates` in `@creatures/game`). Scrap and shards
 *   are expected values with a carry; creatures arrive at once (a newcomer joins the roster, a duplicate waits at the Paddock gate) and
 *   gear, blueprint and page finds are counted per stretch, all as live draws at the moment of settling (`valley-finds.ts`). The
 *   store comes home on arrival (a new visit) and mid-visit when it holds a day's worth, like the allowance; there is no collect
 *   button. The gate's duplicates take Recommended by themselves after a day (`autoAnswerDue`).
 *
 * Where it runs (`guild-core.ts`): in `GET /api/state`, always; before an intent (any request that is not a read) when the last pass
 * is `INTENT_MIN_MS` old or older, since a creature that joins in between is not paid before it joined (`joinedAt`), so the short
 * skip costs nothing but a minute of a released creature's XP. Never when looking at someone else's data.
 *
 * Settling twice at the same `now` changes nothing: the second pass starts where the first stopped and has no time to pay.
 */
import {
  KIT_NAMES,
  VALLEY_ELEMENTS,
  VALLEY_RULES,
  anvilLimit,
  anvilPrice,
  anvilSpeed,
  addExperience,
  expToReach,
  masteryBonus,
  placeIds,
  placeOpen,
  placeProfile,
  pieceHours,
  seatLimit,
  seatPrice,
  seatRates,
  settle,
  MAX_RIBBONS,
  SCOUT_KITS,
  type AnvilKit,
  type PlaceProfile,
  type ScoutKit,
  type SettleSeat,
  type SettleState,
  type ValleyAnvilView,
  type ValleySeatView,
  type ValleyView,
} from '@creatures/game';
import type { CatchChoices } from './catch-choices';
import { bagItems, trackBag } from './gear-store';
import { credit, type LedgerStorage } from './ledger';
import { speciesOf } from './species';
import {
  ANVIL_COLUMNS,
  FIRE_LEVEL,
  FORGE_LEVEL,
  orderView,
  type AnvilColumns,
  type ValleyForgePass,
} from './valley-forge';
import { hasDeepArea, type ValleyFinds } from './valley-finds';
import { PaperRecorder, paperItem, type ValleyGazette } from './valley-gazette';
import { scoutClock, specialOfWeek, worldAt } from './valley-world';

/** Without a request for this long, the next one is a new visit: the "+N" starts again and the allowance store comes home. */
export const VISIT_GAP_MS = 30 * 60_000;
/**
 * A pass is skipped when the last one is younger than this (an intent skips before even reading the creatures; a state read
 * answers from what is stored): looking again within a minute would write every creature's carry for under an XP. Splitting is
 * invariant, so nothing is lost; a visit inside the minute is recorded by the next pass.
 */
export const INTENT_MIN_MS = 60_000;
/** The ledger source of the idle allowance (the same Bait as the old daily claim; that claim is off with the valley on). */
export const VALLEY_ALLOWANCE_SOURCE = 'allowance';

const HOUR_MS = 3_600_000;
/** Basis points of a multiplier of 1. */
const BP = 10_000;

type PlayerRow = {
  settled_at: number;
  last_visit_at: number;
  hearth_at_visit_bp: number;
  visit_started_at: number;
  allowance_store: number;
  allowance_carry: number;
  visit_allowance: number;
  first_scout_done: number;
  forge_carry: number;
};

type CreatureRow = {
  id: string;
  species: string;
  level: number;
  exp: number;
  ribbons: number;
  caught_at: number;
  tracked: string | null;
  xp_carry: number | null;
  catchup_bp: number | null;
  visit_xp: number | null;
  scout_hours: number | null;
  smith_hours: number | null;
};

export type SeatRow = AnvilColumns & {
  seat_id: string;
  position: number;
  destination_id: string;
  prev_destination_id: string | null;
  creature_id: string | null;
  kit_id: string | null;
  store_hours: number;
  scrap: number;
  scrap_carry: number;
  shards: number;
  shard_carry: number;
  gear_finds: number;
  blueprint_finds: number;
  page_finds: number;
  /** V-SCOUT-6: the scout is in the destination's deeper area (1) or not (0). */
  deep: number;
};

/** The Signpost's level until the commons (step 6) can raise it: it bounds the seats (V-COM-10). */
export const SIGNPOST_LEVEL = 1;
/** The seat columns the pass and the routes read. */
export const SEAT_COLUMNS = `seat_id, position, destination_id, prev_destination_id, creature_id, kit_id, store_hours, scrap,
  scrap_carry, shards, shard_carry, gear_finds, blueprint_finds, page_finds, deep, ${ANVIL_COLUMNS}`;

/** The store's size in Acorns (V-POST-5: `storeHours` of the hourly rate). */
export const allowanceCap = (): number =>
  Math.floor((VALLEY_RULES.acorns.allowancePerDay / 24) * VALLEY_RULES.posts.storeHours + 1e-9);

export interface ValleySettleDeps {
  readonly storage: LedgerStorage;
  readonly now: () => number;
  /** The guild's timezone: night, festival weeks and the week's twist follow its calendar. */
  readonly timezone: () => string;
  /** The live draws of finds (`crypto` in production). */
  readonly finds: ValleyFinds;
  /** The Paddock gate's cards (duplicates). */
  readonly choices: CatchChoices;
  /** The anvils' part of the pass: orders, the shelf, the floors and the live rarity draws. */
  readonly forge: ValleyForgePass;
  /** The Gazette's last paper of each player (`valley-gazette.ts`): an arrival's pass writes it. */
  readonly gazette: ValleyGazette;
}

const masteryStep = (hours: number): 0 | 1 | 2 | 3 => {
  let step = 0;
  for (const m of VALLEY_RULES.posts.mastery) if (hours + 1e-9 >= m.hours) step += 1;
  return Math.min(3, step) as 0 | 1 | 2 | 3;
};

const kitOfRow = (kit: string | null): ScoutKit | null =>
  kit !== null && (SCOUT_KITS as readonly string[]).includes(kit) ? (kit as ScoutKit) : null;
const anvilKitOfRow = (kit: string | null): AnvilKit | null =>
  kit === 'tongs' || kit === 'loupe' ? kit : null;

export class ValleySettle {
  constructor(private readonly deps: ValleySettleDeps) {
    // The bag is a stored counter of the items not worn (V-GEAR-6): every gear insert, delete and equip keeps it in step from now on.
    trackBag(deps.storage.sql);
  }

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  /**
   * Settles the player's valley up to now and returns what the Bonfire and the Signpost show. `intent` passes before a request that
   * changes something: it may skip (returns null) when the last pass was a moment ago. `now` (the valley routes' own settle) never skips.
   */
  settle(userId: string, mode: 'state' | 'intent' | 'now' = 'state'): ValleyView | null {
    const now = this.deps.now();
    return this.deps.storage.transactionSync(() => {
      const player = this.sql
        .exec<PlayerRow>(
          `SELECT settled_at, last_visit_at, hearth_at_visit_bp, visit_started_at, allowance_store,
                  allowance_carry, visit_allowance, first_scout_done, forge_carry FROM valley_players WHERE user_id = ?`,
          userId,
        )
        .toArray()[0];
      if (mode === 'intent' && player !== undefined && now - player.settled_at < INTENT_MIN_MS) {
        return null;
      }
      return this.pass(userId, now, player, mode === 'now');
    });
  }

  private creatureRows(userId: string): CreatureRow[] {
    return this.sql
      .exec<CreatureRow>(
        `SELECT c.id, c.species, c.level, c.exp, c.ribbons, c.caught_at, v.creature_id AS tracked,
                v.xp_carry, v.catchup_bp, v.visit_xp, v.scout_hours, v.smith_hours
         FROM creatures c LEFT JOIN valley_creatures v ON v.creature_id = c.id
         WHERE c.user_id = ? ORDER BY c.caught_at, c.rowid`,
        userId,
      )
      .toArray();
  }

  /** The player's seats: the scouts' at the Signpost and the smiths' anvils at the Forge, each in the order bought. */
  seats(userId: string): { scouts: SeatRow[]; anvils: SeatRow[] } {
    const all = this.sql
      .exec<SeatRow>(
        `SELECT ${SEAT_COLUMNS} FROM valley_seats WHERE user_id = ? ORDER BY position`,
        userId,
      )
      .toArray();
    return {
      scouts: all.filter((seat) => seat.place === 'signpost'),
      anvils: all.filter((seat) => seat.place === 'forge'),
    };
  }

  private ownedKit(userId: string): (typeof KIT_NAMES)[number][] {
    return this.sql
      .exec<{ kit_id: string }>(
        'SELECT kit_id FROM valley_kit WHERE user_id = ? ORDER BY bought_at, kit_id',
        userId,
      )
      .toArray()
      .flatMap((r) => {
        const kit = (KIT_NAMES as readonly string[]).includes(r.kit_id)
          ? (r.kit_id as (typeof KIT_NAMES)[number])
          : null;
        return kit === null ? [] : [kit];
      });
  }

  private pass(
    userId: string,
    now: number,
    player: PlayerRow | undefined,
    force: boolean,
  ): ValleyView {
    const cap = allowanceCap();
    if (player === undefined) {
      // The first pass of a player: the valley opens now, nothing is owed for the time before.
      this.sql.exec(
        `INSERT INTO valley_players (user_id, settled_at, last_visit_at, hearth_at_visit_bp, visit_started_at)
         VALUES (?, ?, ?, ?, ?)`,
        userId,
        now,
        now,
        BP,
        now,
      );
      const rows = this.creatureRows(userId);
      for (const row of rows) this.trackCreature(userId, row.id, 0, BP, 0, 0, 0);
      const seats = this.seats(userId);
      return this.view({
        userId,
        to: now,
        arrived: true,
        awayHours: 0,
        rows,
        seats: seats.scouts,
        anvils: seats.anvils,
        creatures: rows.map((row) => ({ row, gained: 0, catchUpBp: BP })),
        allowance: { store: 0, cap, brought: 0 },
      });
    }
    // A clock that went back (the dev clock) settles nothing; the view is what is stored.
    const to = Math.max(now, player.settled_at);
    const newVisit = to - player.last_visit_at >= VISIT_GAP_MS;
    if (!force && to - player.settled_at < INTENT_MIN_MS && !newVisit) {
      const rows = this.creatureRows(userId);
      const seats = this.seats(userId);
      return this.view({
        userId,
        to: player.settled_at,
        arrived: false,
        awayHours: 0,
        rows,
        seats: seats.scouts,
        anvils: seats.anvils,
        creatures: rows.map((row) => ({
          row,
          gained: row.visit_xp ?? 0,
          catchUpBp: row.catchup_bp ?? BP,
        })),
        allowance: { store: player.allowance_store, cap, brought: player.visit_allowance },
      });
    }
    // The Paddock gate: duplicates whose day is up take their Recommended answer first (V-SCOUT-3).
    this.deps.choices.autoAnswerDue(userId, to);
    const rows = this.creatureRows(userId);
    const { scouts: seatRows, anvils: anvilRows } = this.seats(userId);
    const tz = this.deps.timezone();
    const indexOf = new Map(rows.map((row, i) => [row.id, i]));
    const rowOf = new Map(rows.map((row) => [row.id, row]));
    const seatsIn: SettleSeat[] = seatRows.map((seat, i) => {
      const worker = seat.creature_id === null ? undefined : rowOf.get(seat.creature_id);
      const place = placeProfile(VALLEY_RULES, seat.destination_id);
      return {
        id: seat.seat_id,
        creature: seat.creature_id === null ? -1 : (indexOf.get(seat.creature_id) ?? -1),
        destination: seat.destination_id,
        kit: kitOfRow(seat.kit_id),
        fit: fitOf(worker, place),
        second: seatRows.slice(0, i).some((o) => o.destination_id === seat.destination_id),
        deep: seat.deep === 1,
        storeHours: seat.store_hours,
        scrap: seat.scrap,
        scrapCarry: seat.scrap_carry,
        shards: seat.shards,
        shardCarry: seat.shard_carry,
      };
    });
    const team = rows.map((row) => ({ id: row.id, species: row.species, level: row.level }));
    const forgeIn = this.deps.forge.load(userId, anvilRows, team, indexOf);
    const before: SettleState = {
      settledAt: player.settled_at,
      lastVisitAt: player.last_visit_at,
      hearth: player.hearth_at_visit_bp / BP,
      creatures: rows.map((row) => ({
        xp: 0,
        carry: row.xp_carry ?? 0,
        capXp: Number.POSITIVE_INFINITY,
        catchUp: (row.catchup_bp ?? BP) / BP,
        scoutHours: row.scout_hours ?? 0,
        smithHours: row.smith_hours ?? 0,
        ...(row.tracked === null ? { joinedAt: row.caught_at } : {}),
      })),
      allowance: { store: player.allowance_store, carry: player.allowance_carry },
      seats: seatsIn,
      ...(forgeIn === null ? {} : { forge: { ...forgeIn.forge, scrapCarry: player.forge_carry } }),
    };
    const watchNight = seatRows.some(
      (seat) => placeProfile(VALLEY_RULES, seat.destination_id)?.night === true,
    );
    const after = settle(
      before,
      player.settled_at,
      to,
      [{ at: to, kind: 'visit', hearth: player.hearth_at_visit_bp / BP }],
      {
        ...(seatRows.length === 0 ? {} : { world: scoutClock(tz, watchNight) }),
        ...(forgeIn === null ? {} : { rng: this.deps.forge.rng }),
      },
    );

    // The Gazette's log of this arrival (V-POST-14): only an arrival tells a paper, so a pass in the middle of a visit records nothing.
    const rec = newVisit ? new PaperRecorder() : undefined;
    let visitAllowance = newVisit ? 0 : player.visit_allowance;
    let store = after.allowance?.store ?? 0;
    const carry = after.allowance?.carry ?? 0;
    if (newVisit || store >= VALLEY_RULES.acorns.allowancePerDay) {
      if (store > 0) {
        const applied = credit(
          this.deps.storage,
          {
            userId,
            currency: 'bait',
            amount: store,
            source: VALLEY_ALLOWANCE_SOURCE,
            idempotencyKey: `valley-allowance:${String(to)}`,
            meta: { arrival: newVisit },
          },
          now,
        ).applied;
        if (applied) {
          visitAllowance += store;
          if (newVisit) rec?.acorns(store);
          store = 0;
        }
      }
    }

    // Scouts: the live draws of the stretches, then each store that is due comes home.
    const seatsOut = this.scoutFinds(userId, to, newVisit, player, seatRows, after, rowOf, tz, rec);

    // The Forge: what the anvils did is written back, then the floors come home when it is time (an arrival, or a floor that filled).
    let anvilsOut: readonly SeatRow[] = anvilRows;
    let piecesHome = 0;
    if (forgeIn !== null) {
      anvilsOut = this.deps.forge.save(userId, to, forgeIn, after);
      const capFloor = VALLEY_RULES.forge.floorPiecesPerAnvil;
      const floorDue = newVisit || anvilsOut.some((a) => a.floor_count >= capFloor);
      if (floorDue && anvilsOut.some((a) => a.floor_count > 0)) {
        const home = this.deps.forge.collect(userId, to, team, VALLEY_RULES.forge.bag);
        piecesHome = home.brought;
        if (home.items.length > 0) {
          const smith = anvilRows.find((a) => a.seat_id === home.firstSeat)?.creature_id ?? null;
          rec?.forgePieces(home.items.map(paperItem), smith);
        }
        if (home.counts.size > 0) {
          for (const [seatId, n] of home.counts) {
            this.sql.exec(
              'UPDATE valley_seats SET floor_count = MAX(0, floor_count - ?) WHERE seat_id = ?',
              n,
              seatId,
            );
          }
          anvilsOut = anvilsOut.map((a) => ({
            ...a,
            floor_count: Math.max(0, a.floor_count - (home.counts.get(a.seat_id) ?? 0)),
          }));
        }
      }
    }
    void piecesHome;

    const seated = new Set(
      [...seatRows, ...anvilRows].flatMap((seat) =>
        seat.creature_id === null ? [] : [seat.creature_id],
      ),
    );
    const creatures = rows.map((row, i) => {
      const paid = after.creatures[i];
      const whole = paid?.xp ?? 0;
      const paidXp = this.payXp(row, whole);
      const gainedNow = paidXp.taken;
      const visitXp = (newVisit ? 0 : (row.visit_xp ?? 0)) + gainedNow;
      const catchUpBp = row.catchup_bp ?? BP;
      const scoutHours = paid?.scoutHours ?? 0;
      const smithHours = paid?.smithHours ?? 0;
      if (rec !== undefined) {
        // Mastery steps reached while away (V-POST-12) and the resting creatures' best XP (V-BON-1).
        const scoutStep = masteryStep(scoutHours);
        const smithStep = masteryStep(smithHours);
        if (scoutStep > masteryStep(row.scout_hours ?? 0) && scoutStep >= 1) {
          rec.mastery('scout', row.id, scoutStep as 1 | 2 | 3);
        }
        if (smithStep > masteryStep(row.smith_hours ?? 0) && smithStep >= 1) {
          rec.mastery('anvil', row.id, smithStep as 1 | 2 | 3);
        }
        if (!seated.has(row.id)) rec.xp(row.id, gainedNow, paidXp.level - row.level);
      }
      const changed =
        row.tracked === null ||
        whole > 0 ||
        newVisit ||
        (paid?.carry ?? 0) !== (row.xp_carry ?? 0) ||
        scoutHours !== (row.scout_hours ?? 0) ||
        smithHours !== (row.smith_hours ?? 0);
      if (changed) {
        this.trackCreature(
          userId,
          row.id,
          paid?.carry ?? 0,
          catchUpBp,
          visitXp,
          scoutHours,
          smithHours,
        );
      }
      return {
        row: { ...row, scout_hours: scoutHours, smith_hours: smithHours },
        gained: visitXp,
        catchUpBp,
      };
    });

    if (rec !== undefined) {
      const awayHours = Math.floor((to - player.last_visit_at) / HOUR_MS);
      // One resting creature's small moment (V-BON-9, cheap): the day picks who and which, so a reload tells the same one.
      const resting = rows.filter((row) => !seated.has(row.id));
      const day = Math.floor(to / (24 * HOUR_MS));
      const rester = resting[day % Math.max(1, resting.length)];
      if (rester !== undefined) rec.moment(rester.id, day);
      // V-SCOUT-6, V-RET-3: an Expert scout may have found a way deeper; the paper offers it as its one decision.
      const hoursOf = new Map<string, number>();
      for (const stretch of after.stretches ?? []) {
        hoursOf.set(stretch.seat, (hoursOf.get(stretch.seat) ?? 0) + stretch.hours);
      }
      const expert = new Set(
        creatures.flatMap((c) =>
          masteryStep(c.row.scout_hours ?? 0) >= VALLEY_RULES.scouts.pushOn.minStep
            ? [c.row.id]
            : [],
        ),
      );
      const candidates = seatsOut.rows.flatMap((seat) =>
        seat.creature_id !== null &&
        seat.deep === 0 &&
        expert.has(seat.creature_id) &&
        hasDeepArea(seat.destination_id)
          ? [{ seatId: seat.seat_id, hours: hoursOf.get(seat.seat_id) ?? 0 }]
          : [],
      );
      const way = this.deps.finds.wayDeeper(candidates);
      const found = seatsOut.rows.find((seat) => seat.seat_id === way);
      this.deps.gazette.publish(
        userId,
        to,
        awayHours,
        rec.log,
        found === undefined || found.creature_id === null
          ? null
          : {
              kind: 'push-on',
              seatId: found.seat_id,
              creatureId: found.creature_id,
              destination: found.destination_id,
            },
      );
    }
    if (newVisit) {
      // Creatures that left the roster (released, fused) leave their rows too; once a visit is enough.
      this.sql.exec(
        `DELETE FROM valley_creatures WHERE user_id = ? AND creature_id NOT IN
           (SELECT id FROM creatures WHERE user_id = ?)`,
        userId,
        userId,
      );
    }
    this.sql.exec(
      `UPDATE valley_players SET settled_at = ?, last_visit_at = ?, visit_started_at = ?, allowance_store = ?,
         allowance_carry = ?, visit_allowance = ?, first_scout_done = ?, forge_carry = ? WHERE user_id = ?`,
      to,
      to,
      newVisit ? to : player.visit_started_at,
      store,
      carry,
      visitAllowance,
      seatsOut.firstDone ? 1 : player.first_scout_done,
      after.forge?.scrapCarry ?? player.forge_carry,
      userId,
    );
    // A newcomer from a scout is on the roster already: show it at the fire in this very answer.
    const known = new Set(rows.map((row) => row.id));
    const all = seatsOut.newcomers > 0 ? this.creatureRows(userId) : rows;
    const extra = all
      .filter((row) => !known.has(row.id))
      .map((row) => ({ row, gained: 0, catchUpBp: BP }));
    return this.view({
      userId,
      to,
      arrived: newVisit,
      awayHours: newVisit ? Math.floor((to - player.last_visit_at) / HOUR_MS) : 0,
      rows: [...creatures.map((c) => c.row), ...extra.map((c) => c.row)],
      seats: seatsOut.rows,
      anvils: anvilsOut,
      fullSeats: seatsOut.full,
      creatures: [...creatures, ...extra],
      allowance: { store, cap, brought: visitAllowance },
    });
  }

  /**
   * The scouts' part of a pass: draws the stretches' finds live, writes each seat's store, brings a store home when it is due (on
   * arrival, or a day's worth mid-visit, or before the Festival Grounds close under a scout) and walks a scout back from a closed place.
   */
  private scoutFinds(
    userId: string,
    to: number,
    newVisit: boolean,
    player: PlayerRow,
    seatRows: readonly SeatRow[],
    after: SettleState,
    rowOf: ReadonlyMap<string, CreatureRow>,
    tz: string,
    rec: PaperRecorder | undefined,
  ): { rows: SeatRow[]; newcomers: number; firstDone: boolean; full: ReadonlySet<string> } {
    if (seatRows.length === 0) {
      return { rows: [], newcomers: 0, firstDone: false, full: new Set() };
    }
    const world = worldAt(tz, to);
    const stretches = after.stretches ?? [];
    const kitOf = (seatId: string): string | null =>
      seatRows.find((seat) => seat.seat_id === seatId)?.kit_id ?? null;
    const creatureOf = (seatId: string): string | null =>
      seatRows.find((seat) => seat.seat_id === seatId)?.creature_id ?? null;
    const heldHours = (after.seats ?? []).reduce((sum, seat) => sum + seat.storeHours, 0);
    const guarantee =
      player.first_scout_done === 0 &&
      stretches.length > 0 &&
      heldHours >= VALLEY_RULES.scouts.firstFindHours;
    const drawn =
      stretches.length === 0
        ? null
        : this.deps.finds.draw(
            userId,
            stretches,
            {
              kitOf,
              guarantee,
              ...(rec === undefined
                ? {}
                : { paper: { rec, byOf: (seatId: string) => creatureOf(seatId) } }),
            },
            to,
          );
    const arrivals = drawn?.arrivals ?? { newcomers: 0, duplicates: 0 };
    const out: SeatRow[] = [];
    const fullSeats = new Set<string>();
    for (const [i, row] of seatRows.entries()) {
      const pure = after.seats?.[i];
      const more = drawn?.stores.get(row.seat_id);
      let next: SeatRow = {
        ...row,
        store_hours: pure?.storeHours ?? row.store_hours,
        scrap: pure?.scrap ?? row.scrap,
        scrap_carry: pure?.scrapCarry ?? row.scrap_carry,
        shards: pure?.shards ?? row.shards,
        shard_carry: pure?.shardCarry ?? row.shard_carry,
        gear_finds: row.gear_finds + (more?.gear ?? 0),
        blueprint_finds: row.blueprint_finds + (more?.blueprints ?? 0),
        page_finds: row.page_finds + (more?.pages ?? 0),
      };
      const place = placeProfile(VALLEY_RULES, row.destination_id);
      const closed = place !== undefined && !placeOpen(place, world);
      const waiting =
        next.scrap > 0 ||
        next.shards > 0 ||
        next.gear_finds > 0 ||
        next.blueprint_finds > 0 ||
        next.page_finds > 0;
      // A pack that filled during a long visit comes home too, so a client that never closes cannot lose finds to the cap.
      const wasFull = next.store_hours >= VALLEY_RULES.posts.storeHours - 1e-9;
      if (wasFull) {
        fullSeats.add(row.seat_id);
        rec?.packFull(row.creature_id);
      }
      const due = wasFull || ((newVisit || closed) && (waiting || next.store_hours > 0));
      if (place !== undefined && due) {
        const worker = row.creature_id === null ? undefined : rowOf.get(row.creature_id);
        this.deps.finds.collect(
          userId,
          row.seat_id,
          place,
          {
            scrap: next.scrap,
            shards: next.shards,
            gear: next.gear_finds,
            blueprints: next.blueprint_finds,
            pages: next.page_finds,
          },
          worker?.level ?? 1,
          to,
          rec === undefined ? undefined : { rec, by: row.creature_id },
        );
        next = {
          ...next,
          store_hours: 0,
          scrap: 0,
          shards: 0,
          gear_finds: 0,
          blueprint_finds: 0,
          page_finds: 0,
        };
      }
      // V-SCOUT-8: a scout at a place that has closed walks back to the last open place by itself.
      if (closed) {
        next = { ...next, destination_id: row.prev_destination_id ?? 'tidepools', deep: 0 };
      }
      out.push(next);
      if (JSON.stringify(next) !== JSON.stringify(row)) {
        this.sql.exec(
          `UPDATE valley_seats SET destination_id = ?, store_hours = ?, scrap = ?, scrap_carry = ?, shards = ?,
             shard_carry = ?, gear_finds = ?, blueprint_finds = ?, page_finds = ?, deep = ?, passed_at = ? WHERE seat_id = ?`,
          next.destination_id,
          next.store_hours,
          next.scrap,
          next.scrap_carry,
          next.shards,
          next.shard_carry,
          next.gear_finds,
          next.blueprint_finds,
          next.page_finds,
          next.deep,
          to,
          row.seat_id,
        );
      }
    }
    return {
      rows: out,
      newcomers: arrivals.newcomers,
      firstDone: arrivals.newcomers + arrivals.duplicates > 0,
      full: fullSeats,
    };
  }

  /** What `/api/state` carries: the creatures' places and the seats, the ladder, the kit and the places (V-RET-9). */
  private view(input: {
    userId: string;
    to: number;
    arrived: boolean;
    awayHours: number;
    rows: readonly CreatureRow[];
    seats: readonly SeatRow[];
    anvils: readonly SeatRow[];
    /** Seats whose pack was full when this pass found it (it came home, so the stored pack is empty). */
    fullSeats?: ReadonlySet<string>;
    creatures: readonly { row: CreatureRow; gained: number; catchUpBp: number }[];
    allowance: { store: number; cap: number; brought: number };
  }): ValleyView {
    const tz = this.deps.timezone();
    const world = worldAt(tz, input.to);
    const seatOf = new Map<string, { id: string; kind: 'scouting' | 'smithing' }>();
    for (const seat of input.seats) {
      if (seat.creature_id !== null)
        seatOf.set(seat.creature_id, { id: seat.seat_id, kind: 'scouting' });
    }
    for (const seat of input.anvils) {
      if (seat.creature_id !== null)
        seatOf.set(seat.creature_id, { id: seat.seat_id, kind: 'smithing' });
    }
    const rowOf = new Map(input.rows.map((row) => [row.id, row]));
    const rules = VALLEY_RULES;
    const seatViews: ValleySeatView[] = input.seats.map((seat, i) => {
      const worker = seat.creature_id === null ? undefined : rowOf.get(seat.creature_id);
      const place = placeProfile(rules, seat.destination_id);
      const kit = kitOfRow(seat.kit_id);
      const fit = fitOf(worker, place);
      const second = input.seats.slice(0, i).some((o) => o.destination_id === seat.destination_id);
      const hours = worker?.scout_hours ?? 0;
      const rates =
        place === undefined || worker === undefined
          ? null
          : seatRates(rules, {
              place,
              fit,
              masteryHours: hours,
              kit,
              second,
              world,
              deep: seat.deep === 1,
            });
      const room = Math.max(0, rules.posts.storeHours - seat.store_hours);
      const full = room <= 1e-9;
      return {
        id: seat.seat_id,
        destination: seat.destination_id,
        creatureId: seat.creature_id,
        kit,
        fit,
        second,
        deep: seat.deep === 1,
        mastery: {
          hours,
          step: masteryStep(hours),
          bonusBp: Math.round(masteryBonus(rules, hours + 1e-9) * BP),
        },
        store: {
          hours: seat.store_hours,
          capHours: rules.posts.storeHours,
          full,
          wasFull: input.fullSeats?.has(seat.seat_id) === true,
          fullInHours: rates === null || full ? null : room,
          scrap: seat.scrap,
          shards: seat.shards,
          gear: seat.gear_finds,
          blueprints: seat.blueprint_finds,
          pages: seat.page_finds,
        },
        perDay: {
          scrap: (rates?.scrap ?? 0) * 24,
          shards: (rates?.shards ?? 0) * 24,
          creatures: (rates?.creatures ?? 0) * 24,
          gear: (rates?.gear ?? 0) * 24,
          blueprints: (rates?.blueprints ?? 0) * 24,
          pages: (rates?.pages ?? 0) * 24,
        },
      };
    });
    const owned = input.seats.length;
    const ladder: number[] = [];
    for (let n = 0; n < seatLimit(rules, SIGNPOST_LEVEL); n++) {
      const price = seatPrice(rules, n, SIGNPOST_LEVEL);
      if (price !== null) ladder.push(price);
    }
    const special = specialOfWeek(tz, input.to);
    const paper = this.deps.gazette.current(input.userId);
    return {
      settledAt: input.to,
      arrived: input.arrived,
      awayHours: input.awayHours,
      creatures: input.creatures.map(({ row, gained, catchUpBp }) => {
        const at = seatOf.get(row.id);
        return {
          id: row.id,
          state: at === undefined ? ('resting' as const) : at.kind,
          gained,
          catchUpBp,
          seatId: at?.id ?? null,
        };
      }),
      allowance: input.allowance,
      seats: seatViews,
      ...this.forgeView(input, rowOf),
      seatPrices: {
        owned,
        max: seatLimit(rules, SIGNPOST_LEVEL),
        next: seatPrice(rules, owned, SIGNPOST_LEVEL),
        ladder,
      },
      kit: { owned: this.ownedKit(input.userId), price: rules.kit.price },
      places: placeIds(rules).flatMap((id) => {
        const place = placeProfile(rules, id);
        if (place === undefined) return [];
        return [
          {
            id,
            element: place.element,
            rich: place.rich,
            open: placeOpen(place, world),
            night: place.night,
            special: special.destination === id,
          },
        ];
      }),
      night: world.night,
      special: { destination: special.destination, twist: special.twist },
      ...(paper === null ? {} : { paper }),
    };
  }

  /**
   * Pays `whole` XP through the game's level rules with the ribbon gates open. Returns the XP the creature really took: less than
   * `whole` at the top level, or while it waits at its species' cap with the next level's XP already banked (before evolving), so
   * the fire's "+N" never shows XP that went nowhere.
   */
  private payXp(row: CreatureRow, whole: number): { taken: number; level: number } {
    if (whole === 0 && row.ribbons >= MAX_RIBBONS) return { taken: 0, level: row.level };
    const species = speciesOf(row.species);
    const gain = addExperience(
      { level: row.level, exp: row.exp, ribbons: MAX_RIBBONS, levelCap: species.levelCap },
      whole,
    );
    this.sql.exec(
      'UPDATE creatures SET level = ?, exp = ?, ribbons = ? WHERE id = ?',
      gain.level,
      gain.exp,
      gain.ribbons,
      row.id,
    );
    // Never below 0, even on a row holding more than its level's need (bad data the clamp would shrink).
    return {
      taken: Math.max(0, expToReach(gain.level) + gain.exp - (expToReach(row.level) + row.exp)),
      level: gain.level,
    };
  }

  private trackCreature(
    userId: string,
    creatureId: string,
    carry: number,
    catchUpBp: number,
    visitXp: number,
    scoutHours: number,
    smithHours: number,
  ): void {
    this.sql.exec(
      `INSERT INTO valley_creatures (creature_id, user_id, catchup_bp, xp_carry, visit_xp, scout_hours, smith_hours)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(creature_id) DO UPDATE SET xp_carry = excluded.xp_carry, visit_xp = excluded.visit_xp,
         catchup_bp = excluded.catchup_bp, scout_hours = excluded.scout_hours, smith_hours = excluded.smith_hours`,
      creatureId,
      userId,
      catchUpBp,
      carry,
      visitXp,
      scoutHours,
      smithHours,
    );
  }

  /** The anvils, their price ladder and the Forge's shelf, bag and exchange (the `anvils`, `anvilPrices` and `forge` of the view). */
  private forgeView(
    input: { userId: string; to: number; anvils: readonly SeatRow[] },
    rowOf: ReadonlyMap<string, CreatureRow>,
  ): Pick<ValleyView, 'anvils' | 'anvilPrices' | 'forge'> {
    const rules = VALLEY_RULES;
    const shelf = this.deps.forge.shelf(input.userId);
    const orders = input.anvils.length === 0 ? [] : this.deps.forge.orders(input.userId);
    const onFloor = new Map<string, [number, number, number]>();
    if (input.anvils.some((a) => a.floor_count > 0)) {
      for (const r of this.sql
        .exec<{ seat_id: string; rarity: number; n: number }>(
          'SELECT seat_id, rarity, COUNT(*) AS n FROM forge_floor WHERE user_id = ? GROUP BY seat_id, rarity',
          input.userId,
        )
        .toArray()) {
        const counts = onFloor.get(r.seat_id) ?? [0, 0, 0];
        counts[Math.min(2, Math.max(0, r.rarity))] = r.n;
        onFloor.set(r.seat_id, counts);
      }
    }
    const anvils: ValleyAnvilView[] = input.anvils.map((a) => {
      const worker = a.creature_id === null ? undefined : rowOf.get(a.creature_id);
      const hours = worker?.smith_hours ?? 0;
      const kit = anvilKitOfRow(a.kit_id);
      const mine = orders.filter((o) => o.seat_id === a.seat_id);
      const reason = worker === undefined ? null : a.wait_reason;
      const current = mine.find((o) => o.for_team === 1 || o.made < o.count);
      const plain = anvilSpeed(rules, hours, kit, 0);
      const speed = anvilSpeed(
        rules,
        hours,
        kit,
        a.piece_rarity === 1 ? 1 : a.piece_rarity === 2 ? 2 : 0,
      );
      const held = a.piece_active === 1 && a.piece_progress >= a.piece_need - 1e-6;
      const counts = onFloor.get(a.seat_id) ?? [0, 0, 0];
      return {
        id: a.seat_id,
        creatureId: a.creature_id,
        kit,
        mastery: {
          hours,
          step: masteryStep(hours),
          bonusBp: Math.round(masteryBonus(rules, hours + 1e-9) * BP),
        },
        orders: mine.map((o) => {
          const teamElement = a.wait_reason === 'shard' ? a.wait_element : -1;
          const seen = orderView(o, shelf, o.for_team === 1 ? teamElement : o.element);
          return {
            id: o.order_id,
            blueprintId: o.blueprint_id,
            forTeam: o.for_team === 1,
            count: o.count,
            made: o.made,
            reach: o.reach === 'rare' || o.reach === 'epic' ? o.reach : ('none' as const),
            needs: {
              scrap: seen.needs.scrap,
              shardElement: VALLEY_ELEMENTS[seen.needs.element] ?? null,
              shard: seen.needs.shard,
              essence: seen.needs.essence,
            },
            waiting: seen.waiting,
          };
        }),
        piece:
          a.piece_active === 1
            ? {
                orderId: a.piece_order,
                rarity: a.piece_rarity === 1 ? 1 : a.piece_rarity === 2 ? 2 : 0,
                progress: a.piece_progress,
                need: a.piece_need,
                leftHours:
                  held || worker === undefined
                    ? null
                    : Math.max(0, a.piece_need - a.piece_progress) / speed,
              }
            : null,
        tinkering:
          reason === null
            ? null
            : {
                reason: reason as 'idle' | 'scrap' | 'shard' | 'essence' | 'floor',
                shardElement: VALLEY_ELEMENTS[a.wait_element] ?? null,
                sinceHours:
                  a.wait_since === null ? null : Math.max(0, (input.to - a.wait_since) / HOUR_MS),
              },
        floor: {
          count: a.floor_count,
          cap: rules.forge.floorPiecesPerAnvil,
          full: a.floor_count >= rules.forge.floorPiecesPerAnvil,
          byRarity: counts,
        },
        perDay: {
          pieces:
            worker === undefined || current === undefined
              ? 0
              : (24 * plain) /
                pieceHours(
                  rules,
                  current.reach === 'rare' || current.reach === 'epic' ? current.reach : 'none',
                ),
        },
      };
    });
    const ladder: { acorns: number; scrap: number }[] = [];
    for (let n = 0; n < anvilLimit(rules, FORGE_LEVEL); n++) {
      const price = anvilPrice(rules, n, FORGE_LEVEL);
      if (price !== null) ladder.push(price);
    }
    const shards: Record<string, number> = {};
    for (const [e, element] of VALLEY_ELEMENTS.entries()) shards[element] = shelf.shards[e] ?? 0;
    return {
      anvils,
      anvilPrices: {
        owned: input.anvils.length,
        max: anvilLimit(rules, FORGE_LEVEL),
        next: anvilPrice(rules, input.anvils.length, FORGE_LEVEL),
        ladder,
      },
      forge: {
        shelf: { scrap: shelf.scrap, essence: shelf.essence, shards },
        bag: { count: bagItems(this.sql, input.userId), cap: rules.forge.bag },
        fireLevel: FIRE_LEVEL,
        exchange: {
          rate: rules.forge.exchange.rate,
          critBp: Math.round(rules.forge.exchange.critChance * BP),
          critYield: rules.forge.exchange.critYield,
        },
        queueMax: rules.forge.queueMax,
        orderCountMax: rules.forge.orderCountMax,
      },
    };
  }
}

/** V-POST-4: the posted creature's element is the place's (a mixed place likes no element). */
function fitOf(worker: { species: string } | undefined, place: PlaceProfile | undefined): boolean {
  return (
    worker !== undefined &&
    place !== undefined &&
    place.element !== null &&
    speciesOf(worker.species).element === place.element
  );
}

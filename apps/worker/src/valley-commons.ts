/**
 * The commons on the server (phase 5 step 6, docs/design/valley/systems/commons.md): the valley's places, their projects, the fire,
 * the collection boards and the keystone clocks. Pure rules are in `@creatures/game` (`valley/commons.ts`); this file keeps the rows.
 *
 * What it keeps, all behind `VALLEY_SYSTEMS` and all priced (`docs/design/database-reads.md`):
 * - **Places** (`valley_places`, one row each): a project is sized by the server's active weight when it opens (V-COM-5), never fails,
 *   decays or expires (V-COM-4), and builds for three days between levels, worked out from timestamps when read: the next project
 *   opens lazily the first time a read finds its time past (no timer). The guided start (V-COM-15) opens the hearth's project first,
 *   small enough for the server to finish early, then the Forge's, then the rest. At the max level the projects are cosmetic (V-COM-11).
 * - **Recognition** (`valley_gifts`, one row per player per project): each finished level keeps a plaque of everyone who helped, with
 *   no amounts and no order by amount (V-COM-2); a player's own part is theirs alone to see; the keepsake is the same small thing for
 *   anyone who gave or whose creature worked a communal seat (V-COM-3).
 * - **The fire** (`valley_fire_log`): every step that warms it is a row; the last row is the fire, which never falls (V-COM-13).
 * - **Collections** (`valley_collections`) and **keystones** (`valley_keystones`): a find sets itself into the first open socket of
 *   its kind with its finder's name; a find with no open socket melts into a little Essence (V-COM-12); one keystone clock per
 *   destination for the whole server (V-SCOUT-9).
 * Every number is read from `VALLEY_RULES`.
 */
import {
  PROJECT_PARTS,
  RESIDENT_TOKENS,
  PAGE_TOKENS,
  VALLEY_RULES,
  boardOf,
  communalValue,
  fireLevelOf,
  fireStartMilli,
  hearthBp,
  isOneShot,
  mayOpenProject,
  nextThreshold,
  anyShardValue,
  partRoom,
  projectDone,
  projectProgress,
  projectSize,
  socketFor,
  valueToUnits,
  warmthMilli,
  WARMTH_SOURCES,
  type ProjectHave,
  type ProjectPart,
  type ValleyCommonsView,
  type WarmthSource,
} from '@creatures/game';
import { credit, type LedgerStorage } from './ledger';
import { playerNames } from './lounge';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** The most names a plaque keeps. */
const PLAQUE_MAX = 32;
/** The most gift rows read for one player's own parts (a few dozen exist over months). */
const GIFT_ROWS_MAX = 400;
/** The ledger source of a find that melts into Essence (V-COM-12). */
const MELT_SOURCE = 'valley-melt';

export type PlaceRow = {
  place: string;
  level: number;
  project: number;
  size: number;
  have_acorns: number;
  have_scrap: number;
  have_shards: number;
  opened_at: number;
  opens_at: number;
  done_at: number | null;
  cosmetic: number;
  plaque: string;
};

/** What one read of the commons holds; the mutators keep it in step with the rows. */
export interface CommonsSnapshot {
  readonly places: Map<string, PlaceRow>;
  /** The fire's total in thousandths of a level. */
  fireMilli: number;
}

/** A seat of the caller's that works for a place's project (V-COM-14). */
export interface CommunalSeat {
  seat_id: string;
  creature_id: string | null;
  destination_id: string;
  store_hours: number;
}

export interface ValleyCommonsDeps {
  readonly storage: LedgerStorage;
  readonly now: () => number;
  /** A live draw in [0, 1) (`crypto` in production): keystone clocks. */
  readonly roll: () => number;
}

const haveOf = (row: PlaceRow): ProjectHave => ({
  acorns: row.have_acorns,
  scrap: row.have_scrap,
  shards: row.have_shards,
});

const utcDay = (at: number): number => Math.floor(at / DAY_MS);

export class ValleyCommons {
  constructor(private readonly deps: ValleyCommonsDeps) {}

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  /** A place's level now (1 before the valley has opened): one row. */
  levelOf(place: string): number {
    return (
      this.sql
        .exec<{ level: number }>('SELECT level FROM valley_places WHERE place = ?', place)
        .toArray()[0]?.level ?? 1
    );
  }

  /**
   * Reads the places and the fire, opens the valley the first time (every place, the fire at its start, the keystone clocks) and opens
   * each project whose build days are past (V-COM-5). Runs inside the caller's transaction.
   */
  load(now: number): CommonsSnapshot {
    let rows = this.sql.exec<PlaceRow>('SELECT * FROM valley_places').toArray();
    if (rows.length === 0) {
      this.openValley(now);
      rows = this.sql.exec<PlaceRow>('SELECT * FROM valley_places').toArray();
    } else if (rows.length < VALLEY_RULES.commons.places.length) {
      // A place added to the valley after it opened (the Market): its row is made once.
      for (const place of VALLEY_RULES.commons.places) {
        this.sql.exec('INSERT OR IGNORE INTO valley_places (place) VALUES (?)', place);
      }
      rows = this.sql.exec<PlaceRow>('SELECT * FROM valley_places').toArray();
    }
    const places = new Map(rows.map((row) => [row.place, row]));
    const fire = this.sql
      .exec<{ total_milli: number }>(
        'SELECT total_milli FROM valley_fire_log WHERE id > 0 ORDER BY id DESC LIMIT 1',
      )
      .toArray()[0];
    const snap: CommonsSnapshot = {
      places,
      fireMilli: fire?.total_milli ?? fireStartMilli(VALLEY_RULES),
    };
    this.openDue(snap, now);
    return snap;
  }

  private openValley(now: number): void {
    for (const place of VALLEY_RULES.commons.places) {
      this.sql.exec('INSERT OR IGNORE INTO valley_places (place) VALUES (?)', place);
    }
    for (const destination of VALLEY_RULES.scouts.destinations) {
      this.sql.exec(
        'INSERT OR IGNORE INTO valley_keystones (destination, ready_at) VALUES (?, ?)',
        destination.id,
        this.nextKeystone(now),
      );
    }
  }

  /** When a keystone clock next rings: an exponential wait of the mean (V-SCOUT-9), from a live draw. */
  private nextKeystone(from: number): number {
    const wait = -Math.log(1 - this.deps.roll()) * VALLEY_RULES.scouts.keystoneMeanDays * DAY_MS;
    return from + Math.round(wait);
  }

  /** The server's active weight from the daily job (the number of known players before the first write). */
  private weight(): number {
    const row = this.sql
      .exec<{ weight: number }>('SELECT weight FROM valley_server WHERE id = 1')
      .toArray()[0];
    if (row !== undefined && row.weight > 0) return row.weight;
    return Math.max(
      1,
      this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM valley_players').one().n,
    );
  }

  /** Opens every project that may open: no project open, build days past, and the guided start has reached the place (V-COM-15). */
  private openDue(snap: CommonsSnapshot, now: number): void {
    const level = (place: string): number => snap.places.get(place)?.level ?? 1;
    let weight: number | null = null;
    for (const place of VALLEY_RULES.commons.places) {
      const row = snap.places.get(place);
      if (row === undefined || row.size > 0 || row.opens_at > now) continue;
      if (!mayOpenProject(VALLEY_RULES, place, level)) continue;
      weight ??= this.weight();
      row.size = projectSize(VALLEY_RULES, row.level, weight, place);
      row.have_acorns = 0;
      row.have_scrap = 0;
      row.have_shards = 0;
      row.opened_at = row.opens_at > 0 ? row.opens_at : now;
      this.sql.exec(
        `UPDATE valley_places SET size = ?, have_acorns = 0, have_scrap = 0, have_shards = 0, opened_at = ? WHERE place = ?`,
        row.size,
        row.opened_at,
        place,
      );
    }
  }

  /**
   * The daily job's weight resizes the open projects nobody has given to yet (no Acorns, scrap, shards or communal work in them). A
   * project is sized when it opens; on a new server that is the first visit, when the weight is one, so the first project would stay
   * sized for one player however many join in the next hours. Once anything is in a project its size is fixed (V-COM-4: never changes).
   */
  resizeUnfunded(weight: number): void {
    const rows = this.sql
      .exec<{ place: string; level: number; size: number }>(
        `SELECT place, level, size FROM valley_places
         WHERE size > 0 AND have_acorns = 0 AND have_scrap = 0 AND have_shards = 0`,
      )
      .toArray();
    for (const row of rows) {
      const size = projectSize(VALLEY_RULES, row.level, weight, row.place);
      if (Math.abs(size - row.size) < 1e-9) continue;
      this.sql.exec('UPDATE valley_places SET size = ? WHERE place = ?', size, row.place);
    }
  }

  /** V-BON-7: the hearth's growth multiplier in basis points now (the bonfire's level). */
  hearth(snap: CommonsSnapshot): number {
    return hearthBp(VALLEY_RULES, snap.places.get('bonfire')?.level ?? 1);
  }

  /** The item level cap: the fire's whole levels (V-COM-13, V-GEAR-10). */
  fireLevel(snap: CommonsSnapshot): number {
    return fireLevelOf(snap.fireMilli);
  }

  levelIn(snap: CommonsSnapshot, place: string): number {
    return snap.places.get(place)?.level ?? 1;
  }

  /**
   * A boss fell: the fire warms by a step (V-COM-13). Nothing in the raid calls this yet (the first-kill hook comes with combat v2's
   * integration); the staging bots' stand-in raid does, so the simulated month's fire has the boss share the lab models.
   */
  bossFell(now: number): void {
    this.warm(this.load(now), 'boss', null, now);
  }

  /**
   * V-COM-13: every `masterTitlesPerPoint` Master titles in the valley warm the fire by one step. A title is a creature's mastery of one
   * work (scouting, smithing) at the top step of the ladder (V-POST-12: 504 hours); the hours stay with the creature. Called once a game
   * day by `maintain`: the steps owed are the points the titles make now, less the 'master' steps already in the fire's log, so it never
   * warms twice for a title and never takes warmth back (the fire never falls).
   */
  warmMasters(now: number): void {
    const top = VALLEY_RULES.posts.mastery.at(-1)?.hours;
    if (top === undefined) return;
    const row = this.sql
      .exec<{ titles: number | null }>(
        `SELECT SUM(scout_hours >= ?) + SUM(smith_hours >= ?) AS titles FROM valley_creatures`,
        top,
        top,
      )
      .one();
    const points = Math.floor((row.titles ?? 0) / VALLEY_RULES.fire.warmth.masterTitlesPerPoint);
    const done = this.sql
      .exec<{ n: number }>("SELECT COUNT(*) AS n FROM valley_fire_log WHERE source = 'master'")
      .one().n;
    if (points <= done) return;
    const snap = this.load(now);
    for (let i = done; i < points; i++) this.warm(snap, 'master', null, now);
  }

  /** Warms the fire by a step of a source (V-COM-13). */
  private warm(
    snap: CommonsSnapshot,
    source: WarmthSource,
    place: string | null,
    now: number,
  ): void {
    const step = warmthMilli(VALLEY_RULES, source);
    snap.fireMilli += step;
    this.sql.exec(
      'INSERT INTO valley_fire_log (at, source, place, warmth_milli, total_milli) VALUES (?, ?, ?, ?, ?)',
      now,
      source,
      place,
      step,
      snap.fireMilli,
    );
  }

  /**
   * Adds units of each part to a place's open project, never past what a part needs (what no part can take is not taken), and records
   * the helper's part (their name goes on the plaque, V-COM-2). When every part is full the level is raised, the fire warms and the
   * build days start. Returns what was taken, in units and in Acorns' worth.
   */
  addToProject(
    snap: CommonsSnapshot,
    place: string,
    units: Partial<ProjectHave>,
    helper: string,
    now: number,
  ): { taken: ProjectHave; value: number; levelUp: boolean } {
    const row = snap.places.get(place);
    const none = { taken: { acorns: 0, scrap: 0, shards: 0 }, value: 0, levelUp: false };
    if (row === undefined || row.size <= 0) return none;
    const rules = VALLEY_RULES;
    const have = haveOf(row);
    const before = projectProgress(rules, row.size, have, place);
    const taken: ProjectHave = { acorns: 0, scrap: 0, shards: 0 };
    for (const part of PROJECT_PARTS) {
      const room = partRoom(rules, row.size, have, part, place);
      taken[part] = Math.min(Math.max(0, units[part] ?? 0), room);
      have[part] += taken[part];
    }
    const value = projectProgress(rules, row.size, have, place) - before;
    if (value <= 0) return none;
    row.have_acorns = have.acorns;
    row.have_scrap = have.scrap;
    row.have_shards = have.shards;
    this.sql.exec(
      'UPDATE valley_places SET have_acorns = ?, have_scrap = ?, have_shards = ? WHERE place = ?',
      have.acorns,
      have.scrap,
      have.shards,
      place,
    );
    this.sql.exec(
      `INSERT INTO valley_gifts (user_id, place, project, given_milli, plaque) VALUES (?, ?, ?, ?, 1)
       ON CONFLICT(user_id, place, project) DO UPDATE SET given_milli = given_milli + excluded.given_milli, plaque = 1`,
      helper,
      place,
      row.project,
      Math.round(value * 1000),
    );
    const levelUp = projectDone(rules, row.size, have, place);
    if (levelUp) this.complete(snap, row, now);
    return { taken, value, levelUp };
  }

  /** A finished project: the level rises (or a cosmetic one is built), the plaque is written once, the fire warms, the build days start. */
  private complete(snap: CommonsSnapshot, row: PlaceRow, now: number): void {
    const rules = VALLEY_RULES;
    const ids = this.sql
      .exec<{ user_id: string }>(
        'SELECT user_id FROM valley_gifts WHERE place = ? AND project = ? AND plaque = 1 LIMIT ?',
        row.place,
        row.project,
        PLAQUE_MAX,
      )
      .toArray()
      .map((r) => r.user_id);
    const names = [...playerNames(this.sql, ids).values()].map((n) => n.slice(0, 40));
    // The names go in an order that is no ranking: alphabetical.
    names.sort((a, b) => a.localeCompare(b));
    const cosmetic = row.level >= rules.commons.maxLevel;
    if (cosmetic) row.cosmetic += 1;
    else row.level += 1;
    this.warm(
      snap,
      cosmetic ? 'cosmetic' : row.place === 'forge' ? 'forge' : 'place',
      row.place,
      now,
    );
    row.project += 1;
    row.size = 0;
    row.have_acorns = 0;
    row.have_scrap = 0;
    row.have_shards = 0;
    row.done_at = now;
    row.opens_at = now + rules.commons.buildHours * HOUR_MS;
    row.plaque = JSON.stringify(names);
    this.sql.exec(
      `UPDATE valley_places SET level = ?, project = ?, size = 0, have_acorns = 0, have_scrap = 0, have_shards = 0,
         done_at = ?, opens_at = ?, cosmetic = ?, plaque = ? WHERE place = ?`,
      row.level,
      row.project,
      now,
      row.opens_at,
      row.cosmetic,
      row.plaque,
      row.place,
    );
  }

  /**
   * V-COM-14: credits the work of the caller's communal seats at their visit. Each seat's stored hours become value toward its place's
   * open project (the haulers fill every part in its own proportion), capped at what the project still needs; hours for a place with no
   * open project are not kept (the lab's rule). Returns the value credited.
   */
  creditCommunal(
    userId: string,
    snap: CommonsSnapshot,
    seats: readonly { place: string; hours: number }[],
    now: number,
  ): number {
    let credited = 0;
    for (const seat of seats) {
      const row = snap.places.get(seat.place);
      if (row === undefined || row.size <= 0 || seat.hours <= 0) continue;
      const value = Math.min(
        communalValue(VALLEY_RULES, seat.hours),
        row.size - projectProgress(VALLEY_RULES, row.size, haveOf(row), seat.place),
      );
      if (value <= 0) continue;
      credited += this.addToProject(
        snap,
        seat.place,
        valueToUnits(VALLEY_RULES, value, seat.place),
        userId,
        now,
      ).value;
    }
    return credited;
  }

  // --- Collections (V-COM-12) ---

  /**
   * Sets a find into the first open socket of its kind (on any board, in the valley's order) with its finder's name, warming the fire
   * when a board is complete (V-COM-13). A find with no open socket melts into Essence for the finder. Returns where it set.
   */
  setFind(
    userId: string,
    snap: CommonsSnapshot,
    source: string,
    now: number,
    meltKey: string,
  ): { place: string; socket: number; completed: boolean } | null {
    const filled = new Set(
      this.sql
        .exec<{ place: string; socket: number }>('SELECT place, socket FROM valley_collections')
        .toArray()
        .map((r) => `${r.place}:${String(r.socket)}`),
    );
    const at = socketFor(VALLEY_RULES, VALLEY_RULES.commons.places, filled, source);
    if (at === null) {
      credit(
        this.deps.storage,
        {
          userId,
          currency: 'essence',
          amount: Math.max(1, Math.round(VALLEY_RULES.collections.meltEssence)),
          source: MELT_SOURCE,
          idempotencyKey: `${MELT_SOURCE}:${meltKey}`,
          meta: { source },
        },
        now,
      );
      return null;
    }
    const finder = playerNames(this.sql, [userId]).get(userId) ?? '';
    this.sql.exec(
      'INSERT INTO valley_collections (place, socket, source, finder, found_at) VALUES (?, ?, ?, ?, ?)',
      at.place,
      at.socket,
      source,
      finder.slice(0, 40),
      now,
    );
    const board = boardOf(VALLEY_RULES, at.place);
    const completed = board.every(
      (_, k) => k === at.socket || filled.has(`${at.place}:${String(k)}`),
    );
    if (completed) this.warm(snap, 'collection', at.place, now);
    return { ...at, completed };
  }

  /**
   * The tokens a pass's scouting turned up (`everyday`, a resident's token, a page of the set), each set into its socket or melted.
   * One live draw picks which of the four a token is.
   */
  setFinds(
    userId: string,
    snap: CommonsSnapshot,
    finds: { everyday: number; residents: number; pages: number },
    now: number,
    draw: () => number,
  ): void {
    let n = 0;
    const set = (source: string): void => {
      this.setFind(userId, snap, source, now, `${String(now)}:${String(n++)}`);
    };
    for (let i = 0; i < finds.everyday; i++) set('everyday');
    for (let i = 0; i < finds.residents; i++) {
      set(`resident:${String(1 + Math.floor(draw() * RESIDENT_TOKENS))}`);
    }
    for (let i = 0; i < finds.pages; i++)
      set(`page:${String(1 + Math.floor(draw() * PAGE_TOKENS))}`);
  }

  /**
   * V-SCOUT-9: a ready keystone is found by a scout posted at its destination; the server's clock then restarts. One clock per
   * destination for the whole server, so it does not grow with the number of scouts. `posted` is the destinations the caller has a
   * scout at. Returns the keystones found.
   */
  keystones(
    userId: string,
    snap: CommonsSnapshot,
    posted: ReadonlySet<string>,
    now: number,
    foundAt?: string[],
  ): number {
    if (posted.size === 0) return 0;
    const ready = this.sql
      .exec<{ destination: string; ready_at: number }>(
        'SELECT destination, ready_at FROM valley_keystones',
      )
      .toArray();
    let found = 0;
    for (const clock of ready) {
      if (clock.ready_at > now || !posted.has(clock.destination)) continue;
      this.sql.exec(
        'UPDATE valley_keystones SET ready_at = ?, found = found + 1 WHERE destination = ?',
        this.nextKeystone(now),
        clock.destination,
      );
      this.setFind(
        userId,
        snap,
        `keystone:${clock.destination}`,
        now,
        `${String(now)}:k:${clock.destination}`,
      );
      found += 1;
      foundAt?.push(clock.destination);
    }
    return found;
  }

  // --- The view ---

  /** The commons block of `/api/state`'s valley (strict and small): the caller's own parts are read here and are theirs alone. */
  view(
    userId: string,
    snap: CommonsSnapshot,
    communal: readonly CommunalSeat[],
    now: number,
  ): ValleyCommonsView {
    const rules = VALLEY_RULES;
    const mine = new Map<string, { given: number; plaque: boolean }>();
    const keepsakes = new Map<string, number>();
    for (const g of this.sql
      .exec<{ place: string; project: number; given_milli: number; plaque: number }>(
        'SELECT place, project, given_milli, plaque FROM valley_gifts WHERE user_id = ? LIMIT ?',
        userId,
        GIFT_ROWS_MAX,
      )
      .toArray()) {
      mine.set(`${g.place}:${String(g.project)}`, { given: g.given_milli, plaque: g.plaque === 1 });
      if (g.plaque === 1) keepsakes.set(g.place, (keepsakes.get(g.place) ?? 0) + 1);
    }
    const level = (place: string): number => snap.places.get(place)?.level ?? 1;
    const places = rules.commons.places.map((id) => {
      const row = snap.places.get(id);
      const open = row !== undefined && row.size > 0;
      const wait =
        row !== undefined && !open && row.opens_at > now
          ? Math.max(1, Math.ceil((row.opens_at - now) / DAY_MS))
          : 0;
      const state: 'open' | 'building' | 'waiting' | 'done' = open
        ? 'open'
        : row !== undefined && isOneShot(rules, id) && row.level >= 2
          ? 'done'
          : row === undefined || (row.done_at === null && !mayOpenProject(rules, id, level))
            ? 'waiting'
            : 'building';
      const own = row === undefined ? undefined : mine.get(`${id}:${String(row.project)}`);
      const given = open ? Math.round((own?.given ?? 0) / 1000) : 0;
      return {
        id,
        level: row?.level ?? 1,
        max: rules.commons.maxLevel,
        cosmetic: row?.cosmetic ?? 0,
        state,
        project:
          open && row !== undefined
            ? {
                size: row.size,
                progress: projectProgress(rules, row.size, haveOf(row), id),
                needs: (() => {
                  const have = haveOf(row);
                  const room = (part: ProjectPart): number =>
                    partRoom(rules, row.size, have, part, id);
                  return { acorns: room('acorns'), scrap: room('scrap'), shards: room('shards') };
                })(),
                shardElement: rules.commons.placeElement[id] ?? 'ember',
                anyShard: anyShardValue(rules, id) ?? null,
                cosmetic: row.level >= rules.commons.maxLevel,
              }
            : null,
        buildDaysLeft: state === 'building' ? wait : 0,
        mine: {
          given,
          shareBp:
            open && row !== undefined && row.size > 0
              ? Math.round(Math.min(1, given / row.size) * 10_000)
              : 0,
        },
        plaque: plaqueOf(row?.plaque),
        keepsakes: keepsakes.get(id) ?? 0,
      };
    });
    const filled = new Map<string, { source: string; finder: string }>();
    for (const r of this.sql
      .exec<{ place: string; socket: number; source: string; finder: string }>(
        'SELECT place, socket, source, finder FROM valley_collections',
      )
      .toArray()) {
      filled.set(`${r.place}:${String(r.socket)}`, r);
    }
    const collections = rules.commons.places.flatMap((place) => {
      const board = boardOf(rules, place);
      if (board.length === 0) return [];
      const sockets = board.map((source, k) => {
        const set = filled.get(`${place}:${String(k)}`);
        return { source, set: set !== undefined, finder: set?.finder ?? null };
      });
      return [{ place, sockets, done: sockets.every((s) => s.set) }];
    });
    const recent = this.sql
      .exec<{ source: string; place: string | null; at: number }>(
        'SELECT source, place, at FROM valley_fire_log WHERE id > 0 ORDER BY id DESC LIMIT 5',
      )
      .toArray()
      .flatMap((r) =>
        (WARMTH_SOURCES as readonly string[]).includes(r.source)
          ? [{ source: r.source as WarmthSource, place: r.place, at: r.at }]
          : [],
      );
    const fire = this.fireLevel(snap);
    const found =
      this.sql
        .exec<{ n: number | null }>('SELECT SUM(found) AS n FROM valley_keystones')
        .toArray()[0]?.n ?? 0;
    return {
      places,
      collections,
      fire: { level: fire, milli: snap.fireMilli, next: nextThreshold(rules, fire), recent },
      hearthBp: this.hearth(snap),
      keystones: { found, meanDays: rules.scouts.keystoneMeanDays },
      communal: rules.commons.places.map((place) => {
        const seat = communal.find((s) => s.destination_id === place);
        return {
          place,
          seatId: seat?.seat_id ?? null,
          creatureId: seat?.creature_id ?? null,
          storeHours: seat?.store_hours ?? 0,
          perDay: communalValue(rules, 24),
        };
      }),
    };
  }

  /** The day number masks count in (UTC days). */
  static dayOf = utcDay;
}

/** The plaque names of a place row (stored by `complete`; anything of another shape is an empty plaque). */
function plaqueOf(text: string | undefined): string[] {
  if (text === undefined) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed)
      ? parsed
          .filter((n): n is string => typeof n === 'string')
          .slice(0, PLAQUE_MAX)
          .map((n) => n.slice(0, 40))
      : [];
  } catch {
    return [];
  }
}

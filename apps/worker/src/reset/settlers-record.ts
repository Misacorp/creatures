/**
 * The settlers' record builder (`docs/design/reset.md`, section 1). Pure over one guild's SQL: it reads, never writes.
 *
 * Reads are small and whole-table on purpose (this runs once per server, at the reset, and in the staging dry run, never on a hot path):
 * players, creatures, one grouped query each for the dungeon, blueprints, Crafting and Explorer.
 *
 * The record keeps no Discord ids. Each settler gets a random id and the server a random archive key (live randomness, the Worker's
 * `crypto`), and each Discord id goes in only as an HMAC-SHA-256 under a key the caller passes (in production the Worker secret
 * `SETTLER_HMAC_KEY`; this code never reads a secret itself).
 */
import { content, explorerRank, skillLevel } from '@creatures/game';
import { MAX_NAME_CODE_POINTS } from '../discord-format';
import { zonedDate } from '../time';
import {
  RECORD_VERSION,
  type FeatCreature,
  type Settler,
  type SettlerCreature,
  type SettlerFeats,
  type SettlerOrigin,
  type SettlersRecord,
} from './record-schema';

/** An HMAC key shorter than this is a mistake (an empty or placeholder secret). */
export const MIN_HMAC_KEY_CHARS = 16;

export interface RecordOptions {
  /** The guild's timezone (days in the record are guild-local). */
  tz: string;
  /** UTC epoch ms of the snapshot. */
  now: number;
  /** The key of the Discord id hashes (the Worker secret `SETTLER_HMAC_KEY`). */
  hmacKey: string;
  /** Test seam: a random id source. Defaults to `crypto.randomUUID`. */
  newId?: () => string;
}

type PlayerRow = {
  user_id: string;
  display_name: string;
  created_at: number;
};
type CreatureRow = {
  id: string;
  user_id: string;
  line: string;
  species: string;
  level: number;
  shiny: number;
  nickname: string | null;
  origin: string;
  caught_at: number;
  quirk_id: string | null;
};

const SPECIES = new Map(content.creatures.map((s) => [s.id, s]));

/** The name of a line's first form (stage 1), else of its lowest stage; the line id if the content no longer has it. */
function firstFormName(line: string): string {
  let best: { stage: number; name: string } | undefined;
  for (const s of content.creatures) {
    if (s.line === line && (best === undefined || s.stage < best.stage)) {
      best = { stage: s.stage, name: s.name };
    }
  }
  return best?.name ?? line;
}

function originOf(raw: string): SettlerOrigin {
  if (raw === 'starter') return 'starter';
  if (raw === 'expedition') return 'trip';
  if (raw === 'festival') return 'festival';
  return 'other';
}

const cutPoints = (text: string, max: number): string => Array.from(text).slice(0, max).join('');

/** HMAC-SHA-256 of `text` under `key`, in lowercase hex. */
export async function hmacHex(key: string, text: string): Promise<string> {
  if (key.length < MIN_HMAC_KEY_CHARS) throw new Error('settler hmac key is too short');
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(text)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A random id that is not derived from anything: a UUID without dashes would also do; the dashes stay. */
function randomId(): string {
  return crypto.randomUUID();
}

function featCreature(c: CreatureRow): FeatCreature {
  const speciesName = SPECIES.get(c.species)?.name ?? c.species;
  return { species: c.species, speciesName, nickname: c.nickname };
}

/** Who is a settler: every real player row of the guild (not a simulated guest). */
function readPlayers(sql: SqlStorage): PlayerRow[] {
  return sql
    .exec<PlayerRow>(
      "SELECT user_id, display_name, created_at FROM players WHERE user_id NOT LIKE 'dev-guest-%' ORDER BY created_at, user_id",
    )
    .toArray();
}

function groupMap<T>(rows: { user_id: string }[], value: (r: never) => T): Map<string, T> {
  return new Map(rows.map((r) => [r.user_id, value(r as never)]));
}

/**
 * First on the server (Misa, 2026-11-06): per line, the earliest `caught_at` among the settlers' creatures, starters and dev-tool creatures
 * not counted; every owner at that same instant shares it. Returns, per user id, the first-form names of the lines they hold.
 */
export function serverFirsts(creatures: readonly CreatureRow[]): Map<string, string[]> {
  const earliest = new Map<string, number>();
  for (const c of creatures) {
    if (c.origin === 'starter' || c.origin === 'dev') continue;
    const at = earliest.get(c.line);
    if (at === undefined || c.caught_at < at) earliest.set(c.line, c.caught_at);
  }
  const byUser = new Map<string, Set<string>>();
  for (const c of creatures) {
    if (c.origin === 'starter' || c.origin === 'dev') continue;
    if (earliest.get(c.line) !== c.caught_at) continue;
    const set = byUser.get(c.user_id) ?? new Set<string>();
    set.add(c.line);
    byUser.set(c.user_id, set);
  }
  const out = new Map<string, string[]>();
  for (const [user, lines] of byUser) {
    out.set(
      user,
      [...lines].map(firstFormName).sort((a, b) => a.localeCompare(b)),
    );
  }
  return out;
}

/** Highest first; a tie goes to the earliest caught (then the id, so the pick never depends on row order). */
function bestOf(
  entries: { creature: CreatureRow; score: number }[],
): { creature: CreatureRow; score: number } | null {
  let best: { creature: CreatureRow; score: number } | null = null;
  for (const e of entries) {
    if (
      best === null ||
      e.score > best.score ||
      (e.score === best.score &&
        (e.creature.caught_at < best.creature.caught_at ||
          (e.creature.caught_at === best.creature.caught_at && e.creature.id < best.creature.id)))
    ) {
      best = e;
    }
  }
  return best;
}

/** Builds the record of this guild as it stands. Reads only. */
export async function buildSettlersRecord(
  sql: SqlStorage,
  options: RecordOptions,
): Promise<SettlersRecord> {
  const newId = options.newId ?? randomId;
  const players = readPlayers(sql);
  const settlerIds = new Set(players.map((p) => p.user_id));
  const creatureRows = sql
    .exec<CreatureRow>(
      'SELECT id, user_id, line, species, level, shiny, nickname, origin, caught_at, quirk_id FROM creatures ORDER BY caught_at, id',
    )
    .toArray()
    .filter((c) => settlerIds.has(c.user_id));

  const depth = groupMap(
    sql
      .exec<{ user_id: string; d: number }>(
        'SELECT user_id, MAX(depth) AS d FROM dungeon_runs WHERE cleared = 1 GROUP BY user_id',
      )
      .toArray(),
    (r: { d: number }) => r.d,
  );
  const blueprints = groupMap(
    sql
      .exec<{ user_id: string; n: number }>(
        'SELECT user_id, COUNT(*) AS n FROM blueprints GROUP BY user_id',
      )
      .toArray(),
    (r: { n: number }) => r.n,
  );
  const crafting = sql
    .exec<{ creature_id: string; xp: number }>('SELECT creature_id, xp FROM crafting_skill')
    .toArray();
  const explorer = sql
    .exec<{ creature_id: string; xp: number }>('SELECT creature_id, xp FROM explorer_progress')
    .toArray();
  const firsts = serverFirsts(creatureRows);

  const byCreatureId = new Map(creatureRows.map((c) => [c.id, c]));
  const scored = (rows: { creature_id: string; xp: number }[], level: (xp: number) => number) => {
    const perUser = new Map<string, { creature: CreatureRow; score: number }[]>();
    for (const r of rows) {
      const creature = byCreatureId.get(r.creature_id);
      if (creature === undefined) continue;
      const list = perUser.get(creature.user_id) ?? [];
      list.push({ creature, score: level(r.xp) });
      perUser.set(creature.user_id, list);
    }
    return perUser;
  };
  const craft = scored(crafting, skillLevel);
  const explore = scored(explorer, explorerRank);

  const settlers: Settler[] = [];
  for (const p of players) {
    const mine = creatureRows.filter((c) => c.user_id === p.user_id);
    // Highest level first, the earliest caught first among equals: the order the goodbye lists them in.
    const ordered = [...mine].sort(
      (a, b) => b.level - a.level || a.caught_at - b.caught_at || (a.id < b.id ? -1 : 1),
    );
    const creatures: SettlerCreature[] = ordered.map((c) => ({
      species: c.species,
      speciesName: SPECIES.get(c.species)?.name ?? c.species,
      line: c.line,
      level: c.level,
      shiny: c.shiny === 1,
      nickname: c.nickname,
      origin: originOf(c.origin),
      caughtDay: zonedDate(c.caught_at, options.tz),
      quirk: c.quirk_id,
    }));
    const top = bestOf(mine.map((c) => ({ creature: c, score: c.level })));
    const crafter = bestOf(craft.get(p.user_id) ?? []);
    const explorerBest = bestOf(explore.get(p.user_id) ?? []);
    const feats: SettlerFeats = {
      deepestDepth: depth.get(p.user_id) ?? null,
      firsts: firsts.get(p.user_id) ?? [],
      blueprints: blueprints.get(p.user_id) ?? 0,
      creatures: mine.length,
      highestLevel:
        top === null ? null : { creature: featCreature(top.creature), level: top.score },
      totalLevels: mine.reduce((sum, c) => sum + c.level, 0),
      bestCrafter:
        crafter === null
          ? null
          : { creature: featCreature(crafter.creature), level: crafter.score },
      bestExplorer:
        explorerBest === null
          ? null
          : { creature: featCreature(explorerBest.creature), rank: explorerBest.score },
    };
    settlers.push({
      id: newId(),
      idHash: await hmacHex(options.hmacKey, p.user_id),
      name: cutPoints(p.display_name, MAX_NAME_CODE_POINTS),
      firstPlayedDay: zonedDate(p.created_at, options.tz),
      creatures,
      feats,
    });
  }
  return {
    version: RECORD_VERSION,
    archiveKey: newId(),
    createdAt: options.now,
    switchDay: zonedDate(options.now, options.tz),
    settlers,
  };
}

/** The player rows that count as settlers, for the wipe's staleness check. */
export function countSettlersAndCreatures(sql: SqlStorage): {
  settlers: number;
  creatures: number;
} {
  const settlers = sql
    .exec<{ n: number }>("SELECT COUNT(*) AS n FROM players WHERE user_id NOT LIKE 'dev-guest-%'")
    .one().n;
  const creatures = sql
    .exec<{ n: number }>(
      "SELECT COUNT(*) AS n FROM creatures WHERE user_id IN (SELECT user_id FROM players WHERE user_id NOT LIKE 'dev-guest-%')",
    )
    .one().n;
  return { settlers, creatures };
}

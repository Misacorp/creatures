// The query plan audit: every distinct SQL statement the hot paths run in the seeded month-old guild is
// planned with `EXPLAIN QUERY PLAN`, and a plan that scans a whole table that grows with play fails. The read
// budget (`read-budget.test.ts`) only sees a scan once the table is long and only on the statements it
// measures; this sees the shape of every statement the paths run, the moment it is written (decisions.md,
// 2026-10-26). A failure names the statement, its plan and where in `src/` it ran.
//
// What it records: an object start of a build that already started, alarm ticks of a lounge with company
// (the object evicted before each), an alarm with no lounge, a login, the main GETs (`/api/me`, `/api/state`,
// `/api/room`, `/api/games`, `/api/raid`, `/api/dungeon/today`, `/api/notifications`, `/api/weather`,
// `/api/gear`), a raid placement with a board listener, and the lounge payment the ticks make. Statements are
// compared by their text with whitespace collapsed; the bindings of the first execution are used for the plan.
//
// What to do when it fails (testing.md, "Database reads"): fix the statement (an index in a new migration, or
// a query that uses one). Only a table that is small by design may be scanned (`SMALL_BY_DESIGN`), and only
// with a reason; a single statement that must scan is accepted in `ACCEPTED`, with a reason and the day it
// stops mattering. A statement that does not scan a table or only scans a small one needs nothing.
import { knownKnacks, v2Pool } from '@creatures/game/combat-v2';
import { describe, expect, it } from 'vitest';
import { playV2Day, scaleV2Foes } from './dungeon-v2-reads';
import { HELSINKI, MINUTE } from './raid-helpers';
import { V2_WEEK } from './raid-v2-helpers';
import {
  BUILD,
  GUILD_ID,
  boardSwap,
  callAs,
  seedSeats,
  fakeLounge,
  inGuild,
  loungeTick,
  seedAnvils,
  seedWorld,
  startLounge,
  userId,
  type GuildEnv,
  type World,
} from './read-world';

const speciesOfCreature = (sql: SqlStorage, id: string): string =>
  sql.exec<{ species: string }>('SELECT species FROM creatures WHERE id = ?', id).one().species;

/**
 * Tables that stay small however long the game runs, so scanning one is fine: one row per guild, per
 * player, or per day / week of the current retention window, or a handful of rows kept by the cleanup. A
 * table that grows with play (analytics, ledger, creatures, history of any kind) never belongs here.
 */
const SMALL_BY_DESIGN: Record<string, string> = {
  sessions:
    'a session is dropped after an hour idle, and every login prunes (`SESSION_IDLE_MS`): the logins of one hour',
  players: 'one row per player of the server (5 to 15 active, a few dozen ever)',
  dm_prefs: 'one row per player who set a DM preference',
  games_medals: 'one row per player who won a Games medal',
  raid_readiness:
    'one row per party of the current week; other weeks are deleted when a band is stored',
  schema_version: 'one row per migration (about 50), read by the start',
  guild_meta: 'one row per guild',
  maintenance: 'one row: the day the daily cleanup last finished',
  startup_passes: 'one row per deployed build of the recent past',
  lounge_message: 'one row: the lounge message of the guild',
  lounge_instances: 'the Activity instances open right now (a few)',
  lounge_company: 'one row per player who lounges with company (players, at most a few dozen)',
  valley_places:
    'one row per place of the valley (five today; a new place is content, never a row per player)',
  valley_keystones: 'one row per scouting destination (seven today), a clock each',
  valley_collections:
    'one row per socket that has been set: five sockets on each board of five places, 25 rows for good',
};

/**
 * Statements accepted although they scan a growing table, each with the reason. Match is a substring of the
 * normalised statement text. Keep this list short: it is a debt list (an entry says "fix me", not "fine").
 */
const ACCEPTED: { sql: string; reason: string }[] = [];

interface Recorded {
  sql: string;
  bindings: unknown[];
  site: string;
}

const normalise = (query: string): string => query.replace(/\s+/g, ' ').trim();

const NO_SITE = '(no src frame)';

/** The first `src/` frames of the stack at the moment a statement ran: where in the Worker it came from. */
function callSite(): string {
  const frames = (new Error().stack ?? '')
    .split('\n')
    .filter(
      (line) =>
        line.includes('/apps/worker/src/') &&
        !line.includes('/src/read-meter.ts') &&
        !line.includes('node_modules'),
    )
    .map((line) => line.replace(/^.*\/apps\/worker\/src\//, 'src/').replace(/\)$/, ''));
  return frames.slice(0, 3).join(' <- ') || NO_SITE;
}

/** `SCAN x`, `SEARCH x` ...: the step's table (or alias) and whether it reads every row of it. */
function scannedTable(detail: string): string | null {
  const m = /^SCAN (?:TABLE )?(\S+)(?: AS (\S+))?(.*)$/.exec(detail);
  if (m === null) return null;
  // `SCAN t USING INDEX i` and `USING COVERING INDEX` walk an index in order (the read budget watches the
  // rows); `SCAN t` alone is a full scan of the table.
  if (/ USING /.test(m[3] ?? '')) return null;
  return m[2] ?? m[1] ?? null;
}

/** The table behind an alias in the statement (`FROM players p`), or the name itself. */
function resolveTable(sql: string, name: string): string {
  const re = /\b(?:FROM|JOIN)\s+"?(\w+)"?(?:\s+AS)?\s+"?(\w+)"?/gi;
  for (const m of sql.matchAll(re)) if (m[2] === name && m[1] !== undefined) return m[1];
  return name;
}

/** What an audit run found: the statements it saw and planned, and the scans it did not accept. */
interface Audited {
  seen: number;
  /** The recorded statements (normalised text). */
  statements: string[];
  planned: number;
  found: string[];
}

/**
 * Seeds the month-old guild (`options`: with the combat v2 flag and its state when asked), records every
 * statement `exercise` runs, plans each one and collects the whole-table scans of tables that grow with play.
 */
async function audit(
  options: { combatV2?: boolean; valleySystems?: boolean; fresh?: boolean },
  exercise: (env: GuildEnv, world: World) => Promise<void>,
): Promise<Audited> {
  let recording = false;
  const seen = new Map<string, Recorded>();
  const found: string[] = [];
  let planned = 0;

  await inGuild(
    async (env) => {
      const { metered } = env;
      const world = await seedWorld(env, options);
      recording = true;
      await exercise(env, world);
      recording = false;

      const tables = new Set(
        metered.sql
          .exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
          .toArray()
          .map((r) => r.name),
      );
      for (const { sql, bindings, site } of seen.values()) {
        if (!/^(SELECT|WITH|UPDATE|DELETE|INSERT)\b/i.test(sql)) continue;
        let plan: { detail: string }[];
        try {
          plan = metered.sql
            .exec<{ detail: string }>(`EXPLAIN QUERY PLAN ${sql}`, ...(bindings as []))
            .toArray();
        } catch (err) {
          // A statement that cannot be planned here (its table is gone, a temp table) is a test gap.
          found.push(`could not plan: ${sql}\n  ${String(err)}\n  at ${site}`);
          continue;
        }
        planned++;
        for (const step of plan) {
          const name = scannedTable(step.detail);
          if (name === null) continue;
          const table = resolveTable(sql, name);
          // A CTE, a subquery or a constant row is not a table.
          if (!tables.has(table)) continue;
          if (SMALL_BY_DESIGN[table] !== undefined) continue;
          if (ACCEPTED.some((a) => sql.includes(a.sql))) continue;
          found.push(
            `${step.detail}\n  statement: ${sql}\n  plan: ${plan.map((p) => p.detail).join(' | ')}\n  at ${site}`,
          );
        }
      }
    },
    {
      fresh: options.fresh === true,
      onExec: (query, bindings) => {
        if (!recording) return;
        const sql = normalise(query);
        if (seen.has(sql)) return;
        const site = callSite();
        // A statement the test itself runs (a lookup for its setup) is not the Worker's.
        if (site !== NO_SITE) seen.set(sql, { sql, bindings: [...bindings], site });
      },
    },
  );
  return { seen: seen.size, statements: [...seen.keys()], planned, found };
}

const scanMessage = (found: string[]): string =>
  `${String(found.length)} whole-table scan(s) of a table that grows with play. Add an index (a new migration) or change the query; allowlist only with a reason (testing.md, "Database reads"):\n${found.join('\n\n')}`;

describe('query plan audit', () => {
  it('plans every statement of the hot paths without a whole-table scan of a table that grows', async () => {
    const result = await audit({}, async (env, world) => {
      const { clock, mk } = env;
      const lounge = fakeLounge();
      // An object start after the first one of this build.
      mk(BUILD).migrate();
      // A login, as the Activity does when it opens.
      await world.core.createSession(GUILD_ID, { id: userId(1), displayName: 'Player 1' });
      clock.t += 6 * MINUTE;
      const paths = [
        '/api/me',
        '/api/state',
        '/api/room',
        '/api/games',
        '/api/raid',
        '/api/dungeon/today',
        '/api/notifications',
        '/api/weather',
        '/api/gear',
      ];
      // Twice: the first call of a day pays one-off work, the second is the usual one.
      for (let round = 0; round < 2; round++)
        for (const path of paths) await callAs(world.core, world.secrets, 1, path);
      // An alarm with no lounge, then a lounge with company: ticks that pay, each on a fresh object.
      clock.t += MINUTE;
      await world.core.alarm();
      await startLounge(env, lounge);
      for (let i = 0; i < 4; i++) await loungeTick(env, lounge);
      // A raid placement while a teammate has the board open.
      await boardSwap(env, world);
    });

    // The paths are not empty: a refactor that stops running them would make this test pass for nothing.
    expect(result.seen, 'statements recorded').toBeGreaterThan(100);
    expect(result.planned, 'statements planned').toBeGreaterThan(100);
    expect(result.found, scanMessage(result.found)).toEqual([]);
  }, 60_000);

  it('plans the combat v2 paths (the creature page with the flag on, a Knack save, a talent learn, a role-changing evolution) without a whole-table scan', async () => {
    const result = await audit({ combatV2: true, fresh: true }, async (env, world) => {
      const { metered, clock } = env;
      clock.t += 6 * MINUTE;
      // Twice, as above.
      for (let round = 0; round < 2; round++)
        await callAs(world.core, world.secrets, 1, '/api/state');
      const mine = world.creatures[userId(1)] ?? [];
      const first = mine[0] as string;
      await callAs(world.core, world.secrets, 1, `/api/creatures/${first}/knack`, {
        method: 'PUT',
        body: { knack: null },
      });
      await callAs(world.core, world.secrets, 1, `/api/creatures/${first}/knack`, {
        method: 'PUT',
        body: { knack: knownKnacks(speciesOfCreature(metered.sql, first))[0] },
      });
      // A talent of the line's book the creature has not learned, learned for Bait.
      const line = metered.sql
        .exec<{ line: string }>('SELECT line FROM creatures WHERE id = ?', first)
        .one().line;
      const learned = new Set(
        metered.sql
          .exec<{ talent_id: string }>(
            'SELECT talent_id FROM creature_talents_v2 WHERE creature_id = ?',
            first,
          )
          .toArray()
          .map((r) => r.talent_id),
      );
      const other = v2Pool(line).find((id) => !learned.has(id)) as string;
      await callAs(world.core, world.secrets, 1, `/api/creatures/${first}/talents-v2/learn`, {
        method: 'POST',
        body: { talentId: other, idempotencyKey: 'audit-learn-0000001' },
      });
      await callAs(world.core, world.secrets, 1, `/api/creatures/${first}/talents-v2/slot`, {
        method: 'PUT',
        body: { talentId: other, slot: 1 },
      });
      // A Mossback at level 15 with a Setter-only talent grows into the Payoff Bloomback.
      const moss = metered.sql
        .exec<{ id: string }>(
          "SELECT id FROM creatures WHERE user_id = ? AND species = 'mossback'",
          userId(1),
        )
        .one().id;
      metered.sql.exec('UPDATE creatures SET level = 15 WHERE id = ?', moss);
      metered.sql.exec('DELETE FROM creature_talents_v2 WHERE creature_id = ?', moss);
      metered.sql.exec(
        "INSERT INTO creature_talents_v2 (creature_id, talent_id, slot, learned_at) VALUES (?, 'owners-mark', 1, 1)",
        moss,
      );
      metered.sql.exec(
        "DELETE FROM line_talents WHERE user_id = ? AND line = 'mossback' AND talent_id IN ('opportunist', 'finisher')",
        userId(1),
      );
      await callAs(world.core, world.secrets, 1, `/api/creatures/${moss}/evolve`, {
        method: 'POST',
        body: { species: 'bloomback', idempotencyKey: 'audit-evolve-0000001' },
      });
    });

    expect(result.seen, 'statements recorded').toBeGreaterThan(40);
    expect(result.found, scanMessage(result.found)).toEqual([]);
  }, 60_000);

  it('plans a combat v2 dungeon day (start, the rooms, the camp, the rest of the run and its replay, with the flag on) without a whole-table scan', async () => {
    const restore = scaleV2Foes(500, 500);
    try {
      const result = await audit({ combatV2: true, fresh: true }, async (env, world) => {
        env.clock.t += 6 * MINUTE;
        await callAs(world.core, world.secrets, 1, '/api/dungeon/today');
        const team = (world.creatures[userId(1)] ?? []).slice(0, 3);
        const day = await playV2Day(
          (method, path, body) => callAs(world.core, world.secrets, 1, path, { method, body }),
          team,
          'audit-dungeon-v2',
        );
        expect(day.acts, 'the run went through a room and the camp').toEqual(
          expect.arrayContaining(['room', 'camp']),
        );
        await callAs(world.core, world.secrets, 1, '/api/dungeon/today');
      });
      expect(result.seen, 'statements recorded').toBeGreaterThan(30);
      expect(result.found, scanMessage(result.found)).toEqual([]);
    } finally {
      restore();
    }
  }, 60_000);

  it('plans a combat v2 raid weekend (the week, a placement, a swap request and its answer, both stages, the live finale and its settle) without a whole-table scan', async () => {
    const result = await audit({ combatV2: true, fresh: true }, async (env, world) => {
      const { metered, clock, mk } = env;
      clock.t += 6 * MINUTE;
      // Twice, as above: the first call pays one-off work.
      for (let round = 0; round < 2; round++)
        await callAs(world.core, world.secrets, 1, '/api/raid');
      await boardSwap(env, world);
      const slotsOf = (id: string): number[] =>
        metered.sql
          .exec<{ slot: number }>(
            'SELECT slot FROM raid_placements WHERE user_id = ? ORDER BY slot',
            id,
          )
          .toArray()
          .map((r) => r.slot);
      await callAs(world.core, world.secrets, 1, '/api/raid/swap', {
        method: 'POST',
        body: { slotA: slotsOf(userId(1))[0], slotB: slotsOf(userId(3))[0] },
      });
      const incoming = (await callAs(world.core, world.secrets, 3, '/api/raid/swap')) as {
        incoming: { id: string }[];
      };
      await callAs(
        world.core,
        world.secrets,
        3,
        `/api/raid/swap/${incoming.incoming[0]?.id as string}/accept`,
        { method: 'POST' },
      );
      // Stage 1 on Saturday, stage 2 and the live finale on Sunday, the reads of the fight and the one that settles it (the raid's own
      // events: the daily alarm's cleanup is not what this case plans).
      const core = mk(BUILD, { combatV2: true });
      core.migrate();
      clock.t = V2_WEEK.stage1 + 30_000;
      core.raid.runDue(HELSINKI);
      clock.t = V2_WEEK.stage2 + 30_000;
      core.raid.runDue(HELSINKI);
      core.raid.view(userId(1), HELSINKI);
      clock.t = V2_WEEK.finale + 2000;
      core.raid.runDue(HELSINKI);
      for (const at of [1000, 40_000, 100_000, 300_000]) {
        clock.t = V2_WEEK.finale + at;
        core.raid.liveView(userId(1), HELSINKI);
      }
      core.raid.replay(userId(1), V2_WEEK.id, 1, 'stage1');
      core.raid.stats(userId(1), V2_WEEK.id, 1, 'stage1');
    });

    expect(result.seen, 'statements recorded').toBeGreaterThan(60);
    expect(result.found, scanMessage(result.found)).toEqual([]);
  }, 60_000);

  it("plans the valley's lazy pass (a first look, an arrival after a day, a look mid-visit, a repeat, the pass before an intent) without a whole-table scan", async () => {
    const result = await audit({ valleySystems: true, fresh: true }, async (env, world) => {
      const { clock } = env;
      const relog = async (): Promise<void> => {
        world.secrets.set(
          userId(1),
          await world.core.createSession(GUILD_ID, { id: userId(1), displayName: 'Player 1' }),
        );
      };
      clock.t += 6 * MINUTE;
      await callAs(world.core, world.secrets, 1, '/api/state');
      clock.t += 24 * 60 * MINUTE;
      await relog();
      await callAs(world.core, world.secrets, 1, '/api/state');
      clock.t += 10 * MINUTE;
      await callAs(world.core, world.secrets, 1, '/api/state');
      clock.t += 10_000;
      await callAs(world.core, world.secrets, 1, '/api/state');
      clock.t += 5 * MINUTE;
      await relog();
      await callAs(world.core, world.secrets, 1, '/api/away/dismiss', {
        method: 'POST',
        body: { until: 1 },
      });
    });

    expect(result.seen, 'statements recorded').toBeGreaterThan(40);
    // The valley's own statements ran (a refactor that stops running them would pass for nothing).
    for (const table of ['valley_players', 'valley_creatures'])
      expect(
        result.statements.some((q) => q.includes(table)),
        table,
      ).toBe(true);
    expect(result.found, scanMessage(result.found)).toEqual([]);
  }, 60_000);

  it("plans the commons' statements (a gift, a gift that finishes a level, a communal seat credited, a keystone and a collection, a post) without a whole-table scan", async () => {
    const result = await audit({ valleySystems: true, fresh: true }, async (env, world) => {
      const { clock, metered } = env;
      const { core, secrets } = world;
      const relog = async (): Promise<void> => {
        secrets.set(
          userId(1),
          await core.createSession(GUILD_ID, { id: userId(1), displayName: 'Player 1' }),
        );
      };
      const post = (path: string, body: unknown): Promise<unknown> =>
        callAs(core, secrets, 1, path, { method: 'POST', body });
      clock.t += 6 * MINUTE;
      await callAs(core, secrets, 1, '/api/state');
      core.credit({
        userId: userId(1),
        currency: 'bait',
        amount: 5000,
        source: 'test',
        idempotencyKey: 'plan-funds',
      });
      const mine = world.creatures[userId(1)] ?? [];
      await post('/api/valley/communal', { place: 'bonfire', creatureId: mine[0] });
      await post('/api/valley/gift', {
        place: 'bonfire',
        currency: 'acorns',
        amount: 5,
        idempotencyKey: 'plan-gift-1',
      });
      // A level finishes, with a keystone ringing for a scout and the bonfire's communal seat credited at the next arrival.
      const size = metered.sql
        .exec<{ size: number }>("SELECT size FROM valley_places WHERE place = 'bonfire'")
        .one().size;
      metered.sql.exec(
        "UPDATE valley_places SET have_scrap = 1e9, have_shards = 1e9, have_acorns = ? WHERE place = 'bonfire'",
        size * 0.4 - 0.5,
      );
      await post('/api/valley/gift', {
        place: 'bonfire',
        currency: 'acorns',
        amount: 1,
        idempotencyKey: 'plan-gift-2',
      });
      seedSeats(metered.sql, userId(1), mine.slice(1), 1);
      metered.sql.exec('UPDATE valley_keystones SET ready_at = 0');
      metered.sql.exec(
        "UPDATE valley_seats SET store_hours = 10 WHERE user_id = ? AND place = 'commons'",
        userId(1),
      );
      clock.t += 24 * 60 * MINUTE;
      await relog();
      await callAs(core, secrets, 1, '/api/state');
    });

    expect(result.seen, 'statements recorded').toBeGreaterThan(40);
    // The commons' own statements ran (a refactor that stops running them would pass for nothing).
    for (const table of [
      'valley_places',
      'valley_gifts',
      'valley_fire_log',
      'valley_keystones',
      'valley_collections',
    ])
      expect(
        result.statements.some((q) => q.includes(table)),
        table,
      ).toBe(true);
    expect(result.found, scanMessage(result.found)).toEqual([]);
  }, 60_000);

  it("plans the scouts' pass and routes (an arrival with seats, a seat bought and posted, a kit set, a look mid-visit) without a whole-table scan", async () => {
    const result = await audit({ valleySystems: true, fresh: true }, async (env, world) => {
      const { clock } = env;
      const relog = async (): Promise<void> => {
        world.secrets.set(
          userId(1),
          await world.core.createSession(GUILD_ID, { id: userId(1), displayName: 'Player 1' }),
        );
      };
      const call = (path: string, body: unknown, n = 1): Promise<unknown> =>
        callAs(world.core, world.secrets, n, path, { method: 'POST', body });
      clock.t += 6 * MINUTE;
      await callAs(world.core, world.secrets, 1, '/api/state');
      // Player 2 buys the first seat (free) and posts a creature to it; player 1 has two seats by the seeds.
      const mine = world.creatures[userId(1)] ?? [];
      seedSeats(env.metered.sql, userId(1), mine, 2);
      const bought = (await call(
        '/api/valley/seat/buy',
        { idempotencyKey: 'audit-seat-buy-0001' },
        2,
      )) as { seatId: string };
      await call(
        '/api/valley/seat',
        {
          seatId: bought.seatId,
          creatureId: world.creatures[userId(2)]?.[0] ?? null,
          destination: 'ember-caves',
        },
        2,
      );
      const second = env.metered.sql
        .exec<{ seat_id: string }>(
          'SELECT seat_id FROM valley_seats WHERE user_id = ? AND position = 2',
          userId(1),
        )
        .one().seat_id;
      await call('/api/valley/kit', { action: 'set', seatId: second, kit: 'satchel' });
      clock.t += 24 * 60 * MINUTE;
      await relog();
      await callAs(world.core, world.secrets, 1, '/api/state');
      clock.t += 10 * MINUTE;
      await callAs(world.core, world.secrets, 1, '/api/state');
      // A pending duplicate whose day is up is answered by the pass.
      world.core.collection.choices.addPending(
        userId(1),
        { species: 'splashet', shiny: false },
        { kind: 'expedition', id: 'audit-seat' },
        undefined,
        clock.t + 60_000,
      );
      clock.t += 24 * 60 * MINUTE;
      await relog();
      await callAs(world.core, world.secrets, 1, '/api/state');
    });

    expect(result.seen, 'statements recorded').toBeGreaterThan(40);
    for (const table of ['valley_seats', 'valley_kit', 'pending_catches'])
      expect(
        result.statements.some((q) => q.includes(table)),
        table,
      ).toBe(true);
    expect(result.found, scanMessage(result.found)).toEqual([]);
  }, 60_000);

  it("plans the Forge's pass and routes (an arrival with anvils and a full bag, an anvil bought, an order added and removed, an exchange, a kit set, a look mid-visit) without a whole-table scan", async () => {
    const result = await audit({ valleySystems: true, fresh: true }, async (env, world) => {
      const { clock } = env;
      const relog = async (): Promise<void> => {
        world.secrets.set(
          userId(1),
          await world.core.createSession(GUILD_ID, { id: userId(1), displayName: 'Player 1' }),
        );
      };
      const call = (path: string, body: unknown, n = 1): Promise<unknown> =>
        callAs(world.core, world.secrets, n, path, { method: 'POST', body });
      clock.t += 6 * MINUTE;
      await callAs(world.core, world.secrets, 1, '/api/state');
      // Player 1 has two anvils by the seeds (queues, shelf, pieces on the floors); player 2 buys the first (free) and posts a smith.
      seedAnvils(env.metered.sql, userId(1), world.creatures[userId(1)] ?? [], 2);
      const bought = (await call(
        '/api/valley/anvil/buy',
        { idempotencyKey: 'audit-anvil-buy-0001' },
        2,
      )) as { seatId: string };
      await call(
        '/api/valley/seat',
        { seatId: bought.seatId, creatureId: world.creatures[userId(2)]?.[0] ?? null },
        2,
      );
      env.metered.sql.exec(
        `INSERT OR IGNORE INTO blueprints (user_id, base_id, rarity, learned_at) VALUES (?, 'kelp-cap', 'common', ?)`,
        userId(2),
        clock.t,
      );
      const added = (await call(
        '/api/valley/order',
        { action: 'add', seatId: bought.seatId, blueprintId: 'kelp-cap', count: 2 },
        2,
      )) as { orderId: string };
      await call('/api/valley/order', { action: 'edit', orderId: added.orderId, count: 3 }, 2);
      await call('/api/valley/order', { action: 'remove', orderId: added.orderId }, 2);
      // The exchange opens with the Market (Q64).
      env.metered.sql.exec("UPDATE valley_places SET level = 2 WHERE place = 'market'");
      await call('/api/valley/exchange', { to: 'tide', idempotencyKey: 'audit-exchange-0001' });
      await call('/api/valley/kit', {
        action: 'set',
        seatId: env.metered.sql
          .exec<{ seat_id: string }>(
            "SELECT seat_id FROM valley_seats WHERE user_id = ? AND place = 'forge' AND position = 2",
            userId(1),
          )
          .one().seat_id,
        kit: 'tongs',
      });
      clock.t += 24 * 60 * MINUTE;
      await relog();
      await callAs(world.core, world.secrets, 1, '/api/state');
      clock.t += 10 * MINUTE;
      await callAs(world.core, world.secrets, 1, '/api/state');
      // A full bag holds the floors' pieces back.
      env.metered.sql.exec(
        'INSERT OR REPLACE INTO valley_bag (user_id, items) VALUES (?, 200)',
        userId(1),
      );
      clock.t += 24 * 60 * MINUTE;
      await relog();
      await callAs(world.core, world.secrets, 1, '/api/state');
    });

    expect(result.seen, 'statements recorded').toBeGreaterThan(40);
    for (const table of ['forge_orders', 'forge_floor', 'valley_bag', 'valley_seats', 'parts'])
      expect(
        result.statements.some((q) => q.includes(table)),
        table,
      ).toBe(true);
    expect(result.found, scanMessage(result.found)).toEqual([]);
  }, 60_000);

  it("plans the broker's statements (the seat made on the first look after the Market is built, a creature posted, an arrival and a look where it trades, a setting) without a whole-table scan", async () => {
    const result = await audit({ valleySystems: true, fresh: true }, async (env, world) => {
      const { clock } = env;
      const relog = async (): Promise<void> => {
        world.secrets.set(
          userId(1),
          await world.core.createSession(GUILD_ID, { id: userId(1), displayName: 'Player 1' }),
        );
      };
      const call = (path: string, body: unknown): Promise<unknown> =>
        callAs(world.core, world.secrets, 1, path, { method: 'POST', body });
      clock.t += 6 * MINUTE;
      await callAs(world.core, world.secrets, 1, '/api/state');
      const mine = world.creatures[userId(1)] ?? [];
      seedAnvils(env.metered.sql, userId(1), mine, 2);
      env.metered.sql.exec(
        "UPDATE parts SET amount = 0 WHERE user_id = ? AND kind = 'tide-shard'",
        userId(1),
      );
      env.metered.sql.exec("UPDATE valley_places SET level = 2 WHERE place = 'market'");
      clock.t += 10 * MINUTE;
      await callAs(world.core, world.secrets, 1, '/api/state');
      const seat = env.metered.sql
        .exec<{ seat_id: string }>("SELECT seat_id FROM valley_seats WHERE place = 'market'")
        .one().seat_id;
      await call('/api/valley/seat', { seatId: seat, creatureId: mine[mine.length - 3] ?? null });
      await call('/api/valley/broker', { seatId: seat, toward: 'grove' });
      clock.t += 24 * 60 * MINUTE;
      await relog();
      await callAs(world.core, world.secrets, 1, '/api/state');
      clock.t += 10 * MINUTE;
      await callAs(world.core, world.secrets, 1, '/api/state');
    });

    expect(result.seen, 'statements recorded').toBeGreaterThan(40);
    for (const table of [
      'valley_seats',
      'valley_places',
      'valley_creatures',
      'parts',
      'valley_gazette',
    ])
      expect(
        result.statements.some((q) => q.includes(table)),
        table,
      ).toBe(true);
    expect(
      result.statements.some((q) => q.includes('trade_hours')),
      'trade_hours',
    ).toBe(true);
    expect(result.found, scanMessage(result.found)).toEqual([]);
  }, 60_000);

  it("plans the visitor's statements (the first look of the week, a look at a piece, a reroll, the blueprint, the alarm, a return that is told he is here) without a whole-table scan", async () => {
    const result = await audit({ valleySystems: true, fresh: true }, async (env, world) => {
      const { clock } = env;
      const relog = async (): Promise<void> => {
        world.secrets.set(
          userId(1),
          await world.core.createSession(GUILD_ID, { id: userId(1), displayName: 'Player 1' }),
        );
      };
      const post = (path: string, body: unknown): Promise<unknown> =>
        callAs(world.core, world.secrets, 1, path, { method: 'POST', body });
      clock.t += 6 * MINUTE;
      await callAs(world.core, world.secrets, 1, '/api/state');
      // Thursday afternoon: he is here.
      clock.t += 2 * 24 * 60 * MINUTE;
      await relog();
      const sql = env.metered.sql;
      sql.exec(
        "UPDATE balances SET amount = 100000 WHERE user_id = ? AND currency = 'bait'",
        userId(1),
      );
      sql.exec(
        "INSERT INTO parts (user_id, kind, amount) VALUES (?, 'scrap', 100000), (?, 'mire-shard', 500) ON CONFLICT(user_id, kind) DO UPDATE SET amount = excluded.amount",
        userId(1),
        userId(1),
      );
      const item = sql
        .exec<{ id: string }>('SELECT id FROM gear_items WHERE user_id = ? LIMIT 1', userId(1))
        .one().id;
      await callAs(world.core, world.secrets, 1, '/api/valley/visitor');
      await callAs(world.core, world.secrets, 1, `/api/valley/visitor?item=${item}`);
      await post('/api/valley/visitor/reroll', {
        itemId: item,
        idempotencyKey: 'audit-visitor-reroll-0001',
      });
      await post('/api/valley/visitor/blueprint', { idempotencyKey: 'audit-visitor-bp-0001' });
      clock.t += MINUTE;
      // The alarm's own check (the whole alarm also runs the daily clean-up, which the other audits leave to its own).
      world.core.valleyVisitorWeeks?.ensureArrival(clock.t);
      world.core.valleyVisitorWeeks?.nextArrivalAt(clock.t);
      sql.exec('UPDATE visitor_rerolls SET told = 0 WHERE user_id = ?', userId(1));
      clock.t += 12 * 60 * MINUTE;
      await relog();
      await callAs(world.core, world.secrets, 1, '/api/state');
    });

    expect(result.seen, 'statements recorded').toBeGreaterThan(40);
    for (const table of ['visitor_weeks', 'visitor_rerolls', 'gear_items'])
      expect(
        result.statements.some((q) => q.includes(table)),
        table,
      ).toBe(true);
    expect(result.found, scanMessage(result.found)).toEqual([]);
  }, 60_000);

  it("plans the trials' statements (the joined read in a pass, the ticks of a pass, an event tick, a ceremony that graduates and is told, the clean-up) without a whole-table scan", async () => {
    const result = await audit({ valleySystems: true, fresh: true }, async (env, world) => {
      const { clock } = env;
      const relog = async (): Promise<void> => {
        world.secrets.set(
          userId(1),
          await world.core.createSession(GUILD_ID, { id: userId(1), displayName: 'Player 1' }),
        );
      };
      const sql = env.metered.sql;
      clock.t += 6 * MINUTE;
      await callAs(world.core, world.secrets, 1, '/api/state');
      const ids = sql
        .exec<{ id: string }>('SELECT id FROM creatures WHERE user_id = ?', userId(1))
        .toArray()
        .map((r) => r.id);
      sql.exec('UPDATE creatures SET level = 12 WHERE user_id = ?', userId(1));
      sql.exec(
        'UPDATE valley_creatures SET scout_hours = 30, smith_hours = 30 WHERE user_id = ?',
        userId(1),
      );
      clock.t += 2 * MINUTE;
      await callAs(world.core, world.secrets, 1, '/api/state');
      world.core.valleyTrials?.tickEvent(userId(1), ids.slice(0, 5), 'dungeon', clock.t);
      world.core.valleyTrials?.tickEvent(userId(1), ids, 'fire', clock.t);
      // Two days away: the ceremony has passed, so the arrival graduates them and the paper tells it; a creature that left is cleaned up.
      sql.exec('DELETE FROM creatures WHERE id = ?', ids[0]);
      clock.t += 2 * 24 * 60 * MINUTE;
      await relog();
      await callAs(world.core, world.secrets, 1, '/api/state');
    });

    expect(result.seen, 'statements recorded').toBeGreaterThan(40);
    for (const table of ['creature_trials'])
      expect(
        result.statements.some((q) => q.includes(table)),
        table,
      ).toBe(true);
    expect(result.found, scanMessage(result.found)).toEqual([]);
  }, 60_000);

  it("plans the Gazette's statements (an arrival that writes a paper, a joined one, a look with it unread, taking a way deeper, closing it) without a whole-table scan", async () => {
    const result = await audit({ valleySystems: true, fresh: true }, async (env, world) => {
      const { clock } = env;
      const relog = async (): Promise<void> => {
        world.secrets.set(
          userId(1),
          await world.core.createSession(GUILD_ID, { id: userId(1), displayName: 'Player 1' }),
        );
      };
      const call = (path: string, body: unknown): Promise<unknown> =>
        callAs(world.core, world.secrets, 1, path, { method: 'POST', body });
      clock.t += 6 * MINUTE;
      await callAs(world.core, world.secrets, 1, '/api/state');
      const mine = world.creatures[userId(1)] ?? [];
      seedSeats(env.metered.sql, userId(1), mine, 2);
      clock.t += 24 * 60 * MINUTE;
      await relog();
      await callAs(world.core, world.secrets, 1, '/api/state');
      clock.t += 10 * MINUTE;
      await callAs(world.core, world.secrets, 1, '/api/state');
      // A second arrival joins the unread paper.
      clock.t += 24 * 60 * MINUTE;
      await relog();
      await callAs(world.core, world.secrets, 1, '/api/state');
      const seat = env.metered.sql
        .exec<{ seat_id: string; creature_id: string; destination_id: string }>(
          'SELECT seat_id, creature_id, destination_id FROM valley_seats WHERE user_id = ? AND position = 1',
          userId(1),
        )
        .one();
      env.metered.sql.exec(
        'UPDATE valley_gazette SET decision = ? WHERE user_id = ?',
        JSON.stringify({
          kind: 'push-on',
          seatId: seat.seat_id,
          creatureId: seat.creature_id,
          destination: seat.destination_id,
        }),
        userId(1),
      );
      await call('/api/valley/deep', { seatId: seat.seat_id, deep: true });
      await call('/api/valley/deep', { seatId: seat.seat_id, deep: false });
      const paper = env.metered.sql
        .exec<{ paper_id: string }>(
          'SELECT paper_id FROM valley_gazette WHERE user_id = ?',
          userId(1),
        )
        .one();
      await call('/api/valley/gazette/close', { paperId: paper.paper_id });
    });

    expect(result.seen, 'statements recorded').toBeGreaterThan(40);
    expect(
      result.statements.some((q) => q.includes('valley_gazette')),
      'valley_gazette',
    ).toBe(true);
    expect(result.found, scanMessage(result.found)).toEqual([]);
  }, 60_000);

  it('sees a full scan, an indexed search and an aliased scan in this SQLite (the detector works)', async () => {
    await inGuild(({ metered }) => {
      const plan = (query: string): string[] =>
        metered.sql
          .exec<{ detail: string }>(`EXPLAIN QUERY PLAN ${query}`)
          .toArray()
          .map((r) => r.detail);
      metered.sql.exec('CREATE TABLE audit_probe (a INTEGER, b INTEGER)');
      const scans = (query: string): (string | null)[] =>
        plan(query).map((d) => {
          const name = scannedTable(d);
          return name === null ? null : resolveTable(query, name);
        });
      expect(scans('SELECT * FROM audit_probe WHERE a = 1')).toEqual(['audit_probe']);
      expect(scans('SELECT * FROM audit_probe p WHERE p.a = 1')).toEqual(['audit_probe']);
      metered.sql.exec('CREATE INDEX audit_probe_a ON audit_probe(a)');
      expect(scans('SELECT * FROM audit_probe WHERE a = 1')).toEqual([null]);
      // An index walked in order or covering is not a full-table scan to this audit (the read budget counts the rows).
      expect(scans('SELECT a FROM audit_probe')).toEqual([null]);
      return Promise.resolve();
    });
  });
});

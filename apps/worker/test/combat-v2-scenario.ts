/**
 * One scripted combat v2 raid weekend and one v2 dungeon run, through the real routes. `pnpm fixtures:capture` (see `fixture-sets.ts`) writes
 * its responses out as the `v2-*` fixtures in `apps/activity/src/fixtures`, and `combat-v2-fixtures.test.ts` checks that the server still
 * sends the shapes those files have; the client's contract test reads the files with its parsers (`server-contract.test.ts`). Nothing here is
 * hand-written output.
 *
 * The raid is a server on its second lap (slot 6: the boss outlasts four creatures of level 22), four players with a v2 talent and a Knack
 * each, played from the opening to the live finale's first second. The dungeon is a player of three level 30 creatures with v2 talents and
 * Knacks, on easy foes, who starts a run and plays its first room.
 */
import { combatV2, knownKnacks } from '@creatures/game/combat-v2';
import { createSeededRng } from '@creatures/game';
import { grantFirstTalent } from '../src/talent-v2-store';
import { dungeonPlayer } from './dungeon-helpers';
import { createRecorder, type Captured } from './fixture-contract';
import type { CoreContext } from './helpers';
import { sessionCaller } from './kit';
import { HELSINKI, joinRaid, rows } from './raid-helpers';
import { V2_WEEK, v2Player } from './raid-v2-helpers';

/** The rngs and flags the scenario's guilds must be built with, so the output is the same every time. */
export const combatV2ScenarioOptions = () => ({
  combatV2: true,
  raidRng: createSeededRng('fixture-v2-raid'),
  dungeonRng: createSeededRng('fixture-v2-dungeon'),
  gearRng: createSeededRng('fixture-v2-gear'),
});

/** Wednesday of week 2027-W02, 14:00 in Helsinki: after the daily reset. */
const DUNGEON_START = Date.parse('2027-01-13T12:00:00Z');

/** A weekend from the opening to the live finale; the creature payload, the raid view, a replay, the stats and the live snapshot are recorded on the way. */
export async function runV2RaidScenario(ctx: CoreContext): Promise<Captured> {
  ctx.clock.t = V2_WEEK.open;
  ctx.sql.exec(
    'INSERT INTO raid_track (id, slot, best_share_bp, failed_weekends) VALUES (1, 6, 2500, 2)',
  );
  const players = [1, 2, 3, 4].map((n) => v2Player(ctx, n, { level: 22 }));
  const first = players[0];
  if (first === undefined) throw new Error('no player');
  const { call } = await sessionCaller(ctx, { id: first.id, displayName: first.name });
  const { record, captured } = createRecorder(call);
  ctx.core.raid.currentWeek(HELSINKI);
  joinRaid(ctx, players);
  await record('v2-state', 'GET', '/api/state');
  await record('v2-raid-open', 'GET', '/api/raid');

  ctx.clock.t = V2_WEEK.stage1 + 30_000;
  ctx.core.raid.runDue(HELSINKI);
  await record('v2-raid-stage1', 'GET', '/api/raid');
  await record('v2-replay', 'GET', `/api/raid/replay/${V2_WEEK.id}/1/stage1`);
  await record('v2-stats', 'GET', `/api/raid/stats/${V2_WEEK.id}/1/stage1`);

  ctx.clock.t = V2_WEEK.stage2 + 30_000;
  ctx.core.raid.runDue(HELSINKI);
  ctx.clock.t = V2_WEEK.finale + 1000;
  ctx.core.raid.runDue(HELSINKI);
  await record('v2-live', 'GET', '/api/raid/live');
  return captured;
}

/** Every creature learns a v2 talent in slot 1 and the first Knack its form knows (the staging conversion, with fixed dice). */
function giveV2(ctx: CoreContext, userId: string): void {
  const rng = createSeededRng('fixture-v2-dungeon-talents');
  for (const c of rows<{ id: string; line: string; species: string }>(
    ctx.sql,
    'SELECT id, line, species FROM creatures WHERE user_id = ? ORDER BY caught_at',
    userId,
  )) {
    grantFirstTalent(ctx.sql, rng, { creatureId: c.id, userId, line: c.line, now: ctx.clock.t });
    ctx.sql.exec(
      'UPDATE creatures SET knack = ? WHERE id = ?',
      knownKnacks(c.species)[0] ?? null,
      c.id,
    );
  }
}

/** A v2 dungeon run: the start, today's page with the run open, the first room's fight and the replay. The foes are made easy for the script. */
export async function runV2DungeonScenario(ctx: CoreContext): Promise<Captured> {
  const scale = combatV2.foeScale;
  const before = { ...scale };
  scale.hpBp = 500;
  scale.atkBp = 500;
  try {
    const p = await dungeonPlayer(ctx, 1, {
      level: 30,
      species: ['tidewing', 'pyrelynx', 'thornbuck'],
    });
    giveV2(ctx, p.id);
    ctx.clock.t = DUNGEON_START;
    const { record, captured } = createRecorder(p.call);
    const start = await record(
      'v2-dungeon-start',
      'POST',
      '/api/dungeon/start',
      p.body({ idempotencyKey: 'fixture-v2-dungeon-start' }),
    );
    const state = (start.body as { state: { id: string; step: number; reachable: string[] } })
      .state;
    await record('v2-dungeon-today', 'GET', '/api/dungeon/today');
    const target = state.reachable[0] as string;
    await record('v2-dungeon-act-fight', 'POST', '/api/dungeon/act', {
      runId: state.id,
      step: state.step,
      idempotencyKey: `fixture-v2-act-${state.id}`,
      act: { type: 'move', node: target },
    });
    await record('v2-dungeon-replay', 'GET', `/api/dungeon/run/${state.id}`);
    return captured;
  } finally {
    scale.hpBp = before.hpBp;
    scale.atkBp = before.atkBp;
  }
}

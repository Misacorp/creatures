import { describe, expect, it } from 'vitest';
import dungeonAct from '../../activity/src/fixtures/v2-dungeon-act-fight.json';
import dungeonReplay from '../../activity/src/fixtures/v2-dungeon-replay.json';
import dungeonStart from '../../activity/src/fixtures/v2-dungeon-start.json';
import dungeonToday from '../../activity/src/fixtures/v2-dungeon-today.json';
import live from '../../activity/src/fixtures/v2-live.json';
import raidOpen from '../../activity/src/fixtures/v2-raid-open.json';
import raidStage1 from '../../activity/src/fixtures/v2-raid-stage1.json';
import replay from '../../activity/src/fixtures/v2-replay.json';
import state from '../../activity/src/fixtures/v2-state.json';
import stats from '../../activity/src/fixtures/v2-stats.json';
import { expectSameShape } from './fixture-contract';
import { fixtureSet } from './fixture-sets';

/**
 * The contract with the client for combat v2: the creature payload, the raid view, a stored stage, its stats, the live finale and a dungeon
 * run. The files in `apps/activity/src/fixtures` were captured from real server output (`combat-v2-scenario.ts`, see `fixture-sets.ts`);
 * these tests run the scenario again and compare the SHAPE of every response, so a change in what the server sends fails here and points at
 * the fixtures and the client's parsers (`server-contract.test.ts` reads the files with them).
 */
const UPDATE =
  'the server shape changed: run `pnpm fixtures:capture --set combat-v2`, review the diff of apps/activity/src/fixtures and update the v2 client parsers';

const sameShape = (fresh: unknown, fixture: unknown): void =>
  expectSameShape(fresh, fixture, UPDATE);

describe('the combat v2 fixtures match what the server sends', () => {
  it('has the same responses for the whole scenario', async () => {
    const captured = await fixtureSet('combat-v2').run();
    const r = captured.responses;
    sameShape(r['v2-state'], state);
    sameShape(r['v2-raid-open'], raidOpen);
    sameShape(r['v2-raid-stage1'], raidStage1);
    sameShape(r['v2-replay'], replay);
    sameShape(r['v2-stats'], stats);
    sameShape(r['v2-live'], live);
    sameShape(r['v2-dungeon-start'], dungeonStart);
    sameShape(r['v2-dungeon-today'], dungeonToday);
    sameShape(r['v2-dungeon-act-fight'], dungeonAct);
    sameShape(r['v2-dungeon-replay'], dungeonReplay);
    expect(captured.errors, UPDATE).toEqual([]);
  }, 120_000);

  it('shows what each fixture is meant to show', () => {
    expect(state.creatures[0]?.talentsV2.book.length).toBeGreaterThan(0);
    expect(raidOpen.rules).toBe(2);
    expect(raidOpen.v2.stagesPlayed).toBe(0);
    expect(raidStage1.v2.stagesPlayed).toBe(1);
    expect(replay.rules).toBe(2);
    expect(replay.phase).toBe('stage1');
    expect(stats.rules).toBe(2);
    expect(live.rules).toBe(2);
    expect(live.status).toBe('live');
    expect(dungeonStart.state.rules).toBe(2);
    expect(dungeonToday.active?.rules).toBe(2);
    expect(dungeonAct.room.rules).toBe(2);
    expect(dungeonReplay.rules).toBe(2);
  });
});

/**
 * One scripted play-through of a branching line through the real routes: a Sproutle at level 15, a trip
 * that brings a duplicate Sproutle (a card that offers Keep), Keep, the evolve screen's two answers (the
 * first Sproutle into Sunfawn, the Kept one into Thornbuck), and the errors a player can hit. The files
 * of `apps/activity/src/fixtures` named `branches-*` were captured from it (`branches-capture.test.ts`
 * prints them); `branches-fixtures.test.ts` checks that the server still sends their shapes. Nothing here
 * is hand-written output: every response comes from the server.
 */
import { createSeededRng, type Rng } from '@creatures/game';
import { rollMissingTalents } from '../src/talent-store';
import { createRecorder, type Captured } from './fixture-contract';
import { SCENARIO_START } from './gear-scenario';
import type { CoreContext } from './helpers';
import { scriptedThenSeeded, seedPlayer } from './raid-helpers';
import { newKey, sessionCaller, give, setCreature } from './kit';

/** A catch that is certain: the first common species of Verdant Hollow (Sproutle), and not shiny. */
const SPROUTLE = [0, 0, 0, 1];

export function branchesScenarioOptions() {
  return {
    rng: scriptedThenSeeded(SPROUTLE, 'branches-fixture-catch') as Rng,
    talentRng: createSeededRng('branches-fixture-talent'),
    gearRng: createSeededRng('branches-fixture-gear'),
    tripRng: createSeededRng('branches-fixture-trip'),
  };
}

export async function runBranchesScenario(ctx: CoreContext, talentRng: Rng): Promise<Captured> {
  ctx.clock.t = SCENARIO_START;
  const seeded = seedPlayer(ctx, 5, { level: 15, species: ['cindle', 'sproutle'] });
  const [explorer, sproutle] = seeded.creatureIds as [string, string];
  const user = { id: seeded.id, displayName: seeded.name };
  ctx.sql.exec(
    'INSERT INTO player_progress (user_id, expeditions_claimed) VALUES (?, 1)',
    seeded.id,
  );
  give(ctx, seeded.id, { essence: 100 });
  rollMissingTalents(ctx.storage, talentRng, ctx.clock.t);

  const { call } = await sessionCaller(ctx, user);
  const { record, refuse, captured: out } = createRecorder(call);

  // The Sproutle is at its evolution level, and its line grows two ways.
  out.responses['branches-state'] = (await call('GET', '/api/state')).body;

  // A short trip to Verdant Hollow brings a duplicate Sproutle: a card that offers Keep.
  const sent = await call('POST', '/api/expeditions', {
    creatureId: explorer,
    destination: 'verdant-hollow',
    duration: 'short',
    supplies: [],
    idempotencyKey: newKey('branches-fixture'),
  });
  const expedition = sent.body['expedition'] as { id: string; endsAt: number };
  ctx.clock.t = expedition.endsAt;
  const claimed = await record(
    'branches-claim',
    'POST',
    `/api/expeditions/${expedition.id}/claim`,
    {},
  );
  const cards = (claimed.body['state'] as { pending: { id: string }[] }).pending;
  const card = cards[0];
  if (card === undefined) throw new Error('the scenario needs a waiting duplicate');

  // Keep it: a second Sproutle, level 1.
  const kept = await record('branches-keep', 'POST', `/api/catches/${card.id}/choose`, {
    choice: 'keep',
    idempotencyKey: newKey('branches-fixture'),
  });
  const second = (kept.body['result'] as { creatureId: string }).creatureId;
  // The Kept one is not high enough yet; a form it cannot grow into is refused.
  await refuse('POST', `/api/creatures/${second}/evolve`, {
    species: 'thornbuck',
    idempotencyKey: newKey('branches-fixture'),
  }); // level 1
  setCreature(ctx, second, { level: 15 });
  await refuse('POST', `/api/creatures/${second}/evolve`, {
    species: 'voltaro',
    idempotencyKey: newKey('branches-fixture'),
  }); // not a form of this line

  // The evolve screen's two answers: the first Sproutle into Sunfawn, the Kept one into Thornbuck.
  await record('branches-evolve', 'POST', `/api/creatures/${sproutle}/evolve`, {
    species: 'sunfawn',
    idempotencyKey: newKey('branches-fixture'),
  });
  await record('branches-evolve-other', 'POST', `/api/creatures/${second}/evolve`, {
    species: 'thornbuck',
    idempotencyKey: newKey('branches-fixture'),
  });
  // The choice is permanent.
  await refuse('POST', `/api/creatures/${sproutle}/evolve`, {
    species: 'thornbuck',
    idempotencyKey: newKey('branches-fixture'),
  });
  out.responses['branches-state-after'] = (await call('GET', '/api/state')).body;
  return out;
}

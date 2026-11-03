/**
 * What each place is doing right now, in a few words, for the Places list (prototype): the same state the
 * place's own scene shows, read from the same functions ("here until Sunday", "2 ready to graduate", "waiting
 * for Mire shards", "hearth: 7 of 12 stones"). A place with nothing going on says so in one calm line. Pure
 * given the world, the look and the session's sample stores (the Market's and the Forge's), which the scenes
 * read too.
 */
import { whenText } from '../../home-view';
import { RAID_TEAM_SIZE, raidTeamIds, tripsHome, type ProtoWorld } from '../world';
import { hearthBuilt } from './bonfire-logic';
import { SAMPLE_HEARTH } from './bonfire-sample';
import { ORDER_OF, getMade, getNeed, postStatus, shardWord, type ForgeOrder } from './forge-post';
import { STAGES, brokerOnDuty, getMarket, isBuilt, stageOf } from './market-sample';
import { ceremonyParam, ceremonyPhase, readyCount, schoolNote } from './school-logic';
import { getSeats, lessonOf } from './teacher-sample';
import { teacherNote } from './teacher-logic';
import { weekClock } from './valley-logic';
import { pupilsOf } from './school-sample';
import type { PlaceId } from './valley-art';
import { GRAND_LEVEL, type ValleyLook } from './valley-places';

/** The visitor's line: here until the finale, or when he is back (no timer). */
export function visitorLine(here: boolean): string {
  return here ? 'here until Sunday' : 'back Thursday';
}

/** The Forge's line: what the smith waits for, or that the piece is coming along. */
function forgeLine(world: ProtoWorld): string {
  const order: ForgeOrder = {
    baseId: world.blueprints[0] ?? 'kelp-cap',
    made: getMade(),
    of: ORDER_OF,
    need: getNeed(world.parts),
  };
  switch (postStatus(order, world.parts)) {
    case 'waiting':
      return `waiting for ${shardWord(order.need)} shards`;
    case 'done':
      return 'the order is done';
    case 'working':
      return `${String(order.made)} / ${String(order.of)} pieces made`;
  }
}

/** The Market's line: the stall going up plank by plank, then whether a broker is on duty. */
function marketLine(): string {
  const market = getMarket();
  if (!isBuilt(market.given))
    return `stall: ${String(stageOf(market.given))} / ${String(STAGES)} planks`;
  return brokerOnDuty(market) ? 'broker on duty' : 'built, no broker yet';
}

/** The School's line: the visiting teacher's state, else how many have ticked every box of the Bronze trial. */
function schoolLine(world: ProtoWorld): string {
  const pupils = pupilsOf(world.creatures);
  const phase = ceremonyPhase(
    weekClock(world.now, world.timezone),
    typeof window === 'undefined' ? null : ceremonyParam(window.location.hash),
  );
  const hash = typeof window === 'undefined' ? '' : window.location.hash;
  const teacher = teacherNote(lessonOf(world, hash, getSeats()).state);
  return schoolNote(phase, readyCount(pupils.map((p) => p.trial)), pupils.length, teacher).line;
}

/** The bonfire's line: the hearth's stones while it is the project, then who is resting. */
function bonfireLine(world: ProtoWorld, look: ValleyLook): string {
  if (look.bonfireLevel < GRAND_LEVEL && !hearthBuilt(SAMPLE_HEARTH)) {
    return `hearth: ${String(SAMPLE_HEARTH.placed)} / ${String(SAMPLE_HEARTH.total)} stones`;
  }
  const resting = world.creatures.filter((c) => !c.away && c.busy === null).length;
  return `${String(resting)} resting by the fire`;
}

/** Every place's one-line state. */
export function placeStates(world: ProtoWorld, look: ValleyLook): Record<PlaceId, string> {
  const next = world.games.next;
  const home = tripsHome(world).length;
  return {
    cave: world.dungeon.canRun ? "today's run is open" : 'done for today',
    fair: next.open
      ? `events open until ${whenText(world.now, next.lockAt, world.timezone)}`
      : 'closed',
    school: schoolLine(world),
    house: 'quiet',
    paddock: `${String(world.creatures.filter((c) => !c.away).length)} at home`,
    forge: forgeLine(world),
    market: marketLine(),
    bonfire: bonfireLine(world, look),
    arena: `${String(raidTeamIds(world).length)} / ${String(RAID_TEAM_SIZE)} placed`,
    visitor: visitorLine(look.visitorHere),
    signpost:
      home > 0
        ? `${String(home)} home from the road`
        : `${String(world.slots.used)} / ${String(world.slots.total)} scouts out`,
  };
}

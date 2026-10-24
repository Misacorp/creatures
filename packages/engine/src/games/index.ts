/**
 * The Valley Games engine (docs/design/valley-games.md): resolves one event from its content and the
 * entrants with an injected Rng into a presentation-ready timeline. Pure (no I/O), integer math only,
 * deterministic for a seeded Rng. Live shows draw from the server's crypto Rng at the lock.
 */
import { RULES, type GamesEventDef, type Rng } from '@creatures/game';
import { runChase } from './chase';
import {
  checkEntrants,
  compareKeys,
  standingsOf,
  teamIndex,
  type KindInput,
  type KindOutcome,
} from './common';
import { runEndure } from './endure';
import { runFeast } from './feast';
import { runFill } from './fill';
import { runHaul } from './haul';
import { runKite } from './kite';
import { Show } from './show';
import { runShove } from './shove';
import { runStack } from './stack';
import { runSwim } from './swim';
import type { GamesEntrant, GamesEventResult, GamesStanding } from './types';

export * from './types';
export { HAUL_DOWN, HAUL_OFFSETS, HAUL_STAGGER_PX, HAUL_UP, HAUL_WOBBLE } from './haul';
export { FILL_BARREL_Y, FILL_DIP_Y, FILL_POUR_Y } from './fill';
export { STACK_BASE_Y, STACK_CRATE_STEP, STACK_FOOT_Y } from './stack';
export {
  KITE_CREW_Y,
  KITE_FLY,
  KITE_HOLDER_Y,
  KITE_PX_PER_METRE,
  KITE_REST_Y,
  KITE_TUMBLE,
} from './kite';
export {
  gamesAptitude,
  gamesEntrantFrom,
  gamesGoodFit,
  gamesGoodFitMin,
  type GamesCreatureInput,
  type GamesSpecies,
} from './entrant';

/** Ticks between two commentary lines at least (`RULES.games.sayGapMs`). */
export function sayGapTicks(tickMs: number): number {
  return Math.ceil(RULES.games.sayGapMs / tickMs);
}

/**
 * The end of every show: the first place (every member of a winning team) cheers, after every other beat,
 * and the closing line names it; a shared first place gets the kind's draw line instead.
 */
function crown(
  def: GamesEventDef,
  show: Show,
  standings: readonly GamesStanding[],
  out: KindOutcome,
): void {
  const at = Math.max(out.end + 1, show.lastTick);
  const first = standings.filter((s) => s.place === 1);
  show.moment(at);
  for (const s of first) {
    for (const a of s.actors) {
      show.state(at, a, 'cheer');
      show.fx(at, 'cheer', { a });
    }
  }
  const only = first.length === 1 ? first[0] : undefined;
  if (only === undefined) {
    show.closing(at, `${def.kind}.draw`);
    return;
  }
  const star = [...only.actors].sort(
    (p, q) => compareKeys(out.keys[p] ?? [], out.keys[q] ?? []) || p - q,
  )[0] as number;
  show.closing(at, `${def.kind}.win`, { a: star });
}

/**
 * Plays one event. Throws a RangeError for bad entrants (`checkEntrants`). The result's beats are sorted
 * by tick; `ticks` covers the last beat; the standings rank teams (a solo event: one creature each).
 */
export function runGamesEvent(
  def: GamesEventDef,
  entrants: readonly GamesEntrant[],
  rng: Rng,
): GamesEventResult {
  checkEntrants(def, entrants);
  const { teamOf, teams } = teamIndex(entrants);
  const show = new Show(entrants.length, sayGapTicks(def.tickMs));
  const base = { entrants, rng, show, teamOf, teams };
  let out: KindOutcome;
  switch (def.kind) {
    case 'endure':
      out = runEndure({ ...base, def } satisfies KindInput<typeof def>);
      break;
    case 'chase':
      out = runChase({ ...base, def });
      break;
    case 'feast':
      out = runFeast({ ...base, def });
      break;
    case 'swim':
      out = runSwim({ ...base, def });
      break;
    case 'shove':
      out = runShove({ ...base, def });
      break;
    case 'haul':
      out = runHaul({ ...base, def });
      break;
    case 'fill':
      out = runFill({ ...base, def });
      break;
    case 'stack':
      out = runStack({ ...base, def });
      break;
    case 'kite':
      out = runKite({ ...base, def });
      break;
  }
  const standings = standingsOf(def, entrants, teamOf, out.keys, out.scores);
  crown(def, show, standings, out);
  show.finish();
  const actors = entrants.map((e: GamesEntrant, a) => {
    const s = out.starts[a] as { x: number; y: number };
    const actor: GamesEventResult['actors'][number] = {
      a,
      entrantId: e.id,
      playerId: e.playerId,
      teamId: e.teamId,
      name: e.name,
      speciesId: e.speciesId,
      element: e.element,
      x: s.x,
      y: s.y,
    };
    if (e.shiny === true) actor.shiny = true;
    return actor;
  });
  return {
    eventId: def.id,
    kind: def.kind,
    scene: def.scene,
    team: def.team,
    tickMs: def.tickMs,
    ticks: Math.max(out.end, show.lastTick) + 1,
    actors,
    beats: show.sorted(),
    standings,
    moments: show.moments,
    momentTicks: [...show.momentTicks].sort((p, q) => p - q),
    scores: out.scores,
    outAt: out.outAt,
  };
}

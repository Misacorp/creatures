/**
 * The Valley Games engine (docs/design/valley-games.md): resolves one event from its content and the
 * entrants with an injected Rng into a presentation-ready timeline. Pure (no I/O), integer math only,
 * deterministic for a seeded Rng. Live shows draw from the server's crypto Rng at the lock.
 */
import { RULES, type GamesEventDef, type Rng } from '@creatures/game';
import { runChase } from './chase';
import { checkEntrants, standingsOf, teamIndex, type KindInput, type KindOutcome } from './common';
import { runEndure } from './endure';
import { runFeast } from './feast';
import { Show } from './show';
import { runShove } from './shove';
import { runSwim } from './swim';
import type { GamesEntrant, GamesEventResult } from './types';

export * from './types';
export { gamesAptitude, gamesEntrantFrom, type GamesCreatureInput } from './entrant';

/** Ticks between two commentary lines at least (`RULES.games.sayGapMs`). */
export function sayGapTicks(tickMs: number): number {
  return Math.ceil(RULES.games.sayGapMs / tickMs);
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
  }
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
    standings: standingsOf(def, entrants, teamOf, out.keys, out.scores),
    moments: show.moments,
    scores: out.scores,
    outAt: out.outAt,
  };
}

import { glyphOrUnknown } from '../../glyphs';
import { Sprite } from '../../sprites/Sprite';
import { creatureSpriteOrFallback } from '../../sprites/creature-sprites';
import { creatureOf, tripsOut, type ProtoWorld } from '../world';
import type { PartyState } from './party-state';

interface Timer {
  key: string;
  at: number;
  /** A glyph id, or a creature's species (its face). */
  icon: { glyph: string } | { species: string };
  label: string;
}

/** The time of day in the world's timezone ("15:20"). */
export function clock(at: number, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(at);
}

/** The next timers of the day, soonest first: trips coming home, jobs finishing, the Games' show, the raid's next phase. */
export function nextTimers(world: ProtoWorld, count: number): Timer[] {
  const list: Timer[] = [];
  for (const t of tripsOut(world)) {
    const c = creatureOf(world, t.creatureId);
    list.push({ key: t.id, at: t.endsAt, icon: { species: c.species }, label: 'home from a trip' });
  }
  for (const j of world.jobs) {
    if (j.status !== 'running') continue;
    list.push({ key: j.id, at: j.endsAt, icon: { glyph: 'anvil' }, label: 'craft done' });
  }
  if (world.games.next.open) {
    list.push({ key: 'games', at: world.games.next.showAt, icon: { glyph: 'trophy' }, label: 'Games show' });
  }
  if (world.raid.next !== null) {
    list.push({ key: 'raid', at: world.raid.next.at, icon: { glyph: 'blade' }, label: 'raid phase' });
  }
  return list
    .filter((t) => t.at > world.now)
    .sort((a, b) => a.at - b.at)
    .slice(0, count);
}

/** The wide screen's quiet panel when nothing is in focus: the next three timers, icons and times. */
export function Today({ state }: { state: PartyState }) {
  const timers = nextTimers(state.world, 3);
  return (
    <ul class="pp-today pix-panel" aria-label="Coming up today">
      {timers.map((t) => (
        <li key={t.key} aria-label={`${t.label} at ${clock(t.at, state.world.timezone)}`}>
          <Sprite
            sprite={'glyph' in t.icon ? glyphOrUnknown(t.icon.glyph) : creatureSpriteOrFallback(t.icon.species)}
            scale={'glyph' in t.icon ? 3 : 2}
          />
          <span class="pp-today-at">{clock(t.at, state.world.timezone)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * What a place shows of the stories that wait there (prototype, dev only; `systems/return.md`, V-RET-0): the
 * valley's markers lead into their places, and a place tells its untold stories in place, the way the Gazette
 * tells them (a headline, at most one short line, the finds as themselves). Leaving a place counts its stories
 * as seen (nothing needs a tap, F-1), so its marker is gone from the valley. These are the pure parts: which
 * markers are still waiting, and who stands where while the stories are told. No DOM, no clock.
 */
import type { PlaceId } from '../valley/valley-art';
import {
  MAX_ACTORS,
  type Actor,
  type Marker,
  type Scene,
  type Story,
  type Who,
} from './highlights';

/** Most creatures standing in one place while its stories are told (the Gazette's picture shows three). */
export const MAX_STAGE = MAX_ACTORS + 1;
/** Valley pixels between two creatures on the stage. */
export const STAGE_GAP = 24;

/** The markers the player has not been to yet: a place seen once is told and gone. */
export function unseenMarkers(markers: readonly Marker[], seen: readonly PlaceId[]): Marker[] {
  return markers.filter((m) => !seen.includes(m.place));
}

/** The stories waiting at a place, the biggest first; none when there is no marker or it has been seen. */
export function storiesAt(
  markers: readonly Marker[],
  place: PlaceId,
  seen: readonly PlaceId[],
): Story[] {
  if (seen.includes(place)) return [];
  return markers.find((m) => m.place === place)?.stories ?? [];
}

const whoKey = (who: Who): string =>
  who.kind === 'cast' ? `cast:${String(who.slot)}` : `species:${who.species}`;

/**
 * Who stands in a place while its stories are told: the creatures of all its stories, each once, in telling
 * order, in one row (so two stories never put two figures on one spot), and the props once each (sparkles above
 * the middle, anything else beside the row). Offsets are valley pixels from the stage's spot, as a scene's.
 */
export function stageOf(stories: readonly Story[]): Pick<Scene, 'actors' | 'props'> {
  const seen = new Set<string>();
  const who: Actor[] = [];
  for (const story of stories) {
    for (const actor of story.scene.actors) {
      const key = whoKey(actor.who);
      if (seen.has(key) || who.length >= MAX_STAGE) continue;
      seen.add(key);
      who.push(actor);
    }
  }
  const n = who.length;
  const actors: Actor[] = who.map((a, i) => ({
    who: a.who,
    dx: (i - (n - 1) / 2) * STAGE_GAP,
    dy: 8,
    ...(n > 1 && i >= Math.ceil(n / 2) ? { flip: true } : {}),
  }));
  const kinds = new Set<string>();
  const props: Scene['props'] = [];
  const beside = ((n - 1) / 2) * STAGE_GAP + 20;
  for (const story of stories) {
    for (const p of story.scene.props) {
      const key = p.prop.kind === 'glyph' ? `glyph:${p.prop.id}` : p.prop.kind;
      if (kinds.has(key)) continue;
      kinds.add(key);
      if (p.prop.kind === 'glyph' && p.prop.id === 'sparkle') {
        props.push({ prop: p.prop, dx: 0, dy: -20, big: true });
      } else {
        props.push({
          prop: p.prop,
          dx: beside,
          dy: p.prop.kind === 'sack' ? -4 : -2,
          ...(p.big === true ? { big: true } : {}),
        });
      }
    }
  }
  return { actors, props };
}

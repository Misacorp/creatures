/**
 * The House's shelf of keepsakes (V-COM-3): the small thanks for helping build a level, one kind for each place, with how many the
 * player holds. They have no value and nothing to farm; only the player's own are shown. Nothing is drawn with none.
 */
import type { ValleyVisit } from '../api';
import { Glyph } from './parts';
import { COMMONS_NAMES, commonsOf } from './commons-view';

/** The keepsakes a player holds: a place and how many (only places with some). */
export function keepsakesOf(visit: ValleyVisit | null): { place: string; count: number }[] {
  return (commonsOf(visit)?.places ?? [])
    .filter((p) => p.keepsakes > 0)
    .map((p) => ({ place: p.id, count: p.keepsakes }));
}

export function Keepsakes({ visit }: { visit: ValleyVisit | null }) {
  const held = keepsakesOf(visit);
  if (held.length === 0) return null;
  return (
    <section class="cm-keepsakes" aria-label="Keepsakes">
      <h3 class="pix sp-sub">Keepsakes</h3>
      <ul class="cm-shelf">
        {held.map((k) => (
          <li key={k.place} class="cm-keepsake">
            <Glyph id="gift" scale={2} />
            <strong class="pix cm-keepsake-name">{COMMONS_NAMES[k.place] ?? k.place}</strong>
            <span class="cm-keepsake-line">
              {k.count === 1 ? 'Helped build a level' : `Helped build ${String(k.count)} levels`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

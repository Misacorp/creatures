import { cssVars } from './css-vars';
import type { Profile } from './expedition-types';
import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { journalPlaces, journalProgressText, type JournalPlace } from './journal-view';
import { Sprite } from './sprites/Sprite';

function PlaceGroup({ place, open }: { place: JournalPlace; open: boolean }) {
  return (
    <details class="journal-place" open={open}>
      <summary>
        <span class="pix">{place.name}</span>{' '}
        <span class="muted">
          {place.found} of {place.total}
        </span>
      </summary>
      {place.sets.length > 0 && (
        <ul class="journal-sets" aria-label="Sets">
          {place.sets.map((set) => (
            <li key={set.id} class={set.complete ? 'journal-set complete' : 'journal-set'}>
              <GlossaryTag entry="journal-set" look="chip" class="tag">
                {set.name}
              </GlossaryTag>{' '}
              <span class="muted">
                {set.found} of {set.total}
                {set.complete && ' (complete)'}
              </span>
            </li>
          ))}
        </ul>
      )}
      <ul class="journal-pages">
        {place.pages.map((page) => (
          <li key={page.id} class={`journal-page${page.found ? ' found' : ' blank'}`}>
            {page.found ? (
              <>
                <p class="pix">
                  <Sprite sprite={glyphOrUnknown('journal')} scale={2} /> {page.title}
                </p>
                <p class="journal-text">{page.text}</p>
              </>
            ) : (
              <p class="muted">
                <Sprite sprite={glyphOrUnknown('lock')} scale={2} /> A page you have not found yet
              </p>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * The Journal: every pre-written page, grouped by place, with how many are found and which sets are
 * complete. A page that is not found is a blank; its words are never in the page. The pages hint at how
 * the game works, so reading them is worth it.
 */
export function Journal({ profile }: { profile: Pick<Profile, 'journal'> }) {
  const places = journalPlaces(profile);
  const found = profile.journal.found.length;
  const total = Math.max(1, profile.journal.total);
  const pct = Math.floor((found * 1000) / total) / 10;
  return (
    <section class="journal" aria-labelledby="journal-title">
      <h3 id="journal-title">
        <Sprite sprite={glyphOrUnknown('journal')} scale={2} class="inline-glyph" /> Journal{' '}
        <GlossaryTag entry="journal" look="help" />
      </h3>
      <p class="muted">{journalProgressText(profile)}. Trips turn up new pages.</p>
      <div
        class="xp"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label={journalProgressText(profile)}
      >
        <span ref={cssVars({ '--pct': `${String(pct)}%` })} />
      </div>
      {places.map((place) => (
        <PlaceGroup key={place.place} place={place} open={place.found > 0} />
      ))}
    </section>
  );
}

import { useState } from 'preact/hooks';
import { Tag } from './ui/Tag';
import type { Profile } from './expedition-types';
import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { journalPlaces, journalProgressText, type JournalPlace } from './journal-view';
import { Sprite } from './sprites/Sprite';
import { Bar } from './ui/Bar';
import { Accordion } from './ui/Accordion';
import { ChoiceButton, ChoiceList } from './ui/ChoiceList';
import { SidePanel } from './ui/SidePanel';
import { WideLayout } from './ui/WideLayout';
import { useWide } from './ui/wide-layout';

/** One place's sets and pages: the same list inside the phone's accordion and the desktop's side panel. */
function PlaceBody({ place }: { place: JournalPlace }) {
  return (
    <>
      {place.sets.length > 0 && (
        <ul class="journal-sets" aria-label="Sets">
          {place.sets.map((set) => (
            <li key={set.id} class={set.complete ? 'journal-set complete' : 'journal-set'}>
              <Tag entry="journal-set">{set.name}</Tag>{' '}
              <span class="muted">
                {set.found} / {set.total}
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
    </>
  );
}

function PlaceGroup({ place, open }: { place: JournalPlace; open: boolean }) {
  return (
    <Accordion
      title={<span class="pix">{place.name}</span>}
      meta={`${String(place.found)} / ${String(place.total)}`}
      class="journal-place"
      defaultOpen={open}
    >
      <PlaceBody place={place} />
    </Accordion>
  );
}

/**
 * The Journal (the page under the Home board's Journal pin, which supplies the title): every pre-written page, grouped by place, with how many are found and which sets are
 * complete. A page that is not found is a blank; its words are never in the page. The pages hint at how
 * the game works, so reading them is worth it.
 */
export function Journal({ profile }: { profile: Pick<Profile, 'journal'> }) {
  const places = journalPlaces(profile);
  const found = profile.journal.found.length;
  const total = Math.max(1, profile.journal.total);
  const wide = useWide();
  // Wide: the place whose pages are open beside the list (the first with a page found, else the first).
  const [picked, setPicked] = useState<string | null>(null);
  const selected =
    places.find((place) => place.place === picked) ??
    places.find((place) => place.found > 0) ??
    places[0];
  const head = (
    <>
      <p class="muted">
        {journalProgressText(profile)}. Trips turn up new pages.{' '}
        <GlossaryTag entry="journal" look="help" />
      </p>
      <Bar value={found} max={total} label={journalProgressText(profile)} />
    </>
  );
  if (!wide || selected === undefined) {
    return (
      <section class="journal" aria-label="Journal">
        {head}
        {places.map((place) => (
          <PlaceGroup key={place.place} place={place} open={place.found > 0} />
        ))}
      </section>
    );
  }
  // From 60 rem: the places as a list on the left (each with its n / m), the chosen place's pages on the right.
  return (
    <section class="journal journal-wide" aria-label="Journal">
      <WideLayout
        wide
        class="journal-layout"
        main={
          <>
            {head}
            <ChoiceList label="Places">
              {places.map((place) => (
                <ChoiceButton
                  key={place.place}
                  label={place.name}
                  line={`${String(place.found)} / ${String(place.total)}`}
                  disabled={false}
                  selected={place.place === selected.place}
                  onClick={() => {
                    setPicked(place.place);
                  }}
                />
              ))}
            </ChoiceList>
          </>
        }
        panel={
          <SidePanel title={selected.name} titleId="journal-place-title" class="journal-panel">
            <PlaceBody place={selected} />
          </SidePanel>
        }
      />
    </section>
  );
}

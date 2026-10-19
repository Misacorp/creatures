import { useState } from 'preact/hooks';
import { Banner } from './Banner';
import { Stars } from './ExpeditionIcons';
import { ExperienceGainRow } from './ExperienceGainRow';
import { FindCard } from './FindCard';
import { firstPick, type CatchPick } from './find-view';
import { LootList } from './LootList';
import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { Sprite } from './sprites/Sprite';
import type { TripResultView } from './trip-result-view';
import { Accordion } from './ui/Accordion';
import { Callout } from './ui/Callout';
import { CountBadge } from './ui/CountBadge';
import { GameIcon } from './ui/GameIcon';
import { RevealShell } from './ui/RevealShell';
import { Tag } from './ui/Tag';
import { XpGain, XpList } from './ui/XpGain';

/** The sentence at the top: who went where for how long, and how it went (the names in the pixel font). */
function Headline({ view }: { view: TripResultView }) {
  const who = <span class="pix">{view.explorer?.name ?? 'The explorer'}</span>;
  const where = <span class="pix">{view.place?.name ?? 'the trip'}</span>;
  const found = view.finds.length > 0;
  switch (view.tone) {
    case 'failed':
      return (
        <>
          {who}'s trip to {where} came to nothing.
        </>
      );
    case 'recalled':
      return (
        <>
          {who} came home early from {where}
          {found ? ' with…' : '.'}
        </>
      );
    case 'home':
      return (
        <>
          {who} {view.hours === null ? 'is back from' : `spent ${String(view.hours)} hours at`}{' '}
          {where}
          {found ? ' and found…' : '.'}
        </>
      );
  }
}

/**
 * A claimed trip, on one card: the place's banner with the explorer on it and one sentence of who went
 * where; the creatures found, each a card, a duplicate with its choice as radio rows (Recommended picked
 * at first, a choice that cannot be made greyed with the reason); what came home; one progress block
 * (explorer XP, level, familiarity); a new slot, rank gifts and journal pages; and one full-width Claim
 * that confirms every duplicate's pick and closes the card. Every number is the server's.
 */
export function TripResult({
  view,
  busy,
  journalOpen = true,
  onClaim,
}: {
  view: TripResultView;
  busy: boolean;
  journalOpen?: boolean;
  /** Confirms the picks (empty when nothing waits) and closes the card when they all went through. */
  onClaim: (picks: CatchPick[]) => void;
}) {
  const [picked, setPicked] = useState<Record<string, string>>({});
  const pickOf = (key: string, options: Parameters<typeof firstPick>[0]): string | null =>
    picked[key] ?? firstPick(options);
  const waiting = view.finds.filter((f) => f.choice !== null);
  const failed = view.tone === 'failed';
  return (
    <RevealShell
      id="trip-result-heading"
      title={<Headline view={view} />}
      class={`trip-result ${view.tone}`}
      status
      arrive
      hero={
        view.place !== null && (
          <Banner
            destination={view.place.id}
            {...(view.explorer === null
              ? {}
              : {
                  walker: {
                    species: view.explorer.species,
                    shiny: view.explorer.shiny,
                    fraction: 0.82,
                    info: null,
                    id: view.explorer.id,
                  },
                })}
          />
        )
      }
      footer={
        <div class="tr-foot">
          <button
            type="button"
            class="primary"
            disabled={busy}
            onClick={() => {
              onClaim(
                waiting.flatMap((find) => {
                  const choice = find.choice;
                  if (choice === null) return [];
                  const option = choice.options.find(
                    (o) => o.key === pickOf(find.key, choice.options),
                  );
                  return option === undefined
                    ? []
                    : [{ card: choice.card, request: option.request }];
                }),
              );
            }}
          >
            {failed ? 'Got it' : 'Claim'}
          </button>
        </div>
      }
    >
      {view.failure !== null && (
        <div class="trip-failed" role="alert">
          <Sprite sprite={glyphOrUnknown('skull')} scale={4} />
          <p>{view.failure}</p>
        </div>
      )}
      {view.pushOn !== null && <p class="muted push-result">{view.pushOn}</p>}

      {view.finds.length > 0 && (
        <ul class="tr-finds" aria-label="Creatures found">
          {view.finds.map((find) => (
            <FindCard
              key={find.key}
              find={find}
              picked={find.choice === null ? null : pickOf(find.key, find.choice.options)}
              disabled={busy}
              onPick={(key) => {
                setPicked({ ...picked, [find.key]: key });
              }}
            />
          ))}
        </ul>
      )}
      {view.noCatch !== null && <p class="muted no-catch">{view.noCatch}</p>}
      {view.autoSettled.map((line) => (
        <p key={line} class="muted auto-settled">
          {line}
        </p>
      ))}

      {(view.counts.length > 0 || view.loot !== null) && (
        <div class="tr-loot">
          <p class="label">Brought home</p>
          {view.counts.length > 0 && (
            <p class="tr-counts">
              {view.counts.map(({ key, ...badge }) => (
                <CountBadge key={key} {...badge} />
              ))}
            </p>
          )}
          {view.loot !== null && <LootList loot={view.loot} counted label="Gear and blueprints" />}
        </div>
      )}

      {(view.xp !== null || view.growth !== null || view.stars !== null) && (
        <XpList>
          {view.xp !== null && (
            <XpGain
              label={<GlossaryTag entry="explorer-rank">Explorer</GlossaryTag>}
              head={<span class="pix">Rank {view.xp.rank}</span>}
              gain={`+${String(view.xp.gained)} XP`}
              tags={
                view.xp.rankedUp ? (
                  <Tag kind="badge" tone="good">
                    Rank up!
                  </Tag>
                ) : undefined
              }
              bar={{
                value: view.xp.value,
                max: view.xp.max,
                label: `${view.explorer?.name ?? 'The explorer'}'s explorer XP`,
                text: view.xp.text,
                kind: 'explorer',
              }}
            />
          )}
          {view.growth !== null && <ExperienceGainRow gain={view.growth} />}
          {view.stars !== null && (
            <>
              <dt class="pix">
                <GlossaryTag entry="familiarity">Familiarity</GlossaryTag>
              </dt>
              <dd>
                <Stars stars={view.stars.stars} />
                {view.stars.gained ? (
                  <strong class="good-note">New star!</strong>
                ) : (
                  <span class="muted">
                    {view.stars.trips} {view.stars.trips === 1 ? 'trip' : 'trips'}
                  </span>
                )}
              </dd>
            </>
          )}
        </XpList>
      )}

      {view.slot !== null && (
        <Callout as="p" class="slot-unlocked">
          <Sprite sprite={glyphOrUnknown('sparkle')} scale={3} />{' '}
          <GlossaryTag entry="expedition-slot" look="text">
            {view.slot}
          </GlossaryTag>
        </Callout>
      )}
      {view.gifts.map((gift) => (
        <Callout key={gift.rank} class="rank-gift">
          <p class="label">
            <Sprite sprite={glyphOrUnknown('sparkle')} scale={2} /> {gift.title}
          </p>
          <ul class="gift-lines" aria-label={gift.title}>
            {gift.lines.map((line) => (
              <li key={line.key}>
                <GameIcon icon={line.icon} scale={3} />
                <span>{line.text}</span>
              </li>
            ))}
          </ul>
        </Callout>
      ))}

      {view.journal.map((page) => {
        const set =
          page.set === null ? null : (
            <p class="muted">
              <GlossaryTag entry="journal-set" look="text">
                Set
              </GlossaryTag>
              : {page.set}
              {page.setComplete && <strong class="good-note"> Complete!</strong>}
            </p>
          );
        return journalOpen ? (
          <div key={page.title} class="tr-journal">
            <p class="tr-journal-title pix">
              <Sprite sprite={glyphOrUnknown('journal')} scale={2} />
              <span>{page.title}</span>
            </p>
            <p class="journal-text">{page.text}</p>
            {set}
          </div>
        ) : (
          <Accordion key={page.title} title={`Journal: ${page.title}`} variant="compact">
            <p class="journal-text">{page.text}</p>
            {set}
          </Accordion>
        );
      })}
    </RevealShell>
  );
}

import { Tag } from './ui/Tag';
import { nextRankXp } from '@creatures/game';
import type { ClaimResult, Creature } from './api';
import {
  failureLine,
  foundSupplies,
  journalPages,
  nothingInLoot,
  pileSourceOf,
  pushOnLine,
  rankGiftViews,
  revealTitle,
  revealTone,
  slotLine,
  starsView,
  xpView,
} from './claim-view';
import type { Trip } from './expedition-types';
import { Stars } from './ExpeditionIcons';
import { GameIcon } from './ui/GameIcon';
import { catchBadgeTags, creatureName, getSpecies, speciesName } from './game';
import { partCountItems } from './GearArt';
import { LootList } from './GearLoot';
import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { explorerInfo } from './send-view';
import { SmallCreature } from './SmallCreature';
import { XpBar } from './XpBar';
import { ElementChip } from './sprites/ElementChip';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { destinationName, explorerXp, supplyKindOf } from './trip-view';
import { RevealShell } from './ui/RevealShell';
import { RewardSummary } from './ui/RewardSummary';

/**
 * What a claimed trip brought home. A trip that failed (a risky push-on that did not work out) is a
 * clear red state with what happened and nothing else. Otherwise: the catches, the loot as the
 * reusable pile with counts beside it, the explorer's XP and any rank-up, the familiarity stars, a new
 * expedition slot, and the journal pages found. Everything is worked out from the server's result; the
 * text is in the page from the start and the animations only decorate it (none with reduced motion).
 */
export function TripReveal({
  result,
  trip,
  creature,
  onDismiss,
}: {
  result: ClaimResult;
  /** The trip that was claimed, as the fresh state lists it (for its place). */
  trip: Trip | undefined;
  /** The explorer, as the fresh state lists it (its new rank and XP). */
  creature: Creature | undefined;
  onDismiss: () => void;
}) {
  const tone = revealTone(result);
  const failure = failureLine(result);
  const push = pushOnLine(result);
  const source = pileSourceOf(result);
  const xp = xpView(result);
  const stars = starsView(result);
  const slot = slotLine(result);
  const pages = journalPages(result);
  const gifts = rankGiftViews(result);
  const supplies = foundSupplies(result);
  const loot = result.loot;
  const lootEmpty = nothingInLoot(result);
  const name = creature === undefined ? 'The explorer' : creatureName(creature);
  const place = trip === undefined ? null : destinationName(trip.destination);
  const info = creature === undefined ? null : explorerInfo(creature);
  const sprite =
    creature === undefined ? null : (
      <Sprite sprite={creatureSpriteOrFallback(creature.species)} scale={4} />
    );
  const bar =
    xp === null
      ? null
      : explorerXp(
          creature?.explorer ?? { rank: xp.rank, xp: xp.total, nextRankXp: nextRankXp(xp.rank) },
        );
  const nothing = result.catches.length === 0 && lootEmpty && tone !== 'failed';
  return (
    <RevealShell
      id="trip-reveal-heading"
      title={revealTitle(tone)}
      class={`trip-reveal ${tone}`}
      status
      onDismiss={onDismiss}
    >
      {creature !== undefined && (
        <p class="reveal-who">
          {info === null ? (
            sprite
          ) : (
            <SmallCreature id={creature.id} info={info}>
              {sprite}
            </SmallCreature>
          )}
          <span>
            <strong class="pix">{name}</strong>
            {place !== null && <> at {place}</>}
          </span>
        </p>
      )}

      {failure !== null && (
        <div class="trip-failed" role="alert">
          <Sprite sprite={glyphOrUnknown('skull')} scale={4} />
          <p>{failure}</p>
        </div>
      )}
      {push !== null && <p class="muted push-result">{push}</p>}

      {nothing && <p>Nothing came back this time.</p>}

      {result.catches.length > 0 && (
        <ul class="reveal-catches" aria-label="Creatures found">
          {result.catches.map((entry, index) => {
            const species = getSpecies(entry.species);
            return (
              <li key={index}>
                <Sprite sprite={creatureSpriteOrFallback(entry.species)} scale={3} bob />
                <strong>{speciesName(entry.species)}</strong>{' '}
                {species !== undefined && <ElementChip element={species.element} />}{' '}
                {catchBadgeTags(entry).map((badge) => (
                  <Tag
                    key={badge.text}
                    kind="badge"
                    {...(badge.entry === null ? {} : { entry: badge.entry })}
                  >
                    {badge.text}
                  </Tag>
                ))}
              </li>
            );
          })}
        </ul>
      )}

      {!lootEmpty && loot !== undefined && (
        <div class="trip-loot">
          <p class="label">What it brought home</p>
          <RewardSummary
            source={source}
            prefix="Loot"
            countsLabel="Parts and supplies"
            counts={[
              ...partCountItems(loot.parts),
              ...supplies.map((s) => ({
                key: s.id,
                icon: { kind: 'supply', id: supplyKindOf(s.id) ?? 'unknown' } as const,
                amount: s.amount,
                name: s.name,
              })),
            ]}
          >
            <LootList loot={loot} counted label="Gear and blueprints" />
          </RewardSummary>
        </div>
      )}

      {xp !== null && bar !== null && (
        <div class="trip-xp">
          <p>
            <strong class="pix">+{xp.gained}</strong> explorer XP for {name}
          </p>
          {xp.rankedUp && (
            <p class="rank-up">
              <Sprite sprite={glyphOrUnknown('rank')} scale={3} />{' '}
              <GlossaryTag entry="explorer-rank" look="text">
                Rank up!
              </GlossaryTag>{' '}
              Rank {xp.rankBefore} to rank {xp.rank}
            </p>
          )}
          <XpBar
            value={bar.value}
            max={bar.max}
            label={`${name}'s explorer XP`}
            {...(bar.text === undefined ? {} : { text: bar.text })}
            startCap={bar.startCap}
            {...(bar.endCap === undefined ? {} : { endCap: bar.endCap })}
          />
          {gifts.map((gift) => (
            <div key={gift.rank} class="rank-gift" role="note">
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
            </div>
          ))}
        </div>
      )}

      {stars !== null && (
        <p class="trip-stars">
          <GlossaryTag entry="familiarity" look="text">
            Familiarity
          </GlossaryTag>{' '}
          <Stars stars={stars.stars} />{' '}
          {stars.gained ? (
            <strong class="good-note">A new star!</strong>
          ) : (
            <span class="muted">
              {stars.trips} {stars.trips === 1 ? 'trip' : 'trips'} here
            </span>
          )}
        </p>
      )}

      {slot !== null && (
        <p class="slot-unlocked" role="note">
          <Sprite sprite={glyphOrUnknown('sparkle')} scale={3} />{' '}
          <GlossaryTag entry="expedition-slot" look="text">
            {slot}
          </GlossaryTag>
        </p>
      )}

      {pages.length > 0 && (
        <div class="trip-pages">
          <p class="label">
            <GlossaryTag entry="journal" look="text">
              Journal
            </GlossaryTag>
          </p>
          <ul class="journal-found">
            {pages.map((page) => (
              <li key={page.entryId} class="journal-page found">
                <p class="pix">
                  <Sprite sprite={glyphOrUnknown('journal')} scale={2} /> {page.title}
                </p>
                <p class="journal-text">{page.text}</p>
                {page.setName !== null && (
                  <p class="muted">
                    <GlossaryTag entry="journal-set" look="text">
                      Set
                    </GlossaryTag>
                    : {page.setName}
                    {page.setComplete && <strong class="good-note"> Complete!</strong>}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </RevealShell>
  );
}

import { nextRankXp } from '@creatures/game';
import type { ClaimResult, Creature } from './api';
import {
  failureLine,
  foundSupplies,
  journalPages,
  nothingInLoot,
  pileLabel,
  pileSourceOf,
  pushOnLine,
  revealTitle,
  revealTone,
  slotLine,
  starsView,
  xpView,
} from './claim-view';
import { cssVars } from './css-vars';
import type { Trip } from './expedition-types';
import { ExpIcon, Stars } from './ExpeditionIcons';
import { catchBadgeTags, creatureName, getSpecies, speciesName } from './game';
import { PartCount } from './GearArt';
import { LootList } from './GearLoot';
import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { RewardPile } from './RewardPile';
import { explorerInfo } from './send-view';
import { SmallCreature } from './SmallCreature';
import { ElementChip } from './sprites/ElementChip';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { destinationName, supplyKindOf, xpBar } from './trip-view';
import { partsEntries } from './gear-view';

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
      : xpBar(
          creature?.explorer ?? { rank: xp.rank, xp: xp.total, nextRankXp: nextRankXp(xp.rank) },
        );
  const nothing = result.catches.length === 0 && lootEmpty && tone !== 'failed';
  return (
    <section
      class={`reveal-card trip-reveal ${tone}`}
      role="status"
      aria-labelledby="trip-reveal-heading"
    >
      <h3 id="trip-reveal-heading">{revealTitle(tone)}</h3>
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
                {catchBadgeTags(entry).map((badge) =>
                  badge.entry === null ? (
                    <span key={badge.text} class="badge">
                      {badge.text}
                    </span>
                  ) : (
                    <GlossaryTag key={badge.text} entry={badge.entry} look="chip" class="badge">
                      {badge.text}
                    </GlossaryTag>
                  ),
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!lootEmpty && loot !== undefined && (
        <div class="trip-loot">
          <p class="label">What it brought home</p>
          <div class="reward-row">
            <RewardPile source={source} label={pileLabel(source)} />
            <ul class="reward-badges" aria-label="Parts and supplies">
              {partsEntries(loot.parts).map((p) => (
                <li key={p.kind}>
                  <PartCount kind={p.kind} amount={p.amount} />
                </li>
              ))}
              {supplies.map((s) => (
                <li key={s.id}>
                  <span class="part-count supply-count">
                    <ExpIcon
                      icon={{ kind: 'supply', id: supplyKindOf(s.id) ?? 'unknown' }}
                      scale={2}
                    />
                    <span class="part-amount pix">{s.amount}</span>
                    <span class="cost-name">{s.name}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <LootList loot={{ ...loot, parts: {}, supplies: [] }} label="Gear and blueprints" />
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
          <div
            class="xp"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(bar.pct)}
            aria-label={`Explorer XP: ${bar.text}`}
          >
            <span ref={cssVars({ '--pct': `${String(bar.pct)}%` })} />
          </div>
          <p class="muted">
            Rank {xp.rank}: {bar.text}
          </p>
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

      <p>
        <button type="button" class="primary" onClick={onDismiss}>
          Got it
        </button>
      </p>
    </section>
  );
}

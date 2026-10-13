import type { Creature } from './api';
import { cssVars } from './css-vars';
import type { Profile } from './expedition-types';
import { GlossaryTag } from './Glossary';
import { bonusSummary, explorerRows, milestoneViews, statRows } from './journal-view';
import { explorerInfo } from './send-view';
import { SmallCreature } from './SmallCreature';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { xpBar } from './trip-view';

/**
 * A small profile: what the account has done on expeditions (stats), the milestones with the tiny
 * permanent bonuses they give, and every explorer's rank. Account-wide things are only stats and tiny
 * bonuses; ranks and stars belong to the creatures.
 */
export function ExplorerProfile({
  profile,
  creatures,
}: {
  profile: Profile;
  creatures: readonly Creature[];
}) {
  const bonus = bonusSummary(profile.bonuses);
  const explorers = explorerRows(profile, creatures);
  return (
    <section class="profile" aria-labelledby="profile-title">
      <h3 id="profile-title">Explorer profile</h3>

      <h4>Stats</h4>
      <dl class="stat-grid">
        {statRows(profile.stats).map((row) => (
          <div key={row.stat} class="stat">
            <dt>{row.label}</dt>
            <dd class="pix">{row.value}</dd>
          </div>
        ))}
      </dl>

      <h4>
        <GlossaryTag entry="milestone" look="text">
          Milestones
        </GlossaryTag>
      </h4>
      <p class="muted">
        {bonus === null
          ? 'No bonuses yet. Each milestone gives a very small one.'
          : `Your bonuses: ${bonus}.`}
      </p>
      <ul class="milestones">
        {milestoneViews(profile.milestones).map((m) => (
          <li key={m.id} class={m.reached ? 'milestone reached' : 'milestone'}>
            <p>
              <strong class="pix">{m.name}</strong> <span class="muted">{m.bonus}</span>
              {m.reached && <span class="badge good"> Reached</span>}
            </p>
            <div
              class="xp"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(m.pct)}
              aria-label={`${m.name}: ${m.progress}`}
            >
              <span ref={cssVars({ '--pct': `${String(m.pct)}%` })} />
            </div>
            <p class="muted">{m.progress}</p>
          </li>
        ))}
      </ul>

      <h4>
        <GlossaryTag entry="explorer-rank" look="text">
          Explorers
        </GlossaryTag>
      </h4>
      <ul class="explorer-rows">
        {explorers.map((row) => {
          const creature = creatures.find((c) => c.id === row.creatureId);
          const info = creature === undefined ? null : explorerInfo(creature);
          const bar = xpBar(row);
          const sprite =
            creature === undefined ? null : (
              <Sprite sprite={creatureSpriteOrFallback(creature.species)} scale={3} />
            );
          return (
            <li key={row.creatureId} class="explorer-row">
              {creature !== undefined && info !== null ? (
                <SmallCreature id={`profile:${creature.id}`} info={info}>
                  {sprite}
                </SmallCreature>
              ) : (
                sprite
              )}
              <div class="explorer-text">
                <p class="pix">
                  {row.name} <span class="muted">rank {row.rank}</span>
                </p>
                <div
                  class="xp"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(bar.pct)}
                  aria-label={`${row.name}'s explorer XP: ${bar.text}`}
                >
                  <span ref={cssVars({ '--pct': `${String(bar.pct)}%` })} />
                </div>
                <p class="muted">
                  {bar.text} · {row.trips} {row.trips === 1 ? 'trip' : 'trips'}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

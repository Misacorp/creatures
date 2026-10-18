import {
  abilityLine,
  abilitySummary,
  adaptationLines,
  barMax,
  cardTitle,
  creatureLine,
  headline,
  hpLeftText,
  knockoutLine,
  outcomeLine,
  playerLine,
  reactionLine,
  splitVisible,
  thresholdText,
  whoText,
} from './after-action';
import { fetchStats, type AfterActionStats, type RaidPhaseId } from './raid-api';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { Accordion } from './ui/Accordion';
import { useLoaded } from './use-loaded';

/** Longer lists show this many lines and keep the rest behind "Show all". */
const VISIBLE_LINES = 6;

/**
 * The after-action card of one resolved stage of the caller's party: it asks the server for the
 * numbers and shows them. It only states what happened; it never says what to change.
 */
export function AfterAction({
  week,
  party,
  phase,
  onReplay,
}: {
  week: string;
  party: number;
  phase: RaidPhaseId;
  /** Shows a "Watch replay" button when given. */
  onReplay?: () => void;
}) {
  // A new stage starts empty: another stage's numbers never show while this one loads.
  const loaded = useLoaded(
    () => fetchStats(week, party, phase),
    [week, party, phase],
    undefined,
    true,
  );
  const stats = loaded.value;

  return (
    <div class="after-action">
      {stats === null && !loaded.failed && <p class="muted">Loading the fight stats...</p>}
      {loaded.failed && <p class="muted">The fight stats are not available right now.</p>}
      {stats !== null && <AfterActionCard stats={stats} />}
      {onReplay !== undefined && (
        <p>
          <button type="button" onClick={onReplay}>
            Watch replay
          </button>
        </p>
      )}
    </div>
  );
}

/** A list that shows its first lines, with the rest in a collapsed "Show all". */
function Lines({ lines }: { lines: readonly string[] }) {
  const { shown, rest } = splitVisible(lines, VISIBLE_LINES);
  return (
    <>
      <ul class="bullet-list">
        {shown.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ul>
      {rest.length > 0 && (
        <Accordion title={`Show all ${String(lines.length)}`} variant="compact">
          <ul class="bullet-list">
            {rest.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        </Accordion>
      )}
    </>
  );
}

function AfterActionCard({ stats }: { stats: AfterActionStats }) {
  const totalDamage = stats.players.reduce((sum, p) => sum + p.damage, 0);
  const playerMax = barMax(stats.players.map((p) => p.damage));
  const creatureMax = barMax(stats.creatures.map((c) => c.damage));
  const threshold = thresholdText(stats);
  return (
    <section
      class={stats.close ? 'after-action-card close' : 'after-action-card'}
      aria-label={cardTitle(stats.phase)}
    >
      <p class="after-action-headline">
        <strong>{headline(stats)}</strong>
      </p>
      <p>{outcomeLine(stats)}</p>

      <h5>Damage by player</h5>
      <ul class="stack-list">
        {stats.players.map((p, index) => (
          <li key={index} class={p.you ? 'bar-row you' : 'bar-row'}>
            <span class="bar-name">{whoText(p.displayName, p.you)}</span>
            <progress
              class={p.you ? 'bar you' : 'bar'}
              max={playerMax}
              value={p.damage}
              aria-label={`${whoText(p.displayName, p.you)}: ${playerLine(p, totalDamage)}`}
            />
            <span class="bar-value muted">{playerLine(p, totalDamage)}</span>
          </li>
        ))}
      </ul>

      <h5>Top creatures</h5>
      <ul class="stack-list">
        {stats.creatures.map((c) => (
          <li key={c.rank} class={c.you ? 'bar-row you' : 'bar-row'}>
            <span class="bar-name">
              <Sprite sprite={creatureSpriteOrFallback(c.species)} scale={2} class="bar-sprite" />
              <span>{creatureLine(c)}</span>
            </span>
            <progress
              class={c.you ? 'bar you' : 'bar'}
              max={creatureMax}
              value={c.damage}
              aria-label={`${c.name}: ${String(c.damage)} damage`}
            />
          </li>
        ))}
      </ul>

      <h5>Reactions</h5>
      {stats.reactions.length === 0 ? (
        <p class="muted">No reactions triggered.</p>
      ) : (
        <>
          <p class="muted">{String(stats.reactionsTotal)} in total</p>
          <Lines lines={stats.reactions.map(reactionLine)} />
        </>
      )}

      {(stats.phase === 'finale' || stats.abilities.used.length > 0) && (
        <>
          <h5>Abilities</h5>
          <p class="muted">{abilitySummary(stats.abilities)}</p>
          <Lines lines={stats.abilities.used.map(abilityLine)} />
        </>
      )}

      <h5>Knockouts</h5>
      {stats.knockouts.length === 0 ? (
        <p class="muted">No creature was knocked out.</p>
      ) : (
        <Lines lines={stats.knockouts.map(knockoutLine)} />
      )}

      <h5>HP left</h5>
      <p>{hpLeftText(stats.boss)}</p>
      <progress
        class="hp-bar"
        max={stats.boss.hpMax}
        value={stats.boss.hpEnd}
        aria-label={hpLeftText(stats.boss)}
      />
      {threshold !== null && <p class="muted">{threshold}</p>}
      {stats.adaptation !== null &&
        adaptationLines(stats.adaptation).map((line, index) => <p key={index}>{line}</p>)}
    </section>
  );
}

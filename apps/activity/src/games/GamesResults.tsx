import type { Creature } from '../api';
import { creatureName } from '../game';
import { ExperienceGainRow } from '../ExperienceGainRow';
import { GlossaryTag } from '../Glossary';
import { creatureXp, gamesXpChange } from '../games-view';
import type { GamesResult, LineupEvent } from '../games-types';
import { Sprite } from '../sprites/Sprite';
import { creatureSpriteOrFallback } from '../sprites/creature-sprites';
import { Tag } from '../ui/Tag';
import { XpList } from '../ui/XpGain';
import { MEDAL_NAME, MedalSprite, PinSprite } from './GamesParts';

/** "1st", "2nd", "3rd", "4th", ... */
export function placeText(place: number): string {
  const tens = place % 100;
  if (tens >= 11 && tens <= 13) return `${String(place)}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][place % 10] ?? 'th';
  return `${String(place)}${place % 10 > 3 ? 'th' : suffix}`;
}

/** The ▶ of a replay: a small square button. */
export function ReplayButton({ label, onPlay }: { label: string; onPlay: () => void }) {
  return (
    <button type="button" class="gr-play" aria-label={label} onClick={onPlay}>
      <span aria-hidden="true">▶</span>
    </button>
  );
}

/**
 * One event of your last show: the medal (or your place), the event, a "2x" for the bonus event (its
 * medal points went in the pocket doubled), who went, a pin, ▶.
 */
function ResultRow({
  result,
  event,
  creatures,
  onReplay,
}: {
  result: GamesResult;
  event: Pick<LineupEvent, 'id' | 'name'> | undefined;
  creatures: ReadonlyMap<string, Creature>;
  onReplay?: (() => void) | undefined;
}) {
  const name = event?.name ?? result.eventId;
  return (
    <li class={result.medal === null ? 'gr-row' : `gr-row is-${result.medal}`}>
      <span class="gr-medal">
        {result.medal === null ? (
          <span class="gr-place pix" aria-label={`${placeText(result.place)} place`}>
            {placeText(result.place)}
          </span>
        ) : (
          <GlossaryTag
            entry="games-medals"
            look="chip"
            class="gr-medal-tag"
            label={MEDAL_NAME[result.medal]}
          >
            <MedalSprite medal={result.medal} scale={3} />
          </GlossaryTag>
        )}
      </span>
      <span class="gr-event">{name}</span>
      {result.bonus === true && (
        <Tag entry="games-bonus" class="gr-bonus" label="Bonus event: double medal points">
          2x
        </Tag>
      )}
      <span class="gr-who">
        {result.creatureIds.map((id) => {
          const c = creatures.get(id);
          return c === undefined ? null : (
            <Sprite
              key={id}
              sprite={creatureSpriteOrFallback(c.species)}
              scale={2}
              class="gr-creature"
            />
          );
        })}
      </span>
      {result.pin && (
        <GlossaryTag entry="games-pins" look="chip" class="gr-pin" label="Personal best: a pin">
          <PinSprite scale={2} />
        </GlossaryTag>
      )}
      {onReplay !== undefined && <ReplayButton label={`Replay ${name}`} onPlay={onReplay} />}
    </li>
  );
}

/**
 * Your last show: one row per event you were in (the medal or your place, who went, a pin for a
 * personal best, ▶ that event's replay), the experience each creature earned as the shared XP rows,
 * then ▶ the whole show.
 */
export function GamesResults({
  results,
  lineup,
  creatures,
  onReplay,
}: {
  results: readonly GamesResult[];
  lineup: readonly Pick<LineupEvent, 'id' | 'name'>[];
  creatures: readonly Creature[];
  /** Plays the show from an event (or from the start, with null); absent: no replay (no show stored). */
  onReplay?: ((eventId: string | null) => void) | undefined;
}) {
  const byId = new Map(creatures.map((c) => [c.id, c]));
  const events = new Map(lineup.map((e) => [e.id, e]));
  const gains = results.flatMap((r) =>
    r.creatureIds.flatMap((id) => {
      const c = byId.get(id);
      const xp = creatureXp(r, id);
      return c === undefined || xp <= 0 ? [] : [{ key: `${r.eventId}:${id}`, c, xp }];
    }),
  );
  return (
    <section class="gr-results pix-panel" aria-labelledby="gr-title">
      <div class="gr-head">
        <h3 id="gr-title" class="gr-title">
          Last show
        </h3>
        {onReplay !== undefined && (
          <button
            type="button"
            class="ghost gr-whole"
            onClick={() => {
              onReplay(null);
            }}
          >
            <span aria-hidden="true">▶</span> Watch
          </button>
        )}
      </div>
      <ul class="gr-rows">
        {results.map((r) => (
          <ResultRow
            key={r.eventId}
            result={r}
            event={events.get(r.eventId)}
            creatures={byId}
            onReplay={
              onReplay === undefined
                ? undefined
                : () => {
                    onReplay(r.eventId);
                  }
            }
          />
        ))}
      </ul>
      {gains.length > 0 && (
        <XpList caption label="Experience from the show">
          {gains.map(({ key, c, xp }) => (
            <ExperienceGainRow
              key={key}
              gain={gamesXpChange(c, xp)}
              who={{ name: creatureName(c), species: c.species }}
            />
          ))}
        </XpList>
      )}
    </section>
  );
}

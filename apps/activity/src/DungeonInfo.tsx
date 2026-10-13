import { GLOSSARY_IDS } from '@creatures/game';
import { formatLongCountdown, formatEventTime } from './raid-time';
import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { useNow } from './hooks';
import { landmarkLine, streakLine, streakPips } from './dungeon-text';
import type { DungeonToday } from './dungeon-types';
import { Sprite } from './sprites/Sprite';

/**
 * Today's dungeon at a glance: the depth with its landmark marker, the streak pips, when the day
 * resets and the three room modifiers (each a tappable glossary tag). Everything is read from the
 * server's state; nothing here decides anything.
 */
export function DungeonInfo({ today, offset }: { today: DungeonToday; offset: number }) {
  const now = useNow(true);
  const remaining = today.resetsAt - (now + offset);
  const pips = streakPips(today.streak);
  const lit = pips.filter((p) => p.on).length;
  return (
    <section class="raid-section dungeon-info" aria-labelledby="dungeon-heading">
      <h3 id="dungeon-heading">
        <GlossaryTag entry="dungeon">Daily dungeon</GlossaryTag>
      </h3>
      <p class="dungeon-depth">
        <GlossaryTag entry="depth" look="chip" class="chip dungeon-depth-chip">
          <span class="chip-text">Depth {today.depth}</span>
        </GlossaryTag>
        {today.landmark && (
          <GlossaryTag entry="landmark" look="chip" class="chip dungeon-landmark-chip">
            <Sprite sprite={glyphOrUnknown('flag')} scale={2} />
            <span class="chip-text">Landmark</span>
          </GlossaryTag>
        )}
      </p>
      <p class="muted dungeon-landmark-line">
        <Sprite sprite={glyphOrUnknown('flag')} scale={2} /> {landmarkLine(today.depth)}
      </p>
      <div class="dungeon-streak">
        <GlossaryTag entry="streak">Streak</GlossaryTag>
        <span
          class="pips"
          role="img"
          aria-label={`Streak: ${String(lit)} of ${String(pips.length)} days of the cycle`}
        >
          {pips.map((p) => (
            <i key={p.day} class={`${p.on ? 'on' : ''}${p.bonus ? ' fest' : ''}`.trim()} />
          ))}
        </span>
        <span class="muted">{streakLine(today.streak)}</span>
      </div>
      <p class="muted">
        Resets at {formatEventTime(today.resetsAt, today.timezone)} ({today.timezone}), in{' '}
        {formatLongCountdown(remaining)}.
      </p>
      <h4>
        <GlossaryTag entry="room-modifiers">Today's room modifiers</GlossaryTag>
      </h4>
      <ol class="dungeon-modifiers" aria-label="Room modifiers, room by room">
        {today.modifiers.map((m) => (
          <li key={m.room}>
            <span class="muted">
              {m.room === today.modifiers.length - 1 ? 'Room boss' : `Room ${String(m.room + 1)}`}
            </span>
            <GlossaryTag entry={GLOSSARY_IDS.modifier(m.id)} look="chip" class="chip modifier-chip">
              <span class="chip-text">{m.name}</span>
            </GlossaryTag>
            <span class="modifier-text">{m.description}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

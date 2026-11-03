import { bossArt } from '../art';
import { glyphOrUnknown } from '../glyphs';
import { Sprite } from '../sprites/Sprite';

interface TrackStripProps {
  /** The lap's five bosses in track order (id and name). */
  order: readonly { id: string; name: string }[];
  /** Where the week's boss stands among them (from 0): lit; those before it are ticked. */
  index: number;
  /** The server's Boss Rank this week. */
  rank: number;
}

/**
 * The track strip of the week's raid screen (docs/design/combat/proposals/001-combat-v2.md, R24 and "On the board"): the lap's five
 * boss portraits, the current one lit and the beaten ones ticked, with "Boss Rank N". Never on a fight screen. No boss is marked
 * harder than another, and nothing here says so: the order is the only thing it shows. A boss's name is its spoken label.
 */
export function TrackStrip({ order, index, rank }: TrackStripProps) {
  return (
    <div class="track-strip">
      <p class="track-rank">{`Boss Rank ${String(rank)}`}</p>
      <ol class="track-bosses" aria-label="The bosses of this lap">
        {order.map((boss, at) => {
          const art = bossArt(boss.id);
          const state = at === index ? 'now' : at < index ? 'beaten' : 'ahead';
          return (
            <li
              key={boss.id}
              class={`track-boss ${state}`}
              aria-current={state === 'now' ? 'step' : undefined}
            >
              <span class="track-portrait" aria-hidden="true">
                <Sprite sprite={art.sprite} scale={1} />
                {state === 'beaten' && (
                  <span class="track-tick">
                    <Sprite sprite={glyphOrUnknown('tick')} scale={1} />
                  </span>
                )}
              </span>
              <span class="visually-hidden">
                {`${boss.name}${state === 'now' ? ', this week' : state === 'beaten' ? ', beaten' : ''}`}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
